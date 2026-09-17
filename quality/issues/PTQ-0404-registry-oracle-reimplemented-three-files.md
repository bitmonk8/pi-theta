---
id: PTQ-0404
title: Three in-scope test files re-parse the code-registry corpus locally instead of importing tests/helpers/registry-oracle.ts
lens: D7
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/absent-member-presence-gate.test.ts:179-193
  - tests/acceptance-stderr-gate.test.ts:490-513
  - tests/alias-sink-array-element-check.test.ts:130-141
  - tests/helpers/registry-oracle.ts:20-45
sites: 3
fix_scope: localized
wave: qw20260917095931
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# Three in-scope test files re-parse the code-registry corpus locally instead of importing tests/helpers/registry-oracle.ts

## Observation
`tests/helpers/registry-oracle.ts` exists specifically to hold one `RegistryRow` interface (`code`/`namespace`/`severity`/`phase`/`trigger`/`message`) and one `REGISTRY` constant that reads the four sharded `docs/spec_topics/diagnostics/code-registry-{parse,load,runtime,host}.md` pages through `parseRegistry` and joins them — its own header states this consolidated a read that "were redeclared byte-for-byte (confirmed via `diff`) in several test files" (PTQ-0215). Within this six-file review scope, three files still hand-roll that same read (or a narrower slice of it) locally rather than importing the shared `REGISTRY`/`RegistryRow` export: `tests/absent-member-presence-gate.test.ts` re-declares the identical four-page `RegistryRow`+`REGISTRY` pair; `tests/acceptance-stderr-gate.test.ts` re-declares an identically-shaped six-field `HostRegistryRow` interface and re-reads just the host page; `tests/alias-sink-array-element-check.test.ts` re-declares a two-field `RegistryRow` and re-reads just the parse page.

## Evidence
`tests/helpers/registry-oracle.ts:20-45` (the canonical export):
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

/** The live four-page sharded registry — the input tests/code-registry.test.ts reconciles. */
export const REGISTRY: readonly RegistryRow[] = parseRegistry(
  [
    "code-registry-parse.md",
    "code-registry-load.md",
    "code-registry-runtime.md",
    "code-registry-host.md",
  ]
    .map((page) =>
      readFileSync(
        fileURLToPath(new URL(`../../docs/spec_topics/diagnostics/${page}`, import.meta.url)),
        "utf8",
      ),
    )
    .join("\n"),
) as RegistryRow[];
```

`tests/absent-member-presence-gate.test.ts:179-193` — the same four-page read, re-declared, differing only in the relative path depth (`../` vs `../../`) and an inline anonymous row type instead of the named `RegistryRow`:
```ts
/** The live registry, read from the spec corpus — the DIAG-4 source of truth. */
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
) as readonly { readonly code: string; readonly message: string }[];
```

`tests/acceptance-stderr-gate.test.ts:490-513` — a `HostRegistryRow` interface with the identical six fields as the canonical `RegistryRow`, backing a single-page read of the same corpus:
```ts
/** One parsed row of the sharded diagnostics registry (`tools/code-registry`). */
interface HostRegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

/**
 * The live `theta/host/*` registry shard, read from the spec corpus. Only the
 * host shard is read: both codes below live there, and a row that moved off the
 * page SHOULD red here rather than be silently found elsewhere.
 */
const HOST_REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../docs/spec_topics/diagnostics/code-registry-host.md", import.meta.url),
```

`tests/alias-sink-array-element-check.test.ts:130-141` — a narrower two-field `RegistryRow`, backing a single-page read:
```ts
interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
    ),
    "utf8",
