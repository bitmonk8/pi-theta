---
id: PTQ-0881
title: binder-param-line-newline-normalisation.test.ts redeclares the four-page RegistryRow/REGISTRY read instead of importing tests/helpers/registry-oracle.ts
lens: D7
status: intake
verdict: questionable
locations:
  - tests/binder-param-line-newline-normalisation.test.ts:202-226
  - tests/helpers/registry-oracle.ts:19-46
sites: 1
fix_scope: localized
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
fix_skips: 2
---

# binder-param-line-newline-normalisation.test.ts redeclares the four-page RegistryRow/REGISTRY read instead of importing tests/helpers/registry-oracle.ts

## Observation
`tests/helpers/registry-oracle.ts` exports a `RegistryRow` interface and a
`REGISTRY` constant built by reading and joining the four sharded diagnostics
registry pages (`code-registry-{parse,load,runtime,host}.md`) through the
real `parseRegistry`, carrying the doc comment "The live four-page sharded
registry — the input tests/code-registry.test.ts reconciles." — minted per
PTQ-0215 to centralise exactly this read. `tests/binder-param-line-newline-normalisation.test.ts`
does not import this module; it declares its own `RegistryRow` interface with
the same six fields and its own `REGISTRY` constant built by the identical
four-file read-and-join, carrying the same doc comment verbatim.

## Evidence
`tests/helpers/registry-oracle.ts:19-46` (re-read immediately before
filing):
```ts
/** A parsed row of the sharded code registry, as `parseRegistry` yields it. */
export interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

/** Read only the requested shards, preserving page-specific registry oracles. */
export function readRegistry(
  shards: readonly ("parse" | "load" | "runtime" | "host")[],
): readonly RegistryRow[] {
  return parseRegistry(
    shards
      .map((shard) =>
        readFileSync(
          fileURLToPath(
            new URL(`../../docs/spec_topics/diagnostics/code-registry-${shard}.md`, import.meta.url),
          ),
          "utf8",
        ),
      )
      .join("\n"),
  ) as RegistryRow[];
}

/** The live four-page sharded registry — the input tests/code-registry.test.ts reconciles. */
export const REGISTRY: readonly RegistryRow[] = readRegistry(["parse", "load", "runtime", "host"]);
```

`tests/binder-param-line-newline-normalisation.test.ts:202-226` (re-read
immediately before filing):
```ts
interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

/** The live four-page sharded registry — the input tests/code-registry.test.ts reconciles. */
const REGISTRY = parseRegistry(
  [
    "code-registry-parse.md",
    "code-registry-load.md",
    "code-registry-runtime.md",
    "code-registry-host.md",
  ]
    .map((page) =>
      readFileSync(
        fileURLToPath(new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url)),
        "utf8",
      ),
    )
    .join("\n"),
) as RegistryRow[];
```

The `RegistryRow` interface's six fields are byte-identical in both files;
the `REGISTRY` constant's four-shard read-and-join is byte-identical modulo
the shard name being an interpolated literal string (`"code-registry-parse.md"`)
in this file versus a template built from a shard-key union
(`` `code-registry-${shard}.md` ``) in the helper; the doc comment above each
constant is byte-identical, word for word. Exact search: `grep -n "registry-oracle" tests/binder-param-line-newline-normalisation.test.ts`
→ 0 hits — the file's import list carries no reference to
`./helpers/registry-oracle`.

## Why this is a problem
The same `RegistryRow` shape and the same four-page registry read this file
performs are already centralised in `tests/helpers/registry-oracle.ts`
(`RegistryRow`, `REGISTRY`), including the identical doc comment describing
what the constant is for, yet this file re-declares both rather than
importing them. A change to the registry page set, the read encoding, or the
join separator would need to be made in both places to stay in sync.

## Suggested direction (non-binding, optional)
Importing `RegistryRow` and `REGISTRY` from `./helpers/registry-oracle` in
place of the local interface and `parseRegistry(...)` call is the natural
fit, given the helper already performs exactly this four-page read under the
same field shape and the same doc comment.

## False-positive check
- Gate-pin check: the file is not named `*gate*.test.ts` and matches none of
  the named gate kin; `RegistryRow`/`REGISTRY` are not a pinned count or
  inventory — they are a parsed reference table this file's own
  `templateMessage` helper reads a row from.
- Recording-double check: not applicable — `REGISTRY` is a static parsed
  table used for a positive message-template lookup, not a recording double
  backing a "never called" witness.
- docs/bugs/ signature search: `grep -rl "RegistryRow" docs/bugs/*.md` → 0
  hits; no documented correct-reason red cites this redeclaration.
- coverage-matrix/bug-doc citation search: `grep -n "binder-param-line-newline-normalisation" docs/reference/coverage-matrix.md`
  → 0 hits. This finding proposes no merge, rename, or deletion of any
  `it()`/`describe()` — only that the local `RegistryRow`/`REGISTRY`
  declaration could import the already-existing helper — so no citation is
  disturbed.
- Coverage check: the claim is about a repeated read/type DEFINITION; the
  local `REGISTRY` is exercised by this file's own `templateMessage` calls,
  and no behaviour path is claimed untested.
