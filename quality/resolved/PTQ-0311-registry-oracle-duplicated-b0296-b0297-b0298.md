---
id: PTQ-0311
title: b0296, b0297-bind-context-bind-model-nonscalar, and b0298 each rebuild the registry-page read and DIAG-4 anchor test that tests/helpers/registry-oracle.ts already centralises
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0296-mode-nonscalar-value-collapse.test.ts:70-84
  - tests/b0296-mode-nonscalar-value-collapse.test.ts:193-220
  - tests/b0297-bind-context-bind-model-nonscalar.test.ts:94-108
  - tests/b0297-bind-context-bind-model-nonscalar.test.ts:372-399
  - tests/b0298-system-nonscalar-silent-drop-and-prompt-mode-suppression.test.ts:80-103
  - tests/b0298-system-nonscalar-silent-drop-and-prompt-mode-suppression.test.ts:208-236
  - tests/helpers/registry-oracle.ts:20-45
sites: 7                     # count of occurrences cited in Evidence
fix_scope: cross-module       # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260914060226
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-14
---

# b0296, b0297-bind-context-bind-model-nonscalar, and b0298 each rebuild the registry-page read and DIAG-4 anchor test that tests/helpers/registry-oracle.ts already centralises

## Observation
Three sibling frontmatter-field bug-report test files each declare a local
`RegistryRow` interface plus one or two module-scope consts
(`REGISTRY_LOAD`, and in b0298 also `REGISTRY_PARSE`) that read a single
diagnostics-registry page straight off disk through `parseRegistry` —
`code-registry-load.md` in b0296 and b0297-bind-context-bind-model-nonscalar,
both pages in b0298 — instead of importing `tests/helpers/registry-oracle.ts`'s
already-exported `REGISTRY`, which parses all four sharded registry pages
(`code-registry-{parse,load,runtime,host}.md`) through the same `parseRegistry`
call and is a structural superset of each file's own four-field
`RegistryRow`. Built on top of that local read, each file also carries its own
standalone `it("DIAG-4: code-registry-load.md carries <code> …")` test whose
body — message-definedness, exact-template-equality, row-definedness,
severity, phase — is the same five-assertion sequence in all three files,
differing only in the interpolated code name and per-code prose. None of the
three files imports anything from `tests/helpers/registry-oracle.ts`.

## Evidence

tests/b0296-mode-nonscalar-value-collapse.test.ts:70-84 — the local
declaration:
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

tests/b0297-bind-context-bind-model-nonscalar.test.ts:94-108 — the same
declaration, byte-identical apart from whitespace:
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

tests/b0298-system-nonscalar-silent-drop-and-prompt-mode-suppression.test.ts:80-103
— the same `RegistryRow` shape, repeated for TWO pages in one file (the
`REGISTRY_PARSE` block is the identical pattern applied a second time before
`REGISTRY_LOAD`):
```ts
interface RegistryRow {
  readonly code: string;
  readonly message: string;
  readonly severity: string;
  readonly phase: string;
}

const REGISTRY_PARSE_PATH = "docs/spec_topics/diagnostics/code-registry-parse.md";

const REGISTRY_PARSE = parseRegistry(
  readFileSync(
    fileURLToPath(new URL(`../${REGISTRY_PARSE_PATH}`, import.meta.url)),
    "utf8",
  ),
) as RegistryRow[];

const REGISTRY_LOAD_PATH = "docs/spec_topics/diagnostics/code-registry-load.md";

const REGISTRY_LOAD = parseRegistry(
  readFileSync(
    fileURLToPath(new URL(`../${REGISTRY_LOAD_PATH}`, import.meta.url)),
    "utf8",
  ),
) as RegistryRow[];
```

