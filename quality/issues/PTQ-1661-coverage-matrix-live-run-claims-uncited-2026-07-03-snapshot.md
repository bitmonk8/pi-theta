---
id: PTQ-1661
title: coverage-matrix runtime-validation column claims "all 8 invocable docs/examples/*.theta run to success live" and "5/5 tutorial steps runtime-validated (live)" with no citable run record, over a corpus that has since grown from 8 to 21 .theta files
lens: D10
status: open
verdict: confirmed
locations:
  - docs/reference/coverage-matrix.md:16-17
  - docs/reference/coverage-matrix.md:20-22
  - tests/committed-fixture-parse-gate.test.ts:1-16
  - tests/committed-fixture-parse-gate.test.ts:125-139
  - docs/examples/
  - docs/tutorial.md:55-296
sites: 2
fix_scope: localized
d10_class: memory-evidence
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# coverage-matrix runtime-validation column claims "all 8 invocable docs/examples/*.theta run to success live" and "5/5 tutorial steps runtime-validated (live)" with no citable run record, over a corpus that has since grown from 8 to 21 .theta files

## Observation
The "Doc-set status" table in `docs/reference/coverage-matrix.md` has a "Runtime-validation posture" column. It says the tutorial's five steps are "runtime-validated (live)" and that "all 8 invocable examples run to success live". The paragraph below the table restates this as "All 8 invocable `docs/examples/*.theta` run to a success terminal outcome live". None of these claims cites a witness test, session or log path, wave id, or date. No test in `tests/` or `tests/live/` drives a `docs/examples` theta or a tutorial step against a live host. The default-suite gate that does read `docs/examples` only parses the files. Git history shows the text was written in ace47cfa (2026-07-03) about `docs/examples/*.loom`, a 9-file corpus with 8 invocable files. The glob was later rewritten to `*.theta` by the corpus rename 2bc69157 (2026-07-19). The glob now matches 21 `.theta` files, 13 of which were added after that run. `docs/tutorial.md` has changed in 6 commits since the claim was made.

