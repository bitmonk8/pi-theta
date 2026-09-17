---
id: PTQ-0507
title: schema-body-unclosed-at-eof.test.ts redeclares RegistryRow/REGISTRY instead of importing tests/helpers/load-row-harness.ts's PARSE_REGISTRY/PARSE_REGISTRY_PATH
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/schema-body-unclosed-at-eof.test.ts:150-162
  - tests/helpers/load-row-harness.ts:31-53
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# schema-body-unclosed-at-eof.test.ts redeclares RegistryRow/REGISTRY instead of importing tests/helpers/load-row-harness.ts's PARSE_REGISTRY/PARSE_REGISTRY_PATH

## Observation
tests/schema-body-unclosed-at-eof.test.ts declares a local two-field
`RegistryRow` interface (`code`, `message`) and a local `REGISTRY` constant
built by reading `docs/spec_topics/diagnostics/code-registry-parse.md`
through `readFileSync`/`fileURLToPath` and parsing it with `parseRegistry`.
tests/helpers/load-row-harness.ts already exports the identical two-field
`RegistryRow` base interface and a pre-built `PARSE_REGISTRY` constant read
from the exact same single page via the exact same
`readFileSync`/`fileURLToPath`/`parseRegistry` construction, plus the
`PARSE_REGISTRY_PATH` string literal the reviewed file also hardcodes
separately as a relative `URL`. The reviewed file does not import from that
module.

## Evidence
tests/schema-body-unclosed-at-eof.test.ts:150-162 (re-read immediately before
filing):
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
  ),
) as RegistryRow[];
```

tests/helpers/load-row-harness.ts:31-53 — the canonical, already-exported
equivalent (same two base fields, same single page, same
`readFileSync`/`fileURLToPath`/`parseRegistry` construction):
```ts
/** A parsed row of the code registry, as `parseRegistry` yields it. */
export interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

/** A parsed row of `code-registry-parse.md`, with the four columns several `b02xx` files read. */
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

Search: `grep -n "helpers/load-row-harness\|helpers/registry-oracle" tests/schema-body-unclosed-at-eof.test.ts` → 0 hits; the file instead calls
`parseRegistry`/`registryMessage` directly against `../tools/code-registry/index.js` (its own line 5 import) and builds its own page read.

## Why this is a problem
`tests/helpers/load-row-harness.ts`'s own header states its purpose is to
centralise pieces "several `b02xx` files independently redeclared" — among
them "the same registry-message renderer" over the single
`code-registry-parse.md` page, which is exactly the read the reviewed file
performs again locally. The reviewed file's `RegistryRow` is not merely
similar but a strict structural subset (`code`/`message`) of the helper's
own base `RegistryRow`, and the page path, `readFileSync`, `fileURLToPath`
and `parseRegistry` calls are the identical construction, differing only in
the `../` vs `../../` relative depth the two files sit at. A change to the
page location, the `parseRegistry` signature, or the relative-URL
construction must be applied by hand in both places to stay in sync.

## Suggested direction (non-binding, optional)
`tests/helpers/load-row-harness.ts` already exports `PARSE_REGISTRY` and
`PARSE_REGISTRY_PATH` built from the identical single-page read the reviewed
file performs locally; importing them (as sibling file
tests/b0274-reserved-keyword-type-head-at-five-unwired-captures.test.ts
already does, aliasing to local names) is the existing target for this exact
shape.

## False-positive check
- Gate-pin check: tests/schema-body-unclosed-at-eof.test.ts does not match
  `*gate*.test.ts` or the named gate kin (closing-gate, cross-cutting-gates,
  rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate); the cited lines are a data-loading
  interface/constant pair, not a pinned count or inventory assertion.
- Recording-double check: `REGISTRY` is a static array parsed once from
  committed markdown; it records no calls and backs no "never called"
  witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -n "schema-body-unclosed-at-eof"
  docs/bugs/0245-unclosed-schema-body-at-eof-loads-clean.md` shows the file
  is this bug's own witness file, Status open/RED-by-design for the
  registry-row-addition groups named in the file's own header comment (group
  (R) and the refusal groups); that documented redness is about the MISSING
  `theta/parse/schema-body-unclosed` registry ROW, not about how the
  registry is READ, so it does not bear on this finding (which proposes no
  change to any assertion, `it()`, or expected value — only to where the
  `RegistryRow`/`REGISTRY` read is defined).
- coverage-matrix/bug-doc citation search: `grep -n
  "schema-body-unclosed-at-eof" docs/reference/coverage-matrix.md` → 0 hits.
  This finding proposes no merge, rename, or deletion of any test, `it()`,
  or `describe()` — only that an internal reader pair could be imported
  rather than redeclared.
- Coverage check: the claim is entirely about a repeated
  interface/constant DEFINITION, not a missing test path; the copy is
  exercised by the file's own passing/RED cells as documented in its header.
- Overlap/duplicate check: `grep -rl "schema-body-unclosed-at-eof"
  quality/intake quality/resolved` (excluding this shard's own manifest)
  found 3 pre-existing hits, all naming the file only for its unrelated
  `topKinds` helper duplication (a different function, cited at
  tests/schema-body-unclosed-at-eof.test.ts:292-295); none of those three
  cite lines 150-162 or the `RegistryRow`/`REGISTRY` pair, so this is a
  distinct, previously unfiled instance.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/schema-body-unclosed-at-eof.test.ts:150-162 and tests/helpers/load-row-harness.ts:31-53 (same two-field row shape, same single code-registry-parse.md page, same readFileSync/fileURLToPath/parseRegistry construction differing only in ../ depth); the file's two REGISTRY uses (lines 172 and 391) only pass it to the JS registryMessage, so the exported readonly ParseCodeRegistryRow[] PARSE_REGISTRY covers every need with no load-bearing difference; grep for helpers/load-row-harness|helpers/registry-oracle in the file → 0 hits, while 11 other test files (b0274/b0277/b0282/b0284/b0285, tools-entry-grammar-derivations-lockstep, uppercase-pi-tool-name-refusal, four tests/live cells) already import PARSE_REGISTRY, and the helper's own header names absorbing exactly this redeclaration as its purpose — D7 boilerplate-duplication class in tests/ only; carve-outs re-checked (not a gate file, static array not a recording double, bug 0245's documented red is about the missing registry ROW not the read, coverage-matrix 0 hits, no it()/describe touched); dedupe: none of the resolved registry-oracle/load-row PTQs (0215/0222/0237/0250/0260/0275/0311/0313/0327/0404/0409/0411/0412) cites this file, and the two sibling intake filings cite :292-295 topKinds and the live cell respectively (triage: claude-fable-5-1)
