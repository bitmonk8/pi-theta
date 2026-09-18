---
id: PTQ-0804
title: enum-body-unclosed-at-eof.test.ts redeclares RegistryRow/REGISTRY instead of importing tests/helpers/load-row-harness.ts's PARSE_REGISTRY
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/enum-body-unclosed-at-eof.test.ts:174-186
  - tests/helpers/load-row-harness.ts:33-54
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# enum-body-unclosed-at-eof.test.ts redeclares RegistryRow/REGISTRY instead of importing tests/helpers/load-row-harness.ts's PARSE_REGISTRY

## Observation
tests/enum-body-unclosed-at-eof.test.ts declares a local two-field
`RegistryRow` interface (`code`, `message`) and a local `REGISTRY` constant
built by reading `docs/spec_topics/diagnostics/code-registry-parse.md`
through `readFileSync`/`fileURLToPath` and parsing it with `parseRegistry`.
tests/helpers/load-row-harness.ts already exports the identical two-field
`RegistryRow` base interface and a pre-built `PARSE_REGISTRY` constant read
from the exact same single page via the exact same
`readFileSync`/`fileURLToPath`/`parseRegistry` construction. The reviewed
file imports `parseRegistry`/`registryMessage` directly from
`../tools/code-registry/index.js` (its own line 5) and `parseDoc`/`topKinds`
from `./helpers/e2e-s1` (line 9), but nothing from `./helpers/load-row-
harness` or `./helpers/registry-oracle`.

## Evidence
tests/enum-body-unclosed-at-eof.test.ts:174-186 (re-read immediately before
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

tests/helpers/load-row-harness.ts:33-54 — the canonical, already-exported
equivalent (same two base fields, same single page, same
`readFileSync`/`fileURLToPath`/`parseRegistry` construction, differing only
in the `../` vs `../../` relative depth the two files sit at):
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

Search: `grep -n "helpers/load-row-harness\|helpers/registry-oracle"
tests/enum-body-unclosed-at-eof.test.ts` → 0 hits. `grep -n "^import" tests/
enum-body-unclosed-at-eof.test.ts` shows the file's only registry-related
import is the raw JS module `../tools/code-registry/index.js` (line 5), used
to hand-build the local read at lines 179-186.

## Why this is a problem
tests/helpers/load-row-harness.ts's own header states its purpose is to
centralise pieces "several `b02xx` files independently redeclared" — among
them the single-page `code-registry-parse.md` read and its message reader —
which is exactly the read the reviewed file performs again locally. The
reviewed file's `RegistryRow` is a strict structural subset (`code`/
`message`) of the helper's own base `RegistryRow`, and the page path,
`readFileSync`, `fileURLToPath` and `parseRegistry` calls are the identical
construction. A change to the registry page location, the `parseRegistry`
signature, or the relative-URL construction must be applied by hand in both
places to stay in sync. This is the same shape already confirmed once in
this repository for the file's own stated sibling — bug 0259's own header
comment in tests/enum-body-unclosed-at-eof.test.ts:1-40 says this file's
harness follows "the same shape as tests/schema-body-unclosed-at-eof.test.ts"
— and tests/schema-body-unclosed-at-eof.test.ts's byte-identical
RegistryRow/REGISTRY pair was the subject of resolved
quality/resolved/PTQ-0507-schema-body-unclosed-registry-oracle-reimplemented.md,
whose fix target was this same `tests/helpers/load-row-harness.ts` export
pair; that fix did not touch the present file, so the identical
reimplementation survives here under a different bug number.

## Suggested direction (non-binding, optional)
`tests/helpers/load-row-harness.ts` already exports `PARSE_REGISTRY` and
`PARSE_REGISTRY_PATH` built from the identical single-page read the reviewed
file performs locally; importing them (as PTQ-0507's fix did for
tests/schema-body-unclosed-at-eof.test.ts) is the existing target for this
exact shape.

