# Bug 0456 — Fifteen line-citations into `src/parser/imports.ts` (one inside an assertion message) name pre-shift positions after the file's identified insertion chain — the `checkImportDanglingAlias` cites bug 0431 §Fix Residual 2 recorded still say `:437` where the function sits at `:462` — and the line-pinned LPA's `grammar.md:175` cite, carved out by bug 0421's lane policy, still points at arm-body prose where `AliasRhs` sits at `:184`

- **Status:** fixed (0.444.0).
- **Sev/Diff estimate:** S5/D1 — S5: doc/records drift, the exact class
  0405/0421 were filed and fixed for. Admission ground first: 10 of the
  16 instances carry independent authorization or a single identified
  recent shift — the LPA cite adjudicated fileable in-tree by 0421 §Fix
  Residual 1 (carved out by lane policy only); the three `:437` cites
  named by 0431 §Fix Residual 2 ("a follow-up citation sweep owes them");
  two never-correct numbers manufactured by `f8eb6286` itself; the one
  assertion-message instance; and three exact-+25 shifts from
  `6619f85d`(+17)+`f8eb6286`(+8). The other 6 are comment-only drift
  inherited across four to six commits and 300+ versions with NO single
  inducing-commit signature — kept because a partial sweep is worse than
  a fully documented one (0102 §Residuals / 0134 §Provenance
  disposition): they are swept as collateral under a same-file mechanical
  edit, admitted on that ground, not on the 0134 exclusion axis. The
  assertion-message hazard is real but singular (1 of 16 — the
  `export-from:650` message misdirects the debugging session that reads
  it on a red). D1: a bounded mechanical re-pin over the enumerated
  set (comment/message-string only), with one special-handling file — the
  LPA edit must hold the 14864-line pin (the 0336 precedent proves the
  same-line refresh is routine).
- **Kind:** test-infrastructure / doc drift — non-load-bearing for
  verdicts (all assertions are on codes/messages/behaviour), but the stale
  numbers are diagnostics that lie (wrong site) exactly when read.
- **Related:**
  - 0431 (fixed 0.434.0) — §Fix Residual 2 names the core instances and
    owes the sweep: "the `checkImportDanglingAlias` citations (`:437`) in
    `tests/import-specifier-list-production-required.test.ts` /
    `…-separator-production-required.test.ts` were already drifted at the
    fork and were not chased (do-not-chase convention); a follow-up
    citation sweep owes them." Its own fix (`f8eb6286`) is also the
    chain's latest +8 shift, and its citation-only refresh chased ONLY
    that +8 on two sibling cites, leaving the pre-fork +17 in the
    refreshed numbers (instances 1 and 7 below).
  - 0421 (fixed 0.427.0) — §Fix Residual 1 names the LPA instance and
    prescribes the vehicle: "`tests/live/live-production-acceptance.test.ts:2342`
    (`grammar.md:175`→:184) — enumerated in §Affected/§Fix but CARVED OUT:
    this lane's binding rules forbid editing the line-pinned LPA (14864
    lines). … Follow-on: a lane permitted to touch the LPA under its pin
    applies the one-line `:175`→`:184` refresh." This report is that
    vehicle.
  - 0405 (fixed 0.415.0) — the parent sweep pattern (enumerate + re-pin +
    content-anchored gate) this report reuses.
  - [0336] (fixed 0.308.0) — the LPA-refresh precedent: a one-line comment
    fix in the line-pinned LPA, holding the 14864-line pin.
  - [0134] (fixed 0.198.0) — boundary: `src/parser/imports.ts` is NOT on
    the §Citations converted-file ratchet (line-form cites into it pass
    `tests/citation-symbol-form-gate.test.ts` at the pin), and every
    instance below is shift-induced by the identified imports.ts commit
    chain (each was correct at its authoring-era layout, measured below) —
    outside the pre-existing position-only do-not-file class.
