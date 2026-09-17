---
id: PTQ-0667
title: fakeHostApi/fakeEntry/ARGS harness re-typed identically across execution-status-progress-tool and execution-status-progress-wire
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/execution-status-progress-tool.test.ts:45-58
  - tests/execution-status-progress-tool.test.ts:95-102
  - tests/execution-status-progress-tool.test.ts:134
  - tests/execution-status-progress-wire.test.ts:28-37
  - tests/execution-status-progress-wire.test.ts:39-48
  - tests/execution-status-progress-wire.test.ts:72
sites: 2
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# fakeHostApi/fakeEntry/ARGS harness re-typed identically across execution-status-progress-tool and execution-status-progress-wire

## Observation
`tests/execution-status-progress-tool.test.ts` and `tests/execution-status-progress-wire.test.ts` both drive `registerThetaProgressTool` from `src/extension/execution-status/progress-tool.ts` (the same production entry point, same `ProgressToolDeps` type) and each declares its own copy of a `fakeHostApi()` factory, a `fakeEntry()` factory, and an identical `const ARGS: ThetaProgressParams` literal. The two `fakeHostApi` bodies are identical modulo formatting; the two `fakeEntry` bodies are identical modulo a default `invocationId` string and optional-overrides support; the `ARGS` line is character-for-character identical in both files.

## Evidence
`tests/execution-status-progress-tool.test.ts:45-58`:
```ts
function fakeHostApi(): {
  hostApi: { registerTool: (t: ToolDefinition<typeof THETA_PROGRESS_PARAMETERS>) => void };
  calls: ToolDefinition<typeof THETA_PROGRESS_PARAMETERS>[];
} {
  const calls: ToolDefinition<typeof THETA_PROGRESS_PARAMETERS>[] = [];
  return {
    hostApi: {
      registerTool: (t): void => {
        calls.push(t);
      },
    },
    calls,
  };
}
```

`tests/execution-status-progress-wire.test.ts:28-37` (same factory, reformatted):
```ts
function fakeHostApi(): {
  hostApi: { registerTool: (t: ToolDefinition<typeof THETA_PROGRESS_PARAMETERS>) => void };
  calls: ToolDefinition<typeof THETA_PROGRESS_PARAMETERS>[];
} {
  const calls: ToolDefinition<typeof THETA_PROGRESS_PARAMETERS>[] = [];
  return {
    hostApi: { registerTool: (t): void => { calls.push(t); } },
    calls,
  };
}
```

`tests/execution-status-progress-tool.test.ts:95-102`:
```ts
function fakeEntry(): ActiveInvocationEntry {
  return {
    thetaAbort: new AbortController(),
    disposeBarrier: Promise.resolve(),
    shutdownReason: undefined,
    theta: "quality-loop",
    invocationId: "inv-1",
  };
}
```

`tests/execution-status-progress-wire.test.ts:39-48`:
```ts
function fakeEntry(overrides: Partial<ActiveInvocationEntry> = {}): ActiveInvocationEntry {
  return {
    thetaAbort: new AbortController(),
    disposeBarrier: Promise.resolve(),
    shutdownReason: undefined,
    theta: "quality-loop",
    invocationId: "root-inv",
    ...overrides,
  };
}
```

`tests/execution-status-progress-tool.test.ts:134` and `tests/execution-status-progress-wire.test.ts:72`, byte-identical:
```ts
const ARGS: ThetaProgressParams = { message: "built 3 of 12", scope: "fix", done: 3, total: 12 };
```

Exact search: `grep -n "function fakeHostApi\|function fakeEntry" tests/*.test.ts` returns exactly these two files, one instance of each function per file (four total function declarations across two files); `grep -n "const ARGS: ThetaProgressParams" tests/execution-status-progress-tool.test.ts tests/execution-status-progress-wire.test.ts` returns exactly one hit per file, both with the identical literal.

## Why this is a problem
Both files test the same `registerThetaProgressTool` production function against the same `ProgressToolDeps` shape, described in their own header comments as siblings covering "Behaviour-matrix rows L3-B1 .. L3-B17" (progress-tool) and "L3-B18 .. L3-B30" (progress-wire) of the same RFC 0010 Layer L3 contract. The `fakeHostApi`/`fakeEntry`/`ARGS` trio each file needs to drive that shared entry point is typed twice rather than shared, with the wire file's version being a strict superset (default-argument + overrides) of the tool file's version.

## Suggested direction (non-binding, optional)
A small shared module under tests/helpers/ (or a local re-export from one file into the other) carrying `fakeHostApi`, `fakeEntry`, and the shared `ARGS` fixture would let both L3-B-row files import the common scaffold and keep only their own bus/wire-specific doubles (`fakeBus`, `childDeps`, etc., which already differ per file and are not part of this observation).

## False-positive check
Gate-pin check: neither file matches `*gate*.test.ts` or the named gate kinds. Recording-double check: `fakeHostApi`'s `calls` array and `fakeEntry`'s static entry are ordinary stand-ins for the drive, not "never called" negative witnesses, so the recording-double carve-out does not apply to the duplication claim. docs/bugs/ signature search: `grep -rl "progress-tool\|progress-wire" docs/bugs` found no matching bug doc that ratifies keeping the harness duplicated. coverage-matrix/bug-doc citation search: `grep -n "execution-status-progress-tool\|execution-status-progress-wire" docs/reference/coverage-matrix.md` returned no hits — neither file is cited by name, so no merge/rename/delete concern applies. Coverage: not claimed — both files already assert their own rows; this is only about the repeated harness code.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all six excerpts match byte-for-byte at the cited lines; fakeHostApi bodies differ only in formatting, fakeEntry only in default invocationId ("inv-1" vs "root-inv") plus the wire copy's overrides spread, ARGS is byte-identical; grep confirms one fakeHostApi + one fakeEntry declaration in exactly these two files and nowhere else (the filing's literal pattern also prefix-hits fakeEntryChannel/fakeEntryPi, 6 hits/3 files not 4/2 — immaterial), both files born in the same commit 1f45d654 as the only two test drivers of registerThetaProgressTool, no tests/helpers/* offers a recording registerTool double or an ActiveInvocationEntry factory (compose-workspace-harness.ts:77 / runtime-belt-probe-harness.ts:202 are no-op stubs), not a gate test, not a negative witness, coverage-matrix has no hit and bug 0477's witness citation of progress-tool.test.ts is untouched by a helper extraction; D7 copy-paste fixture/double, no prior PTQ row shares this root cause (triage: claude-fable-5-1)
