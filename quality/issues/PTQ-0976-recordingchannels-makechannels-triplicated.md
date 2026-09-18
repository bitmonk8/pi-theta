---
id: PTQ-0976
title: The RecordingChannels/makeChannels() runtime-event-and-diagnostic recording double is redeclared byte-identically in three swallowing-handler test files, including the in-scope invoke-swallowing-handler.test.ts
lens: D7
status: open
verdict: confirmed
locations:
  - tests/invoke-swallowing-handler.test.ts:44-66
  - tests/query-swallowing-handler.test.ts:48-70
  - tests/tool-calls-swallowing-handler.test.ts:48-70
sites: 3
fix_scope: cross-module
d4_class: clone
wave: qw20260918131151
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# The RecordingChannels/makeChannels() runtime-event-and-diagnostic recording double is redeclared byte-identically in three swallowing-handler test files, including the in-scope invoke-swallowing-handler.test.ts

## Observation
tests/invoke-swallowing-handler.test.ts declares a module-scope
`RecordingChannels` interface (a `channels`/`events`/`diagnostics` triple) and
a `makeChannels()` builder that allocates two arrays, wires a
`*SideChannels`-shaped object whose `emitRuntimeEvent`/`emitDiagnostic`
methods push onto those arrays, and returns the triple. The identical
five-field/nine-line shape — same field order, same two method bodies, same
return statement — is independently redeclared in
tests/query-swallowing-handler.test.ts and
tests/tool-calls-swallowing-handler.test.ts, differing only in the
`*SideChannels` type name each file's own production import supplies
(`InvokeExecutionSideChannels` / `QueryProviderSideChannels` /
`ToolExecuteSideChannels`). No module under `tests/helpers/` exports this
recording double.

## Evidence
tests/invoke-swallowing-handler.test.ts:44-66 (re-read immediately before
filing):
```ts
// --- recording side channels + unhandledRejection trap ----------------------

interface RecordingChannels {
  readonly channels: InvokeExecutionSideChannels;
  readonly events: RuntimeEvent[];
  readonly diagnostics: Diagnostic[];
}

function makeChannels(): RecordingChannels {
  const events: RuntimeEvent[] = [];
  const diagnostics: Diagnostic[] = [];
  const channels: InvokeExecutionSideChannels = {
    emitRuntimeEvent: (event): void => {
      events.push(event);
    },
    emitDiagnostic: (diagnostic): void => {
      diagnostics.push(diagnostic);
    },
  };
  return { channels, events, diagnostics };
}
```

tests/query-swallowing-handler.test.ts:48-70 — identical apart from the
`*SideChannels` type name:
```ts
interface RecordingChannels {
  readonly channels: QueryProviderSideChannels;
  readonly events: RuntimeEvent[];
  readonly diagnostics: Diagnostic[];
}

function makeChannels(): RecordingChannels {
  const events: RuntimeEvent[] = [];
  const diagnostics: Diagnostic[] = [];
  const channels: QueryProviderSideChannels = {
    emitRuntimeEvent: (event): void => {
      events.push(event);
    },
    emitDiagnostic: (diagnostic): void => {
      diagnostics.push(diagnostic);
    },
  };
  return { channels, events, diagnostics };
}
```

tests/tool-calls-swallowing-handler.test.ts:48-70 — identical apart from the
`*SideChannels` type name:
```ts
interface RecordingChannels {
  readonly channels: ToolExecuteSideChannels;
  readonly events: RuntimeEvent[];
  readonly diagnostics: Diagnostic[];
}

function makeChannels(): RecordingChannels {
  const events: RuntimeEvent[] = [];
  const diagnostics: Diagnostic[] = [];
  const channels: ToolExecuteSideChannels = {
    emitRuntimeEvent: (event): void => {
      events.push(event);
    },
    emitDiagnostic: (diagnostic): void => {
      diagnostics.push(diagnostic);
    },
  };
  return { channels, events, diagnostics };
}
```

Search performed: `grep -n "interface RecordingChannels" tests/*.ts` → exactly
these three files; `grep -n "function makeChannels" tests/*.ts` → the same
three files, no others. `grep -rl "RecordingChannels\|makeChannels" tests/helpers/*.ts` →
0 hits.

## Why this is a problem
The same "allocate two arrays, wire a `*SideChannels`-shaped recording object
whose two emit methods push onto them, return the triple" double is typed out
independently in three files rather than declared once and imported. All
three files already import the sibling `createUnhandledRejectionTrap` /
`settleAndObserve` pair from `tests/helpers/unhandled-rejection-trap.ts` in
the very next block, so the files already share one helper module for this
exact test family, but the `RecordingChannels`/`makeChannels()` recording
double sits beside it, hand-copied three times, with no `tests/helpers/`
export backing it.

