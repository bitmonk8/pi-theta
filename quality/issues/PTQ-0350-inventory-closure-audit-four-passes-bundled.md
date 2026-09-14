---
id: PTQ-0350
title: runInventoryClosureAudit bundles four sequential audit passes (shape recognition, reference collection, marker classification, violation emission) into one 522-line function
lens: D9                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/inventory-closure-audit.ts:357-878
sites: 1                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d9_class: breakdown          # D9 only: breakdown | misplacement | husk
d9_host: src/extension/inventory-closure-audit.ts#runInventoryClosureAudit # D9 breakdown only: the exemption key
d9_band: strong               # D9 breakdown only: zone | justify | strong
wave: qw20260914130212
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-14
---

# runInventoryClosureAudit bundles four sequential audit passes (shape recognition, reference collection, marker classification, violation emission) into one 522-line function

## Observation
`src/extension/inventory-closure-audit.ts` is 925 LOC (file band zone — no
breakdown presumption at the file level). Its header states the module's
role: "This module owns the negative-direction *inventory-closure audit* the
pi-integration-contract audit shards specify... `runInventoryClosureAudit` is
that core; the thin disk-walk + `npm test` driver around it is
tests/inventory-closure-audit-gate.test.ts" (lines 3-34). Independently of
the file's own band, `runInventoryClosureAudit` itself (357-878, 522 LOC,
FUNCTION band strong) is 56% of the file and its only large declaration; 0
src / 2 test importers per the map. Its body is organised, by its own inline
comments, into four numbered passes plus setup and a canary/result-assembly
tail. Two of the four passes are themselves independently over their own
function threshold per the map's breakdown listing: Pass 1's `visitShapes`
(438-617, 180 LOC, band justify) and Pass 3's `visitRefs` (678-765, 88 LOC,
band zone).

## Evidence
Distinct-concern inventory (every boundary re-read verbatim at the cited
lines immediately before filing):

| concern | members | line ranges | LOC |
|---|---|---|---|
| per-invocation & per-file setup | inventory index builds (`cat1Members`/`cat3Members`/`cat2Names`/`typeboxNamed`/`typeboxMembers`), per-file `push`/`emitFamilyFour` | 357-436 | 80 |
| family-(4) out-of-scope shape recognition (Pass 1) | `visitShapes` | 437-618 | 182 |
| category-(1)/(2)/(3) reference + comment-trivia collection (Pass 3) | `scanTypeImport`, `visitRefs`, `collectComments`/`recordComment` | 620-793 | 174 |
| malformed/stale exemption-marker classification (Pass 2) | main marker `for` loop, `refsByAuthLine` build, `emitFamilyFive` | 795-847 | 53 |
| violation emission + non-empty-scan canary + result assembly (Pass 4 + tail) | final `for` loop over `refs`, canary record push, sort/return | 849-878 | 30 |

Setup, lines 357-360:
```ts
export function runInventoryClosureAudit(input: AuditInput): AuditResult {
  const inventory = input.inventory;
  const cat1Members = new Set(
    inventory.filter((e) => e.id.startsWith("pi.")).map((e) => rightmostSegment(e.id)),
```

Pass 1 start, lines 437-441, its own comment naming the pass and family:
```ts
    // ---- Pass 1: family-(4) shapes (import/export/param shapes). ----
    const visitShapes = (n: ts.Node): void => {
      if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
        const spec = n.moduleSpecifier.text;
        if (isInScopeSpecifier(spec)) {
```

Pass 3 start, lines 620-629, its own comment naming the pass and the three categories:
```ts
    // ---- Pass 3: collect category-(1)/(2)/(3) references (emitted in pass 4). ----
    interface Ref {
      readonly pos: number;
      readonly line: number;
      /** Bug 0374 §Fix: the line(s) a marker may trail to authorise this ref (the per-shape originating-line map). */
      readonly authLines: readonly number[];
      readonly family: string;
      readonly resolved: boolean;
      readonly symbol: string;
      readonly proposedResolution: string;
    }
    const refs: Ref[] = [];
```

