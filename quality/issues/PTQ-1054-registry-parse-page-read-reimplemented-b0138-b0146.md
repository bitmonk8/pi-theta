---
id: PTQ-1054
title: b0138live and b0146live each hand-roll the single-shard parse-registry read instead of tests/helpers/registry-oracle.ts's readRegistry
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/live/b0138live-imported-fn-arg-refusal-live-cell.test.ts:77-84
  - tests/live/b0146live-invoke-array-arg-live-cell.test.ts:74-81
  - tests/helpers/registry-oracle.ts:30-43
sites: 2
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# b0138live and b0146live each hand-roll the single-shard parse-registry read instead of tests/helpers/registry-oracle.ts's readRegistry

## Observation
`tests/helpers/registry-oracle.ts` exports `readRegistry(shards)`, which
reads the named `docs/spec_topics/diagnostics/code-registry-<shard>.md`
page(s) via `readFileSync(repoFile(...))` and parses them through the real
`parseRegistry`. Both `b0138live-imported-fn-arg-refusal-live-cell.test.ts`
and `b0146live-invoke-array-arg-live-cell.test.ts` instead declare their own
module-scope `REGISTRY` constant that re-derives the identical single-shard
(`parse`) read by hand: the same `fileURLToPath(new URL("../../docs/…", import.meta.url))`
path construction, the same `readFileSync(..., "utf8")`, and the same
`parseRegistry(...)` call, differing only in the cast's shape
(`{ code: string; message: string }[]` vs `registry-oracle.ts`'s own
`RegistryRow[]`).

## Evidence

`tests/live/b0138live-imported-fn-arg-refusal-live-cell.test.ts:77-84`:
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

`tests/live/b0146live-invoke-array-arg-live-cell.test.ts:74-81` — the same
read, re-read from the file immediately before filing (byte-identical apart
from surrounding indentation of the closing paren, which does not change any
token):
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

`tests/helpers/registry-oracle.ts:30-43` (the canonical helper that already
does this, parameterised over which shard(s) to read):
```ts
export function readRegistry(
  shards: readonly ("parse" | "load" | "runtime" | "host")[],
): readonly RegistryRow[] {
  return parseRegistry(
    shards
      .map((shard) =>
        readFileSync(
          repoFile(`docs/spec_topics/diagnostics/code-registry-${shard}.md`),
          "utf8",
        ),
      )
      .join("\n"),
  ) as RegistryRow[];
}
```

Exact search: `grep -n "^const REGISTRY = parseRegistry" tests/live/b0106live-cofire-refusal-live-cell.test.ts tests/live/b0138live-imported-fn-arg-refusal-live-cell.test.ts tests/live/b0146live-invoke-array-arg-live-cell.test.ts tests/live/b0191live-enum-shadow-registration-live-cell.test.ts` returns exactly 2 hits, in `b0138live` and `b0146live` (the other two in-scope files never read the registry directly).

## Why this is a problem
Both files reproduce, byte-for-byte, the file-path construction and read
that `tests/helpers/registry-oracle.ts`'s exported `readRegistry` already
performs, each under its own locally-declared `REGISTRY` constant with a
locally-declared row-shape cast, rather than calling `readRegistry(["parse"])`.
Neither file imports from `registry-oracle.ts` at all. A change to the
registry page's on-disk location, or to `parseRegistry`'s return shape,
would need to be re-applied independently at both hand-rolled copies as well
as at the canonical helper.

## Suggested direction (non-binding, optional)
Both files' `REGISTRY` declaration could call `readRegistry(["parse"])` from
`tests/helpers/registry-oracle.ts` and use its exported `RegistryRow` type in
place of the locally inlined `{ code: string; message: string }[]` cast.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named
  gate-kin patterns; the registry read is a fixture load, not a pinned-count
  gate assertion.
- Recording-double check: not applicable — `REGISTRY`/`readRegistry` load a
  real, static markdown-derived table; neither is a recording double backing
  a MUST-NOT-call witness.
- docs/bugs/ signature search: `grep -rl "code-registry-parse.md"
  docs/bugs/*.md` returns bug docs that cite the registry page's content, not
  this read's implementation; no documented correct-reason-red names either
  file's `REGISTRY` declaration.
- coverage-matrix/bug-doc citation search: `grep -n "b0138live\|b0146live"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of any `it()`/`describe()` — only that a
  duplicated fixture-read constant could call the existing helper it
  otherwise reimplements.
- Coverage drift: this finding does not claim any behaviour is untested;
  both files' `fnArgFragment`/`invokeArgFragment` message-fragment builders
  (which consume `REGISTRY`) are unaffected and continue to assert the same
  registry-sourced message text either way.

## Triage
<!-- triage appends: verdict + one-line reason. Nothing above this line is edited. -->
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at b0138live:77-84 and b0146live:74-81 and are byte-identical (mktemp sed-range diff empty, md5 8c53e5c9 both), the helper excerpt reproduces at tests/helpers/registry-oracle.ts:30-43 and its header (:7-10) states the shared read is exactly what per-file readers are meant to consume; the stated `^const REGISTRY = parseRegistry` grep over the four in-scope files → exactly these 2 hits; neither file imports registry-oracle or load-row-harness (grep → 0); each local `REGISTRY` has one live consumer (`registryMessage(REGISTRY, CODE)` at :98 / :100) so the swap to `readRegistry(["parse"])` — already a live call shape in 38 tests/ files — is mechanical; not a gate/kin file, not a recording double, coverage-matrix → 0 hits, docs/bugs/0138 and 0146 cite the files as witnesses but neither pins the local read shape (0146:974 only restates the DIAG-4 parseRegistry/registryMessage posture, which readRegistry preserves); not a duplicate — b0138live is tracked only by PTQ-0762 (composeCodesOf) and b0146live only by resolved PTQ-0769 (bootNotes), the fixed live-cell umbrella PTQ-0562 covers five different files, and sibling intake d7-04 targets the fragment-builder loop (a distinct root cause); store precedent (PTQ-0562/0634/0896/0972/0975) accepts per-file-set rows for this idiom (triage: claude-fable-5-1)