- Overlap check: `grep -rl "binder-param-line-newline-normalisation" quality/`
  → PTQ-0020, PTQ-0205 (resolved), PTQ-0212 (resolved), PTQ-0279 (resolved),
  PTQ-0652 (resolved), and open PTQ-0653/PTQ-0733, none of which name this
  file's `RegistryRow`/`REGISTRY` redeclaration or the `tests/helpers/registry-oracle.ts`
  helper.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/binder-param-line-newline-normalisation.test.ts:202-226 and tests/helpers/registry-oracle.ts:19-46; the local `RegistryRow` head and six fields diff byte-identical to the helper's (export keyword aside), the four-page readFileSync+join+parseRegistry read and the "live four-page sharded registry" doc comment match the helper's `REGISTRY`, `grep -n registry-oracle` in the file → 0 hits while the local `REGISTRY` is live (`registryMessage(REGISTRY, code)` at :234); both locations under tests/, D7 boilerplate-duplication class, not a gate file, no recording double, docs/bugs `RegistryRow` → 0, coverage-matrix file cite → 0, no it()/describe() touched; 128 tests/ files already import helpers/registry-oracle and this file already imports ./helpers/e2e-s1 so tier is no barrier; dedupe: no open/resolved/same-wave PTQ cites this file's registry block (PTQ-0653/0733 concern triage fixtures and diagLines; the d7-01/d7-02/d7-03-loadcleanly siblings target slug-oracle and loadCleanly), and per the per-file-set precedent (PTQ-0562, PTQ-0777, 0747, 0750, 0757, 0776) each uncited registry-oracle redeclaration is its own confirmed mechanical import-swap (triage: claude-fable-5-1)
verdict: questionable — parked by the store: skipped by the fixer in 2 waves (see "## Fix attempts"); rule with accept --note <direction> or reject (store)

## Fix attempts
- qw20260919162231: skipped — [PTQ-0914-bug0058-bug0100-local-parse-reimplements-parsedoc.md] PTQ-0914: Replaced both local parse wrappers with shared parseDoc; all tests and assertions retained. / PTQ-0916: Reused shared REGISTRY and RegistryRow; retained local message readers as triage permits. / PTQ-0917: Strengthened the assertion to require exactly one error note, retaining diagnostic and envelope checks. / PTQ-0918: Reused plantThetaWorkspace and disposeWorkspace in both files; fixture writes unchanged. No tests deleted. Required gate passed for all four issues: TypeScript clean, 689 test files and 11,586 tests passed. || [PTQ-0919-assertframestointernalerror-reimplements-assertinternalerror.md] PTQ-0919: Both framing helpers delegate to assertInternalError, preserving all four checks; no tests deleted or renamed. / PTQ-0921: Reused the canonical parse-registry reader and message lookup, retaining the non-empty-message guard; no tests deleted or renamed. / PTQ-0922: Replaced the inline pi/ctx double with makeHarness; discovery assertions remain unchanged; no tests deleted or renamed. / PTQ-0926: Shared thetaInput and driveBinder across all three files, preserving per-file parsing, contexts, and fixtures; no tests deleted or renamed. Required gate passed for all four fixes: tsc clean, 689 test files and 11,586 tests passed. ||
- qw20260919170939: skipped — [PTQ-0908-registry-oracle-reimplemented-b0268.md] PTQ-0908: Already uses readRegistry(["parse"]); cited duplication no longer reproduces. No edits. / PTQ-0909: Already uses soleByFragment at all four cited call sites; local soleCollision is absent. No edits. / PTQ-0910: compose() already delegates to runProductionLoad; duplicated host doubles are absent. No edits. / PTQ-0927: Replaced local parseDeps with the shared import and removed unused types. All tests and assertions retained. Required gate passed: TypeScript clean, 689 test files and 11,586 tests passed. || [PTQ-0928-detach-throw-harness-reimplements-supersessionharness.md] PTQ-0928: Reused shared supersession/base harnesses; preserved quiesce pass attribution and note recording. All assertions retained. / PTQ-0933: Migrated b0282 and triage-listed b0277 fixture builders to loadRowFromBody/loadRowFromParam; fixture paths and assertions unchanged. / PTQ-0934: Imported shared render in b0368 and triage-listed b0369; removed identical local copies without changing assertions. / PTQ-0937: Imported shared reportOf at both sites; preserved exact failure wording through an optional fixture label. No tests deleted. Exact verification gate passed: TypeScript and all 689 test files / 11,586 tests. || [PTQ-0938-requirepath-precondition-pair-duplicated.md] PTQ-0938: Centralized both path checks across all 12 callers, preserving check order and failure wording; no tests deleted. / PTQ-0939: Migrated all three triaged message readers to canonical registry helpers, retaining expected messages and adding placeholder-presence checks; no tests deleted. / PTQ-0942: Replaced the local reportOf with the canonical import, preserving narrowing and failure wording; no tests deleted. / PTQ-0945: Replaced the duplicate four-page registry read with shared REGISTRY and removed unused imports and type; no tests deleted. Required gate passed for all fixes: tsc and 11,586 tests across 689 files; git diff --check clean. ||
