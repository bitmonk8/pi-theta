---
id: PTQ-0429
title: b0272 and b0273 redeclare the PARSE_REGISTRY/PARSE_REGISTRY_PATH bundle that load-row-harness.ts already exports and that sibling b0274 already imports
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0272-enclosing-annotation-refusal-nested-head.test.ts:144-155
  - tests/b0273-query-result-error-side-unresolved-name.test.ts:122-133
  - tests/helpers/load-row-harness.ts:40-53
  - tests/b0274-reserved-keyword-type-head-at-five-unwired-captures.test.ts:1-13
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0272 and b0273 redeclare the PARSE_REGISTRY/PARSE_REGISTRY_PATH bundle that load-row-harness.ts already exports and that sibling b0274 already imports

## Observation
tests/b0272-enclosing-annotation-refusal-nested-head.test.ts and
tests/b0273-query-result-error-side-unresolved-name.test.ts each locally
declare a `RegistryRow` interface, a `REGISTRY_PATH` constant naming
`docs/spec_topics/diagnostics/code-registry-parse.md`, and a `REGISTRY`
constant built by `parseRegistry(readFileSync(...))` over that one page. Both
files already import `registryMessageOf`/`registryLineOf` (and, in b0273's
case, five further symbols) from `tests/helpers/load-row-harness.ts` in the
same import statement. That module already exports the identical bundle under
the names `ParseCodeRegistryRow`, `PARSE_REGISTRY_PATH`, and `PARSE_REGISTRY`.
Sibling file tests/b0274-reserved-keyword-type-head-at-five-unwired-captures.test.ts,
in the same review scope and the same bug-report file family, imports exactly
those two exports (aliased `as REGISTRY`/`as REGISTRY_PATH`) instead of
redeclaring them.

## Evidence
tests/b0272-enclosing-annotation-refusal-nested-head.test.ts:144-155:
```ts
interface RegistryRow {
  readonly code: string;
  readonly severity: string;
  readonly phase: string;
  readonly message: string;
}

const REGISTRY_PATH = "docs/spec_topics/diagnostics/code-registry-parse.md";

const REGISTRY = parseRegistry(
  readFileSync(fileURLToPath(new URL(`../${REGISTRY_PATH}`, import.meta.url)), "utf8"),
) as RegistryRow[];
```

tests/b0273-query-result-error-side-unresolved-name.test.ts:122-133 (the
same four fields, same path literal, same `parseRegistry(readFileSync(...))`
construction):
```ts
interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly message: string;
}

const REGISTRY_PATH = "docs/spec_topics/diagnostics/code-registry-parse.md";

const REGISTRY = parseRegistry(
  readFileSync(fileURLToPath(new URL(`../${REGISTRY_PATH}`, import.meta.url)), "utf8"),
) as RegistryRow[];
```

tests/helpers/load-row-harness.ts:40-53 — the module both files already
import from, exporting the same bundle under different names:
```ts
export interface ParseCodeRegistryRow extends RegistryRow {
  readonly severity: string;
  readonly phase: string;
}

/** The single-page diagnostics registry several `b02xx` load harnesses share. */
export const PARSE_REGISTRY_PATH = "docs/spec_topics/diagnostics/code-registry-parse.md";

/** `code-registry-parse.md`, parsed once. */
export const PARSE_REGISTRY: readonly ParseCodeRegistryRow[] = parseRegistry(
  readFileSync(
    fileURLToPath(new URL(`../../${PARSE_REGISTRY_PATH}`, import.meta.url)),
    "utf8",
  ),
) as ParseCodeRegistryRow[];
```

tests/b0274-reserved-keyword-type-head-at-five-unwired-captures.test.ts:1-13
— the sibling file in the same review scope importing that exact bundle
rather than redeclaring it:
```ts
import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import {
  expectCaptured,
  expectRows,
  loadRowFromBody,
  PARSE_REGISTRY as REGISTRY,
  PARSE_REGISTRY_PATH as REGISTRY_PATH,
  registered,
  registryLineOf,
  registryMessageOf,
  startPositions,
  type LoadRow,
} from "./helpers/load-row-harness";
```

