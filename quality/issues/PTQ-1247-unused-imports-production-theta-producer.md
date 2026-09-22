---
id: PTQ-1247
title: Four named imports in production-theta-producer.ts are never referenced in the file
lens: D2
status: open
verdict: confirmed
locations:
  - src/extension/production-theta-producer.ts:124
  - src/extension/production-theta-producer.ts:205
  - src/extension/production-theta-producer.ts:243
sites: 4
fix_scope: localized
wave: qw20260922150013
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# Four named imports in production-theta-producer.ts are never referenced in the file

## Observation
`production-theta-producer.ts` imports `ToolResultMessage` (a type from `@earendil-works/pi-ai`), `filterJoinToolText` and `lowerToolExecuteThrow` (from `../runtime/tool-call-execute`), and `guardQueryProviderPromise` (from `../runtime/query-swallowing-handler`). None of these four identifiers appears anywhere else in the 6477-line file — not as a call, a type annotation, a re-export, or a string-keyed reference. Their sibling imports from the same modules (e.g. `guardToolExecutePromise`, `guardInvokeExecutionPromise`, other members of the `Api`/`AssistantMessage`/`Message` type-import group, other members of `tool-call-execute`'s type import) are all read in the file.

## Evidence
`src/extension/production-theta-producer.ts:118-125`
```ts
import type {
  Api,
  AssistantMessage,
  Message,
  Model,
  ProviderResponse,
  ToolResultMessage,
} from "@earendil-works/pi-ai";
```

`src/extension/production-theta-producer.ts:199-205`
```ts
import type {
  AgentToolResultEnvelope,
  CodeSideToolCall,
  InProcessToolExecute,
  ToolLoweringSink,
} from "../runtime/tool-call-execute";
import { filterJoinToolText, lowerToolExecuteThrow } from "../runtime/tool-call-execute";
```

`src/extension/production-theta-producer.ts:241-244`
```ts
import { runCheckpointedBinderCall } from "../runtime/checkpoint-granularity";
import { runBinderCallWithCancellation } from "../binder/binder-cancellation";
import { guardToolExecutePromise } from "../runtime/tool-call-swallowing-handler";
import { guardQueryProviderPromise } from "../runtime/query-swallowing-handler";
```

Search: `grep -n "ToolResultMessage\|filterJoinToolText\|lowerToolExecuteThrow\|guardQueryProviderPromise" src/extension/production-theta-producer.ts` returns exactly one line per identifier — the import statement itself — with no other occurrence in the file (6477 lines).

## Why this is a problem
Each of these names is a live, exported production facility elsewhere (`filterJoinToolText`/`lowerToolExecuteThrow` are used by `tool-call-host-denial.ts` and `session-control-tools.ts`; `guardQueryProviderPromise` is used and tested from `query-swallowing-handler.ts`; `ToolResultMessage` is used by `compact-transcript.ts`), so none is itself dead code. But the import bindings inside `production-theta-producer.ts` are unreachable local names: nothing in this file evaluates them, so they carry no behavior here and are pure leftover references, most plausibly stranded by a prior refactor of the tool-call/query-swallowing dispatch paths that moved the call sites elsewhere in this file without removing the corresponding imports.

## Suggested direction (non-binding, optional)
Drop the four unused specifiers from their respective import statements in this file; no other file is affected since none of them is re-exported from here.

## False-positive check
Ran `grep -n "<identifier>" src/extension/production-theta-producer.ts` for each of the four identifiers individually: each returns exactly one match (the import line). Ran `grep -rn "<identifier>" src/ extensions/ tools/ tests/` excluding this file to confirm each identifier is genuinely used elsewhere (so the import target is not itself dead, only the binding in this file is unused) — confirmed for all four (`compact-transcript.ts`, `tool-call-host-denial.ts` + `session-control-tools.ts`, and `query-swallowing-handler.ts` + its test). Checked this file does not re-export via a wildcard that would cover these names: the only `export *` in the file is `export * from "./live-prompt-query-driver"`, unrelated to these three source modules. Confirmed the sibling imports from the same three import statements (e.g. `guardToolExecutePromise`, `guardInvokeExecutionPromise`, other `tool-call-execute` type members) are read in the file, so this is not a case where the whole import group is dead.

## Triage
verdict: confirmed — all three excerpts reproduce (241-244 drifted by one line), `grep -n` for each of the four identifiers in the 6477-line file returns exactly the import line, every sibling specifier in the same three import statements has 2-8 reads, the only `export *` is `./live-prompt-query-driver` (unrelated to the three source modules) so nothing re-exports these bindings through this file, each target is live elsewhere (compact-transcript/live-prompt-query-driver/sdk-inventory; tool-call-host-denial + session-control-tools; query-swallowing-handler + its test) so only the local bindings are dead, and `git log -S` shows the last call sites for all three runtime helpers left this file in 89faa7c5 (rfc 0012 step 7) without the specifiers being removed; no existing PTQ names this (PTQ-0012 is theta-document, PTQ-1150 is a D9 breakdown of this host) (triage: claude-fable-5-1)
