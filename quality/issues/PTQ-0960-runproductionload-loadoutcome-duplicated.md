---
id: PTQ-0960
title: invoke-arg-array-literal-provable.test.ts and subagent-tool-admission.test.ts redeclare production-load-harness.ts's LoadOutcome/runProductionLoad instead of importing it
lens: D7
wave: qw20260918131151
status: open
verdict: confirmed
locations:
  - tests/invoke-arg-array-literal-provable.test.ts:362-425
  - tests/subagent-tool-admission.test.ts:160-190
  - tests/helpers/production-load-harness.ts:32-38
  - tests/helpers/production-load-harness.ts:60-95
sites: 2
fix_scope: module
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# invoke-arg-array-literal-provable.test.ts and subagent-tool-admission.test.ts redeclare production-load-harness.ts's LoadOutcome/runProductionLoad instead of importing it

## Observation
`tests/invoke-arg-array-literal-provable.test.ts` declares a private `interface LoadOutcome` and a private `async function runProductionLoad(cwd): Promise<LoadOutcome>` that builds a fake, no-UI `ExtensionAPI`/`ExtensionContext` pair and drives `discoverAndComposeFixtures` over it, interposing on `process.stderr.write` to capture the load's diagnostic mirror. `tests/subagent-tool-admission.test.ts` declares the same shape (minus the stderr mirror, plus one extra `getAllTools` override the canonical helper's `ProductionLoadOptions` does not carry). `tests/helpers/production-load-harness.ts` already exports a `LoadOutcome` interface and a `runProductionLoad` function built for exactly this purpose — its own header states it exists because "several test files independently redeclared the same `LoadOutcome` shape and the same `runProductionLoad` function". Neither in-scope-reviewed file imports it.

## Evidence
`tests/invoke-arg-array-literal-provable.test.ts:362-398` (re-read immediately before filing):
```ts
interface LoadOutcome {
  /** Slash names the production compose helper returned. */
  readonly registered: readonly string[];
  /** Error-severity messages surfaced through `ctx.ui.notify`. */
  readonly notifications: readonly string[];
  readonly diagnosticLines: readonly string[];
}

let outcome: LoadOutcome;
let workspaceDir: string;

async function runProductionLoad(cwd: string): Promise<LoadOutcome> {
  const notifications: string[] = [];
  const chunks: string[] = [];
  const pi = {
    getFlag: (): undefined => undefined,
    getCommands: (): readonly unknown[] => [],
    sendMessage: (): void => {},
    sendUserMessage: (): void => {},
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: {
      notify: (message: string, _type: "error"): void => {
        notifications.push(message);
      },
    },
  } as unknown as ExtensionContext;
```

`tests/subagent-tool-admission.test.ts:160-190`:
```ts
interface LoadOutcome {
  readonly registered: readonly string[];
  readonly fixtures: readonly ThetaFixture[];
  readonly notifications: readonly string[];
}

let outcome: LoadOutcome;
let workspaceDir: string;

async function runProductionLoad(cwd: string): Promise<LoadOutcome> {
  const notifications: string[] = [];
  const pi = {
    getFlag: (): undefined => undefined,
    getCommands: (): readonly unknown[] => [],
    sendMessage: (): void => {},
    sendUserMessage: (): void => {},
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
    // RFC-0005: the child-reachable extension tool snapshot the subagent-mode
    // load-time admission widening reads.
    getAllTools: (): readonly unknown[] => FAKE_ALL_TOOLS,
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: {
      notify: (message: string, _type: "error"): void => {
        notifications.push(message);
      },
    },
  } as unknown as ExtensionContext;
```

`tests/helpers/production-load-harness.ts:32-38,60-95` — the canonical export both duplicate:
```ts
export interface LoadOutcome {
  readonly registered: readonly string[];
  readonly notifications: readonly string[];
  /** `theta: <file>:<line>:<col>: <code>: <message>`, one per diagnostic. */
  readonly diagnosticLines: readonly string[];
  /** The composed fixtures the pass produced (discovery order), for callers that need more than `registered`. */
  readonly fixtures: readonly ThetaFixture[];
}
...
export async function runProductionLoad(
  cwd: string,
  opts: ProductionLoadOptions = {},
): Promise<LoadOutcome> {
  const notifications: string[] = [];
  const chunks: string[] = [];
  const pi = {
    getFlag: (name: string): string | undefined => (name === "theta" ? opts.thetaFlag : undefined),
    getCommands: (): readonly { name: string; source: string }[] => opts.piOwnedCommands ?? [],
    sendMessage: (): void => {},
    sendUserMessage: (): void => {},
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
  } as unknown as ExtensionAPI;
```

