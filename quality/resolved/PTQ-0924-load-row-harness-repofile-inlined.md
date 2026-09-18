---
id: PTQ-0924
title: load-row-harness.ts retypes corpus-reader.ts's exported repoFile path resolver inline instead of importing it
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/helpers/corpus-reader.ts:18-20
  - tests/helpers/load-row-harness.ts:46-54
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918092852
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# load-row-harness.ts retypes corpus-reader.ts's exported repoFile path resolver inline instead of importing it

## Observation
`tests/helpers/corpus-reader.ts` exports `repoFile`, a one-line function that
resolves a repo-relative path to an absolute path via
`fileURLToPath(new URL(`../../${rel}`, import.meta.url))`. `tests/helpers/load-row-harness.ts`
builds its `PARSE_REGISTRY` constant by inlining the identical expression
(`fileURLToPath(new URL(`../../${PARSE_REGISTRY_PATH}`, import.meta.url))`)
followed by `readFileSync(..., "utf8")`, rather than importing `repoFile` from
the sibling helper module it sits beside in `tests/helpers/`.

## Evidence

`tests/helpers/corpus-reader.ts:18-20` (re-read immediately before filing):
```ts
/** A repo-relative path (e.g. `docs/spec_topics/foo.md`), resolved to an absolute path. */
export const repoFile = (rel: string): string =>
  fileURLToPath(new URL(`../../${rel}`, import.meta.url));
```

`tests/helpers/load-row-harness.ts:46-54` (re-read immediately before filing):
```ts
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

The two `fileURLToPath(new URL(`../../${…}`, import.meta.url))` expressions
are byte-identical apart from the interpolated variable name (`rel` vs
`PARSE_REGISTRY_PATH`); `load-row-harness.ts` also independently repeats
`corpus-reader.ts`'s `readFileSync(path, "utf8")` read call rather than using
`corpus-reader.ts`'s exported `corpus`/`readCorpus` readers. Both files
already import from `node:fs`/`node:url` (`load-row-harness.ts:20-21`)
directly rather than through `corpus-reader.ts`, and `load-row-harness.ts`
imports nothing from `./corpus-reader` today (its only intra-helpers import
is `parseDoc` from `./e2e-s1`, `load-row-harness.ts:25`).

## Why this is a problem
`tests/helpers/corpus-reader.ts` exists specifically so that repo-relative
path resolution for a committed file is defined once (its own header states
it centralises a pattern "redefined, byte-for-byte apart from the bug number
named inside the thrown message, in several `b02xx`/`b04xx` spec-gate test
files"). `load-row-harness.ts` sits in the same `tests/helpers/` directory
and needs exactly the path-resolution half of that same mechanism to locate
`docs/spec_topics/diagnostics/code-registry-parse.md`, but retypes the
expression rather than importing `repoFile`. A future change to how a
repo-relative path is resolved (e.g. a different `import.meta.url` base, or a
`../../` depth change if either file moves) would have to be applied at both
sites by hand.

## Suggested direction (non-binding, optional)
`load-row-harness.ts` importing `repoFile` from `./corpus-reader` for its
`PARSE_REGISTRY` path resolution is the natural target the existing export
already names; the fix stage owns whether the surrounding `readFileSync` call
is also folded into a `corpus-reader.ts` reader.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin; `load-row-harness.ts` is a `tests/helpers/` module, not a pinned-count
  or inventory-asserting test file.
- Recording-double check: `repoFile`/`PARSE_REGISTRY`'s construction records
  no calls and backs no "never called" witness; not applicable.
- docs/bugs/ signature search: `grep -rl "PARSE_REGISTRY\|repoFile" docs/bugs/*.md`
  → 0 hits; no open bug document discusses this duplication.
- coverage-matrix/bug-doc citation search: `grep -n "load-row-harness\|corpus-reader"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of either module or any exported member, only
  that the duplicated path-resolution expression could be imported rather
  than retyped.
- Coverage-drift check: the claim is about a repeated expression definition,
  not a missing test path; `PARSE_REGISTRY` is read by every `b02xx` file
  that imports `registryMessageOf`/`registryLineOf` from `load-row-harness.ts`.
- Prior-filing overlap search: the resolved `PTQ-0208`/`PTQ-0395`/`PTQ-0540`/
  `PTQ-0571`/`PTQ-0587`/`PTQ-0598`/`PTQ-0683` all track bug-witness `*.test.ts`
  files that redeclare `repoFile`/`readCorpus` locally instead of importing
  from `tests/helpers/corpus-reader.ts`; none of them names
  `tests/helpers/load-row-harness.ts` as a subject file, and no open/resolved
  ticket in the provided list cites `PARSE_REGISTRY` or this exact site.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/helpers/corpus-reader.ts:18-20 and tests/helpers/load-row-harness.ts:46-54, and the `fileURLToPath(new URL(\`../../${…}\`, import.meta.url))` expression at :51 is byte-identical to `repoFile` bar the interpolated name; both copies are live (`repoFile` has 12 external call sites, `PARSE_REGISTRY` 15 consumer files), corpus-reader.ts imports only node:fs/node:url so importing `./corpus-reader` from load-row-harness.ts creates no cycle, and both were born in the same fix commit (2594cd44, 2026-09-11) so this is same-wave drift, not a design choice; stated greps reproduce (docs/bugs `PARSE_REGISTRY\|repoFile` → 0, coverage-matrix → 0); both sites under tests/, not a gate file, no recording-double/red-test carve-out, D7 boilerplate-duplication class with a mechanical one-import fix; not a duplicate — every open/resolved PTQ citing load-row-harness.ts names it as the canonical target rather than a subject, and the repoFile family (0208/0395/0540/0571/0587/0598/0683) covers *.test.ts files only; fixer note: the identical inline resolver also sits at tests/helpers/category1-clause-oracle.ts:143 and tests/helpers/registry-oracle.ts:38-39 (literal-prefix form), uncounted here — fold in at acceptance (triage: claude-fable-5-1)
