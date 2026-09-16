---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: runInventoryClosureAudit still bundles its reference-collection and marker-classification passes into one 342-line function now that Seam A has landed
lens: D9                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending              # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/inventory-closure-audit.ts:556-897
sites: 1                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d9_class: breakdown          # D9 only: breakdown | misplacement | husk
d9_host: src/extension/inventory-closure-audit.ts#runInventoryClosureAudit # D9 breakdown only: the exemption key
d9_band: strong               # D9 breakdown only: zone | justify | strong
wave: qw20260916045442
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-16
---

# runInventoryClosureAudit still bundles its reference-collection and marker-classification passes into one 342-line function now that Seam A has landed

## Observation
This host was previously filed as PTQ-0350 ("runInventoryClosureAudit bundles four sequential
audit passes... into one 522-line function", D9 breakdown, strong band), which the human
ratified in part: "Seam A only... Hoist Pass 1, the nested `visitShapes`... Seams B/C
(`visitRefs`; marker classification) are NOT ratified - D9 re-files after this lands." Seam A
landed: `visitShapes` now exists as its own top-level function (360-543, 184 LOC) — confirmed
via `git log --oneline --follow -- src/extension/inventory-closure-audit.ts`, whose most
recent commit (`9d5a0f17 quality: qw20260915044704 fix
d9/src__extension__inventory-closure-audit.ts`) is the landing commit.
`runInventoryClosureAudit` itself is now 556-897, 342 LOC (still function band strong,
threshold 200; shrunk from PTQ-0350's own 522 LOC by exactly 180, matching the extracted
`visitShapes`'s original size) — 0 src / 2 test importers per the map. Its nested Pass-3
closure, `visitRefs` (697-784, 88 LOC, function band zone), is unchanged in kind from
PTQ-0350's deferred Seam B, and the Pass-2 marker-classification loop (814-867, 54 LOC — never
its own named closure, so it never earns its own map row) is unchanged in kind from PTQ-0350's
deferred Seam C.

## Evidence
Distinct-concern inventory (every boundary re-read verbatim at the cited lines immediately
before filing; the five rows sum exactly to the function's 342 LOC):

| concern | members | line ranges | LOC |
|---|---|---|---|
| per-invocation & per-file setup | index builds (`cat1Members`/`cat3Members`/`cat2Names`/`typeboxNamed`/`typeboxMembers`), per-file `push`/`emitFamilyFour` | 556-635 | 80 |
| family-(4) shape-recognition delegation (Seam A, already landed) | call to the now-external `visitShapes` | 636-638 | 3 |
| category-(1)/(2)/(3) reference + comment-trivia collection (Pass 3, PTQ-0350's deferred Seam B) | `Ref` interface, `resolveRef`, `scanTypeImport`, `visitRefs`, `collectComments`/`recordComment` | 639-813 | 175 |
| malformed/stale exemption-marker classification (Pass 2, PTQ-0350's deferred Seam C) | main marker `for` loop, `refsByAuthLine` build, `emitFamilyFive` | 814-867 | 54 |
| violation emission + non-empty-scan canary + result assembly (Pass 4 + tail) | final `for` loop over `refs`, canary record push, sort/return | 868-897 | 30 |

Seam A's landed delegation (636-638):
```ts
    // ---- Pass 1: family-(4) shapes (import/export/param shapes). ----
    visitShapes(sf, sf, emitFamilyFour);

```

Pass 3 start (639-648), its own comment naming the pass and the `Ref` record it collects into:
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

`visitRefs`'s own closure start (697-701) — PTQ-0350's own Seam B target, unchanged in kind:
```ts
    const visitRefs = (n: ts.Node): void => {
      if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
        const spec = n.moduleSpecifier.text;
        const ic = n.importClause;
        if (ic && ic.namedBindings && ts.isNamedImports(ic.namedBindings)) {
```

Pass 2 start (814-822), its own comment naming the pass and citing bug 0374:
```ts
    // ---- Pass 2: markers over every real comment line (bug 0374 §Fix). A well-formed
    // marker authorises the UNRESOLVED in-scope references whose originating line
    // it trails (inventory-first resolution short-circuits before the marker, so
    // an all-resolved line is (s2)); malformed grammar (a)-(g), off-originating-
    // line placement (e), family-(4)-line placement (h), and the two stale
    // sub-kinds (s1)/(s2) each route to family (5) under their own token. ----
    const authorisedLines = new Set<number>();
    const refsByAuthLine = new Map<number, Ref[]>();
    for (const r of refs) {
```

Pass 4 + tail (868-874):
```ts
    // ---- Pass 4: emit reference violations (skip resolved / marker-authorised). ----
    for (const r of refs) {
      if (r.resolved) continue;
      if (r.authLines.some((ln) => authorisedLines.has(ln))) continue;
      push(r.pos, r.family, "off-inventory", String(r.line), r.symbol, r.proposedResolution);
    }
  });
```

Cross-pass data dependencies (each an OUTPUT of one pass consumed as an INPUT by a later one;
re-verified against the current, post-Seam-A source): `familyFourLines` (written inside the
per-file setup's `emitFamilyFour`, invoked both from the now-external `visitShapes` callback
and from `visitRefs`'s own two captured-rebinding arms; read by Pass 2's clause-(h) check);
`refs` (written by `resolveRef` inside `visitRefs`; read by Pass 2's `refsByAuthLine` build and
by Pass 4's loop); `clauseELines` (written inside `visitRefs`; read by Pass 2's clause-(e)
check); `commentByLine` (written by `collectComments`, called between Pass 3 and Pass 2; read
by Pass 2's main loop); `authorisedLines` (written by Pass 2's main loop; read by Pass 4). Five
distinct pieces of inter-pass state — under the "6 or more" bar this project's own precedent
applies (PTQ-0350's own triage correction: "only 5 [locals] are actually referenced ... putting
the true count under the design doc's own ≥6-shared-locals bar").

## Why this is a problem
Function band strong (342 LOC, threshold 200) — the presumption of breakdown stands only
against a strong concrete reason; PTQ-0350 already worked through this bar for the pre-Seam-A
shape (522 LOC) and the same reasoning applies to what remains. Reasons considered:
- Closed-enumeration dispatch: the five rows are sequential, unconditional passes citing
  different spec documents (audit-recognised-shapes.md family (4) for the now-delegated Pass 1;
  audit-target-categories.md categories (1)/(2)/(3) for Pass 3; audit-resolution.md's
  malformed-/stale-marker discriminator for Pass 2; audit-failures.md's failure-surface routing
  for Pass 4) — not arms of one switch/if-chain over a spec-named closed set.
- Single algorithm with shared local state: five distinct pieces of inter-pass state
  (`familyFourLines`/`refs`/`clauseELines`/`commentByLine`/`authorisedLines`), under the
  6-or-more bar this project's own precedent requires — and the file's own now-landed Seam A
  already proves a pass this deeply threaded into the pipeline (Pass 1, which both reads
  nothing from and writes `familyFourLines` into the shared state) still externalises cleanly
  into a 3-parameter top-level function, the identical shape PTQ-0350's own Seam B/C
  candidates propose for what remains.
- Data-only module or type family: not applicable — the function is executable orchestration;
  its one local interface (`Ref`, 9 lines) is a working record, not a type catalogue.
- One grammar production family: not applicable — a post-parse audit walker over already-parsed
  source files, not a parser production.
- Generated or mechanically derived code: no `@generated`/`DO NOT EDIT`/`autogenerated` marker
  (grepped, no hits); `git log --oneline --follow` shows the Seam-A landing commit (`9d5a0f17`)
  plus six earlier hand-authored commits, each prose-cited to a spec/bug.
Strong-band extra (required beyond the concrete reason): no audit-resolution.md/
audit-failures.md clause ties the remaining four rows into one ordered critical section a seam
would interleave — each cited paragraph states a resolution RULE (e.g. "inventory-first
resolution"), not an implementation mandate that the code stay one function; an orchestrator
calling the same passes in the same order and threading their outputs forward, exactly as this
function does today through nested closures, preserves that precedence intact — the same
conclusion PTQ-0350 reached, and Seam A's own landing already demonstrates in miniature. No
measured-cost citation exists anywhere in the file or its tests. `git log --oneline --follow --
src/extension/inventory-closure-audit.ts | grep -iE "revert|split|extract"` returns no hits —
Seam A's own extraction is a landed split, not a reverted one. `quality/exemptions.json` carries
no entry for this host. The one human ruling on record for this exact host (PTQ-0350's triage)
is not a keep-whole ruling for Seams B/C — it explicitly withholds ratification from them and
instructs "D9 re-files after this lands," which this filing does.

## Suggested direction (non-binding, optional)
Unproven hypotheses; the human ratifies one (PTQ-0350's own un-ratified Seam B/Seam C
proposals, updated to current line numbers).
- Seam B: extract Pass 3's `visitRefs` (697-784, 88 LOC) into a module-private function
  bundling `cat1Members`/`cat3Members`/`typeboxNamed`/`typeboxMembers` into one small
  per-invocation resolution-context parameter, plus `sf`, `typeboxTypeIsImported`,
  `emitFamilyFour`, `resolveRef`, `clauseELines` -> hypothesis name unchanged (`visitRefs`) - 0
  exported symbols moved (module-private today), 0 external importers (src/tests),
  cross-references back into the host: `isCapturedRebinding`, `isTypebox`, `isPeerPackage`
  (already module-private free functions in this file).
- Seam C: extract the Pass-2 marker-classification loop (814-867, 54 LOC) into a module-private
  function taking `commentByLine`, `familyFourLines`, `refsByAuthLine` (or `refs` to build it),
  `clauseELines`, and the emit callback -> hypothesis `classifyMarkers` - 0 exported symbols
  moved, 0 external importers, cross-references back into the host: `classifyMarker`,
  `MALFORMED_CLAUSE_TOKEN` (already module-private).

## False-positive check
Band: strong (function LOC 342, threshold 200). Reasons-considered: listed above with the
evidence that defeated each (sequential unconditional passes citing distinct spec items; 5
inter-pass state pieces under the 6-or-more bar, and Seam A's own landing already proves a pass
this deep in the pipeline extracts cleanly; one working interface only, not a type catalogue;
not a parser production; no generated-code marker). Exemptions check: `quality/exemptions.json`
grepped for `inventory-closure-audit` — no entry. Generated-code check: grepped the file for
`@generated`/`DO NOT EDIT`/`autogenerated` — no hits. Spec-mirror check: audit-resolution.md's
"Inventory-first resolution" paragraph pins a strict step-ORDER (rule content), not a
single-function IMPLEMENTATION mandate; nothing in audit-recognised-shapes.md,
audit-target-categories.md, audit-failures.md, or audit-wire-and-canary.md requires the
remaining passes to execute inside one function body. Prior-finding check: grepped
`quality/issues` + `quality/resolved` + `quality/intake` for `runInventoryClosureAudit`,
`visitRefs`, and `inventory-closure-audit` — the only breakdown hit is `PTQ-0350` (status
fixed, this host's own predecessor, whose Seam A landed per the git-log commit above and whose
Seams B/C it explicitly left open for a re-file); this filing supplies fresh line ranges/LOC and
a fresh five-row inventory against the current 342-LOC function (row boundaries shifted from
PTQ-0350's 522-LOC numbering by Seam A's landing) rather than reproducing that filing's now-stale
accounting. Husk/misplacement check (reviewed at every size per the brief, independent of the
breakdown band): the file's 0-src/2-test importer pattern for this export matches its own
header's declared architecture ("the thin disk-walk + `npm test` driver ... is
tests/inventory-closure-audit-gate.test.ts"), confirmed live in that test file — a deliberate
test-as-build-gate seam, not a husk.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — accounting reproduces exactly (size-scan: runInventoryClosureAudit 556-897/342 LOC/strong/0-src-2-test-importers; visitShapes hoisted 360-543/184 LOC exactly as PTQ-0350's ratified Seam A; visitRefs still nested 697-784/88 LOC; the 5-row inventory tiles the function with no gaps and sums to 342; 5 true inter-pass locals confirmed by tracing each, correctly excluding intra-pass typeboxTypeIsImported, under the design doc's own ≥6 bar; no exemptions/generated-marker/reverted-split hits; not a duplicate — this is the exact re-file PTQ-0350's human ratification invited once Seam A landed) — D9 breakdown accounting never confirms; the Seam B/C shape is a human ruling (triage: claude-opus-5)
