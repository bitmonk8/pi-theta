---
id: PTQ-0275
title: construct-token-table-tails.test.ts rebuilds the four-page diagnostics-registry read that tests/helpers/registry-oracle.ts already centralises
lens: D7                     # D2 | D7 — the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/construct-token-table-tails.test.ts:65-84
  - tests/helpers/registry-oracle.ts:21-45
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912112713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# construct-token-table-tails.test.ts rebuilds the four-page diagnostics-registry read that tests/helpers/registry-oracle.ts already centralises

## Observation
tests/construct-token-table-tails.test.ts declares a local `RegistryRow`
interface and a `REGISTRY` constant that reads the same four sharded
diagnostics-registry pages (`code-registry-{parse,load,runtime,host}.md`)
through `parseRegistry`, joined with `"\n"`. `tests/helpers/registry-oracle.ts`
already exports a `REGISTRY` built the identical way — same four pages, same
order, same `readFileSync`/`fileURLToPath`/`parseRegistry`/`.join("\n")`
chain — under the header "The shared four-page diagnostics-registry read
(PTQ-0215)." The reviewed file's `RegistryRow` is a narrower 2-field
(`code`/`message`) view; both of its fields are already present on the
helper's 6-field row. The reviewed file imports nothing from
`tests/helpers/registry-oracle.ts`.

## Evidence
tests/construct-token-table-tails.test.ts:65-75 — the local interface and
page list:
```ts
interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

const REGISTRY_PAGES = [
  "code-registry-parse.md",
  "code-registry-load.md",
  "code-registry-runtime.md",
  "code-registry-host.md",
] as const;
```

tests/construct-token-table-tails.test.ts:77-84 — the local read, parse and
join:
```ts
const REGISTRY = parseRegistry(
  REGISTRY_PAGES.map((page) =>
    readFileSync(
      fileURLToPath(new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url)),
      "utf8",
    ),
  ).join("\n"),
) as RegistryRow[];
```

tests/helpers/registry-oracle.ts:21-28 — the canonical `RegistryRow` (a
superset carrying `namespace`/`severity`/`phase`/`trigger` in addition to the
two fields the reviewed file reads):
```ts
export interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}
```

tests/helpers/registry-oracle.ts:31-45 — the canonical `REGISTRY`, reading
the identical four pages in the identical order through the identical
`parseRegistry`/`.join("\n")` chain:
```ts
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

## Why this is a problem
`tests/helpers/registry-oracle.ts`'s own header states it exists because this
exact four-page read "were redeclared byte-for-byte ... in several test
files. This module centralises that read." Two prior findings confirm this
is a live, recurring class rather than a one-off: PTQ-0215 (fixed) found the
identical 15-line four-page block duplicated across three files and built
this helper to hold it; PTQ-0237 (open, confirmed) later found a fourth file
(b0275) reimplementing a narrower two-page variant of the same read instead
of importing the by-then-existing helper. The reviewed file reproduces the
full four-page shape — same pages, same order, same call chain — under a
narrower row type the helper's own type already subsumes, and imports
nothing from it.

## Suggested direction (non-binding, optional)
`tests/helpers/registry-oracle.ts` already exports a `REGISTRY` covering
every page this file reads, under a `RegistryRow` shape (`code`, `message`,
plus four more fields) that is a strict superset of the reviewed file's own
two-field view.

## False-positive check
- Gate-pin check: `tests/construct-token-table-tails.test.ts` does not match
  `*gate*.test.ts` or the named gate kin; the cited lines are a static data
  read, not a pinned count or inventory.
- Recording-double check: `REGISTRY` is a parsed-once, static array; it
  records no calls and backs no "never called" witness, so the
  negative-witness carve-out does not apply.
- docs/bugs/ signature search: bug 0063 (`Status: fixed (0.233.0)`) and bug
  0285 both cite this file by name, at other lines (a specific tail string at
  :191, and general behaviour), never at lines 65-84; `npx vitest run
  tests/construct-token-table-tails.test.ts` reproduces 10/10 passing at HEAD
  (reverified during this review); `grep -rl "registry-oracle" docs/bugs/`
  hits only 0123, which does not discuss this file or state a rationale for
  a local four-page reparse.
- coverage-matrix/bug-doc citation search: `grep -n "construct-token-table-tails"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of any test — only that the local
  `RegistryRow`/`REGISTRY` read could draw on the existing export — so no
  witness-list citation is disturbed.
- git history: `tests/helpers/registry-oracle.ts` was added 2026-09-11
  (PTQ-0215's fix commit); `tests/construct-token-table-tails.test.ts` was
  added 2026-08-23, predating the helper. The reviewed file therefore had no
  helper to import at authoring time — the same shape PTQ-0237 confirmed for
  b0275 (added 2026-08-25, also predating the helper) — so pre-dating the
  helper's creation does not by itself exempt a file from this class once the
  helper exists unused in the tree.
- Overlap check: distinct root cause from this same wave's
  `qw20260912112713-d7-02-construct-token-table-row-reader-duplicated.md`
  (a different canonical helper, `category1-clause-oracle.ts`, at a disjoint
  line range, 294-300 there versus 65-84 here).

## Triage
verdict: confirmed — both excerpts (test:65-84, helper:21-45) reproduce byte-for-byte, the file imports nothing from the helper, all false-positive-check searches (docs/bugs grep, coverage-matrix grep, 10/10 vitest pass, git-log add dates 2026-08-23 vs 2026-09-11) reproduce exactly, no gate-pin/negative-witness/documented-rationale carve-out applies, and this matches the same confirmed D7 boilerplate-duplication class as PTQ-0215/PTQ-0237 with a disjoint-scope sibling overlap check that also checks out (triage: claude-opus-5)
