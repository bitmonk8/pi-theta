---
id: PTQ-0411
title: array-sink-unresolvable-deferral test file re-reads the four-page diagnostics registry that tests/helpers/registry-oracle.ts already exports
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/array-sink-unresolvable-deferral.test.ts:108-120
  - tests/helpers/registry-oracle.ts:31-45
sites: 1
fix_scope: localized
wave: qw20260917121953
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# array-sink-unresolvable-deferral test file re-reads the four-page diagnostics registry that tests/helpers/registry-oracle.ts already exports

## Observation
`tests/array-sink-unresolvable-deferral.test.ts` declares its own module-level
`REGISTRY` constant by reading and joining the same four sharded registry
pages (`code-registry-parse.md`, `code-registry-load.md`,
`code-registry-runtime.md`, `code-registry-host.md`) that
`tests/helpers/registry-oracle.ts` already reads, parses and exports as
`REGISTRY`. The two reads are the same page list, in the same order, joined
the same way, differing only in path depth (`../` vs `../../`) and in the
`RegistryRow` field subset each file declares locally.

## Evidence
tests/array-sink-unresolvable-deferral.test.ts:108-120:
```
const REGISTRY = parseRegistry(
  [
    "code-registry-parse.md",
    "code-registry-load.md",
    "code-registry-runtime.md",
    "code-registry-host.md",
  ]
    .map((page) =>
      readFileSync(
        fileURLToPath(new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url)),
        "utf8",
      ),
    )
    .join("\n"),
) as RegistryRow[];
```

tests/helpers/registry-oracle.ts:31-45:
```
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
The page list, its order, the `readFileSync`/`fileURLToPath` construction and
the `.join("\n")` reduction are identical between the two sites.

Both files were touched in the same commit (`git log --oneline -1 --
tests/array-sink-unresolvable-deferral.test.ts` and `--
tests/helpers/registry-oracle.ts` both show `2594cd44 quality: qw20260911104855
fix tests__p1`), which is the commit that created `registry-oracle.ts` and, in
its own words, centralised this exact read because it "were redeclared
byte-for-byte (confirmed via `diff`) in several test files." That same commit
edited `tests/array-sink-unresolvable-deferral.test.ts` (removing an unrelated
parse-harness duplication, migrating it onto `tests/helpers/e2e-s1.ts` and
`tests/helpers/call-with-clause-harness.ts`) without moving this file's
four-page `REGISTRY` read onto the newly-created `registry-oracle.ts`.

## Why this is a problem
`tests/helpers/registry-oracle.ts`'s own header states the read it exports —
the four-page join — is "centralise[d]" because it "were redeclared
byte-for-byte … in several test files," and 21 other test files (verified via
`grep -rl "helpers/registry-oracle" tests/`) import its `REGISTRY` rather than
re-deriving it. `tests/array-sink-unresolvable-deferral.test.ts` performs the
identical read inline instead, reproducing the exact construct the helper
module exists to remove.

## Suggested direction (non-binding, optional)
The file could import `REGISTRY` (and, if needed, `RegistryRow`) from
`tests/helpers/registry-oracle.ts` in place of its own module-level
`parseRegistry(...)` call, keeping its own `registered`/`interpolate` message
renderers local, consistent with the helper module's stated intent to
centralise only the page read.

## False-positive check
- Gate-pin: the filename does not match `*gate*.test.ts` or any named kin;
  not a census/pin gate file.
- Recording-double: the `REGISTRY` constant is a plain data read, not a
  recording double or negative witness.
- docs/bugs/ signature search: `docs/bugs/0179-array-sink-refuses-unresolvable-value-type.md`
  is the report this file encodes; it specifies the cell inventory and the
  DIAG-4 oracle requirement (read the registry Message column), not the
  internal mechanics of how the four pages are read, so the duplication is not
  a documented correct-reason artefact.
- coverage-matrix/bug-doc citation search: `grep -rn
  "array-sink-unresolvable-deferral" docs/reference/coverage-matrix.md
  docs/bugs/*.md` finds the file cited as a witness in
  `docs/bugs/0126-...md`, `docs/bugs/0136-...md`, `docs/bugs/0144-...md` and
  `docs/bugs/0179-...md`. This finding proposes no merge, rename or deletion of
  the test file or any cell — only routing the module-level `REGISTRY` read
  through the existing helper export — so the citation does not block filing.
- Coverage: this finding does not claim any behaviour is untested; it is
  scoped to the test file's own data-read duplication.

## Triage
verdict: confirmed — both excerpts reproduce verbatim (test file's REGISTRY read now sits at :161-175, not :108-120 — same content, ~50-line drift; helper at :31-45 exact), identical page list/order/join differing only in `../` depth; commit 2594cd44 touched both files and the 21-importer count reproduces; no carve-out applies (not a gate file, plain data read, bug-doc citations name the file as a witness without pinning its registry-read mechanics); none of the nine resolved registry-oracle PTQs (0215/0222/0237/0250/0260/0275/0311/0313/0327) list this file, so not a duplicate (triage: claude-fable-5-1)