## Evidence
Claim side, `docs/reference/coverage-matrix.md:16-17` (verbatim, re-read before filing):
```
| Tutorial | `docs/tutorial.md` | tutorial | drafted | 5/5 steps runtime-validated (live); subagent final values not observable on `pi -p` stdout by design (private transcript) |
| How-to (7) | `docs/how-to/*.md` | how-to | drafted | backed by 9 `docs/examples/`; parse all-pass; all 8 invocable examples run to success live |
```
`docs/reference/coverage-matrix.md:20-22`:
```
All 8 invocable `docs/examples/*.theta` run to a success terminal outcome live
(provider `unity-messages`/`claude-haiku-4-5`); parse gate 22/22 green. During
drafting, live validation exposed four production defects, since fixed:
```

Where the claim came from (git, run this session):
- `git log -S "all 8 invocable" -- docs/reference/coverage-matrix.md` → 1 commit: ace47cfa 2026-07-03 "docs(loom): reconcile tutorial + coverage matrix to fixed runtime". Its message says "All 8 examples run to success live … tutorial rewritten (5/5 steps validated)". The diff adds `All 8 invocable \`docs/examples/*.loom\` run to a success terminal outcome live`.
- `git ls-tree --name-only ace47cfa docs/examples/ | wc -l` → 9 (8 `.loom` + `personas.warp`).
- `git log -S 'docs/examples/*.theta' -- docs/reference/coverage-matrix.md` → 2bc69157 2026-07-19 "Rename Loom -> Theta across the corpus". This commit changed the glob and left the count and the claim unchanged.

The corpus the claim covers today:
- `ls docs/examples/*.theta | wc -l` → 21. `git log --diff-filter=A` per file shows 13 of them were added after the 8 files carried over from the loom era: compact-loop (6a252aa6, 2026-09-16), fan-out-reviews and review-lens (5fff41de, 2026-07-20), ralph-inline and refine-inline (ae7cc662, 2026-07-21), subagent-extension-tool (fda23a4b, 2026-07-24), summarise-doc and typed-params-across-boundary (4866d4d2, 2026-07-24), prompt-extension-tool (b8d4fd2c, 2026-07-25), and ralph, ralph-step, refine and reviewer (first tracked under `.theta` at 2bc69157; absent at ace47cfa).
- `ls docs/how-to/*.md | grep -v README | wc -l` → 16, against the row label "How-to (7)". `git ls-tree --name-only ace47cfa docs/how-to/ | wc -l` → 7.
- `git log --oneline ace47cfa..HEAD -- docs/tutorial.md | wc -l` → 6. `git diff --stat ace47cfa HEAD -- docs/tutorial.md` → 95 insertions, 71 deletions. The five steps (`docs/tutorial.md:55`, `:87`, `:150`, `:201`, `:244`) were edited after the recorded validation.

What the default suite does prove: `tests/committed-fixture-parse-gate.test.ts:1-16` states that the gate runs "every `.theta` and `.thetalib` the git index tracks … through the real lexer/parser (`lexTheta` -> `parseThetaDocument`)". Lines 125-139 pin the corpus count and `docs/examples/personas.thetalib`. This is a parse-only witness and discharges "parse all-pass". It does not drive any theta to a terminal outcome and cannot witness "run to success live".

Absence searches, one per representation, all run this session:
1. Bug-doc records: `grep -rlnE "run to (a )?success|runtime-validated" docs/bugs | wc -l` → 0. `grep -rlE "docs/examples/\*\.theta|tutorial\.md" docs/bugs` → 4 files (0049, 0051, 0156, 0178). I opened every hit. All are corpus grep notes or fixture citations, and none records a live example or tutorial run.
2. Test file names: `find tests -iname "*example*" -o -iname "*tutorial*" -o -iname "*how-to*" -o -iname "*howto*"` → 0.
3. Test titles: `grep -rnE "(it|describe|test)(\.each\([^)]*\))?\([\"'\`][^\"'\`]*(docs/examples|tutorial|how-to|examples/)" tests | wc -l` → 0. The looser `grep -rnE "(it|describe)\(.*examples" tests` → 6 titles: b0262-D7, fn-arg-type-mismatch-wired e1, generic-argument-bracket-group-truncation f1, object-pattern-head-unresolved-refusal u2/f1, and plain-for-loop-variable-element-type h1. All six are parse or diagnostic-level default-suite cells. None is a live run.
4. Live-suite references: `grep -rlnE "\"docs\", *\"examples\"|docs/examples" tests/live | wc -l` → 3. The three files are live-production-acceptance, rfc0010-l3-progress-parent-live-cell and b0277live-unapplied-generic-head-registration. Every hit is a comment (e.g. `live-production-acceptance.test.ts:14197`, `b0277live…:91-92`), and none launches an example. `grep -rnE "\"docs\", *\"examples\"|'docs', *'examples'|docs/examples\"|--theta docs/examples" tests` → 0.
5. Coverage-matrix rows: the matrix itself (lines 16-17, 20-22 above) names no witness, log, wave or date for the runtime-validation column.
6. AGENTS.md gate names: `grep -nE "docs/examples|tutorial" AGENTS.md | wc -l` → 0.
7. CHANGELOG (corroboration only): `grep -nE "tutorial|docs/examples" CHANGELOG.md | wc -l` → 1 (line 674, which mentions `docs/examples/compact-loop.theta` in an SDK note). It does not record a live run.

## Why this is a problem
The D10 memory-evidence class covers "verified live"/"observed" wording with nothing citable: no witness row, no session or log path, no dated record. The runtime-validation column and paragraph state live success as a present-tense property of the whole `docs/examples/*.theta` glob and of the tutorial's steps. The document cites nothing, and the only trace, the ace47cfa commit message, describes a 2026-07-03 run over a different, 9-file `.loom` corpus. The glob rewrite in 2bc69157 kept the wording while the corpus it names grew from 8 invocable files to 21 `.theta` files. So the claim now also covers 13 files that were never part of any recorded run. The same snapshot also leaves numeric claims out of step with the tree ("How-to (7)" vs 16 how-to pages; "backed by 9 `docs/examples/`" vs 22 files).

## Suggested direction (non-binding, optional)
Either date and scope the column as the 2026-07-03 loom-era run over the eight named files, with any surviving record cited, or re-word it to what current evidence supports. For the parse claim, that evidence is the `committed-fixture-parse-gate`.

## False-positive check
- Checked for honesty markers: the table's Status column says "drafted", and the preamble says "All artifacts are first-pass drafts for editor review; none published". Both describe publication state, not evidence posture. Neither qualifies "run to success live" or "runtime-validated (live)", so the claim is unmarked.
- Checked the parse claims: "parse all-pass" / "parse gate 22/22 green" is discharged by the default-suite `committed-fixture-parse-gate` (the gate was green at this wave's head), so it is not filed. Only the live-run wording is.
- Checked whether a live witness exists outside `tests/`: representations 1-7 above cover bug-doc records, test file names, test titles, live-suite references, coverage-matrix rows, AGENTS.md gate names and the CHANGELOG. None records a live run of `docs/examples` or of the tutorial steps.
- Git intent check: ace47cfa shows the claim was a point-in-time run record, and 2bc69157 shows the `*.loom`→`*.theta` rewrite was mechanical and did not re-validate anything.
- Not a filed topic: no pending or filed candidate cites `docs/reference/coverage-matrix.md:<line>` on its claim side (`grep -l "docs/reference/coverage-matrix.md:[0-9]" quality/intake/*.md quality/issues/*.md quality/resolved/*.md` → 0).
- Citation form is not at issue; this concerns claim strength against evidence.

## Triage
verdict: questionable — memory-evidence verified, and every stated search reproduces: coverage-matrix.md:16-17/20-22 verbatim; -S traces to ace47cfa (a 9-file .loom corpus, 8 invocable) and 2bc69157 (the glob rewrite); 21 .theta now; how-to 16 vs 7; tutorial 6 commits/+95-71; bugs 0 and 4 hits; test names 0; strict titles 0; loose titles 6; tests/live 3 files, all comments; AGENTS.md 0; CHANGELOG 1. My own searches (docs/examples|"examples" across tests/, tutorial across tests/, tests/live examples, other intake/issues citing the matrix) found no live witness, only parse/diagnostic references and comments, and committed-fixture-parse-gate is parse-only. No witness exists to point at, so the repair means rewording or retracting the claim, and that is a human's call (triage: claude-opus-5-5)
verdict: confirmed — RATIFIED: D10 RULED REWORD (memory-evidence). docs/reference/coverage-matrix.md is a living reference doc, so the stale present-tense live-run claims are date-scoped IN PLACE. Apply EXACTLY these three replacements, nothing else — each OLD is the byte-exact current text, each NEW the byte-exact replacement.

[1] docs/reference/coverage-matrix.md:16
OLD:
<<<
| Tutorial | `docs/tutorial.md` | tutorial | drafted | 5/5 steps runtime-validated (live); subagent final values not observable on `pi -p` stdout by design (private transcript) |
>>>
NEW:
<<<
| Tutorial | `docs/tutorial.md` | tutorial | drafted | 5/5 steps runtime-validated in a 2026-07-03 live run (no recorded artifact; the tutorial has been revised since — a dated snapshot, not a standing gate); subagent final values not observable on `pi -p` stdout by design (private transcript) |
>>>

[2] docs/reference/coverage-matrix.md:17
OLD:
<<<
| How-to (7) | `docs/how-to/*.md` | how-to | drafted | backed by 9 `docs/examples/`; parse all-pass; all 8 invocable examples run to success live |
>>>
NEW:
<<<
| How-to (7) | `docs/how-to/*.md` | how-to | drafted | backed by 9 `docs/examples/`; parse all-pass (standing gate: tests/committed-fixture-parse-gate.test.ts); all 8 then-invocable examples ran to success in the 2026-07-03 live run (no recorded artifact; the example corpus has since grown — a dated snapshot) |
>>>

[3] docs/reference/coverage-matrix.md:20-21
OLD:
<<<
All 8 invocable `docs/examples/*.theta` run to a success terminal outcome live
(provider `unity-messages`/`claude-haiku-4-5`); parse gate 22/22 green. During
>>>
NEW:
<<<
All 8 then-invocable `docs/examples/*.theta` ran to a success terminal outcome
in the 2026-07-03 live run (provider `unity-messages`/`claude-haiku-4-5`; no
recorded artifact — a dated snapshot; the corpus and the parse gate have grown
since the 22/22 then counted). During
>>>
