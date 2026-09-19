---
id: PTQ-0948
title: supersession-inflight-rebuild-quiesce.test.ts redeclares RegistryRow and re-reads the host registry shard instead of importing tests/helpers/registry-oracle.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: intake
verdict: questionable
locations:                   # every cited site, repo-relative path:line-range
  - tests/supersession-inflight-rebuild-quiesce.test.ts:325-348
  - tests/helpers/registry-oracle.ts:21-46
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918092852
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
fix_skips: 2
---

# supersession-inflight-rebuild-quiesce.test.ts redeclares RegistryRow and re-reads the host registry shard instead of importing tests/helpers/registry-oracle.ts

## Observation
`tests/helpers/registry-oracle.ts` exists specifically (per its own header
comment, citing PTQ-0215) because the `RegistryRow` interface and the
read-registry-shard(s)-through-`parseRegistry` sequence "were redeclared
byte-for-byte … in several test files"; it exports both `RegistryRow` and a
parameterised `readRegistry(shards)` that performs exactly this read for any
subset of the four shards, including `["host"]` alone.
`tests/supersession-inflight-rebuild-quiesce.test.ts` declares its own
`RegistryRow` interface with the identical field list and its own inline
single-shard read of `code-registry-host.md` through the same
`readFileSync`/`fileURLToPath`/`new URL`/`parseRegistry` sequence, rather
than importing `RegistryRow` and calling `readRegistry(["host"])`.

## Evidence

`tests/helpers/registry-oracle.ts:21-46` — the canonical interface and the
parameterised read:
```ts
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
```

`tests/supersession-inflight-rebuild-quiesce.test.ts:325-348` — the local
redeclaration, field-for-field identical interface plus an inline
single-shard version of the same read:
```ts
/** One parsed row of the sharded diagnostics registry (`tools/code-registry`). */
interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

/**
 * The live `theta/host/*` registry shard, read from the spec corpus — the same
 * input tests/code-registry.test.ts reconciles. Only the host shard is read:
 * the code under assertion lives there, and a row that moved out of it SHOULD
 * red here rather than be silently found on another page.
 */
