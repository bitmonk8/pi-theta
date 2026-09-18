---
id: PTQ-0645
title: The parse-to-executeBody production runtime harness (NOOP_CHECKPOINT/rootDouble/producer/execute/expectValue) is redeclared byte-identical in both object-pattern-head refusal test files
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/object-pattern-head-field-set-refusal.test.ts:487-539
  - tests/object-pattern-head-unresolved-refusal.test.ts:448-500
sites: 2
fix_scope: module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# The parse-to-executeBody production runtime harness (NOOP_CHECKPOINT/rootDouble/producer/execute/expectValue) is redeclared byte-identical in both object-pattern-head refusal test files

## Observation
`tests/object-pattern-head-field-set-refusal.test.ts` and `tests/object-pattern-head-unresolved-refusal.test.ts` each declare, module-scope, the identical five-piece "drive a parsed `ThetaDocument` through the production prompt-mode binding and `executeBody`" harness: a `NOOP_CHECKPOINT` constant, a `rootDouble()` builder, a `producer()` builder calling `createProductionProducerDeps`, an `execute()` function assembling a `ThetaCompositionInput`/`ConversationBindInput` and calling `executeBody`, and an `expectValue()` assertion helper. The two files' own header comments name each other as the shape's origin (field-set-refusal's header: "the tests/object-pattern-head-unresolved-refusal.test.ts:402–:454 shape, symbols `producer` / `execute` / `expectValue`"), so the duplication is authored knowledge, not independent coincidence.

## Evidence
`tests/object-pattern-head-field-set-refusal.test.ts:487-505` (of the 487-539 span):
```ts
const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

function rootDouble(): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
  } as unknown as RuntimeRoot;
}

function producer(): ReturnType<typeof createProductionProducerDeps> {
  return createProductionProducerDeps({
    // `sendMessage` satisfies the theta-system-note channel; the active-tools
    // pair satisfies the PIC-17 snapshot/restore window. No provider, no model.
    pi: {
```

`tests/object-pattern-head-unresolved-refusal.test.ts:448-466` — the same five names, same bodies, only the `slashName`/`sourcePath` literal inside `execute()` differs (`"bug0221"`/`"/theta/bug0221.theta"` vs. `"bug0226"`/`"/theta/bug0226.theta"`):
```ts
const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

function rootDouble(): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
  } as unknown as RuntimeRoot;
}

function producer(): ReturnType<typeof createProductionProducerDeps> {
  return createProductionProducerDeps({
    // `sendMessage` satisfies the theta-system-note channel; the active-tools
    // pair satisfies the PIC-17 snapshot/restore window. No provider, no model.
    pi: {
```

The `expectValue` closing piece is also byte-identical (`tests/object-pattern-head-field-set-refusal.test.ts:531-539` vs. `tests/object-pattern-head-unresolved-refusal.test.ts:492-500`):
```ts
async function expectValue(
  doc: ThetaDocument,
  value: ThetaValue,
  why: string,
): Promise<void> {
  const execution = await execute(doc);
  expect(execution.outcome, `${why}: the body reaches a value`).toBe("success");
  expect(execution.result.value, why).toEqual(value);
}
```

Exact search: `grep -n "^function rootDouble\|^function producer\|^async function execute\|^async function expectValue\|^const NOOP_CHECKPOINT" tests/object-pattern-head-field-set-refusal.test.ts tests/object-pattern-head-unresolved-refusal.test.ts` returns exactly one match of each of the five names in each file (10 matches total), and a line-by-line diff of the two cited spans shows only the `slashName`/`sourcePath` literal and the wrapping function name for the wrong-arm assertion (`expectRefused` vs. `expectRefusedWrongArm`, declared just past this harness) differ.

## Why this is a problem
The same ~50-line "no-op checkpoint, fixed-id `RuntimeRoot` double, `createProductionProducerDeps` wiring, `executeBody` driver, value assertion" block is authored from scratch in both files with no shared source of truth. A change to any of `RuntimeRoot`, `ConversationBindInput`, `ThetaCompositionInput`, or `createProductionProducerDeps`'s shape has to be hand-applied at both declaration sites rather than at one.

## Suggested direction (non-binding, optional)
`tests/helpers/` already holds several harness modules built around this same `createProductionProducerDeps` + `bindPromptConversation` + `executeBody` shape (for example `tests/helpers/call-with-clause-harness.ts`'s `driveCaller`), which is where a parameterised version of this pair's shared `rootDouble`/`producer`/`execute`/`expectValue` quintet would sit as observation, not design.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or a named gate kin; this finding is about a harness-declaration site, not a pinned count or corpus inventory.
- Recording-double check: `rootDouble()`'s returned double supplies inert values only (no call recording, no MUST-NOT witness); the recording-double carve-out does not apply.
- docs/bugs/ signature search: `grep -n "NOOP_CHECKPOINT\|rootDouble\b" docs/bugs/0221-object-pattern-head-name-unchecked-fires-wrong-arm.md docs/bugs/0226-declared-object-pattern-head-field-set-unchecked.md` returns no hits — neither bug doc marks either harness declaration as a documented correct-reason red; both files pass at HEAD as ordinary green witnesses.
- coverage-matrix/bug-doc citation search: `grep -n "object-pattern-head-field-set-refusal\|object-pattern-head-unresolved-refusal" docs/reference/coverage-matrix.md` returns 0 hits. Both bug docs (0221, 0226, 0234, 0317) cite these two files repeatedly by name and cell id, but always for specific cells (`a1`, `x1`, etc.), never for the `rootDouble`/`producer`/`execute`/`expectValue` declaration lines cited here; no merge, rename, or deletion of either file, its cells, or these functions is proposed.
- Coverage-drift check: the claim is entirely about a repeated harness DEFINITION; each file's own cells exercise its own copy, so this is not a coverage-gap claim.

## Triage
verdict: confirmed — independently re-verified: all three excerpts match byte-exact at the cited lines, the stated grep returns exactly 10 hits, and my own diff of the two 53-line spans (487-539 vs 448-500) shows only the bug0226/bug0221 slashName+sourcePath literals differ; both files green at HEAD (75/75), 0 coverage-matrix hits, no NOOP_CHECKPOINT/rootDouble mention in bug docs 0221/0226, rootDouble is an inert double (no recording carve-out), neither file is a gate; not a duplicate of resolved PTQ-0209 — its fix (2594cd44) migrated only its four cited files to tests/helpers/call-with-clause-harness.ts's exported rootDouble/noopPi and cited neither of these, so per the residual-copy precedents (PTQ-0228/0240/0301) this un-migrated pair is a distinct in-scope D7 boilerplate-duplication finding, and no open issue or other intake row cites this pair for this root cause (d7-110-02 is the separate DiagShape scaffold); two evidentiary nits for the fixer, neither refuting: the headers do not "name each other" — field-set names unresolved, while unresolved names tests/reserved-keyword-object-pattern-head-refusal.test.ts:735-787, a third copy of the same quintet that my diff shows identical apart from the bug0219 tag; and a canonical rootDouble/noopPi export already exists in tests/helpers/call-with-clause-harness.ts that both files bypass (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
