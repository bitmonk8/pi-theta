---
id: PTQ-0495
title: Both in-scope files redeclare the RegistryRow/REGISTRY/msg registry-message oracle byte-for-byte instead of importing the existing tests/helpers/load-row-harness.ts equivalent
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/index-element-alias-unfolded.test.ts:158-221
  - tests/index-sentinel-typeenv-case-fence.test.ts:151-214
  - tests/helpers/load-row-harness.ts:29-77
sites: 2
fix_scope: localized
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# Both in-scope files redeclare the RegistryRow/REGISTRY/msg registry-message oracle byte-for-byte instead of importing the existing tests/helpers/load-row-harness.ts equivalent

## Observation
Both `tests/index-element-alias-unfolded.test.ts` and `tests/index-sentinel-typeenv-case-fence.test.ts` open with an identical block: a local `RegistryRow` interface, a module-level `REGISTRY` constant built by `parseRegistry(readFileSync(...code-registry-parse.md...))`, and a `msg(code, fills)` function that reads the *Message* template via `registryMessage`, asserts its definedness, asserts each placeholder's presence, and fills it. `tests/helpers/load-row-harness.ts` already exports the same `RegistryRow` shape, the same registry constant (`PARSE_REGISTRY`, parsed from the same page), and the same function under the name `registryMessageOf`, with the identical assertion sequence and the identical failure-message wording. Both in-scope files re-declare this rather than importing it.

## Evidence
tests/index-element-alias-unfolded.test.ts:158-192 (excerpt, first half):
```
interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
    ),
    "utf8",
  ),
) as RegistryRow[];

function msg(code: string, fills: ReadonlyArray<readonly [string, string]>): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
```

tests/index-sentinel-typeenv-case-fence.test.ts:151-185 (excerpt, same shape):
```
interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
    ),
    "utf8",
  ),
) as RegistryRow[];

function msg(code: string, fills: ReadonlyArray<readonly [string, string]>): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
```

The rest of each `msg` body (placeholder-definedness assertion, per-placeholder `toContain` assertion, the replace loop and return) is byte-identical between the two files (index-element-alias-unfolded.test.ts:179-192 vs index-sentinel-typeenv-case-fence.test.ts:172-185), down to the same template-literal failure messages.

tests/helpers/load-row-harness.ts:29-77 (the canonical equivalent, already exported):
```
export interface RegistryRow {
  readonly code: string;
  readonly message: string;
}
...
export const PARSE_REGISTRY: readonly ParseCodeRegistryRow[] = parseRegistry(
  readFileSync(
    fileURLToPath(new URL(`../../${PARSE_REGISTRY_PATH}`, import.meta.url)),
    "utf8",
  ),
) as ParseCodeRegistryRow[];

export function registryMessageOf(
  registry: readonly RegistryRow[],
  registryPath: string,
  code: string,
  fills: ReadonlyArray<readonly [string, string]> = [],
): string {
  const template = registryMessage(registry, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: ${registryPath} must carry the Message row for ${code}`,
  ).toBeDefined();
```

`tests/index-sentinel-typeenv-case-fence.test.ts:141-143` itself names the sibling file as the source of this same discipline: "this is the same oracle discipline as tests/index-element-alias-unfolded.test.ts, line 178 (its `msg` helper)" — the file's own comment records the duplication it does not resolve by importing.

Count: exactly 2 sites in scope (the two reviewed files); a third, non-identical-but-functionally-equivalent implementation already exists at `tests/helpers/load-row-harness.ts:62-77` (`registryMessageOf`), parsing the same `docs/spec_topics/diagnostics/code-registry-parse.md` page into the same row shape.

## Why this is a problem
The two in-scope files carry a byte-for-byte reimplementation of a registry-message oracle (interface, parsed-registry constant, and templated-fill function with matching assertions and failure-message text) that a third file under `tests/helpers/` already exports for the identical page and row shape. Each of the two files' own commentary treats the block as a discipline to be pointed at (a sibling-file citation in one, a `DIAG-4` anchor comment restated in both) rather than as code to import, so the same fix to the fill-assertion wording or the registry path would need to land in three places (the two files plus the pre-existing helper) to stay consistent.

## Suggested direction (non-binding, optional)
Importing `registryMessageOf`/`RegistryRow` from `tests/helpers/load-row-harness.ts` in place of each file's local `REGISTRY`/`msg` pair is the shape the helper's own module comment already anticipates ("a per-file registry array/path... threaded through explicitly").

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate kinds; not applicable.
- Recording-double check: `msg`/`REGISTRY` are not recording doubles asserting a MUST-NOT-call; not applicable.
- docs/bugs/ signature search: both files' headers cite bugs 0125/0135/0247/0262/0157/0129/0089/0083/0038 as the behavioural subjects under test, none of which concerns this harness block itself; no red test is being proposed for merge/rename/delete.
- coverage-matrix/bug-doc citation search: `grep -rn "index-element-alias-unfolded\|index-sentinel-typeenv-case-fence" docs/reference/coverage-matrix.md docs/bugs/` was run; no hits pinning either file's harness code by name (only the files' own cross-reference to each other, quoted above). This finding does not propose merging, renaming, or deleting either test file — only that the shared harness block move to the existing helper.
- Coverage drift check: this finding does not claim a missing test or an untested path; it is scoped to code that exists in both files today.

## Triage
verdict: confirmed — independently re-verified: own diff of index-element-alias-unfolded:158-192 vs index-sentinel-typeenv-case-fence:151-185 shows byte-identical code (only the `msg` doc-comment differs by a `diagnostic-shape.md:74` clause), and each `msg` body equals load-row-harness.ts `registryMessageOf`:68-81 modulo `REGISTRY`→`registry` and the path literal→`${registryPath}` (same PARSE_REGISTRY_PATH page); neither file imports helpers/load-row-harness (6 others do) or helpers/registry-oracle; file B's extra `fillsOf(REGISTRY, …)` reads at :485/:541 are covered by the exported `PARSE_REGISTRY`; not gate files, no recording double, no red test, and the merge/rename/delete carve-out is inapplicable — the filing's "no docs/bugs hits" claim is inaccurate (0081/0125/0135/0139/0247/0262 name both files as witnesses and 0139:745 cites the `msg` helper as "the pattern") but those are prose citations, not pins, and 0247:549 records file B's private oracle helpers already being replaced by imports once; no existing PTQ names either file (0215/0222/0237/0250/0260/0275/0311/0313/0327/0404/0411/0412 cover other files) — same confirmed D7 copy-paste-fixture class (triage: claude-fable-5-1)
