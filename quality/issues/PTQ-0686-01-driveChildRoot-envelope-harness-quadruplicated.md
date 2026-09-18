---
id: PTQ-0686
title: subagent-envelope-nonfinite-ok-refusal.test.ts retypes the parseDeps/parseTheta/NOOP_CHECKPOINT/realAjvValidator/rootDouble/ChildDrive/driveChildRoot/soleEnvelope/driveDetail harness three sibling files already carry, with no tests/helpers/ home
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/subagent-envelope-nonfinite-ok-refusal.test.ts:289-359
  - tests/subagent-envelope-nonfinite-ok-refusal.test.ts:473-540
  - tests/subagent-envelope-negative-zero-fidelity.test.ts:272-345
  - tests/subagent-envelope-negative-zero-fidelity.test.ts:478-533
  - tests/subagent-envelope-result-carriage.test.ts:980-1053
  - tests/subagent-envelope-result-carriage.test.ts:1049-1095
  - tests/subagent-return-depth-refusal.test.ts:726-799
  - tests/subagent-return-depth-refusal.test.ts:792-846
sites: 4
fix_scope: cross-module       # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 1
---

# subagent-envelope-nonfinite-ok-refusal.test.ts retypes the parseDeps/parseTheta/NOOP_CHECKPOINT/realAjvValidator/rootDouble/ChildDrive/driveChildRoot/soleEnvelope/driveDetail harness three sibling files already carry, with no tests/helpers/ home

## Observation
`tests/subagent-envelope-nonfinite-ok-refusal.test.ts` declares, module scope,
a nine-piece harness for driving the shipped child-side envelope writer
in-process: `parseDeps()`, `parseTheta()`, `NOOP_CHECKPOINT`,
`realAjvValidator()`, `rootDouble(schemaValidator)`, the `ChildDrive`
interface, `driveChildRoot(body)`, `soleEnvelope(drive)`, and
`driveDetail(drive)`. The identical nine pieces — same names, same bodies,
same JSDoc phrasing in three of the nine — are independently redeclared in
`tests/subagent-envelope-negative-zero-fidelity.test.ts`,
`tests/subagent-envelope-result-carriage.test.ts`, and
`tests/subagent-return-depth-refusal.test.ts`. No `tests/helpers/` module
exports any piece of this bundle.

## Evidence

`tests/subagent-envelope-nonfinite-ok-refusal.test.ts:306-316` (`parseTheta`):
```ts
function parseTheta(path: string, src: string): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  const doc = parseThetaDocument(source, parseDeps());
  const errors = doc.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `precondition unmet: fixture ${path} failed to parse — ` +
        `${errors.map((d) => `${d.code}: ${d.message}`).join("; ")}`,
    );
  }
  return doc;
}
```

`tests/subagent-envelope-nonfinite-ok-refusal.test.ts:342-351` (`rootDouble`):
```ts
function rootDouble(schemaValidator: SchemaValidator): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
    clock: {
      wallNow: () => 0,
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>),
    },
    schemaValidator,
  } as unknown as RuntimeRoot;
}
```

`tests/subagent-envelope-nonfinite-ok-refusal.test.ts:494-522` (`driveChildRoot`,
excerpted to its unique body):
```ts
async function driveChildRoot(body: string): Promise<ChildDrive> {
  const doc = parseTheta("worker.theta", SUBAGENT_FM + body);
  const lines: string[] = [];
  const diagnostics: Diagnostic[] = [];
  const outcomeEmitted: { channel: string; data: unknown }[] = [];
  const deps = createProductionProducerDeps({
    pi: { sendMessage: (): void => {}, getAllTools: () => [] } as unknown as ExtensionAPI,
    root: rootDouble(realAjvValidator()),
    modelRegistry: {
      getAvailable: () => [{ id: "claude-test", provider: "anthropic" }],
    } as unknown as ModelRegistry,
    subagentParentEnv: {},
    subagentRootRegime: { active: true, slug: "worker" },
```

The same nine function/interface names, at the module-scope declarations
listed below, in each sibling file:

