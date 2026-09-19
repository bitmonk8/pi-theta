---
id: PTQ-0977
title: invoke-arg-type-mismatch-wired.test.ts re-reads and re-parses two registry pages instead of calling the already-imported registry-oracle helper's readRegistry(["parse","load"])
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/invoke-arg-type-mismatch-wired.test.ts:106-123
  - tests/helpers/registry-oracle.ts:31-46
sites: 1
fix_scope: localized
wave: qw20260918131151
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# invoke-arg-type-mismatch-wired.test.ts re-reads and re-parses two registry pages instead of calling the already-imported registry-oracle helper's readRegistry(["parse","load"])

## Observation
tests/invoke-arg-type-mismatch-wired.test.ts declares its own module-scope
`REGISTRY_PAGES` array (the two page paths
`docs/spec_topics/diagnostics/code-registry-parse.md` and
`…-load.md`), its own local `RegistryRow` interface, and a `REGISTRY` constant
built by mapping `REGISTRY_PAGES` through `readFileSync` +
`fileURLToPath(new URL(...))`, joining the two page texts with `"\n"`, and
calling `parseRegistry` on the joined string. `tests/helpers/registry-oracle.ts`
already exports a `readRegistry(shards)` function that performs exactly this
read — for any subset of the four named shards (`"parse" | "load" | "runtime" | "host"`),
it reads each `code-registry-<shard>.md` page, joins them with `"\n"`, and
parses the result through the same `parseRegistry` — so `readRegistry(["parse", "load"])`
already produces the identical two-page registry this file re-derives by
hand. The file already imports a different export
(`interpolateStrict`) from that same helper module, so the import path is
already open.

## Evidence
tests/invoke-arg-type-mismatch-wired.test.ts:106-123 (re-read immediately
before filing):
```ts
/** The registry pages carrying this file's rows — the DIAG-4 oracle. */
const REGISTRY_PAGES = [
  "docs/spec_topics/diagnostics/code-registry-parse.md",
  "docs/spec_topics/diagnostics/code-registry-load.md",
] as const;

interface RegistryRow {
  readonly code: string;
  readonly severity: string;
  readonly phase: string;
  readonly message: string;
}

const REGISTRY = parseRegistry(
  REGISTRY_PAGES.map((page) =>
    readFileSync(fileURLToPath(new URL(`../${page}`, import.meta.url)), "utf8"),
  ).join("\n"),
) as RegistryRow[];
```

The canonical read already exported for reuse,
tests/helpers/registry-oracle.ts:31-46:
```ts
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

`readRegistry(["parse", "load"])` reads the identical two pages
(`code-registry-parse.md`, `code-registry-load.md`), in the identical order,
joined with the identical separator, through the identical `parseRegistry`
call — the only difference from the file's own `REGISTRY` constant is which
module performs the `readFileSync`/`fileURLToPath` calls, and the helper's
exported `RegistryRow` type is a superset (it also carries `namespace` and
`trigger`) of the four fields this file's local interface declares, all of
which this file's local interface subset already needs.

## Why this is a problem
The file's own header states the DIAG-4 posture explicitly: "every expected
string below is derived from" the registry read, so the read itself is meant
to be authoritative and singular. Instead, this file performs its own
independent disk read and its own independent `parseRegistry` call over the
same two pages `tests/helpers/registry-oracle.ts` already reads and exports —
duplicating the I/O, the shard-path string construction, and the parse, while
already importing a different function from that very module two lines above
in the same file's helper-import block.

## Suggested direction (non-binding, optional)
Replacing the local `REGISTRY_PAGES`/`RegistryRow`/`REGISTRY` block with
`readRegistry(["parse", "load"])` (already exported by the module this file
imports `interpolateStrict` from) removes the independent disk read without
touching this file's own `registered`/`fill` wrapper functions, which vary in
wording from file to file and are not part of this claim.

## False-positive check
- Gate-pin check: tests/invoke-arg-type-mismatch-wired.test.ts does not match
  `*gate*.test.ts` or the named gate kin (closing-gate, cross-cutting-gates,
  rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate); the cited block is a registry read, not a
  pinned count or inventory.
- Recording-double check: `REGISTRY` is a static markdown-derived array read
  once at module load; nothing here records a call or backs a "never called"
  witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "REGISTRY_PAGES" docs/bugs/*.md` →
  0 hits. No open bug document names this duplication or gives a documented
  correct-reason for keeping the two-page read local to this file.
- coverage-matrix/bug-doc citation search: `grep -n "invoke-arg-type-mismatch-wired" docs/reference/coverage-matrix.md` →
  0 hits (the file is cited by name inside several docs/bugs/ narratives as a
  witness suite — e.g. 0137, 0142, 0146, 0147 — but none of those citations
  concerns this registry-read block, and this finding proposes no merge,
  rename, or deletion of the file or any `it()`/`describe()` name).
- Coverage check: the claim is about a repeated registry-read DEFINITION, not
  a missing test path; every cell in the file continues to read the same two
  pages' rows exactly as before.
- Prior-finding search: `grep -rl "REGISTRY_PAGES" quality/issues quality/resolved quality/intake` →
  hits only on unrelated findings (PTQ-0275, PTQ-0649) about single-shard or
  four-shard reimplementations of the registry read in other, different test
  files; neither cites tests/invoke-arg-type-mismatch-wired.test.ts or its
  two-shard (`parse`+`load`) variant. Resolved PTQ-0468 tracks the *single*-page
  (`code-registry-parse.md` only) `REGISTRY_PAGE`/`REGISTRY` reimplementation
  recurring in 20 sibling files (including two files elsewhere in this
  review's file family) but does not cover this file, whose `REGISTRY_PAGES`
  is a two-element array, a different symbol name, and a distinct read shape
  not matched by that finding's cited grep pattern
  (`^const REGISTRY_PAGE = "docs/spec_topics/diagnostics/code-registry-parse.md";`).

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/invoke-arg-type-mismatch-wired.test.ts:106-123 and tests/helpers/registry-oracle.ts:31-46; a scratch node run shows `readRegistry(["parse","load"])` yields 213 rows JSON-identical to the file's local two-page read (same pages, order, "\n" join, same parseRegistry), and every row field the file consumes (code/severity/phase/message at :131, :568-572, :593) is in the helper's exported RegistryRow; the file already imports interpolateStrict from ./helpers/registry-oracle (:1); the three other `const REGISTRY_PAGES = [` declarations in tests/ (code-registry.test.ts, par-body-restriction-registry-rows, registry-closed-set-corpus-gate) are four-shard variants so sites: 1 is accurate; D7 boilerplate duplication inside tests/, not a gate/recording-double, coverage-matrix 0 hits, no rename/delete proposed; not a duplicate — no PTQ names this file's registry read (open 0599/0606/0814 and resolved 0210/0240/0259/0312/0805 cover other blocks in the file) and store precedent (PTQ-0468 note) files per-file residuals of this gap separately; one stated search is off — `grep -rl REGISTRY_PAGES docs/bugs/*.md` returns 1 hit (0230, about the corpus-gate test), not 0, which does not bear on this file (triage: claude-fable-5-1)