tests/helpers/registry-oracle.ts:20-45 — the canonical helper, already
solving the identical problem for a strict superset of pages (both codes
every one of the three files looks up — `theta/load/unknown-mode-value`,
`theta/load/missing-mode`, `theta/load/unknown-bind-context-value`,
`theta/parse/system-on-prompt-mode`, `theta/load/malformed-system-field` —
live on `code-registry-load.md` or `code-registry-parse.md`, both included in
this four-page union):
```ts
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

The DIAG-4 anchor test built on top of each local read is the same
five-assertion sequence in all three files. tests/b0296-mode-nonscalar-value-collapse.test.ts:193-220:
```ts
  it(`DIAG-4: code-registry-load.md carries ${UNKNOWN_MODE_VALUE} with the normative Message, severity E, phase load`, () => {
    const message = registryMessage(REGISTRY_LOAD, UNKNOWN_MODE_VALUE) as
      | string
      | undefined;
    expect(message, `DIAG-4 anchor: ${REGISTRY_LOAD_PATH} must carry the Message row for ${UNKNOWN_MODE_VALUE}`).toBeDefined();
    expect(message, "DIAG-4 — the Message column is normative character-for-character…").toBe(UNKNOWN_MODE_VALUE_TEMPLATE);
    const row = REGISTRY_LOAD.find((r) => r.code === UNKNOWN_MODE_VALUE);
    expect(row, `the parsed registry must hold a structured row for ${UNKNOWN_MODE_VALUE}`).toBeDefined();
    expect((row as RegistryRow).severity, "severity E — a present-but-bad mode: denies registration").toBe("E");
    expect((row as RegistryRow).phase, "phase load…").toBe("load");
  });
```
tests/b0297-bind-context-bind-model-nonscalar.test.ts:372-399 repeats this
exact five-step shape (message defined → message equals template → row
defined → severity `"E"` → phase `"load"`) for `UNKNOWN_BIND_CONTEXT_VALUE`,
and tests/b0298-system-nonscalar-silent-drop-and-prompt-mode-suppression.test.ts:208-236
repeats it again for `MALFORMED_SYSTEM_FIELD`; the three bodies are
structurally identical, differing only in the interpolated code/template
identifiers and the reason-string prose.

Exact search: `grep -rn "interface RegistryRow" tests --include="*.test.ts"`
returns 100+ files (truncated at the tool's match limit) confirming a
locally-declared `RegistryRow` is a common shape across the suite; narrowing
to the three files in this review's scope, none of the three appears in
`grep -rl "registry-oracle" tests --include="*.test.ts"` (0 hits for all
three), confirming none imports the canonical module.

## Why this is a problem
This is the "Copy-paste fixtures" class: `tests/helpers/registry-oracle.ts`'s
own header states its purpose is centralising exactly this read ("`RegistryRow`
and the `REGISTRY` load it backs … were redeclared byte-for-byte … in several
test files. This module centralises that read only"), and its four-page
`REGISTRY` is a structural superset of the narrower, single-or-two-page
`RegistryRow`/`REGISTRY_LOAD`(/`REGISTRY_PARSE`) each of these three files
independently reconstructs via its own `readFileSync`/`fileURLToPath`/
`parseRegistry` call chain. Every code any of the three files looks up lives
on a page the canonical union already includes, so the helper "clearly
could" serve all three in full. Layered on top, the row-assertion test body
consuming that local read — checking message-definedness,
exact-template-equality, row-definedness, severity, and phase — is the same
five-step sequence copied into each file rather than built once as a shared,
parameterised assertion.

## Suggested direction (non-binding, optional)
`tests/helpers/registry-oracle.ts` already exports a `REGISTRY` covering
every page and code these three files read; it is the existing home the
local `RegistryRow`/`REGISTRY_LOAD`/`REGISTRY_PARSE` declarations in each
file already sit beside the equivalent import for in this repository's own
established convention (mirrored, for the same helper, in
tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts).

## False-positive check
- Gate-pin check: none of the three files (b0296-mode-nonscalar-value-collapse,
  b0297-bind-context-bind-model-nonscalar,
  b0298-system-nonscalar-silent-drop-and-prompt-mode-suppression) matches
  `*gate*.test.ts` or the named kin (closing-gate, cross-cutting-gates,
  rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate); nothing cited here is a pinned count or
  inventory assertion.
- Recording-double check: `REGISTRY_LOAD`/`REGISTRY_PARSE` are static,
  parsed-once arrays read for their row content; nothing here records a call
  to back a "never called" witness, so the negative-witness carve-out does
  not apply.
- docs/bugs/ signature search: docs/bugs/0296-mode-nonscalar-value-collapses-to-missing-mode.md
  — Status "fixed (0.329.0)"; docs/bugs/0297-bind-context-nonscalar-silently-registers.md
  — Status "fixed (0.330.0)"; docs/bugs/0298-system-nonscalar-silent-drop-and-prompt-mode-suppression.md
  — Status "fixed (0.300.0)". `npx vitest run` on all three files reproduces
  9/9, 12/12, and 8/8 passing at HEAD, so none is a documented correct-reason
  red, and none of the three bug documents discusses or requires a specific
  implementation of the registry read or the DIAG-4 test body.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0296-mode-nonscalar-value-collapse\|b0297-bind-context-bind-model-nonscalar\|b0298-system-nonscalar-silent-drop"
  docs/reference/coverage-matrix.md` → 0 hits. `grep -rl` for each file name
  against docs/bugs/ returns only each file's own bug document. This finding
  proposes no merge, rename, or deletion of any test or cell — only that the
  local registry-page read and its dependent DIAG-4 test could source rows
  from the existing shared `REGISTRY` — so no witness-list citation is
  disturbed.
