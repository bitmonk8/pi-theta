---
id: PTQ-0883
title: member-access-declared-field-type.test.ts redeclares rootDouble/NOOP_CHECKPOINT/producer locally instead of importing the exported equivalents its own harness comment names
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/member-access-declared-field-type.test.ts:1170-1195
  - tests/helpers/call-with-clause-harness.ts:152-168
  - tests/helpers/runtime-belt-probe-harness.ts:85-93
  - tests/non-object-receiver-gate.test.ts:8-9
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
fix_skips: 1
---

# member-access-declared-field-type.test.ts redeclares rootDouble/NOOP_CHECKPOINT/producer locally instead of importing the exported equivalents its own harness comment names

## Observation
`tests/member-access-declared-field-type.test.ts`'s own harness comment states: "the production-executor shape `tests/non-object-receiver-gate.test.ts` establishes (`probeSource` / `producer` there) — `parseThetaDocument` → `createProductionProducerDeps` → `bindPromptConversation` → `executeBody`". `tests/non-object-receiver-gate.test.ts` reaches that shape by importing `rootDouble` from `tests/helpers/call-with-clause-harness.ts` and `producer` (aliased `beltProducer`) from `tests/helpers/runtime-belt-probe-harness.ts` — both already exported. `tests/member-access-declared-field-type.test.ts` instead declares its own local `NOOP_CHECKPOINT`, `rootDouble()`, and `producer()` that reconstruct the same `RuntimeRoot`/`createProductionProducerDeps` call shape, without importing either helper module.

## Evidence

tests/non-object-receiver-gate.test.ts:8-9 (imports the canonical doubles):
```ts
import { rootDouble } from "./helpers/call-with-clause-harness";
import { makeBeltProbes, type Probe, render, producer as beltProducer } from "./helpers/runtime-belt-probe-harness";
```

tests/helpers/call-with-clause-harness.ts:152-168 (the exported `rootDouble`, wrapping the identical no-op checkpoint):
```ts
const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

export function rootDouble(): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
    clock: {
      wallNow: () => 0,
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    },
  } as unknown as RuntimeRoot;
}
```

tests/helpers/runtime-belt-probe-harness.ts:85-93 (the exported `producer`, over the identical `pi`/`root`/`modelRegistry` triple):
```ts
export function producer(root: RuntimeRoot = rootDouble()) {
  return createProductionProducerDeps({
    pi: {
      sendMessage: () => {},
      getActiveTools: () => [],
      setActiveTools: () => {},
    } as unknown as ExtensionAPI,
    root,
    modelRegistry: {} as unknown as ModelRegistry,
  });
}
```

