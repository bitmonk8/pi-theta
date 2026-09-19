---
id: PTQ-0729
title: typed-query-provider-gate.test.ts redeclares tests/typed-two-phase-live.test.ts's rootDouble/registryDouble/ctxDouble/drive/respondToolNameOf/expectErrOfKind/expectValue harness byte-for-byte
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/typed-query-provider-gate.test.ts:475-512
  - tests/typed-query-provider-gate.test.ts:569-597
  - tests/typed-two-phase-live.test.ts:658-703
  - tests/typed-two-phase-live.test.ts:773-834
sites: 2
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# typed-query-provider-gate.test.ts redeclares tests/typed-two-phase-live.test.ts's rootDouble/registryDouble/ctxDouble/drive/respondToolNameOf/expectErrOfKind/expectValue harness byte-for-byte

## Observation
`tests/typed-query-provider-gate.test.ts` declares, module-scope, a "drive a `.theta` typed query through the LIVE production `bindPromptConversation` + user-session double" harness whose `registryDouble`, `ctxDouble`, `expectErrOfKind` and `expectValue` functions are byte-for-byte identical to the same-named functions in `tests/typed-two-phase-live.test.ts`, and whose `rootDouble`, `drive` and `respondToolNameOf` are identical apart from the harness-holder type name (`GateHarness` vs `TwoPhaseHarness`) and doc-comment wording. Both files independently also declare `LiveSessionDouble`, `RecordingPi`, `parseDeps`, `parse`, `ajv`, `RespondFixture`/`respondFixture`, and `qry15Body` under the same names.

## Evidence

`tests/typed-query-provider-gate.test.ts:494-512` (`registryDouble` + `ctxDouble`, BYTE-IDENTICAL to the counterpart below):
```ts
function registryDouble(available: readonly unknown[]): ModelRegistry {
  return {
    getAvailable: () => [...available],
    getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "k-test" }),
  } as unknown as ModelRegistry;
}

/** The dispatch ctx: the user-session model + the committed-transcript surface. */
function ctxDouble(session: LiveSessionDouble, model: unknown): ExtensionCommandContext {
  return {
    model,
    signal: undefined,
    isIdle: (): boolean => session.isIdle(),
    waitForIdle: (): Promise<void> => Promise.resolve(),
    sessionManager: {
      getEntries: (): readonly SessionEntryDouble[] => [...session.entries],
      getLeafId: (): undefined => undefined,
    },
  } as unknown as ExtensionCommandContext;
}
```

`tests/typed-two-phase-live.test.ts:684-703` — the counterpart, byte-identical body:
```ts
function registryDouble(available: readonly unknown[]): ModelRegistry {
  return {
    getAvailable: () => [...available],
    getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "k-test" }),
  } as unknown as ModelRegistry;
}

/** The dispatch ctx: the user-session model + the committed-transcript surface. */
function ctxDouble(session: LiveSessionDouble, model: unknown): ExtensionCommandContext {
  return {
    model,
    signal: undefined,
    isIdle: (): boolean => session.isIdle(),
    waitForIdle: (): Promise<void> => Promise.resolve(),
    sessionManager: {
      getEntries: (): readonly SessionEntryDouble[] => [...session.entries],
      getLeafId: (): undefined => undefined,
    },
  } as unknown as ExtensionCommandContext;
}
```

`tests/typed-query-provider-gate.test.ts:475-491` (`rootDouble`, identical logic to the counterpart, same `Clock.setTimeout` tick-then-fire body, same `"inv-1"`/`"tc-1"` id literals):
```ts
function rootDouble(session: LiveSessionDouble): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    clock: {
      now: (): number => 0,
      wallNow: (): number => 0,
      setTimeout: (fn: () => void): unknown => {
        session.tick();
        fn();
        return 0;
      },
      clearTimeout: (): void => {},
    },
    schemaValidator: ajv(),
  } as unknown as RuntimeRoot;
}
```

`tests/typed-two-phase-live.test.ts:658-672` — the counterpart, byte-identical body:
```ts
function rootDouble(session: LiveSessionDouble): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    clock: {
      now: (): number => 0,
      wallNow: (): number => 0,
      setTimeout: (fn: () => void): unknown => {
        session.tick();
        fn();
        return 0;
      },
      clearTimeout: (): void => {},
    },
    schemaValidator: ajv(),
  } as unknown as RuntimeRoot;
}
```

`tests/typed-query-provider-gate.test.ts:569-597` (`respondToolNameOf`, `expectErrOfKind`, `expectValue` — BYTE-IDENTICAL bodies to the counterparts below apart from the `GateHarness`/`TwoPhaseHarness` parameter type name):
```ts
function respondToolNameOf(harness: GateHarness): string {
  return harness.pi.registeredTools[0]?.name ?? respondFixture().toolName;
}

/** Dig the leaf `QueryError` of the given kind out of a `?`-unwound failed drive. */
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
```

`tests/typed-two-phase-live.test.ts:773-828` — the counterparts, byte-identical bodies (confirmed by direct read; only the harness parameter type name differs).

