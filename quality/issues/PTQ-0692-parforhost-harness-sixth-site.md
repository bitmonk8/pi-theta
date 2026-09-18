---
id: PTQ-0692
title: execution-status-parfor-lanes reproduces the makeDeps/parse/bodyOf/NOOP_CHECKPOINT/NoopMutator/ok par-for harness already flagged as duplicated, as an uncounted sixth site
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/execution-status-parfor-lanes.test.ts:41-76
  - tests/b0325-nan-infinity-max-zero-workers.test.ts:113-159
sites: 1
fix_scope: cross-module        # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: parallel
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# execution-status-parfor-lanes reproduces the makeDeps/parse/bodyOf/NOOP_CHECKPOINT/NoopMutator/ok par-for harness already flagged as duplicated, as an uncounted sixth site

## Observation
`quality/intake/qw20260917154546-d7-01-parforhost-harness-quadruplicated.md` (already filed this wave) documents that `tests/b0324-max-non-number-runtime.test.ts`, `tests/b0325-nan-infinity-max-zero-workers.test.ts`, and `tests/b0326-max-non-positive-runtime.test.ts` each re-type the same `makeDeps`/`parse`/`bodyOf`/`NOOP_CHECKPOINT`/`NoopMutator`/`ok`/`execDeps` par-for harness, naming `tests/par-for.test.ts` as a fourth (out-of-scope) instance; `quality/intake/qw20260917154546-d7-09-b0438-parforhost-harness-uncounted-fifth-site.md` adds `tests/b0438-par-max-fractional-width-silent-floor.test.ts` as a fifth. `tests/execution-status-parfor-lanes.test.ts` — one of this wave's ten reviewed files, named in neither existing finding — reproduces the same `makeDeps`/`parse`/`bodyOf`/`NOOP_CHECKPOINT`/`NoopMutator`/`ok` block a sixth time, byte-identical modulo whitespace/comment reflow, and its own header comment states the harness "mirrors `tests/b0325-nan-infinity-max-zero-workers.test.ts`'s `RecordingParForHost`/`execDeps`/parse-and-drive shape exactly (same `executeBody` entry point, same `NoopMutator`, same pure-eval subset)".

## Evidence
`tests/execution-status-parfor-lanes.test.ts:41-76`:
```ts
function makeDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}

function parse(src: string): ThetaDocument {
  const source: ThetaSource = { path: "test.theta", bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, makeDeps());
}

function bodyOf(src: string): ThetaBody {
  return parse(src).body;
}

const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

class NoopMutator implements CommittedConversationMutator {
  truncate(): void {}
  rewrite(): void {}
  replace(): void {}
  remove(): void {}
  injectCompensatingTurn(_surface: CommittedSurface): void {}
}

function ok(value: ThetaValue): OperationResult {
  return { ok: true, value };
}
```

`tests/b0325-nan-infinity-max-zero-workers.test.ts:113-159` carries the same six declarations (`makeDeps`, `parse`, `bodyOf`, `NOOP_CHECKPOINT`, `NoopMutator`, `ok`) already cited in the sibling findings above.

Exact search run: `diff <(sed -n '41,76p' tests/execution-status-parfor-lanes.test.ts) <(sed -n '113,148p' tests/b0325-nan-infinity-max-zero-workers.test.ts)` → the only differences are inline-vs-multi-line object literal formatting and two doc-comment lines present only in b0325; every function/class body and every field name is identical. `RecordingParForHost` (execution-status-parfor-lanes.test.ts:80-110) shares its class name, its exact `checkpointFor` body, and its exact `#eval` `number`/`ident`/`array` arms with b0325's `RecordingParForHost` (already cited in the fifth-site finding as the class b0438's own copy was modelled on), differing only in that it omits the `string`/`bool`/`null` `#eval` arms and the `inFlight`/`peakInFlight`/`gate` concurrency-tracking fields b0325 needs for its own bug's assertions.

## Why this is a problem
The already-filed quadruplicated and fifth-site findings establish that this `makeDeps`/`parse`/`bodyOf`/`NOOP_CHECKPOINT`/`NoopMutator`/`ok` block is a recognised repeated shape across the par-for test family, with each successive file's own comments admitting the copy. `tests/execution-status-parfor-lanes.test.ts` is a sixth reproduction of the identical block, explicitly modelled on the fifth (b0325) per its own header comment, and is not named or counted in either existing finding's site list.

## Suggested direction (non-binding, optional)
As the existing findings already observe, the natural home for this six-part block is a shared module under tests/helpers/, with each caller supplying only its own `StatementEvalHost` variant (gated/counting vs. this file's lane-hooks variant) and bug- or feature-specific assertions.

## False-positive check
Gate-pin check: `tests/execution-status-parfor-lanes.test.ts` does not match `*gate*.test.ts` or the named gate kinds. Recording-double check: `RecordingParForHost` and `recordingLaneHooks()` record calls the tests read as positive observables (event order), not "never called" negative witnesses — the carve-out does not apply to the harness-duplication claim. docs/bugs/ signature search: `grep -rl "execution-status-parfor-lanes" docs/bugs` → no hits. coverage-matrix/bug-doc citation search: `grep -n "execution-status-parfor-lanes" docs/reference/coverage-matrix.md` → no hits; this finding proposes no merge/rename/delete of any test. Coverage: not claimed — the file already asserts B18's two rows; this is only about the repeated harness code. Duplicate check: distinct from `qw20260917154546-d7-01-parforhost-harness-quadruplicated.md` (sites: b0324/b0325/b0326/par-for.test.ts) and `qw20260917154546-d7-09-b0438-parforhost-harness-uncounted-fifth-site.md` (site: b0438) — `tests/execution-status-parfor-lanes.test.ts` appears in neither site list and is inside this shard's own review scope.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: excerpt matches execution-status-parfor-lanes.test.ts:41-76 verbatim; whitespace/doc-comment-normalised diff against b0325's six declarations (actually 113-164 — the cited 113-148 sed range is short because b0325 interposes `tick` and doc lines, a range artefact not a content difference) differs only in two trailing commas, so makeDeps/parse/bodyOf/NOOP_CHECKPOINT/NoopMutator/ok is a byte-identical sixth copy; RecordingParForHost shares name and byte-identical checkpointFor, its #eval carries number/ident/array only (b0325 adds string/bool/null) and drops started/inFlight/peakInFlight/gate exactly as stated; header comment 31-38 names b0325 as its model; NOOP_CHECKPOINT/NoopMutator also re-type tests/helpers/invoke-seam-scaffold.ts:31,44's exported SEAM_NOOP_CHECKPOINT/SEAM_NOOP_MUTATOR; not a gate file, grep of the file name across docs/bugs and docs/reference/coverage-matrix.md → 0 hits, no it() merge/rename/delete proposed, recording double is a positive observable; not a duplicate of confirmed siblings d7-01 (b0324/b0325/b0326/par-for) or d7-09 (b0438) — this file is in neither site list and store precedent PTQ-0228/PTQ-0393 accepts an uncounted extra site of an already-filed harness as its own filing; no tracked PTQ on this harness; minor: stray d4_class field on a D7 filing (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
