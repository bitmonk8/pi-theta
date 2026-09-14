---
id: PTQ-0222
title: b0333, b0334 and b0335 each redefine the RegistryRow/REGISTRY diagnostics-registry read that tests/helpers/registry-oracle.ts already centralises
lens: D7                     # D2 | D7 — the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0333-transitive-lib-reexport-edge.test.ts:78-100
  - tests/b0334-reexport-multisource-collision.test.ts:81-103
  - tests/b0335-own-import-shadows-own-declaration.test.ts:80-102
  - tests/helpers/registry-oracle.ts:20-45
sites: 4
fix_scope: cross-module      # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912091742
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# b0333, b0334 and b0335 each redefine the RegistryRow/REGISTRY diagnostics-registry read that tests/helpers/registry-oracle.ts already centralises

## Observation
tests/b0333-transitive-lib-reexport-edge.test.ts, tests/b0334-reexport-multisource-collision.test.ts and tests/b0335-own-import-shadows-own-declaration.test.ts each declare a local `RegistryRow` interface and a module-scope `REGISTRY` constant that reads the four sharded diagnostics-registry pages (`code-registry-{parse,load,runtime,host}.md`) through `parseRegistry` and joins them into one array. `tests/helpers/registry-oracle.ts` already exports a `RegistryRow`/`REGISTRY` pair built through the identical four-page read; its own header states it exists specifically to end this redeclaration (citing PTQ-0215). None of the three reviewed files imports it — each instead re-derives its own copy, differing from the shared export only in a narrower two-field `RegistryRow` view and the relative import-path depth (`../` vs the helper's `../../`).

## Evidence

tests/b0333-transitive-lib-reexport-edge.test.ts:78-100:
```ts
interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

// The live four-page sharded registry, read from the spec corpus and
// concatenated — the same input tests/reexport-chain-resolution.test.ts renders
// DIAG-4 messages from.
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

tests/b0334-reexport-multisource-collision.test.ts:81-103 — confirmed byte-identical to the excerpt above via `diff` (only the trailing doc-comment's cited sibling filename differs):
```ts
interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

// The live four-page sharded registry, read from the spec corpus and
// concatenated — the same input tests/b0333-transitive-lib-reexport-edge.test.ts
// renders DIAG-4 messages from.
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

tests/b0335-own-import-shadows-own-declaration.test.ts:80-102 — the same construction again, also confirmed byte-identical via `diff` apart from the doc-comment's cited filename:
```ts
interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

// The live four-page sharded registry, read from the spec corpus and
// concatenated — the same input tests/b0334-reexport-multisource-collision.test.ts
// renders DIAG-4 messages from, so no expected string in this file is written twice.
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

tests/helpers/registry-oracle.ts:20-45 — the canonical helper solving the identical problem, already exporting a superset-shaped `RegistryRow` (six fields, so each file's own narrower two-field local view is a strict subset the export already satisfies):
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

Pattern-wide search: `grep -rl "const REGISTRY = parseRegistry(" tests --include="*.test.ts" | wc -l` → 207 files still declare this construction locally. `grep -rl "from \"./helpers/registry-oracle\"" tests --include="*.test.ts"` → exactly 3 files import the shared export (tests/annotation-nontype-text-refusal.test.ts, tests/b0449-reexport-chain-enum-unknown-variant.test.ts, tests/schema-body-nontype-text-refusal.test.ts — the same three files PTQ-0215's own Evidence section originally cited). tests/b0333-transitive-lib-reexport-edge.test.ts, tests/b0334-reexport-multisource-collision.test.ts and tests/b0335-own-import-shadows-own-declaration.test.ts are not among the three migrated files.

## Why this is a problem
tests/helpers/registry-oracle.ts's own header states that `RegistryRow`/`REGISTRY` "were redeclared byte-for-byte (confirmed via `diff`) in several test files" and that the module "centralises that read only" so a file can import it "rather than [use] a locally re-parsed copy." The three reviewed files perform exactly that redeclaration: the `RegistryRow` interface and the `parseRegistry([...four pages...].map(readFileSync...).join("\n"))` construction are confirmed byte-for-byte identical across all three, and structurally a strict field-subset of the canonical export. All three files are recent additions (bug numbers 333-335, each `docs/bugs/` doc Status "fixed" at 0.302.0-0.304.0 — later than PTQ-0215's own fix), so the exact duplication the helper module was built to end is still being reproduced in newly-authored files, not only surviving in files that predate it.

## Suggested direction (non-binding, optional)
tests/helpers/registry-oracle.ts already exports a `REGISTRY`/`RegistryRow` pair covering every page and code these three files read, and three other files already import it in place of the identical local declaration; that existing, already-adopted import is the home the three reviewed files' own local read could join.

## False-positive check
- Gate-pin: none of the three files matches `*gate*.test.ts` or the named kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate, committed-fixture-parse-gate, registry-closed-set-corpus-gate); the cited lines are a data read, not a pinned-count or inventory assertion.
- Recording-double: `REGISTRY` is a static, parsed-once array; nothing here records a call or backs a "never called" assertion, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0333-transitive-lib-reexport-edge-fault-silent.md Status "fixed (0.302.0)"; docs/bugs/0334-reexport-closure-multi-source-name-collision-silent.md Status "fixed (0.303.0)"; docs/bugs/0335-thetalib-own-import-shadows-own-declaration-undiagnosed.md Status "fixed (0.304.0)". `npx vitest run tests/b0333-transitive-lib-reexport-edge.test.ts tests/b0334-reexport-multisource-collision.test.ts tests/b0335-own-import-shadows-own-declaration.test.ts` → 20 passed (20) at HEAD, so none is a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "b0333-transitive-lib-reexport-edge\|b0334-reexport-multisource-collision\|b0335-own-import-shadows-own-declaration" docs/reference/coverage-matrix.md` → 0 hits. `grep -rl` for the same three filenames across `docs/bugs/*.md`, excluding each file's own bug document → 0 hits. This finding proposes no merge, rename or deletion of any file or `it()`/`describe()` — only that the local `RegistryRow`/`REGISTRY` read could be replaced by the existing import — so no citation is affected.
- Established-convention check: this is not a self-documented, rationale-bearing project convention resisting reversal — the canonical module's own header names this exact redeclaration as the gap it was built to close (citing PTQ-0215 by number), and three other files already import it in place of the identical local declaration; the three reviewed files simply are not among them.
- Coverage check: the claim is about a repeated read/parse DEFINITION, not a missing test path; the registry read is exercised by every test in each file (20/20 passing, confirmed above).

## Triage
verdict: confirmed — every excerpt, line range, the byte-identical diff (only the doc-comment sentence differs), the 207/3 grep counts, the 6-vs-2-field superset relationship, and 20/20 vitest pass all reproduce exactly as claimed; genuine D7 boilerplate/copy-paste-fixture duplication of the already-centralised, already-3x-adopted tests/helpers/registry-oracle.ts, in locations PTQ-0215 never cited, with no gate-pin/convention/citation carve-out — though its "newly-authored, later than PTQ-0215's fix" framing is backwards (git log: b0333/b0334/b0335 committed 2026-08-28, registry-oracle.ts committed 2026-09-11, two weeks after not before), which does not change the outcome (triage: claude-opus-5)
