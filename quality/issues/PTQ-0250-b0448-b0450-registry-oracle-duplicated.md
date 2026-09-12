---
id: PTQ-0250
title: b0448 and b0450 rebuild the diagnostics-registry read that tests/helpers/registry-oracle.ts already centralises, unlike their same-commit sibling b0449
lens: D7                     # D2 | D7 — the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0448-imported-non-object-ctor.test.ts:81-90
  - tests/b0450-imported-enum-system-param.test.ts:70-85
  - tests/helpers/registry-oracle.ts:21-45
  - tests/b0449-reexport-chain-enum-unknown-variant.test.ts:28-29
sites: 4                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912112713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# b0448 and b0450 rebuild the diagnostics-registry read that tests/helpers/registry-oracle.ts already centralises, unlike their same-commit sibling b0449

## Observation
tests/b0448-imported-non-object-ctor.test.ts and
tests/b0450-imported-enum-system-param.test.ts each declare, module scope, a
local `RegistryRow` interface and a `REGISTRY` constant built by calling the
real `parseRegistry` over one or two of the sharded
`docs/spec_topics/diagnostics/code-registry-*.md` pages read with
`readFileSync`/`fileURLToPath`. `tests/helpers/registry-oracle.ts` already
exports a `REGISTRY` built the same way — `parseRegistry` over all four
sharded pages, joined — and their sibling
tests/b0449-reexport-chain-enum-unknown-variant.test.ts, added in the same
originating commit as both files, already imports that export instead of
reading the pages itself. Both codes b0448 and b0450 look up
(`theta/parse/unresolved-named-type`, `theta/load/system-interp-bad-field`,
`theta/parse/system-interp-bad-field`) live on pages the canonical `REGISTRY`'s
four-page union already includes.

## Evidence
tests/b0448-imported-non-object-ctor.test.ts:81-90 — a local 2-field
`RegistryRow` and a `REGISTRY` read from one page only:
```ts
interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

const REGISTRY_PAGE = "docs/spec_topics/diagnostics/code-registry-parse.md";

const REGISTRY = parseRegistry(
  readFileSync(fileURLToPath(new URL(`../${REGISTRY_PAGE}`, import.meta.url)), "utf8"),
) as RegistryRow[];
```

tests/b0450-imported-enum-system-param.test.ts:70-85 — the same 2-field
`RegistryRow` and a `REGISTRY` read from two pages, joined:
```ts
interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

/** The live sharded registry — the parse + load pages this file oracles against. */
const REGISTRY = parseRegistry(
  ["code-registry-parse.md", "code-registry-load.md"]
    .map((page) =>
      readFileSync(
        fileURLToPath(new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url)),
        "utf8",
      ),
    )
    .join("\n"),
) as RegistryRow[];
```

tests/helpers/registry-oracle.ts:21-45 — the canonical helper solving the
identical problem, superset-shaped (a 6-field `RegistryRow` a 2-field
consumer reads without change) and reading all four pages a 1- or 2-page
local read is a strict subset of:
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

tests/b0449-reexport-chain-enum-unknown-variant.test.ts:28-29 — the sibling,
added in the same commit as b0448 and b0450, that already imports the
canonical export instead of reading the pages itself:
```ts
import { parseDeps } from "./helpers/e2e-s1";
import { REGISTRY } from "./helpers/registry-oracle";
```

Exact search confirming the scope of the local read within this wave's
briefed files: `grep -n "parseRegistry(" tests/b0445-*.test.ts
tests/b0446-*.test.ts tests/b0447-*.test.ts tests/b0448-*.test.ts
tests/b0449-*.test.ts tests/b0450-*.test.ts tests/b0451-*.test.ts` → 2 hits,
tests/b0448-imported-non-object-ctor.test.ts:88 and
tests/b0450-imported-enum-system-param.test.ts:76; b0445, b0446, b0447 and
b0451 never touch the diagnostics registry.

