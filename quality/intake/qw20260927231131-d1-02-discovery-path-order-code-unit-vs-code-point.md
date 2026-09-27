---
id: pending
title: Diagnostic path ordering is decided by two comparators — assembleDiagnostics uses the shared compareCodePoint while discovery-collision-resolve.ts hand-rolls UTF-16 code-unit `<` at three sites under a "byte-wise" label — and the PTQ-1219 migration reached only the first
lens: D1
status: intake
verdict: pending
locations:
  - src/diagnostics/diagnostic.ts:128-141
  - src/discovery/discovery-collision-resolve.ts:47
  - src/discovery/discovery-collision-resolve.ts:190-201
  - src/discovery/discovery-collision-resolve.ts:233-235
  - src/code-point-order.ts:1-11
sites: 5
fix_scope: cross-module
d1_class: divergent-solutions
wave: qw20260927231131
reported_by: lens-d1-design (anthropic/claude-fable-5-1)
date: 2026-09-28
---

# Diagnostic path ordering is decided by two comparators — assembleDiagnostics uses the shared compareCodePoint while discovery-collision-resolve.ts hand-rolls UTF-16 code-unit `<` at three sites under a "byte-wise" label — and the PTQ-1219 migration reached only the first

## Observation
Two in-scope modules order file paths so that a rendered diagnostic surface is deterministic. `src/diagnostics/diagnostic.ts#assembleDiagnostics` orders the `(file, line, col)` batch key with `compareCodePoint` from `src/code-point-order.ts`, the repository's dependency-free canonical string comparator. `src/discovery/discovery-collision-resolve.ts` orders paths inside three `theta/load/*` messages — the case-collision winner (`a.path < b.path`), the cross-format-collision `<paths>` list (`collisionPathOrder`, `na < nb`), and the Pi-owned sibling tail (`a < b`) — with inline UTF-16 code-unit relational operators. The spec text those three sites implement says "case-sensitive byte comparison" (DISC-3) and the comparator's own doc-comment says "byte-wise"; `<` on JS strings compares UTF-16 code units, which is byte order only outside the surrogate range. `compareCodePoint` exists to be the one shared implementation of exactly that byte/code-point order, and was adopted by diagnostic.ts on 2026-09-21 (the PTQ-1219 fix) without the discovery sites being touched.

## Evidence

**Way 1 — the shared comparator.** src/code-point-order.ts:1-11 (re-read before filing):
```ts
// Unicode code-point (lexical) string comparator.
//
// A pure, dependency-free helper (no imports) shared by two independent
// canonical-serialisation obligations that each require object keys in
// ascending Unicode code-point order: the compact-transcript renderer's
// canonical JSON (binder/binder-model-and-context.md BNDR-8, `canonicalJson`
// in `src/binder/compact-transcript.ts`) and the canonical schema hash
// (docs/reference/schema-subset.md §"Canonical schema hash" step 2,
// `canonicalForm` in `src/parser/schema-lowering.ts`). One shared
// implementation means a correction to the comparison (an empty string, an
// unpaired surrogate, an astral-plane character) reaches both call sites.
```
src/diagnostics/diagnostic.ts:128-135:
```ts
  // ones (empty file / position 0). Array.prototype.sort is stable, so
  // diagnostics tying on the full key keep their collected order. The file
  // key uses the canonical code-point comparator, not locale collation, so
  // the ordering is fixed regardless of the host's locale/ICU configuration.
  return collected.sort((a, b) => {
    const fileCmp = compareCodePoint(a.file ?? "", b.file ?? "");
    if (fileCmp !== 0) {
      return fileCmp;
    }
```

