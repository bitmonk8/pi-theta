---
id: PTQ-0575
title: ScriptedCheckpoint fake is redeclared byte-identical in four test files with no shared tests/helpers/ home
lens: D7
status: open
verdict: confirmed
locations:
  - tests/cancellation-core.test.ts:59-71
  - tests/effectful-statement-host.test.ts:130-141
  - tests/no-rollback.test.ts:67-80
  - tests/statement-executor.test.ts:149-162
sites: 4
fix_scope: module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# ScriptedCheckpoint fake is redeclared byte-identical in four test files with no shared tests/helpers/ home

## Observation
`tests/cancellation-core.test.ts`, `tests/effectful-statement-host.test.ts`,
`tests/no-rollback.test.ts`, and `tests/statement-executor.test.ts` each
declare a private local `class ScriptedCheckpoint implements Checkpoint`
whose body (a `#calls` counter, an injected `onBefore(call, kind)` callback,
and a `before(kind)` method that increments the counter, invokes the
callback, and returns `Promise.resolve()`) is line-for-line identical (modulo
blank-line spacing) in all four files. `tests/helpers/` has no `Checkpoint`
fake of any kind — `ls tests/helpers | grep -i check` returns nothing.

## Evidence
`tests/cancellation-core.test.ts:59-71`:
```ts
class ScriptedCheckpoint implements Checkpoint {
  #calls = 0;
  readonly #onBefore: (call: number, kind: CheckpointKind) => void;

  constructor(onBefore: (call: number, kind: CheckpointKind) => void) {
    this.#onBefore = onBefore;
  }

  before(kind: CheckpointKind): Promise<void> {
    this.#calls += 1;
    this.#onBefore(this.#calls, kind);
    return Promise.resolve();
  }
}
```

`tests/effectful-statement-host.test.ts:130-141` (same body, tighter blank-line spacing):
```ts
class ScriptedCheckpoint implements Checkpoint {
  #calls = 0;
  readonly #onBefore: (call: number, kind: CheckpointKind) => void;
  constructor(onBefore: (call: number, kind: CheckpointKind) => void) {
    this.#onBefore = onBefore;
  }
  before(kind: CheckpointKind): Promise<void> {
    this.#calls += 1;
    this.#onBefore(this.#calls, kind);
    return Promise.resolve();
  }
}
```

`tests/no-rollback.test.ts:67-80`:
```ts
class ScriptedCheckpoint implements Checkpoint {
  #calls = 0;
  readonly #onBefore: (call: number, kind: CheckpointKind) => void;

  constructor(onBefore: (call: number, kind: CheckpointKind) => void) {
    this.#onBefore = onBefore;
  }

  before(kind: CheckpointKind): Promise<void> {
    this.#calls += 1;
    this.#onBefore(this.#calls, kind);
    return Promise.resolve();
  }
}
```

`tests/statement-executor.test.ts:149-162`:
```ts
class ScriptedCheckpoint implements Checkpoint {
  #calls = 0;
  readonly #onBefore: (call: number, kind: CheckpointKind) => void;

  constructor(onBefore: (call: number, kind: CheckpointKind) => void) {
    this.#onBefore = onBefore;
  }

  before(kind: CheckpointKind): Promise<void> {
    this.#calls += 1;
    this.#onBefore(this.#calls, kind);
    return Promise.resolve();
  }
}
```

Search: `grep -rln "class ScriptedCheckpoint" tests/*.test.ts` returns exactly
these four files and no others. `ls tests/helpers | grep -i check` returns no
matches — no `Checkpoint`-fake helper module exists under `tests/helpers/`.

## Why this is a problem
The same fake — same class name, same field, same constructor signature,
same method body — is authored independently four times. Each of the four
files' own header comments describe the `Checkpoint` seam as a deliberate
deterministic-test substrate (PIC-10 / "lands an abort at a chosen
checkpoint boundary without depending on JS microtask scheduling"), so this
is a canonical, spec-named test double, not an incidental inline stub — the
kind of fixture a `tests/helpers/` module is for.

## Suggested direction (non-binding, optional)
A `tests/helpers/` module exporting `ScriptedCheckpoint` alongside the
existing `Checkpoint`-adjacent fakes (e.g. `fake-clock.ts`, `fake-id-source.ts`)
would give these four files one declaration to import instead of four to
keep in sync.

## False-positive check
- Recording-double carve-out: `ScriptedCheckpoint` is a scripted/scheduling
  double (it drives a callback on each `before()` call), not a call-recording
  MUST-NOT witness; the carve-out for negative witnesses through recording
  doubles does not apply.
- Gate-pin carve-out: none of the four files match `*gate*.test.ts` or the
  named gate kin.
- docs/bugs/ signature search: this finding does not allege a red or skipped
  test; the class is used identically as passing-test scaffolding in all four
  files, so no docs/bugs/ correct-reason-red check applies.
- coverage-matrix/bug-doc citation search: `grep -rn "ScriptedCheckpoint" docs/reference/coverage-matrix.md docs/bugs/` — no hits; no test is cited by name for this class, so no merge/rename/delete proposal is implicated (and this finding does not propose one).
- Coverage drift check: this finding does not claim any behaviour is
  untested; it is scoped to the duplicated scaffolding class alone, not to
  the four files' distinct test bodies.
- Only `tests/cancellation-core.test.ts` is in this wave's briefed scope; the
  other three sites are cited as instances of the same repeated shape per
  the evidence-rule requirement to cite every counted site, not as separate
  findings against out-of-scope files.

## Triage
<!-- triage appends its note here -->
verdict: confirmed — independently re-verified: `grep -rln "class ScriptedCheckpoint"` over src/ extensions/ tools/ tests/ returns exactly the four cited files, a whitespace-normalised diff of the four class bodies (cancellation-core:59-72, effectful-statement-host:130-141, no-rollback:67-80, statement-executor:149-162) is byte-identical, all four carry the same "deterministic-test substrate (PIC-10)" header naming it a canonical double, tests/helpers/ holds only no-op/passthrough Checkpoint doubles (SEAM_NOOP_CHECKPOINT, NOOP_CHECKPOINT ×3, PassthroughCheckpoint) and no scripted one, no gate-test/recording-witness/coverage-matrix/docs-bugs carve-out applies, and no open or resolved PTQ (incl. PTQ-0253, a different checkpoint-seam root cause) tracks this class — D7 copy-paste fixture, mechanical dedupe into a tests/helpers/ export (triage: claude-fable-5-1)
