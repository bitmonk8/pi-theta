---
id: PTQ-0651
title: params-block-mapping-rhs-refusal.test.ts reimplements the registry-oracle four-page read instead of importing tests/helpers/registry-oracle.ts
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/params-block-mapping-rhs-refusal.test.ts:164-189
  - tests/helpers/registry-oracle.ts:18-38
sites: 1
fix_scope: localized
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# params-block-mapping-rhs-refusal.test.ts reimplements the registry-oracle four-page read instead of importing tests/helpers/registry-oracle.ts

## Observation
`tests/params-block-mapping-rhs-refusal.test.ts` declares a module-scope
`RegistryRow` interface and a `REGISTRY` constant that reads the four sharded
diagnostics-registry pages (`code-registry-{parse,load,runtime,host}.md`),
joins them, and parses the result through `parseRegistry`. `tests/helpers/
registry-oracle.ts` already exports both an identically-shaped `RegistryRow`
interface and a pre-built `REGISTRY` constant doing the same four-shard read
(its header comment states it exists precisely because this construction "were
redeclared byte-for-byte … in several test files", PTQ-0215). The sibling file
in this same review scope, `tests/params-brace-union-rhs-lowering.test.ts`,
already imports `REGISTRY` from that helper module rather than re-declaring
it.

## Evidence
`tests/params-block-mapping-rhs-refusal.test.ts:164-189`:
```ts
interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

// The live four-page sharded registry, read from the spec corpus and
// concatenated — the same input tests/code-registry.test.ts reconciles.
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

`tests/helpers/registry-oracle.ts:18-38` (the canonical export doing the same
read):
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

`tests/params-brace-union-rhs-lowering.test.ts:5` — the sibling file in this
same review scope already uses the canonical import instead of a local copy:
```ts
import { REGISTRY } from "./helpers/registry-oracle";
```

Search: `grep -n "^const REGISTRY = parseRegistry" tests/params-block-mapping-rhs-refusal.test.ts` → 1 hit (the cited block); `grep -n "from \"./helpers/registry-oracle\"" tests/params-block-mapping-rhs-refusal.test.ts` → 0 hits.

## Why this is a problem
`tests/helpers/registry-oracle.ts` is the named canonical home for exactly
this four-page registry read (its own header comment cites PTQ-0215 as the
finding that created it because the construction was independently
redeclared across many files). The reviewed file pays the same four-page
`readFileSync` + `parseRegistry` cost and carries the identical `RegistryRow`
shape as a private, unimported copy, while the file directly beside it in
this review's own scope already imports the shared export for the identical
purpose — demonstrating the canonical helper is both available and already
adopted by a sibling, just not by this file.

## Suggested direction (non-binding, optional)
Replacing the local `RegistryRow` interface and `REGISTRY` construction with
`import { REGISTRY } from "./helpers/registry-oracle"` (as the sibling file
already does) removes the private copy; the file's own `RegistryRow` type
annotations can then reference the helper's exported type.

## False-positive check
- Gate-pin check: the file does not match `*gate*.test.ts` or the named
  gate-kin patterns; the cited lines are a registry read, not a pinned count
  or inventory.
- Recording-double check: not applicable — `REGISTRY` is a static parsed
  table, not a recording double, and backs no "never called" witness.
- docs/bugs/ signature search: `grep -n "RegistryRow\|REGISTRY = parseRegistry" docs/bugs/0041*.md` returns no hits; the bug doc the file cites (0041) states no rationale for keeping the registry read file-local.
- coverage-matrix/bug-doc citation search: `grep -n "params-block-mapping-rhs-refusal" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any `it()`/`describe()` — only that the local `REGISTRY` construction could import the existing helper — so no citation is disturbed.
- Coverage check: the claim is about a repeated construction, not a missing
  test path; the local `REGISTRY` is exercised by every registry-message
  lookup already in the file.
- Overlap check: grepped `quality/intake` and `quality/resolved` for
  `params-block-mapping-rhs-refusal` — the two hits found
  (PTQ-0212-loadcleanly-harness-duplication.md,
  PTQ-0279-binderparams-parametersblocklines-duplicated.md) concern the
  `loadCleanly` null-checking wrapper and the `binderParams`/
  `parametersBlockLines` pair respectively, neither of which discusses the
  `RegistryRow`/`REGISTRY` construction filed here.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts reproduce at the cited lines (test :164-189, helper :18-38); own diff shows the local RegistryRow is field-identical to the exported one and the local REGISTRY reads the same four pages in the same order with the same "\n" join and cast, differing from readRegistry(["parse","load","runtime","host"]) only by `../` depth and parameterisation; the file has 0 `helpers/registry-oracle` imports (30 other tests import it, including the cited sibling params-brace-union-rhs-lowering.test.ts:4, migrated under PTQ-0412) and every use (:197/:225/:468 registryMessage, :477 REGISTRY.find) is satisfied by the helper's readonly export; all sites in tests/, not a gate file, coverage-matrix 0 hits, bug 0041:464 names the file as a witness without pinning its registry-read mechanics and no it()/describe() is touched; no resolved registry-oracle PTQ (0215/0222/0237/0250/0260/0275/0311/0313/0327/0404/0411/0412) lists this file and the two sibling intakes (d7-113-02/-03) cite disjoint lines — same confirmed D7 copy-paste-fixture class (triage: claude-fable-5-1)
