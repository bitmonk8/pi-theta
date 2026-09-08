---
id: PTQ-0071
title: Four runtime seam modules (runtime-event-channel, runtime-panics, slash-dispatch, stdlib-string) still carry tests-task headers narrating inert stubs that the paired implementation commits replaced
lens: D2                     # the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/runtime/runtime-event-channel.ts:10-15
  - src/runtime/runtime-panics.ts:26-34
  - src/runtime/slash-dispatch.ts:11-24
  - src/runtime/slash-dispatch.ts:36-40
  - src/runtime/stdlib-string.ts:26-40
sites: 5                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# Four runtime seam modules (runtime-event-channel, runtime-panics, slash-dispatch, stdlib-string) still carry tests-task headers narrating inert stubs that the paired implementation commits replaced

## Observation
Each of these modules was delivered as a tests-task/implementation pair (V9d-T
→ V9d, V4b-T → V4b, V12a-T → V12a, V3f-T → V3f). Each module header — and one
per-function doc in slash-dispatch.ts — still carries the tests-task paragraph
asserting, in present tense, that the file's behaviour-bearing functions are
inert or deliberately non-compliant stubs ("stubs every behaviour-bearing
function inertly", "a `computeMasked` that returns a sentinel id", "The V12a-T
stub returns a sentinel", "`evaluateStringMember` returns the inert `null`
sentinel"). Every named function in all four files is fully implemented today.

## Evidence
src/runtime/runtime-event-channel.ts:10-15:

```ts
// V9d-T (tests-task) declares the seam shapes and stubs every behaviour-bearing
// function inertly — builders that return a wrong-display / sentinel-content
// note, a `computeMasked` that returns a sentinel id, emit helpers that emit
// nothing, a `cascadeReemit` that strips `masked`, and a `dedupKey` that wrongly
// includes `masked` — so the failing tests red on their own primary assertions.
// The paired V9d implementation leaf fills these in.
```

All five claims are false of the current file: `computeMasked` (:124) returns
`["ceiling#2"]`/`undefined` per the PIC-1 predicate (:134-145), not a sentinel
id; `emitRuntimeEvent` (:309) and `emitPanic` (:325) both call
`sendSystemNote(...)`; `cascadeReemit` (:172-177) is `return { ...event };`
(copies `masked` verbatim rather than stripping it); `dedupKey` (:155-164)
stringifies only `kind`/`query_site`/`message`/`occurred_at` (excludes
`masked` rather than "wrongly includes" it).

src/runtime/runtime-panics.ts:26-34:

```ts
// V4b-T (tests-task) declares the seam — the `ThetaPanic` base and the five
// panic classes, the `evaluateIndexAccess` / `evaluateMemberAccess` /
// `enterInvokeFrame` accessor seams, the `evaluateQuestion` `?`-propagation
// seam, the `HostFatal` NOCEIL-3 marker, and the `surfaceUnexpectedThrow`
// runtime-defect surface — and stubs every behaviour-bearing function inertly
// so the failing tests red on their own primary assertions (an accessor that
// raises no panic, a `?` seam that neither propagates nor lets a panic through,
// and a runtime-defect surface that emits a wrong-code sentinel for every
// input). The paired V4b implementation leaf fills these in.
```

Current code: `evaluateIndexAccess` (:274) raises the real panics
(`NullIndexAccessPanic`, `IndexOutOfBoundsPanic`, …); `evaluateQuestion`
(:415-421) returns the real `value`/`propagate` outcomes;
`surfaceUnexpectedThrow` (:582) returns diagnostics carrying the registered
codes, not a wrong-code sentinel.

src/runtime/slash-dispatch.ts:11-24 (header) and :36-40 (per-function doc):

```ts
// V12a-T (tests-task) declares the seam shapes and stubs every behaviour-bearing
// function inertly / non-compliantly, so the failing V12a-T tests red on their
// own primary assertions:
//   - `renderNoParamsOverflowNote` returns a sentinel, not the SLSH-1 template;
//   - `dispatchNoParamsTheta` emits the overflow note UNCONDITIONALLY (ignoring
//     the trim-to-empty rule and the slash-path-only rule);
//   - `rendersTranscriptCard` reports EVERY turn kind as card-rendering,
//     including the off-session forced-respond turn (SLSH-2);
//   - `driveSlashPromptTurn` appends the failure/cancellation note WITHOUT
//     streaming the turn or awaiting `ctx.waitForIdle()` — the
//     buffer-then-append / note-before-prefix anti-pattern SLSH-2 forbids.
// The paired V12a implementation fills these in. No test reds on a compile
// error, a missing fixture, or a harness throw.
```

```ts
 * parameters`, with `<name>` interpolated. The V12a-T stub returns a sentinel
 * so the exact-string assertion reds.
 */
export function renderNoParamsOverflowNote(name: string): string {
```

Current code: `renderNoParamsOverflowNote` (:41-45) returns the normative
SLSH-1 template string; `dispatchNoParamsTheta` (:80-97) emits only on the
`slash` caller path and only when the trimmed remainder is non-empty;
`rendersTranscriptCard` (:117-122) returns `kind === "user_visible"`;
`driveSlashPromptTurn` (:169-190) streams via `sendUserMessage`, awaits
`ctx.waitForIdle()`, and appends the note only after, on non-`ok` outcomes.

src/runtime/stdlib-string.ts:26-40:

```ts
// V3f-T (tests-task) declares the seam — the `evaluateStringMember` runtime
// dispatcher and the `concatElementType` LUB computation — and stubs the
// behaviour-bearing functions inertly so the failing tests compile and red on
// their own primary assertions:
//
//   - `evaluateStringMember` returns the inert `null` sentinel without
//     evaluating any member, so every result-value assertion reds (a `length`
//     count, a transform string, a `boolean` membership result, a `split`
//     array, or a `replace` reference vector);
//   - `concatElementType` returns the inert `null`-primitive sentinel without
//     computing the LUB, so every result-type assertion reds.
```

Current code: `evaluateStringMember` (:167-218) dispatches all nine members;
`concatElementType` (:253-275) computes the real LUB via `checkCompatible`.

## Why this is a problem
Historical narration comments — a named D2 smell — asserting present-tense
falsehoods about the code they head. A reader of runtime-event-channel.ts is
told `dedupKey` "wrongly includes `masked`" when the shipped function's whole
point (PIC-1 clause g) is that it excludes it; a reader of slash-dispatch.ts is
told `renderNoParamsOverflowNote` returns a sentinel three lines above the body
that returns the normative template. The scaffolding's feature has landed: git
shows each tests-task commit followed immediately by its implementation commit
on the same file — V9d-T `66feddf6` → V9d `86d7bfbf`, V4b-T `10d797bd` → V4b
`ae94e2bf`, V12a-T `1387a73d` → V12a `49e44555`, V3f-T `3233b435` → V3f
`668616ab` — and none of the implementation commits retired the stub paragraphs.

## Suggested direction (non-binding, optional)
Rewrite each stub paragraph the way the same fix family's already-updated
siblings did (e.g. src/binder/binder-seed.ts:19's past-tense "V11e-T declared
this seam; V11e implemented it" form), or delete it; the delivery sequencing
already lives in git history. Comment-only change.

## False-positive check
- Current-code contradiction verified per named function: runtime-event-channel
  `computeMasked` :124-146, `dedupKey` :155-164, `cascadeReemit` :172-177,
  `emitRuntimeEvent` :309-319, `emitPanic` :325-334; runtime-panics
  `evaluateIndexAccess` :274+, `evaluateQuestion` :415-421,
  `surfaceUnexpectedThrow` :582+; slash-dispatch :41-45, :80-97, :117-122,
  :169-190; stdlib-string :167-218, :253-275 — every one implemented, none
  inert or sentinel-returning.
- Git intent: `git log --oneline --reverse` on each file shows the tests-task
  commit immediately followed by the implementation commit (hashes above); the
  implementation commits left the paragraphs in place.
- Duplicate check: grep over quality/intake for these four paths shows no
  stub-narration finding citing any of them. The already-filed stub-narration
  findings cover other files (qw20260907130901-d2-01: binder/* +
  diagnostics/diagnostic.ts; d2-05: tool-call.ts; d2-08:
  inventory-closure-audit.ts + load-pre-eval.ts; d2-09: discovery/* +
  placeholder.ts + drain-state.ts; qw20260907183353 d2-01/d2-03/d2-04/d2-07:
  lowering, render, type-seam, lexer-parser, factory, extension modules,
  parser seam). The stdlib finding qw20260907130901-d2-02-stdlib-dispatcher-
  docs-detached cites stdlib-string.ts:115-130 for a different root cause
  (detached dispatcher doc), not the :26-40 header.
- Behaviour check: comments only; no code, test, or tool reads these strings.
- Deliberate-convention check: milder present-tense "fills in" provenance
  sentences without false stub-behaviour claims (stdlib-array.ts:24-25,
  stdlib-object.ts:41-45, statement-executor.ts:3-4) were examined and
  deliberately NOT cited — this finding is confined to sites asserting inert
  or non-compliant behaviour that the current code contradicts.

## Triage
verdict: confirmed — all 5 excerpts verbatim at cited lines; every narrated stub claim refuted by current code (computeMasked :124 returns ["ceiling#2"]/undefined, dedupKey :155 excludes masked, cascadeReemit :172 copies it, emit helpers :309/:325 call sendSystemNote, evaluateIndexAccess :274 / evaluateMemberAccess :357 / enterInvokeFrame :378 throw real panics, evaluateQuestion :415, surfaceUnexpectedThrow :582, renderNoParamsOverflowNote :41 returns the SLSH-1 template, dispatchNoParamsTheta :80 gates on slash+non-empty, rendersTranscriptCard :117, driveSlashPromptTurn :169 streams then awaits waitForIdle, evaluateStringMember :167 dispatches nine members, concatElementType :253 computes the LUB); git pairs verified exactly (66feddf6→86d7bfbf, 10d797bd→ae94e2bf, 1387a73d→49e44555, 3233b435→668616ab) and 86d7bfbf deleted every in-body "STUB (V9d-T)" marker while leaving the header paragraph byte-identical to 66feddf6; grep -i stub over the four files returns exactly the 5 cited hits (site count complete), no other intake file or tracked issue cites these paragraphs (stdlib-dispatcher-docs-detached cites :115-130, a different site), and "historical narration comments" is a named D2 smell in the lens brief (triage: claude-opus-5)
