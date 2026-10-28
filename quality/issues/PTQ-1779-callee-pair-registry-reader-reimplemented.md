---
id: PTQ-1779
title: Both callee refusal suites rebuild the shared registry-page reader locally.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/callee-post-parse-errors-un-register-tools-caller.test.ts:218-232
  - tests/callee-tools-missing-theta-path-un-registers-tools-caller.test.ts:203-217
  - tests/helpers/registry-oracle.ts:33-46
sites: 2
fix_scope: module
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# Both callee refusal suites rebuild the shared registry-page reader locally.

## Observation
The two callee refusal files each declare a `RegistryRow` interface and a module-local `REGISTRY` initializer that reads diagnostics Markdown and passes it to `parseRegistry`. The post-parse suite reads the parse and load shards; the missing-theta-path suite reads only the load shard. The existing `readRegistry(shards)` helper under `tests/helpers/registry-oracle.ts` already accepts those distinct shard selections and returns rows carrying all four locally declared fields. The count is two local reader reimplementations, not two identical shard inventories.

## Evidence
`tests/callee-post-parse-errors-un-register-tools-caller.test.ts:218-232`:
```ts
interface RegistryRow {
  code: string;
  severity: string;
  phase: string;
  message: string;
}

const REGISTRY = ["code-registry-parse.md", "code-registry-load.md"].flatMap((page) =>
  parseRegistry(
    readFileSync(
      fileURLToPath(new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url)),
      "utf8",
    ),
  ) as RegistryRow[],
);
```

`tests/callee-tools-missing-theta-path-un-registers-tools-caller.test.ts:203-217`:
```ts
interface RegistryRow {
  code: string;
  severity: string;
  phase: string;
  message: string;
}

const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../docs/spec_topics/diagnostics/code-registry-load.md", import.meta.url),
    ),
    "utf8",
  ),
) as RegistryRow[];
```

Existing shared reader, `tests/helpers/registry-oracle.ts:33-46`:
```ts
export function readRegistry(
  shards: readonly ("parse" | "load" | "runtime" | "host")[],
): readonly RegistryRow[] {
  return parseRegistry(
    shards
      .map((shard) =>
        readFileSync(
          repoFile(`docs/spec_topics/diagnostics/code-registry-${shard}.md`),
          "utf8",
        ),
      )
      .join("\n"),
  ) as RegistryRow[];
}
```

## Why this is a problem
This is D7's copy-paste-fixture/harness class: two existing suites independently maintain the registry file-read, parser invocation and row cast already owned by the shared oracle helper. Their different shard selections are fixture data that the helper's current parameter represents; that difference does not account for rebuilding the read mechanism. The finding does not challenge the registry-derived oracle, the refusal assertions or any pinned expected diagnostic.

## Suggested direction (non-binding, optional)
`tests/helpers/registry-oracle.ts` is the existing shared home for the reader and row type, including per-suite shard selection.

## False-positive check
- Gate-pin: neither scoped file is a census/pin gate. These are registry-loading definitions, not corpus-count or inventory assertions; no independent pin is challenged.
- Recording-double: neither definition is a recording double or a negative call witness.
- docs/bugs/ signature search: searched `docs/bugs/` and `docs/reference/coverage-matrix.md` for both scoped filenames. Bugs 0267, 0270, 0271, 0275 and 0276 cite the post-parse suite; bugs 0270, 0271, 0275, 0276 and 0320 cite the missing-path suite. The finding does not allege a red/disabled test or contest any documented failure signature.
- Coverage-matrix/bug-doc citation: the filename searches found no coverage-matrix matches. The listed bug-document witnesses remain intact: no merge, rename or deletion of a test is proposed.
- Existing-topic: searched `quality/` for both filenames and inspected PTQ-0428, PTQ-1425 and PTQ-0525. The first concerns core workspace/load harness names, the second the planter/drop-route/refusal adapters, and the third the live-cell reader and rendered-row harness in different files. None reports these two offline registry initializer definitions; differing shard selections noted in PTQ-1425 remain supported by the existing `readRegistry` parameter.
- Intent/history: inspected the scoped files' registry blocks, the shared reader and file histories. Both suites retain their own DIAG-4 page selections; those selections are not proposed for consolidation into one inventory.
- Scope: this reports duplication in existing test setup only, not coverage, suite composition, runtime risk or production behavior.

## Triage
verdict: confirmed — Both local RegistryRow/REGISTRY blocks and the shared readRegistry excerpt reproduce exactly; the shared mechanism yields identical rows for the suites' distinct parse+load (215 rows) and load-only (66 rows) selections, and its readonly result satisfies their live refusal-helper calls. This is D7 fixture/setup duplication, not a gate pin or recording witness; no test rename, merge or deletion is proposed. Resolved PTQ-0428/1425 cover workspace/refusal adapters, PTQ-0525 covers live cells, and PTQ-0237 only mentions the post-parse file in a pattern search; none tracks these two reader locations or prescribes keeping them local. (triage: claude-opus-5-5)
