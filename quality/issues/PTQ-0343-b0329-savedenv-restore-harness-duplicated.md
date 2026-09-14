---
id: PTQ-0343
title: b0329's process.env save/restore harness (savedEnv, setEnv, the afterEach restore loop) is duplicated verbatim across four sibling subagent-hash test files
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0329-hash-mismatch-refuses-invocation.test.ts:166-173
  - tests/b0329-hash-mismatch-refuses-invocation.test.ts:201-211
  - tests/b0328-root-closure-hash-marshalled.test.ts:417-427
  - tests/b0328-root-closure-hash-marshalled.test.ts:456-466
  - tests/b0331-root-winner-preempt.test.ts:77-88
  - tests/b0331-root-winner-preempt.test.ts:199-211
  - tests/b0343-proto-hash-carrier-row.test.ts:327-337
  - tests/b0343-proto-hash-carrier-row.test.ts:392-401
  - tests/subagent-child-hash-refusal-e2e.test.ts:33-38
  - tests/subagent-child-hash-refusal-e2e.test.ts:85-95
sites: 10                    # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260914130212
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-14
---

# b0329's process.env save/restore harness (savedEnv, setEnv, the afterEach restore loop) is duplicated verbatim across four sibling subagent-hash test files

## Observation
tests/b0329-hash-mismatch-refuses-invocation.test.ts declares a module-scope
`savedEnv: Record<string, string | undefined>` object and a `setEnv(key,
value)` function that records each key's pre-test value the first time it is
overridden, paired with an `afterEach` that walks `Object.entries(savedEnv)`,
restores-or-deletes each key, and clears the record. The identical
three-part shape (the `savedEnv` declaration, a guarded `setEnv`, and the same
seven-line restore-and-clear `for` loop) recurs in four sibling files that
also simulate a subagent child's control-plane environment via
`process.env`: tests/b0328-root-closure-hash-marshalled.test.ts,
tests/b0331-root-winner-preempt.test.ts,
tests/b0343-proto-hash-carrier-row.test.ts, and
tests/subagent-child-hash-refusal-e2e.test.ts. `grep -rl "const savedEnv"
tests/*.test.ts` returns exactly these five files. No `tests/helpers/` module
exports this save-before-first-override/restore-after idiom.
tests/helpers/ambient-control-plane-scrub.ts, the nearest existing helper for
this same subagent-control-plane-simulation test family, instead performs a
proactive bulk scrub-then-restore of the whole known control-plane key set (a
related but distinct operation, already imported by three other files for
that different purpose).

## Evidence

### tests/b0329-hash-mismatch-refuses-invocation.test.ts:166-173 (in this wave's scope)
```ts
const savedEnv: Record<string, string | undefined> = {};

function setEnv(key: string, value: string): void {
  if (!(key in savedEnv)) {
    savedEnv[key] = process.env[key];
  }
  process.env[key] = value;
}
```
tests/b0329-hash-mismatch-refuses-invocation.test.ts:201-211 (the restore loop):
```ts
afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
    delete savedEnv[key];
  }
  rmSync(workspaceDir, { recursive: true, force: true });
});
```

