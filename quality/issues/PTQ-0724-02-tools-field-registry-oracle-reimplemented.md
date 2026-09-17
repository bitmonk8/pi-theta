---
id: PTQ-0724
title: tools-field-shape-refusal and tools-field-zero-entry-scalar-refusal each re-declare the single-shard load-registry read instead of calling tests/helpers/registry-oracle.ts's readRegistry
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/tools-field-shape-refusal.test.ts:188-208
  - tests/tools-field-zero-entry-scalar-refusal.test.ts:150-170
  - tests/helpers/registry-oracle.ts:19-44
sites: 2                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# tools-field-shape-refusal and tools-field-zero-entry-scalar-refusal each re-declare the single-shard load-registry read instead of calling tests/helpers/registry-oracle.ts's readRegistry

## Observation
Both in-scope files declare their own local `interface RegistryRow` (six
fields: `code`, `namespace`, `severity`, `phase`, `trigger`, `message`) and
their own local `const REGISTRY = parseRegistry(readFileSync(fileURLToPath(new
URL("../docs/spec_topics/diagnostics/code-registry-load.md", import.meta.url)),
"utf8")) as RegistryRow[]`, reading only the `load` diagnostics shard.
`tests/helpers/registry-oracle.ts` exports the identical `RegistryRow`
interface and a parameterised `readRegistry(shards)` function built to read
exactly this subset of the same sharded registry; its own header states it
exists because this read "were redeclared byte-for-byte … in several test
files". Neither in-scope file imports it.

## Evidence
`tests/tools-field-shape-refusal.test.ts:188-208`:
```ts
interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

/** The live sharded load registry — the *Message* column DIAG-4 makes normative. */
const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL(
        "../docs/spec_topics/diagnostics/code-registry-load.md",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as RegistryRow[];
```

`tests/tools-field-zero-entry-scalar-refusal.test.ts:150-170` — the same
interface and construction, byte-for-byte apart from the doc comment:
```ts
interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

/** The live sharded load registry — the *Message* column DIAG-4 makes normative. */
const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL(
        "../docs/spec_topics/diagnostics/code-registry-load.md",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as RegistryRow[];
```

`tests/helpers/registry-oracle.ts:19-44` — the canonical export both files
duplicate:
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
```
Both in-scope files' local `REGISTRY` construction is exactly what
`readRegistry(["load"])` returns.

## Why this is a problem
The `RegistryRow` shape and the single-shard `parseRegistry`/`readFileSync`/
`fileURLToPath` read recur, field-for-field and path-for-path, in both
in-scope files, while a helper built and named for exactly this read (down to
the same interface name) sits unimported by both. A change to the shard file
path convention, the join separator (for a multi-shard read), or the
`RegistryRow` field set needs a matching edit in each of these files rather
than flowing through the shared export both files could call as
`readRegistry(["load"])`.

## Suggested direction (non-binding, optional)
Both files' local `RegistryRow`/`REGISTRY` declarations name the same shared
`readRegistry` the helper already exports for a single-shard read.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or named gate kin; not
  applicable.
- Recording-double check: not applicable — this is a read-only registry
  parse, not a call-recording double.
- docs/bugs/ signature search: bug 0104 and bug 0206 are both `Status: fixed`;
  the tests pass at HEAD (`npx vitest run tests/tools-field-shape-
  refusal.test.ts` — 37/37 pass); not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -rn
  "tools-field-shape-refusal\|tools-field-zero-entry-scalar-refusal"
  docs/reference/coverage-matrix.md docs/bugs/` — both files are named as the
  witness in their own bug docs, but no cited cell, test name or assertion
  body is touched by this finding; it proposes only that the local `REGISTRY`
  binding be sourced from the existing helper.
- Distinct root cause from the companion finding on the same two files (the
  production-load fake-host harness duplication): this finding is scoped to
  the registry-read declaration only, one root cause per file per the
  template's rule.

## Triage
verdict: confirmed — independently re-verified: the 21-line RegistryRow/REGISTRY blocks at tools-field-shape-refusal.test.ts:188-208 and tools-field-zero-entry-scalar-refusal.test.ts:150-170 are byte-identical (diff clean), neither file imports tests/helpers/registry-oracle.ts whose live readRegistry (30 importers) yields the same single-shard load read via readRegistry(["load"]) (one-element join is identity); D7 boilerplate/copy-paste-fixture class inside tests/, not a gate test, bugs 0104/0206 both Status: fixed and both suites green (37+51=88), bug docs cite the files only by cell count so no witness cell is touched; no open/resolved PTQ cites either file and same-wave sibling 156-01 is a distinct root cause (production-load harness) (triage: claude-fable-5-1)
