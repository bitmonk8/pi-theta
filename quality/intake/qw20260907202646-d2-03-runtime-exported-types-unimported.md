---
id: pending
title: Nine exported type declarations in slash-dispatch.ts, runtime-panics.ts and subagent-child-hash-verify.ts are named only inside their own declaring module — no file in src/, extensions/, tools/ or tests/ imports any of them
lens: D2
status: intake
verdict: pending
locations:
  - src/runtime/slash-dispatch.ts:52
  - src/runtime/slash-dispatch.ts:55-62
  - src/runtime/slash-dispatch.ts:65-70
  - src/runtime/slash-dispatch.ts:110
  - src/runtime/slash-dispatch.ts:136-146
  - src/runtime/slash-dispatch.ts:149-152
  - src/runtime/runtime-panics.ts:396-398
  - src/runtime/subagent-child-hash-verify.ts:103-106
  - src/runtime/subagent-child-hash-verify.ts:109-121
sites: 9
fix_scope: cross-module
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# Nine exported type declarations in slash-dispatch.ts, runtime-panics.ts and subagent-child-hash-verify.ts are named only inside their own declaring module — no file in src/, extensions/, tools/ or tests/ imports any of them

## Observation
Nine `export type` / `export interface` declarations across three runtime
modules are referenced exactly once or twice each, inside the file that
declares them, as the parameter or return annotation of a function or as a
field type of a sibling declaration. No import statement anywhere in the
repository names any of the nine. Neighbouring declarations in the same three
files ARE imported by tests (`SlashTurnOutcome`, `SlashPromptDriveDeps`,
`ChildClosureDiscovery`), so the modules' export surface is otherwise
consumed; these nine `export` keywords reach nothing.

## Evidence
src/runtime/slash-dispatch.ts:52 — `SlashCallerKind`; its only in-repository
use is the `caller` field of `NoParamsDispatchInput` immediately below:
```ts
export type SlashCallerKind = "slash" | "invoke" | "tool";
```

src/runtime/slash-dispatch.ts:55-62 — `NoParamsDispatchInput`; its only use is
the first parameter of `dispatchNoParamsTheta` in the same file:
```ts
export interface NoParamsDispatchInput {
  /** The theta's slash name (its filename stem), e.g. `greet`. */
  readonly name: string;
  /** The raw slash-argument text after the command name (untrimmed). */
  readonly rawArgs: string;
  /** Which invocation path reached the theta. */
  readonly caller: SlashCallerKind;
}
```

src/runtime/slash-dispatch.ts:65-70 — `NoParamsDispatchDeps`; its only use is
the second parameter of the same function:
```ts
export interface NoParamsDispatchDeps {
  /** Emit the overflow `theta-system-note` (before the theta runs). */
  readonly emitOverflowNote: (note: string) => void;
  /** Run the theta body (always invoked — the note never blocks execution). */
  readonly run: () => Promise<void>;
}
```

src/runtime/slash-dispatch.ts:110 — `PromptTurnKind`; its only use is the
parameter of `rendersTranscriptCard` at :117 in the same file:
```ts
export type PromptTurnKind = "user_visible" | "forced_respond";
```

src/runtime/slash-dispatch.ts:136-140 — `SlashPromptPi`; its only use is the
`pi` field of `SlashPromptDriveDeps` in the same file:
```ts
export interface SlashPromptPi {
  /** Issue the rendered query text as one streamed user-visible prompt turn. */
  sendUserMessage(content: string): void;
  /** Append a `theta-system-note` (the failure / cancellation surface). */
  sendMessage(message: {
```

src/runtime/slash-dispatch.ts:149-152 — `SlashPromptCtx`; its only use is the
`ctx` field of `SlashPromptDriveDeps`:
```ts
export interface SlashPromptCtx {
  /** Resolves only after the driven turn goes idle (its `agent_end`). */
  waitForIdle(): Promise<void>;
}
```

src/runtime/runtime-panics.ts:396-398 — `QuestionResult`; its only use is the
return annotation of `evaluateQuestion` in the same file:
```ts
export type QuestionResult =
  | { readonly kind: "value"; readonly value: ThetaValue }
  | { readonly kind: "propagate"; readonly err: ThetaValue };
```

