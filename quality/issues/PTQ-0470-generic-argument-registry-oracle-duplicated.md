---
id: PTQ-0470
title: Both generic-argument-* files redeclare the RegistryRow/REGISTRY four-page read instead of importing tests/helpers/registry-oracle.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/generic-argument-bracket-group-truncation.test.ts:215-238
  - tests/generic-argument-inline-field-key-rules.test.ts:188-211
  - tests/helpers/registry-oracle.ts:19-45
sites: 2
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# Both generic-argument-* files redeclare the RegistryRow/REGISTRY four-page read instead of importing tests/helpers/registry-oracle.ts

## Observation
Both files in scope declare a local `interface RegistryRow { code; message }`
and a module-scope `REGISTRY` constant that reads and joins the four
diagnostics spec pages (`code-registry-{parse,load,runtime,host}.md`) via
`parseRegistry`, byte-for-byte identical between the two files. Both files
already import `parseDoc` from `./helpers/e2e-s1`, i.e. they already draw on
`tests/helpers/`, but neither imports the canonical `readRegistry`/`REGISTRY`
that `tests/helpers/registry-oracle.ts` exports for exactly this four-page
read.

## Evidence
tests/generic-argument-bracket-group-truncation.test.ts:215-238:
```ts
interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

/** The live four-page sharded registry, read from the spec corpus (DIAG-4). */
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

tests/generic-argument-inline-field-key-rules.test.ts:188-211 — identical text
(reverified with `diff <(sed -n '215,238p' generic-argument-bracket-group-truncation.test.ts) <(sed -n '188,211p' generic-argument-inline-field-key-rules.test.ts)` → no output, i.e. byte-identical):
```ts
interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

/** The live four-page sharded registry, read from the spec corpus (DIAG-4). */
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

tests/helpers/registry-oracle.ts:19-45 — the canonical helper this repository
already created to centralise exactly this read:
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

## Why this is a problem
This is the exact 2-field-subset `RegistryRow`/`REGISTRY` read shape resolved
PTQ-0215 ("The registry-oracle bundle … is redefined byte-for-byte across
hundreds of test files") named and had this repository fix by adding
`tests/helpers/registry-oracle.ts`. Both files under review each pay their own
four-page `readFileSync` + `parseRegistry` call and their own narrower copy of
`RegistryRow`, rather than importing the module's already-exported
`REGISTRY: readonly RegistryRow[]` (a superset of the fields each file
actually reads) or its `readRegistry(["parse","load","runtime","host"])`
factory. Both files already import from `tests/helpers/` in the same import
block (`parseDoc` from `./helpers/e2e-s1`), so the omission is not a
missing habit of drawing from `tests/helpers/` generally, only of this one
specific bundle.

## Suggested direction (non-binding, optional)
`tests/helpers/registry-oracle.ts`'s exported `REGISTRY` constant is already
shaped to serve both files' `msg()` lookup without change; importing it in
place of the local block is the kind of substitution PTQ-0215's fix already
made available.

## False-positive check
- Gate-pin: neither file matches `*gate*.test.ts` or the named kin
  (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate).
  tests/code-registry.test.ts is the closed-set reconciliation gate for this
  registry and is not one of the files cited here.
- Recording-double: `REGISTRY`/`RegistryRow` are a static, already-parsed
  markdown-derived array with no call recording; the negative-witness
  carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "RegistryRow" docs/bugs/0236*
  docs/bugs/0233*` → 0 files. Neither docs/bugs/0236 nor docs/bugs/0233 (the
  bug documents these two test files witness) states a rationale for
  redeclaring the registry-read bundle locally rather than importing the
  shared helper.
- coverage-matrix/bug-doc citation search: `grep -n
  "generic-argument-bracket-group-truncation\|generic-argument-inline-field-key-rules"
  docs/reference/coverage-matrix.md` → 0 hits. Neither file is cited there or
  in a bug doc's witness list by internal-helper shape, only (per each file's
  own header comment) as the fresh witness for bug 0236 / bug 0233
  respectively; this finding proposes no change to any `it()`/`describe()`
  name, count, or assertion, only to where the registry-read bundle is
  sourced from.
- Coverage check: the claim is entirely about a repeated harness DEFINITION,
  not a missing test path; every copy is exercised by the tests in its own
  file.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: the 24-line `RegistryRow`/`REGISTRY` block at bracket-group-truncation:215-238 and inline-field-key-rules:188-211 is byte-identical (`diff` → empty) and each file uses `REGISTRY` only via `registryMessage(REGISTRY, code)` in its `msg()`, which tests/helpers/registry-oracle.ts:19-45 (header names PTQ-0215 as its reason for existing; already imported by 30 test files) serves with its superset `RegistryRow` and exported four-shard `REGISTRY` without change; re-ran the stated searches (RegistryRow in docs/bugs/0233*/0236* → 0 files; neither filename in docs/reference/coverage-matrix.md) and no gate-pin/recording-double carve-out applies; no open or resolved PTQ row (0215/0404/0411/0412 location lists checked) names either file — a mechanical D7 boilerplate-duplication dedupe (triage: claude-fable-5-1)
