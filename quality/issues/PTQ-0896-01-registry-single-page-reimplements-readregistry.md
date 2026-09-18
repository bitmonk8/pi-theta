---
id: PTQ-0896
title: reserved-keyword-remaining-identifier-positions.test.ts re-reads and re-parses the parse-shard registry instead of importing tests/helpers/registry-oracle.ts's readRegistry(["parse"])
lens: D7
status: open
verdict: confirmed
locations:
  - tests/reserved-keyword-remaining-identifier-positions.test.ts:193-206
  - tests/helpers/registry-oracle.ts:19-45
sites: 1
fix_scope: localized
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# reserved-keyword-remaining-identifier-positions.test.ts re-reads and re-parses the parse-shard registry instead of importing tests/helpers/registry-oracle.ts's readRegistry(["parse"])

## Observation
`tests/reserved-keyword-remaining-identifier-positions.test.ts` declares its
own `RegistryRow` interface and its own module-level `REGISTRY` constant,
built by `readFileSync`-ing `docs/spec_topics/diagnostics/code-registry-
parse.md` through a `fileURLToPath(new URL(...))` resolution and feeding the
text through the real `parseRegistry`. `tests/helpers/registry-oracle.ts`
exports `readRegistry(shards)`, whose `readRegistry(["parse"])` call performs
the identical single-shard read (same filename, same `fileURLToPath(new
URL(...))` resolution pattern, same `parseRegistry` import) the reviewed file
reconstructs inline. The file's own `msg()` helper already imports
`registryMessageOf` from `./helpers/load-row-harness` for the message-reading
half of the same registry concern, so the file already participates in the
shared-helper convention for this data — only the load itself is
reimplemented.

## Evidence
`tests/reserved-keyword-remaining-identifier-positions.test.ts:193-206` (re-read
immediately before filing):
```ts
interface RegistryRow {
  readonly code: string;
  readonly severity: string;
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

`tests/helpers/registry-oracle.ts:19-45` — the shared read this file was built
to centralise, exported with a per-shard parameter:
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
```

Exact search: `grep -n "helpers/registry-oracle" tests/reserved-keyword-
remaining-identifier-positions.test.ts` → 0 hits; the file's only
`./helpers/*` import is `registryMessageOf` from `./helpers/load-row-harness`
(line 1). `readRegistry(["parse"])` is a live call shape elsewhere: `grep -rl
'readRegistry(\["parse"\])' tests/*.test.ts` → 10+ files (e.g.
`tests/alias-sink-array-element-check.test.ts`,
`tests/b0046-by-clause-undecided-inputs.test.ts`,
`tests/division-result-type-number.test.ts`).

## Why this is a problem
`tests/helpers/registry-oracle.ts` centralises exactly this read — same
filename resolution mechanism, same `parseRegistry` call, parameterised by
shard — and is already the convention several other test files use for a
single-shard (`"parse"`-only) registry load. The reviewed file's local
`REGISTRY` constant is mechanically that same read reconstructed inline
instead of imported, with a narrower local `RegistryRow` type (`code`,
`severity`, `message`) that is a subset of the already-exported `RegistryRow`
interface, so no additional field forced the local reimplementation.

## Suggested direction (non-binding, optional)
Importing `readRegistry` (or a ready-built single-shard constant) from
`tests/helpers/registry-oracle.ts` and calling `readRegistry(["parse"])`
supplies the same rows the file's local `REGISTRY` constant computes; the
file's own `msg`/`reservedMsg` readers, which already delegate to
`registryMessageOf`, are unaffected.

## False-positive check
- Gate-pin check: `reserved-keyword-remaining-identifier-positions.test.ts`
  does not match `*gate*.test.ts` or the named gate kin.
- Recording-double check: `REGISTRY` is a parsed static array read once at
  module load; it records no calls and backs no "never called" witness, so
  the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "REGISTRY = parseRegistry"
  docs/bugs/*.md` → 0 files; no open bug names this duplication or gives a
  documented correct-reason for a local re-read.
- coverage-matrix/bug-doc citation search: `grep -n "reserved-keyword-
  remaining-identifier-positions" docs/reference/coverage-matrix.md` → 0
  hits. `docs/bugs/0153-reserved-keyword-remaining-identifier-positions.md`
  cites this file by name and by row id (a1-a9, c1-c7, k1-k5, s1-s7, m1-m14,
  w1-w7, x4-x10, L1-L8, d1-d12, n1/n3/n4, ck) but never by `REGISTRY`'s
  construction; this finding proposes no change to any `it()`/`describe()`
  name, count, or assertion — only to where the parsed registry rows are read
  from.
- Existing-helper verification: `tests/helpers/registry-oracle.ts` was read
  in full; its `readRegistry(["parse"])` call reads the identical filename
  through the identical `fileURLToPath(new URL(...))` mechanism and the
  identical `parseRegistry` import, confirmed by direct comparison against the
  reviewed file's inline construction.
- Prior-filing overlap check: `grep -rl "registry-oracle.ts\|REGISTRY =
  parseRegistry" quality/intake/*.md quality/issues/*.md quality/resolved/*.md`
  finds many prior "registry-oracle-reimplemented" filings (e.g. resolved
  PTQ-0579, which targeted the sibling file
  `tests/reserved-keyword-type-position.test.ts` — since fixed, that file now
  imports `REGISTRY` from `./helpers/registry-oracle` directly); none of those
  filings lists `tests/reserved-keyword-remaining-identifier-positions.test.ts`
  in `locations:`.
- Coverage check: the claim is about a repeated data-load DEFINITION, not a
  missing test path; `REGISTRY` is read by every group in the file today.

## Triage
verdict: confirmed — re-verified independently: the local 3-field `RegistryRow` + single-shard `parseRegistry(readFileSync(fileURLToPath(new URL("../docs/.../code-registry-parse.md"))))` read reproduces verbatim at tests/reserved-keyword-remaining-identifier-positions.test.ts:193-206 and is registry-oracle.ts:30-45's `readRegistry(["parse"])` bar `../` depth and a field-subset row type; 0 `helpers/registry-oracle` imports in the file while 33 tests call `readRegistry(["parse"])`; REGISTRY's two consumers (:213 via `registryMessageOf`, :376 `.find(code)` reading `.severity`) need only code/severity/message so the helper's row type is a drop-in; stated greps re-run (docs/bugs `REGISTRY = parseRegistry` → 0; coverage-matrix → 0; bug 0153 cites cells, not the load); not a gate, backs no recording double; 76/76 green at HEAD; not a duplicate — PTQ-0579 (resolved) fixed the sibling type-position file's load and its own FP-check names this file only as un-filed, PTQ-0616 (resolved) fixed this file's `msg` reader at :211-232 not the load, open PTQ-0776/0777 cite tests/live/** files only, and the only other filing citing this file (same-wave d7-02) targets the `lines()/at()` renderer at :242-266 — same D7 copy-paste-fixture class as PTQ-0579/0404/0411 (triage: claude-fable-5-1)
