---
id: PTQ-0483
title: ParForHost/execDeps/makeDeps/tick harness block is re-typed near-verbatim across four par-for test files
lens: D7
status: open
verdict: confirmed
locations:
  - tests/b0324-max-non-number-runtime.test.ts:67-206
  - tests/b0325-nan-infinity-max-zero-workers.test.ts:112-253
  - tests/b0326-max-non-positive-runtime.test.ts:82-227
  - tests/par-for.test.ts:102-2486
sites: 4
fix_scope: cross-module
d4_class: parallel
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# ParForHost/execDeps/makeDeps/tick harness block is re-typed near-verbatim across four par-for test files

## Observation
tests/b0324-max-non-number-runtime.test.ts, tests/b0325-nan-infinity-max-zero-workers.test.ts, and tests/b0326-max-non-positive-runtime.test.ts each declare their own copy of the same nine-part harness: `makeDeps()`, `parse()`, `bodyOf()`, `NOOP_CHECKPOINT`, `class NoopMutator`, `tick()`, `ok()`, a gated `StatementEvalHost` implementation (`ParForHost`/`RecordingParForHost`), and an `execDeps()`/`DiagnosticSpyDeps` pair. tests/par-for.test.ts (out of this wave's scope, cited only as the fourth instance the later files' own comments name as their model) carries the same block at different line numbers. Each of b0324/b0325/b0326's own header comments states the harness is "modelled on the `ParForHost` of tests/par-for.test.ts" (b0324:107-108, b0326:143-144) or "the union of the tests/par-for.test.ts recording host and the tests/b0324 gated host" (b0325:180-183) — the files name their own copying as they do it.

## Evidence
tests/b0324-max-non-number-runtime.test.ts:67-105 (makeDeps/parse/bodyOf/NOOP_CHECKPOINT/NoopMutator/tick/ok):
```ts
function makeDeps(): ParseThetaDocumentDeps {
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

function parse(src: string): ThetaDocument {
  const source: ThetaSource = {
    path: "test.theta",
    bytes: new TextEncoder().encode(src),
  };
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
```

tests/b0326-max-non-positive-runtime.test.ts:82-104 reproduces the identical `makeDeps`/`parse`/`bodyOf`/`NOOP_CHECKPOINT` bodies (only a `codesOf` helper is added between `bodyOf` and `NOOP_CHECKPOINT`); tests/b0325-nan-infinity-max-zero-workers.test.ts:113-139 reproduces the same four again verbatim.