src/runtime/subagent-child-hash-verify.ts:103-106 —
`ChildCallableVerification`; its only two uses are the `outcomes` field of
`ChildHashVerifyResult` directly below (:113) and the local accumulator inside
`verifyChildCallableHashes` (:141), both in this same file:
```ts
export interface ChildCallableVerification {
  readonly callableName: string;
  readonly verification: CallableHashVerification;
}
```

src/runtime/subagent-child-hash-verify.ts:109-113 — `ChildHashVerifyResult`;
its only use is the return annotation of `verifyChildCallableHashes` in the
same file:
```ts
export interface ChildHashVerifyResult {
  /** `true` iff this process is a subagent child carrying marshalled hashes. */
  readonly active: boolean;
  /** Per-callable outcomes (empty when inactive). */
  readonly outcomes: readonly ChildCallableVerification[];
```

Reference counts. For each of the nine names, `grep -rn "<name>" .
--exclude-dir=node_modules --exclude-dir=.git --exclude-dir=quality`
(unrestricted by extension) returns only: the declaration and its single
in-file use, plus the generated `dist/src/runtime/*.d.ts` mirror of the same
two lines; `SlashPromptPi` additionally appears in
docs/bugs/0401-matrixless-notes-fabricate-event-key.md and a
.pi/tmp fix report. No `.ts` file outside the declaring module names any of
them.

## Why this is a problem
Dead export surface: the `export` modifier on each of these nine declarations
reaches no consumer. In TypeScript an interface used only as an annotation
inside its own file needs no `export`, so each keyword publishes a name that
nothing can be shown to import — the module's public shape is wider than any
caller uses, and a reader auditing "what does this module offer?" is given
nine entries that no dependency exercises.

## Suggested direction (non-binding, optional)
The mechanical question is per declaration: whether the name is part of a
surface a caller is expected to spell (in which case a caller should exist) or
purely an internal annotation (in which case the `export` is what is
surplus). The fix stage owns which of the two each of the nine is.

## False-positive check
- Identifier searches: for each of the nine names, `grep -rn "\b<name>\b"
  --include=*.ts --include=*.js src extensions tools` and `grep -rn
  "\b<name>\b" --include=*.ts tests` — every hit is inside the declaring
  module. Counts outside the declaring module: `QuestionResult` 0,
  `SlashCallerKind` 0, `NoParamsDispatchInput` 0, `NoParamsDispatchDeps` 0,
  `PromptTurnKind` 0, `SlashPromptPi` 0, `SlashPromptCtx` 0,
  `ChildCallableVerification` 0, `ChildHashVerifyResult` 0.
- Whole-repository search (any file type, excluding node_modules/.git/quality)
  for each name: only the declaring `.ts` file, its generated `dist/*.d.ts`
  mirror, and — for `SlashPromptPi` — two prose documents. No `.ts` importer.
- Dynamic / string-keyed access: types have no runtime representation, so no
  string-keyed access can reach them; nonetheless the quoted spellings
  (`"SlashPromptPi"` etc.) were searched across src/, extensions/, tools/,
  tests/ with no hits.
- Re-export check: `grep -rn "export \*" --include=*.ts src extensions tools
  tests` → no hits anywhere in the repository, so no barrel file can be
  re-exporting these under another path.
- Tests-are-callers check: three sibling declarations in the same three files
  ARE imported by tests (`SlashTurnOutcome` and `SlashPromptDriveDeps` by
  tests/slash-dispatch.test.ts and
  tests/b0401-informational-notes-omit-details.test.ts;
  `ChildClosureDiscovery` by tests/subagent-child-hash-verify.test.ts) and are
  deliberately EXCLUDED from this finding. The nine listed here have no test
  reference either, so the "tests are legitimate callers" carve-out does not
  apply to them.
- Adjacent already-filed finding: `EnvelopeLine` / `ThetaResultPayload` in
  subagent-envelope.ts are the same shape of observation and are already filed
  (qw20260907130901-d2-01-envelope-line-payload-types-unreferenced.md); they
  are excluded here rather than re-counted.

## Triage
