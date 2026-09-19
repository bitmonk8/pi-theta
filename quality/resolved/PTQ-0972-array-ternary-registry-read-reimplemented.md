---
id: PTQ-0972
title: array-ternary-common-type-union.test.ts re-implements the registry-oracle's REGISTRY read instead of calling readRegistry
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/array-ternary-common-type-union.test.ts:179-189
  - tests/helpers/registry-oracle.ts:18-44
sites: 1
fix_scope: localized
wave: qw20260918131151
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# array-ternary-common-type-union.test.ts re-implements the registry-oracle's REGISTRY read instead of calling readRegistry

## Observation
`tests/array-ternary-common-type-union.test.ts` already imports `interpolateStrict` from `tests/helpers/registry-oracle.ts`, but for the registry read itself it declares its own `RegistryRow` interface and its own `REGISTRY` constant, reading `docs/spec_topics/diagnostics/code-registry-parse.md` directly through `readFileSync` + `parseRegistry`. `tests/helpers/registry-oracle.ts` already exports a parameterised `readRegistry(shards)` function that performs this exact read (`readFileSync` of a `code-registry-<shard>.md` page through the same `parseRegistry`) and a `RegistryRow` interface covering the same `code`/`message` fields (plus others). `readRegistry(["parse"])` would return the same single-shard registry this file re-derives by hand.

## Evidence
`tests/array-ternary-common-type-union.test.ts:179-189`:
```ts
interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

/** The live `theta/parse/*` registry page — the DIAG-4 oracle for this file. */
const REGISTRY_PAGE = "docs/spec_topics/diagnostics/code-registry-parse.md";

const REGISTRY = parseRegistry(
  readFileSync(fileURLToPath(new URL(`../${REGISTRY_PAGE}`, import.meta.url)), "utf8"),
) as RegistryRow[];
```

`tests/helpers/registry-oracle.ts:18-44`:
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

The file already imports from this module (`tests/array-ternary-common-type-union.test.ts:1`: `import { interpolateStrict } from "./helpers/registry-oracle";`), so the module is a known, already-in-use dependency at the point the local re-read is declared eight lines later in the same file (line 187 vs. the import at line 1).

## Why this is a problem
`tests/helpers/registry-oracle.ts`'s own header states its purpose: "the shared four-page diagnostics-registry read" was "redeclared byte-for-byte (confirmed via `diff`) in several test files. This module centralises that read." The local `REGISTRY_PAGE` / `RegistryRow` / `REGISTRY` triple in this file is a re-derivation of exactly that read (same file-read mechanism, same `parseRegistry` call, a `RegistryRow` interface that is a strict field subset of the exported one), for a module that is already imported in the same file.

## Suggested direction (non-binding, optional)
Calling `readRegistry(["parse"])` (already exported and already the single-shard case the module supports) in place of the local `readFileSync`/`parseRegistry` pair, and using the exported `RegistryRow` type, is the natural path this file's existing import already points to.

## False-positive check
- Gate-pin carve-out: file name does not match `*gate*.test.ts` or named gate kin; not applicable.
- Recording-double carve-out: not applicable — this is a registry read, not a call-recording double.
- Documented correct-reason red check: `grep -n "REGISTRY_PAGE\|RegistryRow" docs/bugs/0081-array-ternary-common-type-never-unions.md docs/bugs/0155*.md 2>/dev/null` — 0 hits; the bug doc does not cite this local registry-read shape as a pinned witness.
- coverage-matrix citation search: `grep -n "array-ternary-common-type-union" docs/reference/coverage-matrix.md` — 0 hits. This finding does not propose renaming, merging, or deleting the test file — it observes an in-file re-derivation of an already-imported helper's read.
- Prior-filing search: `grep -rl "array-ternary-common-type-union" quality/issues quality/intake` — 0 hits before this filing; this file's registry-read shape has not previously been filed.

## Triage
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/array-ternary-common-type-union.test.ts:179-189 (local 2-field `RegistryRow` + `parseRegistry(readFileSync(fileURLToPath(new URL("../docs/spec_topics/diagnostics/code-registry-parse.md"))))`) and tests/helpers/registry-oracle.ts:19-45 (`readRegistry(["parse"])` resolves `../../docs/...code-registry-parse.md` from tests/helpers — the same file through the same `parseRegistry`, already used this way by 10 tests/*.test.ts files), the file imports `interpolateStrict` from that very module at :1, the local copy is live (consumed only by `registryMessage(REGISTRY, code)` at :200, so the exported superset `RegistryRow` is type-compatible), all locations under tests/, D7 boilerplate-duplication class with no gate/recording-double carve-out, and the stated searches reproduce (docs/bugs 0081/0155 `REGISTRY_PAGE|RegistryRow` → 0; coverage-matrix → 0; quality/issues+intake → 0); not a duplicate — resolved PTQ-0468 named this file only in its 22-file pattern sweep and its fix commit cc0a8fe7 did not touch it, open PTQ-0896/PTQ-0842 track other single files, and store precedent (PTQ-0250/0327/0412/0842) files per-file residuals of this registry-oracle gap separately; note for acceptance: 10 sibling tests still carry the identical residual local read (fn-arg-type-mismatch-wired, imported-thetalib-fn-call-args-checked, invoke-arg-array-literal-provable, join-element-unresolvable-disposition, let-arm-withhold-binding-scoped, loop-element-withhold-binding-scoped, match-fn-return-lub-dominating-discipline, params-declared-type-in-type-layer, ternary-common-type-trigger-adjudication, unresolvable-operand-structural-target-adjudication [the last already under PTQ-0842]) and could be folded into the location list; `REGISTRY_PAGE` legitimately stays as the error-message string, as arg-mismatch/b0448 already do (triage: claude-fable-5-1)