```

Exact search: `grep -n "= parseRegistry(" tests/absent-member-presence-gate.test.ts tests/acceptance-stderr-gate.test.ts tests/alias-sink-array-element-check.test.ts` returns one hit per file (3 hits), none of them importing `REGISTRY` or `RegistryRow` from `tests/helpers/registry-oracle.ts`; `grep -rln "helpers/registry-oracle" tests/absent-member-presence-gate.test.ts tests/acceptance-stderr-gate.test.ts tests/alias-sink-array-element-check.test.ts` returns no hits.

## Why this is a problem
`tests/helpers/registry-oracle.ts`'s own header names the exact failure mode this reproduces: the four-page `parseRegistry` read "were redeclared byte-for-byte … in several test files," which is why the module was created. `tests/absent-member-presence-gate.test.ts` reproduces that same four-page read almost byte-for-byte (only the relative-path depth and the row-type shape differ), and `tests/acceptance-stderr-gate.test.ts` / `tests/alias-sink-array-element-check.test.ts` each reproduce a subset of it (a matching `RegistryRow`-shaped interface plus a narrower single-page slice of the same corpus the canonical `REGISTRY` already contains). Since `REGISTRY` is the join of all four pages, a lookup by code (`registryMessage(REGISTRY, code)`) already covers the host- and parse-page codes each of these three files re-reads independently.

## Suggested direction (non-binding, optional)
Each of the three files could import `REGISTRY` (and `RegistryRow` where its own row type matches) from `tests/helpers/registry-oracle.ts` in place of its local `parseRegistry(...)` read, keeping each file's own message-filling/placeholder logic local as `registry-oracle.ts`'s own header already anticipates.

## False-positive check
- Gate-pin check: none of the three files matches `*gate*.test.ts`'s pinned-census shape for this construct — the `REGISTRY`/`HOST_REGISTRY` constants back message lookups, not pinned counts or inventories.
- Recording-double check: not applicable — no recording double is involved; this is a data-read helper, not a fake/spy.
- docs/bugs/ signature search: `grep -rln "registry-oracle" docs/bugs/` returned no hits; the local re-reads are not documented correct-reason reds.
- coverage-matrix citation search: `grep -n "absent-member-presence-gate.test.ts\|acceptance-stderr-gate.test.ts\|alias-sink-array-element-check.test.ts" docs/reference/coverage-matrix.md` returned no hits, so no citation constrains renaming/merging (and this finding proposes neither — only an import substitution).
- Coverage drift check: this finding does not claim any path or behaviour is untested; it is limited to the three files' own re-implementation of an existing corpus-read helper.

## Triage
verdict: confirmed — all three local parseRegistry reads reproduce at the cited lines (absent-member-presence-gate:180 four-page join line-for-line identical to registry-oracle.ts:31-45 bar path depth/row type; acceptance-stderr-gate:491-512 six-field HostRegistryRow + host-page read; alias-sink-array-element-check:130-137 two-field row + parse-page read), none of the three imports tests/helpers/registry-oracle (21 other test files do), every looked-up code verified on a page the shared four-page REGISTRY already joins (2 host, 5 parse, 1 runtime), coverage-matrix has 0 citations, bug 0047 does not mandate a host-shard-only read, and no existing PTQ cites these files — same D7 copy-paste-fixture class as confirmed PTQ-0222/0237/0250/0260/0275/0311/0313/0327 (single-page narrow reads included per PTQ-0313); fixer note: acceptance-stderr-gate:500-503 states a row-stays-on-host-page intent, preservable via the shared rows' namespace field rather than a separate parse; minor: the filing's docs/bugs grep actually returns 1 unrelated prose hit (bug 0123), non-blocking (triage: claude-fable-5-1)
verdict: confirmed — re-verified independently: all three local parseRegistry reads reproduce at the cited lines (absent-member-presence-gate:180 four-page join identical to registry-oracle.ts:31-45 bar `../` depth and row type; acceptance-stderr-gate:491-512 six-field HostRegistryRow + host-page read; alias-sink-array-element-check:130-137 two-field row + parse-page read), 0 `helpers/registry-oracle` imports in the three files vs 21 elsewhere in tests/, every code each file looks up (2 theta/host, 5 theta/parse, theta/runtime/missing-object-key) confirmed on a page the shared four-page REGISTRY joins, coverage-matrix 0 citations, gate carve-out inapplicable (constants back message lookups, not pinned counts), not a duplicate (PTQ-0209/0216 cite other constructs in these files; sibling d7-03 cites disjoint parseDoc lines) — same confirmed D7 copy-paste-fixture class as PTQ-0313/0327 which already cover single-page narrow reads; note acceptance-stderr-gate:500-503's row-stays-on-host-page intent is preservable via the shared rows' namespace field; filing's docs/bugs grep actually returns 1 unrelated prose hit (bug 0123:1000), non-blocking (triage: claude-fable-5-1)