## Suggested direction (non-binding, optional)
A small factory taking the two emit methods generically (or one per concrete
`*SideChannels` type, given each file's production import differs) would sit
naturally beside `createUnhandledRejectionTrap`/`settleAndObserve` in
`tests/helpers/unhandled-rejection-trap.ts`, or a sibling module in the same
directory these three files already import from.

## False-positive check
- Gate-pin check: none of the three files matches `*gate*.test.ts` or the
  named gate kin; the cited lines are a recording-double setup block, not a
  pinned count or inventory.
- Recording-double check: `events`/`diagnostics` ARE legitimate recording
  doubles backing this file family's "no second `RuntimeEvent` and no
  diagnostic of any severity" MUST-NOT witnesses (`expect(events).toEqual([])`,
  `expect(diagnostics).toEqual([])`) — that validity is not challenged here.
  This finding is about the SETUP/CONSTRUCTION code that builds and wires the
  double being independently retyped three times, not about the assertions
  the double backs.
- docs/bugs/ signature search: `grep -rl "invoke-swallowing-handler\|query-swallowing-handler\|tool-calls-swallowing-handler" docs/bugs/*.md` →
  0 hits by exact filename; a broader `grep -rl "swallowing-handler"
  docs/bugs/*.md` hits only docs/bugs/0477, which mentions the CANCEL-3
  "swallowing-handler" feature name in prose, not any of these three test
  files. No open bug document discusses this duplication or gives a
  documented correct-reason for three separate copies, and this finding
  proposes no merge, rename, or deletion of any of the three files or any
  `it()`/`describe()`.
- coverage-matrix/bug-doc citation search: `grep -n "invoke-swallowing-handler\|query-swallowing-handler\|tool-calls-swallowing-handler" docs/reference/coverage-matrix.md` →
  0 hits.
- Prior-finding search: `grep -rli "RecordingChannels\|makeChannels" quality/issues quality/resolved quality/intake` →
  0 hits before this filing (resolved PTQ-0514 covers the sibling
  `unhandledRejection` trap + `settleAndObserve` block in the same three
  files, already fixed via the shared `tests/helpers/unhandled-rejection-trap.ts`
  import visible in the excerpts above, but does not mention
  `RecordingChannels`/`makeChannels`, which is a distinct block immediately
  above it).
- Coverage-drift check: this claim is about a recording-double DEFINITION
  repeated across files that already exist and already pass; it makes no
  claim that any behaviour or path is untested.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: all three excerpts reproduce (interface at invoke:48-53 / query:52-57 / tool-calls:52-57, `makeChannels()` at :54-66 / :58-70 / :58-70, within the cited ranges' comment-header drift), a mktemp `diff` of the three 19-line blocks shows exactly the two `*SideChannels` type-name lines differing and nothing else, and the three production types `InvokeExecutionSideChannels` (invoke-swallowing-handler.ts:72-77), `QueryProviderSideChannels` (query-swallowing-handler.ts:75-80) and `ToolExecuteSideChannels` (tool-call-swallowing-handler.ts:78-83) are structurally identical `{emitRuntimeEvent, emitDiagnostic}` pairs, so one shared factory satisfies all three without a cast; every copy is live (5 `makeChannels()` call sites per file); the candidate's stated greps reproduce as stated (`interface RecordingChannels` / `function makeChannels` → exactly these 3 files, tests/helpers/ → 0), but they are literal-name searches and miss a renamed-only fourth copy — tests/cancellation-core.test.ts:288-306 `SubstrateRecording`/`makeSubstrateChannels()` is the same 19-line body against the structurally identical `SubstrateSideChannels` (cancellation-core.ts:283-286), 3 live call sites — which should be folded into the location list at acceptance (sites: 4; not a ≥3× misdescription, same root cause); session-control-adapters.test.ts:42-45 `noopChannels` is a no-op sink, not a recording double, and is not a copy; D7 copy-paste-double class, all sites under tests/, no gate file, the events/diagnostics negative witnesses are not challenged, no merge/rename/delete proposed, docs/bugs and coverage-matrix greps → 0 reproduce; not tracked elsewhere (resolved PTQ-0514 is the adjacent trap/settleAndObserve block, PTQ-0575 is ScriptedCheckpoint, PTQ-0690 is the abort-race wrapper, PTQ-0643/0677/0688 are SentNote/RecordingBus doubles with different shapes) — fix is a mechanical hoist to a tests/helpers module (triage: claude-fable-5-1)
