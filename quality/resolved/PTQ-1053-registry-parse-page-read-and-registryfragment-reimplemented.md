---
id: PTQ-1053
title: Five in-scope live cells redeclare the single-page registry read tests/helpers/registry-oracle.ts already exports as readRegistry, one duplicating its registryFragment reader byte-for-byte on top
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:
  - tests/live/nested-array-element-sink-descent-live-cell.test.ts:103-110
  - tests/live/nested-array-element-sink-descent-live-cell.test.ts:113-128
  - tests/live/par-for-body-qry4-mismatch-live-cell.test.ts:97-104
  - tests/live/params-default-unterminated-literal-live-cell.test.ts:90-97
  - tests/live/params-inline-enum-live-cell.test.ts:84-89
  - tests/live/reserved-keyword-misfire-faces-live-cell.test.ts:107-114
  - tests/helpers/registry-oracle.ts:11-38
  - tests/helpers/registry-oracle.ts:121-135
sites: 6
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# Five in-scope live cells redeclare the single-page registry read tests/helpers/registry-oracle.ts already exports as readRegistry, one duplicating its registryFragment reader byte-for-byte on top

## Observation
Five of the ten files in this review's scope each hand-roll the identical
`readFileSync` + `fileURLToPath` + `parseRegistry(...)` read of
`docs/spec_topics/diagnostics/code-registry-parse.md` into a module-scope
`REGISTRY`/`PARSE_REGISTRY` constant, byte-identical to each other apart from
the constant's own name and cosmetic line-wrapping.
`tests/helpers/registry-oracle.ts` states in its own header that this exact
read "were redeclared byte-for-byte... in several test files" and exports
`readRegistry(shards)` to end that redeclaration. None of the five files
imports `tests/helpers/registry-oracle.ts`. On top of its own local
`REGISTRY`, one of the five
(`nested-array-element-sink-descent-live-cell.test.ts`) also declares a
`registryFragment(code, substitutions)` function that is byte-identical to
`tests/helpers/registry-oracle.ts`'s already-exported function of the exact
same name and signature.

## Evidence
`tests/live/nested-array-element-sink-descent-live-cell.test.ts:103-110`:
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
The identical seven-line block (bar the constant's own name and, in one case,
single-line wrapping of the `new URL(...)` call) recurs at
`tests/live/par-for-body-qry4-mismatch-live-cell.test.ts:97-104`,
`tests/live/params-default-unterminated-literal-live-cell.test.ts:90-97`,
`tests/live/params-inline-enum-live-cell.test.ts:84-89`, and
`tests/live/reserved-keyword-misfire-faces-live-cell.test.ts:107-114`.

`tests/helpers/registry-oracle.ts:11-38` (its own header naming the reason it
exists, plus the canonical read all five bypass):
```ts
// WHY THIS FILE EXISTS. `RegistryRow` and the `REGISTRY` load it backs — read
// the four sharded registry pages (code-registry-{parse,load,runtime,host}.md),
// parse each through the real `parseRegistry`, and join the rows into one
// array — were redeclared byte-for-byte (confirmed via `diff`) in several test
// files. This module centralises that read, placeholder interpolation and the
// identical live-cell fragment assertions. Readers whose assertion style and
// wording vary per file stay local, using the shared registry read.
...
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

`tests/live/nested-array-element-sink-descent-live-cell.test.ts:113-128` (the
byte-identical `registryFragment` copy):
```ts
function registryFragment(code: string, substitutions: Readonly<Record<string, string>>): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `${code} has no registry row — the code this cell asserts is not registered (DIAG-2)`,
  ).toBeTypeOf("string");
  let message = template as string;
  for (const [key, value] of Object.entries(substitutions)) {
    message = message.replaceAll(`<${key}>`, value);
  }
  expect(
    message,
    `${code}: an unsubstituted placeholder remains — the registry row's Message template changed shape`,
  ).not.toMatch(/<[a-z]+>/);
  return `${code}: ${message}`;
}
```

`tests/helpers/registry-oracle.ts:121-135` — the already-exported function of
the identical name and body:
```ts
export function registryFragment(code: string, substitutions: Readonly<Record<string, string>>): string {
  const template = registryMessage(PARSE_REGISTRY, code) as string | undefined;
  expect(
    template,
    `${code} has no registry row — the code this cell asserts is not registered (DIAG-2)`,
  ).toBeTypeOf("string");
  let message = template as string;
  for (const [key, value] of Object.entries(substitutions)) {
    message = message.replaceAll(`<${key}>`, value);
  }
  expect(
    message,
    `${code}: an unsubstituted placeholder remains — the registry row's Message template changed shape`,
  ).not.toMatch(/<[a-z]+>/);
  return `${code}: ${message}`;
}
```
The only difference between the two `registryFragment` bodies is the closed-
over registry variable name (`REGISTRY` local vs `PARSE_REGISTRY` module-
private); `awk '/^function registryFragment/,/^}/'` on the in-scope file and
the same range on the helper (after stripping `export `) hash to
`a9d54c56fdada803f67d1b3ebff2fe77` on both — the identical hash already
recorded against three OTHER files by the resolved PTQ-0562 for this same
function.

Exact search, this review's scope: `grep -n "REGISTRY = parseRegistry"` over
the ten in-scope files → 5 hits (the files listed above);
`grep -n "^function registryFragment"` over the same ten → 1 hit
(`nested-array-element-sink-descent-live-cell.test.ts`); `grep -n
"from \"../helpers/registry-oracle\""` over the same ten → 0 hits in every
file.

## Why this is a problem
`tests/helpers/registry-oracle.ts` exists specifically because this single-
page registry read was already found redeclared byte-for-byte across
multiple test files (its own header names that history). Five files in this
review's scope redeclare the same read without importing the helper, and one
of the five layers a second byte-identical function (`registryFragment`,
already exported under the identical name and signature) directly on top of
its own local copy. A change to the read (a shard directory move, an added
column) or to the fragment reader's placeholder-substitution rule has one
more hand-typed site to keep in sync per redeclaration.

## Suggested direction (non-binding, optional)
`tests/helpers/registry-oracle.ts`'s `readRegistry(["parse"])` and its
already-exported `registryFragment` produce the same rows and the same
rendered fragments these five files hand-roll or, in one case, re-author
verbatim; none of the five currently imports either.

## False-positive check
- Gate-pin check: none of the five files matches `*gate*.test.ts` or a named
  gate kind; confirmed by filename, and none of the constants here is a
  pinned count or inventory.
- Recording-double check: `REGISTRY`/`registryFragment` read an immutable
  parsed registry and derive a string; neither records a call for a
  "never called" witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "const REGISTRY = parseRegistry"
  docs/bugs/` → 0 hits; none of the five files' own bug docs (0241, 0240,
  0239, 0162, 0242) documents a rationale for bypassing
  `tests/helpers/registry-oracle.ts`.