const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../docs/spec_topics/diagnostics/code-registry-host.md", import.meta.url),
    ),
    "utf8",
  ),
) as RegistryRow[];
```
Both `RegistryRow` interfaces have the identical six fields in the identical
order (`code`, `namespace`, `severity`, `phase`, `trigger`, `message`); both
reads perform the identical `readFileSync(fileURLToPath(new URL(...)),
"utf8")` → `parseRegistry(...)` → `as RegistryRow[]` sequence against the
same `docs/spec_topics/diagnostics/code-registry-host.md` shard.
`readRegistry(["host"])` (already exported by the helper) produces the same
array this file's local `REGISTRY` constant holds.

## Why this is a problem
`tests/helpers/registry-oracle.ts`'s own header states its reason for
existing is to stop exactly this shape of redeclaration ("were redeclared
byte-for-byte … in several test files. This module centralises that read
only"). The in-scope file redeclares the same interface and performs the
same single-shard read the helper's `readRegistry` parameter already covers,
so the "several test files" the helper's header refers to has an
uncounted-by-that-header instance here. `grep -n "interface RegistryRow"
tests/supersession-inflight-rebuild-quiesce.test.ts tests/helpers/registry-oracle.ts`
confirms the interface is declared in both files.

## Suggested direction (non-binding, optional)
Noting `tests/helpers/registry-oracle.ts` already exports `RegistryRow` and
a `readRegistry(shards)` that covers the single-shard `["host"]` case this
file needs is an observation about the existing convention, not a design.

## False-positive check
- Gate-pin check: this file does not match `*gate*.test.ts` or any named
  gate-kin pattern; `REGISTRY` here backs a per-row lookup
  (`supersessionRegistryRow`), not a pinned count/inventory assertion.
- Recording-double check: no recording double is involved; `REGISTRY` is a
  real parsed read of the spec corpus, not a fake.
- docs/bugs/ signature search: `grep -rn "session-start-supersession-detach-failed" docs/bugs/` shows this row backs bug 0029's landed fix (docs/bugs/0029, Status: fixed) and bug 0034's fix; neither bug doc's witness-list citation names this file's local `RegistryRow`/`REGISTRY` declaration as pinned, and this finding does not contest the file's red/green status.
- coverage-matrix/bug-doc citation search: `grep -rn "supersession-inflight-rebuild-quiesce" docs/reference/coverage-matrix.md` returns 0 hits; the only bug-doc/PTQ citation found for this file is PTQ-0715 (open, targeting `RecordingFakeClock`/`watcherAt`/`wiringAt`/`registryKeys`/`structuralNotes`/`sleep` — none of which is `RegistryRow`/`REGISTRY`), so this finding's root cause (the registry-shard read) is not already covered by that open finding.
- Coverage-drift check: the claim is about duplicated fixture-reading code
  that exists in both files today, not about an untested path.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts reproduce at tests/supersession-inflight-rebuild-quiesce.test.ts:326-348 and tests/helpers/registry-oracle.ts:21-46, a mktemp `diff` of the two 6-field `RegistryRow` bodies (export keyword stripped) is empty, the local `REGISTRY` is `parseRegistry(readFileSync(fileURLToPath(new URL("../docs/spec_topics/diagnostics/code-registry-host.md"))))` which is byte-equivalent input to the helper's already-exported `readRegistry(["host"])` (single shard, so the `.join("\n")` is a no-op), the test file imports parseRegistry/readFileSync/fileURLToPath itself and has no `registry-oracle` import (grep → 0) while 128 other tests/ files import the helper, `REGISTRY` is live at :356/:374, `grep -rln 'code-registry-host.md", import.meta.url' tests/` returns only this file, the stated `interface RegistryRow` two-file grep and the coverage-matrix 0-hit search reproduce, the file is not a gate/census suite and no merge/rename/delete is proposed against docs/bugs 0034:215 / 0216:545 / 0323:280 / 0468:87's witness citations, and no tracked row covers this site — open PTQ-0715 targets this file's RecordingFakeClock/watcherAt/wiringAt/registryKeys/structuralNotes/sleep only, and the sibling per-file registry-oracle rows (PTQ-0896 reserved-keyword parse shard, PTQ-0830 typeenv four-shard, PTQ-0742 watcher-terminated, PTQ-0777 live-production-acceptance) each cite a different file, matching the store's one-row-per-copy convention — a D7 copy-paste fixture whose fix is a mechanical import swap (triage: claude-fable-5-1)
verdict: questionable — parked by the store: skipped by the fixer in 2 waves (see "## Fix attempts"); rule with accept --note <direction> or reject (store)

## Fix attempts
- qw20260919193904: skipped — [PTQ-0967-fnarg-letrhs-message-builders-duplicated.md] PTQ-0967: Shared six builder pairs through registry-oracle, preserving each file's failure wording. / PTQ-0971: Reused the shared AJV fixture at seven remaining sites; five were already deduplicated. Preserved the distinct production-slug fixture. / PTQ-0972: Replaced the local registry read with readRegistry(["parse"]), retaining the error-message path. / PTQ-0973: Imported shared at/render helpers at three remaining sites. No tests or assertions changed across any issue; the required tsc and full test gate passed (689 files, 11,586 tests). || [PTQ-0975-invoke-arg-array-literal-registry-read-not-migrated.md] PTQ-0975: Replaced local registry parsing with readRegistry(["parse"]); preserved error wording and all assertions. Required TypeScript/full-test gate passed. / PTQ-0977: Replaced duplicated two-page parsing with readRegistry(["parse", "load"]); preserved shard order and all assertions. Required gate passed. / PTQ-0978: Adopted shared production-load and workspace helpers; preserved per-call isolation and cleanup. No tests deleted or weakened. Required gate passed. / PTQ-0981: Imported shared diagLines and removed its local copy and unused types; all assertions preserved. Exact required gate passed: TypeScript clean, 689 test files and 11,586 tests passed. || [PTQ-0982-hexinvocationroot-reimplements-imported-rootdouble.md] PTQ-0982: Delegated hexInvocationRoot to rootDouble with an invocation-ID override; sequence behavior preserved. / PTQ-0983: Shared invokeArgMessage across all five triaged copies, preserving registry interpolation and failure checks. / PTQ-0984: Shared loweredParams across all eight triaged copies, preserving source construction and paths; affected live cell passed. / PTQ-0986: Imported the existing noopPi and removed its local duplicate. No tests or assertions removed across these fixes; required gate passed—TypeScript clean, 689 files and 11,586 tests green. ||
- qw20260919203448: skipped — [PTQ-0989-registry-four-page-read-reimplemented-keyless-entry-refusal.md] PTQ-0989: Reused shared REGISTRY; removed the local registry read, row type, and unused imports. No tests or assertions removed. / PTQ-0990: Replaced the handwritten message with loadRowMessage and interpolate; preserved the message assertion. / PTQ-0991: Imported the three canonical builders and folded the additional array-message copy named in triage; no tests renamed, deleted, or weakened. / PTQ-0993: Reused parseDoc(src, "probe.theta"), retaining both parse-precondition assertions. The required verification command passed: TypeScript and all 11,586 tests across 689 files. || [PTQ-0996-diaglines-reimplemented-stray-close-token-split.md] PTQ-0996: Imported shared diagLines; removed the duplicate and unused type imports. All tests retained. / PTQ-0997: Delegated msg to registryMessageOf, preserving the registry path and substitutions. All tests retained. / PTQ-0998: Imported shared parseDeps; removed the local builder and unused types. All tests retained. / PTQ-1001: Delegated unresolvedMessage to registryMessageOf, retaining the severity wrapper and gaining the placeholder guard. All tests retained. Required verification command passed verbatim for all four fixes: TypeScript clean; 689 test files and 11,586 tests passed. || [PTQ-1007-recordingcheckpoint-reimplements-noopcheckpoint-despite-impo.md] PTQ-1007: Replaced misleading local RecordingCheckpoint with SEAM_NOOP_CHECKPOINT, the current shared replacement for the retired NoopCheckpoint helper; assertions unchanged. / PTQ-1014: Removed local NoopCheckpoint/rootDouble definitions and imported shared rootDouble; assertions unchanged. / PTQ-1017: Removed local noopPi and imported the identical shared helper; assertions unchanged. / PTQ-1018: Imported shared parseDeps while preserving the local parse-clean check; assertions unchanged. All four fixes passed the required verbatim verification command: TypeScript check and 11,586 tests across 689 files. No tests were deleted. || [PTQ-1022-binder-forced-tool-dispatch-root-double-reimplemented.md] PTQ-1022: Root and capture setup now delegate to shared helpers, preserving fixture inputs; AJV was already shared. No tests or assertions removed. / PTQ-1027: Replaced local diagLines with the existing shared export and removed the unused type import. No tests or assertions removed. / PTQ-1028: Replaced local diagLines with the shared export and removed unused type imports. No tests or assertions removed. / PTQ-1029: Centralized reference-closure assertions in canonical-slug-oracle, preserving both failure messages. No tests or assertions removed. Prescribed gate passed for all fixes: TypeScript and all 11,586 tests in 689 files. ||
