---
id: PTQ-0044
title: runPromptSuspendInvoke's cell input is a literal constant at its only production call site — the caller pre-decides the dispatch — and the engaged outcome flag has no production reader
lens: D2                     # the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/runtime/invoke-prompt-suspend.ts:51-57
  - src/runtime/invoke-prompt-suspend.ts:87-92
  - src/runtime/invoke-prompt-suspend.ts:112-121
  - src/extension/production-theta-producer.ts:4230
  - src/extension/production-theta-producer.ts:4245-4246
  - src/extension/production-theta-producer.ts:4283-4291
sites: 6                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# runPromptSuspendInvoke's cell input is a literal constant at its only production call site — the caller pre-decides the dispatch — and the engaged outcome flag has no production reader

## Observation
`runPromptSuspendInvoke` dispatches on `input.cell`: for a non-prompt→prompt
cell it runs the child body untouched and reports `engaged: false`. Its only
production call site sits inside an `if` that already tests the identical
predicate (`callerMode === "prompt" && callee.frontmatter.mode === "prompt"`)
and then passes the cell as the object literal
`{ callerMode: "prompt", calleeMode: "prompt" }`. The seam's dispatch is
therefore decided before the call in production, and the `engaged` field of
`PromptSuspendOutcome` is read by no src code — production reads only
`outcome.result`.

## Evidence
src/runtime/invoke-prompt-suspend.ts:112-121 (the in-function dispatch):
```ts
export async function runPromptSuspendInvoke<T>(
  input: PromptSuspendInput<T>,
): Promise<PromptSuspendOutcome<T>> {
  const { cell, childCallableSet, pi, childBody } = input;

  // Only the prompt→prompt cell engages the suspend + snapshot/restore window;
  // every other cell leaves the user session's active set untouched.
  if (cell.callerMode !== "prompt" || cell.calleeMode !== "prompt") {
    const result = await childBody();
    return { engaged: false, result };
  }
```

src/extension/production-theta-producer.ts:4230 and :4245-4246 (the sole
production call site — the same predicate guards the block, then the cell is a
literal):
```ts
    if (callerMode === "prompt" && callee.frontmatter.mode === "prompt") {
      ...
        const outcome = await runPromptSuspendInvoke<ResultValue>({
          cell: { callerMode: "prompt", calleeMode: "prompt" },
```

src/extension/production-theta-producer.ts:4283-4291 (every production read of
the outcome is `.result`; `.engaged` is absent):
```ts
        const validated = this.#validateInvokeReturn(
          calleePath,
          returnSite,
          outcome.result,
          callee.sourcePath,
        );
        // A return_validation `Err` minted from an `Ok` body payload is THIS
        // hop's own guard, not the callee's (bug 0294 provenance).
        if (!validated.ok && outcome.result.ok) {
```

Searches: `runPromptSuspendInvoke` across src/, extensions/, tools/ — one call
(production-theta-producer.ts:4245); `cell:` constructions across src/ — one
(the literal at :4246); `.engaged` across all `*.ts` — three hits, all in
tests (tests/invoke-prompt-suspend.test.ts:112,147;
tests/b0372-active-set-restore-protocol.test.ts:310), zero in src.

## Why this is a problem
Vestigial input and write-only output at integration: the only production call
site supplies the discriminating parameter as a compile-time literal that
restates the guard it already sits under, so the seam's cell dispatch and its
`engaged` report select and inform nothing in production — `engaged` is
computed on every hop and consumed by no src reader. The non-engaging arm and
the flag are exercised only by the module's direct unit tests; production's
other cross-mode cells never reach this function (the same producer branch
routes them to the spawn path below the cited guard).

## Suggested direction (non-binding, optional)
Either let the seam own the dispatch (call it unconditionally and drop the
caller's duplicate guard) or let the caller own it (the seam takes the
prompt→prompt window only, shedding `cell` and `engaged`); currently the
decision is carried twice and reported to nobody.

## False-positive check
- Call-site search: `runPromptSuspendInvoke` grepped across src/, extensions/,
  tools/, tests/ — production call sites: exactly one (line 4245); test
  drivers in tests/invoke-prompt-suspend.test.ts and
  tests/b0372-active-set-restore-protocol.test.ts vary the cell and read
  `engaged` (witness callers, acknowledged).
- Test-only-caller rule: respected — no deadness claim is made against the
  non-engaging arm (it is test-reachable witness surface); the claims are the
  constant production argument and the absence of any production `engaged`
  reader, both cited.
- Dynamic access: no string-keyed access to `engaged` and no re-export of the
  module found (`export *` absent in src).
- `CrossModeCell` usage check: the type's other src consumer is
  invoke-cross-mode.ts:98 (its own module); nothing else constructs a cell for
  this seam.
- History intent: the module header (lines 1-36) scopes the module to "the
  prompt→prompt cell only" and assigns every other cell to V15l's spawn path —
  matching the producer's pre-dispatch; the in-function re-dispatch is the
  leftover generality this filing records.

## Triage
verdict: confirmed — re-verified: the sole production call site (production-theta-producer.ts:4253) sits inside the identical guard at :4237 and passes `cell` as a literal, `engaged` has zero src readers (writes at invoke-prompt-suspend.ts:121/:141, reads only in 3 test assertions), and the non-engaging arm at :118-121 is reached by neither production nor any test — no test passes a non-prompt→prompt cell to this seam (triage: claude-opus-5)
