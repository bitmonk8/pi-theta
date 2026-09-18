---
id: PTQ-0888
title: runLoad's PI_THETA_SUBAGENT_ROOT/PARENT_PID plant-and-restore block is hand-rolled identically in two e2e files instead of using createEnvSandbox
lens: D7
status: open
verdict: confirmed
locations:
  - tests/extension-tool-unreachable-load-refusal-e2e.test.ts:299-326
  - tests/subagent-root-registration-refusal-envelope.test.ts:244-274
sites: 2
fix_scope: localized
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# runLoad's PI_THETA_SUBAGENT_ROOT/PARENT_PID plant-and-restore block is hand-rolled identically in two e2e files instead of using createEnvSandbox

## Observation
Both files' `runLoad` helper captures `process.env["PI_THETA_SUBAGENT_ROOT"]`
and `process.env["PI_THETA_SUBAGENT_PARENT_PID"]` into `priorMarker`/
`priorPid`, conditionally plants new values before the compose call, and
restores-or-deletes both keys in a `finally` block. The restore half of this
block is byte-for-byte identical between the two files; the plant half
differs only in the condition and the planted value. Both files already
import `scrubAmbientControlPlane`/`restoreAmbientControlPlane` from
`tests/helpers/ambient-control-plane-scrub.ts`, whose sibling export
`createEnvSandbox()` provides the same guarded-capture / restore-or-delete
shape as a reusable `setEnv`/`restoreEnv` pair, for this same per-launch
control-plane env-key family.

## Evidence
tests/extension-tool-unreachable-load-refusal-e2e.test.ts:299-326:
```ts
  const priorMarker = process.env["PI_THETA_SUBAGENT_ROOT"];
  const priorPid = process.env["PI_THETA_SUBAGENT_PARENT_PID"];
  if (options?.childRegime === true) {
    process.env["PI_THETA_SUBAGENT_ROOT"] = "codecall";
    process.env["PI_THETA_SUBAGENT_PARENT_PID"] = String(process.ppid);
  }
  try {
    const regimeActive = detectSubagentRootRegime(readParentEnv()).active;
    const wiring = await composeExtensionInstance(pi, ctx, {
      subagentExecutableHost: resolvingHost(),
    });
    return { registered: wiring.thetas.map((t) => t.slashName), noteContent, regimeActive };
  } finally {
    if (priorMarker === undefined) {
      delete process.env["PI_THETA_SUBAGENT_ROOT"];
    } else {
      process.env["PI_THETA_SUBAGENT_ROOT"] = priorMarker;
    }
    if (priorPid === undefined) {
      delete process.env["PI_THETA_SUBAGENT_PARENT_PID"];
    } else {
      process.env["PI_THETA_SUBAGENT_PARENT_PID"] = priorPid;
    }
  }
```

tests/subagent-root-registration-refusal-envelope.test.ts:244-274:
```ts
  const priorMarker = process.env["PI_THETA_SUBAGENT_ROOT"];
  const priorPid = process.env["PI_THETA_SUBAGENT_PARENT_PID"];
  if (options?.rootSlug !== undefined) {
    process.env["PI_THETA_SUBAGENT_ROOT"] = options.rootSlug;
    process.env["PI_THETA_SUBAGENT_PARENT_PID"] = String(process.ppid);
  }
  try {
    const regimeActive = detectSubagentRootRegime(readParentEnv()).active;
    const overrides: EnvelopeCapturingOverrides = {
      subagentExecutableHost: resolvingHost(),
      emitResultEnvelope: (line: string): void => {
        captured.push(line);
      },
    };
    const wiring = await composeExtensionInstance(pi, ctx, overrides);
    return {
      registered: wiring.thetas.map((t) => t.slashName),
      noteContent,
      captured,
      regimeActive,
      outcomeEmitted,
    };
  } finally {
    if (priorMarker === undefined) {
      delete process.env["PI_THETA_SUBAGENT_ROOT"];
    } else {
      process.env["PI_THETA_SUBAGENT_ROOT"] = priorMarker;
    }
    if (priorPid === undefined) {
      delete process.env["PI_THETA_SUBAGENT_PARENT_PID"];
    } else {
      process.env["PI_THETA_SUBAGENT_PARENT_PID"] = priorPid;
    }
  }
```