## False-positive check
- Gate-pin check: tests/enum-body-unclosed-at-eof.test.ts does not match
  `*gate*.test.ts` or the named gate kin (closing-gate, cross-cutting-gates,
  rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate); the cited lines are a data-loading
  interface/constant pair, not a pinned count or inventory assertion.
- Recording-double check: `REGISTRY` is a static array parsed once from
  committed markdown; it records no calls and backs no "never called"
  witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -n "RegistryRow\|helpers/load-row-
  harness" docs/bugs/0259-unclosed-enum-variant-list-at-eof-loads-clean.md`
  → 0 hits; the bug document's own header text (reproduced in the file's
  top-of-file comment) is about the missing `theta/parse/enum-body-unclosed`
  registry ROW (a DIAG-2 addition, still red at HEAD), not about how the
  existing registry is READ, so no documented correct-reason-red rationale
  covers this local reimplementation.
- coverage-matrix/bug-doc citation search: `grep -n "enum-body-unclosed-at-
  eof" docs/reference/coverage-matrix.md docs/bugs/0259-unclosed-enum-
  variant-list-at-eof-loads-clean.md` → the bug doc names the file by
  filename for its cell count ("28 cells, whole-list"), never by this
  internal `RegistryRow`/`REGISTRY` pair; this finding proposes no change to
  any `it()`/`describe()` name, count, or assertion — only to where the
  read is defined — so no pinned witness is affected.
- Coverage check: the claim is entirely about a repeated
  interface/constant DEFINITION, not a missing test path; the copy is
  exercised by the file's own passing/RED cells as documented in its header.
- Duplicate/overlap check: `grep -rl "enum-body-unclosed-at-eof"
  quality/intake quality/resolved quality/issues` found 3 pre-existing
  hits — PTQ-0091 (an absent-claim-stale finding, unrelated), PTQ-0518
  (resolved, the `topKinds` helper duplication — a different function, cited
  at :319-322, already fixed by importing `topKinds` from
  `./helpers/e2e-s1`, confirmed present in the current import at line 9),
  and PTQ-0479 (a live-cell note-channel finding naming an unrelated file).
  None cites lines 174-186 or the `RegistryRow`/`REGISTRY` pair, so this is
  a distinct, previously unfiled instance of the pattern PTQ-0507 fixed for
  the sibling `schema-body-unclosed-at-eof.test.ts`.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/enum-body-unclosed-at-eof.test.ts:174-186 and tests/helpers/load-row-harness.ts:33-54 (whitespace-stripped diff of the two parseRegistry(readFileSync(fileURLToPath(new URL(...code-registry-parse.md)))) constructions differs only in the ../ vs ../../ depth and the cast name); the file's only two REGISTRY uses (:196 and :389) pass it straight to the JS registryMessage, so the exported readonly PARSE_REGISTRY (24 importing test files) — or registry-oracle.ts's readRegistry(["parse"]) (33 files), which is what the PTQ-0507 sibling fix actually used at tests/schema-body-unclosed-at-eof.test.ts:149 — covers every need with no load-bearing difference; stated searches reproduce (no load-row-harness/registry-oracle import, docs/bugs/0259 RegistryRow → 0, coverage-matrix → 0, bug doc names the file only for its 28-cell count); D7 boilerplate-duplication class, both locations under tests/, carve-outs re-checked (not a gate file, static array not a recording double, bug 0259's documented red is the missing registry ROW not the read, no it()/describe() touched); dedupe: no open PTQ cites this file's registry read (PTQ-0091/0518 resolved and unrelated, PTQ-0479 unrelated, PTQ-0777 targets tests/live/live-production-acceptance.test.ts), and per-file filing of this shape is the store's established convention (PTQ-0507 et al.); the candidate's one inaccuracy — that PTQ-0507's fix targeted load-row-harness's PARSE_REGISTRY — lies in the non-binding direction only (triage: claude-fable-5-1)