- **Affected** (every instance re-verified at `401a425b`, v0.437.0;
  imports.ts truth table first; `[A]` marks assertion-message strings):
  - Truth (current `src/parser/imports.ts`):
    `checkImportReservedSynthesisedName` `:353`;
    `IMPORT_MISSING_FROM_CLAUSE_MESSAGE` (the "requires a 'from' clause
    with a .thetalib path literal" string) `:372–373`;
    `checkImportMalformedSpecifierList` `:430`;
    `checkImportDanglingAlias` doc-comment contract `:452–461`, function
    `:462–476`; `ImportSpecifier` `:536`, its `local` field `:540`;
    `checkImportUnknownSymbols` `:564`; `checkImportNameCollisions` `:597`;
    `computeThetaLibExports` `:814–819` (the two publishing map arms
    `:816–817`); `thetalibLocalBindings` `:832`.
  - Shift chain (every commit touching imports.ts, `git log --follow`):
    `aef82bde` (0040, v0.50.0) → `069c0117` (0058, v0.60.0) → `af221903`
    (0100, v0.134.0) → `e0873e53` (0211, v0.150.0) → `4fbae356` (0302,
    v0.292.0) → `6619f85d` (0361, v0.353.0, +17 through the check block)
    → `f8eb6286` (0431, v0.434.0, +8). Measured anchors:
    `checkImportDanglingAlias` `:437` at `e0873e53`/`4fbae356` → `:454`
    after `6619f85d` → `:462` now; `checkImportNameCollisions` `:515` at
    `af221903` → `:597` now; `computeThetaLibExports` `:614` at `aef82bde`
    → `:723` at `af221903` → `:814` now; `thetalibLocalBindings` `:741` at
    `af221903` → `:832` now; `ImportSpecifier` `:298` at the rename
    commit → `:536` now.
  - `tests/import-specifier-list-production-required.test.ts`:
    - `:25` — "`checkImportMalformedSpecifierList` (src/parser/imports.ts:413–433)";
      truth `:430–450`. `f8eb6286` refreshed this cite `:405–425`→`:413–433`
      (its own +8) without chasing the prior +17 — the partial-chase
      artifact.
    - `:26` — "`checkImportDanglingAlias` (:437–451) read." (continuation
      form); truth `:462–476`. `:437` today is inside
      `checkImportMalformedSpecifierList`'s body.
    - `:73` — "'from' clause with a .thetalib path literal",
      src/parser/imports.ts:347–348)"; truth `:372–373` (+25 exact).
    - `:755` — "contract, src/parser/imports.ts:437–451). Group (d) fences
      the STATEMENT"; truth `:452–476`.
    - `:815` — "avoid (`checkImportNameCollisions`, src/parser/imports.ts:515,
      compares"; truth `:597` (correct at `af221903`).
    - `:873` — "`computeThetaLibExports` publishes it
      (src/parser/imports.ts:723–728), so"; truth `:814–819` (correct at
      `af221903`).
  - `tests/import-specifier-separator-production-required.test.ts`:
    - `:27` — "src/parser/imports.ts:413) and its specifier arm reads a
      per-specifier"; truth `:430` (same partial +8 refresh as list `:25`).
    - `:28` — "boolean that a taken alias leaves false
      (`checkImportDanglingAlias`, :437),"; truth `:462` — 0431 R2's named
      instance.
    - `:845` — "(src/parser/imports.ts:328) refuses a name the author
      wrote as a token"; truth `checkImportReservedSynthesisedName` `:353`
      (+25 exact; `:328` correct at `e0873e53`).
    - `:916` — "`checkImportUnknownSymbols` (src/parser/imports.ts:539),
      which refuses"; truth `:564` (+25 exact).
  - `tests/import-export-from-clause-required.test.ts`:
    - `:22` — "stmt.path`) and `computeThetaLibExports`
      (src/parser/imports.ts:614–619),"; truth `:814–819` (`:614` was the
      declaration line at `aef82bde`, the pre-0058-fix layout this 0058
      witness header was drafted against).
    - `:473` — "(src/parser/imports.ts:614–619) unions declarations with
      re-exports and"; truth `:814–819` (the two map arms `:816–817`).
    - `:650 [A]` — assertion message: "a specifier that names no file is
      neither of the two sources src/parser/imports.ts:609–612 admits";
      truth `:809–812` — the `computeThetaLibExports` doc-comment
      contract sentences ("Every top-level declaration is auto-exported …
      a plain import is not re-exported downstream"), which is what
      `:609–612` named at the authoring layout (`aef82bde`) and which
      sits verbatim at `:809–812` today (clean +200). The two `.map`
      publishing arms (`:816–817`) were never at `:609–612` at any commit
      in `git log --follow`. `:609–612` today is the diagnostic-push
      block inside `checkImportNameCollisions` — the wrong-site read
      delivered exactly on a red.
  - `tests/inline-slug-name-reservation.test.ts:348` —
    "(`ImportSpecifier.local`, src/parser/imports.ts:302)"; truth `:536`
    (interface) / `:540` (field); `:302` correct at the rename-era layout.
  - `tests/reexport-chain-resolution.test.ts:79` —
    "(`thetalibLocalBindings`, src/parser/imports.ts:741; …"; truth `:832`
    (`:741` correct at `af221903`).
  - `tests/live/live-production-acceptance.test.ts:2342` — "// (grammar.md:175)
    already consumes." in the sentence "so each consumes the same
    `Type ("|" Type)*` extent the alias right-hand side (grammar.md:175)
    already consumes"; truth `docs/spec_topics/grammar.md:184`
    (`` AliasRhs     ::= Type ("|" Type)* ``); `grammar.md:175` today reads
    "`if` / `for` / `while` inside an arm body without the surrounding
    `{ ... }` block is `theta/parse/statement-in-arm-body`…". File length
    at pin: 14864 lines (the pin the fix must hold).
  - Verified CURRENT (non-instances, protect):
    `tests/b0428-unreadable-thetalib-refused.test.ts:31–32` (`:142`,
    `:147`), `tests/b0431-export-in-theta-refused.test.ts:15` (`:34`), and
    the LPA's other `grammar.md:N` cites (`:2331` `:94`, `:2338`/`:4539`/
    `:12049` `:109`, `:5769`/`:5879` `:20–24`, `:9137` `:26`, `:10442`
    `:90–:95`, `:11724` `:98` — all below the 0389 shift zone, each
    content-checked).
