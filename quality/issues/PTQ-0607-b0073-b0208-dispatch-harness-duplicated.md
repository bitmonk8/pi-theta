---
id: PTQ-0607
title: the bug-0073 clean-cancel dispatch harness (recordingPi/promptTheta/driveCtx/tick/PassthroughCheckpoint/rootWithIds) is redeclared byte-identical in tests/post-deadline-dual-surface.test.ts
lens: D7
status: open
verdict: confirmed
locations:
  - tests/cancelled-by-session-shutdown-note.test.ts:130-148
  - tests/cancelled-by-session-shutdown-note.test.ts:159-186
  - tests/post-deadline-dual-surface.test.ts:118-131
  - tests/post-deadline-dual-surface.test.ts:142-168
sites: 2
fix_scope: module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# the bug-0073 clean-cancel dispatch harness (recordingPi/promptTheta/driveCtx/tick/PassthroughCheckpoint/rootWithIds) is redeclared byte-identical in tests/post-deadline-dual-surface.test.ts

## Observation
`tests/cancelled-by-session-shutdown-note.test.ts` and
`tests/post-deadline-dual-surface.test.ts` each declare a
`class PassthroughCheckpoint implements Checkpoint`, a `rootWithIds()`
builder, and `recordingPi`, `promptTheta`, `driveCtx`, and `tick` functions
with byte-identical bodies. `tests/post-deadline-dual-surface.test.ts`'s own
header comment names the sibling directly: "Bug 0073's five cells
(`tests/cancelled-by-session-shutdown-note.test.ts`) cannot reach this arm" —
the two files are explicitly the same dispatch-harness family driving the
same `createProductionProducerDeps` / `composeThetaFixture.run` /
`runSessionShutdown` seam over the same `ActiveInvocationRegistry`, only
differing in which arm of the clean-cancel/teardown-timeout pair each drives.
(A separate, already-filed candidate in this wave's intake,
`qw20260917154546-d7-01-shutdowndeps-harness-duplicated.md`, already covers
these same two files' `shutdownDeps`/sink-builder duplication together with
two further files outside this wave's scope; that overlap is excluded here.)

## Evidence
`tests/cancelled-by-session-shutdown-note.test.ts:130-148`:
```ts
class PassthroughCheckpoint implements Checkpoint {
  before(_kind: CheckpointKind, _site: CheckpointSite): Promise<void> {
    return Promise.resolve();
  }
}

function rootWithIds(): RuntimeRoot {
  return {
    checkpoint: new PassthroughCheckpoint(),
    idSource: {
      newInvocationId: () => INVOCATION_ID,
      newToolCallId: () => "tc-1",
    },
    // Bug 0383: the SLSH-4 boundary now builds a `RuntimeEvent` (stamping
    // `occurred_at` via `root.clock.wallNow()`) whenever cell (b)'s Esc-style
    // abort surfaces the SNK-f cancelled note, so the double needs a `clock`
    // seam or that construction throws before `pi.sendMessage` is reached.
    clock: new FakeClock(),
  } as unknown as RuntimeRoot;
}
```

`tests/post-deadline-dual-surface.test.ts:118-131` (same `PassthroughCheckpoint`
body; `rootWithIds` diverges only by omitting the `clock` field):
```ts
class PassthroughCheckpoint implements Checkpoint {
  before(_kind: CheckpointKind, _site: CheckpointSite): Promise<void> {
    return Promise.resolve();
  }
}

function rootWithIds(): RuntimeRoot {
  return {
    checkpoint: new PassthroughCheckpoint(),
    idSource: {
      newInvocationId: () => INVOCATION_ID,
      newToolCallId: () => "tc-1",
    },
  } as unknown as RuntimeRoot;
}
```

`tests/cancelled-by-session-shutdown-note.test.ts:159-186`:
```ts
function recordingPi(log: RecordedMessage[]): ExtensionAPI {
  return {
    sendMessage: (message: RecordedMessage): void => {
      log.push(message);
    },
  } as unknown as ExtensionAPI;
}

function promptTheta(): ThetaCompositionInput {
  const frontmatter: ParsedFrontmatter = { mode: "prompt" } as ParsedFrontmatter;
  return {
    slashName: THETA_NAME,
    sourcePath: "/theta/demo.theta",
    frontmatter,
    body: { statements: [], tail: null } as unknown as ThetaBody,
  };
}

/** The dispatch ctx the DRIVE seam threads: `signal: undefined` is the
 *  documented idle-entry the cancel-forwarding tolerates. */
function driveCtx(): ExtensionCommandContext {
  return { signal: undefined, cwd: "/tmp" } as unknown as ExtensionCommandContext;
}

/** Flush pending microtasks/macrotasks so `run` reaches the parked body. */
const tick = (): Promise<void> =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));
```

`tests/post-deadline-dual-surface.test.ts:142-168` (identical `recordingPi`,
`promptTheta`, `driveCtx`, `tick`):
```ts
function recordingPi(log: RecordedMessage[]): ExtensionAPI {
  return {
    sendMessage: (message: RecordedMessage): void => {
      log.push(message);
    },
  } as unknown as ExtensionAPI;
}

function promptTheta(): ThetaCompositionInput {
  const frontmatter: ParsedFrontmatter = { mode: "prompt" } as ParsedFrontmatter;
  return {
    slashName: THETA_NAME,
    sourcePath: "/theta/demo.theta",
    frontmatter,
    body: { statements: [], tail: null } as unknown as ThetaBody,
  };
}

/** The dispatch ctx the DRIVE seam threads: `signal: undefined` is the
 *  documented idle-entry the cancel-forwarding tolerates. */
function driveCtx(): ExtensionCommandContext {
  return { signal: undefined, cwd: "/tmp" } as unknown as ExtensionCommandContext;
}

/** Flush pending microtasks/macrotasks so `run` reaches the parked body. */
const tick = (): Promise<void> =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));
```

## Why this is a problem
Two files driving the documented same seam (`createProductionProducerDeps` /
`composeThetaFixture.run` / `runSessionShutdown` over a shared
`ActiveInvocationRegistry`, per each file's own header) each independently
author the identical `PassthroughCheckpoint`, `rootWithIds`, `recordingPi`,
`promptTheta`, `driveCtx`, and `tick` scaffolding. The sibling-file
relationship is not inferred — `tests/post-deadline-dual-surface.test.ts`'s
own comment names `tests/cancelled-by-session-shutdown-note.test.ts` as the
file whose cells this one extends.

## Suggested direction (non-binding, optional)
A shared `tests/helpers/` module for this bug-0073/bug-0208 clean-cancel
dispatch scaffolding (`PassthroughCheckpoint`, `rootWithIds`, `recordingPi`,
`promptTheta`, `driveCtx`, `tick`) would let both files import one
declaration instead of two; the already-filed `shutdownDeps`/sink-builder
duplication candidate for the same file pair would naturally sit beside it.

## False-positive check
- Recording-double carve-out: `recordingPi` is a recording double, but the
  finding is about the double's declaration being duplicated verbatim across
  files, not about a MUST-NOT witness assertion built on it; the
  negative-witness carve-out does not apply.
- Gate-pin carve-out: neither file matches `*gate*.test.ts` or the named gate
  kin.
- docs/bugs/ signature search: this finding does not allege either test is a
  red or a skip; both files describe passing, HEAD-red-until-fix witnesses of
  their own respective bugs (0073, 0208), and this finding is scoped to their
  shared scaffolding only.
- coverage-matrix/bug-doc citation search: `grep -rn "recordingPi\|promptTheta\|PassthroughCheckpoint\|rootWithIds"
  docs/reference/coverage-matrix.md` — no hits; none of these functions are
  cited by name, so no merge/rename/delete proposal is implicated (and none
  is made here — this finding proposes only naming a shared home for the
  scaffolding, not touching either file's test bodies).
- Duplicate-candidate check: searched `quality/intake/` for prior candidates
  naming these same functions (`grep -rl "recordingPi\|PassthroughCheckpoint"
  quality/intake`) — only this file's own content matched; the sibling
  `shutdownDeps` duplication for the same file pair is already filed as
  `qw20260917154546-d7-01-shutdowndeps-harness-duplicated.md` and is
  explicitly excluded from this finding's evidence to avoid re-filing it.
- Coverage drift check: this finding does not claim any behaviour is
  untested; both files' distinct cells (bug 0073's five, bug 0208's
  post-deadline arm) are untouched by this observation.

## Triage
<!-- triage appends its note here -->
verdict: confirmed — re-verified independently: PassthroughCheckpoint (5 lines) and the recordingPi/promptTheta/driveCtx/tick block (28 lines) diff byte-identical between tests/cancelled-by-session-shutdown-note.test.ts:130-134/159-186 and tests/post-deadline-dual-surface.test.ts:118-122/142-169, rootWithIds differs only by the bug-0383 `clock: new FakeClock()` field as stated, coverage-matrix grep reproduces 0 hits, bug docs 0073/0208/0383/0432/0468 pin file names only and no merge/rename/delete is proposed, both sites in tests/ with no gate or negative-witness carve-out; not a duplicate — resolved PTQ-0403 cited only active-invocation-binder-window/wiring, and its fix created tests/helpers/fixture-dispatch-harness.ts:145-182 exporting PassthroughCheckpoint/promptTheta/driveCtx/tick byte-identical to these copies, which neither cited file imports (both import only ./helpers/fake-clock), so this is an unmigrated residual of that harness (PTQ-0228/PTQ-0301 precedent); note the candidate's suggested direction is stale — the shared home already exists — and its dedupe check searched only quality/intake, missing PTQ-0403; the helper's rootWith("inv-1", no clock) is not a drop-in for rootWithIds (triage: claude-fable-5-1)
