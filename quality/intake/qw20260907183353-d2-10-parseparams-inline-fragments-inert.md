---
id: pending
title: parseParams allocates and threads an inlineFragments retention map whose every read is subsumed by the same-scoped defs table, so it can never affect behavior at that position
lens: D2
status: intake
verdict: pending
locations:
  - src/parser/params.ts:186-194
  - src/parser/params.ts:209-218
  - src/parser/params.ts:617-622
  - src/parser/params.ts:1499-1525
  - src/parser/params.ts:1542-1544
sites: 5
fix_scope: localized
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# parseParams allocates and threads an inlineFragments retention map whose every read is subsumed by the same-scoped defs table, so it can never affect behavior at that position

## Observation
`parseParams` creates `inlineFragments` alongside `defs` and `inlineCanonical` and threads all three through one `LowerCtx` reused for every field. `inlineFragments` exists for exactly one mechanism — `hoistInlineObjectType`'s cross-scope re-registration of a retained fragment into a `defs` table that does not yet hold it — and both the threading comment in `parseParams` and the field's own doc state that this mechanism cannot fire when the retention and `defs` share one scope, which is `parseParams`'s configuration. The field doc names `parseParams` as the caller whose needs the ABSENT reading serves; the code threads the map anyway.

## Evidence
src/parser/params.ts:186-194 — the threading site's own comment states the mechanism never fires here:
```
  // The `__inline_<slug>` dedup table is BLOCK-shared (it is `defs` itself), so
  // its retained canonical bytes and its collision sink are block-shared too:
  // schema-subset.md §Schema-slug collision posture mandates the byte-equality
  // check on every slug match across the whole lowering pass, not per field.
  // Both retentions share ONE scope with `defs` here, so
  // `hoistInlineObjectType`'s cross-scope re-registration never fires at this
  // position.
  const inlineCanonical = new Map<string, string>();
  const inlineFragments = new Map<string, Record<string, unknown>>();
```
src/parser/params.ts:617-622 — the field doc says the absent case is what this caller needs:
```
   * OPTIONAL independently of `inlineCanonical`: absent, "already minted" is
   * decided by THIS scope's `defs` alone and no re-registration can fire —
   * which is what a caller whose retention and `defs` share one scope needs
   * (`parseParams`), and all a caller threading no sink at all gets.
   */
  readonly inlineFragments?: Map<string, Record<string, unknown>>;
```
src/parser/params.ts:1508, :1519, :1542-1544 — the only reads and the single write site:
```
  if (lowerCtx.defs[defName] !== undefined || retainedFragment !== undefined) {
```
```
    if (retainedFragment !== undefined && lowerCtx.defs[defName] === undefined) {
```
```
  lowerCtx.defs[defName] = fragment;
  lowerCtx.inlineCanonical?.set(slug, canonical);
  lowerCtx.inlineFragments?.set(slug, fragment);
```
Within one `parseParams` call the write at :1544 is adjacent to the `defs` write at :1542 and nothing deletes `defs` entries during the pass (`hoistNestedDefs`, :544-561, builds a new `hoisted` object and `delete`s only on a shallow clone at :560-561), so `inlineFragments.get(slug) !== undefined` implies `defs[defName] !== undefined` throughout. The disjunct at :1508 therefore never decides, the re-registration at :1519 never fires (as :190-192 states), and the collision check between them reads only `retainedBytes` from `inlineCanonical` (:1509-1517). The map is written and never observably read at this position.

## Why this is a problem
Vestigial threading: of the retention's two threading sites, only `buildBodyTypeSchemas` (src/parser/body-type-lowering.ts:477-480, which genuinely spans per-declaration `defs` scopes) needs `inlineFragments`; the `parseParams` site supplies it into a configuration where, by the invariant its own comment states and the proof above confirms, every read is subsumed by `defs`. The module carries a per-field contract sentence explicitly assigning `parseParams` to the absent case, and the call site contradicts it — the code documents one wiring and ships another, and the shipped extra wiring is a write-only map plus two never-deciding branch reads at this position.

## Suggested direction (non-binding, optional)
Either drop `inlineFragments` from `parseParams`'s `LowerCtx` (matching the field doc's stated assignment of this caller to the absent case, with `inlineCanonical` alone continuing to carry the collision byte-check), or amend the field doc and the :190-192 comment so they no longer describe this threading as belonging to the absent case.

