---
id: PTQ-1096
title: types.ts header names only 3 of the 8 files that import it, several of which are behavioural
lens: D2                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/execution-status/types.ts:1-4
  - src/extension/execution-status/progress-tool.ts:1-40
  - src/extension/execution-status/status-command.ts:1-14
  - src/extension/execution-status/widget-sink.ts:14-21
sites: 1
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260920183643
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-20
---

# types.ts header names only 3 of the 8 files that import it, several of which are behavioural

## Observation
`types.ts`'s module header states "No behaviour lives here; `bus.ts`,
`checkpoint-decorator.ts`, and `child-tap.ts` are the behavioural leaves,"
naming exactly three files as the closed set of behavioural consumers of this
type surface. Grepping the directory for `from "./types"` shows eight files
import from `types.ts`, not three: `bus.ts`, `checkpoint-decorator.ts`,
`child-tap.ts`, `entry-channel.ts`, `footer-sink.ts`, `progress-tool.ts`,
`status-command.ts`, and `widget-sink.ts`. Four of the five omitted files
(`entry-channel.ts`, `footer-sink.ts`, `progress-tool.ts`, `status-command.ts`,
`widget-sink.ts`) implement real behaviour over these types — a `StatusSink`
renderer, an author-facing tool executor, or a slash-command handler — not a
thin type-only re-export.

## Evidence
`src/extension/execution-status/types.ts:1-4`:
```
// RFC 0010 (execution-status.md, EXST-1..12) — the shared, closed type surface
// for the execution-status bus, its producer payloads, sink contract, and the
// frozen caps/tuning constants. No behaviour lives here; `bus.ts`,
// `checkpoint-decorator.ts`, and `child-tap.ts` are the behavioural leaves.
```

Search used: `grep -l "from \"\./types\"" src/extension/execution-status/*.ts`,
which returns exactly these 8 files:
```
src/extension/execution-status/bus.ts
src/extension/execution-status/checkpoint-decorator.ts
src/extension/execution-status/child-tap.ts
src/extension/execution-status/entry-channel.ts
src/extension/execution-status/footer-sink.ts
src/extension/execution-status/progress-tool.ts
src/extension/execution-status/status-command.ts
src/extension/execution-status/widget-sink.ts
```

Two of the omitted files are in this review's scope and are unambiguously
behavioural, not type-only:

`src/extension/execution-status/progress-tool.ts:391-411` (`registerThetaProgressTool`
registers the `theta_progress` tool and dispatches `executeThetaProgress`,
which reads `ProgressToolDeps`/`ProgressAuthorMessage` from `./types`):
```
export function registerThetaProgressTool(
  hostApi: ProgressToolHostApi,
  deps: ProgressToolDeps,
): ThetaProgressRegistration {
  ...
  hostApi.registerTool(definition);
  return {
    codeSideExecute: async (_toolCallId, params) => {
      executeThetaProgress(params as ThetaProgressParams, deps, state);
      return CODE_SIDE_OK;
    },
  };
}
```

`src/extension/execution-status/status-command.ts:11,50-66` (`registerThetaStatusCommand`
registers `/theta-status` and calls `bus.setViewShape`, `ExecutionStatusBus`/
`ViewShape` imported from `./types`):
```
import type { ExecutionStatusBus, ViewShape } from "./types";
...
export function registerThetaStatusCommand(
  hostApi: StatusCommandPi,
  deps: RegisterThetaStatusCommandDeps,
): void {
  ...
  hostApi.registerCommand(THETA_STATUS_COMMAND_NAME, {
    ...
    handler: async (args: string, commandCtx: StatusCommandCtx): Promise<void> => {
      const view = parseThetaStatusArg(args);
      ...
      bus.setViewShape(view);
    },
  });
}
```

`src/extension/execution-status/widget-sink.ts:14-21` (`createWidgetSink`
implements the `StatusSink` render/clear contract from `./types`):
```
import type {
  ExecutionStatusSnapshot,
  InvocationNodeSnapshot,
  ProgressVerbosity,
  StatusSink,
  ViewShape,
} from "./types";
import type { ProgressAuthorMessage } from "./types";
```

## Why this is a problem
The header's "the behavioural leaves" phrasing asserts a closed, exhaustive
roster of three files. That roster no longer matches the current file set:
five more files under `src/extension/execution-status/` import from
`types.ts`, and at least three of them (`progress-tool.ts`, `status-command.ts`,
`widget-sink.ts` — all in this review's scope) are themselves behavioural
leaves by the same standard the header uses for `bus.ts`/`child-tap.ts`
(each registers a host-facing capability and drives real logic, not a
pass-through of the type surface). A reader relying on the header to locate
"where the behaviour lives" is misdirected away from three files that host
genuine RFC-0010 logic.

## Suggested direction (non-binding, optional)
Widen the header's roster to name the full current set of behavioural
consumers, or drop the closed-set framing in favour of a pointer to the
directory itself.

## False-positive check
- `grep -l "from \"\./types\"" src/extension/execution-status/*.ts` — 8 hits
  (listed above), not 3.
- Read `progress-tool.ts`, `status-command.ts`, `widget-sink.ts` in full:
  each implements real dispatch/render logic over the `./types` imports, not
  a re-export.
- No re-export shape involved (the header does not claim these are re-export
  files) — this is a collaborator-roster claim, checked directly against the
  current import graph of the directory.
- Not a git-history question: the claim is checked against the present file
  set, which mechanically contradicts the "the behavioural leaves" closed
  enumeration.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — header lines 1-4 reproduce verbatim; the stated grep reproduces exactly 8 importers of ./types, and footer-sink/widget-sink/progress-tool/status-command/entry-channel each host real behaviour (StatusSink render+gate, registerTool/execute, registerCommand handler, appendEntry channel) over those imports, so "the behavioural leaves" names 3 of ≥7 behavioural consumers; blame (1dad42ac) shows footer-sink, widget-sink and status-command already imported ./types when the header was written, so the roster was incomplete at birth and then drifted further when progress-tool.ts (1f45d654) and entry-channel's ProgressMilestone import landed — the filing's "no longer matches" is imprecise on cause but the misdescribing closed roster is real either way; not a duplicate: PTQ-0414 (D9, ChildTapEvent misplacement) only quotes this sentence, and no other PTQ cites types.ts:1-4 (triage: claude-fable-5-1)
