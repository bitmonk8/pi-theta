---
id: PTQ-1044
title: execution-status-progress-tool.test.ts declares makeOrderRecordingPi then re-inlines an almost byte-identical pi double for the very next test
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/execution-status-progress-tool.test.ts:415-444
  - tests/execution-status-progress-tool.test.ts:468-490
sites: 2
fix_scope: localized
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
fix_skips: 1
---

# execution-status-progress-tool.test.ts declares makeOrderRecordingPi then re-inlines an almost byte-identical pi double for the very next test

## Observation
`tests/execution-status-progress-tool.test.ts` declares a module-scope helper
`makeOrderRecordingPi()` (lines 415-444) whose returned `pi` object carries
`registerFlag`, `registerMessageRenderer`, `registerTool`, `registerCommand`,
`on`, `getFlag`, `getCommands` and `sendUserMessage`, each pushing its name
onto a shared `calls` array. The very next `describe` block's `it` (factory-path
(b), lines 468-490) declares its own `pi` object literal inline, with the same
eight members in the same order pushing the same call names onto a
locally-scoped `calls` array — differing only in that its `registerTool`
throws instead of recording the tool. Neither test calls the other's
declaration; the second is a fresh literal.

## Evidence
tests/execution-status-progress-tool.test.ts:415-444:
```ts
function makeOrderRecordingPi(): {
  pi: ExtensionAPI;
  calls: string[];
  registeredTools: ToolDefinition<never>[];
} {
  const calls: string[] = [];
  const registeredTools: ToolDefinition<never>[] = [];
  const pi = {
    registerFlag: (): void => {
      calls.push("registerFlag");
    },
    registerMessageRenderer: (): void => {
      calls.push("registerMessageRenderer");
    },
    registerTool: (t: ToolDefinition<never>): void => {
      calls.push("registerTool");
      registeredTools.push(t);
    },
    registerCommand: (): void => {
      calls.push("registerCommand");
    },
    on: (event: string): void => {
      calls.push(`on:${event}`);
    },
    getFlag: (): undefined => undefined,
    getCommands: (): unknown[] => [],
    sendUserMessage: (): void => {},
  };
  return { pi: pi as unknown as ExtensionAPI, calls, registeredTools };
}
```

tests/execution-status-progress-tool.test.ts:468-490:
```ts
    const calls: string[] = [];
    const diagnostics: Diagnostic[] = [];
    const pi = {
      registerFlag: (): void => {
        calls.push("registerFlag");
      },
      registerMessageRenderer: (): void => {
        calls.push("registerMessageRenderer");
      },
      registerTool: (): void => {
        calls.push("registerTool");
        throw new Error("registerTool host seam absent");
      },
      registerCommand: (): void => {
        calls.push("registerCommand");
      },
      on: (event: string): void => {
        calls.push(`on:${event}`);
      },
      getFlag: (): undefined => undefined,
      getCommands: (): unknown[] => [],
      sendUserMessage: (): void => {},
    } as unknown as ExtensionAPI;
```

The file's own comment at line 409 ("Mirrors `tests/extension-factory-harness.test.ts`'s
`makeAbsentSeamPi`/ordering idiom") shows the author was aware a
throw-capable variant of this exact double shape already exists in a sibling
file (`makeAbsentSeamPi`, `tests/extension-factory-harness.test.ts:39-68`,
which guards each call and throws only for a caller-chosen "absent" set) —
yet the second in-scope test built a third, narrower variant from scratch
rather than reusing either.

## Why this is a problem
The two in-file declarations are the same eight-member call-recording `pi`
double, hand-copied a paragraph apart, with the only functional difference
(recording vs. throwing on `registerTool`) exactly the kind of variation
`makeAbsentSeamPi`'s own parameter (`absent: ReadonlySet<string>`) already
generalises over in the sibling file. This is boilerplate duplication within
a single file: the second occurrence could have called the first with a
throwing override instead of re-typing the same eight arrow functions.

## Suggested direction (non-binding, optional)
`makeOrderRecordingPi` (or `makeAbsentSeamPi`, which already parameterises
which member throws) is the natural single declaration for this double.

## False-positive check
Gate-pin check: not a `*gate*.test.ts` file; not applicable. Recording-double
check: both declarations record calls for a MUST-happen assertion (ordering,
diagnostic emission), not a MUST-NOT witness, so the recording-double
carve-out does not shield the duplication itself. docs/bugs/ signature
search: `grep -rn "makeOrderRecordingPi\|makeAbsentSeamPi" docs/bugs/*.md`
returns no hits; this is not a documented correct-reason red.
Coverage-matrix/bug-doc citation search: neither function name appears in
`docs/reference/coverage-matrix.md`; no pinned-test citation applies. This
finding does not propose removing test coverage, only observes the same
harness shape re-typed in the same file.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at :415-444 and :468-490; a whitespace-normalised mktemp diff of the two 20-line `pi` literals shows only the `registerTool` body differs (records `t` vs throws), so this is a same-file copy-paste double; `makeOrderRecordingPi` has exactly one caller (:448) and the (b) test builds its own literal instead of calling it with a throwing variant; the sibling `makeAbsentSeamPi` reproduces at tests/extension-factory-harness.test.ts:39-68 (test-local, not exported from tests/helpers/, so no canonical import exists — fix is the in-file consolidation); stated searches reproduce (docs/bugs → 0 hits, coverage-matrix → 0 hits); not a gate test, no test removal proposed; no open/resolved PTQ cites this file's factory-path pi double (resolved PTQ-0293/0667/0852/0903/0911/0965 cover other helpers in this file), and same-wave sibling d7-03 (`fakeBus`, :46-61/:277-286) is a distinct root cause (triage: claude-fable-5-1)

## Fix attempts
- qw20260918202006: skipped — [PTQ-0925-off-session-mock-scaffold-triplicated.md] PTQ-0925: Shared the mock/reset scaffold across all five triage-cited files using an opt-in helper. / PTQ-0935: Extracted the bind/assert/read tail for all three cited copies; retained every assertion. / PTQ-1036: Distinct descriptions now prove project precedence; a temporary package-wins override correctly failed the new assertion and was removed. / PTQ-1039: Migrated b0378 to the existing recording harness and note filter, adding optional flags support. No tests deleted; required gate passed for all changes: tsc and 11,569 tests across 687 files. ||
