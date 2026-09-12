---
id: PTQ-0279
title: The `binderParams`/`parametersBlockLines` binder-system-prompt rendering mirror is duplicated across two params-lowering test files
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/binder-param-line-newline-normalisation.test.ts:423-432
  - tests/binder-param-line-newline-normalisation.test.ts:449-464
  - tests/params-block-mapping-rhs-refusal.test.ts:470-479
  - tests/params-block-mapping-rhs-refusal.test.ts:487-507
sites: 2
fix_scope: module
wave: qw20260912112713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# The `binderParams`/`parametersBlockLines` binder-system-prompt rendering mirror is duplicated across two params-lowering test files

## Observation
`tests/binder-param-line-newline-normalisation.test.ts` defines a private
`binderParams(fields)` function that maps parsed `params:` fields to
`SystemPromptParamField` descriptors (mirroring the module-private producer
mapper), and a `parametersBlockLines(label, prompt)` function that extracts
the `Parameters:` block's physical lines out of a built system prompt,
throwing a labelled error if the header or its terminating blank line is
absent. `tests/params-block-mapping-rhs-refusal.test.ts` defines a
`binderParams` with an identical body and a `parametersBlockLines` whose
header/terminator-finding logic is identical from the point the prompt is
built, differing only in that it also builds the prompt internally
(the same construction the first file does separately in a `promptOf`
helper) rather than receiving an already-built prompt string.

## Evidence
tests/binder-param-line-newline-normalisation.test.ts:423-432:
```ts
function binderParams(fields: readonly BypassParamsField[]): SystemPromptParamField[] {
  return fields.map((f) => ({
    wireName: f.wireName,
    type: f.type,
    requirement:
      f.hasDefault && f.defaultSource !== undefined
        ? { kind: "default" as const, literal: f.defaultSource }
        : { kind: "required" as const },
  }));
}
```

tests/params-block-mapping-rhs-refusal.test.ts:470-479 (identical body):
```ts
function binderParams(fields: readonly BypassParamsField[]): SystemPromptParamField[] {
  return fields.map((f) => ({
    wireName: f.wireName,
    type: f.type,
    requirement:
      f.hasDefault && f.defaultSource !== undefined
        ? { kind: "default" as const, literal: f.defaultSource }
        : { kind: "required" as const },
  }));
}
```