## Why this is a problem
This is the "Boilerplate duplication" class: a four/five-field
`RegistryRow` interface plus a `REGISTRY_PATH` literal plus a
`parseRegistry(readFileSync(...))` construction over the same single page is
retyped in two files rather than imported, even though both files already
import other symbols from the exact module (`tests/helpers/load-row-harness.ts`)
that already exports this precise bundle under the names `ParseCodeRegistryRow`
/`PARSE_REGISTRY_PATH`/`PARSE_REGISTRY`, and even though a third file in the
same family, already reviewed in this same batch, demonstrates that importing
it (with a local alias) is straightforward and already done. A prior review
pass (PTQ-0206/PTQ-0207) fixed the `msg`/`line`/`LoadRow`/`theta`/`registered`
quintet in these same two files by converting them to imports from this
module, and PTQ-0207's own false-positive check explicitly carved the
`RegistryRow`/`REGISTRY` lines out of its evidence, attributing them to a
separate duplication track — but that separate track (PTQ-0215) documents a
different, four-page, six-field registry bundle used by unrelated files, not
this single-page, four-field bundle. The single-page bundle these two files
still hand-copy is the one `load-row-harness.ts` itself was built to
centralise (per that module's own header comment, "several `b02xx` files
independently redeclared the same ... registry-message renderer"), and it
remains duplicated at exactly these two sites after that centralisation
landed.

## Suggested direction (non-binding, optional)
tests/helpers/load-row-harness.ts already exports `PARSE_REGISTRY`,
`PARSE_REGISTRY_PATH`, and `ParseCodeRegistryRow`, and both files already
import other symbols from it in the same statement b0274 (in this same
family) already extends with an aliased import of exactly these two
constants.

## False-positive check
- Gate-pin: neither tests/b0272-enclosing-annotation-refusal-nested-head.test.ts
  nor tests/b0273-query-result-error-side-unresolved-name.test.ts matches
  `*gate*.test.ts` or the named kin; not applicable, and neither cited
  declaration is a pinned count or inventory — `REGISTRY`/`REGISTRY_PATH` are
  a data-loading constant pair, not an `expect` call.
- Recording-double: `REGISTRY`/`REGISTRY_PATH` read a static markdown-derived
  array; neither records a call or backs a "never called" witness, so the
  negative-witness carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0272-enclosing-annotation-refusal-swallows-nested-unresolved-head.md
  Status "fixed (0.269.0)"; docs/bugs/0273-propagated-result-error-side-unresolved-name-silent.md
  Status "fixed (0.267.0)". `npx vitest run
  tests/b0272-enclosing-annotation-refusal-nested-head.test.ts
  tests/b0273-query-result-error-side-unresolved-name.test.ts
  tests/b0274-reserved-keyword-type-head-at-five-unwired-captures.test.ts`
  passes 32/32 at HEAD; neither file is a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0272-enclosing-annotation-refusal-nested-head\|b0273-query-result-error-side-unresolved-name"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of either test file or any `it()`/`describe()`
  — only that two internal constants and one interface could be imported
  rather than redeclared — so no citation is affected.
- Overlap check against already-filed/resolved topics: PTQ-0207 (fixed) cites
  tests/b0272-...ts:168-242 and tests/b0273-...ts:139-217 for the
  `msg`/`line`/`LoadRow`/`theta`/`registered` quintet, and its own
  false-positive check states it excludes "the `RegistryRow`/`REGISTRY`
  declarations that precede `msg` in both files (b0272:139-150,
  b0273:114-125)" as belonging to a different candidate. PTQ-0215 (fixed,
  the only registry-oracle-harness-duplication ticket in the ledger) is that
  different candidate, but its own evidence is a four-page, six-field
  `RegistryRow`/`REGISTRY` bundle (`code-registry-{parse,load,runtime,host}.md`,
  fields `code`/`namespace`/`severity`/`phase`/`trigger`/`message`) cited at
  tests/annotation-nontype-text-refusal.test.ts,
  tests/schema-body-nontype-text-refusal.test.ts, and
  tests/b0449-reexport-chain-enum-unknown-variant.test.ts — a structurally
  different constant (four pages, not one; a `namespace`/`trigger` field
  pair the b0272/b0273 bundle lacks) at none of this finding's cited files.
  PTQ-0228 (fixed) is about a different, later residual
  (`startPositions`/`expectCaptured`/`expectRows`) in b0273 alone. No filed or
  rejected ticket's `locations` field cites the single-page `REGISTRY_PATH =
  "docs/spec_topics/diagnostics/code-registry-parse.md"` / `REGISTRY =
  parseRegistry(readFileSync(...))` pair at tests/b0272-...ts:144-155 or
  tests/b0273-...ts:122-133 specifically.
- Coverage check: the claim is entirely about a repeated constant/interface
  DEFINITION already available for import; every symbol cited is exercised by
  the tests in its own file (confirmed passing above), so no coverage claim
  is made.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: b0272:144-155 and b0273:122-133 each redeclare a four-field `RegistryRow` + `REGISTRY_PATH = "docs/spec_topics/diagnostics/code-registry-parse.md"` + `parseRegistry(readFileSync(...))` block (the candidate's b0273 excerpt wrongly shows a `namespace` field — the real copy is four-field, byte-identical to b0272, so the duplication is stronger than filed) while both files already import from tests/helpers/load-row-harness.ts, which exports the same bundle as `ParseCodeRegistryRow`/`PARSE_REGISTRY_PATH`/`PARSE_REGISTRY` (lines 40-53) and which 7 sibling tests (b0274/b0277/b0282/b0284/b0285/…) already import aliased; D7 boilerplate-duplication confined to tests/, no gate-pin/recording-double/coverage-matrix (0 hits) carve-out, both bug docs Status fixed, vitest 32/32 green; not a duplicate — PTQ-0207 explicitly carved these lines out and deferred them to PTQ-0215, whose `locations` cite only annotation-nontype-text-refusal/schema-body-nontype-text-refusal/b0449 (a four-page six-field bundle), PTQ-0228 covers b0273's startPositions/expectCaptured/expectRows residual only, and no same-wave sibling intake (b0278-b0279, b0281-b0284, b0046) cites b0272/b0273 — residual copies at uncited files are separate tickets per the PTQ-0219/0228/0409 precedent (triage: claude-fable-5-1)