**Way 2 — three inline code-unit comparators in discovery-collision-resolve.ts.**
src/discovery/discovery-collision-resolve.ts:33-34 and :47 (the DISC-3 winner):
```ts
/** Resolve intra-source case-collisions (DISC-3): two `*.theta` paths differing
 *  only in case collide; the byte-first path wins, the rest drop. */
...
    const sorted = [...distinct].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
```
src/discovery/discovery-collision-resolve.ts:190-201 (the `<paths>` comparator):
```ts
/** Shared `<paths>` ordering for both `theta/load/cross-format-collision`
 *  arms (placeholder-rendering-b.md:57): discovery-source PRIORITY first,
 *  then byte-wise normalised (forward-slash) absolute path — a single
 *  comparator so the same-format and Pi-owned mints cannot drift apart
 *  again (0459 §Fix Residual 2). */
function collisionPathOrder(a: SourcedCandidate, b: SourcedCandidate): number {
  if (PRIORITY[a.source] !== PRIORITY[b.source]) return PRIORITY[a.source] - PRIORITY[b.source];
  const na = normalizePath(a.path);
  const nb = normalizePath(b.path);
  return na < nb ? -1 : na > nb ? 1 : 0;
}
```
src/discovery/discovery-collision-resolve.ts:233-235 (the Pi-owned sibling tail):
```ts
      const siblingPaths = (piOwnedByName.get(name) ?? [])
        .map((command) => (command.path !== undefined && command.path !== "" ? normalizePath(command.path) : command.name))
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
```

**What the two sites are each pinned to.** docs/spec_topics/discovery/discovery-sources.md:76 (DISC-3, verbatim fragment): "the lexicographically-first path under case-sensitive byte comparison wins". docs/bugs/0459-…:232-233: "Sort each `<paths>` segment by `PRIORITY[source]` then byte-wise absolute path before joining (one comparator shared by both arms)". docs/spec_topics/diagnostics/placeholder-rendering-b.md:57: "both internally ordered by discovery-source priority then by absolute path".

**Counts (all commands run in this session):**
- `grep -rn "compareCodePoint" src --include=*.ts` → 7 hits: declaration (code-point-order.ts:19) plus import+use pairs in compact-transcript.ts (:56/:207), diagnostic.ts (:9/:133), schema-lowering.ts (:29/:89). Three consumers, not the "two" the header names; none in src/discovery.
- `grep -rn "\.sort(" src/discovery --include=*.ts` → 4 hits, all in discovery-collision-resolve.ts (:47, :231, :235, :278); :231 and :278 both call `collisionPathOrder`. So every path sort in the discovery module resolves to one of the three code-unit comparators above.
- `grep -rn "localeCompare" src --include=*.ts` → 0 hits (the pre-PTQ-1219 third mechanism is gone from diagnostic.ts and nowhere else).

**Drift that already happened.** quality/resolved/PTQ-1219-assemblediagnostics-localecompare.md (fixed) moved diagnostic.ts from `localeCompare` to `compareCodePoint`; its fix commit `4c45683e 2026-09-21 quality: qw20260921191250 fix d8/src__diagnostics__diagnostic.ts` touched one file (`git show 4c45683e --stat` → `src/diagnostics/diagnostic.ts | 48 ++---`). Its triage note (PTQ-1219 "## Triage") recorded the residual question verbatim: "the simpler shape (compareCodePoint vs code-unit `<`) is a design decision for a human ruling". The ruling was applied to diagnostic.ts only; the three discovery comparators (introduced `69e8f632 2026-09-05` for 0459 and `ae8b6e05 2026-09-14`) were outside that filing's scope and kept code-unit order.

**Concrete divergence between the two ways.** `node -e` with two candidate paths `/r/\uFF5E.theta` (U+FF5E, BMP) and `/r/\u{1F600}.theta` (astral) printed:
```
code-unit <     : [ '"/r/😀.theta"', '"/r/～.theta"' ]
compareCodePoint: [ '"/r/～.theta"', '"/r/😀.theta"' ]
```
UTF-8 byte order (what DISC-3 calls "byte comparison") agrees with `compareCodePoint`: the ～ path's final segment begins `ef bd 9e`, the 😀 path's `f0 9f 98 80`. So for any pair straddling the surrogate range the DISC-3 winner, the `<paths>` order, and the sibling-tail order chosen by Way 2 differ from the order Way 1 would produce for the same two strings — and from the order the comment on Way 2 claims.

**Self-inconsistency statement.** No written rule names a comparator; DISC-3 and 0459 say "byte", diagnostic.ts's comment says "canonical code-point comparator", and both are the same ordering. The anchor is self-inconsistency — one module implements that ordering with the shared comparator, its sibling implements it three times inline with a different ordering — plus the cost cited above.