- **Observed at:** v0.437.0 (`401a425b`), offline —
  `grep -rEn "imports\.ts:[0-9]+" tests/ src/` plus continuation-form
  scan of the two 0431-named files; each instance adjudicated by `sed`
  against current `src/parser/imports.ts` content; authoring-era positions
  measured with `git show <commit>:src/parser/imports.ts | grep -n`.

## Summary

`src/parser/imports.ts` has been grown by six fixes since the citing
headers were written (most recently `6619f85d` +17 and `f8eb6286` +8, the
two shifts that moved `checkImportDanglingAlias` from the cited `:437` to
`:462`). Fifteen line-citations into it across six test files now name
positions holding different constructs — including one assertion message
(`import-export-from-clause-required.test.ts:650`) and two cites the 0431
fix "refreshed" by its own +8 while knowingly leaving the pre-fork +17
(its Residual 2 records the debt: "a follow-up citation sweep owes them").
Separately, the one stale spec-grammar cite bug 0421 enumerated but could
not fix — `grammar.md:175`→`:184` in the line-pinned LPA — survives at the
pin exactly as its Residual 1 predicted, with the prescribed remedy (a
same-line 0336-style refresh) waiting for a lane allowed to touch the
file. Every instance was correct at an identified authoring-era layout.
Ten of the sixteen sit outside 0134's pre-existing position-only
do-not-file class on the same footing as 0405/0421 (fixer-named debt,
never-correct numbers, the assertion message, single recent two-commit
shifts); the remaining six are multi-era inherited comment drift, swept
as collateral under the anti-partial-sweep disposition rather than
admitted by the 0134 exclusion axis.

## Reproduction

```
grep -n "export function checkImportDanglingAlias" src/parser/imports.ts   # :462
sed -n '437p' src/parser/imports.ts    # "  if (!hasFromKeyword || !hasPathLiteral) {" — inside checkImportMalformedSpecifierList
grep -n ":437" tests/import-specifier-list-production-required.test.ts tests/import-specifier-separator-production-required.test.ts
# list:26, list:755, sep:28 — all name checkImportDanglingAlias
sed -n '184p;175p' docs/spec_topics/grammar.md
# 184: AliasRhs ::= Type ("|" Type)* ; 175: the statement-in-arm-body prose
sed -n '2342p' tests/live/live-production-acceptance.test.ts   # "(grammar.md:175) already consumes."
git show e0873e53:src/parser/imports.ts | grep -n "checkImportDanglingAlias"  # :437 — correct at the 0211-era layout
```