- coverage-matrix/bug-doc citation search: `grep -n
  "nested-array-element-sink-descent-live-cell\|par-for-body-qry4-mismatch-live-cell\|params-default-unterminated-literal-live-cell\|params-inline-enum-live-cell\|reserved-keyword-misfire-faces-live-cell"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  change to any `it()`/`describe()` name, count, or assertion — only that
  the repeated registry-read and fragment-reader could import the existing
  helper — so the citation carve-out does not bind.
- Prior-filing overlap check: `grep -rl "registryFragment"
  quality/issues/*.md quality/resolved/*.md quality/intake/*.md` before this
  filing returned `PTQ-0562` (resolved, confirmed) among others, which
  tracks the identical root cause for a disjoint set of three OTHER files
  (`empty-object-discriminator-field-withhold-live-cell.test.ts`,
  `fn-call-arity-live-cell.test.ts`, `fn-param-sink-array-literal-live-cell.test.ts`)
  plus two further `REGISTRY`-only files, none overlapping this review's
  scope; no existing filing names any of the five files cited here. This is
  the same broad root cause PTQ-0562/PTQ-0637 already confirmed for other
  file sets; this filing adds five further, previously uncited sites from
  this review's own scope for acceptance to fold in alongside them.
- Coverage check: the claim is entirely about repeated read/helper
  DEFINITIONS, not a missing test path; every copy is exercised by its own
  file's test.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all five single-page `parseRegistry(readFileSync(fileURLToPath(new URL("../../docs/spec_topics/diagnostics/code-registry-parse.md", …))))` blocks reproduce verbatim at the cited lines (nested-array:103-110, qry4:97-104, unterminated:90-97, inline-enum:84-89 single-line-wrapped, misfire-faces:107-114) and each is live (`registryMessage(REGISTRY|PARSE_REGISTRY, …)` at :114/:113+:127/:104/:100/:122); mktemp awk-extract of `registryFragment` from nested-array:113-128 vs registry-oracle.ts:121-135 (export stripped) differs only in the closed-over name and both hash a9d54c56fdada803f67d1b3ebff2fe77 with the name normalised; every code the five files look up (array-element-type-mismatch, explicit-schema-mismatch, par-query-in-body, unterminated-string, inline-enum, single-line-if) is on code-registry-parse.md so `readRegistry(["parse"])` (152 test importers) is a drop-in; the local `registryMessage(...)` wrappers in the other four files are the per-file readers the helper's PTQ-0215 header says stay local, so the filing correctly scopes the clone to the read plus the one byte-identical fragment; docs/bugs and coverage-matrix greps both reproduce at 0, no gate/recording-double/failLoudly carve-out, no it()/describe() change proposed, all locations under tests/ (D7 boilerplate/copy-paste-fixture); not a duplicate — no issues/ or resolved/ row names any of the five files' REGISTRY read (PTQ-0562/0637/0672/0662/0499/0634/0896 cite disjoint files; PTQ-0618 covered only misfire-faces' `reservedKeywordFragment` body and expressly excluded the page-read constant; PTQ-0817 is the offline misfire-faces file; sibling intakes d7-01/d7-02 are systemNoteContents and plant/boot/dispose); one non-blocking correction for the fixer — the "0 hits for `from \"../helpers/registry-oracle\"`" claim is stale: reserved-keyword-misfire-faces-live-cell.test.ts:91 imports `reservedKeywordFragment` from that module since the PTQ-0618 fix commit 5e1860ec (2026-09-18), so that file already imports the helper yet still re-reads the page, which sharpens rather than refutes the finding (triage: claude-fable-5-1)
