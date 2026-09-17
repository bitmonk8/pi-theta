---
id: PTQ-0436
title: identical parse+run production-producer harness (six functions) redeclared verbatim in three test files
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/b0316-match-scrutinee-inline-composite-ok-wrapped.test.ts:108-186
  - tests/b0317-object-pattern-matches-enum-result-carriers.test.ts:77-156
  - tests/b0318-match-identifier-pattern-proto-binding-lost.test.ts:70-150
sites: 3
fix_scope: module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# identical parse+run production-producer harness (six functions) redeclared verbatim in three test files

## Observation
`tests/b0316-match-scrutinee-inline-composite-ok-wrapped.test.ts`,
`tests/b0317-object-pattern-matches-enum-result-carriers.test.ts`, and
`tests/b0318-match-identifier-pattern-proto-binding-lost.test.ts` each declare
the same six module-scope functions — `parseDeps`, `parseOnly`, `parseTheta`,
`rootDouble`, `producer`, `runValue` — with byte-identical bodies (only the
JSDoc prose on `parseTheta` differs by a clause naming the bug's own
§Reproduction). Each file's own header comment names the pattern as shared:
b0317 calls it "the b0314/b0316 pattern, verbatim in shape" and b0318 calls it
"the b0317 pattern, verbatim in shape".

## Evidence
tests/b0316-match-scrutinee-inline-composite-ok-wrapped.test.ts:108-186:
```ts
function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = {
    resolve: (): "resolved" => "resolved",
  };
  return { systemNote, modelMatcher };
}

function parseOnly(path: string, src: string): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, parseDeps());
}
```
(the remaining `parseTheta`, `rootDouble`, `producer`, `runValue` bodies in
this file's 108-186 range are reproduced identically in the other two files;
see the counted-site diff below rather than re-pasting all 79 lines three
times.)

Exact search and hit count: `grep -n "^function parseDeps\|^async function
runValue" tests/b031{6,7,8}-*.test.ts` returns one `parseDeps` and one
`runValue` declaration per file (3 files × 6 functions = 18 declarations of the
6-function set). A line-range diff of each file's `parseDeps`…`runValue` block
against the other two shows the only differences are three lines of comment
text inside `parseTheta`'s JSDoc:

```
$ diff <(sed -n '108,186p' tests/b0316-match-scrutinee-inline-composite-ok-wrapped.test.ts) \
       <(sed -n '77,156p' tests/b0317-object-pattern-matches-enum-result-carriers.test.ts)
20c20,21
<  * is parse-clean at HEAD by the bug's §Reproduction (diagnostics `[]`), so a
---
>  * is parse-clean at HEAD by the bug's §Reproduction (diagnostics `[]`; heads
>  * resolve per bug 0221, listed fields are declared per bug 0226), so a
```
Every executable line — `parseDeps`, `parseOnly`, `parseTheta`'s body,
`NOOP_CHECKPOINT`, `rootDouble`, `producer`, `runValue` — is character-for-
character identical across all three files.

## Why this is a problem
The same six-function harness (systemNote/modelMatcher stub, parse-clean
gate, no-op checkpoint, `RuntimeRoot` double, `createProductionProducerDeps`
wrapper, and the parse→bind→execute `runValue` driver) is maintained as three
independent copies. Each file's own comment already identifies the prior
file's copy as the thing it is repeating "verbatim in shape," so the
duplication is acknowledged by the authors at write time, not merely
incidental convergence. A change to any part of this sequence — for example
widening `ParseThetaDocumentDeps`, changing `RuntimeRoot`'s double shape, or
adjusting how `bindPromptConversation` is invoked — has to be applied
identically in three places for the three files to keep testing the same
thing.

## Suggested direction (non-binding, optional)
`tests/helpers/` already holds several per-lineage harness modules of exactly
this shape (e.g. `tests/helpers/parent-producer-harness.ts`, whose own header
explains it was extracted after two bug files independently declared the same
seven functions). The `parseDeps`/`parseOnly`/`parseTheta`/`rootDouble`/
`producer`/`runValue` sequence duplicated here matches that same "two-or-more
independent copies of a parse+run harness" shape, naming a
`tests/helpers/` module as the natural home for this specific sequence — not a
prescription for its contents.

## False-positive check
- gate-pin: none of the three files matches `*gate*.test.ts` or the
  cross-cutting/rfc/committed-fixture/registry-closed-set gate-kin naming; no
  pinned-count carve-out applies.
- recording-double: `rootDouble`/`producer` are plain no-op stub doubles, not
  recording doubles asserting a MUST-NOT-call witness; the negative-witness
  carve-out does not apply.
- docs/bugs/ signature search: each file cites its own bug doc
  (0316/0317/0318) for the RED/GREEN witness table, not for the harness
  functions themselves; no correct-reason-red carve-out covers harness
  duplication.
- coverage-matrix/bug-doc citation search: `grep -rn "b0316\|b0317\|b0318"
  docs/reference/coverage-matrix.md` and the bug docs' witness lists were
  checked — the citations name the test files themselves as witnesses for
  their respective bugs, not the `parseDeps`/`runValue` harness functions by
  name; this finding does not propose renaming, merging, or deleting any
  cited test, only the shared harness functions.
- coverage claim check: this finding does not assert any behaviour is
  untested; all three files' witness assertions are left untouched by the
  observation.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all six functions (parseDeps/parseOnly/parseTheta/rootDouble/producer/runValue) plus NOOP_CHECKPOINT and FM declare at the cited lines in all three files (grep: 18 declarations), none of the three imports anything from tests/helpers/, and my own three-way diff of the cited ranges shows only the parseTheta JSDoc clause and three bug-slug literals inside runValue ("b031N.theta" path / slashName / sourcePath) vary — the candidate's "every executable line is character-for-character identical" overstates this (its pasted diff omitted those runValue lines), but a per-file slug is a trivially parameterised argument, not a refutation; parseDeps/parseOnly further re-implement tests/helpers/e2e-s1.ts's exported parseDeps/parseDoc and rootDouble re-implements call-with-clause-harness.ts's exported rootDouble, which strengthens the consolidation case; docs/bugs 0316/0317/0318 are all fixed (0.295.0/0.296.0/0.297.0), the three files are 19/19 green at HEAD, coverage-matrix.md has 0 hits, no gate/recording-double/failLoudly carve-out applies, and no existing PTQ names these files (PTQ-0209/0214/0314/0384/0386/0397 cite disjoint files) (triage: claude-fable-5-1)