tests/member-access-declared-field-type.test.ts:1170-1195 (the local redeclaration — same `checkpoint`/`idSource` pair, same `pi`/`root`/`modelRegistry` triple, minted independently rather than imported):
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
    // pair satisfies the snapshot/restore window. No provider, no model.
    pi: {
      sendMessage: () => {},
      getActiveTools: () => [],
      setActiveTools: () => {},
    } as unknown as ExtensionAPI,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
  });
}
```

## Why this is a problem
`tests/member-access-declared-field-type.test.ts` names the exact sibling file and the exact two exported function names (`probeSource` / `producer`) as the shape it is applying, yet imports neither the module that shape lives in nor the sibling helper module `tests/non-object-receiver-gate.test.ts` itself imports from. The three inline object literals inside `producer()` (`sendMessage`/`getActiveTools`/`setActiveTools`, and `root`/`modelRegistry`) are byte-identical to `tests/helpers/runtime-belt-probe-harness.ts:85-93`'s exported `producer`, and the `checkpoint`/`idSource` pair inside `rootDouble()` is byte-identical to `tests/helpers/call-with-clause-harness.ts:158-168`'s exported `rootDouble` (which additionally carries a `clock` field this copy omits).

## Suggested direction (non-binding, optional)
`tests/member-access-declared-field-type.test.ts` could import `rootDouble` from `tests/helpers/call-with-clause-harness.ts` and `producer` from `tests/helpers/runtime-belt-probe-harness.ts` in place of its own local declarations, the way `tests/non-object-receiver-gate.test.ts` — the file this file's own comment names as the shape's source — already does.

## False-positive check
Gate-pin: `tests/member-access-declared-field-type.test.ts` does not match `*gate*.test.ts` or the named gate/census kin. Recording-double: `rootDouble`/`producer`/`NOOP_CHECKPOINT` are stub dependency doubles supplying an inert checkpoint and no-op `pi` callbacks; none records a call for a MUST-NOT-be-called witness, so the recording-double carve-out does not apply. Docs/bugs signature search: `grep -rln "NOOP_CHECKPOINT\|rootDouble" docs/bugs/` → 0 hits, so no documented correct-reason red matches this shape. Coverage-matrix/bug-doc citation search: `grep -n "member-access-declared-field-type" docs/reference/coverage-matrix.md` → 0 hits; the file is cited by name in docs/bugs/0136, 0190, 0191, 0192 as a witness suite, but none of those citations names the `rootDouble`/`producer`/`NOOP_CHECKPOINT` lines (1170-1195), and this finding proposes no merge, rename, or deletion of the file or any `it()` cell — only that the local double could import the existing exported equivalents. This is a code-duplication claim about test harness code, not a claim that any test should exist.

## Triage
verdict: confirmed — independently re-verified: all four excerpts reproduce at the cited lines; the quoted harness comment naming non-object-receiver-gate.test.ts / `probeSource` / `producer` and the parseThetaDocument→createProductionProducerDeps→bindPromptConversation→executeBody chain is real at :83-87; sed-extracted diff of the local `producer()` body (:1184-1194) against runtime-belt-probe-harness.ts:86-93 differs only by `root: rootDouble()` vs the `root` parameter (export is a strict superset) and the local `rootDouble()` checkpoint/idSource pair (:1177-1179) diffs to zero against call-with-clause-harness.ts:159-161 (export adds `clock`); neither helper module is imported (imports :1-25) and the copy is live (consumed at :1235 in `run()`); non-object-receiver-gate.test.ts:218-219 does reach the shape via `beltProducer(rootDouble())` from the :8-9 imports; all locations under tests/, D7 copy-paste-double class, target file not *gate*, stub not recording doubles, coverage-matrix cite → 0 reproduces; the filing's docs/bugs `rootDouble` "0 hits" is wrong (1 hit, bug 0172:1255, an unrelated `rootDouble()` mention) but immaterial since no merge/rename/delete is proposed; not tracked elsewhere — no quality/issues or resolved entry cites this file for this site (PTQ-0634 cites it only for the registry-oracle root cause; prior shard-105 review filed only that), and the store's per-file convention for this pattern (PTQ-0209/0542/0603/0738) means same-wave siblings on other files are not the same root cause; fix is a mechanical import swap (triage: claude-fable-5-1)

## Fix attempts
- qw20260919162231: skipped — [PTQ-0914-bug0058-bug0100-local-parse-reimplements-parsedoc.md] PTQ-0914: Replaced both local parse wrappers with shared parseDoc; all tests and assertions retained. / PTQ-0916: Reused shared REGISTRY and RegistryRow; retained local message readers as triage permits. / PTQ-0917: Strengthened the assertion to require exactly one error note, retaining diagnostic and envelope checks. / PTQ-0918: Reused plantThetaWorkspace and disposeWorkspace in both files; fixture writes unchanged. No tests deleted. Required gate passed for all four issues: TypeScript clean, 689 test files and 11,586 tests passed. || [PTQ-0919-assertframestointernalerror-reimplements-assertinternalerror.md] PTQ-0919: Both framing helpers delegate to assertInternalError, preserving all four checks; no tests deleted or renamed. / PTQ-0921: Reused the canonical parse-registry reader and message lookup, retaining the non-empty-message guard; no tests deleted or renamed. / PTQ-0922: Replaced the inline pi/ctx double with makeHarness; discovery assertions remain unchanged; no tests deleted or renamed. / PTQ-0926: Shared thetaInput and driveBinder across all three files, preserving per-file parsing, contexts, and fixtures; no tests deleted or renamed. Required gate passed for all four fixes: tsc clean, 689 test files and 11,586 tests passed. ||