Every instance in §Affected reproduces the same way: the citing sentence
names content; the cited line holds different content; the named content
sits at the position the shift chain predicts.

## Expected behaviour

0405's §Expected, verbatim applicable: the repo treats maintained test
files' cites as maintained pointers — a cite of `<file>:N` names line N's
current content. 0431 R2 and 0421 R1 both state the owed remedy (the
citation sweep; the one-line LPA refresh).

## Actual behaviour / root cause

The imports.ts headers were pinned at their authoring commits and no
subsequent imports.ts-growing fix swept inbound cites (the 0431 fix
chased only its own +8 on two of them, per the do-not-chase-pre-existing
convention, and recorded the remainder). The LPA cite was enumerated by
0421 but carved out by that lane's no-LPA-edit rule. `imports.ts` is not
on the 0134 converted-file ratchet, so the citation-symbol-form gate has
no cell that could red on any of this.

## Why it matters

Same class and rationale as 0405/0421: a future red in
`import-export-from-clause-required` prints an assertion message steering
its reader to a diagnostic-push block instead of the export-set
definition; the two 0431-refreshed cites now carry numbers that were
never correct at any commit (old base + partial delta), which is worse
than untouched drift because it defeats the reader's "measured at an older
HEAD" heuristic; and the LPA instance is the one remaining member of
0421's fully-enumerated set.

## Non-goals

- Era-pinned `docs/bugs/**` citations (frozen at filing).
- The theta-document.ts continuation cites in the same headers (`:3007`,
  `:3021`, `:3049`, `:3115`, etc.) — different target file, unverified
  here, outside 0431 R2's named set; a separate audit may sweep them.