## Why this is a problem
Design consistency: the repository already declared one home for this comparison and stated why (code-point-order.ts:9-11: "One shared implementation means a correction to the comparison (… an unpaired surrogate, an astral-plane character) reaches both call sites"). The three discovery comparators are outside that reach, so the promised propagation does not hold for the very inputs the header enumerates. The concrete misread is in the code itself: `collisionPathOrder`'s doc-comment says "byte-wise" and `resolveCaseCollisions`' says "byte-first", but `<` on JS strings is code-unit order; a maintainer reading those comments (or DISC-3) and cross-checking against diagnostic.ts finds two different mechanisms claiming the same ordering. The one prior migration onto the shared comparator (PTQ-1219) stopped at the module boundary, which is how the divergence came to exist.

## Suggested direction (non-binding, optional)
Unproven hypothesis: the three inline comparators are `compareCodePoint` applications (on `normalizePath(...)`-ed strings where they already normalise), leaving `PRIORITY` as `collisionPathOrder`'s leading key; whether any committed expectation depends on code-unit order for non-ASCII paths has not been verified, and the code-point-order.ts header's "two … call sites" inventory would need updating either way.

## False-positive check
- Clone-map check: no group covers this (the shard's map lists no groups for diagnostic.ts, discovery-collision-resolve.ts, or code-point-order.ts; the three inline comparators are one-line lambdas, not a token-run copy of `compareCodePoint`).
- D9-affinity check: not a wrong-home claim; the discovery sorts belong where they are — the claim is that they implement the ordering by a second mechanism.
- D2-deadness check: both sides live. `assembleDiagnostics` has 2 production callers (`grep -rn "assembleDiagnostics(" src --include=*.ts` excluding its own file → theta-document.ts:297, par-for-executor.ts:358); the three discovery sorts are on `discoverThetas`' path (`resolveBySource`/`resolveSlashNames` imported by discovery-walk.ts:76-80 and called at :570-572).
- Export-style exemption: not applicable (divergent-solutions).
- Prior-filing check: PTQ-1219 (resolved) — fix scope read: `localized`, one file, diagnostic.ts only; its triage explicitly left the `compareCodePoint`-vs-`<` question open. PTQ-0357 (resolved, D4) deduplicated two byte-identical `compareCodePoint` bodies into code-point-order.ts — unrelated to the `<` sites. REVIEW_LOG 2026-09-21 D8 shard-02 noted "collisionPathOrder UTF-16 `<` vs its own 'byte-wise' comment" as left unfiled (routed to D7); no filing exists. `grep -rli "collisionPathOrder" quality/issues quality/intake quality/resolved` → 6 hits: this file plus five resolved D9 discovery-walk breakdown records (PTQ-0281/0298/0305/0333/0356), each naming `collisionPathOrder` only as a member being relocated, none about its comparator.
- Not a bug filing: the ordering difference is cited only as the demonstration that the two mechanisms are not interchangeable; no behaviour change is proposed.
- Self-inconsistency: no written rule exists; the anchor is self-inconsistency plus the cost cited above.

## Triage
verdict: questionable — accounting verified: all three stated searches reproduce exactly (compareCodePoint 7 hits, 3 consumers, none in src/discovery; `.sort(` in src/discovery 4 hits at :47/:231/:235/:278; localeCompare 0), as do the collisionPathOrder grep (6 files) and assembleDiagnostics callers (theta-document.ts:297, par-for-executor.ts:358). Every excerpt matches at its cited lines. clone-scan map lists no groups for discovery-collision-resolve.ts or diagnostic.ts. 4c45683e touched only diagnostic.ts, and the PTQ-1219 triage quote is verbatim. DISC-3 does say "case-sensitive byte comparison". The divergence reproduces: `<` puts 😀 before ～, while a UTF-8 Buffer.compare returns -1 (～ first). So the "byte-wise"/"byte-first" comments misdescribe the code and the cost is concrete, not symmetry-only. However, unifying would change behaviour for surrogate-range paths against a spec clause, so the result is partly bug-shaped. Whether to unify onto compareCodePoint is a design decision for a human ruling (triage: claude-opus-5-5)