Pass 2 start, lines 795-802, its own comment naming the pass and citing bug 0374:
```ts
    // ---- Pass 2: markers over every real comment line (bug 0374 §Fix). A well-formed
    // marker authorises the UNRESOLVED in-scope references whose originating line
    // it trails (inventory-first resolution short-circuits before the marker, so
    // an all-resolved line is (s2)); malformed grammar (a)-(g), off-originating-
    // line placement (e), family-(4)-line placement (h), and the two stale
    // sub-kinds (s1)/(s2) each route to family (5) under their own token. ----
    const authorisedLines = new Set<number>();
    const refsByAuthLine = new Map<number, Ref[]>();
```

Pass 4 + tail, lines 849-858:
```ts
    // ---- Pass 4: emit reference violations (skip resolved / marker-authorised). ----
    for (const r of refs) {
      if (r.resolved) continue;
      if (r.authLines.some((ln) => authorisedLines.has(ln))) continue;
      push(r.pos, r.family, "off-inventory", String(r.line), r.symbol, r.proposedResolution);
    }
  });

  // ---- Non-empty-scan canary (fail-closed, once per invocation). ----
  const canaryOk = walked > 0 && recognised > 0;
```

Cross-pass data dependencies (each an OUTPUT of one pass consumed as an INPUT
by a later one; every write/read site re-read verbatim): `familyFourLines`
(written by `emitFamilyFour` inside Pass 1, read by Pass 2's clause-(h) check
at line 824: `if (familyFourLines.has(ln))`); `refs`/`clauseELines` (written
by `resolveRef`/`visitRefs` inside Pass 3, read by Pass 2's `refsByAuthLine`
build at 803-809 and its clause-(e) check at 839-840, and by Pass 4's loop at
850-854); `commentByLine` (written by `collectComments` between Pass 3 and
Pass 2, read by Pass 2's main loop at 813); `authorisedLines` (written by
Pass 2 at line 835, read by Pass 4 at 852).

