---
id: PTQ-0506
title: schema-alias-union-decl.test.ts re-parses the four-page diagnostics registry instead of importing tests/helpers/registry-oracle.ts
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/schema-alias-union-decl.test.ts:149-168
  - tests/helpers/registry-oracle.ts:1-45
sites: 1
fix_scope: localized
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# schema-alias-union-decl.test.ts re-parses the four-page diagnostics registry instead of importing tests/helpers/registry-oracle.ts

## Observation
`tests/schema-alias-union-decl.test.ts` declares its own `RegistryRow`
interface and its own `REGISTRY` constant, built by reading the same four
sharded registry pages (`code-registry-{parse,load,runtime,host}.md`) off
disk and joining them through the same `parseRegistry` call that
`tests/helpers/registry-oracle.ts` already performs and exports as
`REGISTRY` / `readRegistry`. The file imports `parseRegistry` directly from
`../tools/code-registry/index.js` rather than importing the helper module.

## Evidence
`tests/schema-alias-union-decl.test.ts:149-168`:
```ts
interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

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

`tests/helpers/registry-oracle.ts:1-45` (the canonical shared read, whose own
header states it centralises exactly this read because it "were redeclared
byte-for-byte (confirmed via `diff`) in several test files"):
```ts
// The shared four-page diagnostics-registry read (PTQ-0215).
...
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
The reviewed file's four-shard list (`parse`, `load`, `runtime`, `host`) is
the identical full set `readRegistry`'s exported `REGISTRY` constant already
computes; a `REGISTRY.filter(...)` or the constant itself, imported, would
supply the same rows without a second disk read and a second `parseRegistry`
parse.

## Why this is a problem
`tests/helpers/registry-oracle.ts` exists specifically because this exact
four-page read (reading the same four `code-registry-*.md` files, through the
same `parseRegistry` call, joined the same way) was independently redeclared
across multiple test files (PTQ-0215); its own header names that redeclared
duplication as the reason for its existence. `schema-alias-union-decl.test.ts`
carries that same construction — the same four shard names, the same
`fileURLToPath(new URL(...))` read, the same `.join("\n")`, the same
`parseRegistry` call and cast — as a locally-declared duplicate rather than as
an import of the already-exported constant.

## Suggested direction (non-binding, optional)
Importing `REGISTRY` (or calling `readRegistry` with the same four shards)
from `tests/helpers/registry-oracle.ts` is the natural source this file's own
construction already points at; the file's local `RegistryRow` interface
(narrower — `code` and `message` only) is a subset of the helper's exported
`RegistryRow` shape, so the two are structurally compatible.

## False-positive check
- Gate-pin check: `tests/schema-alias-union-decl.test.ts` does not match
  `*gate*.test.ts` or the named gate-kin patterns; the carve-out does not
  apply.
- Recording-double check: `REGISTRY` is a static parsed-document read, not a
  recording double or a MUST-NOT witness; the negative-witness carve-out does
  not apply.
- docs/bugs/ signature search: `grep -rl "parseRegistry(" docs/bugs/0033*`
  returns no hits; the bug doc for bug 0033 states no rationale for a locally
  re-parsed registry.
- coverage-matrix/bug-doc citation search: `grep -n
  "schema-alias-union-decl" docs/reference/coverage-matrix.md` returns no
  hits; this finding proposes no change to any `it()`/`describe()` name,
  count, or assertion, only to where the `REGISTRY` constant is built.
- History check: `git log --diff-filter=A -- tests/helpers/registry-oracle.ts`
  shows the helper was added 2026-09-11 (commit `2594cd44`, wave
  `qw20260911104855`); `git log -- tests/schema-alias-union-decl.test.ts`
  shows the file's `REGISTRY` block was introduced 2026-08-01 (commit
  `f959f8de`, bug 0033's fix), over five weeks before the helper existed, and
  has not since been migrated to it. This is a pre-existing construction the
  helper's later introduction left behind, not a deliberate divergence.
- Coverage check: the claim is entirely about a repeated registry-read
  CONSTRUCTION; the file's own tests exercise every row they reference, and no
  behaviour path is claimed untested.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim (tests/schema-alias-union-decl.test.ts:149-168 local RegistryRow + four-shard parseRegistry join; tests/helpers/registry-oracle.ts:1-45 exports the identical read as REGISTRY/readRegistry, live with 30 test importers); the local REGISTRY is consumed only via registryMessage(REGISTRY, code) at :213 so the helper's constant is a drop-in; git log confirms the block predates the helper (f959f8de 2026-08-01 vs 2594cd44 2026-09-11) and was never migrated; bug-0033 and coverage-matrix greps return no hits; no gate/recording-double carve-out applies; no open or resolved registry-oracle PTQ (0215/0222/0237/0250/0260/0275/0311/0313/0327/0404/0411/0412) cites this file, and single-file sites:1 filings of this same construction (PTQ-0275, PTQ-0411) were previously confirmed and fixed (triage: claude-fable-5-1)