`tests/subagent-envelope-negative-zero-fidelity.test.ts:272,289,302,315,325,478,493,534,545`
(`parseDeps`, `parseTheta`, `NOOP_CHECKPOINT`, `realAjvValidator`,
`rootDouble`, `ChildDrive`, `driveChildRoot`, `soleEnvelope`, `driveDetail`) —
`parseDeps` there (`:272-280`) is byte-identical to the reviewed file's:
```ts
function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}
```
(byte-identical to `tests/subagent-envelope-nonfinite-ok-refusal.test.ts:289-297`,
`tests/subagent-envelope-result-carriage.test.ts:980-988`, and
`tests/subagent-return-depth-refusal.test.ts:726-734` — the same nine lines
verified in all four files.)

`tests/subagent-envelope-result-carriage.test.ts:980,999,1012,1023,1033,1049,1055,1096,1107`
— the same nine declarations; its `driveChildRoot` (`:1055-1093`) matches the
reviewed file's `driveChildRoot` line for line except the captured
`sourcePath` variable name (`UNIT_CALLEE_PATH` vs `CALLEE_PATH`) and the
absence of the `outcomeEmitted` triple the reviewed file and
`subagent-return-depth-refusal.test.ts` both carry.

`tests/subagent-return-depth-refusal.test.ts:726,743,756,767,777,792,800,847,858`
— the same nine declarations; its `driveChildRoot` (`:800-846`) is
byte-identical to the reviewed file's `driveChildRoot`
(`tests/subagent-envelope-nonfinite-ok-refusal.test.ts:494-539`) including the
`outcomeEmitted` recording triple, differing only in the captured
`sourcePath` variable name.

Search: `grep -n "^function parseDeps\|^function parseTheta\|^const NOOP_CHECKPOINT\|^function realAjvValidator\|^function rootDouble\|^interface ChildDrive\|^async function driveChildRoot\|^function soleEnvelope\|^function driveDetail" tests/*.test.ts` hits exactly these four files, nine matches each (36 total), and no others.
`grep -rn "driveChildRoot\|rootDouble\|realAjvValidator\|NOOP_CHECKPOINT\|soleEnvelope" tests/helpers/*.ts` → 0 hits — no `tests/helpers/` module exports any piece of the bundle.

## Why this is a problem
Four files declare the identical nine-piece harness — `parseDeps`,
`parseTheta`, `NOOP_CHECKPOINT`, `realAjvValidator`, `rootDouble`,
`ChildDrive`, `driveChildRoot`, `soleEnvelope`, `driveDetail` — at module
scope, with `parseDeps` byte-identical across all four and `driveChildRoot`
byte-identical between the reviewed file and
`tests/subagent-return-depth-refusal.test.ts`. `docs/bugs/0201-result-carried-payloads-skip-envelope-walks.md:320-321`
already names `tests/subagent-return-depth-refusal.test.ts`'s `driveChildRoot`
as "the harness shape" reused by a fourth in-progress witness, confirming the
shape is recognised as reusable rather than incidental convergence. No
`tests/helpers/` module hosts any of the nine pieces, so a reader of any one
file has no signal that its harness is a restatement of three siblings'
rather than a bundle built fresh for that file's own scenario.

## Suggested direction (non-binding, optional)
A `tests/helpers/`-hosted module exporting `parseDeps`, `parseTheta`,
`NOOP_CHECKPOINT`, `realAjvValidator`, `rootDouble`, `ChildDrive`,
`driveChildRoot`, `soleEnvelope`, and `driveDetail` (parameterised by the
callee path and outcome-events capture each file's own scenario already
supplies) is the natural next home the four files' identical declarations
already point toward.

## False-positive check
- Gate-pin: the file matches no `*gate*.test.ts` or named gate kin; the cited
  lines are harness plumbing, not a pinned count or inventory.
