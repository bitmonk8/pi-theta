---
id: PTQ-0905
title: b0399's typed-query cascade half retypes the b0355 ScriptedParent driver and the scripted-typed-query-harness NOOP_CHECKPOINT/liveSignal/schemaDeclsOf/ajv quartet instead of importing either
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: intake
verdict: questionable
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0399-boundary-event-attempts-tokens-masked.test.ts:292-300
  - tests/b0399-boundary-event-attempts-tokens-masked.test.ts:312-341
  - tests/b0399-boundary-event-attempts-tokens-masked.test.ts:351-376
  - tests/helpers/scripted-typed-query-harness.ts:36-44
  - tests/helpers/scripted-typed-query-harness.ts:79-103
  - tests/b0355-repair-terminal-masked-followup-slot.test.ts:95-131
sites: 2
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918075903
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
fix_skips: 2
---

# b0399's typed-query cascade half retypes the b0355 ScriptedParent driver and the scripted-typed-query-harness NOOP_CHECKPOINT/liveSignal/schemaDeclsOf/ajv quartet instead of importing either

## Observation
`tests/b0399-boundary-event-attempts-tokens-masked.test.ts`'s half (i) drives a typed-query respond-repair cascade. Its own header comment states this half "fuses" "the b0355 + effectful-statement-host rigs," and its `ScriptedParent` class doc-comment says it "mirrors b0355's `ScriptedParent`." Four of its module-scope declarations — `NOOP_CHECKPOINT`, `liveSignal()`, `schemaDeclsOf()`, `ajv()` — are, body for body, the same exports `tests/helpers/scripted-typed-query-harness.ts` already publishes under the identical names (that helper's own `ajv()` doc-comment calls the function "byte-identical to the sibling suites"). Three more declarations — `toolUse`, `textTurn`, `respond`, and the `ScriptedParent` class body — are, statement for statement, the same declarations already sitting in `tests/b0355-repair-terminal-masked-followup-slot.test.ts`. Neither source is imported; the reviewed file retypes both.

## Evidence
`tests/b0399-boundary-event-attempts-tokens-masked.test.ts:292-300`:
```ts
const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

function liveSignal(): AbortSignal {
  return new AbortController().signal;
}
```
`tests/helpers/scripted-typed-query-harness.ts:36-44` (identical apart from `export`):
```ts
export const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

export function liveSignal(): AbortSignal {
  return new AbortController().signal;
}
```

`tests/b0399-boundary-event-attempts-tokens-masked.test.ts:351-376` (`schemaDeclsOf`/`ajv`, the "demo.theta"/"probe.theta" path literal is the only textual difference):
```ts
function schemaDeclsOf(src: string): readonly SchemaDecl[] {
  const parseDeps = {
    systemNote: {
      pi: { sendMessage: () => Promise.resolve() },
      ui: { notify: () => {} },
      emitDiagnostic: () => {},
    },
    modelMatcher: { resolve: () => "resolved" as const },
  } as unknown as ParseThetaDocumentDeps;
  const source: ThetaSource = {
    path: "demo.theta",
    bytes: new TextEncoder().encode(src),
  };
  const doc = parseThetaDocument(source, parseDeps);
  return doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema");
}

/** The real production AJV validator (byte-identical to the sibling suites). */
function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: "probe",
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}
```
`tests/helpers/scripted-typed-query-harness.ts:79-103` — the canonical versions, differing from the excerpt above only by the `export` keyword and the `"probe.theta"` path literal.

`tests/b0399-boundary-event-attempts-tokens-masked.test.ts:312-341` (`toolUse`/`textTurn`/`respond` consts and the `ScriptedParent` class):
```ts
const toolUse = (...ids: string[]): FreePhaseTurn => ({
  kind: "tool_use",
  batch: ids.map((toolUseId) => ({ toolName: "search", toolUseId })),
});
const textTurn = (text: string): FreePhaseTurn => ({ kind: "text", text });
const respond = (payload: unknown): ForcedRespondTurn => ({ kind: "respond", payload });

class ScriptedParent implements QueryModelDriver {
  constructor(
    private readonly freeTurns: readonly FreePhaseTurn[],
    private readonly forced: ForcedRespondTurn,
  ) {}

  nextFreePhaseTurn(round: number): Promise<FreePhaseTurn> {
    const turn = this.freeTurns[round];
    if (turn === undefined) {
      throw new Error(`no scripted free-phase turn for round ${round}`);
    }
    return Promise.resolve(turn);
  }

  runToolBatch(): Promise<readonly CommittedSideEffect[]> {
    return Promise.resolve([]);
  }

  forcedRespondTurn(): Promise<ForcedRespondTurn> {
    return Promise.resolve(this.forced);
  }
}
```
`tests/b0355-repair-terminal-masked-followup-slot.test.ts:95-131` — the same three consts and the same class, method for method identical (only the doc-comment prose above the class differs):
```ts
const toolUse = (...ids: string[]): FreePhaseTurn => ({
  kind: "tool_use",
  batch: ids.map((toolUseId) => ({ toolName: "search", toolUseId })),
});
const textTurn = (text: string): FreePhaseTurn => ({ kind: "text", text });
const respond = (payload: unknown): ForcedRespondTurn => ({ kind: "respond", payload });
...
class ScriptedParent implements QueryModelDriver {
  constructor(
    private readonly freeTurns: readonly FreePhaseTurn[],
    private readonly forced: ForcedRespondTurn,
  ) {}

  nextFreePhaseTurn(round: number): Promise<FreePhaseTurn> {
    const turn = this.freeTurns[round];
    if (turn === undefined) {
      throw new Error(`no scripted free-phase turn for round ${round}`);
    }
    return Promise.resolve(turn);
  }

  runToolBatch(): Promise<readonly CommittedSideEffect[]> {
    return Promise.resolve([]);
  }

  forcedRespondTurn(): Promise<ForcedRespondTurn> {
    return Promise.resolve(this.forced);
  }
}
```

