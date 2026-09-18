---
id: PTQ-0687
title: subagent-envelope-nonfinite-ok-refusal.test.ts retypes the prompt-attach-cell driver (driveTypedInvoke/boundaryResult/promptOutcome) two sibling files already carry verbatim, including identical PIC-17/bug-0293 comments
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/subagent-envelope-nonfinite-ok-refusal.test.ts:377-415
  - tests/subagent-envelope-nonfinite-ok-refusal.test.ts:426-441
  - tests/subagent-envelope-nonfinite-ok-refusal.test.ts:465-467
  - tests/subagent-envelope-negative-zero-fidelity.test.ts:406-452
  - tests/subagent-envelope-negative-zero-fidelity.test.ts:452-467
  - tests/subagent-envelope-negative-zero-fidelity.test.ts:470-472
  - tests/subagent-envelope-result-carriage.test.ts:1522-1548
  - tests/subagent-envelope-result-carriage.test.ts:1548-1587
sites: 3
fix_scope: cross-module       # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 1
---

# subagent-envelope-nonfinite-ok-refusal.test.ts retypes the prompt-attach-cell driver (driveTypedInvoke/boundaryResult/promptOutcome) two sibling files already carry verbatim, including identical PIC-17/bug-0293 comments

## Observation
`tests/subagent-envelope-nonfinite-ok-refusal.test.ts` declares a
prompt→prompt attach-cell driver — a function that parses a callee body, a
caller `invoke<T>(...)` call, wires `createProductionProducerDeps({
parseCallee })`, calls `bindPromptConversation`, and runs `executeBody` — plus
its `boundaryResult` result-extraction helper and its `promptOutcome`
message-rendering helper. The same driver, with the same two inline comments
verbatim ("`getActiveTools` / `setActiveTools` satisfy the PIC-17
prompt→prompt suspend window..." and "Bug 0293: the seam returns the
three-arm `CalleeParseOutcome` verdict."), the same body-by-body construction
sequence, and a `boundaryResult` differing only in one word of its error
string, appears in `tests/subagent-envelope-negative-zero-fidelity.test.ts`
(named `drivePromptLeg`) and `tests/subagent-envelope-result-carriage.test.ts`
(named `drivePromptInvoke`) — three names for what is the same sequence in
all three files.

## Evidence

`tests/subagent-envelope-nonfinite-ok-refusal.test.ts:377-403`:
```ts
async function driveTypedInvoke(input: {
  readonly annotation: string;
  readonly callerDecls: string;
  readonly calleeBody: string;
}): Promise<ResultValue> {
  const calleeDoc = parseTheta("kidp.theta", PROMPT_FM + input.calleeBody);
  const callee: ThetaCompositionInput = {
    slashName: "kidp",
    sourcePath: "/theta/kidp.theta",
    frontmatter: calleeDoc.frontmatter as ParsedFrontmatter,
    body: calleeDoc.body,
  };
  const deps = createProductionProducerDeps({
    // `getActiveTools` / `setActiveTools` satisfy the PIC-17 prompt→prompt
    // suspend window; `sendMessage` satisfies the theta-system-note channel.
    pi: {
      sendMessage: () => {},
      getActiveTools: () => [],
      setActiveTools: () => {},
    } as unknown as ExtensionAPI,
    root: rootDouble(realAjvValidator()),
    modelRegistry: {} as unknown as ModelRegistry,
    // Bug 0293: the seam returns the three-arm `CalleeParseOutcome` verdict.
    parseCallee: () => Promise.resolve({ kind: "ok" as const, input: callee }),
  });
```

`tests/subagent-envelope-nonfinite-ok-refusal.test.ts:426-441` (`boundaryResult`):
```ts
function boundaryResult(execution: BodyExecution): ResultValue {
  if (execution.outcome !== "success") {
    throw new Error(
      `precondition unmet: the caller body ended '${execution.outcome}' instead of reaching its ` +
        `tail invoke — error ${JSON.stringify(execution.error)}`,
    );
  }
  const tail = execution.result.value;
  if (tail === undefined || !isResultValue(tail)) {
    throw new Error(
      `precondition unmet: the caller's tail value is not the invoke boundary Result — ` +
        `${JSON.stringify(tail)}`,
    );
  }
  return tail;
}
```

`tests/subagent-envelope-negative-zero-fidelity.test.ts:406-432` (`drivePromptLeg`,
the identical construction, same two comments verbatim):
```ts
async function drivePromptLeg(input: {
  readonly callerBody: string;
  readonly calleeBody: string;
}): Promise<ResultValue> {
  const calleeDoc = parseTheta("kidp.theta", PROMPT_FM + input.calleeBody);
  const callee: ThetaCompositionInput = {
    slashName: "kidp",
    sourcePath: "/theta/kidp.theta",
    frontmatter: calleeDoc.frontmatter as ParsedFrontmatter,
    body: calleeDoc.body,
  };
  const deps = createProductionProducerDeps({
    // `getActiveTools` / `setActiveTools` satisfy the PIC-17 prompt→prompt
    // suspend window; `sendMessage` satisfies the theta-system-note channel.
    pi: {
      sendMessage: () => {},
      getActiveTools: () => [],
      setActiveTools: () => {},
    } as unknown as ExtensionAPI,
    root: rootDouble(realAjvValidator()),
    modelRegistry: {} as unknown as ModelRegistry,
    // Bug 0293: the seam returns the three-arm `CalleeParseOutcome` verdict.
    parseCallee: () => Promise.resolve({ kind: "ok" as const, input: callee }),
  });
```

`tests/subagent-envelope-negative-zero-fidelity.test.ts:452-467`
(`boundaryResult`, differing from the reviewed file's only in dropping the
word "invoke" from the two error-message strings):
```ts
function boundaryResult(execution: BodyExecution): ResultValue {
  if (execution.outcome !== "success") {
    throw new Error(
      `precondition unmet: the caller body ended '${execution.outcome}' instead of reaching its ` +
        `tail — error ${JSON.stringify(execution.error)}`,
    );
  }
  const tail = execution.result.value;
  if (tail === undefined || !isResultValue(tail)) {
    throw new Error(
      `precondition unmet: the caller's tail value is not the boundary Result — ` +
        `${JSON.stringify(tail)}`,
    );
  }
  return tail;
}
```

`tests/subagent-envelope-nonfinite-ok-refusal.test.ts:465-467` and
`tests/subagent-envelope-negative-zero-fidelity.test.ts:470-472`
(`promptOutcome`, byte-identical):
```ts
function promptOutcome(result: ResultValue): string {
  return result.ok ? `Ok(${render(result.value)})` : `Err(${JSON.stringify(result.error)})`;
}
```

`tests/subagent-envelope-result-carriage.test.ts:1548-1574`
(`drivePromptInvoke`, the same construction sequence and the same two
verbatim comments, adapted to return a `{ result, diagnostics }` pair
instead of a bare `ResultValue`):
```ts
async function drivePromptInvoke(input: {
  readonly call: string;
  readonly calleeBody: string;
}): Promise<{ readonly result: ResultValue; readonly diagnostics: readonly Diagnostic[] }> {
  const calleeDoc = parseTheta("kidp.theta", PROMPT_FM + input.calleeBody);
  const callee: ThetaCompositionInput = {
    slashName: "kidp",
    sourcePath: "/theta/kidp.theta",
    frontmatter: calleeDoc.frontmatter as ParsedFrontmatter,
    body: calleeDoc.body,
  };
  const diagnostics: Diagnostic[] = [];
  const deps = createProductionProducerDeps({
    // `getActiveTools` / `setActiveTools` satisfy the PIC-17 prompt→prompt
    // suspend window; `sendMessage` satisfies the theta-system-note channel.
    pi: {
      sendMessage: () => {},
      getActiveTools: () => [],
      setActiveTools: () => {},
    } as unknown as ExtensionAPI,
    root: rootDouble(realAjvValidator()),
    modelRegistry: {} as unknown as ModelRegistry,
    // Bug 0293: the seam returns the three-arm `CalleeParseOutcome` verdict.
    parseCallee: () => Promise.resolve({ kind: "ok" as const, input: callee }),
```

`tests/subagent-envelope-result-carriage.test.ts:1522-1537` (its own
`boundaryResult`, byte-identical to the reviewed file's):
```ts
function boundaryResult(execution: BodyExecution): ResultValue {
  if (execution.outcome !== "success") {
    throw new Error(
      `precondition unmet: the caller body ended '${execution.outcome}' instead of reaching its ` +
        `tail invoke — error ${JSON.stringify(execution.error)}`,
    );
  }
```

Search: `grep -rn "getActiveTools.*satisfy the PIC-17" tests/*.test.ts` hits
exactly these three files (one comment occurrence each).
`grep -rn "Bug 0293: the seam returns the three-arm" tests/*.test.ts` hits the
same three files, one occurrence each.
`grep -rn "the caller's tail value is not the.*boundary Result" tests/*.test.ts`
hits the same three `boundaryResult` declarations.
`grep -rn "PIC-17\|CalleeParseOutcome" tests/helpers/*.ts` → 0 hits — no
`tests/helpers/` module hosts this driver.

## Why this is a problem
Three files each declare a prompt→prompt attach-cell driver under a
different name (`driveTypedInvoke`, `drivePromptLeg`, `drivePromptInvoke`)
that reconstructs the identical `parseTheta` → `ThetaCompositionInput` →
`createProductionProducerDeps({ parseCallee })` → `bindPromptConversation` →
`executeBody` sequence, carrying the same two source comments verbatim
("PIC-17 prompt→prompt suspend window" and "Bug 0293: the seam returns the
three-arm `CalleeParseOutcome` verdict") word for word, plus a
`boundaryResult` helper that is byte-identical in two of the three files and
differs by one word in the third, plus a `promptOutcome` helper
byte-identical in two of the three. No `tests/helpers/` module hosts any
piece of this driver, so each file's declaration reads as a bespoke harness
for that file's own scenario rather than what the identical comments show it
to be: the same sequence, retyped under a different local name each time.

## Suggested direction (non-binding, optional)
A `tests/helpers/`-hosted module exporting the prompt-attach driver
(parameterised by the caller source and callee body each file's own
scenarios already supply) alongside `boundaryResult` and `promptOutcome` is
the natural next home the three files' near-identical declarations and
verbatim shared comments already point toward.

## False-positive check
- Gate-pin: the file matches no `*gate*.test.ts` or named gate kin; the
  cited lines are harness plumbing, not a pinned count or inventory.
- Recording-double: none of `driveTypedInvoke`/`boundaryResult`/`promptOutcome`
  record calls for a "never called" negative witness; all are inert
  drivers/renderers. Not applicable.
- docs/bugs/ signature search: `grep -rl "driveTypedInvoke\|drivePromptLeg\|drivePromptInvoke\|boundaryResult" docs/bugs/`
  → no hits naming any of the three function names; the reviewed file's own
  bug (0180) is "fixed (0.105.0)" per its header, so this is not a documented
  correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "subagent-envelope-nonfinite-ok-refusal\|subagent-envelope-negative-zero-fidelity\|subagent-envelope-result-carriage"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of any test file or `it()`/`describe()` — only
  that the shared driver/helpers could be imported from a new helper — so no
  citation is affected.
- Overlap check: `grep -rl "driveTypedInvoke\|drivePromptLeg\|drivePromptInvoke" quality/intake quality/issues quality/resolved`
  shows no prior finding naming any of these three function names or citing
  all three files together; this finding's root cause (the prompt-attach
  driver + `boundaryResult` + `promptOutcome`) is distinct from the
  child-side `driveChildRoot` envelope-writer harness filed separately in
  this same wave (`qw20260917154546-d7-131-01-driveChildRoot-envelope-harness-quadruplicated.md`).
- Coverage check: the claim is about a repeated harness DEFINITION, not a
  missing test path; all three copies are exercised by their own files'
  tests, which pass at HEAD.

## Triage
verdict: confirmed — independently re-verified: all three drivers reproduce at the cited lines with the identical parseTheta→ThetaCompositionInput→createProductionProducerDeps({parseCallee})→bindPromptConversation→executeBody sequence and both verbatim comments; `boundaryResult` diffs byte-identical between nonfinite-ok-refusal:426-441 and result-carriage:1522-1537 and `promptOutcome` byte-identical between nonfinite-ok-refusal:465-467 and negative-zero-fidelity:470-472; negative-zero-fidelity:404 itself states "`driveTypedInvoke` is the same construction"; no tests/helpers/ module wires parseCallee+bindPromptConversation+executeBody (parent-producer-harness.ts is the spawn-launcher harness, PTQ-0384's home); not tracked by PTQ-0209 (rootDouble trio), PTQ-0360/0384/0397 (different harnesses); all 79 tests pass at HEAD. Census correction only: the "exactly these three files" grep claims are wrong — the PIC-17 comment hits 8 files, the Bug 0293 comment 10, and the same `driveTypedInvoke`+`boundaryResult` driver also recurs in tests/invoke-depth-wire-form-metric.test.ts:281-340 and tests/invoke-return-enum-carrier-projection.test.ts:269-330 (5 copies, not 3) — an undercount that widens, not refutes, the root cause; the fixer should fold those two in (triage: claude-fable-5-1)

## Fix attempts
- qw20260918202006: skipped — [PTQ-0645-01-object-pattern-head-runtime-harness-duplicated.md] PTQ-0645: Shared the runtime harness across both listed files and the triage-cited third copy; retained fixture-path literals and all assertions. / PTQ-0646: Shared diagnostic helpers across six files, reused registry/corpus helpers, and preserved hint assertions and raw-page checks. / PTQ-0653: Centralized all eight TRIAGE_DEF copies and four BODY copies in tests/helpers/triage-fixture.ts; tests unchanged. / PTQ-0657: Shared AJV note constants and rendering through the existing binder harness. Final required gate passed: TypeScript and all 11,569 tests across 687 files. ||
