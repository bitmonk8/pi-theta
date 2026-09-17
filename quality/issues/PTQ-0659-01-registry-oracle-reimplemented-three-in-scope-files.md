---
id: PTQ-0659
title: Four-page registry parse re-declared identically in three in-scope test files instead of importing tests/helpers/registry-oracle.ts
lens: D7
status: open
verdict: confirmed
locations:
  - tests/params-default-trailing-residue-refusal.test.ts:220-244
  - tests/params-default-type-compat.test.ts:130-154
  - tests/params-default-unary-minus-non-numeric-refusal.test.ts:194-218
  - tests/helpers/registry-oracle.ts:1-40
sites: 3
fix_scope: module
d4_class: clone
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# Four-page registry parse re-declared identically in three in-scope test files instead of importing tests/helpers/registry-oracle.ts

## Observation
All three in-scope files declare their own local `interface RegistryRow` and their own local `const REGISTRY = parseRegistry(...)` that reads and joins the same four sharded pages (`code-registry-{parse,load,runtime,host}.md`) via the same `readFileSync` / `fileURLToPath` construction. A canonical helper, `tests/helpers/registry-oracle.ts`, already exports both `RegistryRow` and a pre-built `REGISTRY` constant reading the identical four shards, and its own header comment states it was created precisely because this block "were redeclared byte-for-byte (confirmed via `diff`)" in several test files. None of the three in-scope files import it.

## Evidence

tests/params-default-trailing-residue-refusal.test.ts:220-244
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

tests/params-default-type-compat.test.ts:130-154 — byte-identical to the excerpt above (confirmed via `diff` of the two 25-line spans; zero lines differ).

tests/params-default-unary-minus-non-numeric-refusal.test.ts:194-218 — byte-identical to the trailing-residue excerpt above (confirmed via `diff` of the two 25-line spans; zero lines differ).

The canonical helper these three bypass, tests/helpers/registry-oracle.ts:17-40:
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

Search performed: `grep -n "interface RegistryRow" tests/*.test.ts` confirms the pattern in exactly the three in-scope files at the cited lines (verified individually above); no other occurrence was checked outside scope.

## Why this is a problem
The three in-scope files each carry their own copy of the same 25-line registry-parsing block — the exact `RegistryRow` shape and the exact four-shard `parseRegistry` join — rather than importing `RegistryRow` and `REGISTRY` from `tests/helpers/registry-oracle.ts`, whose own header comment names this precise duplication ("redeclared byte-for-byte … in several test files") as its reason for existing. A drift in the shard list, the join separator, or the cast would need to land in three places at once inside this file set alone, and the helper module already exists to make that a one-place edit.

## Suggested direction (non-binding, optional)
Each file's own `registryMessageOf` / `registryRowOf` reader (whose wording and throw-message vary per file) can stay local while its `REGISTRY` input is imported from `tests/helpers/registry-oracle.ts`, matching the split the helper's own comment already describes for the files that do use it.

## False-positive check
- Gate-pin check: none of these three files match `*gate*.test.ts` or the named gate kin; not applicable.
- Recording-double check: `REGISTRY` is a parsed data table, not a recording double asserting a MUST-NOT-call; not applicable.
- docs/bugs/ signature search: the duplication is a structural fact about the test file's own harness, not a red-test posture; no docs/bugs/ correct-reason-red citation applies.
- coverage-matrix / bug-doc citation search: `grep -rn "params-default-trailing-residue-refusal\|params-default-type-compat\|params-default-unary-minus-non-numeric-refusal" docs/reference/coverage-matrix.md docs/bugs/` DOES hit — all three files are cited by name (with specific cell labels, e.g. "cell c7 of `tests/params-default-type-compat.test.ts`") in docs/bugs/0066, 0163, 0165 and 0166. This finding does not propose to merge, rename or delete any of the three files or any cited cell; it proposes only that the local `REGISTRY` binding be imported from the existing helper instead of re-parsed, leaving every cited cell's label, body and file untouched.
- Confirmed this is not a coverage claim: the finding is about code that exists (the duplicated block), not about anything untested.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: `diff` of the three 25-line spans (trailing-residue :220-244, type-compat :130-154, unary-minus :194-218) reports zero differing lines, none of the three files imports tests/helpers/registry-oracle.ts (grep exit 1) while that helper is live (30 importers) and its header names this exact byte-for-byte redeclaration as its reason to exist; D7 boilerplate-duplication class, no gate-name match, no merge/rename/delete of the docs/bugs/0066·0163·0165·0166-cited cells proposed; not a duplicate — the registry-oracle siblings PTQ-0404/0411/0412 (and 0215 kin) are all resolved and each names a different file set, and no open or resolved issue cites these three files for this root cause (triage: claude-fable-5-1)
