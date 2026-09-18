---
id: PTQ-0590
title: control-plane-authentication.test.ts hand-rolls the savedEnv/setEnv/afterEach-restore scaffold instead of importing tests/helpers/ambient-control-plane-scrub.ts's createEnvSandbox
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/control-plane-authentication.test.ts:109-131
  - tests/helpers/ambient-control-plane-scrub.ts:65-90
sites: 1
fix_scope: localized
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# control-plane-authentication.test.ts hand-rolls the savedEnv/setEnv/afterEach-restore scaffold instead of importing tests/helpers/ambient-control-plane-scrub.ts's createEnvSandbox

## Observation
`tests/control-plane-authentication.test.ts`'s `readParentEnv` describe block
declares its own `saved: Record<string, string | undefined>` object, a
`setEnv(key, value)` function that captures each key's pre-test value on
first override, and an `afterEach` that walks `Object.entries(saved)`,
restores-or-deletes each key, and clears the record.
`tests/helpers/ambient-control-plane-scrub.ts` already exports
`createEnvSandbox()`, returning a `{ setEnv, restoreEnv }` pair whose
`setEnv` and restore bodies are the same three-part shape (guarded first
capture, restore-or-delete, clear). The reviewed file imports neither
`createEnvSandbox` nor anything else from that module.

## Evidence
tests/control-plane-authentication.test.ts:109-131 — the reimplemented
scaffold:
```ts
  const saved: Record<string, string | undefined> = {};

  function setEnv(key: string, value: string | undefined): void {
    if (!(key in saved)) {
      saved[key] = process.env[key];
    }
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
      delete saved[key];
    }
  });
```

tests/helpers/ambient-control-plane-scrub.ts:65-90 — the canonical
`createEnvSandbox`, whose `setEnv`/`restoreEnv` bodies are the same
guarded-capture / restore-or-delete / clear shape as the reviewed file's
copy above:
```ts
export function createEnvSandbox(): EnvSandbox {
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
  function restoreEnv(): void {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
      delete savedEnv[key];
    }
  }
  return { setEnv, restoreEnv };
}
```

The canonical module's own header states this export exists precisely to
collect this scaffold out of hand-rolled copies: "PTQ-0343: this module also
centralises `createEnvSandbox`, the narrower per-key `setEnv`/restore-loop
scaffold several of the same subagent-control-plane-simulation files
hand-rolled beside their own use of the bulk scrub above."

## Why this is a problem
This is the boilerplate-duplication class: the reviewed file's `saved`
object, `setEnv` function, and `afterEach` restore loop are the same
three-part shape — guarded first-capture, restore-or-delete on put-back,
clear-on-restore — that `tests/helpers/ambient-control-plane-scrub.ts`
already exports as `createEnvSandbox`'s `setEnv`/`restoreEnv` pair, extracted
by a resolved finding (PTQ-0343) for exactly this recurring shape across
sibling subagent-control-plane-simulation files. The reviewed file is a sixth
instance of the same pattern the resolved finding's fix already gave a
`tests/helpers/` home.

## Suggested direction (non-binding, optional)
`tests/helpers/ambient-control-plane-scrub.ts` already exports
`createEnvSandbox()`, built for this same env-snapshot/restore need in this
same subagent-control-plane-simulation file family; naming that export is an
observation about the home PTQ-0343's fix already created, not a design for
this file's change.

## False-positive check
- Gate-pin carve-out: `tests/control-plane-authentication.test.ts` is not a
  `*gate*.test.ts` file and asserts no pinned count/inventory this finding
  touches.
- Recording-double carve-out: `saved`/`setEnv` is a snapshot-and-restore
  utility over `process.env`, not a fake recording calls to back a
  "never called" assertion; the carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "control-plane-authentication"
  docs/bugs/*.md` — 0 hits; no bug document pins or excuses this file's
  local `saved`/`setEnv`/`afterEach` block. The file's own header describes
  `subagent.md #subagent-control-plane-authentication` as its spec anchor,
  not a bug witness, so no documented correct-reason red applies.
- coverage-matrix/bug-doc citation search: `grep -n
  "control-plane-authentication" docs/reference/coverage-matrix.md` — hits
  exist naming the file as a whole (its own row), never the internal
  `setEnv`/`afterEach` scaffold; this finding proposes no merge, rename, or
  deletion of the file or any test in it, only that the local scaffold could
  import the existing `createEnvSandbox` export instead of redeclaring it.
- Reference/callers check: `tests/helpers/ambient-control-plane-scrub.ts`'s
  `createEnvSandbox` export is a live export created by the fix for the
  resolved PTQ-0343 finding (confirmed by reading its docstring, which names
  PTQ-0343 directly), not a dead-code target being proposed; the reviewed
  file is not among PTQ-0343's five cited sites (b0328, b0329, b0331, b0343,
  subagent-child-hash-refusal-e2e), so this is a new, previously uncited
  instance of the same shape, not a re-file of that finding.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: the saved/setEnv/afterEach block at tests/control-plane-authentication.test.ts:109-131 is byte-identical in shape to createEnvSandbox's setEnv/restoreEnv (actually at ambient-control-plane-scrub.ts:83-105, not 65-90 — content matches); createEnvSandbox is live (imported by PTQ-0343's five files) and `grep -rln "if (!(key in saved" tests` shows this file as the ONLY remaining hand-rolled copy; the test predates the helper (3752003f 2026-08-13 vs 8c82154d 2026-09-14) and was not among PTQ-0343's cited sites, so this is a residual like PTQ-0228/0240/0301, not a duplicate; carve-outs clean (docs/bugs' single hit is 0474 citing the spec anchor, not a witness pin; coverage-matrix 0 hits) (triage: claude-fable-5-1)