- Overlap check against already-filed/resolved topics: PTQ-0237 ("b0275
  rebuilds the diagnostics-registry oracle that tests/helpers/registry-oracle.ts
  already centralises") is the closest prior finding and is confirmed/fixed,
  but its own `locations` and Evidence are confined to
  tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts (now
  migrated, confirmed by that file's current import of `REGISTRY` from
  `./helpers/registry-oracle`) and name only b0275/b0280/three other files as
  pattern context, never b0296, b0297-bind-context-bind-model-nonscalar, or
  b0298. PTQ-0227 ("b0296, b0297, b0298, and b0301 each redefine the same
  doc()/expectRow/expectNoRow…harness") is fixed and covers a disjoint
  concern in these same three files (the fixture-builder/assertion-helper
  trio now imported from `tests/helpers/e2e-s1.ts`, confirmed present in all
  three files' current imports) at different line ranges than the ones cited
  here; its own Evidence and False-positive check explicitly state it
  excludes the `RegistryRow`/`REGISTRY` declarations. No other listed PTQ or
  rejection names these three files' registry-page read or DIAG-4 test body.
- Coverage check: the claim is about a repeated read/parse/assert
  DEFINITION, not a missing test path; the registry read and the DIAG-4 test
  are exercised by the passing tests in each of the three files.

## Triage
verdict: confirmed — every excerpt/line range reproduces (byte-identical RegistryRow/REGISTRY_LOAD/REGISTRY_PARSE across all three files, structurally identical DIAG-4 five-assertion body), all four looked-up codes verified present on the load/parse pages the canonical registry-oracle.ts REGISTRY already joins, grep confirms none of the three files imports registry-oracle, docs/bugs statuses (fixed 0.329.0/0.330.0/0.300.0) and vitest 9/9+12/12+8/8 green rule out a documented-red carve-out, coverage-matrix.md has 0 hits, and this is disjoint from PTQ-0227 (same three files, different doc()/expectRow/expectNoRow root cause that explicitly excludes RegistryRow) and from this wave's sibling b0301/b0304 candidate — genuine, currently-unfixed D7 copy-paste-fixture duplication (triage: claude-opus-5)
