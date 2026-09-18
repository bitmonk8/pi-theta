---
id: PTQ-0812
title: interpolation-parse-diagnostics.test.ts re-reads and re-parses the parse-shard registry instead of calling tests/helpers/registry-oracle.ts's readRegistry
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/interpolation-parse-diagnostics.test.ts:129-148
  - tests/helpers/registry-oracle.ts:1-45
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: parallel
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# interpolation-parse-diagnostics.test.ts re-reads and re-parses the parse-shard registry instead of calling tests/helpers/registry-oracle.ts's readRegistry

## Observation
`tests/interpolation-parse-diagnostics.test.ts` builds its own module-scope
`REGISTRY` by reading `docs/spec_topics/diagnostics/code-registry-parse.md`
through `readFileSync`/`fileURLToPath(new URL(...))`, declaring its own local
`RegistryRow` interface, and calling the real `parseRegistry` over the raw
text. `tests/helpers/registry-oracle.ts` already exports
`readRegistry(shards)`, documented as reading "only the requested shards"
through the identical `readFileSync`/`fileURLToPath`/`parseRegistry`
sequence and returning a six-field `RegistryRow` that is a structural
superset of the file's own four-field local interface (the file only reads
`.message` off a row). The file does not import `registry-oracle.ts`.

## Evidence
tests/interpolation-parse-diagnostics.test.ts:129-148 (re-read immediately before filing):
```ts
// ===========================================================================
// The DIAG-4 oracle: the registry Message column, read from the spec corpus.
// ===========================================================================

const REGISTRY_TEXT = readFileSync(
  fileURLToPath(
    new URL("../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
  ),
  "utf8",
);

interface RegistryRow {
  code: string;
  severity: string;
  phase: string;
  trigger: string;
  message: string;
}

const REGISTRY = parseRegistry(REGISTRY_TEXT) as RegistryRow[];
```

tests/helpers/registry-oracle.ts:1-45 (re-read immediately before filing; the
canonical read, parameterised exactly for the single-shard case):
```ts
// The shared four-page diagnostics-registry read (PTQ-0215).
...
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
`readRegistry(["parse"])` reads the identical single page through the
identical `fileURLToPath(new URL(...))`/`readFileSync`/`parseRegistry`
sequence (differing only in the `../` vs `../../` relative depth each file's
own location requires) and returns the wider canonical `RegistryRow`, of
which the in-scope file's local four-field interface is a subset.
Import check: `grep -n "registry-oracle" tests/interpolation-parse-diagnostics.test.ts`
returns no hit.

## Why this is a problem
`tests/helpers/registry-oracle.ts`'s own header states its `readRegistry`
export exists because this exact read "were redeclared byte-for-byte …
in several test files," and its `shards` parameter exists precisely to
serve callers, like this file, that need fewer than all four pages.
`tests/interpolation-parse-diagnostics.test.ts` reproduces the single-shard
case (`["parse"]`) as its own inline `readFileSync`/`fileURLToPath`/
`parseRegistry` sequence instead of the one-line `readRegistry(["parse"])`
call the helper was built to serve, so a future change to the shard-file
naming, the join behaviour, or the relative-path construction must be
mirrored here by hand.

## Suggested direction (non-binding, optional)
Replacing the file's local `REGISTRY_TEXT`/`RegistryRow`/`REGISTRY` block
with `readRegistry(["parse"])` from `tests/helpers/registry-oracle.ts` is the
one-line substitution the helper's own `shards` parameter already serves.

## False-positive check
- Gate-pin check: `tests/interpolation-parse-diagnostics.test.ts` does not
  match `*gate*.test.ts` or the named gate kin; the file's own group-(g)
  corpus census IS a legitimate pinned-count gate (untouched by this
  finding), but the cited lines 129-148 are a registry read/parse setup, not
  a pinned count or inventory assertion.
- Recording-double check: `REGISTRY`/`parseRegistry` here back a
  Message-template lookup (`registered`/`rendered`), not a recording double
  witnessing a MUST-NOT-called invariant; the negative-witness carve-out does
  not apply.
- docs/bugs/ signature search: `grep -rn "REGISTRY_TEXT" docs/bugs/*.md`
  returns no hit; this file's own header cites bug 0122 (and 0345) for its
  *subject* diagnostics, not for a reason its registry-read setup must stay
  local; not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -rn
  "interpolation-parse-diagnostics" docs/reference/coverage-matrix.md
  docs/bugs/*.md` shows the file cited by bugs 0118, 0122 and 0345 as a whole
  witness file; none of those citations targets lines 129-148, and this
  finding proposes no merge, rename, or deletion of any `it()`/`describe()`
  cell — only that the registry-read setup could call the existing helper.
- Prior-finding overlap check: `grep -rl "interpolation-parse-diagnostics"
  quality/issues quality/intake quality/resolved` shows only PTQ-0754 (the
  `ANTHROPIC_MODEL` fixture, a disjoint declaration) and PTQ-0752 (an
  unrelated file pair); the sibling fix PTQ-0558
  (`quality/resolved/PTQ-0558-invoke-depth-cycle-registry-oracle-not-imported.md`)
  covered the identical pattern in `tests/invoke-depth-cycle.test.ts`, which
  has since been fixed (that file now imports `readRegistry` from this same
  helper, confirmed by direct re-read) — this is an additional, independent
  instance of the same helper-bypass pattern in a file none of the existing
  rows covers.
- Coverage check: this finding is about a duplicated registry-read/parse
  setup, not a missing test path; every cell in the file continues to read
  its Message templates through the local `REGISTRY` today.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: excerpts reproduce at tests/interpolation-parse-diagnostics.test.ts:133-148 and tests/helpers/registry-oracle.ts:20-45; `grep -n registry-oracle` on the file → 0 hits; `REGISTRY` has one consumer (`registryMessage(REGISTRY, code)` at :169, reading `.message` only) so the helper's six-field `RegistryRow` covers it (local interface is five fields, not the filed four — immaterial); `readRegistry(["parse"])` resolves the same page (`tests/helpers/../../docs` = `tests/../docs`) and a one-element `.join("\n")` is identity, so rows are identical; both locations under tests/, D7 boilerplate-duplication class anchored to the helper's own header stating it exists to absorb this exact redeclaration; not a gate file, no recording double, `REGISTRY_TEXT` in docs/bugs → 0, bugs 0118/0122/0345 cite the file as a whole witness and no cell merge/rename/delete is proposed; no open or resolved PTQ row names this file for the registry read (PTQ-0754 is the disjoint `ANTHROPIC_MODEL` fixture; PTQ-0776/0777/0768 cover other files), so this is an independent instance under the per-file precedent of PTQ-0558/0768/0776 — fix is the mechanical `readRegistry(["parse"])` substitution (triage: claude-fable-5-1)