Search: `grep -n "invoke-seam-scaffold\|scripted-typed-query-harness" tests/b0399-boundary-event-attempts-tokens-masked.test.ts` → 0 hits (the file imports neither helper). Git history: `tests/helpers/scripted-typed-query-harness.ts` last touched 2026-09-17; `tests/b0399-boundary-event-attempts-tokens-masked.test.ts` last touched 2026-09-18 — the helper predates the reviewed file by one day.

## Why this is a problem
Four declarations in the reviewed file's typed-query half are, body for body, exports `tests/helpers/scripted-typed-query-harness.ts` already ships under the identical names for the identical purpose (that helper's own comment calling `ajv()` "byte-identical to the sibling suites" is itself evidence of a recognised recurring shape), and three more plus a class are, statement for statement, the same declarations already sitting in the sibling bug file the reviewed file's own comments name as its model ("mirrors b0355's `ScriptedParent`," "fuses … the b0355 … rig[]"). The file was authored a day after the shared helper existed and still retypes the pieces it names as its own sources rather than importing them.

## Suggested direction (non-binding, optional)
Importing `NOOP_CHECKPOINT`, `liveSignal`, `schemaDeclsOf`, and `ajv` from `tests/helpers/scripted-typed-query-harness.ts`, and lifting the `toolUse`/`textTurn`/`respond`/`ScriptedParent` quartet the reviewed file and `tests/b0355-repair-terminal-masked-followup-slot.test.ts` both already carry into that same helper (or a sibling one), is the natural convergence point the files' own "mirrors"/"fuses" comments already point toward.

## False-positive check
- Gate-pin: neither `tests/b0399-boundary-event-attempts-tokens-masked.test.ts` nor `tests/b0355-repair-terminal-masked-followup-slot.test.ts` matches `*gate*.test.ts` or a named kin; no pinned count/inventory is touched.
- Recording-double: `ScriptedParent` scripts a driver's outbound turns for the loop under test; its own methods either replay a scripted turn or throw on an unscripted round (a fail-loud precondition guard, not a MUST-NOT-called negative witness assertion). The negative-witness carve-out does not apply, since no test asserts a call was NEVER made against these doubles.
- docs/bugs/ signature search: `docs/bugs/0399-boundary-event-omits-attempts-tokens-masked.md` exists and pins the fix contract the file's RED/GREEN rows encode; it is silent on the harness-declaration duplication this finding targets, and no assertion row is touched by this finding.
- coverage-matrix/bug-doc citation search: `grep -n "b0399-boundary-event-attempts-tokens-masked\|b0355-repair-terminal-masked-followup-slot" docs/reference/coverage-matrix.md` → 0 hits. No merge, rename, or deletion of any file or `it()`/`describe()` is proposed — only that the named local declarations could be imported/shared instead of retyped.
- Coverage check: the claim is about repeated harness DEFINITIONS with a live sibling and a live helper, not a missing test path; every cited piece is exercised, unchanged, by the tests in its own file.

