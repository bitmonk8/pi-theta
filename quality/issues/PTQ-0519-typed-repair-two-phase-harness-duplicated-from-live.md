---
id: PTQ-0519
title: typed-repair-two-phase.test.ts redeclares the LiveSessionDouble/RecordingPi/parseDeps/parse/ajv/rootDouble/registryDouble/ctxDouble/drive/respondToolNameOf/messageText/contextMessagesOf/expectErrOfKind/expectValue/runGovernorRoundProbe harness from tests/typed-two-phase-live.test.ts
lens: D7
status: open
verdict: confirmed
locations:
  - tests/typed-repair-two-phase.test.ts:396-527
  - tests/typed-repair-two-phase.test.ts:540-724
  - tests/typed-repair-two-phase.test.ts:751-816
  - tests/typed-two-phase-live.test.ts:472-599
  - tests/typed-two-phase-live.test.ts:644-829
  - tests/typed-two-phase-live.test.ts:845-880
sites: 2
fix_scope: module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# typed-repair-two-phase.test.ts redeclares the tests/typed-two-phase-live.test.ts harness (LiveSessionDouble, RecordingPi, parseDeps, parse, ajv, rootDouble, registryDouble, ctxDouble, drive, respondToolNameOf, messageText, contextMessagesOf, expectErrOfKind, expectValue, runGovernorRoundProbe)

## Observation
`tests/typed-repair-two-phase.test.ts` declares, module-scope, a fifteen-piece
"drive a `.theta` typed query through the LIVE production `bindPromptConversation`
+ user-session double" harness — `LiveSessionDouble`, `RecordingPi`, `parseDeps`,
`parse`, `ajv`, `rootDouble`, `registryDouble`, `ctxDouble`, `TwoPhaseHarness`,
`makeHarness`, `drive`, `respondToolNameOf`, `messageText`, `contextMessagesOf`,
`expectErrOfKind`, `expectValue`, `runGovernorRoundProbe` — that is
near-byte-identical to the same fifteen pieces already declared in
`tests/typed-two-phase-live.test.ts`. The file's own header states this
explicitly: "Method: the tests/typed-two-phase-live.test.ts harness, DUPLICATED
per the increment-C rules (that suite stays untouched …)". Several functions
(`expectErrOfKind`, `expectValue`) are byte-for-byte identical between the two
files; others (`parseDeps`, `parse`, `ajv`, `contextMessagesOf`, `messageText`,
`respondToolNameOf`) differ only in comment wording; `LiveSessionDouble` and
`RecordingPi` diverge only by the increment-C additions (per-turn hook map vs.
a single `onMidTurn` callback; `RecordingPi` in the live file additionally
carries the bug-0479 `setModelCalls`/`setModel` surface, absent from the repair
file).

## Evidence

`tests/typed-repair-two-phase.test.ts:714-740` (`expectErrOfKind`/`expectValue`, BYTE-IDENTICAL to the counterpart below):
```ts
function expectErrOfKind(execution: BodyExecution, kind: string): Record<string, unknown> {
  expect(
    execution.outcome,
    `the \`?\`-unwound Err must FAIL the body (ERR-18); observed outcome '${execution.outcome}' ` +
      `(final value: ${JSON.stringify(execution.result.value)})`,
  ).toBe("fail");
  const error = execution.error;
  expect(
    error !== null && typeof error === "object",
    `the fail outcome must carry the leaf QueryError; observed: ${JSON.stringify(error)}`,
  ).toBe(true);
  const leaf = error as unknown as Record<string, unknown>;
  expect(
    leaf.kind,
    `the leaf QueryError classifies as ${kind}; observed: ${JSON.stringify(leaf)}`,
  ).toBe(kind);
  return leaf;
}

