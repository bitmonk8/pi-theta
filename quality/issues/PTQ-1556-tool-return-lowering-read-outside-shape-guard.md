---
id: PTQ-1556
title: routeToolReturnShape guards its inspection walk of a Pi-owned execute() envelope but runs the lowering's .filter/.map/.text reads of the same value unguarded, so a shape violation found there escapes as a raw throw without the tool-return-shape diagnostic
lens: D6
status: open
verdict: confirmed
locations:
  - src/runtime/tool-call-off-surface.ts:216-223
  - src/runtime/tool-call-execute.ts:154-166
  - src/runtime/tool-call-off-surface.ts:261-290
  - src/extension/dispatch-defect-surface.ts:98-101
sites: 4
fix_scope: module
d6_class: posture-divergence
d6_anchor: "pi-integration-contract/host-interfaces-core.md#tool-execution-from-theta-code — \"any throw raised during that inspection (the resolved value is not an object, `content` is not iterable, an entry is missing `type` / `text`, or any other shape violation that causes a property access or `.filter` / `.map` call to throw) is caught by the runtime and routed to `theta/runtime/internal-error` with `details.kind = \"tool-return-shape\"`\""
wave: qw20260928060032
reported_by: lens-d6-errorposture (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# routeToolReturnShape guards its inspection walk of a Pi-owned execute() envelope but runs the lowering's .filter/.map/.text reads of the same value unguarded, so a shape violation found there escapes as a raw throw without the tool-return-shape diagnostic

## Observation
`routeToolReturnShape` makes two passes over the resolved code-side `execute()` value. The first is `inspectReturnShape`, which sits inside a `// allow-broad-catch: pi-sdk-boundary` try/catch and turns any throw into the `"other"` token, so the caller gets a `theta/runtime/internal-error` diagnostic with `details.kind = "tool-return-shape"`. When inspection passes, the second pass `lowerResolvedToolEnvelope` → `filterJoinToolText` reads the same Pi-owned value again (`content.filter(...)`, `block.type`, `.map(block => block.text)`) with no guard. Inspection only requires `content` to be iterable and only tests `"text" in entry`. The lowering requires `content` to have array methods and reads `.text`. So some shape violations pass inspection and then throw in the lowering. In this session, a `Set` for `content` threw `TypeError: content.filter is not a function` out of `routeToolReturnShape`. A throwing `text` getter threw `Error: boom` out of it. A throwing `content` getter, which inspection hits, returned the `return-shape-defect` diagnostic with `shape_check: "other"`.

## Evidence
Divergent side, part 1 (the lowering call on the "conforming" arm, outside any guard): src/runtime/tool-call-off-surface.ts:216-223
```ts
  const check = inspectReturnShape(resolved);
  if (check === null) {
    // A well-formed `{ content }` envelope lowers to `Ok(<filtered/joined text>)`
    // (possibly `Ok("")`). The non-text discard emits nothing on `sink`.
    return {
      kind: "conforming",
      result: lowerResolvedToolEnvelope(resolved as AgentToolResultEnvelope, sink),
    };
  }
```

Divergent side, part 2 (the unguarded `.filter` / `.map` / `.text` reads): src/runtime/tool-call-execute.ts:154-166
```ts
export function filterJoinToolText(
  content: readonly ToolContentBlock[],
): string {
  ...
  return content
    .filter((block): block is ToolTextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}
```

Sibling (the guarded inspection of the same value, same failure class): src/runtime/tool-call-off-surface.ts:261-290 (excerpt)
```ts
function inspectReturnShape(resolved: unknown): ToolReturnShapeCheck | null {
  try {
    ...
    for (const entry of content as Iterable<unknown>) {
      if (typeof entry !== "object" || entry === null || !("type" in entry)) {
        return "entry-missing-type";
      }
      if ((entry as { readonly type?: unknown }).type === "text" && !("text" in entry)) {
        return "entry-missing-text";
      }
    }
    return null;
  } catch (shapeThrow: unknown) { // allow-broad-catch: pi-sdk-boundary — Specific exception types only
    // The inspected `resolved` value is owned by the Pi tool's `execute()`; a
    // hostile getter, `Proxy`, or `null`-prototype object may throw on a
    // property access or during iteration. Any such throw is the `"other"`
    // shape violation outside the four named checks.
```

Where the escaped throw ends up: src/runtime/tool-call-execute.ts:520-525 calls `routeToolReturnShape` after the `execute()`-throw try/catch (tool-call-execute.ts:476-499), so the raw throw leaves `runCodeSideToolCall`. The effectful caller (src/runtime/effectful-statement-host.ts:395-401) has no catch around the call, so the throw reaches the dispatch-defect surface, which handles only the typed carrier specially: src/extension/dispatch-defect-surface.ts:98-101
```ts
  const diagnostic =
    thrown instanceof ToolReturnShapeDefectError
      ? thrown.diagnostic
      : surfaceUnexpectedThrow(thrown, site);
```
The escaped TypeError takes the generic `surfaceUnexpectedThrow` arm. It gets an `internal error: content.filter is not a function` diagnostic at the dispatch site, with none of `details.kind = "tool-return-shape"`, `details.tool_name` or `details.shape_check`. It is not attributed to the tool-call site.

Why these are the same failure class, mechanically: both passes read the same `resolved` object, returned by the same `execute()` call, inside the same `routeToolReturnShape` invocation. Both fail the same way: a property access, iteration or array-method call on the Pi-owned envelope throws. The anchor explicitly names `.filter` / `.map` among the throws that must be caught.

Anchor (docs/spec_topics/pi-integration-contract/host-interfaces-core.md:109, verbatim): "The lowering procedure inspects the resolved envelope and any throw raised during that inspection (the resolved value is not an object, `content` is not iterable, an entry is missing `type` / `text`, or any other shape violation that causes a property access or `.filter` / `.map` call to throw) is caught by the runtime and routed to `theta/runtime/internal-error` with `details.kind = \"tool-return-shape\"` …; the call site observes the `internal-error` routing …, **not** an `Err(QueryError { kind: \"code_tool\", ... })`." Registry side (docs/spec_topics/diagnostics/code-registry-runtime.md:24, verbatim fragment): "`other` (any shape violation outside the four named checks — e.g. a throwing property getter)".

Searches and probes (run this session):
- `grep -rn "routeToolReturnShape(" src --include=*.ts` → 2 hits: the definition (tool-call-off-surface.ts:210) and the one live caller (tool-call-execute.ts:520).
- `grep -rn "filterJoinToolText(" src --include=*.ts` → 4 hits: the definition, `lowerResolvedToolEnvelope` (tool-call-execute.ts:187), and two in tool-call-host-denial.ts (136, 147).
- `grep -rn "ToolReturnShapeDefectError" src --include=*.ts` (code lines) → the only special handling is dispatch-defect-surface.ts:99. No other catch recognises a raw lowering throw as tool-return-shape.
- A scratch probe under $TEMP (`npx tsx` importing `routeToolReturnShape`) printed: for `{ content: new Set([{type:"text",text:"x"}]) }` → `THREW TypeError: content.filter is not a function`; for `{ content: [{ type: "text", get text() { throw … } }] }` → `THREW Error: boom`; for `{ get content() { throw … } }` → `{"kind":"return-shape-defect", … "details":{"kind":"tool-return-shape","tool_name":"t","shape_check":"other"}}`.

## Why this is a problem
The spec keeps a non-conforming Pi tool return off the generic unexpected-throw path and pins a precise-site `theta/runtime/internal-error` with a closed `details.shape_check` vocabulary. The code applies that only to throws raised during its own inspection walk. Throws from the lowering's second read of the same value (the `.filter` / `.map` calls the anchor names, and the `.text` read inspection never makes) take a different route: a raw throw framed by `surfaceUnexpectedThrow`, without the pinned `details` fields. The file header claims the opposite for this seam: "surfacing a non-conforming shape on the `return-shape-defect` outcome arm … rather than binding garbage or throwing a raw `TypeError`" (tool-call-execute.ts:41-46). The probe shows that claim fails for a non-array iterable `content`.

## Suggested direction (non-binding, optional)
Bring the lowering read inside the same guarded boundary as the inspection, or have inspection check exactly what the lowering reads, so every throw from reading the Pi-owned envelope produces the `return-shape-defect` outcome.

## False-positive check
- EXST-9 / PIC-73 class: neither applies. This is the code-side tool-call lowering, not an execution-status sink or hook and not an optional presence-probed capability.
- allow-broad-catch token at the cited catch: `pi-sdk-boundary — Specific exception types only` (tool-call-off-surface.ts:282). The token names the Pi-SDK value boundary. The lowering reads the same Pi-SDK value, so the boundary the token names covers both passes. There is no catch on the divergent side to carry a token.
- Stated-rationale check: no comment at either site says the lowering is deliberately outside the guard. The `lowerResolvedToolEnvelope` / `filterJoinToolText` comments discuss only non-text discard and empty results. The header's rationale (tool-call-execute.ts:36-46) claims raw `TypeError`s cannot reach the caller, and the probe refutes that. No docs/bugs ruling found for this seam: `grep -rln "shape_check" tests` → 3 files, none with a non-array-iterable or `text`-getter case (`grep -n "other\|getter\|Proxy"` over the two off-surface test files → 1 unrelated hit at tests/tool-calls-off-surface-routing.test.ts:319).
- Sibling-reality check: both passes run on the live path (`runCodeSideToolCall` → `routeToolReturnShape`, reached from effectful-statement-host.ts:395). The divergence was shown by running the probe, not argued from types.

## Triage
verdict: confirmed — I checked every excerpt against the code: inspectReturnShape's allow-broad-catch pi-sdk-boundary try/catch at tool-call-off-surface.ts:261-290; the unguarded lowerResolvedToolEnvelope call at :216-223; filterJoinToolText's .filter/.map/.text at tool-call-execute.ts:154-166; and the instanceof-only branch at dispatch-defect-surface.ts:98-101. Every stated search gave the same hits (2/4/1 special-case/3 test files/1 unrelated hit). My own $TEMP probe matched the filing: a Set content throws TypeError: content.filter is not a function, a throwing text getter throws Error: boom, and a throwing content getter returns return-shape-defect with shape_check "other". The anchor at host-interfaces-core.md:109 pins the guarded posture, since it names .filter/.map throws as tool-return-shape internal-error. No existing intake item or PTQ tracks this (triage: claude-opus-5-5)
