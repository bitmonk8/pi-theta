---
id: PTQ-1031
title: invoke-arg-type-mismatch-wired.test.ts redeclares production-load-harness.ts's LoadOutcome/runProductionLoad instead of importing them, despite already importing sibling exports from the same module
lens: D7
status: open
verdict: confirmed
locations:
  - tests/invoke-arg-type-mismatch-wired.test.ts:402-461
  - tests/helpers/production-load-harness.ts:36-95
sites: 1
fix_scope: localized
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# invoke-arg-type-mismatch-wired.test.ts redeclares production-load-harness.ts's LoadOutcome/runProductionLoad instead of importing them, despite already importing sibling exports from the same module

## Observation
`tests/invoke-arg-type-mismatch-wired.test.ts` imports `assertNoStemIsASuffix`,
`theta`, `invokeCaller`, and `callableCaller` from
`./helpers/production-load-harness` at its top, then separately declares a
private module-scope `interface LoadOutcome` and `async function
runProductionLoad(cwd): Promise<LoadOutcome>` that builds a fake, no-UI
`ExtensionAPI`/`ExtensionContext` pair, drives `discoverAndComposeFixtures`
directly, and interposes on `process.stderr.write` to capture the load's
diagnostic mirror. `tests/helpers/production-load-harness.ts` — the very
module this file already imports four other exports from — exports an
`export interface LoadOutcome` and an `export async function
runProductionLoad(cwd, opts)` built for this exact purpose, with a strict
superset of the local interface's fields.

## Evidence

tests/invoke-arg-type-mismatch-wired.test.ts:1 (the file already imports from
this module):
```ts
import { assertNoStemIsASuffix, theta, invokeCaller, callableCaller } from "./helpers/production-load-harness";
```

tests/invoke-arg-type-mismatch-wired.test.ts:402-461 (re-read immediately
before filing — the local redeclaration):
```ts
interface LoadOutcome {
  /** Slash names the production compose helper returned (returned fixtures). */
  readonly registered: readonly string[];
  /** Error-severity messages surfaced through `ctx.ui.notify`. */
  readonly notifications: readonly string[];
  /**
   * `makeLoadEmit`'s no-UI stderr mirror, one entry per rendered line:
   * `theta: <file>:<line>:<col>: <code>: <message>`. The only channel carrying
   * the emitting file, which is what makes a per-caller ABSENCE assertion sound
   * for a row whose *Message* names no callee — and the only channel a WARNING
   * reaches at all, the notify arm being error-only.
   */
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

tests/helpers/production-load-harness.ts:36-71 (the canonical export the
file's own import line already reaches):
```ts
export interface LoadOutcome {
  readonly registered: readonly string[];
  readonly notifications: readonly string[];
  /** `theta: <file>:<line>:<col>: <code>: <message>`, one per diagnostic. */
  readonly diagnosticLines: readonly string[];
  /** The composed fixtures the pass produced (discovery order), for callers that need more than `registered`. */
  readonly fixtures: readonly ThetaFixture[];
}

export interface ProductionLoadOptions {
  readonly availableModels?: readonly unknown[];
  readonly thetaFlag?: string;
  readonly piOwnedCommands?: readonly { readonly name: string; readonly source: string }[];
}

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
  const ctx = {
    cwd,
    modelRegistry: { getAvailable: (): readonly unknown[] => opts.availableModels ?? [] },
    ui: {
      notify: (message: string, _type: "error"): void => {
        notifications.push(message);
      },
    },
  } as unknown as ExtensionContext;
