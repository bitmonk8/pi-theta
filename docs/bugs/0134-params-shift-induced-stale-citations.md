# Bug 0134 — Bug 0102's fix grew `src/parser/params.ts` by 18 lines from `:266` onward, and three `path:line` citations into that file still name the pre-shift positions: two sit inside witnesses bugs 0053 and 0096 own, so no in-scope edit could reach them and the 0102 orchestrator reverted its implementer's partial correction rather than ship half a sweep — an exhaustive audit of every `params.ts` citation in `src/**` and `tests/**` then finds 17 of 19 wrong, which moves the open question from three lines to the convention

- **Status:** fixed (0.198.0). Route (c)-narrow + (d)-tractable, recorded in
  §Fix (0.198.0) below; constraint 1's authorization is widened there to every
  citation the route reaches in the two protected witnesses. This report also
  carries the pre-authorization a corrective edit needs — the two witness files
  are otherwise protected surfaces, and that protection is exactly what left the
  three citations stale.
- **Sev/Diff estimate:** S4/D1 — documentation accuracy only: the cited
  *substance* is right at all three sites (correct file, correct function,
  correct predicate) and no runtime behaviour, diagnostic or test outcome
  depends on the numbers, so the ceiling is a reader following a citation to the
  wrong construct. D1 because the narrowest route is three comment lines in
  three files with no executable byte moved; the wider routes are larger, but
  the report does not oblige them.
- **Kind:** documentation defect in source and test comments. No spec sentence
  is violated. The applicable in-tree rule is `docs/STYLE.md:26` §Claims —
  "Every claim is testable or is removed" — and a `path:line` that resolves to
  a different construct is a claim that fails its own test.
- **Related:**
  - [0102](./0102-params-default-string-literal-raw-newline-admitted.md) —
    **fixed (0.75.0)**, commit `196e3082`, the shift's origin and this report's
    origin. Its residual 1 (`:880–895`) names all three sites and dispositions
    them "**For the parent to file.**"
  - [0053](./0053-annotation-root-brace-union-read-as-one-field-list.md) —
    **fixed (0.58.0)**. Owns
    `tests/annotation-root-brace-union-lowering.test.ts`, which holds site (b).
  - [0096](./0096-discriminator-field-classifier-naive-brace-test.md) —
    **fixed (0.73.0)**. Owns
    `tests/discriminator-field-classifier-brace-group.test.ts`, which holds
    site (c).
  - [0097](./0097-params-brace-union-rhs-one-field-list.md) — **open**, and its
    §Affected carries the same drift: `:109` cites the `lowerParamsFieldType`
    frame as `src/parser/params.ts:761–770` (true `:779–788`) and `:44`, `:153`,
    `:201` cite the brace check as `:766` (true `:784`). Bug-doc citations are
    out of this report's census scope (see §Non-goals), but 0097 is the one
    consumer that will be read as a work order rather than as a record.