`grep -n "async function runProductionLoad" tests/*.test.ts` returns 16 files repository-wide; the two cited above are the sites where the reviewed scope's own file (`invoke-arg-array-literal-provable.test.ts`) and one un-migrated sibling reproduce the canonical helper's exact `LoadOutcome` field set (`registered`, `notifications`, plus either `diagnosticLines` or `fixtures`, all of which the exported `LoadOutcome` already carries as a strict superset) and the identical fake-host construction, without importing it.

## Why this is a problem
`tests/helpers/production-load-harness.ts` was built and named specifically to stop this redeclaration, and its own header names the exact failure mode both files repeat: the same fake `pi`/`ctx` construction and the same `LoadOutcome` field set typed out by hand instead of imported. A change to how the fake host is shaped for `discoverAndComposeFixtures`, or to the `LoadOutcome` field set, requires a matching hand-edit in every one of these files rather than flowing through the shared export.

## Suggested direction (non-binding, optional)
Both files' local `LoadOutcome`/`runProductionLoad` declarations name the shared export the helper's own header already points at; `subagent-tool-admission.test.ts`'s one extra `getAllTools` override would need the canonical `ProductionLoadOptions` to grow a matching field, which is a detail for the fix stage.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or a named gate kin; not applicable.
- Recording-double check: `runProductionLoad`'s `pi`/`ctx` fakes are a from-scratch stub host, not a MUST-NOT-witness recording double; not applicable.
- docs/bugs/ signature search: `grep -rln "invoke-arg-array-literal-provable\|subagent-tool-admission" docs/bugs/*.md` returns no hit naming either file's harness as a documented correct-reason red; both files' own test suites pass at HEAD.
- coverage-matrix/bug-doc citation search: `grep -n "invoke-arg-array-literal-provable\|subagent-tool-admission" docs/reference/coverage-matrix.md` returns no hit; this finding proposes no merge, rename or deletion of any `it()`/`describe()`, only that the harness declarations import the existing helper.
- Prior-filing search: `grep -rl "invoke-arg-array-literal-provable" quality/issues quality/intake quality/resolved` (excluding this file) returns no hit for this root cause; the many prior `production-load-harness`-family filings (PTQ-0210/0240/0259/0312/0468/0517/0578/0600/0605/0619/0635/0669/0698/0717/0722/0723/0739/0740/0748/0805/0820/0850, etc.) each name a disjoint pair of files and none names either file cited here.
- Coverage-drift check: this claim is about harness-declaration code that exists and passes today; no assertion is made about a missing test path.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: all four excerpts reproduce verbatim at the cited lines (invoke-arg-array-literal-provable:362-425, subagent-tool-admission:160-190, harness:32-38/60-95); neither file imports tests/helpers/production-load-harness (grep → 0; both import discoverAndComposeFixtures directly); mktemp `diff` of the first file's local body against the helper differs only in the opts parameterisation (getFlag/getCommands/getAvailable, whose undefined/[]/[] defaults equal the local hardcodes) and the helper's extra `fixtures` field, so LoadOutcome is a strict subset and the swap is a mechanical import; the second file's copy matches field-for-field plus a `getAllTools` stub the helper lacks — the same ProductionLoadOptions widening already ruled mechanical for uppercase-pi-tool-name-refusal in confirmed PTQ-0739; `async function runProductionLoad` → 16 tests files reproduces; D7 boilerplate-duplication in tests/ only, not a gate file, stub host not a MUST-NOT recording double, coverage-matrix → 0, both suites green (41/41); two filing inaccuracies are immaterial — the quality-store grep returns 12 hits, not 0 (PTQ-0599/0606/0712/0814 and in-wave d7-02/d7-04 cite disjoint blocks of these files; resolved PTQ-0210 rostered invoke-arg-array-literal-provable:415-424 as site 4 but its fix commit 2594cd44 migrated only arg-mismatch-diagnostic-count-by-surface and the sole later commit d7b9c00b did not touch runProductionLoad, so per the PTQ-0635 precedent this un-migrated residual is a fresh filing, not a duplicate), and docs/bugs 0146/0452 do cite the first file but only as fixed-status witnesses, pinning no harness block; nothing open tracks either file's runProductionLoad copy (triage: claude-fable-5-1)