```

The local `LoadOutcome`'s three fields (`registered`, `notifications`,
`diagnosticLines`) are exactly the exported `LoadOutcome`'s first three
fields, and the local `pi`/`ctx` construction (six `pi` methods with the
same no-op bodies, the same `ctx.modelRegistry.getAvailable`/`ctx.ui.notify`
shape) is field-for-field the same as the exported `runProductionLoad`'s
construction with every `opts.*` default substituted in (no `thetaFlag`, no
`piOwnedCommands`, no `availableModels`). The local file's own stderr
interposition (`process.stderr.write = ((chunk: unknown) => { chunks.push(...) })`,
restored in a `.finally`) that follows immediately after is likewise
byte-identical to `production-load-harness.ts`'s corresponding block.

## Why this is a problem
`tests/helpers/production-load-harness.ts`'s own header names exactly this
failure mode: "Several test files independently redeclared the same
`LoadOutcome` shape and the same `runProductionLoad` function" — the module
exists specifically to be imported instead of re-derived. This file already
imports four sibling exports (`assertNoStemIsASuffix`, `theta`,
`invokeCaller`, `callableCaller`) from that same module on its first import
line, so the redeclaration is not an isolated file failing to discover the
helper — the helper is already in scope, one import away, and the file
chose to retype it instead.

## Suggested direction (non-binding, optional)
The file's own first import line already names the module that exports a
strict superset of the locally redeclared `LoadOutcome`/`runProductionLoad`;
widening that same import to include them is the natural next step the
file's own import list already points at.

## False-positive check
- Gate-pin check: `tests/invoke-arg-type-mismatch-wired.test.ts` does not
  match `*gate*.test.ts` or the named gate kin (closing-gate,
  cross-cutting-gates, rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate); nothing cited here is a pinned count or
  inventory.
- Recording-double check: the fake `pi`/`ctx` host records `notifications`
  for a positive per-cell assertion (what message surfaced), not a MUST-NOT
  "never called" witness; the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -n "invoke-arg-type-mismatch-wired"
  docs/bugs/*.md` shows the file cited only as bug 0137's fixed acceptance
  witness (Status: fixed); no documented correct-reason red covers this
  harness declaration.
- coverage-matrix/bug-doc citation search: `grep -n
  "invoke-arg-type-mismatch-wired" docs/reference/coverage-matrix.md` → 0
  hits by internal line range; this finding proposes no merge, rename, or
  deletion of any `it()`/`describe()` in the file, only that the harness
  declaration could import the existing helper instead of retyping it.
- Prior-filing search: `grep -rl "invoke-arg-type-mismatch-wired"
  quality/issues/*.md quality/resolved/*.md quality/intake/*.md` returns
  several files (PTQ-0814, PTQ-0966, PTQ-0977, PTQ-0983, plus the resolved
  PTQ-0210/0240/0259/0312/0599/0606) but each names a disjoint root cause
  (`linesFor`/`linesForCode` duplication, `assertRowSurfaceLive`
  duplication, a registry-oracle reimplementation, an `invokeArgMessage`
  wrapper, or a fixture/workspace-lifecycle harness) — none names the
  `LoadOutcome`/`runProductionLoad` pair as its own root cause for this
  file. Resolved PTQ-0210 originally rostered this file's prior line range
  (469-478) as one of five sites, but its fix commit migrated only
  `tests/arg-mismatch-diagnostic-count-by-surface.test.ts` (per the
  independently-confirmed triage note on the sibling finding PTQ-0960,
  which re-filed the same un-migrated-residual pattern for two other files
  from that same original five-file list) — this file's copy was never
  migrated and is a fresh, distinct residual from that same original
  finding, not yet re-filed elsewhere.
- Coverage check: the claim concerns a harness-declaration DEFINITION that
  exists and passes at HEAD; no assertion is made about a missing test path.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim (test :402-461 local `interface LoadOutcome` + `async function runProductionLoad`; helper :36-110 exports), line 1 already imports four siblings from ./helpers/production-load-harness while `grep -n "runProductionLoad\|LoadOutcome"` in the file shows only the local declarations (:402/:417/:420/:485) and no import; mktemp sed-range diff of the local body against the helper differs ONLY in the opts parameterisation (getFlag/getCommands/getAvailable, whose undefined/[]/[] defaults equal the local hardcodes) and the helper's extra `fixtures` field, and the file consumes only `registered`/`notifications`/`diagnosticLines` (19/20/1 reads), so the swap is a mechanical import; git confirms the residual — PTQ-0210 rostered this file at :469-478 but its fix commit 2594cd44 touched it 0 times and the two later commits (d7b9c00b, cec9ee56) left the harness in place; not a duplicate under the store's operative precedent — PTQ-0960 (open) covers invoke-arg-array-literal-provable + subagent-tool-admission only and its own triage ruled disjoint-file PTQ-0210 residuals fresh filings, as did the separately-minted PTQ-0820/0850/0910/0978/0635, and no open row names this file's copy (PTQ-0814/0966/0977/0983 cite disjoint blocks); D7 copy-paste double in tests/ only, not a gate file, stub host records for positive per-cell assertions not a MUST-NOT witness, coverage-matrix → 0, suite green (40/40); one filing inaccuracy is immaterial — docs/bugs names the file in 13 docs, not just 0137, but the only one mentioning the harness (0207) is Status: fixed and concerned comment wording, pinning no block (triage: claude-fable-5-1)
