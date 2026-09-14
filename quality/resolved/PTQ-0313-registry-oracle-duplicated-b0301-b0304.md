---
id: PTQ-0313
title: b0301 and b0304 each rebuild the sharded code-registry read that tests/helpers/registry-oracle.ts already centralises
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0301-bind-echo-tool-loop-respond-repair-holes.test.ts:97-111
  - tests/b0304-transitive-lib-diagnostics.test.ts:66-69
  - tests/b0304-transitive-lib-diagnostics.test.ts:73-87
  - tests/helpers/registry-oracle.ts:21-28
  - tests/helpers/registry-oracle.ts:31-45
sites: 5                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260914060226
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-14
---

# b0301 and b0304 each rebuild the sharded code-registry read that tests/helpers/registry-oracle.ts already centralises

## Observation
tests/b0301-bind-echo-tool-loop-respond-repair-holes.test.ts and
tests/b0304-transitive-lib-diagnostics.test.ts each declare their own local
`RegistryRow` interface and their own `parseRegistry(readFileSync(...))` read
of the `docs/spec_topics/diagnostics/` pages, instead of importing the
`RegistryRow`/`REGISTRY` pair tests/helpers/registry-oracle.ts already
exports for this exact purpose. b0304's read joins all four sharded pages
(`code-registry-{parse,load,runtime,host}.md`) — the same four-page union the
canonical `REGISTRY` builds, differing only in relative import depth and its
own narrower two-field `RegistryRow`. b0301's read is a single page
(`code-registry-load.md`), a subset of that same four-page union; every code
b0301 looks up (`theta/load/unknown-frontmatter-field`,
`theta/load/frontmatter-value-out-of-range`,
`theta/load/unknown-methodology-value`) is confirmed present on that page, so
the canonical `REGISTRY` already carries everything b0301's local read
fetches.

## Evidence

tests/b0301-bind-echo-tool-loop-respond-repair-holes.test.ts:97-111 — the
local interface and single-page read:
```ts
interface RegistryRow {
  readonly code: string;
  readonly message: string;
  readonly severity: string;
  readonly phase: string;
}

const REGISTRY_LOAD_PATH = "docs/spec_topics/diagnostics/code-registry-load.md";

const REGISTRY_LOAD = parseRegistry(
  readFileSync(
    fileURLToPath(new URL(`../${REGISTRY_LOAD_PATH}`, import.meta.url)),
    "utf8",
  ),
) as RegistryRow[];
```

tests/b0304-transitive-lib-diagnostics.test.ts:66-69 — the local interface:
```ts
interface RegistryRow {
  readonly code: string;
  readonly message: string;
}
```