`tests/helpers/ambient-control-plane-scrub.ts`'s `createEnvSandbox()`
(already imported for `scrubAmbientControlPlane` by both files) exports the
same guarded-capture / restore-or-delete `setEnv`/`restoreEnv` pair this
block hand-rolls for exactly two of the same per-launch keys.

Search performed: `grep -n 'PI_THETA_SUBAGENT_PARENT_PID"\]'
tests/**/*.test.ts` — exactly these 2 files, no third site.

## Why this is a problem
This is the boilerplate-duplication class: the restore half of the
plant-and-restore block (10 lines) is byte-identical across both files, and
the overall guarded-capture/restore-or-delete shape it hand-rolls for two
specific env keys is the same shape `tests/helpers/ambient-control-plane-
scrub.ts`'s `createEnvSandbox` already generalises — a module both files
already import from for a neighbouring concern in the same `runLoad`
function. A change to the restore discipline (e.g. clearing on delete, or
adding a third per-launch key to guard) must be made in both files by hand.

## Suggested direction (non-binding, optional)
`tests/helpers/ambient-control-plane-scrub.ts`'s existing `createEnvSandbox`
export already generalises this guarded-capture/restore-or-delete pattern
for `process.env` keys; naming it as an existing candidate home is an
observation, not a design for either file's change.

## False-positive check
- Gate-pin carve-out: neither file matches `*gate*.test.ts` or the named
  gate/pin patterns; no pinned count/inventory is at issue.
- Recording-double carve-out: this is a `process.env` snapshot/restore
  scaffold, not a fake recording calls for a "never called" witness; the
  carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "PI_THETA_SUBAGENT_PARENT_PID"
  docs/bugs/*.md` — hits exist but all cite the control-plane-authentication
  mechanism itself (subagent.md anchor), never this specific plant/restore
  code block in either file as a witness or excuse for its shape.
- coverage-matrix/bug-doc citation search: `grep -n
  "extension-tool-unreachable-load-refusal-e2e\|subagent-root-registration-refusal-envelope"
  docs/reference/coverage-matrix.md` — 0 hits; this finding proposes no
  merge, rename, or deletion of either file or test, only observes the
  duplicated block.
- Distinct from PTQ-0590: PTQ-0590 (accepted, same wave family) covers
  `tests/control-plane-authentication.test.ts`'s separate `saved`/`setEnv`/
  `afterEach` re-implementation of `createEnvSandbox`'s general N-key
  scaffold; this finding's two sites are a different code shape (an inline
  two-key plant/restore inside a `runLoad` helper, not a `setEnv`/`afterEach`
  pair) in two different files not cited by PTQ-0590's evidence.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/extension-tool-unreachable-load-refusal-e2e.test.ts:299-326 and tests/subagent-root-registration-refusal-envelope.test.ts:244-275; sed-extracted the 10-line `finally` restore blocks (:317-326 / :267-276) and diffed → byte-identical, plant halves differ only in condition/value; `grep -rln 'PI_THETA_SUBAGENT_PARENT_PID"\]' tests/` → exactly these 2 files and `priorMarker|priorPid` occurs nowhere else; `createEnvSandbox` is a live export of tests/helpers/ambient-control-plane-scrub.ts (6 importers) whose setEnv/restoreEnv is the same guarded-capture/restore-or-delete shape, and both files already import that module (:44-45/:358,:373 and :103-104/:343,:360); both locations under tests/, D7 boilerplate-duplication class; carve-outs clean (not gate files, coverage-matrix 0 hits, docs/bugs 0178/0183/0207/0240/0474 name the files but no merge/rename/delete is proposed); not a duplicate: PTQ-0343 (resolved) cited five other files and names these two only as importers of the bulk scrub, PTQ-0590 (open) covers tests/control-plane-authentication.test.ts alone, and fixing either leaves these sites untouched — a residual like PTQ-0590 itself (triage: claude-fable-5-1)
