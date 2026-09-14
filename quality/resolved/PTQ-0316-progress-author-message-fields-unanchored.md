---
id: PTQ-0316
title: clampFoldedAuthorMessage and clampProgressPayload rebuild ProgressAuthorMessage's fields with no completeness anchor
lens: D4                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/execution-status/bus.ts:99-107
  - src/extension/execution-status/progress-tool.ts:115-127
  - src/extension/execution-status/child-tap.ts:64-70
  - src/extension/execution-status/child-tap.ts:172-187
sites: 4                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: parallel           # D4 only: clone | drift | parallel
wave: qw20260914060226
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-14
---

# clampFoldedAuthorMessage and clampProgressPayload rebuild ProgressAuthorMessage's fields with no completeness anchor

## Observation
`ProgressAuthorMessage` (`src/extension/execution-status/types.ts:88-94`) is a 5-field, all-but-one-optional record ("the bus's `authorMessage` currency, the milestone entry payload, and the tap-publish currency all share this shape", types.ts:84-86). Three separate functions in `src/extension/execution-status/` each hand-assemble a fresh value of this type by naming its fields one at a time, from three different source shapes: `progress-tool.ts`'s `clampProgressPayload` (from the tool call's `ThetaProgressParams` plus a separately-computed `dropped` count), `bus.ts`'s `clampFoldedAuthorMessage` (from an already-typed `ProgressAuthorMessage` it re-clamps at fold time — its own doc comment calls this "L3 defence in depth"), and `child-tap.ts`'s inline builder inside the `theta_progress` wire-line decoder (from untrusted JSON cast to `Partial<Record<keyof ProgressAuthorMessage, unknown>>`). The clone map's G024 mechanically pairs the first two (`bus.ts:99-107` / `progress-tool.ts:118-127`, "renamed-only (8)"); the third is not clone-shaped to either (its guards are `typeof x === "..." && Number.isInteger(x)` throughout, because its input is untrusted `unknown`) but assembles the identical 5-field set. PTQ-0292 (fixed, ratified 2026-09-13) already found and fixed this exact shape of gap at the child-tap.ts site — adding the `HANDLED_PROGRESS_FIELDS` ledger at lines 64-70 — leaving the other two hand-assembling sites (the G024 pair) without an equivalent.

## Evidence

**Site 1 — `src/extension/execution-status/bus.ts:99-107`** (`clampFoldedAuthorMessage`; G024 partner):
```ts
function clampFoldedAuthorMessage(p: ProgressAuthorMessage): ProgressAuthorMessage {
  return {
    message: clampProgressField(p.message, PROGRESS_MESSAGE_CLAMP_CHARS),
    ...(typeof p.scope === "string"
      ? { scope: clampProgressField(p.scope, PROGRESS_SCOPE_CLAMP_CHARS) }
      : {}),
    ...(Number.isInteger(p.done) ? { done: p.done } : {}),
    ...(Number.isInteger(p.total) ? { total: p.total } : {}),
    ...(Number.isInteger(p.dropped) && (p.dropped ?? 0) > 0 ? { dropped: p.dropped } : {}),
```

**Site 2 — `src/extension/execution-status/progress-tool.ts:115-127`** (`clampProgressPayload`; G024 partner, clone map cites its body at 118-127):
```ts
export function clampProgressPayload(
  params: ThetaProgressParams,
  dropped: number,
): ProgressAuthorMessage {
  return {
    message: clampProgressField(params.message, PROGRESS_MESSAGE_CLAMP_CHARS),
    ...(typeof params.scope === "string"
      ? { scope: clampProgressField(params.scope, PROGRESS_SCOPE_CLAMP_CHARS) }
      : {}),
    // `done`/`total` are schema-enforced integers; they render verbatim.
    ...(Number.isInteger(params.done) ? { done: params.done } : {}),
    ...(Number.isInteger(params.total) ? { total: params.total } : {}),
    ...(dropped > 0 ? { dropped } : {}),
```
Diff verdict (G024): renamed-only across the first 8 lines (`p`↔`params`, `p.scope`↔`params.scope`, `p.done`↔`params.done`, `p.total`↔`params.total`). The final `dropped` line diverges beyond a rename — `...(dropped > 0 ? { dropped } : {})` (Site 2, a plain caller-supplied number) vs. `...(Number.isInteger(p.dropped) && (p.dropped ?? 0) > 0 ? { dropped: p.dropped } : {})` (Site 1, a field read off a value of external/already-once-clamped provenance, hence the added `Number.isInteger` guard) — an intentional hardening difference, not accidental drift, consistent with bus.ts's own "L3 defence in depth" rationale (lines 94-98, quoted below).