- Reference-side (`docs/reference/grammar.md`) cite halves (0405/0421
  §Non-goals; e.g. `fn-param-name-reserved-keyword.test.ts:26`'s `:254`).
- Any assertion weakening: every edit is comment/message-string only;
  suite verdicts byte-identical.
- Converting `imports.ts` cites to symbol form is an OPTION (see §Fix),
  not an obligation — the 0134 ratchet is one-way and voluntary.

## Fix

Two options:

1. **Mechanical re-pin (the 0405/0421 shape, recommended):**
   `:413–433`→`:430–450`, `:437–451`→`:462–476`, `:437`→`:462`,
   `:347–348`→`:372–373`, `:515`→`:597`, `:723–728`→`:814–819`,
   `:413`→`:430`, `:328`→`:353`, `:539`→`:564`, `:614–619`→`:814–819`,
   `:609–612`→`:809–812` (the doc-comment contract sentences the message
   quotes — NOT the `.map` arms at `:816–817`), `:302`→`:540` (or `:536`
   for the interface), `:741`→`:832`; plus the LPA one-line `:175`→`:184`
   refresh under the 0336 precedent (authorization route: the report
   itself enumerating the LPA line in §Affected and §Fix, as 0336 did).
   LPA constraints, binding: SAME-LINE replacement only — no line
   insertion, no deletion, no reflow of the comment block across lines
   (the pin is the line count, consumed by name at
   `tests/b0290-re-ask-count-observable.test.ts:20` and
   `tests/live/harness.ts:301`); after the edit,
   `wc -l tests/live/live-production-acceptance.test.ts` must print
   14864 (confirmed 14864 at pin, pre-edit); comment text only — no
   assertion, matcher, or verdict moves; comment byte-count-neutral not
   required — the pin is lines, not bytes. Extend
   `tests/b0421-grammar-cite-sweep-remainder-gate.test.ts` (or add a
   sibling cell) to content-lock the LPA target, and add a
   b0405-pattern content-anchored cell for the imports.ts targets so the
   next imports.ts insertion reds there first.
2. **Enter `src/parser/imports.ts` into the 0134 §Citations ratchet:**
   convert all fifteen to symbol form (every citing sentence already
   names its symbol) and add the file to the converted-file list — larger
   edit, permanent immunity. The LPA instance is a spec-page cite and
   stays line-form either way (§Citations keeps line numbers legitimate
   for spec sentences).

Constraint either way: the two 0431-named files are closed-bug witnesses —
authorization per the 0134 constraint-1 pattern extends to the citation
text alone; verdicts byte-identical.

## Provenance

Seeds 3 and 4 of the doc-truthing-6 brief (0421 §Fix Residual 1, 0431
§Fix Residual 2 — both fixer-named, neither filed). Enumeration:
`grep -rEn "imports\.ts:[0-9]+"` over `tests/` + `src/` (17 hits: 14
prefix-form stale, 3 current) plus continuation-form scan of the two
0431-named files (2 more: list `:26`, sep `:28`); LPA scanned for every
`grammar.md:N` cite (9 others verified current, all below the 0389 shift
zone). Authoring-era verification: `git show` at `2bc69157`, `aef82bde`,
`069c0117`, `af221903`, `e0873e53`, `4fbae356`, `6619f85d`, `f8eb6286`.
Dup check: README index — 0405/0421/0431/0336/0134 all fixed, their
enumerated sets disjoint from this one (0421's §Affected covered
grammar.md cites only; its LPA instance is re-filed here as the carved-out
remainder per its own Follow-on note). Siblings: candidate
doc-truthing-6/01 (enumeration staleness), doc-truthing-6/03
(retired-quote drift) — disjoint.

## Fix (0.444.0)

- What shipped: option 1 (mechanical re-pin), sixteen line-cites refreshed to their re-derived current positions, comment/message-string only, zero assertion/behaviour change.
  - `tests/import-specifier-list-production-required.test.ts` — :25 :413–433→:430–450; :26 :437–451→:462–476; :73 :347–348→:372–373; :755 :437–451→:452–476 (the doc-comment "contract" span 452–461 + function 462–476, per §Affected); :815 :515→:597; :873 :723–728→:814–819.
  - `tests/import-specifier-separator-production-required.test.ts` — :27 :413→:430; :28 :437→:462; :845 :328→:353; :916 :539→:564.
  - `tests/import-export-from-clause-required.test.ts` — :22 & :473 :614–619→:814–819; :650 (assertion MESSAGE string) :609–612→:809–812 (the doc-comment contract sentences, not the `.map` publishing arms).
  - `tests/inline-slug-name-reservation.test.ts:348` — :302→:540 (the `.local` field).
  - `tests/reexport-chain-resolution.test.ts:79` — :741→:832.
  - `tests/live/live-production-acceptance.test.ts:2342` — the pre-ratified one-line, same-line LPA refresh `(grammar.md:175)`→`(grammar.md:184)` under the 0336 precedent; file held at 14864 lines.
- Witness: `tests/b0456-imports-cite-content-anchor-gate.test.ts` (new) — content-anchored (b0405/b0421 shape): reads imports.ts at each cited line and asserts it holds the named construct (RED at fork on the stale numbers, GREEN after); freshness cells assert the stale tokens are gone; the LPA cell is read-only.
- Gates: witness → 20/20; six edited test files → 211/211; `tests/citation-symbol-form-gate.test.ts` → green; `wc -l` LPA == 14864; `npx tsc --noEmit` clean; `npm run lint` clean; full default suite green (flakes green isolated).
- Review: 1 round. R1 (bug-fix-reviewer) — CLEAN (all 16 re-pins verified by symbol; LPA one-line same-line, en-dash preserved, from:650 digits-only). Round 3 (bug-fix-reviewer-fast, shared) confirmed the citation-ratchet remediation — CLEAN.
- Verification: SOLID (bug-fix-verifier) — witness reverts→red→restores→green (sep:28 :462↔:437); LPA 14864 with exactly one changed line; full default suite green isolated; typecheck + lint clean.
- Residuals: none. Bounded citation-only decision recorded: list:755's truth is :452–476 per §Affected (the citing "contract" word points at the doc-comment 452–461 plus the function 462–476), not the §Fix compressed list's :462–476.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: the six multi-era comment-drift cites swept as collateral (§Sev admission); the theta-document.ts continuation cites and the reference-side grammar cites left (§Non-goals, separate audits); imports.ts NOT entered into the 0134 §Citations ratchet (option 2 declined).
