---
id: PTQ-0830
title: typeenv-prototype-names.test.ts redeclares the RegistryRow interface and the four-shard REGISTRY read tests/helpers/registry-oracle.ts already exports
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/typeenv-prototype-names.test.ts:198-222
  - tests/helpers/registry-oracle.ts:19-49
sites: 1                     # count of occurrences cited in Evidence (the one in-scope copy, against the one canonical helper)
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# typeenv-prototype-names.test.ts redeclares the RegistryRow interface and the four-shard REGISTRY read tests/helpers/registry-oracle.ts already exports

## Observation
`tests/helpers/registry-oracle.ts` exports a `RegistryRow` interface and a
`readRegistry(shards)` function that reads the four sharded diagnostics
registry pages (`code-registry-{parse,load,runtime,host}.md`), joins their
text, and parses the joined text through `parseRegistry`; it also exports a
pre-built `REGISTRY` constant calling `readRegistry(["parse", "load",
"runtime", "host"])`, with its own header stating this exact read "were
redeclared byte-for-byte (confirmed via `diff`) in several test files."
`tests/typeenv-prototype-names.test.ts` declares its own `RegistryRow`
interface with the identical six fields and its own `REGISTRY` constant
performing the identical four-shard `readFileSync` + `fileURLToPath` +
`parseRegistry` + `.join("\n")` sequence, without importing the helper.

## Evidence
`tests/typeenv-prototype-names.test.ts:198-222` (re-read immediately before
filing):
```ts
interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
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

`tests/helpers/registry-oracle.ts:19-49` (the canonical export, same six
fields and same four-shard read):
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

/** The live four-page sharded registry — the input tests/code-registry.test.ts reconciles. */
export const REGISTRY: readonly RegistryRow[] = readRegistry(["parse", "load", "runtime", "host"]);
```

Import search: `grep -n "helpers/registry-oracle" tests/typeenv-prototype-names.test.ts`
→ 0 hits; the file's only registry-related import is `parseRegistry,
registryMessage` taken directly from `../tools/code-registry/index.js`
(line 8), never from the shared helper. The reviewed file's `REGISTRY` value
is byte-for-byte the same four-shard join the helper's own `REGISTRY` export
already computes, modulo the `../` vs `../../` path depth the two files'
own locations require.

## Why this is a problem
`tests/helpers/registry-oracle.ts`'s own header states it was created because
the `RegistryRow` shape and the four-shard `REGISTRY` read "were redeclared
byte-for-byte … in several test files," and it exports exactly the
`RegistryRow` interface and `REGISTRY` constant the reviewed file re-derives
locally. The reviewed file's local `registered(code)` reader function (which
differs per file, by design, and is not itself the duplication) is built on
top of a `REGISTRY` value it did not need to construct — importing the
existing export leaves `registered` and every other local reader unchanged
while dropping the six-field interface and the four-shard `readFileSync`/
`parseRegistry` sequence.

## Suggested direction (non-binding, optional)
`tests/helpers/registry-oracle.ts` already exports `RegistryRow` and
`REGISTRY` for this exact four-shard read; the reviewed file's local
declarations name the existing home for that construction.

## False-positive check
- Gate-pin check: `tests/typeenv-prototype-names.test.ts` does not match
  `*gate*.test.ts` or the named gate kin (closing-gate, cross-cutting-gates,
  rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate); the cited block is a plain read-and-parse
  construction, not a pinned count or inventory assertion.
- Recording-double check: `REGISTRY` is a static parsed value consulted by
  `registryMessage` lookups, not a recording double or a "never called"
  MUST-NOT witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "typeenv-prototype-names"
  docs/bugs/` finds 14 hits (0038, 0050, 0051, 0083, 0090, 0134, 0135, 0136,
  0173, 0179, 0191, 0207, 0216, 0262); none states a rationale for
  re-deriving the registry read locally rather than importing
  `tests/helpers/registry-oracle.ts` — every citation is about the type-layer
  behaviour the file witnesses, not about its harness plumbing.
- coverage-matrix/bug-doc citation search: `grep -n "typeenv-prototype-names"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  change to any `it()`/`describe()` name, count, or assertion — only to
  where the `RegistryRow`/`REGISTRY` construction is defined.
- Coverage check: the claim is about a duplicated construction that already
  has a canonical home, not about a missing test path.
- Prior-finding overlap check: `grep -rl "typeenv-prototype-names"
  quality/intake/*.md quality/issues/*.md quality/resolved/*.md` finds
  PTQ-0732 (a `diagLines(doc)` redeclaration in the same two in-scope files,
  a different local function against a different helper export) and the
  prior wave's shard-160 REVIEW_LOG entry (which names only the
  `ajv()`/`slugOf` pattern in the sibling file as left-unfiled); neither
  names this file's `RegistryRow`/`REGISTRY` construction. `grep -rl
  "RegistryRow" quality/issues/*.md` finds PTQ-0734 (a disjoint three-file
  set: unresolved-annotation-lowering.test.ts,
  unterminated-literal-params-type-refusal.test.ts,
  unterminated-template-lexer-emission.test.ts) and PTQ-0600/PTQ-0548 (the
  sibling `production-load-harness.ts` reimplementation class, a different
  helper) — none cites `tests/typeenv-prototype-names.test.ts`.

## Triage
<triage appends: triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: `RegistryRow` at tests/typeenv-prototype-names.test.ts:198-205 diffs identical (bar `export`) to tests/helpers/registry-oracle.ts:21-28, and the local `REGISTRY` (:208-222) performs the same four-shard parse/load/runtime/host `readFileSync`+`parseRegistry`+`join("\n")` the helper's exported `REGISTRY` (:49) already computes (251 rows via the same parser); `grep helpers/registry-oracle` in the file → 0 hits, the only registry import is `parseRegistry, registryMessage` from tools/code-registry/index.js (:8); the copy is live (`REGISTRY` read at :230 by `registered()`, 9 call sites); both locations under tests/, D7 boilerplate-duplication class, not a gate file, no recording double, no it()/describe() rename/merge/delete proposed (coverage-matrix → 0 hits; 14 docs/bugs cites are all about type-layer behaviour), so no carve-out applies; not a duplicate — no open/resolved PTQ names this file's RegistryRow/REGISTRY (PTQ-0205 resolved and PTQ-0732 are the `diagLines` copy; PTQ-0777 is tests/live/; PTQ-0734 is a disjoint trio) and since the helper is already exported no other PTQ's fix reaches this site — per-file filings on disjoint sets are the established granularity (PTQ-0710, PTQ-0724 confirmed and fixed) (triage: claude-fable-5-1)