`ParForHost`, byte-identical between b0324:128-165 and b0326:150-186 (b0325's `RecordingParForHost`, tests/b0325:176-213, is the same class with a `started` counter added):
```ts
class ParForHost implements StatementEvalHost {
  inFlight = 0;
  peakInFlight = 0;
  gate: Promise<void> | null = null;

  evaluatePure(expr: Expr, env: LexicalEnvironment): ThetaValue {
    return this.#eval(expr, env);
  }

  checkpointFor(expr: Expr): CheckpointDescriptor | null {
    if (expr.kind === "call" || expr.kind === "query" || expr.kind === "invoke") {
      return { kind: "tool-call", site: { file: "test.theta", line: 1, column: 1 } };
    }
    return null;
  }

  async runEffect(): Promise<OperationResult> {
    this.inFlight += 1;
    this.peakInFlight = Math.max(this.peakInFlight, this.inFlight);
    try {
      if (this.gate !== null) {
        await this.gate;
      }
      return ok(null);
    } finally {
      this.inFlight -= 1;
    }
  }
  ...
```

`execDeps`/`DiagnosticSpyDeps`, identical shape at b0324:185-206, b0325:236-253, b0326:208-227:
```ts
interface DiagnosticSpyDeps extends ExecuteBodyDeps {
  readonly emitDiagnostic: (diagnostic: Diagnostic) => void;
}

function execDeps(
  body: ThetaBody,
  host: StatementEvalHost,
  captured: Diagnostic[],
): DiagnosticSpyDeps {
  return {
    env: buildEnvironment({ body }),
    host,
    checkpoint: NOOP_CHECKPOINT,
    signal: new AbortController().signal,
    mutator: new NoopMutator(),
    mode: "prompt",
    file: "test.theta",
    emitDiagnostic: (d: Diagnostic): void => {
      captured.push(d);
    },
  };
}
```

Every counted site: `grep -n "class ParForHost\|class RecordingParForHost\|function makeDeps\|function parse(\|function bodyOf\|NOOP_CHECKPOINT\|class NoopMutator\|async function tick\|function ok(\|interface DiagnosticSpyDeps\|function execDeps" tests/par-for.test.ts tests/b0324-max-non-number-runtime.test.ts tests/b0325-nan-infinity-max-zero-workers.test.ts tests/b0326-max-non-positive-runtime.test.ts` returns the same eleven symbol names in all four files (par-for.test.ts:102,115,2277,2283,2292,2300,2317,2462,2479; b0324:68,81,90,94,100,109,117,128,185,189; b0325:113,126,135,139,145,154,162,176,236,240; b0326:83,96,105,114,120,129,137,150,208,212).

## Why this is a problem
Four files carry the same nine-symbol harness (parser wiring, a no-op checkpoint/mutator, a microtask-advance helper, and a gated `StatementEvalHost` double) with only cosmetic renames (`ParForHost` → `RecordingParForHost`) or additive fields (a `started` counter, a `codesOf` wrapper). The later three files' own comments each explicitly cite an earlier file's identically-named class as their model, i.e. the duplication is authored knowingly, not independently arrived at. A `tests/helpers/par-for-harness.ts` (or similar) is the natural landing this pattern points to, observationally, since three of the four bug-witness files for the same `par for max` clause each re-declare the identical scaffold rather than importing one.

## Suggested direction (non-binding, optional)
A shared par-for harness module under tests/helpers/ that exports the parse/bodyOf/execDeps/checkpoint/mutator/gated-host pieces would let each bug file import the common scaffold and keep only its bug-specific assertions and fixtures.

## False-positive check
Gate-pin check: none of the four files match `*gate*.test.ts` or the named gate kinds — not applicable. Recording-double check: `ParForHost`/`RecordingParForHost` are legitimate doubles that record in-flight width and diagnostic codes, but the finding is about the class DEFINITION being re-typed across files, not about the double's negative-witness role, so the recording-double carve-out does not cover the duplication claim itself. docs/bugs/ signature search: `docs/bugs/0324-max-non-integer-silently-unthrottled.md`, `0325-nan-max-zero-workers-fabricated-ok-null-array.md`, `0326-max-zero-negative-silently-raised-to-one.md` exist and match these tests' subjects, but none of them prescribe or ratify keeping the harness duplicated (each documents the runtime defect, not the test-authoring shape). coverage-matrix/bug-doc citation search: `grep -n "b0324\|b0325\|b0326" docs/reference/coverage-matrix.md` returned no hits, so none of these test files are pinned by name in the coverage matrix. This finding proposes no merge/rename/delete of a pinned test. Coverage: not claimed — all four files exist and already assert; this is purely about the repeated harness code, not about what is or isn't tested.

## Triage
verdict: confirmed — independently re-verified: grep reproduces the eleven-symbol hit set at the cited lines; diff shows ParForHost byte-identical b0324:128-165↔b0326:150-187, b0325's RecordingParForHost = rename + `started` counter only, execDeps/DiagnosticSpyDeps byte-identical across all three bug files and makeDeps/parse/bodyOf/NOOP_CHECKPOINT/NoopMutator/tick/ok byte-identical b0324↔b0325 (b0326 adds codesOf only); par-for.test.ts shares the six scaffold helpers verbatim but its ParForHost/execDeps are diverged supersets (so the fourth site is an ancestor, not a clone); NOOP_CHECKPOINT/NoopMutator additionally re-type tests/helpers/invoke-seam-scaffold.ts's exported SEAM_NOOP_CHECKPOINT/SEAM_NOOP_MUTATOR; no gate file, no coverage-matrix pin (grep b0324|b0325|b0326 → 0 hits), no tracked PTQ on this harness — minor observation drift only (b0326:142-143 names b0324 as its model, not par-for.test.ts; stray d4_class field on a D7 filing) (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