Search performed: `grep -n "^function rootDouble\|^function registryDouble\|^function ctxDouble\|^async function drive\|^function respondToolNameOf\|^function expectErrOfKind\|^function expectValue\|^class LiveSessionDouble\|^class RecordingPi\|^function respondFixture\|^function qry15Body"` against both files — 11 matching declaration names, one-to-one, in both files.

## Why this is a problem
Eleven named pieces of scaffolding — two classes and nine functions — exist in both files under identical names and identical signatures; four of them (`registryDouble`, `ctxDouble`, `expectErrOfKind`, `expectValue`) are byte-for-byte identical bodies, and three more (`rootDouble`, `drive`, `respondToolNameOf`) diverge only in the local harness-holder type name. This repository already has a purpose-built precedent for centralising exactly this kind of repeated live-session harness plumbing (`tests/helpers/scripted-live-session-harness.ts`, whose header states its purpose is to stop files from "each redeclared byte-for-byte the pieces that carry no cell-specific variation between them"), but neither file imports it nor a comparable module for this larger drive-harness shape.

## Suggested direction (non-binding, optional)
A shared `tests/helpers/` module carrying the "drive a typed-query theta through the live production `bindPromptConversation` + user-session double" harness (`LiveSessionDouble`, `RecordingPi`, `parseDeps`/`parse`/`ajv`, `rootDouble`/`registryDouble`/`ctxDouble`, `drive`, `respondToolNameOf`, `expectErrOfKind`, `expectValue`, `RespondFixture`/`respondFixture`, `qry15Body`), parameterised by the small number of fields each file's own cells actually vary (the governor/mid-turn hooks, the bug-0479 `setModel` surface, the provider-gate-specific fixtures), is the shape both files' near-identical scaffolding already points at.

## False-positive check
- Gate-pin check: `tests/typed-query-provider-gate.test.ts` matches the `*gate*.test.ts` glob by filename, but its cited lines are harness scaffolding (a runtime-root double, a registry double, a ctx double, drive/assertion helpers) — not a pinned count or inventory assertion; the census/pin-gate carve-out protects a gate's own pinned-count assertion from being read as "asserting a value the test fixed itself," which is not the claim here. `tests/typed-two-phase-live.test.ts` does not match the gate glob at all.
- Recording-double check: `RecordingPi`/`LiveSessionDouble` are recording doubles used for positive call-count/message assertions and MUST-NOT witnesses in both files; the carve-out protects that witness *use*, not the duplicated *declaration* — this finding is about the declaration being copied, not about any single assertion reading the double being vacuous.
- docs/bugs/ signature search: `grep -rl "typed-query-provider-gate\|typed-two-phase-live" docs/bugs/` finds docs/bugs/0010 (both files named in its "Regression surface" list, lines 124-126, as sibling regression suites for the bug-0010/increment-C fix — not as a documented correct-reason red covering this duplication) plus 0012/0013/0014/0028/0099/0288/0291/0480 (each names only `typed-two-phase-live.test.ts` for its own defect). Both files pass at HEAD on the cells sharing this scaffolding.
- coverage-matrix/bug-doc citation search: `grep -n "typed-query-provider-gate\|typed-two-phase-live" docs/reference/coverage-matrix.md` finds no citation of specific line ranges inside either file's harness scaffolding; no merge, rename or deletion of any `it()`/`describe()` is proposed — only naming the shared-declaration home as observation.
- Coverage check: the claim is entirely about repeated harness/fixture DECLARATIONS; each file's own `it()` cells exercise their own copy and continue to pass, so this is not a coverage-gap claim.
- Prior-finding check: `quality/intake/qw20260917154546-d7-01-typed-repair-two-phase-harness-duplicated-from-live.md` already files the same root cause (the `tests/typed-two-phase-live.test.ts` harness duplicated) against `tests/typed-repair-two-phase.test.ts` specifically; it does not cite `tests/typed-query-provider-gate.test.ts` as a location (only in an unrelated sibling finding's pattern-wide grep list of files containing `class RecordingPi`/`class LiveSessionDouble`, never as a cited site). This finding names a distinct file pair and is therefore not a re-file.

## Triage
verdict: confirmed — independently re-verified by extract+diff: rootDouble (gate 475-491 ↔ live 658-674), registryDouble+ctxDouble (494-512 ↔ 684-703) and expectErrOfKind+expectValue (574-599 ↔ 809-834) are byte-identical, drive/respondToolNameOf differ only by the GateHarness/TwoPhaseHarness type name, and the stated declaration grep reproduces one-to-one (correction: `qry15Body` is declared only in the live file, and docs/bugs/0013+0480 also name the gate file — both as regression/pin surface, not a documented red); the gate file's own LiveSessionDouble doc comment (337-344) states it is "duplicated from tests/typed-two-phase-live.test.ts"; both suites green at HEAD (19+25 cells), the cited lines are harness scaffolding not a pinned-count assertion so the *gate* carve-out does not apply, no coverage-matrix citation, and no tracked PTQ covers the gate↔live fork (PTQ-0209 is the offline producer rootDouble family, PTQ-0328's helper carries none of the seven cited functions; same-wave intake sibling d7-01 covers the repair↔live pair — a fixer should fold both into one shared harness) — D7 copy-paste fixture/double (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