## False-positive check
- Read every read/write of `LowerCtx.inlineFragments` across src/: exactly one write (params.ts:1544) and one read site feeding two branches (:1498 → :1508, :1519), all inside `hoistInlineObjectType`; `withoutUnspellableSink` (:1212-1215) copies the reference unchanged, so recursion keeps one identity per pass.
- Verified `defs` entries are never removed within a `parseParams` pass: the only `delete` in the file (:561) operates on a shallow clone inside `hoistNestedDefs`, which runs after all lowering and writes a separate `hoisted` object.
- Verified the maps do not outlive the call: `inlineCanonical`/`inlineFragments` are local consts (:193-194) not returned through `ParamsParseResult` (:117-120, diagnostics + loweredSchema only), and `parseParams`'s signature exposes no `LowerCtx`, so no caller — test or production — can observe or seed this threading from outside.
- Tests referencing `inlineFragments` (tests/inline-object-nested-lowering.test.ts:1540-1571) construct their own seeded `LowerCtx` to exercise the CROSS-SCOPE retention path directly against `hoistInlineObjectType`/the body-type scope; none reaches the map through `parseParams`.
- Verified the other caller genuinely needs the field (body-type-lowering.ts:477-480 shares one retention across per-declaration `defs` scopes), so this is a per-call-site vestige, not a dead field — the finding is scoped to the `parseParams` threading.
- Git intent check: `git log -S "const inlineFragments = new Map" -- src/parser/params.ts` and `-S "share ONE scope"` both resolve to the same commit (52e257bc, bug-0039), i.e. the threading was introduced together with the comment stating it never fires here — inert from birth, not a regression from a removed consumer.

## Triage
verdict: questionable — inertness re-derived and reproduces (defs/retention share one identity all pass, adjacent writes, no defs deletes, map never escapes), but the anchor is a design trade, not a proven vestige: git shows it inert-by-design from birth, the code states so at :190-192, and bug 0039 §Fix's posture wires the same sink triple at all three mint sites (the finding miscounts them as two, omitting query-schema-lowering.ts:192) — a human should rule on uniform posture threading vs. per-site minimalism (triage: claude-opus-5)
verdict: questionable — every cited fact reproduces on my own re-derivation (sole `LowerCtx` construction at :209, identity-preserving recursion via `ctxFor`/`withoutUnspellableSink`, no hop into `lowerTypeSource`, only `delete` is on a clone at :561, map local and unreturned, `git log -S` → 52e257bc), so `inlineFragments` cannot decide anything at this position — but the anchor is a design trade, not proven cruft: the threading is inert-by-design from birth and says so in-code (params.ts:190-192; body-type-lowering.ts:417-431 names `parseParams` as the coinciding-scope site), the finding miscounts three mint sites as two and the omitted one (query-schema-lowering.ts:192, single `defs` per call) is equally inert yet threads the same triple under an identical acknowledgement (:184-190), so uniform sink-triple threading is the posture (bug 0039 §Fix) rather than `parseParams` being an outlier, and the claimed doc/code contradiction rests on reading :617-621 as a wiring assignment rather than a statement of what `parseParams` semantically needs; a human should rule on uniform threading vs. per-site minimalism (triage: claude-opus-5)
verdict: questionable — independently re-derived the same subsumption proof (write site pairs `defs[defName]` with `inlineFragments.set` atomically at :1537-1539, `hoistNestedDefs`'s only `delete` runs once after the field loop on a shallow clone, closure/`withoutUnspellableSink` preserve one `defs`/sink identity per call) and confirmed the miscount independently: docs/bugs/0039-inline-object-annotation-root-phantom-fields-and-silent-nested-walk.md itself (not just code comments) states `lowerQueryResponseSchema` "threads the retention per call so the byte check runs and first-wins is deliberate" — a third mint site, single-`defs`-per-call exactly like `parseParams`, so by the finding's own logic equally inert, yet documented original intent, not decay; the anchor is therefore a uniform-posture-vs-per-site-minimalism trade a human should rule on, not proven cruft (triage: claude-opus-5)