- **Affected** (every citation below re-verified at HEAD `1451eb79`, 0.75.0):
  - `src/parser/params.ts:779–788` — `lowerParamsFieldType`. Its naive brace
    check `if (!(s.startsWith("{") && s.endsWith("}")))` is at **`:784`**.
    `:766` is a line of the same function's doc comment ("brace-rooted inline
    object type (`{a: Triage, b: integer}`) before it can").
  - `src/parser/params.ts:950–958` — `splitTopLevel`, declared at **`:950`**.
    `:932` is a bare `continue;` inside `splitTopLevelSegments` (`:892`), the
    function `splitTopLevel` filters.
  - `src/parser/params.ts:253–283` — the per-field default loop bug 0102 grew:
    the refusal at `:268`, `checkLiteralSublanguage` at `:278`. This is the
    inserted region; everything below `:266` moved by +18.
  - `src/parser/body-type-lowering.ts:204` — **site (a)**. Inside
    `isSingleEnclosingBraceGroup`'s doc comment (`:208` is the declaration):
    "`lowerParamsFieldType`'s own brace check (params.ts:766) is the one
    remaining copy of the naive form". **`:766` → `:784`.**
  - `tests/annotation-root-brace-union-lowering.test.ts:784` — **site (b)**,
    inside `CONTROL (a6)` (`:782–786`): "Bug 0053 §Non-goals freezes
    `lowerParamsFieldType`'s test (src/parser/params.ts:766)". **`:766` →
    `:784`.** Bug 0053's witness.
  - `tests/discriminator-field-classifier-brace-group.test.ts:70` — **site
    (c)**, inside the header's composition note (`:66–71`): the classifier stays
    module-private, so its columns are composed from "`isSingleEnclosingBraceGroup`
    and `splitTopLevel` (`src/parser/params.ts:932`)". **`:932` → `:950`.**
    Bug 0096's witness.
  - `docs/bugs/0102-…-admitted.md:880–895` — residual 1, the shipped record of
    the deliberate revert.
  - `docs/STYLE.md:26` §Claims (the testability rule), `:49` §Structure and
    cross-linking (which prescribes linking into the Reference and says nothing
    about source citations). **Neither `docs/STYLE.md` nor `AGENTS.md` states a
    citation-form rule at all** — measured, both files searched for
    `cite` / `citation` / `line number` / `path:line` / `symbol`, zero hits.
  - `AGENTS.md:60–64` §No silent skipping — the constraint any proposed gate
    inherits.
  - `tests/ctor-field-type-check.test.ts:60–61` and
    `tests/typeenv-prototype-names.test.ts:93` — the only in-tree hedge against
    this failure mode: "Spec anchors (line numbers measured at this HEAD; where
    the bug doc's own citation has drifted, both are given)" and "SPEC ANCHORS
    (line numbers measured at this HEAD)". Two headers out of the whole suite.
  - **Test coverage: none.** No gate in the tree reads a `path:line` citation.
- **Observed at:** `0.75.0` (HEAD `1451eb79`). Offline, deterministic, no
  provider. Measured with `rg` and `Read` over the working tree, plus one
  scratch Node script for the census (written outside the repo, run, deleted).

## Summary

