---
id: PTQ-0945
title: non-literal-by-field-refusal.test.ts redeclares the four-page diagnostics-registry read tests/helpers/registry-oracle.ts already centralises
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/non-literal-by-field-refusal.test.ts:93-112
  - tests/helpers/registry-oracle.ts:19-38
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918092852
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# non-literal-by-field-refusal.test.ts redeclares the four-page diagnostics-registry read tests/helpers/registry-oracle.ts already centralises

## Observation
`tests/non-literal-by-field-refusal.test.ts` declares its own `RegistryRow`
interface and its own `REGISTRY` constant by reading the same four sharded
registry pages (`code-registry-{parse,load,runtime,host}.md`) through the same
`parseRegistry` call and joining them with `"\n"`, instead of importing the
`REGISTRY` export `tests/helpers/registry-oracle.ts` already builds from
exactly those four shards.

## Evidence
`tests/non-literal-by-field-refusal.test.ts:93-112`:
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

`tests/helpers/registry-oracle.ts:19-38` — the canonical export, reading the
identical four shards through the identical `parseRegistry` call and
`"\n"`-join:
```ts
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
`readRegistry(["parse", "load", "runtime", "host"])` reads the same four page
names in the same order as the in-scope file's literal array; the only
differences are the relative-URL depth (this helper sits one directory
deeper) and the in-scope file's narrower local `RegistryRow` (`code`,
`message`) versus the helper's six-field `RegistryRow`, a type-level
projection of the same parsed rows, not a different read.

## Why this is a problem
This is the "Boilerplate duplication" class named in `registry-oracle.ts`'s
own header comment: the module exists specifically because "the shared
four-page diagnostics-registry read … were redeclared byte-for-byte … in
several test files," and its stated design keeps only the read centralised
while each file's own message-rendering reader stays local. The in-scope
file redeclares exactly the part the helper was built to centralise — the
four-shard read and join — leaving a second array construction that must be
kept in sync with the shard list and read order the helper already owns
whenever a fifth registry shard is added.

## Suggested direction (non-binding, optional)
Importing `REGISTRY` from `tests/helpers/registry-oracle.ts` in place of the
local four-page `parseRegistry` call is the natural next step this module's
own header already names as its purpose; the file's own `messageTemplate`
reader (which the helper's docstring says should stay local) is unaffected.

## False-positive check
- Gate-pin check: the file is not `*gate*.test.ts` or named gate kin; the
  carve-out does not apply.
- Recording-double check: `REGISTRY` is a parsed, read-only lookup table, not
  a recording double backing a "never called" witness; the negative-witness
  carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "REGISTRY = parseRegistry" docs/bugs/`
  → 0 hits; `docs/bugs/0128-non-literal-by-field-loads-silently.md` pins this
  file only by name and cell count ("`tests/non-literal-by-field-refusal.test.ts`
  (new, 12 cells)"), never by this construction, so no documented
  correct-reason-red covers it.
- coverage-matrix/bug-doc citation search: `grep -n
  "non-literal-by-field-refusal" docs/reference/coverage-matrix.md` → 0 hits.
  This finding proposes no merge, rename, or deletion of the file or any
  `it()`/`describe()` — only that the existing four-page read could be
  imported rather than re-derived.
- Prior-finding overlap check: `grep -rln "non-literal-by-field-refusal"
  quality/intake quality/resolved quality/issues` → only PTQ-0573 (a disjoint
  `span`/`site`/`withCode` seam-helper duplication) and PTQ-0640 (the
  `CapturedSchema`/`capturedSchemas`/`loadRow` duplication, already fixed —
  the file now imports `capturedSchemas`/`CapturedSchema` from
  `./helpers/e2e-s1`); neither names `REGISTRY`, `RegistryRow`, or
  `registry-oracle`. The prior review of this file this wave
  (`qw20260917154546` shard-108) explicitly noted this exact construction but
  left it unfiled citing volume elsewhere in that wave, not a correctness or
  scope objection to filing it.
- Coverage-drift check: the claim is about a repeated read-and-join
  DEFINITION, not a missing test path; the file's own tests exercise its own
  copy today.

## Triage
<!-- triage appends here -->
verdict: confirmed — independently re-verified: both excerpts reproduce byte-for-byte at tests/non-literal-by-field-refusal.test.ts:93-112 and tests/helpers/registry-oracle.ts:19-38; a mktemp node run of both reads over the four shards yields 251 rows each with JSON-identical output (the `../` vs `../../` depth resolves to the same absolute pages, same order), the file's `REGISTRY` has exactly one consumer (`registryMessage(REGISTRY, code)` :125) and its local two-field `RegistryRow` is a structural subset of the helper's export so `import { REGISTRY } from "./helpers/registry-oracle"` is a green drop-in; the helper (2594cd44 2026-09-11) postdates the file (f5862ab0 2026-08-21) and is live canon with 128 importers under tests/; tests/-only D7 boilerplate-duplication class, not a gate, not a recording double, stated docs/bugs (`REGISTRY = parseRegistry` → 0) and coverage-matrix (0) greps reproduce; not a duplicate — the only prior filings naming this file are fixed PTQ-0573 (span/site/withCode) and fixed PTQ-0640 (CapturedSchema), and the two same-wave intake siblings cover disjoint helpers (`messageTemplate` in d7-04, whose own triage note scopes this candidate to the REGISTRY read; `expectDeclared` in d7-09-expectdeclared); note for the fixer: after the swap the `parseRegistry` import at :5 becomes unused and should go with it (triage: claude-fable-5-1)