## Why this is a problem
`git log --diff-filter=A` shows tests/b0448-imported-non-object-ctor.test.ts,
tests/b0449-reexport-chain-enum-unknown-variant.test.ts and
tests/b0450-imported-enum-system-param.test.ts were all three added together
in commit fd0704e6 ("fix(bug-0448, bug-0449, bug-0450)…", 2026-09-05), each
with its own byte-for-byte-shaped local `RegistryRow`/`REGISTRY` read.
Commit 2594cd44 ("quality: qw20260911104855 fix tests__p1", 2026-09-11)
subsequently created tests/helpers/registry-oracle.ts and edited
tests/b0449-reexport-chain-enum-unknown-variant.test.ts (27 lines changed) to
import `REGISTRY` from it, but left tests/b0448-imported-non-object-ctor.test.ts
and tests/b0450-imported-enum-system-param.test.ts — b0449's same-commit,
same-shape siblings — untouched; neither file appears in that commit's
changed-file list. This is the same "counted but not migrated" residual this
store has already confirmed once for this exact helper on a different file
family (PTQ-0237, for tests/b0275-…/b0280-…/grandchild-callee-drop-…), and
resolved PTQ-0215's own original evidence already cited b0449 as one of the
three sites its fix migrated — b0448 and b0450 are a second, disjoint
residual pair of the same already-recognised gap, not a new root cause.

## Suggested direction (non-binding, optional)
tests/helpers/registry-oracle.ts is already the home this exact bundle was
extracted to, and b0449 — added in the same commit as both cited files —
already reads it in full rather than re-declaring the pages.

## False-positive check
- Gate-pin: neither tests/b0448-imported-non-object-ctor.test.ts nor
  tests/b0450-imported-enum-system-param.test.ts matches `*gate*.test.ts` or
  the named kin; the cited `REGISTRY` constant is a static parsed array, not
  a pinned-count or inventory assertion.
- Recording-double: `REGISTRY` is a read-once, parsed-from-markdown array; it
  records no calls and backs no "never called" witness, so the
  negative-witness carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0448-imported-non-object-ctor-mints-silently.md
  and docs/bugs/0450-imported-enum-system-param-unjudged.md both read
  "Status: fixed" (0.453.0 and 0.455.0). `npx vitest run
  tests/b0448-imported-non-object-ctor.test.ts
  tests/b0450-imported-enum-system-param.test.ts` → 2 files, 20 tests, all
  passing at HEAD, so neither is a documented correct-reason red and neither
  bug document states a rationale for a per-file registry read.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0448-imported-non-object-ctor\|b0450-imported-enum-system-param"
  docs/reference/coverage-matrix.md` → 0 hits; `grep -rl` for either filename
  across `docs/bugs/*.md` (excluding each file's own bug document) → 0 hits.
  This finding proposes no merge, rename or deletion of either file or any
  `it()`/`describe()` inside them — only that the local `RegistryRow`/
  `REGISTRY` read could import the existing export instead — so no citation
  is affected.
- Overlap check against resolved PTQ-0215 and open PTQ-0237: PTQ-0215's
  `locations` name three files (annotation-nontype-text-refusal.test.ts,
  schema-body-nontype-text-refusal.test.ts, and this same
  b0449-reexport-chain-enum-unknown-variant.test.ts, since migrated);
  PTQ-0237's `locations` name a disjoint b0275/b0280/grandchild-callee-drop
  family. Neither cites tests/b0448-imported-non-object-ctor.test.ts or
  tests/b0450-imported-enum-system-param.test.ts, so this is a distinct,
  unremediated occurrence of the same root cause rather than a duplicate of
  either finding's closed scope — the same "counted but not cited" shape this
  store's own triage has already treated as separately filable (cf. PTQ-0220
  confirmed against PTQ-0213's narrower scope).
- Coverage check: the claim is about a repeated read/parse DEFINITION, not a
  missing test path; the registry read in both files is exercised by every
  test in its own file (20/20 passing, confirmed above).

## Triage
verdict: confirmed — every excerpt/line range reproduces exactly (b0448:81-90, b0450:70-85, registry-oracle.ts:21-45, b0449:28-29), the 7-file parseRegistry( grep re-run matches (2 hits: b0448:88, b0450:76), git log confirms all three files added together in fd0704e6 with only b0449 migrated to the helper in 2594cd44 (27 lines changed; b0448/b0450 absent from that commit's file list), all three cited codes verified present on the parse/load pages the four-page REGISTRY already unions, both docs/bugs read fixed (0.453.0/0.455.0) with 20/20 vitest passing, coverage-matrix/cross-bug-doc citation searches return 0 hits as claimed, and it is disjoint from resolved PTQ-0215 (migrated sites: annotation-nontype/schema-body/b0449) and open PTQ-0237 (b0275/b0280/grandchild-callee family) — a second, non-duplicate residual of the same already-twice-confirmed (PTQ-0222, PTQ-0237) gap, genuine D7 boilerplate duplication confined to tests/ (triage: claude-opus-5)
