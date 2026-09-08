---
id: PTQ-0052
title: SchemaSinkFrame's stop variant carries a label field that 19 construction sites populate but no code ever reads
lens: D2                     # the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/parser/query-schema-inference.ts:88-100
  - src/parser/query-schema-inference.ts:216-219
  - src/parser/query-schema-resolve.ts:230-532
sites: 21                    # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# SchemaSinkFrame's stop variant carries a label field that 19 construction sites populate but no code ever reads

## Observation
The `stop` variant of `SchemaSinkFrame` declares `readonly label: string`,
documented as naming the opaque construct "for diagnostics". The only consumer
of frames, `resolveQuerySchemaSink`, returns `undefined` at a `stop` frame
without touching `label`, and no diagnostic anywhere renders it. Nineteen
construction sites in query-schema-resolve.ts (plus three in tests) compute and
attach distinct label strings ("while-condition", "member", the binary
operator text, etc.) that nothing ever observes.

## Evidence
src/parser/query-schema-inference.ts:88-100 — the declaration and the doc claim:

```ts
 *   - `stop`         — an opaque construct (binary / unary operator, member or
 *     indexed access, `match` scrutinee, `if` / `while` condition). Stopped; the
 *     `label` names the construct for diagnostics.
 */
export type SchemaSinkFrame =
  | { readonly kind: "paren" }
...
  | { readonly kind: "stop"; readonly label: string };
```

src/parser/query-schema-inference.ts:216-219 — the sole frame consumer ignores
it:

```ts
      case "stop":
        // Opaque: the walk halts with no sink (untyped, `string`).
        return undefined;
    }
```

src/parser/query-schema-resolve.ts — every construction site (grep
`kind: "stop"` over src/: 19 hits, all in this file): lines 230, 236, 331, 346,
356, 388, 416, 434, 435, 441, 447, 448, 456, 460, 493, 500, 507, 528, 532.
Representative excerpt (:434-435), where the label is even computed per
operator:

```ts
          left: this.rewriteExpr(expr.left, [{ kind: "stop", label: expr.op }]),
          right: this.rewriteExpr(expr.right, [{ kind: "stop", label: expr.op }]),
```

Reader census: grep `.label` across src/ — the only `.label` reads are on
unrelated types (`signal.label` in session-shutdown.ts, `ToolDefinition.label`
in tool-registration.ts). query-schema-resolve.ts's own frame read is
`(sink.frame as OriginFrame | undefined)?.origin` (:612) — a different
property — and a `stop` frame can never be `sink.frame` (the stop arm returns
no sink). Tests construct stop frames
(tests/query-schema-inference.test.ts:97,106,146) and never read `label` back.

## Why this is a problem
Vestigial field — the value is never read — carried at 19 production
construction sites, each paying to name a construct for diagnostics that do not
exist: the doc's stated purpose ("names the construct for diagnostics") has no
corresponding reader anywhere in the emission paths. Git shows the field is
unrevised from the V13b tests-task commit (`git log -S 'readonly label: string'`
→ single commit `6d6f8a41`, "V13b-T — Query schema-inference tests"); the
paired implementation and the later frame-origin work added a parallel `origin`
property for the attribution job instead of ever reading `label`.

## Suggested direction (non-binding, optional)
Either drop `label` from the `stop` variant (collapsing 19 construction sites
to `{ kind: "stop" }`) or wire it into the diagnostic the doc promises; which
of the two is a fix-stage decision.

## False-positive check
- Reader search: grep `\.label` over src/, extensions/, tools/, tests/ — every
  hit inspected; reads exist only on `IsolationSignal.label`
  (session-shutdown.ts:627) and `ToolDefinition.label` (tool-registration.ts),
  never on a `SchemaSinkFrame`.
- Constructor census: grep `kind: "stop"` over src/ — 19 hits, all in
  query-schema-resolve.ts (lines listed above); over tests/ — 3 hits
  (tests/query-schema-inference.test.ts:97,106,146), all constructions.
- Destructuring/serialization: grep `label` in query-schema-inference.ts and
  query-schema-resolve.ts — no destructuring of frames; no
  `JSON.stringify(frames...)` or logging of frame arrays anywhere in
  src/parser/ (grep `stringify(.*frame` — 0 hits).
- Test-only-caller check: tests construct the field (the type requires it) but
  never observe it, so the FIELD is unreached even by witness tests; the `stop`
  variant itself is alive (the walk's halt behaviour) and not claimed dead.
- Git-history intent: `git log -S 'readonly label: string' --
  src/parser/query-schema-inference.ts` → single commit `6d6f8a41` (V13b-T);
  the frame-attribution consumer added later reads `origin` off `OriginFrame`
  (query-schema-resolve.ts:121, :612), not `label`.
- Spec-mandate check: query-forms.md's inference algorithm (per the module
  header) classifies constructs as crossed/stopped; no registered diagnostic
  in the module renders a construct name, and no spec text requires the label.

## Triage
verdict: confirmed — reproduced every claim: `label` is write-only (19 src sites at exactly the cited lines, 3 test sites, zero reads anywhere — no `.label`, no `["label"]`, no destructuring, no frame spread/serialization), the sole frame consumer's `stop` arm returns `undefined` at :216-219 and the only frame property read is `?.origin` at resolve:612, so the doc's promised diagnostic reader does not exist (module's lone diagnostic emits a fixed message) and query-forms.md:42 mandates no label; not the paren-variant filing's root cause (triage: claude-opus-5)