- Recording-double: `driveChildRoot`'s captured `lines`/`diagnostics`/`outcomeEmitted`
  arrays are recording doubles used to report what the shipped writer DID
  produce (a positive witness read by each cell's own assertions), not a
  "never called" negative witness; the carve-out does not apply to the
  harness declarations themselves.
- docs/bugs/ signature search: `grep -rl "parseDeps\|driveChildRoot\|NOOP_CHECKPOINT" docs/bugs/` →
  only `docs/bugs/0201-result-carried-payloads-skip-envelope-walks.md`, which
  names `driveChildRoot` as a harness SHAPE to reuse, not a pinned red; the
  reviewed file's own bug (0180) is "fixed (0.105.0)" per its own header and
  the export it exercises (`mapNonRepresentableReturnValue`) exists in
  `src/runtime/subagent-envelope.ts` at HEAD, so this is not a documented
  correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "subagent-envelope-nonfinite-ok-refusal\|subagent-envelope-negative-zero-fidelity\|subagent-envelope-result-carriage\|subagent-return-depth-refusal"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of any test file or `it()`/`describe()` — only
  that the shared nine-piece harness could be imported from a new helper —
  so no citation is affected.
- Overlap check: `grep -rl "driveChildRoot\|subagent-return-depth-refusal\|subagent-envelope-result-carriage\|subagent-envelope-negative-zero-fidelity" quality/intake quality/issues quality/resolved`
  shows only `qw20260917154546-d7-03-b0337-subagent-spawn-launch-watchdog-harness-duplicated.md`
  (a different root cause: the real-process `PI_CLI_ENTRY`/`launchSubagentChild`
  spawn+watchdog harness, not the in-process `driveChildRoot` envelope-writer
  harness) and `PTQ-0011-subagent-drive-deps-clock-unread.md` (an unread-field
  finding, not duplication); neither names all four files cited here or this
  specific nine-piece bundle.
- Coverage check: the claim is about a repeated harness DEFINITION, not a
  missing test path; all four copies are exercised by their own files' tests,
  which pass at HEAD.

## Triage
verdict: confirmed — independently re-verified: extracted all four module-scope harnesses (nonfinite-ok-refusal:289-360/473-560, negative-zero-fidelity:272-345/478-555, result-carriage:980-1053/1049-1115, return-depth-refusal:726-799/792-868) and diffed them under $TEMP — parseDeps/parseTheta/NOOP_CHECKPOINT/realAjvValidator/rootDouble(schemaValidator)/soleEnvelope/driveDetail are body-identical in all four (diff hunks are JSDoc prose only), driveChildRoot differs only by the sourcePath const name (CALLEE_PATH vs UNIT_CALLEE_PATH) and the outcomeEmitted recording triple present in nonfinite-ok-refusal and return-depth-refusal but absent in the other two; the bundle-specific pieces (driveChildRoot/soleEnvelope/driveDetail) grep to exactly these four files and no helper; docs/bugs/0201:316-321 quote ("the harness shape … driveChildRoot") reproduces; bug 0180 header is "fixed (0.105.0)" and mapNonRepresentableReturnValue exists at src/runtime/subagent-envelope.ts:966; coverage-matrix cites none of the four files; no gate/recording-double/red-witness carve-out applies; not tracked in issues/resolved (PTQ-0209/0360/0384 are different harnesses; sibling intake 131-02 is the prompt-attach driver, a distinct root cause). Two overstatements noted but non-refuting: the stated grep actually hits parseDeps/rootDouble/NOOP_CHECKPOINT in dozens of files and tests/helpers/call-with-clause-harness.ts does export a zero-arg rootDouble (different shape, no schemaValidator param), and tests/helpers/subagent-fn-child-regime.ts (driveSubagentFnEntry/childRegimeRootDouble) is a near-cousin child-regime drive the fixer may want to build on (triage: claude-fable-5-1)

## Fix attempts
- qw20260918202006: skipped — [PTQ-0645-01-object-pattern-head-runtime-harness-duplicated.md] PTQ-0645: Shared the runtime harness across both listed files and the triage-cited third copy; retained fixture-path literals and all assertions. / PTQ-0646: Shared diagnostic helpers across six files, reused registry/corpus helpers, and preserved hint assertions and raw-page checks. / PTQ-0653: Centralized all eight TRIAGE_DEF copies and four BODY copies in tests/helpers/triage-fixture.ts; tests unchanged. / PTQ-0657: Shared AJV note constants and rendering through the existing binder harness. Final required gate passed: TypeScript and all 11,569 tests across 687 files. ||