/** Assert a successful drive resolving the typed value. */
function expectValue(execution: BodyExecution, expected: unknown, why: string): void {
  expect(
    execution.outcome,
    `${why}; observed outcome '${execution.outcome}' (error: ${JSON.stringify(execution.error)})`,
  ).toBe("success");
  expect(execution.result.value, why).toEqual(expected);
}
```

`tests/typed-two-phase-live.test.ts:809-834` — the counterpart, byte-identical body:
```ts
function expectErrOfKind(execution: BodyExecution, kind: string): Record<string, unknown> {
  expect(
    execution.outcome,
    `the \`?\`-unwound Err must FAIL the body (ERR-18); observed outcome '${execution.outcome}' ` +
      `(final value: ${JSON.stringify(execution.result.value)})`,
  ).toBe("fail");
  const error = execution.error;
  expect(
    error !== null && typeof error === "object",
    `the fail outcome must carry the leaf QueryError; observed: ${JSON.stringify(error)}`,
  ).toBe(true);
  const leaf = error as unknown as Record<string, unknown>;
  expect(
    leaf.kind,
    `the leaf QueryError classifies as ${kind}; observed: ${JSON.stringify(leaf)}`,
  ).toBe(kind);
  return leaf;
}

/** Assert a successful drive resolving the typed value. */
function expectValue(execution: BodyExecution, expected: unknown, why: string): void {
  expect(
    execution.outcome,
    `${why}; observed outcome '${execution.outcome}' (error: ${JSON.stringify(execution.error)})`,
  ).toBe("success");
  expect(execution.result.value, why).toEqual(expected);
}
```

`tests/typed-repair-two-phase.test.ts:481-499` (`RecordingPi`, minus the bug-0479 `setModel` surface):
```ts
class RecordingPi {
  readonly registeredTools: ToolDefinition[] = [];
  readonly setActiveToolsCalls: string[][] = [];
  getActiveToolsCalls = 0;
  readonly onEvents: string[] = [];
  readonly handlers = new Map<string, Array<(...args: unknown[]) => unknown>>();
  readonly api: ExtensionAPI;

