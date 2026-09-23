---
id: PTQ-1336
title: quoted-inline-field-name-live-cell hand-rolls the single-page registry read instead of tests/helpers/registry-oracle.ts's readRegistry
lens: D7
status: open
verdict: confirmed
locations:
  - tests/live/quoted-inline-field-name-live-cell.test.ts:66-73
  - tests/helpers/registry-oracle.ts:12-38
sites: 1
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# quoted-inline-field-name-live-cell hand-rolls the single-page registry read instead of tests/helpers/registry-oracle.ts's readRegistry

## Observation
`tests/live/quoted-inline-field-name-live-cell.test.ts` builds its own
module-scope `REGISTRY` constant by calling `readFileSync` +
`fileURLToPath` + `parseRegistry` directly against
`docs/spec_topics/diagnostics/code-registry-parse.md`, instead of importing
`readRegistry` from `tests/helpers/registry-oracle.ts`, which exists
specifically to replace this exact read. Sibling in-scope files in this same
review batch (`nested-array-element-sink-descent-live-cell.test.ts`,
`par-for-body-qry4-mismatch-live-cell.test.ts`,
`params-default-unterminated-literal-live-cell.test.ts`,
`params-inline-enum-live-cell.test.ts`,
`reserved-keyword-misfire-faces-live-cell.test.ts`) already import
`readRegistry` for the identical page.

## Evidence
`tests/live/quoted-inline-field-name-live-cell.test.ts:66-73`:
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

`tests/helpers/registry-oracle.ts:12-38` (the canonical replacement, whose own
header states this exact read "were redeclared byte-for-byte... in several
test files"):
```ts
// WHY THIS FILE EXISTS. `RegistryRow` and the `REGISTRY` load it backs — read
// the four sharded registry pages (code-registry-{parse,load,runtime,host}.md),
// parse each through the real `parseRegistry`, and join the rows into one
// array — were redeclared byte-for-byte (confirmed via `diff`) in several test
// files. This module centralises that read...
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

## Why this is a problem
`tests/helpers/registry-oracle.ts` was created specifically because this
identical `readFileSync`/`fileURLToPath`/`parseRegistry` sequence was
duplicated across test files (PTQ-0215, PTQ-1053). `quoted-inline-field-name-live-cell.test.ts`
still carries a byte-for-byte instance of the pattern the helper's own header
names as its reason for existing, unimported, alongside five sibling files in
this same review batch that already call `readRegistry`.

## Suggested direction (non-binding, optional)
The file already imports helpers from `../helpers/e2e-s1` and
`../helpers/theta-stderr-gate`; the same import style reaches
`../helpers/registry-oracle`'s `readRegistry`.

## False-positive check
- Gate-pin check: not a `*gate*.test.ts` file; the census/pin carve-out does
  not apply.
- Recording-double check: not applicable; this is a static registry read, not
  a double.
- docs/bugs/ signature search: bug 0176 (this file's own subject) does not
  discuss the registry-read mechanism; no correct-reason-red posture applies.
- coverage-matrix/bug-doc citation search: `grep -rn
  "quoted-inline-field-name-live-cell" docs/reference/coverage-matrix.md
  docs/bugs/` found no hits, so this file is not pinned by name in either
  location; no merge/rename/delete is proposed here regardless — the finding
  only names an uninmported existing helper.
- Confirmed PTQ-1053 (status: fixed) cites six other sites for the identical
  root cause but not this file, so this is a genuinely new, previously-uncited
  site rather than a re-file of a closed finding.

## Triage
verdict: confirmed — excerpt reproduces byte-for-byte at tests/live/quoted-inline-field-name-live-cell.test.ts:66-73 (parseRegistry(readFileSync(fileURLToPath(new URL("../../docs/spec_topics/diagnostics/code-registry-parse.md", …)))) while tests/helpers/registry-oracle.ts:31-43 exports readRegistry(["parse"]) for exactly this read and the file imports nothing from that helper; `grep -l 'code-registry-parse.md", import.meta.url' tests/live/*.ts` shows only this file plus two generic-argument cells still hand-roll it, and the four siblings the candidate names (par-for-body-qry4, params-default-unterminated, params-inline-enum, reserved-keyword-misfire) do import readRegistry (nested-array imports registryFragment); PTQ-1053 (fixed) cited those five siblings but not this file, and no quality/issues or quality/resolved row names it, so this is a new uncited site of the same boilerplate-duplication class rather than a re-file — note the same unimported helper also carries registryFragment, which the file's quotedInlineFieldFragment (:81-94) reimplements line-for-line, so the fix is one import; the candidate's claim that docs/bugs/ has no hits is wrong (0176:994, 0243:120, 0286:258, 0287:276 reference the file by name) but those are witness/run citations and no merge/rename/delete is proposed, so the carve-out does not engage (triage: claude-fable-5-1)
