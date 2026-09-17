---
id: PTQ-0641
title: nested-tools-entry-containment.test.ts re-derives the tests/helpers/registry-oracle.ts REGISTRY read instead of importing it
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/nested-tools-entry-containment.test.ts:89-105
  - tests/helpers/registry-oracle.ts:20-38
  - tests/tools-entry-containment.test.ts:68-84
  - tests/theta-callable-call-arity.test.ts:63-79
sites: 3                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# nested-tools-entry-containment.test.ts re-derives the tests/helpers/registry-oracle.ts REGISTRY read instead of importing it

## Observation
`tests/nested-tools-entry-containment.test.ts` declares its own
`REGISTRY_TEXT` constant that reads `code-registry-parse.md` and
`code-registry-load.md` through `readFileSync`/`fileURLToPath`, joins them,
and parses the join through `parseRegistry` into a local `RegistryRow[]`
called `REGISTRY`. `tests/helpers/registry-oracle.ts` already exports a
`readRegistry(shards)` function built the same way — same
`readFileSync`/`fileURLToPath`/`parseRegistry`/`.join("\n")` chain — that
`readRegistry(["parse", "load"])` would answer with the identical two-page
array this file needs; the module also exports a wider default `REGISTRY`
(all four shards) as a plain constant. `nested-tools-entry-containment.test.ts`
imports neither. The identical two-page `REGISTRY_TEXT`/`REGISTRY` block is
also declared byte-for-byte in two further files.

## Evidence
`tests/nested-tools-entry-containment.test.ts:89-105`:
```ts
const REGISTRY_TEXT = ["code-registry-parse.md", "code-registry-load.md"]
  .map((page) =>
    readFileSync(
      fileURLToPath(
        new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url),
      ),
      "utf8",
    ),
  )
  .join("\n");

interface RegistryRow {
  code: string;
  message: string;
}

const REGISTRY = parseRegistry(REGISTRY_TEXT) as RegistryRow[];
```

`tests/helpers/registry-oracle.ts:20-38` — the canonical helper solving the
identical problem (parse the named registry shards into one `RegistryRow[]`
through the real `parseRegistry`), already parameterised so a two-shard
subset is a one-line call:
```ts
/** Read only the requested shards, preserving page-specific registry oracles. */
export function readRegistry(
  shards: readonly ("parse" | "load" | "runtime" | "host")[],
): readonly RegistryRow[] {
  return parseRegistry(
    shards
      .map((shard) =>
        readFileSync(
          fileURLToPath(
            new URL(`../../docs/spec_topics/diagnostics/code-registry-${shard}.md`, import.meta.url),
          ),
          "utf8",
        ),
      )
      .join("\n"),
  ) as RegistryRow[];
}

/** The live four-page sharded registry — the input tests/code-registry.test.ts reconciles. */
export const REGISTRY: readonly RegistryRow[] = readRegistry(["parse", "load", "runtime", "host"]);
```

`tests/tools-entry-containment.test.ts:68-84` — byte-identical to the first
excerpt (`diff <(sed -n '89,98p' tests/nested-tools-entry-containment.test.ts)
<(sed -n '68,77p' tests/tools-entry-containment.test.ts)` produces no output):
```ts
const REGISTRY_TEXT = ["code-registry-parse.md", "code-registry-load.md"]
  .map((page) =>
    readFileSync(
      fileURLToPath(
        new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url),
      ),
      "utf8",
    ),
  )
  .join("\n");

interface RegistryRow {
  code: string;
  message: string;
}

const REGISTRY = parseRegistry(REGISTRY_TEXT) as RegistryRow[];
```

`tests/theta-callable-call-arity.test.ts:63-79` — the same block, also
byte-identical by `diff` against the first excerpt.

Exact search: `grep -rl '\["code-registry-parse.md", "code-registry-load.md"\]'
tests --include="*.test.ts"` → 5 files total
(`tests/callee-post-parse-errors-un-register-tools-caller.test.ts`,
`tests/nested-tools-entry-containment.test.ts`,
`tests/shared-subtree-judged-once-per-pass-not-once-per-path.test.ts`,
`tests/theta-callable-call-arity.test.ts`,
`tests/tools-entry-containment.test.ts`); of these, the three cited above
share the byte-identical `REGISTRY_TEXT`/`.map`/`.join` shape, and the
remaining two build the equivalent array via a `.flatMap` variant instead.
`grep -n "registry-oracle" tests/nested-tools-entry-containment.test.ts
tests/tools-entry-containment.test.ts tests/theta-callable-call-arity.test.ts`
→ 0 hits in any of the three: none imports the helper.