tests/binder-param-line-newline-normalisation.test.ts:449-464
(`parametersBlockLines`, taking an already-built prompt string):
```ts
function parametersBlockLines(label: string, prompt: string): string[] {
  const lines = prompt.split("\n");
  const header = lines.indexOf("Parameters:");
  if (header < 0) {
    throw new Error(
      `${label}: no \`Parameters:\` header in the built system prompt — item 4 requires the block for ≥1 declared field. Prompt: ${JSON.stringify(prompt)}`,
    );
  }
  const end = lines.indexOf("", header);
  if (end < 0) {
    throw new Error(
      `${label}: the \`Parameters:\` block never terminates with a blank line. Prompt: ${JSON.stringify(prompt)}`,
    );
  }
  return lines.slice(header + 1, end);
}
```

tests/params-block-mapping-rhs-refusal.test.ts:487-507
(`parametersBlockLines`, building the prompt internally, then the identical
tail):
```ts
function parametersBlockLines(label: string, fields: readonly BypassParamsField[]): string[] {
  const prompt = buildBinderSystemPrompt({
    name: "t",
    params: binderParams(fields),
    rawArguments: "",
  });
  const lines = prompt.split("\n");
  const header = lines.indexOf("Parameters:");
  if (header < 0) {
    throw new Error(
      `${label}: no \`Parameters:\` header in the built system prompt — item 4 requires the block for ≥1 declared field. Prompt: ${JSON.stringify(prompt)}`,
    );
  }
  ...
```

Verified: `diff <(sed -n '423,432p' tests/binder-param-line-newline-normalisation.test.ts)
<(sed -n '470,479p' tests/params-block-mapping-rhs-refusal.test.ts)` produces
no output (`binderParams` bodies identical). `diff <(sed -n
'450,464p' tests/binder-param-line-newline-normalisation.test.ts) <(sed -n
'493,507p' tests/params-block-mapping-rhs-refusal.test.ts)` — the
`parametersBlockLines` tail from `const lines = prompt.split("\n")` through
the final `return` — also produces no output. Search:
`grep -rl "function binderParams" tests/*.ts` and `grep -rl "function
parametersBlockLines" tests/*.ts` each return exactly these two files.

## Why this is a problem
Two files independently mirror the same module-private producer mapping
(`binderPromptParamField`) and the same `Parameters:`-block extraction logic
for the same production renderer (`buildBinderSystemPrompt`,
`src/binder/binder-system-prompt.ts`), with the mapping function body
byte-identical between the two and the extraction function's core logic
(header lookup, blank-line terminator lookup, both labelled-throw error
messages) also byte-identical once the prompt is in hand — the only
difference is which of the two files builds the prompt string inline versus
through a separately-named `promptOf` helper. Both instances exist to let
their own group of tests read the physical lines of a rendered
`Parameters:` block without hand-parsing a full prompt string in every test
body.

## Suggested direction (non-binding, optional)
A shared `binderParams`/`parametersBlockLines`-shaped rendering mirror for
`buildBinderSystemPrompt` fixtures belongs beside the other params-lowering
harness helpers this cluster of files already carries copies of (per a
related, already-filed finding on this same file pair's `loadCleanly`
harness), given the mapping and extraction logic are already identical
between the two.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin.
- Recording-double check: not applicable — both functions transform or scan a
  static rendered string; neither records calls nor backs a MUST-NOT-called
  witness.
- docs/bugs/ signature search: `grep -rl "params-block-mapping-rhs-refusal.test.ts"
  docs/bugs/*.md` cites the file as bug 0041's witness (its own subject: the
  `params:` mapping-RHS refusal), unrelated to this rendering-mirror
  duplication; no bug doc documents a correct-reason red for either file, and
  `tests/binder-param-line-newline-normalisation.test.ts` is green
  (`npx vitest run tests/binder-param-line-newline-normalisation.test.ts`
  passes 44/44 as shown in a sibling finding's run).
- coverage-matrix/bug-doc citation search: `grep -n
  "binder-param-line-newline-normalisation\|params-block-mapping-rhs-refusal"
  docs/reference/coverage-matrix.md` returns no hits. This finding does not
  propose merging, renaming, or deleting either test file, only that a
  private rendering-mirror pair is currently copied between them, so no
  citation is disturbed.
- Distinct-root-cause check: this finding is about the `binderParams` /
  `parametersBlockLines` pair specifically, not a restatement of the
  already-filed `loadCleanly` duplication finding for the same file cluster
  (PTQ-0212, status fixed) — that finding's own evidence cites different line
  ranges and a different function entirely; re-reading it confirms it does
  not mention `binderParams` or `parametersBlockLines`.
- Scope: only `tests/binder-param-line-newline-normalisation.test.ts` is in
  this wave's review scope; `tests/params-block-mapping-rhs-refusal.test.ts`
  is cited solely as duplication evidence and was not otherwise reviewed.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — both diffs reproduce byte-for-byte (binderParams identical at :423-432/:470-479, parametersBlockLines tail identical at :450-464/:493-507), `function binderParams`/`function parametersBlockLines` greps hit exactly these 2 files, neither is a gate/kin file, all cited docs/bugs entries (0041, 0060, etc.) are fixed with no correct-reason red, coverage-matrix.md has 0 hits, and this is a distinct root cause from PTQ-0212 (that finding covers only `loadCleanly`, never mentions these two functions) — genuine D7 boilerplate/copy-paste-fixture duplication in tests/, no matching PTQ or rejection in the ledger (triage: claude-opus-5)