  constructor(session: LiveSessionDouble) {
    const record = this;
    this.api = {
      sendUserMessage: (content: string): void => session.sendUserMessage(content),
      getActiveTools: (): string[] => {
        record.getActiveToolsCalls += 1;
        return ["ambient-a"];
      },
      setActiveTools: (names: string[]): void => {
        record.setActiveToolsCalls.push([...names]);
      },
```

`tests/typed-two-phase-live.test.ts:555-580` — the counterpart, same shape plus the `setModelCalls`/`setModel` fields the repair file lacks:
```ts
class RecordingPi {
  readonly registeredTools: ToolDefinition[] = [];
  readonly setActiveToolsCalls: string[][] = [];
  getActiveToolsCalls = 0;
  /** Bug 0479: every PIC-17 model-window `setModel` (swap-in, then restore) in order. */
  readonly setModelCalls: string[] = [];
  readonly onEvents: string[] = [];
  readonly handlers = new Map<string, Array<(...args: unknown[]) => unknown>>();
  readonly api: ExtensionAPI;

  constructor(session: LiveSessionDouble) {
    const record = this;
    this.api = {
      sendUserMessage: (content: string): void => session.sendUserMessage(content),
      getActiveTools: (): string[] => {
        record.getActiveToolsCalls += 1;
        return [...AMBIENT_ACTIVE_TOOLS];
      },
      setActiveTools: (names: string[]): void => {
        record.setActiveToolsCalls.push([...names]);
      },
```

`tests/typed-repair-two-phase.test.ts:516-596` declares `parseDeps`, `parse`, `ajv`, `rootDouble`, `registryDouble`, `ctxDouble` — each structurally identical to `tests/typed-two-phase-live.test.ts:599-712`'s counterparts (confirmed function-by-function: same body, same field names, differing only in doc-comment wording and, for `rootDouble`, a single `idSource` literal both files share verbatim: `newInvocationId: (): string => "inv-1"`).

Search performed: `grep -n "^function parseDeps\|^function parse(\|^function ajv(\|^function rootDouble\|^function registryDouble\|^function ctxDouble\|^async function drive\|^function respondToolNameOf\|^function messageText\|^function contextMessagesOf\|^class LiveSessionDouble\|^class RecordingPi"` against both files — 12 matching declaration names in each file, one-to-one.

## Why this is a problem
Fifteen named pieces of scaffolding — two classes and thirteen functions —
exist in both files under identical names, with identical signatures, and
(for `expectErrOfKind`/`expectValue`) identical bodies. The file's own header
comment names the source file being duplicated and the reason ("that suite
stays untouched" — a deliberate decision to fork rather than share), which
means the duplication is acknowledged in prose but not factored into a shared
module the way this repository's own `tests/helpers/scripted-live-session-harness.ts`
already does for a comparable multi-cell live-session lineage (that module's
header states its purpose is exactly to stop files from "each redeclared
byte-for-byte the pieces that carry no cell-specific variation between them").

## Suggested direction (non-binding, optional)
A shared `tests/helpers/` module carrying the "live prompt-mode two-phase
harness" (`LiveSessionDouble`, `RecordingPi`, `parseDeps`/`parse`/`ajv`,
`rootDouble`/`registryDouble`/`ctxDouble`, `drive`, `respondToolNameOf`,
`messageText`, `contextMessagesOf`, `expectErrOfKind`, `expectValue`,
`runGovernorRoundProbe`), parameterised by the small number of fields that
differ between the two files (the increment-C per-turn hook map and the
bug-0479 `setModel` surface), is the natural home both files' own comments
already point at.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin; the cited lines are scaffolding declarations, not a pinned
  count/inventory assertion.
- Recording-double check: `RecordingPi`/`LiveSessionDouble` are recording
  doubles used for both positive assertions (call counts, captured messages)
  and MUST-NOT witnesses (e.g. "ZERO complete() calls") — the carve-out
  protects the MUST-NOT witness *use*, not the duplicated *declaration* of the
  double itself; this finding is about the declaration being copied, not about
  any single assertion reading the double being vacuous.
- docs/bugs/ signature search: `grep -rl "typed-repair-two-phase\|typed-two-phase-live" docs/bugs/` → both files are named in docs/bugs/0010-typed-forced-respond-user-visible-no-toolchoice.md's "Regression surface" list (line 124-125) as sibling regression suites, not as a documented correct-reason red covering this duplication; both files pass at HEAD (typed-repair-two-phase.test.ts's own header states these cells "red before the increment-C fix and now pin the fixed behaviour" — a resolved regression pin, not an open red).
- coverage-matrix/bug-doc citation search: `grep -n "typed-repair-two-phase\|typed-two-phase-live" docs/reference/coverage-matrix.md` → 0 hits for either file by name. This finding proposes no merge, rename, or deletion of any `it()`/`describe()` — only naming the shared-declaration home as observation.
- Coverage check: the claim is entirely about repeated harness/fixture
  DECLARATIONS; each file's own `it()` cells exercise their own copy, so this
  is not a coverage-gap claim.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified by per-declaration extract+diff: 12 of the named pieces (parseDeps, parse, ajv, rootDouble, registryDouble, ctxDouble, respondToolNameOf, messageText, contextMessagesOf, expectErrOfKind, expectValue, runGovernorRoundProbe) are byte-identical between tests/typed-repair-two-phase.test.ts (396-816) and tests/typed-two-phase-live.test.ts (472-880), drive differs by one thetaAbort spread line, and LiveSessionDouble/RecordingPi/makeHarness diverge only by the increment-C per-turn hook map and the bug-0479 setModel surface; the repair file's own header (line 62-63) states it is the live harness "DUPLICATED per the increment-C rules"; all 12 declaration names grep one-to-one in both files; both suites green at HEAD (9+25 cells), neither is a gate/census file, no coverage-matrix citation, docs/bugs/0010:124-125 lists both only as regression surface; no tracked PTQ covers the repair↔live fork (same-wave intake siblings d7-159-01/159-02/161-02 cite different copy pairs or the 77-109 vi.hoisted scaffold) — D7 copy-paste fixture/double, same class as resolved PTQ-0328 (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