## Triage
<!-- triage appends its note here -->
verdict: confirmed — independently re-verified: all excerpts reproduce at the cited lines (b0399 :292-300 `NOOP_CHECKPOINT`/`liveSignal` sed-extracted diff vs scripted-typed-query-harness.ts:36-44 minus `export` is empty; :351-376 `schemaDeclsOf`/`ajv` vs helper :79-103 differ only by the `parseDeps`→`deps` local rename and the `"demo.theta"`/`"probe.theta"` literal — the filing omits the rename, immaterial; the `toolUse`/`textTurn`/`respond` trio + full `ScriptedParent` class at b0399 :312-349 vs b0355 :95-131 diff to empty after comment stripping, the filing's :341 end merely truncates the class), every local copy is live (`ajv()` :414/:524, `NOOP_CHECKPOINT`/`liveSignal()` :472-473/:535-536, `schemaDeclsOf` :516/:562, `new ScriptedParent([toolUse..], respond(..))` :537/:574), `grep scripted-typed-query-harness\|invoke-seam-scaffold` on b0399 → 0 (its only helper import is scripted-live-session-harness), the helper is a real canonical (imported by b0352/b0353, minted by fixed PTQ-0439), `class ScriptedParent` exists in exactly these two test files repo-wide, coverage-matrix → 0 and docs/bugs/0399 cites the file only as a witness with no harness name, no merge/rename/delete proposed, both files green (11/11); one Observation fact is inverted and immaterial — `git log -L292,300` shows the b0399 region landed in ec2a8ac2 (2026-09-03), predating the helper (3d7f510a, 2026-09-17) by two weeks, so this is an unmigrated residual of the PTQ-0439 hoist, not a copy typed a day after the helper; all locations under tests/, D7 copy-paste-fixture/double class, no gate/recording-double/red-test carve-out; not a duplicate — PTQ-0871 is the helper-to-helper mirror (scripted-typed-query-harness vs typed-query-harness), PTQ-0855 cites tool-calls-* files for `liveSignal`, fixed PTQ-0537 covered b0399's half-(ii) capturing harness, same-wave d7-01 covers the disjoint :433-449 NOOP_SINK/NoopMutator/span triad, and no open issue cites b0355 or b0399 for this quartet or `ScriptedParent`; fixer note: PTQ-0871 may collapse the target helper into typed-query-harness.ts, so import from whichever survives (triage: claude-fable-5-1)
verdict: questionable — parked by the store: skipped by the fixer in 2 waves (see "## Fix attempts"); rule with accept --note <direction> or reject (store)

## Fix attempts
- qw20260919162231: skipped — [PTQ-0914-bug0058-bug0100-local-parse-reimplements-parsedoc.md] PTQ-0914: Replaced both local parse wrappers with shared parseDoc; all tests and assertions retained. / PTQ-0916: Reused shared REGISTRY and RegistryRow; retained local message readers as triage permits. / PTQ-0917: Strengthened the assertion to require exactly one error note, retaining diagnostic and envelope checks. / PTQ-0918: Reused plantThetaWorkspace and disposeWorkspace in both files; fixture writes unchanged. No tests deleted. Required gate passed for all four issues: TypeScript clean, 689 test files and 11,586 tests passed. || [PTQ-0919-assertframestointernalerror-reimplements-assertinternalerror.md] PTQ-0919: Both framing helpers delegate to assertInternalError, preserving all four checks; no tests deleted or renamed. / PTQ-0921: Reused the canonical parse-registry reader and message lookup, retaining the non-empty-message guard; no tests deleted or renamed. / PTQ-0922: Replaced the inline pi/ctx double with makeHarness; discovery assertions remain unchanged; no tests deleted or renamed. / PTQ-0926: Shared thetaInput and driveBinder across all three files, preserving per-file parsing, contexts, and fixtures; no tests deleted or renamed. Required gate passed for all four fixes: tsc clean, 689 test files and 11,586 tests passed. ||
- qw20260919170939: skipped — [PTQ-0908-registry-oracle-reimplemented-b0268.md] PTQ-0908: Already uses readRegistry(["parse"]); cited duplication no longer reproduces. No edits. / PTQ-0909: Already uses soleByFragment at all four cited call sites; local soleCollision is absent. No edits. / PTQ-0910: compose() already delegates to runProductionLoad; duplicated host doubles are absent. No edits. / PTQ-0927: Replaced local parseDeps with the shared import and removed unused types. All tests and assertions retained. Required gate passed: TypeScript clean, 689 test files and 11,586 tests passed. || [PTQ-0928-detach-throw-harness-reimplements-supersessionharness.md] PTQ-0928: Reused shared supersession/base harnesses; preserved quiesce pass attribution and note recording. All assertions retained. / PTQ-0933: Migrated b0282 and triage-listed b0277 fixture builders to loadRowFromBody/loadRowFromParam; fixture paths and assertions unchanged. / PTQ-0934: Imported shared render in b0368 and triage-listed b0369; removed identical local copies without changing assertions. / PTQ-0937: Imported shared reportOf at both sites; preserved exact failure wording through an optional fixture label. No tests deleted. Exact verification gate passed: TypeScript and all 689 test files / 11,586 tests. || [PTQ-0938-requirepath-precondition-pair-duplicated.md] PTQ-0938: Centralized both path checks across all 12 callers, preserving check order and failure wording; no tests deleted. / PTQ-0939: Migrated all three triaged message readers to canonical registry helpers, retaining expected messages and adding placeholder-presence checks; no tests deleted. / PTQ-0942: Replaced the local reportOf with the canonical import, preserving narrowing and failure wording; no tests deleted. / PTQ-0945: Replaced the duplicate four-page registry read with shared REGISTRY and removed unused imports and type; no tests deleted. Required gate passed for all fixes: tsc and 11,586 tests across 689 files; git diff --check clean. ||