tests/b0304-transitive-lib-diagnostics.test.ts:73-87 — the local four-page
join:
```ts
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

tests/helpers/registry-oracle.ts:21-28 — the canonical, wider `RegistryRow`
(a superset of both local shapes, so either file's own narrower reads remain
valid against it):
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

tests/helpers/registry-oracle.ts:31-45 — the canonical four-page join,
line-for-line identical to b0304's local join apart from the relative import
depth (`../../docs/...` from `tests/helpers/`, vs `../docs/...` from
`tests/`) and the `export`/type-annotation on the `const`:
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

Exact search: `grep -n "parseRegistry\|RegistryRow" tests/b0301-bind-echo-tool-loop-respond-repair-holes.test.ts tests/b0303-imported-fn-body-declaring-scope.test.ts tests/b0304-transitive-lib-diagnostics.test.ts tests/b0305-enum-alias-identity.test.ts tests/b0306-imported-enum-wire-values.test.ts tests/b0310-watch-roots-root-union.test.ts` (the six files this wave reviews) → hits in exactly 2 files, b0301 and b0304, both cited above; b0303, b0305, b0306 and b0310 read no registry at all.

Codes-on-page check: `grep -n "theta/load/unknown-frontmatter-field\|theta/load/frontmatter-value-out-of-range\|theta/load/unknown-methodology-value" docs/spec_topics/diagnostics/code-registry-load.md` → one row per code, confirming every EXISTING code b0301 looks up already lives on the single page it reads, which is itself one of the four pages the canonical `REGISTRY` joins.

## Why this is a problem
This is the "Copy-paste fixtures/doubles" class, the same shape already
confirmed at tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts
(PTQ-0237, resolved): tests/helpers/registry-oracle.ts was built to
centralise "parse the sharded diagnostics-registry markdown pages into one
row array through `parseRegistry`, once, for the whole file to query," and
both b0301 and b0304 solve that identical problem again with their own
`readFileSync`/`fileURLToPath`/`parseRegistry` call chain instead of
importing the existing export. b0304's four-page join is the canonical
shape line-for-line, differing only in relative path depth; b0301's
single-page read is, by the same reasoning PTQ-0237 already applied to a
narrower two-page reimplementation, a subset the canonical four-page
`REGISTRY` already provides in full.

## Suggested direction (non-binding, optional)
tests/helpers/registry-oracle.ts already exports a `REGISTRY` covering every
page and every code both files read; it is the existing home the local reads
in b0301 and b0304 could import instead of rebuilding.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named kin;
  the cited lines are a data read, not a pinned-count assertion.
- Recording-double check: `REGISTRY_LOAD`/`REGISTRY` are static, parsed-once
  arrays; neither records a call or backs a "never called" assertion in
  either file, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0301-bind-echo-tool-loop-respond-repair-silent-default-holes.md
  reads "Status: fixed (0.332.0)"; docs/bugs/0304-transitive-lib-diagnostics-discarded.md
  reads "Status: fixed (0.288.0)". `npx vitest run tests/b0301-bind-echo-tool-loop-respond-repair-holes.test.ts tests/b0304-transitive-lib-diagnostics.test.ts`
  → 31 passed (31) at HEAD, so neither is a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "b0301-bind-echo-tool-loop-respond-repair-holes\|b0304-transitive-lib-diagnostics" docs/reference/coverage-matrix.md`
  → 0 hits. Each file is named only in its own bug doc's witness list (a
  test witnessing its own bug). No citation names the `RegistryRow`/
  `REGISTRY_LOAD`/`REGISTRY` declarations themselves or requires them to
  stay locally declared, and this finding proposes no merge, rename or
  deletion of any file or `it()`/`describe()` — only that the local read
  could be replaced by the existing import.
- Coverage check: the claim is about a repeated read/parse DEFINITION, not a
  missing test path; the registry read is exercised by every test in both
  files (31/31 passing, confirmed above).
- Overlap check against this wave's sibling candidate: qw20260914060226-d7-01
  covers the same two files' (plus two others') `fakeThetaLibFs` declarations
  under a separate root cause and cites disjoint line ranges (b0304's
  `fakeThetaLibFs` is at 138-171, entirely after this finding's 66-87 range).

## Triage
verdict: confirmed — every excerpt and line range reproduces exactly (b0301:97-111 RegistryRow+REGISTRY_LOAD single-page read, b0304:66-69/73-87 RegistryRow+REGISTRY four-page join, registry-oracle.ts:21-28/31-45 canonical superset — the b0304/registry-oracle REGISTRY blocks are line-for-line identical apart from export/type-annotation and relative-path depth); the 6-file pattern grep reproduces (hits only in b0301/b0304); neither file imports registry-oracle.ts; both docs/bugs signatures read fixed (0.332.0/0.288.0) with 31/31 vitest green, coverage-matrix has 0 citations, and the sibling-overlap claim against qw20260914060226-d7-01 (fakeThetaLibFs at disjoint lines) checks out; not a duplicate of PTQ-0227 (disjoint fixture-harness lines) or PTQ-0239 (disjoint parse()-wrapper lines) or any open issue; the specific three codes named in the Observation/"Codes-on-page check" (unknown-frontmatter-field/out-of-range/unknown-methodology-value) are not actually the ones b0301 queries through REGISTRY_LOAD (that's UNKNOWN_BIND_ECHO_VALUE/MALFORMED_TOOL_LOOP_FIELD/MALFORMED_RESPOND_REPAIR_FIELD instead), but parseRegistry parses per-page table rows independently so REGISTRY_LOAD's single-page content is unconditionally a subset of the four-page REGISTRY regardless of which codes are named, and I independently confirmed all three actually-queried codes are present on code-registry-load.md too — same already-established D7 copy-paste-fixture/double class as confirmed PTQ-0237/PTQ-0222/PTQ-0250 (triage: claude-opus-5)
