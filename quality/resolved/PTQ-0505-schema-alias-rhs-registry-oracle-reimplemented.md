---
id: PTQ-0505
title: schema-alias-rhs-malformed.test.ts redeclares the four-page registry read that tests/helpers/registry-oracle.ts centralises
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/schema-alias-rhs-malformed.test.ts:167-191
  - tests/helpers/registry-oracle.ts:1-46
sites: 1
fix_scope: localized
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# schema-alias-rhs-malformed.test.ts redeclares the four-page registry read that tests/helpers/registry-oracle.ts centralises

## Observation
tests/schema-alias-rhs-malformed.test.ts:167-191 declares its own `RegistryRow`
interface (six fields: code, namespace, severity, phase, trigger, message) and
its own `REGISTRY` constant, built by reading the four sharded registry pages
(`code-registry-parse.md`, `code-registry-load.md`, `code-registry-runtime.md`,
`code-registry-host.md`) via `readFileSync`/`fileURLToPath` and joining them
through `parseRegistry`. tests/helpers/registry-oracle.ts exports an
identically-shaped `RegistryRow` interface (lines 21-28) and a `readRegistry`
function (lines 31-46) that performs the same four-shard read via the same
`parseRegistry` call, plus a ready-made `REGISTRY` constant
(`readRegistry(["parse","load","runtime","host"])`) covering the identical four
pages in the identical order.

## Evidence
tests/schema-alias-rhs-malformed.test.ts:167-191
```ts
interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

/** The live four-page sharded registry, read from the spec corpus and concatenated. */
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

tests/helpers/registry-oracle.ts:1-46 (the canonical helper, in full)
```ts
// The shared four-page diagnostics-registry read (PTQ-0215).
//
// WHY THIS FILE EXISTS. `RegistryRow` and the `REGISTRY` load it backs — read
// the four sharded registry pages (code-registry-{parse,load,runtime,host}.md),
// parse each through the real `parseRegistry`, and join the rows into one
// array — were redeclared byte-for-byte (confirmed via `diff`) in several test
// files. This module centralises that read only: each file's own
// `registryMessageOf` / `registryRowOf`-shaped reader — whose assertion style
// and wording vary per file — stays local, parameterised by the `REGISTRY` this
// module exports rather than by a locally re-parsed copy.
...
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

The two `RegistryRow` shapes are byte-for-byte identical (same six fields, same
order); the two reads cover the same four shards in the same order via the
same `parseRegistry` call.

## Why this is a problem
tests/helpers/registry-oracle.ts's own header states its purpose is to
eliminate exactly this redeclaration ("were redeclared byte-for-byte
(confirmed via `diff`) in several test files. This module centralises that
read only"). schema-alias-rhs-malformed.test.ts's local `RegistryRow` +
`REGISTRY` (tests/schema-alias-rhs-malformed.test.ts:167-191) is a second,
independent instance of the read the helper exists to replace: importing
`REGISTRY` (and the `RegistryRow` type) from tests/helpers/registry-oracle.ts
would leave this file's local `msg`/`malformedMessage`/`refusalMessage`
readers — the per-file part the helper's docstring says legitimately stays
local — untouched, while removing the duplicate parse-and-join.

## Suggested direction (non-binding, optional)
Importing `REGISTRY` and `RegistryRow` from tests/helpers/registry-oracle.ts in
place of the local declaration is the natural fit named by the helper's own
stated purpose.

## False-positive check
Gate-pin check: not applicable — this file is not `*gate*.test.ts` or kin.
Recording-double check: not applicable — no negative-witness double is
involved. docs/bugs/ signature search: the file documents bug 0042 (RED tests
pending the paired fix) but the redness concerns the malformed-alias-rhs
emission itself, not the registry-read harness, so the duplication is
independent of the documented correct-reason red. coverage-matrix/bug-doc
citation search: `grep -r "schema-alias-rhs-malformed" docs/reference/coverage-matrix.md
docs/bugs/` returned no hits naming this test file by name, so no citation
pins its current structure. This finding does not propose merging, renaming,
or deleting any test — it proposes replacing one local read with the existing
exported one, which is the type of duplication `tests/helpers/registry-oracle.ts`
already documents as its own reason for existing. The claim stays inside D7
(copy-paste fixture) and does not drift into coverage: no assertion about
untested paths is made.

## Triage
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim (test :167-191, helper :1-46); the two `RegistryRow` interfaces diff byte-identical and the local read covers the same four shards in the same order through the same `parseRegistry`; the local `REGISTRY` is consumed only via `registryMessage(REGISTRY, …)` (:218, :569) and `.find` (:552), never mutated, so the helper's `readonly` export is a drop-in; the file imports nothing from tests/helpers/registry-oracle.ts today; no open/resolved PTQ names this file (PTQ-0404/0411/0412 cite other tests — per-file filings against the helper are the ratified pattern); not a gate test, no double involved. Correction for the record: the candidate's "no hits" claim for docs/bugs/ is false — bugs 0061/0062/0063 cite this file's fixture cells by line (:301, :702, :1212, :1267–1305, :1323), but none pins the registry-read block and no merge/rename/delete is proposed, so the carve-out does not apply; fixer should expect those bug-doc line citations to drift by ~24 lines (triage: claude-fable-5-1)