Commit `196e3082` (bug 0102's fix, v0.75.0) inserted 18 lines into
`parseParams`'s per-field default loop in `src/parser/params.ts`. Every line
from old `:266` onward moved down by 18. Three comments in `src/**` and
`tests/**` cite positions in that file and were not updated, so each now names a
line that holds a different construct.

The 0102 fix knew this. Its implementer had already corrected sites (a) and (b);
the orchestrator reverted both. The shipped record states why
(`docs/bugs/0102-…-admitted.md:891–893`):

> The implementer had corrected (a) and (b); the orchestrator reverted both,
> because (c) cannot be corrected under the fence and a partial sweep is worse
> than a documented one.

Site (c) lives in bug 0096's witness, which 0102's scope fence put out of reach.
So the choice was two corrections and one silent survivor, or three documented
survivors and this report. The report is the second half of that choice.

These three are fileable where ordinary citation drift is not. The repository
carries an adjudicated do-not-file class for **pre-existing, corpus-wide,
position-only** drift with substance intact — the class bug 0077's fix record
names ("the adjudicated pre-existing-stale-citation (position-only, substance
intact) do-not-file class") and bug 0102's own §Where the bug document turned
out to be wrong invokes for the drift it found in its own doc. These three are
outside it on one axis: they are **shift-induced by a single identified commit**,
newly created at `196e3082` rather than inherited, and the commit that created
them is recorded.

Correcting three lines is the small answer. The census below is the reason to
ask a larger question first: over `src/**` and `tests/**`, 305 `path:line`
citations exist, and in the one file audited exhaustively — `src/parser/params.ts`,
the churning one — 17 of 19 are already wrong, only 3 of them from this shift.
The practice is producing more stale claims than it retires.

## Reproduction

At HEAD `1451eb79`. Each row: the citing site, the text it asserts, the position
it names, and the position that holds the construct.

```
@@ src/parser/body-type-lowering.ts:204                                  [site a]
   "`lowerParamsFieldType`'s own brace check (params.ts:766)"
   cited  params.ts:766 :: " * brace-rooted inline object type (`{a: Triage, …"
   true   params.ts:784 :: "  if (!(s.startsWith(\"{\") && s.endsWith(\"}\"))) {"

@@ tests/annotation-root-brace-union-lowering.test.ts:784                [site b]
   "Bug 0053 §Non-goals freezes `lowerParamsFieldType`'s test
    (src/parser/params.ts:766)"
   cited  params.ts:766 :: (same doc-comment line)
   true   params.ts:784

@@ tests/discriminator-field-classifier-brace-group.test.ts:70           [site c]
   "`isSingleEnclosingBraceGroup` and `splitTopLevel`
    (`src/parser/params.ts:932`)"
   cited  params.ts:932 :: "      continue;"        (inside splitTopLevelSegments)
   true   params.ts:950 :: "export function splitTopLevel("
```

Both deltas are +18, matching the insertion. `:766` still lands inside the same
function's doc comment; `:932` lands inside a different function.

### The census — how much of the surrounding practice is already wrong

Population, mechanical and exact: every match of
`[A-Za-z0-9_./-]+\.ts:[0-9]+` in every `.ts` file under `src/` and `tests/`.

```
@@ population
   total occurrences        :: 305
   from src/**              ::   6
   from tests/**            :: 299
   distinct cited files     ::  57
   naming a nonexistent file::   0
   naming a line past EOF   ::   0
```

No citation is detectable as broken by file existence or line range alone.

Subset 1 — **every citation targeting `src/parser/params.ts`**, all 19,
adjudicated by hand against the construct each names:

```
@@ params.ts citations (1 in src/**, 18 in tests/**)
   correct :: 2   tests/binder-param-line-newline-normalisation.test.ts:138
                    (:253–283, :278, :268 — all exact; re-derived by 0102's fix)
                  tests/binder-param-line-newline-normalisation.test.ts:800 (:278)
   wrong   :: 17  of which shift-induced by 196e3082 :: 3
                  of which predating it              :: 14
```

The 14 inherited errors are not small. Examples, cited → true:
`tests/params-inline-object-lowering.test.ts:32` names `lowerTypeExpr` at
`:291–341`; it is at `:490`. `tests/union-generic-arm-lowering.test.ts:18` names
its generic test at `:391`; it is at `:519–520`.
`tests/inline-slug-name-reservation.test.ts:726` names `hoistNestedDefs` at
`:274–295`; it is at `:332`. `tests/inline-slug-name-reservation.test.ts:925`
names `defs[s] = resolved` at `:433`; it is at `:599`.
`tests/params-block-mapping-rhs-refusal.test.ts:553` names `lowerTypeExpr`'s
trailing catch-all at `:469`; it is at `:604`.

Subset 2 — **every citation originating in `src/**`**, all 6:

```
@@ src/** citations
   correct :: 4   binder-system-prompt.ts:205 → literal-sublanguage.ts:136–150
                  theta-document.ts:5613      → frontmatter.ts:219–234
                  theta-document.ts:5704      → lexical-environment.ts:291–296
                  theta-document.ts:5946      → body-type-lowering.ts:208
   wrong   :: 2   body-type-lowering.ts:204   → params.ts:766      [site a]
                  params.ts:543               → lexer.ts:665
                    (names the keyword/ident tagging; it is at lexer.ts:677)
```

The two subsets overlap in site (a), so 24 distinct citations were audited by
hand: **18 wrong, 6 correct**. `src/**` is near-clean; the rot is concentrated in
test-file headers, which carry 299 of the 305.

Whole-population estimate, by one stated predicate: flag a citation when no
identifier drawn from the citing comment's ±3-line window occurs within the
cited span ±6 lines but does occur elsewhere in the target file.

```
@@ 305 citations, heuristic predicate
   flagged (drifted)  :: 123
   identifier present :: 109
   indeterminate      ::  73
```

Calibrated against subset 1: the predicate flagged 8 of the 19, **all 8 truly
wrong** (no false positive), and missed 9 of the 17 real errors. Recall ≈ 0.47,
precision 1.00 on that subset. **123 is a floor, not an estimate.**

## Expected behaviour

`docs/STYLE.md:26` requires every claim to be testable. A comment asserting that
a named construct is at `<file>:<line>` is a claim, and it is testable by
reading that line. At all three sites the claim is currently false while the
sentence around it is true.

A fix that lands after a shifting commit leaves the corpus consistent with the
tree it ships. Bug 0102's fix left it inconsistent knowingly, having weighed a
partial sweep against a documented one, and recorded the debt for a later pass —
this one.

Nothing in the tree states which citation *form* the corpus should use.
`docs/STYLE.md` and `AGENTS.md` are both silent, measured. Two test headers
hedge in prose ("line numbers measured at this HEAD"), which acknowledges the
failure mode without preventing it. So the expectation "cite symbols, not lines"
is not currently an in-tree rule, and any route that relies on it has to
establish it first.

## Actual behaviour / root cause

**One insertion, three unreachable corrections.** `196e3082` added the raw-newline
refusal at `src/parser/params.ts:268` and shifted the rest of the file. The
three citing comments live in three files, none of which the 0102 fix owned:
`src/parser/body-type-lowering.ts` (untouched by that diff),
`tests/annotation-root-brace-union-lowering.test.ts` (bug 0053's witness) and
`tests/discriminator-field-classifier-brace-group.test.ts` (bug 0096's witness).
The scope fence that keeps a fix from editing another report's witness is what
made (c) uncorrectable, and the all-or-nothing judgement then reverted (a) and
(b) too.

**No mechanism observes the breakage.** A citation is comment text. Nothing
parses it, no test reads it, `tsc` and `eslint` do not see it, and the census
confirms the only currently detectable class — nonexistent file, line past EOF —
is empty at 0/305. A stale citation therefore has no failure signal at all; it
is discovered when a reader follows it, which is why the 14 inherited errors in
one file accumulated undetected.

**Line-numbered citations into churning files decay monotonically.** Every fix
that inserts a line above a cited position invalidates that citation, and the
rate scales with how often the target file is edited. `src/parser/params.ts` is
cited by 30 bug documents and has been edited repeatedly across this run; 17 of
the 19 citations into it are wrong. `src/**`-originating
citations, which are fewer and point at more stable targets, are 4 of 6 right.
The distribution matches the mechanism.

**Substance survives, position does not.** At every one of the 18 hand-confirmed
errors the named function, predicate or constant exists and is the right one.
The citations are wrong only about *where*. That is what makes the class S4, and
also what makes a symbol-based form viable: the information a reader needs is
already in the sentence.

## Why it matters

- **Two of the three sites are load-bearing to other reports.** Site (b) is the
  `CONTROL (a6)` cell that pins bug 0053's §Non-goals freeze on the `params:`
  position; site (c) is the note explaining why bug 0096's witness composes the
  module-private classifier out of two exported units. A reader checking either
  claim follows the number and lands on a doc-comment line or a `continue;`.
- **An open report reads the same stale numbers.** Bug 0097's §Fix touches
  `lowerParamsFieldType` and its §Affected locates it at `:761–770` and `:766`.
  It is at `:779–788` and `:784`.
- **The debt was accepted on the record and assigned.** Bug 0102's residual 1
  ends "**For the parent to file.**" Leaving it unfiled discards the one thing
  the deliberate revert bought: a complete, attributable list.
- **The measured error rate makes point corrections poor value.** Fixing three
  citations leaves 14 wrong in the same file and at least 120 wrong across the
  suite, all of them indistinguishable to a reader from the corrected three.
- **The failure mode is silent and recurring.** This run alone has watched these
  numbers rot across 0053 → 0096 → 0102, each fix documenting the drift the
  previous one caused. Nothing in the tree stops the next one.

## Non-goals

- **Bug-doc citations.** `docs/bugs/**` holds 241 `params.ts:<line>` occurrences.
  A bug document is a dated record of one HEAD and says so; its drift is the
  adjudicated do-not-file class, and bug 0102 re-derived its own doc's citations
  without filing. The one exception flagged above (0097, open) is a pointer, not
  a scope claim.
- **The 14 inherited `params.ts` errors, as defects.** They are measured here as
  evidence for the convention question. Whether they get corrected is a
  consequence of the route chosen in §Fix, not a separate report.
- **Any change to what the three comments assert.** The sentences are true. Only
  the numbers move.
- **`src/parser/params.ts` itself.** No production line is at issue; the file is
  the citation target, not the defect site.

## Fix

**Not settled.** Four routes, with their consequences. The choice turns on the
census, not on the three sites.

**(a) Correct the three.** Three comment lines, three files: `:766` → `:784`
twice, `:932` → `:950` once. Discharges 0102's residual exactly as written.
Leaves the 14 inherited errors in the same file and the ≥120 elsewhere, and
leaves the mechanism intact, so the next insertion into `params.ts` re-creates
the class.

**(b) Sweep and correct all.** Re-derive every one of the 305 citations and fix
each wrong one. Costs a full hand adjudication — the heuristic's recall of 0.47
means it cannot drive the sweep, only triage it — and buys a corpus that is
correct at exactly one commit. Without (d) the decay resumes immediately.

**(c) Convert citations to symbol references.** Replace `<file>:<line>` with
`<file>` plus the symbol name (`params.ts` `lowerParamsFieldType`), which every
one of the 18 confirmed-wrong citations already names in the surrounding prose.
Position-independent, so insertions above the target cost nothing. Two costs: it
is the largest edit of the four, and it needs the rule written down first —
measured above, neither `docs/STYLE.md` nor `AGENTS.md` states any citation-form
rule, so "cite symbols, not lines" would be established by this change rather
than applied by it. A narrower variant keeps line numbers only for spec pages
and prose files, where the target is a sentence with no symbol to name.

**(d) Add a gate.** A check that fails when a cited line does not contain the
cited symbol. It is the only route that prevents recurrence, and the only one
that gives the class a failure signal. It also has to solve the problem the
heuristic above did not: extracting the intended symbol from free prose is
lossy in both directions, so a naive gate either misses half the errors or reds
on correct citations. A tractable variant gates only citations written in a
declared machine-readable form and leaves free-prose ones unchecked — which
makes (d) depend on (c).

Routes compose: (a) is a prefix of (b); (d) presupposes (c) for anything beyond
a spot check.

**Constraints on any route.**

1. **Sites (b) and (c) need this report's authorization to be edited, and this
   report grants it for the citation text alone.**
   `tests/annotation-root-brace-union-lowering.test.ts` is bug 0053's witness and
   `tests/discriminator-field-classifier-brace-group.test.ts` is bug 0096's;
   both are protected surfaces that an unrelated fix may not touch. That fence is
   precisely why 0102 reverted its own correct edits. A later fix citing this
   report may change the `path:line` text at
   `annotation-root-brace-union-lowering.test.ts:784` and
   `discriminator-field-classifier-brace-group.test.ts:70` — and nothing else in
   either file. Without this clause the routes above are unexecutable and the
   report is cosmetic.
2. **Comment-only.** No assertion, no expected value, no test name, no executable
   line changes in any file any route touches. Verified by gate-diff: every hunk
   is comment or string-literal prose. The suite result must be identical before
   and after — 267 files / 3949 tests at the 0102 baseline.
3. **A gate, if proposed, is offline, deterministic and provider-free**, and
   **fails loudly** naming the offending citation rather than skipping it
   (`AGENTS.md:60–64`). A gate that silently passes when it cannot resolve a
   symbol reproduces the current state with extra machinery.
4. **Re-derive at the landing commit, not at this one.** Every number in this
   report is measured at `1451eb79`. Any fix that lands behind another commit
   touching `src/parser/params.ts` re-derives its own targets first; the
   correction values `:784` and `:950` are HEAD-relative facts, not constants.
5. **Whichever route lands, record the census result**, so a later run does not
   re-derive 305 citations to reach the same 18-of-24 figure.

## Fix (0.198.0)

**The settled convention** (quotable; `docs/STYLE.md` §Citations is the
normative home, `tests/citation-symbol-form-gate.test.ts` the enforcement):

> A citation into a TypeScript construct names the file and the symbol, never a
> line. The enforced scope is `src/**`, `tests/**`, the spec pages and
> `docs/reference/**`. A line number stays legitimate only where the target has
> no symbol to name — a spec sentence, a reference page, a fixture row — and is
> then a claim about the HEAD that measured it. The gate holds a converted-file
> list that is a ratchet: a file enters it when its citing sites have been swept
> and never leaves. `docs/bugs/**` is outside the gate in both directions,
> because a bug document is a dated record of one HEAD.

- What shipped:
  - `docs/STYLE.md` — new §Citations: the convention above, the enforced scope,
    the continuation-attribution rule, and what the gate does not enforce. Route
    (c) required the rule to be written down before it could be applied; this is
    that record.
  - `tests/citation-symbol-form-gate.test.ts` (new) — the route-(d) gate.
    Offline, deterministic, provider-free. Three cells: line-form refusal
    (adjacent and bare-`:NNN` continuation spellings, both quote variants),
    symbol resolution (every citation of a converted file names a symbol that
    file declares or carries), and a pinned count of continuations the
    attribution rule cannot attribute to any file. Each cell names every
    offender; none skips.
  - Converted-file list v1 — `src/parser/params.ts`,
    `src/discovery/discovery-walk.ts`, `src/runtime/err-note-render.ts`.
  - 41 test files — 156 full-form `path:line` citations and 54 bare-`:NNN`
    continuations into those three files rewritten to name the symbol.
  - `src/parser/params.ts` — one comment-only hunk: `topLevelColon`'s doc
    comment dropped a stale `:1880–1882` reference to `splitTopLevelSegments`
    (declared at `:1918`). Five ` *` lines, line count unchanged, no executable
    line. The rest of `src/**` is byte-identical to `c79568be`.
- Re-derived census at the landing commit (§Fix constraint 4; the report's
  figures were measured at `1451eb79` and every one had decayed):
  `[A-Za-z0-9_./-]+\.ts:[0-9]+` over `src/**` and `tests/**` yields **1793**
  citations (was 305) across 191 targets; **110** name `src/parser/params.ts`
  (was 19), which is now 1985 lines. `src/**` had already converted itself to
  symbol form by hand — site (a) included — which is why the convention codifies
  existing `src/**` practice rather than imposing a new one.
- Gates: witness RED before / GREEN after, twice by independent means (a stale
  citation reintroduced into a swept file under a backup-and-hash protocol —
  `tests/binder-param-line-newline-normalisation.test.ts:144 -> src/parser/params.ts:268`,
  restored hash `2318113…` matching; and an untracked probe carrying both
  spellings). `npm test` 387 files / 8008 tests (baseline 386 / 8005 plus the
  gate's 3). `npm run typecheck` clean. `npm run lint` clean.
  `tests/registry-closed-set-corpus-gate.test.ts` green with
  `tests/fixtures/diag2/asserted-code-not-in-registry-baseline.json` byte-
  unchanged (`2458d660…`). `tests/committed-fixture-parse-gate.test.ts` green.
- Review: 4 rounds. R1 (three partitions, per-directory) — two invented symbols
  that named the wrong construct, 47 surviving bare-`:NNN` continuations, three
  gate holes (backtick exemption, unreachable REQ-ID token, no continuation
  rule). R2 — invented symbols and continuations discharged; the widened
  attribution still hid 24 continuations and could be intercepted by a prose
  path. R3 — attribution replaced (paragraph → block → string run, antecedent
  ranking); found one live stale citation (`globMatches`, `:602`) hiding in an
  unattributable channel of 417 sites, plus a paragraph-pass contradiction of
  the gate's own documented rule. R4 — CLEAN: symbol-anchored attribution rank
  added (200 candidate reds narrowed to 2 by requiring module-scope anchors
  unique to one converted file, both dispositioned), antecedent ranking applied
  at every scope, the residual channel counted and pinned at 415, the STYLE
  claim rescoped to what the gate enforces.
- Verification: SHIP. Witness reds for the right reason and greens after
  (both directions, two means); default suite green; no live run owed because
  `src/**` carries one comment-only hunk with zero executable-line changes (the
  0193/0205 precedent, premise verified mechanically: `git diff --numstat -- src/`
  is `5 5 src/parser/params.ts`, and every changed `src/` line is ` *`-prefixed);
  lint and typecheck clean. Zero assertion changes proved mechanically: no
  `it(`/`describe(`/`test(` line and no `expect(`/matcher line changed anywhere
  in the diff.
- Per-directory hunk classification: `src/` — 1 doc-comment hunk, 0 executable
  lines. `tests/` — comment and doc-comment hunks, plus assertion-MESSAGE
  strings only (the second argument to `expect`, and `why` table columns
  consumed inside such messages); no asserted value, no matcher, no test name.
  `docs/` — §Citations prose, insert-only.
- Swept sites (rider (b)'s first list): all 110 `params.ts` citations, all 30
  `discovery-walk.ts` citations and all 16 `err-note-render.ts` citations in
  `src/**`/`tests/**` (156 full-form) plus 54 continuations; the disclosed drift
  clusters this covers are 0102/0097/0134's `params.ts` set, 0177's
  `err-note-render.ts` set (including the three `SNK-i`-anchored
  live-acceptance citations) and 0075/0078's `discovery-walk.ts` set.
- Deliberately left (rider (b)'s second list), each with its reason:
  1. `docs/bugs/**` — outside the convention in both directions (§Non-goals).
     15 open reports cite the three converted files by line: 0184 (19), 0054
     (16), 0238 (13), 0239 (11), 0061 (11), 0236 (9), 0197 (8), 0192 (6), 0162
     (6), 0088 (6), 0098 (4), 0143 (3), 0094 (2), 0092 (2), and this report (20).
     No append-notes were written: the convention publishes the resolution rule
     once, in §Citations, rather than 15 times in dated records.
  2. `docs/reference/type-system.md` and the other prose targets — 256 line-form
     citations from `tests/**`. A markdown target needs a heading-anchor form and
     an anchor-stability rule of its own; that is the ratchet's next step, not
     this pass. The 0144 / 0155 / 0195-era `type-system.md` drift stays
     disclosed-not-chased.
  3. 0153's note that the `enum { Ok, … }` fixtures in 0079 / 0114 / 0118 /
     0196 §Reproduction no longer load — a fixture-semantics disclosure, not a
     `path:line` citation, and the convention does not reach it. Historical
     reproductions are not rewritten (§Non-goals).
  4. Every other citation target in the corpus — 1793 citations over 191 targets
     minus the 156 swept. Route (b) (sweep all) was declined as unbounded: it
     buys a corpus correct at one commit, and the ratchet plus the gate is what
     makes the next sweep cheap.
  5. Substance drift in fixed-bug witnesses — sentences whose *claim* has aged
     (e.g. a witness describing a naive dispatch that a later fix replaced).
     §Non-goals: only the numbers move.
- Residuals:
  1. **415 continuations the gate attributes to no file.** Visible, not silent:
     the count is asserted and reds when it rises, and the failure message states
     the remedy — name the file beside the number, or name the symbol, rather
     than raising the pin. Every one was hand-checked as a spec-page or
     sibling-file anchor; the one converted-file instance the channel hid
     (`globMatches`, `:602`) was swept in review round 4. The pin is an upper
     bound with zero slack today; `toBe` would force each movement to be an
     acknowledged update, and is a one-token strengthening a later pass can take.
  2. **Two continuation shapes red only through that channel**: a run naming
     distinctive anchors of two converted files (ambiguous attribution) and a
     past-EOF number. Past-EOF is provably stale regardless of attribution and
     could red unconditionally — a later ratchet step.
  3. **Cell 2's window resolution can be satisfied by a coincidental
     English-word identifier** (a converted file declaring `quote` or `line`
     resolves prose using that word). It weakens precision, not the line-form
     refusal, which is the cell that carries this bug's class.
  4. **`docs/STYLE.md` §Citations bullet 3 compresses two site kinds** —
     paragraph → block applies to prose sites, while a code site's run is its
     concatenated string. The writer-facing rule (name the file beside the number
     when the antecedent is ambiguous) is exact; the ordering sentence is
     imprecise.
- Discharge notes appended: none. The 15 open reports citing the converted files
  are listed above rather than annotated — a dated record is not rewritten, and
  §Citations publishes the resolution rule once.
- Pinned dispositions / non-goals: route (a) (correct the three) is subsumed —
  all three original sites are gone, two of them retired by intervening fixes
  before this pass and re-derived here per constraint 4. Route (b) (sweep all
  1793) is declined as unbounded; the ratchet replaces it. `src/parser/params.ts`
  as a production surface stays out of scope: no executable line moved. Bug-doc
  citations stay out of scope in both directions.

## Provenance

- Origin: `.pi/tmp/fixes/0102-report.md` §Residuals item 1 — "Three citations
  into `src/parser/params.ts` are shifted and left stale … The implementer had
  corrected (a) and (b); **I reverted both**, because (c) cannot be corrected
  under the scope fence and a partial sweep is worse than a fully documented
  one. All three are *shift-induced*, not pre-existing drift, so they are
  outside the do-not-file class. **Fileable.**" The same disposition is shipped
  in-tree at `docs/bugs/0102-…-admitted.md:880–895`. This report adds what the
  residual does not: re-verification of all three deltas at HEAD, the exhaustive
  19-citation audit of `params.ts` and the exhaustive 6-citation audit of
  `src/**`, the 305-citation population, the calibrated whole-population floor,
  the measured absence of any in-tree citation-form rule, the four routes, and
  the authorization clause the two protected witnesses require.
- The do-not-file class this report is excluded from: `.pi/tmp/fixes/0077-report.md`
  ("the adjudicated pre-existing-stale-citation (position-only, substance
  intact) do-not-file class"), invoked again by `.pi/tmp/fixes/0096-report.md`
  and by bug 0102's own re-derivation of its doc's citations.
- Style rule: `docs/STYLE.md:26` §Claims. Gate constraint: `AGENTS.md:60–64`
  §No silent skipping.
- Implementation evidence at HEAD `1451eb79`: `src/parser/params.ts:253–283`
  (the loop `196e3082` grew, refusal at `:268`, `checkLiteralSublanguage` at
  `:278`), `:766` (the doc-comment line the stale citations name), `:779–788`
  (`lowerParamsFieldType`, brace check at `:784`), `:892` (`splitTopLevelSegments`,
  `:932` its `continue;`), `:950–958` (`splitTopLevel`);
  `src/parser/body-type-lowering.ts:204` (site a), `:208`
  (`isSingleEnclosingBraceGroup`);
  `tests/annotation-root-brace-union-lowering.test.ts:782–786` (site b,
  `CONTROL (a6)`);
  `tests/discriminator-field-classifier-brace-group.test.ts:66–71` (site c);
  `tests/ctor-field-type-check.test.ts:60–61` and
  `tests/typeenv-prototype-names.test.ts:93` (the two hedged headers).
- Census method: `rg` over every `.ts` file under `src/` and `tests/` for
  `[A-Za-z0-9_./-]+\.ts:[0-9]+`; one scratch Node script for target resolution
  and the identifier predicate, written outside the repository, run, deleted.
  The 24-citation audit and all three corrections were done by hand with `Read`.
  The population figure undercounts: a citation continued as a bare `:NNN`
  (as at `tests/inline-slug-name-reservation.test.ts:65`) is not matched by the
  pattern.