## Why this is a problem
Function band strong (522 LOC, threshold 200) — the presumption of breakdown
stands only against a strong concrete reason. Reasons considered:
- Closed-enumeration dispatch: does not apply — the four passes are not arms
  of one switch/if-chain over a spec-named closed set; each is its own
  full-file recursive AST traversal (`ts.forEachChild`) cited to a different
  spec paragraph (audit-recognised-shapes.md family (4) for Pass 1;
  audit-target-categories.md categories (1)/(2)/(3) for Pass 3;
  audit-resolution.md's malformed-/stale-marker discriminator for Pass 2;
  audit-failures.md's failure-surface routing for Pass 4).
- Single algorithm with shared local state: no small (<6) set of locals is
  read by every pass, the bar this project's own precedent sets for this
  reason (`checkInvokeStaticResolution`'s ratified Seam A, PTQ-0321, found
  exactly five such setup-level locals for that function). Here the passes
  form a producer/consumer PIPELINE instead — Pass 1 produces
  `familyFourLines`; Pass 3 produces `refs`, `clauseELines`,
  `typeboxTypeIsImported`; the comment-collection step produces
  `commentByLine`; Pass 2 consumes all four of those and produces
  `authorisedLines`; Pass 4 consumes `refs` and `authorisedLines` — six
  distinct pieces of inter-pass state. But the map's own two flagged nested
  functions show at least one pass is cleanly severable on its own:
  `visitShapes` (Pass 1, 180 LOC) closes only over `sf` and the single
  `emitFamilyFour` callback (itself already a closure bundling
  `push`/`familyFourLines`/`recognised`) — a 3-parameter extraction
  (`(n, sf, emitFamilyFour)`, recursing via `ts.forEachChild(n, (c) =>
  visitShapes(c, sf, emitFamilyFour))`), the same shape as this project's own
  ratified Seam A (`checkThetaCallableCallSurface`, extracted taking
  `callerPath`/`typeEnv`/`typePass`/`deps`). A viable partial seam defeats a
  "keep the whole 522-line function together" claim even where a full 4-way
  disaggregation might cost more.
- Data-only module or type family: not applicable — the function is
  exclusively executable AST-walking orchestration; its one local interface
  (`Ref`, 621-629) is a working record, not a type catalogue (well under
  80% of the LOC).
- One grammar production family: not applicable — a post-parse audit walker
  over already-parsed source files, not a parser production.
- Generated or mechanically derived code: no `@generated`/`DO NOT
  EDIT`/`autogenerated` marker (grepped, no hits); `git log --oneline
  --follow` shows six hand-authored commits (V18b, V18b-T, the Loom→Theta
  rename, bug-0373/bug-0374, and two later `quality:` fixes), each
  prose-cited to a spec/bug.
Strong-band extra (required beyond the concrete reason): no
audit-resolution.md / audit-failures.md clause ties the four passes into one
ordered CRITICAL SECTION whose steps a seam would interleave — the cited
paragraphs each state a resolution RULE (e.g. audit-resolution.md's
"Inventory-first resolution": inventory, then the typebox allow-lists, then
the marker, strictly ordered), not an implementation mandate that the CODE
stay one function; an orchestrator that calls the same passes in the same
order and threads their outputs forward — exactly what this function does
today, just through nested closures instead of named top-level helpers —
preserves that precedence intact. No measured-cost citation exists anywhere
in the file or its tests. `git log --oneline --follow --
src/extension/inventory-closure-audit.ts | grep -iE "revert|split|extract"`
returns no hits — no prior split was reverted. `quality/exemptions.json`
carries no entry for this host or for this file at all.

## Suggested direction (non-binding, optional)
Unproven hypotheses; the human ratifies one (this project's own precedent,
PTQ-0321/PTQ-0304, each ratified exactly one of several proposed seams and
left the rest for a later wave).
- Seam A: extract Pass 1 (`visitShapes`, 438-617, 180 LOC) into a
  module-private top-level function taking `(n: ts.Node, sf: ts.SourceFile,
  emitFamilyFour: (pos: number, symptom: string, symbol: string) => void)` ->
  hypothesis name unchanged (`visitShapes`) - 0 exported symbols moved
  (module-private today), 0 external importers (src/tests), cross-references
  back into the host: `isInScopeSpecifier`, `paramTypeText`,
  `bareCarrierLiteral`, `wrappedCarrierAnnotation`, `subtypeCreationCarrier`,
  `declHeadText`, `inPiCarrier`, `inCtxCarrier` (already module-private free
  functions in this file).
- Seam B: extract Pass 3's `visitRefs` (678-765, 88 LOC) into a
  module-private function bundling `cat1Members`/`cat3Members`/
  `typeboxNamed`/`typeboxMembers` into one small per-invocation
  resolution-context parameter, plus `sf`, `typeboxTypeIsImported`,
  `emitFamilyFour`, `resolveRef`, `clauseELines` -> hypothesis name unchanged
  (`visitRefs`) - 0 exported symbols moved, 0 external importers,
  cross-references back into the host: `isCapturedRebinding`, `isTypebox`,
  `isPeerPackage` (already module-private free functions).
- Seam C: extract the Pass-2 marker-classification loop (795-847, 53 LOC)
  into a module-private function taking `commentByLine`, `familyFourLines`,
  `refsByAuthLine` (or `refs` to build it), `clauseELines`, and the emit
  callback -> hypothesis `classifyMarkers` - 0 exported symbols moved, 0
  external importers, cross-references back into the host: `classifyMarker`,
  `MALFORMED_CLAUSE_TOKEN` (already module-private).

## False-positive check
Band: strong (function LOC 522, threshold 200). Reasons-considered: listed
above with the evidence that defeated each (no closed-enumeration arms; the
pipeline's inter-pass state is a producer/consumer chain, not one small
shared-locals set, and the map's own `visitShapes`/`visitRefs` flags show at
least a partial seam is viable; one working interface only, not a
type/table-dominated body; not a parser production; no generated-code
marker). Exemptions check: `quality/exemptions.json` grepped for
`inventory-closure-audit` — no entry. Generated-code check: grepped the file
for `@generated`/`DO NOT EDIT`/`autogenerated` — no hits. Spec-mirror check:
audit-resolution.md's "Inventory-first resolution" paragraph pins a strict
three-step RESOLUTION PRECEDENCE (inventory, then typebox allow-lists, then
marker) as the rule content, not a single-function implementation mandate;
nothing in audit-recognised-shapes.md, audit-target-categories.md,
audit-failures.md, or audit-wire-and-canary.md requires the four passes to
execute inside one function body. Prior-finding check: grepped
`quality/issues` + `quality/resolved` + `quality/intake` for
`inventory-closure-audit`, `runInventoryClosureAudit`, `visitShapes`, and
`visitRefs` — the only hits are PTQ-0053 (a D2 dead-parameter finding on the
same function's `push` helper, unrelated to breakdown) and doc-staleness
filings unrelated to this host's structure; no D9 breakdown finding has been
filed against this host before. Husk / misplacement check (this file is
reviewed for placement at every size per the brief, independent of the
breakdown band): the file's 0-src/2-test importer pattern for every export
matches its own header's declared architecture ("the thin disk-walk + `npm
test` driver ... is tests/inventory-closure-audit-gate.test.ts"), confirmed
live in `tests/inventory-closure-audit-gate.test.ts:1-10` (imports
`formatAuditRecordLine`, `runInventoryClosureAudit`, `AuditRecord`,
`AuditResult` and drives them against a real disk walk) — a deliberate
test-as-build-gate seam, not a husk; every export has a live caller. No
cross-layer or foreign-host affinity was found either: the file's only
sibling imports (`PEER_DEP_PACKAGES` from `./capability-probe`,
`SurfaceInventoryEntry` from `./sdk-inventory`) are consumed, not
duplicated — `capability-probe.ts` has no carrier-detection logic at all
(grepped for `ExtensionAPI`/`ExtensionContext`/`carrier`, no hits) and
`sdk-inventory.ts`'s two `ExtensionAPI`/`ExtensionContext` hits are literal
inventory-table id strings (lines 306-307), not AST logic — so this file's
own carrier-detection helpers have no foreign host to be misplaced from.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — accounting reproduces exactly: size-scan confirms the file at 925 LOC/zone, runInventoryClosureAudit at 357-878/522 LOC/strong with 0 src/2 test importers, and the two flagged nested functions visitShapes (438-617/180 LOC/justify) and visitRefs (678-765/88 LOC/zone) all match the filing's own numbers verbatim; the 5-row concern inventory is real, grounded in the code's own numbered Pass-1..4 comments each citing a distinct spec document; the shared-locals reason is correctly defeated (cat1Members/cat3Members/cat2Names/typeboxNamed/typeboxMembers are read only inside Pass 3, never by Pass 1/2/4, so no ≥6-local set spans every pass, unlike the cited PTQ-0321 precedent's shape); git log (6 hand-authored commits, no revert/split hits) and quality/exemptions.json (no entry) both confirmed; minor imprecisions found (a couple of 1-2-line excerpt-boundary drifts, and typeboxTypeIsImported is really intra-Pass-3 state rather than one of the claimed "six inter-pass" pieces) don't refute the core accounting; D9 breakdown caps at questionable since the split's shape is a human ruling, never confirmed (triage: claude-opus-5)
verdict: confirmed — RATIFIED (human, 2026-09-14): Seam A only - a FUNCTION seam inside src/extension/inventory-closure-audit.ts. Hoist Pass 1, the nested visitShapes (runInventoryClosureAudit :438-617, 180 LOC), to a module-private top-level function of the same name taking what it closes over today (n: ts.Node, sf: ts.SourceFile, emitFamilyFour: (pos, symptom, symbol) => void, plus anything else grep shows the body reads) and call it from the same point in runInventoryClosureAudit; the module-private helpers it calls (isInScopeSpecifier, paramTypeText, bareCarrierLiteral, wrappedCarrierAnnotation, subtypeCreationCarrier, declHeadText, inPiCarrier, inCtxCarrier) stay where they are. Body moved verbatim with comments; doc comment on the hoisted function; identical behaviour and output order; tsc first; report before/after LOC of runInventoryClosureAudit. Seams B/C (visitRefs; marker classification) are NOT ratified - D9 re-files after this lands.