### tests/b0328-root-closure-hash-marshalled.test.ts:417-427 (same shape, `value: string | undefined` variant)
```ts
const savedEnv: Record<string, string | undefined> = {};
function setEnv(key: string, value: string | undefined): void {
  if (!(key in savedEnv)) {
    savedEnv[key] = process.env[key];
  }
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
```
tests/b0328-root-closure-hash-marshalled.test.ts:456-466 (the restore loop,
byte-identical body to b0329's, wrapped in the same `afterEach`):
```ts
  afterEach(() => {
    vi.restoreAllMocks();
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
      delete savedEnv[key];
    }
  });
```

### tests/b0331-root-winner-preempt.test.ts:77-88 (same shape as b0329's, plus a comment)
```ts
const savedEnv: Record<string, string | undefined> = {};
/** Ambient control plane carried by the RUNNING process, parked for the test. */
let ambientControlPlane: AmbientControlPlaneSnapshot | undefined;

function setEnv(key: string, value: string): void {
  if (!(key in savedEnv)) {
    // Save the ORIGINAL (pre-test) value once so a second set for the same key
    // (e.g. the malformed-carrier loop) cannot overwrite it with a planted one.
    savedEnv[key] = process.env[key];
  }
  process.env[key] = value;
}
```
tests/b0331-root-winner-preempt.test.ts:199-211 (the same seven-line restore
loop, lines 200-206, followed by this file's additional
`restoreAmbientControlPlane` call — the one place the shape is extended
rather than merely repeated):
```ts
afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
    delete savedEnv[key];
  }
  if (ambientControlPlane !== undefined) {
    restoreAmbientControlPlane(ambientControlPlane);
    ambientControlPlane = undefined;
  }
```

### tests/b0343-proto-hash-carrier-row.test.ts:327-337 (byte-identical to b0328's setEnv)
```ts
const savedEnv: Record<string, string | undefined> = {};
function setEnv(key: string, value: string | undefined): void {
  if (!(key in savedEnv)) {
    savedEnv[key] = process.env[key];
  }
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
```
tests/b0343-proto-hash-carrier-row.test.ts:392-401 (the same restore loop,
same `vi.restoreAllMocks()` pairing as b0328's):
```ts
  afterEach(() => {
    vi.restoreAllMocks();
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
      delete savedEnv[key];
    }
```

### tests/subagent-child-hash-refusal-e2e.test.ts:33-38 (the simplest variant — no first-capture guard)
```ts
const savedEnv: Record<string, string | undefined> = {};

function setEnv(key: string, value: string): void {
  savedEnv[key] = process.env[key];
  process.env[key] = value;
}
```
tests/subagent-child-hash-refusal-e2e.test.ts:85-95 (the restore loop,
byte-identical to b0329's and to the for-loop body in all four other files):
```ts
afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
    delete savedEnv[key];
  }
  rmSync(workspaceDir, { recursive: true, force: true });
});
```

Exact search and hit count: `grep -rl "const savedEnv" tests/*.test.ts` →
exactly these 5 files (`tests/b0328-root-closure-hash-marshalled.test.ts`,
`tests/b0329-hash-mismatch-refuses-invocation.test.ts`,
`tests/b0331-root-winner-preempt.test.ts`,
`tests/b0343-proto-hash-carrier-row.test.ts`,
`tests/subagent-child-hash-refusal-e2e.test.ts`).

## Why this is a problem
This is the D7 "Boilerplate duplication" class: the same setup/teardown
sequence — a `Record` used as a lazy `process.env` snapshot, a `setEnv`
wrapper that guards the first capture, and an `afterEach` restore-and-clear
loop — is repeated across five files (ten cited sites) with no shared
`tests/helpers/` definition. The `afterEach` loop's body (`for (const [key,
value] of Object.entries(savedEnv)) { if (value === undefined) { delete
process.env[key]; } else { process.env[key] = value; } delete savedEnv[key];
}`) is byte-identical in all five files. `setEnv` recurs in two typed
variants — `value: string` (b0329, b0331, subagent-child-hash-refusal-e2e) and
`value: string | undefined` (b0328, b0343, which also support deleting a key)
— and subagent-child-hash-refusal-e2e's copy additionally omits the
`if (!(key in savedEnv))` first-capture guard the other four share.
tests/helpers/ambient-control-plane-scrub.ts already establishes that this
repository centralises exactly this class of small env-snapshot/restore
utility for this same subagent-control-plane-simulation file family — it is
imported by three of these same files' neighbours
(tests/b0331-root-winner-preempt.test.ts,
tests/extension-tool-unreachable-load-refusal-e2e.test.ts,
tests/subagent-root-registration-refusal-envelope.test.ts) for a proactive
scrub of the full known key set — yet the narrower, five-times-repeated
`savedEnv`/`setEnv`/restore-loop shape sits beside it with no shared home of
its own.

## Suggested direction (non-binding, optional)
A small helper exporting the shared `setEnv`/restore-loop shape would sit
naturally alongside the existing tests/helpers/ambient-control-plane-scrub.ts
module, which already serves this same subagent-control-plane-simulation file
family with a related snapshot/restore utility.

## False-positive check
- Gate-pin check: none of the five files matches `*gate*.test.ts` or the
  named kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate); `ls
  tests/*gate*.test.ts` lists no file among the five cited here.
- Recording-double / MUST-NOT witness check: not applicable — `savedEnv`/
  `setEnv` is a snapshot-and-restore utility over `process.env`, not a fake
  that records calls to back a "never called" assertion; none of the cited
  lines back a negative witness the carve-out would protect.
- docs/bugs/ signature search: `grep -rl "savedEnv" docs/bugs/*.md` → 0 hits
  (no bug document discusses or defends this scaffold, or documents a
  correct-reason red for it). Bug 0329 is Status "fixed (0.322.0)" and its
  witness list (docs/bugs/0329-hash-mismatch-refusal-does-not-refuse-invocation.md:163)
  names the file and its five cells (A-E) by BEHAVIOUR ("envelope + root
  absent", "grandchild-laundering fence", etc.), not by this internal
  scaffold. Bug 0328 is Status "fixed (0.306.0)"; bug 0331 is Status "fixed
  (0.323.0)"; bug 0343 is Status "fixed (0.320.0)";
  tests/subagent-child-hash-refusal-e2e.test.ts is an RFC-0005 witness file
  tied to no single bug document. `npx vitest run` on all five files
  together → 5 files / 35 tests passed, confirming none is a documented
  correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "<filename>"
  docs/reference/coverage-matrix.md` → 0 hits for each of the five files.
  This finding proposes no merge, rename, or deletion of any `describe`/`it`
  — only that the shared env-snapshot/restore scaffold could live in one
  module — so no witness-list citation is affected.
- Coverage-drift check: the claim is about a repeated setup/teardown
  DEFINITION, not a missing test path; every cited `setEnv`/`afterEach`
  pairing is exercised by its own file's currently-passing tests.
- Scope note: only tests/b0329-hash-mismatch-refuses-invocation.test.ts is
  inside this wave's assigned four-file scope; the other four are cited as
  the sibling duplication instances the "cite every instance" instruction for
  this D7 class requires, the same cross-file citation precedent already used
  by the confirmed PTQ-0328 (b0288/b0319/b0414) finding.
- Already-filed/resolved overlap check: searched quality/issues,
  quality/resolved and quality/intake for "savedEnv" and "setEnv" together —
  0 hits. This scaffold is mechanically distinct from the already-covered
  tests/helpers/production-load-harness.ts family (PTQ-0210, PTQ-0240,
  PTQ-0259, PTQ-0312 — a fake `ExtensionAPI`/`ExtensionContext` host and its
  `diagnosticLines` capture, none of which reads or writes `process.env`) and
  from the two already-fixed b0329 findings in this same file (PTQ-0221's
  `ComposeHost`/`makeComposeHost` double and PTQ-0243's tautological branch
  assertion, confirmed via direct re-read of both as already applied in the
  current file) — neither touches the `savedEnv`/`setEnv`/`afterEach`-restore
  lines cited here.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — every excerpt and search reproduces exactly (the 5-file `const savedEnv` grep, byte-identical setEnv/afterEach-loop bodies at all 10 cited ranges, no tests/helpers/ home, docs/bugs status + coverage-matrix + gate-pin carve-outs all clean, no existing-issue overlap), matching the same cross-file D7 boilerplate-duplication precedent as the confirmed PTQ-0328. (triage: claude-opus-5)