**Site 3 — `src/extension/execution-status/child-tap.ts:64-70`** (the PTQ-0292-ratified completeness ledger; not itself a reconstruction, the guard that protects one):
```ts
const HANDLED_PROGRESS_FIELDS = {
  message: true,
  scope: true,
  done: true,
  total: true,
  dropped: true,
} satisfies Record<keyof ProgressAuthorMessage, true>;
```
Its own doc comment (lines 55-62): "`satisfies` fails `tsc` in THIS file the moment a field is added to `ProgressAuthorMessage` and not added here — the read side's counterpart to the write side's own compiler-checked anchor."

**Site 4 — `src/extension/execution-status/child-tap.ts:172-187`** (the reconstruction the Site 3 ledger anchors):
```ts
const payload: ProgressAuthorMessage = {
  // Defensive re-clamp + strip: the emitter clamped, but the wire is not
  // trusted to have done so (EXST-5's re-clamp obligation).
  message: clampProgressField(fields.message, PROGRESS_MESSAGE_CLAMP_CHARS),
  ...(typeof fields.scope === "string"
    ? { scope: clampProgressField(fields.scope, PROGRESS_SCOPE_CLAMP_CHARS) }
    : {}),
  // Non-conforming optional fields are discarded FIELD-WISE (PIC-74).
  ...(typeof fields.done === "number" && Number.isInteger(fields.done)
    ? { done: fields.done }
    : {}),
  ...(typeof fields.total === "number" && Number.isInteger(fields.total)
    ? { total: fields.total }
    : {}),
  ...(carried > 0 ? { dropped: carried } : {}),
};
```
Diff verdict (Site 4 vs. Sites 1/2): not clone-shaped to either (every field guard is `typeof x === "..."`-qualified because `fields` is `Partial<Record<keyof ProgressAuthorMessage, unknown>>`, i.e. untrusted `unknown`, not a typed `ProgressAuthorMessage`/`ThetaProgressParams`) — found by reading, not by the clone scanner — but it enumerates the identical 5-field set in the identical order, and it alone is protected by Site 3's ledger.

Confirmed by search: `grep -rn "satisfies Record" src` returns exactly one hit under `keyof ProgressAuthorMessage` — `child-tap.ts:70`. Neither `bus.ts` nor `progress-tool.ts` contains any `satisfies` anchor.

## Why this is a problem
PTQ-0292 (fixed) named the mechanism for this exact type: "a future field addition to `ProgressAuthorMessage` … would compile cleanly on both sides while the decoder silently never reads the new field off the wire," and its ratified fix was precisely "add a compile-time handled-fields ledger … `satisfies Record<keyof ProgressAuthorMessage, true>` … so a field added to `ProgressAuthorMessage` fails `tsc` … until the decoder handles it." That fix landed at Site 3/4 only. Every field in `ProgressAuthorMessage` but `message` is optional (types.ts:89-93), so a hand-assembled object literal that omits one compiles without error at a return type of `ProgressAuthorMessage` — nothing about the type system stops Site 1 or Site 2 from silently dropping a newly-added field. Counted: of the 3 sites in `src/extension/execution-status/` that hand-assemble a fresh `ProgressAuthorMessage` by naming its fields, 1 of 3 (Site 3/4, child-tap.ts) carries the PTQ-0292 ledger; 2 of 3 (Site 1, bus.ts; Site 2, progress-tool.ts — the G024 pair) do not. Site 1 is the last of the three defence-in-depth layers bus.ts's own comment (lines 94-98) describes ("the emitter clamps and the tap re-clamps, and the bus clamps ONCE MORE at fold because a stored payload is instance state — the EXST-7 memory bound must not depend on an upstream having done its job"): if that rationale holds, the bus fold is exactly the layer that must not silently lose a field either, yet it is the one with no compiler check forcing it to keep up with `types.ts`. Divergence is not hypothetical bit-rot — it is "add a field to `types.ts`, forget one of the other two call sites, `tsc` says nothing, the field vanishes at that layer" — the identical failure mode PTQ-0292 already fixed once, one site short of covering all three.