## Why this is a problem
This is the "Copy-paste fixtures/doubles" class: the two-page registry read
`tests/nested-tools-entry-containment.test.ts` performs locally is exactly
what `tests/helpers/registry-oracle.ts`'s own `readRegistry` function was
built to answer — the module's doc comment states its purpose is to
centralise this exact read after it was found "redeclared byte-for-byte…in
several test files" — yet three files, including the one in this review's
scope, still hand-roll the identical `readFileSync`/`fileURLToPath`/
`parseRegistry`/`.join` chain rather than calling `readRegistry(["parse",
"load"])` or importing the wider default `REGISTRY` export (both codes this
file looks up, `theta/load/invoke-path-escape` and the discriminator codes
it does not use, live on pages the four-page default already covers).

## Suggested direction (non-binding, optional)
`tests/helpers/registry-oracle.ts` already exports both a parameterised
`readRegistry(shards)` and a default four-page `REGISTRY`, either of which
answers this file's two-code lookup; it is the existing home the module's own
doc comment already points at for this read.

## False-positive check
- Gate-pin check: none of the three cited test files match `*gate*.test.ts`
  or the named gate kin, and the cited lines are a data read, not a pinned
  count or inventory; not applicable.
- Recording-double check: `REGISTRY`/`REGISTRY_TEXT` is a static, parsed-once
  array; nothing here records a call or backs a "never called" assertion, so
  the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "REGISTRY_TEXT\|registry-oracle"
  docs/bugs/*.md` → 0 hits; no documented correct-reason-red names this
  local read or states a reason it must stay file-local.
- coverage-matrix/bug-doc citation search: `grep -n
  "nested-tools-entry-containment\|tools-entry-containment.test\|theta-callable-call-arity"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of any file or any `it()`/`describe()` — only
  that the local `REGISTRY_TEXT`/`REGISTRY` read could be replaced by the
  existing `readRegistry`/`REGISTRY` import.
- Prior-finding overlap check: `grep -rl "REGISTRY_TEXT"
  quality/intake quality/resolved` → resolved PTQ-0237
  (`b0275-registry-oracle-duplicated.md`) covers the same class of
  duplication but for a disjoint file set
  (`tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts` and its
  own named siblings, all using the `.flatMap` variant); its own
  pattern-wide search names `tests/nested-tools-entry-containment.test.ts` as
  one of the 9 files sharing the general pattern but files no location
  against it and its `status: fixed` resolution did not migrate this file.
  No other filed or resolved ticket names
  `tests/nested-tools-entry-containment.test.ts`,
  `tests/tools-entry-containment.test.ts`, or
  `tests/theta-callable-call-arity.test.ts` for this specific
  `REGISTRY_TEXT` block.
- Coverage-drift check: the claim is about a repeated read/parse DEFINITION,
  not a missing test path; the registry read is exercised by every test in
  each file.

## Triage
<!-- triage appends here -->
verdict: confirmed — independently re-verified: the 17-line REGISTRY_TEXT/RegistryRow/REGISTRY block reproduces at nested-tools-entry-containment.test.ts:89-105 and diffs byte-identical against tools-entry-containment.test.ts:68-84 and theta-callable-call-arity.test.ts:63-79; the two-page literal greps to exactly the 5 files stated; none of the three imports tests/helpers/registry-oracle (readRegistry/REGISTRY now at :30-47, small drift from the cited :20-38, content matches); executing both reads shows the inline parse+load join and readRegistry(["parse","load"]) yield 213 JSON-identical rows with identical registryMessage results for all six codes the three files consult; all sites in tests/, no gate test, 0 coverage-matrix hits, 0 docs/bugs hits, no merge/rename/delete proposed; resolved PTQ-0237 named nested-tools-entry-containment only in its pattern-wide search with no location and its fix left this block in place, and no other resolved registry-oracle ticket (0215/0222/0250/0260/0275/0311/0313/0327/0404/0411/0412) nor any same-wave sibling (d7-01 productionload harness, d7-02 tools-derived-name-shape/closed-grammar, d7-12 call-arity productionload) cites this block in these three files (triage: claude-fable-5-1)
