---
id: PTQ-0500
title: Two live-cell files re-declare the single-shard diagnostics-registry read instead of importing tests/helpers/registry-oracle.ts's readRegistry
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/live/inline-object-wire-name-rename-live-cell.test.ts:71-78
  - tests/live/let-annotation-query-double-emission-live-cell.test.ts:74-81
  - tests/helpers/registry-oracle.ts:1-51
sites: 2
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: parallel
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# Two live-cell files re-declare the single-shard diagnostics-registry read instead of importing tests/helpers/registry-oracle.ts's readRegistry

## Observation
Both `tests/live/inline-object-wire-name-rename-live-cell.test.ts` and
`tests/live/let-annotation-query-double-emission-live-cell.test.ts` import
`parseRegistry` directly from `../../tools/code-registry/index.js` and build
their own module-scope `REGISTRY` constant by `readFileSync` +
`fileURLToPath` over the single page
`docs/spec_topics/diagnostics/code-registry-parse.md`, then cast the result
to `{ code: string; message: string }[]`. `tests/helpers/registry-oracle.ts`
already exports `readRegistry(shards)` — which performs exactly this
per-shard read against the same page-naming convention — and its header
comment states it exists because this read "were redeclared byte-for-byte …
in several test files." Neither file imports it.

## Evidence
`tests/live/inline-object-wire-name-rename-live-cell.test.ts:71-78`:
```ts
const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];
```

`tests/live/let-annotation-query-double-emission-live-cell.test.ts:74-81` (byte-identical shape, same page, same cast):
```ts
const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];
```

`tests/helpers/registry-oracle.ts:1-51` (the canonical helper, whose own header names exactly this redeclaration pattern as its reason for existing):
```ts
// The shared four-page diagnostics-registry read (PTQ-0215).
//
// WHY THIS FILE EXISTS. `RegistryRow` and the `REGISTRY` load it backs — read
// the four sharded registry pages (code-registry-{parse,load,runtime,host}.md),
// parse each through the real `parseRegistry`, and join the rows into one
// array — were redeclared byte-for-byte (confirmed via `diff`) in several test
// files. ...
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
```

Search: `grep -n "helpers/registry-oracle" tests/live/*.test.ts` returns zero hits — no file under `tests/live/` imports the canonical helper; every live cell that needs a registry read (including these two) re-derives it locally.

## Why this is a problem
Both in-scope files reproduce, byte-for-byte, the same `readFileSync` +
`fileURLToPath` + `parseRegistry` sequence that `tests/helpers/registry-oracle.ts`'s
own docstring names as the exact redeclaration it was created to end
(`readRegistry(["parse"])` computes the identical result either file builds
locally). The two files' local `{ code: string; message: string }[]` cast is
also narrower than the helper's exported `RegistryRow` (which also carries
`namespace`/`severity`/`phase`/`trigger`), so this is not merely an
unmigrated import — each file independently re-typed a shape the helper
already types more completely.

## Suggested direction (non-binding, optional)
`tests/helpers/registry-oracle.ts`'s exported `readRegistry(["parse"])` computes
the same single-shard read both files build locally; importing it in place of
each local declaration is the shape the helper's own header already
anticipates.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named
  gate-kin patterns; not applicable.
- Recording-double check: `REGISTRY` is a static read of documentation, not a
  recording double; not applicable.
- docs/bugs/ signature search: `grep -rn "inline-object-wire-name-rename-live-cell\|let-annotation-query-double-emission-live-cell" docs/bugs/` finds both files cited by name in `docs/bugs/0160-inline-object-wire-name-rename-unparsed.md` (lines 998, 1012) and referenced by their subject bug (0093) respectively, but every citation names the file as a whole witness (its `it()` cell and CLI invocation), never the `REGISTRY`-declaration lines (71-78 / 74-81) cited here; this finding proposes no rename, merge, or deletion of either test.
- coverage-matrix/bug-doc citation search: `grep -rn "inline-object-wire-name-rename-live-cell\|let-annotation-query-double-emission-live-cell" docs/reference/coverage-matrix.md` returns no hits.
- Confirmed `tests/helpers/registry-oracle.ts` predates this wave (header cites PTQ-0215, already resolved) and is actively imported by other test files outside `tests/live/`, so its canonical status is not coincidental to this review.
- Confined to test code under `tests/`; no production code cited or touched.

## Triage
<!-- pending -->
verdict: confirmed — independently re-verified: both REGISTRY blocks sit at the cited lines (71-78 / 74-81) and are byte-identical to each other and to the readFileSync+fileURLToPath+parseRegistry sequence tests/helpers/registry-oracle.ts:31-45 centralises (readRegistry(["parse"]) is a one-element join over the same page URL, result-identical, and RegistryRow is a superset of the local {code; message} cast so registryMessage still works); `grep -rn "helpers/registry-oracle" tests/live/` → 0 hits while the helper has 30 importers elsewhere under tests/; no gate/recording-double/rename carve-out applies (bug docs 0160/0243/0286/0287/0290 cite the files as whole witnesses, never the REGISTRY lines); no open/resolved PTQ cites tests/live/ for this read (PTQ-0404/0411/0412 cover disjoint file sets) and the same-wave live-cell siblings (shards 91/92/95/97/99) cite other files, so not a duplicate (triage: claude-fable-5-1)