## Suggested direction (non-binding, optional)
The pattern PTQ-0292 ratified for child-tap.ts already exists in this codebase for other closed field sets (`inventory-closure-audit.ts:166`, `session-shutdown.ts:74`, `runtime/ceiling-arbitration.ts:106` each use a `satisfies Record<K, …>` ledger); applying the same shape at Site 1 and Site 2 — a small `satisfies Record<keyof ProgressAuthorMessage, true>` object next to each function — would give both the same compile-time forcing function Site 3 already has. Named as a hypothesis only; a human picks the mechanism.

## False-positive check
Re-read all four cited ranges (bus.ts:99-107, progress-tool.ts:115-127, child-tap.ts:64-70, child-tap.ts:172-187) immediately before filing; content matches verbatim. Re-verified clone-map group G024 at its cited spans (bus.ts:99-107, progress-tool.ts:118-127) — confirmed live, both copies reachable (bus.ts's is called from `authorMessage()` and `childEvent()`'s `theta_progress` arm; progress-tool.ts's is called from `executeThetaProgress`), not a dead copy. Searched `src` for `satisfies Record` (4 hits total: child-tap.ts, inventory-closure-audit.ts, session-shutdown.ts, ceiling-arbitration.ts) and for `ProgressAuthorMessage` (all hits enumerated: types.ts's declaration, bus.ts, progress-tool.ts, child-tap.ts, widget-sink.ts, footer-sink.ts) — confirmed `widget-sink.ts`'s `renderAuthorMessageLine` and `footer-sink.ts`'s `renderAuthorMessageSegment`/`newestAuthorMessage` only READ fields off an existing payload to build a string (not reconstruction sites; excluded from the counted 3). Read PTQ-0292's full ratified fix text (quality/resolved/) to confirm this filing does not restate it: PTQ-0292 covered the `emitWireLine` (progress-tool.ts) / decoder (child-tap.ts) wire pair and was fixed by adding the ledger this filing cites as Site 3 — that fix did not touch bus.ts's `clampFoldedAuthorMessage` or progress-tool.ts's own `clampProgressPayload`, which remain unanchored; this filing is the two-site remainder PTQ-0292 did not reach, not a re-file of it. Checked `tests/` for direct references to either unanchored function name (`clampFoldedAuthorMessage`, `clampProgressPayload`): none found, so no test incidentally pins full-field coverage at either site.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — accounting verified: types.ts:88-94 confirms ProgressAuthorMessage's 5 fields, clone-scan.mjs reproduces G024 exactly (bus.ts:99-107 / progress-tool.ts:118-127, renamed-only(8), both live callers confirmed), child-tap.ts:64-70's ledger is the only `satisfies Record` hit keyed to ProgressAuthorMessage (grep confirms 1-of-3 sites anchored, 2-of-3 not), and PTQ-0292's ratified fix text confirms it never touched bus.ts or progress-tool.ts — but per the D4 brief's own parallel-class rule this caps at questionable, since whether to extend the ledger pattern to the remaining two sites is a design decision for a human ruling, not a mechanical dedupe (triage: claude-opus-5)
verdict: confirmed — RATIFIED (human, 2026-09-14): ONE shared helper. In src/extension/execution-status/progress-tool.ts add clampAuthorMessage(fields: { message: string; scope?: unknown; done?: unknown; total?: unknown; dropped?: unknown }): ProgressAuthorMessage that performs today's field-by-field rebuild (message clamp; scope clamp when a string; done/total when Number.isInteger; dropped when Number.isInteger and > 0) and carries a compile-time ledger declared `satisfies Record<keyof ProgressAuthorMessage, true>` exactly like child-tap.ts's HANDLED_PROGRESS_FIELDS; clampProgressPayload(params, dropped) becomes a call to it (spreading params and dropped), and bus.ts's clampFoldedAuthorMessage(p) becomes a call to it (bus.ts already imports clampProgressField from progress-tool.ts, so no new edge). Behaviour identical at both call sites (the tool's dropped is always an integer count, so the unified guard changes nothing). No other edits.
