---
id: PTQ-0826
title: query-annotation-nontype-text-refusal.test.ts redeclares the four-page RegistryRow/REGISTRY read instead of importing tests/helpers/registry-oracle.ts
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/query-annotation-nontype-text-refusal.test.ts:122-146
  - tests/helpers/registry-oracle.ts:17-40
sites: 1
fix_scope: localized
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# query-annotation-nontype-text-refusal.test.ts redeclares the four-page RegistryRow/REGISTRY read instead of importing tests/helpers/registry-oracle.ts

## Observation
`tests/query-annotation-nontype-text-refusal.test.ts` declares its own
module-scope `interface RegistryRow` and its own `const REGISTRY =
parseRegistry(...)` that reads and joins the same four sharded
diagnostics-registry pages (`code-registry-{parse,load,runtime,host}.md`) via
the same `readFileSync`/`fileURLToPath` construction that
`tests/helpers/registry-oracle.ts` already exports as `RegistryRow` and
`REGISTRY`. The file's own import line names only `parseDoc`, `diagLines`
and `diagCodes` from `./helpers/e2e-s1`; it does not import from
`./helpers/registry-oracle` anywhere.

## Evidence

`tests/query-annotation-nontype-text-refusal.test.ts:122-146` (re-read
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

The canonical helper this bypasses, `tests/helpers/registry-oracle.ts:17-40`:
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

/** The live four-page sharded registry — the input tests/code-registry.test.ts reconciles. */
export const REGISTRY: readonly RegistryRow[] = readRegistry(["parse", "load", "runtime", "host"]);
```

The one-line doc comment above the in-scope file's `const REGISTRY`
(`// The live four-page sharded registry — the input tests/code-registry.test.ts
reconciles.`) is byte-identical to the doc comment above the helper's own
`export const REGISTRY` line, confirming the block was copied rather than
independently re-derived.

Exact search: `grep -n "interface RegistryRow\|^const REGISTRY\|registry-oracle" tests/query-annotation-nontype-text-refusal.test.ts` → one local `interface RegistryRow` (line 122), one local `const REGISTRY` (line 132), zero `registry-oracle` hits.

## Why this is a problem
The `RegistryRow` shape (all six fields) and the exact four-shard
`parseRegistry`/`readFileSync`/`fileURLToPath`/`join` chain reproduce
`tests/helpers/registry-oracle.ts`'s exported `RegistryRow` interface and
`REGISTRY` constant field-for-field and shard-for-shard, down to a shared
doc comment, rather than importing them. `tests/helpers/registry-oracle.ts`'s
own header states it exists because this exact read "were redeclared
byte-for-byte … in several test files"; this file is one further un-migrated
instance of the pattern that helper exists to collapse. A drift in the shard
list, the join separator, or the row shape would need a matching edit here
that the helper's other 20+ importers get for free.

## Suggested direction (non-binding, optional)
This file's own `registryMessageOf`/`registryRowOf` readers (whose wording is
specific to this file) could stay local while their `REGISTRY` input is
imported from `tests/helpers/registry-oracle.ts`, the same split the helper's
own header already describes for its existing importers.

## False-positive check
- Gate-pin check: `tests/query-annotation-nontype-text-refusal.test.ts` does not match `*gate*.test.ts` or any named gate kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate, committed-fixture-parse-gate, registry-closed-set-corpus-gate); the cited lines are a registry read, not a pinned count or inventory.
- Recording-double check: `REGISTRY` is a parsed, static data table read once from the committed spec corpus; it records no calls and backs no "never called" witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rn "query-annotation-nontype-text-refusal" docs/bugs/*.md` → the file is cited in docs/bugs/0203's witness text, but every citation targets the file as a whole witness suite or specific numbered cells, never this `RegistryRow`/`REGISTRY` declaration block, and no citation states a rationale for this file diverging from the shared helper's read.
- coverage-matrix/bug-doc citation search: `grep -n "query-annotation-nontype-text-refusal" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no change to any `it()`/`describe()` name, count, or assertion — only that the local `REGISTRY` binding could be imported instead of re-parsed — so no citation is affected.
- Prior-filing overlap check: `grep -rl "query-annotation-nontype-text-refusal" quality/intake quality/issues quality/resolved` returns PTQ-0205, PTQ-0663 and PTQ-0674 (all about the separate `diagLines`/`diagCodes` rendering-pair duplication, already fixed — this file now imports both from `./helpers/e2e-s1`) and this same wave's `qw20260918050411-d7-02-stranded-registrymessageof-throw-duplicated.md` (about the throw-based `registryMessageOf` *lookup function* shape shared across 19 files, which lists this file by name but cites two OTHER files as its evidence excerpts and does not address the `RegistryRow`/`REGISTRY` *read* block cited here). The resolved PTQ-0488 (two other files) and PTQ-0678 (`tests/reassign-rhs-type-compat.test.ts`) confirm the identical `RegistryRow`/`REGISTRY` clone class exists and has been fixed at three other sites; none of those location lists cites this file, so this is a fourth, not-yet-migrated instance of the same pattern.
- Coverage check: the claim is about a repeated fixture-read DEFINITION that exists in the file today, not about any missing test path; every consumer of the local `REGISTRY` (`registryMessage`, `.find(r => r.code === code)`) is already exercised by the file's own currently-running assertions.

## Triage
<!-- pending -->
verdict: confirmed — independently re-verified: the excerpt reproduces verbatim at tests/query-annotation-nontype-text-refusal.test.ts:122-146 (local `interface RegistryRow` :122 diffs empty against tests/helpers/registry-oracle.ts:21-28 after stripping `export`; `const REGISTRY = parseRegistry(` :132 reads the same four shards `parse/load/runtime/host` the helper's `REGISTRY` :49 reads, with the byte-identical doc comment at :131 vs helper :48); the file's only helper import is `./helpers/e2e-s1` (:8), 0 `registry-oracle` hits; the local `REGISTRY` is live (read at :157 and :173, feeding 8 `registryMessageOf`/`registryRowOf` call sites inside test bodies); both locations under tests/, D7 boilerplate-duplication/copy-paste-fixture class; not a gate file, not a recording double, 0 coverage-matrix hits, and although the filing's docs/bugs claim under-reports (0085, 0203, 0228, 0252 all cite the file, not just 0203) every citation names the file as a witness suite or by cell, never this read block, and no merge/rename/delete is proposed so no carve-out applies; dedupe: 0 open issues cite this file (my census of 105 tests/ files with an inline `= parseRegistry(` shows this one uncited), PTQ-0777 is single-file (live-production-acceptance), and same-wave d7-02 tracks the throw-shaped `registryMessageOf` lookup function — a distinct root cause; fix is the mechanical import migration precedent PTQ-0678/0742/0747/0750/0757 already established per file (triage: claude-fable-5-1)
