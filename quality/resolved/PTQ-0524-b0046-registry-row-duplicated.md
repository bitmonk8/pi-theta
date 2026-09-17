---
id: PTQ-0524
title: b0046 redeclares the RegistryRow interface and code-registry-parse.md read that tests/helpers/load-row-harness.ts already exports, from a file that already imports that same module
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0046-by-clause-undecided-inputs.test.ts:8-15
  - tests/b0046-by-clause-undecided-inputs.test.ts:119-130
  - tests/helpers/load-row-harness.ts:34-49
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0046 redeclares the RegistryRow interface and code-registry-parse.md read that tests/helpers/load-row-harness.ts already exports, from a file that already imports that same module

## Observation
tests/b0046-by-clause-undecided-inputs.test.ts imports `loadRow`, `registered`,
`expectDeclared`, `expectRows`, and `registryMessageOf` from
`./helpers/load-row-harness` (its own import block, lines 8-15), but does not
import that same module's `PARSE_REGISTRY` / `PARSE_REGISTRY_PATH` /
`ParseCodeRegistryRow` exports. Instead, a few lines later in the same file it
re-declares a local `RegistryRow` interface with the identical four fields and
re-parses the identical page (`code-registry-parse.md`) through the identical
`parseRegistry(readFileSync(...))` call the helper module already performs and
exports.

## Evidence

tests/b0046-by-clause-undecided-inputs.test.ts:8-15 — the file's own import of
the shared harness module:
```ts
import {
  loadRow,
  registered,
  expectDeclared as expectDeclaredRows,
  expectRows,
  registryMessageOf,
  type LoadRow,
} from "./helpers/load-row-harness";
```

tests/b0046-by-clause-undecided-inputs.test.ts:119-130 — the local
redeclaration, a few hundred lines later in the same file:
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

tests/helpers/load-row-harness.ts:34-49 — the already-exported equivalent,
covering the same page and the same four fields (`code`/`message` on
`RegistryRow`, `severity`/`phase` added by `ParseCodeRegistryRow`):
```ts
export interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

export interface ParseCodeRegistryRow extends RegistryRow {
  readonly severity: string;
  readonly phase: string;
}

export const PARSE_REGISTRY_PATH = "docs/spec_topics/diagnostics/code-registry-parse.md";

export const PARSE_REGISTRY: readonly ParseCodeRegistryRow[] = parseRegistry(
  readFileSync(
    fileURLToPath(new URL(`../../${PARSE_REGISTRY_PATH}`, import.meta.url)),
    "utf8",
  ),
) as ParseCodeRegistryRow[];
```

Exact search: `grep -n "REGISTRY\b" tests/b0046-by-clause-undecided-inputs.test.ts`
shows the local `REGISTRY` constant used at lines 128, 156 (`msg`'s
`registryMessageOf(REGISTRY, REGISTRY_PATH, ...)` call) and 226 (`REGISTRY.find`)
— every one of these three uses would be served identically by the module's
own `PARSE_REGISTRY`/`PARSE_REGISTRY_PATH`, which this file already imports
five other names from.

## Why this is a problem
This is the "Copy-paste fixtures/doubles" class: a fixture (the parsed
`code-registry-parse.md` rows plus the shape describing a row) is
re-implemented in this file even though the canonical helper for exactly that
read — `tests/helpers/load-row-harness.ts`'s `PARSE_REGISTRY` /
`PARSE_REGISTRY_PATH` / `ParseCodeRegistryRow` — already exists, is exported
under those names, and is already imported into this same file for its other
five exports (`loadRow`, `registered`, `expectDeclared`, `expectRows`,
`registryMessageOf`). The helper module's own header states it was created
specifically because "several `b02xx` files independently redeclared the same
... registry-message renderer" — this file draws on that centralisation for
everything except the one piece (the registry read itself) it retypes anyway.

## Suggested direction (non-binding, optional)
The two lines this file would need to add to its existing import from
`./helpers/load-row-harness` — `PARSE_REGISTRY` and `PARSE_REGISTRY_PATH` (or
aliased as `REGISTRY`/`REGISTRY_PATH` as the sibling
`tests/b0282-...test.ts` already does with those same two names) — already
carry the identical page and identical shape this file re-derives locally.

## False-positive check
- Gate-pin: `tests/b0046-by-clause-undecided-inputs.test.ts` does not match
  `*gate*.test.ts` or any named kin; nothing here asserts a pinned count or
  inventory, so the census/pin carve-out does not apply.
- Recording-double: the cited code is a registry-page parse and lookup, not a
  fake/double that records calls to witness a MUST-NOT; not applicable.
- docs/bugs/ signature search: `docs/bugs/0046-by-clause-undecided-inputs-load-silently.md`
  Status "fixed (0.253.0)"; `npx vitest run
  tests/b0046-by-clause-undecided-inputs.test.ts` → 16/16 passed at HEAD. Not a
  documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0046-by-clause-undecided-inputs" docs/reference/coverage-matrix.md` → 0
  hits. `docs/bugs/0262-unresolved-named-type-silent-at-nine-reference-positions.md`
  cites this file BY FILENAME (lines 94, 339, 396, 615) as a sibling witness,
  never by a specific `it()` name, and this finding proposes no merge, rename,
  or deletion of the file or any of its `describe`/`it` blocks or assertions —
  only that the already-imported helper module's own registry-read exports
  could be used in place of the locally retyped equivalent — so the citation
  is unaffected.
- Coverage check: the claim is entirely about a repeated fixture DEFINITION
  inside one file, not a missing test path; every code path cited is exercised
  by the file's own 16 passing tests.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: b0046:119-130 redeclares a four-field `RegistryRow` + `REGISTRY_PATH = "docs/spec_topics/diagnostics/code-registry-parse.md"` + `parseRegistry(readFileSync(...))` that is field-for-field and page-for-page the `ParseCodeRegistryRow`/`PARSE_REGISTRY_PATH`/`PARSE_REGISTRY` export at load-row-harness.ts:34-49 (added in the PTQ-0206/0207 fix commit 2594cd44, already imported by b0274/b0277/b0282/b0284/b0285 and 6 more files, b0282 aliasing them to exactly `REGISTRY`/`REGISTRY_PATH`); the file's own import block at :8-15 draws 6 names from that module, the local `REGISTRY` is used only at :128/:156/:226 and reads only code/message/severity/phase, so the helper header's "file whose registry setup is its own (read scope, page set)" carve-out does not apply; PTQ-0409's fix (8bad24ba) migrated LoadRow/rowOf/registered/expectRows/msg but neither cited nor ruled on this read, so this is a residual copy per the PTQ-0219/0228/0409 precedent (same-wave sibling d7-01-b0272-b0273 covers only b0272/b0273 and names b0046 as a separate ticket); not a gate file, bug 0046 Status fixed (0.253.0) with 16/16 green, coverage-matrix 0 hits, bug 0262 cites the filename only (triage: claude-fable-5-1)
