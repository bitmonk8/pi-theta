---
id: PTQ-0747
title: Three fn/param/void-sink test files locally re-parse code-registry-parse.md instead of using tests/helpers/load-row-harness.ts's PARSE_REGISTRY / registryMessageOf
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/fn-param-not-identifier.test.ts:203-239
  - tests/fn-param-sink-array-literal.test.ts:140-175
  - tests/fn-return-void-query-sink.test.ts:112-125
  - tests/helpers/load-row-harness.ts:49-53
  - tests/helpers/load-row-harness.ts:62-81
sites: 3
fix_scope: module
d4_class: clone
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# Three fn/param/void-sink test files locally re-parse code-registry-parse.md instead of using tests/helpers/load-row-harness.ts's PARSE_REGISTRY / registryMessageOf

## Observation
`tests/fn-param-not-identifier.test.ts`, `tests/fn-param-sink-array-literal.test.ts`
and `tests/fn-return-void-query-sink.test.ts` each independently declare a
`RegistryRow` interface, read and `parseRegistry()` the same
`docs/spec_topics/diagnostics/code-registry-parse.md` file through the same
`readFileSync(fileURLToPath(new URL(...)))` incantation, and (in the first two)
define a `msg(code, fills)` helper with the identical body: look up the
template via `registryMessage`, assert it `.toBeDefined()` with a `DIAG-4
anchor` message, then loop over `fills` asserting `.toContain(placeholder)`
before `.replace()`-ing it in. `tests/helpers/load-row-harness.ts` (created
2026-09-11, `quality: qw20260911104855 fix tests__p1`) exports exactly this
pair — `PARSE_REGISTRY` (the parsed `code-registry-parse.md` array) and
`registryMessageOf(registry, registryPath, code, fills)` (the same
lookup-assert-fill body, parameterised) — citing PTQ-0206/PTQ-0207 as the prior
instances of this same redeclaration it was built to centralise.

## Evidence
`tests/fn-param-not-identifier.test.ts:203-239`:
```ts
interface RegistryRow {
  readonly code: string;
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

function msg(code: string, fills: ReadonlyArray<readonly [string, string]> = []): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/code-registry-parse.md must carry the Message row for ${code}`,
  ).toBeDefined();
  let out = template as string;
  for (const [placeholder, value] of fills) {
    expect(
      out,
      `DIAG-4: the ${code} Message template must carry the ${placeholder} placeholder; template=${JSON.stringify(template)}`,
    ).toContain(placeholder);
    out = out.replace(placeholder, value);
  }
  return out;
}
```

`tests/fn-param-sink-array-literal.test.ts:140-175` — byte-identical shape,
only the trailing-comma-in-`fills` type signature and one doc-comment word
differ:
```ts
interface RegistryRow {
  readonly code: string;
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

function msg(code: string, fills: ReadonlyArray<readonly [string, string]>): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/code-registry-parse.md must carry the Message row for ${code}`,
  ).toBeDefined();
```

`tests/fn-return-void-query-sink.test.ts:112-125` — the same read, without the
`msg()` wrapper (this file only checks code presence, not message text):
```ts
const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

for (const code of [VOID_POS, UNRESOLVED]) {
  expect(
    registryMessage(REGISTRY, code) as string | undefined,
    `bug 0220: ${code} has no row in docs/spec_topics/diagnostics/code-registry-parse.md — ` +
```

The canonical helper, `tests/helpers/load-row-harness.ts:49-53` (the parsed
registry) and `:62-81` (the lookup-assert-fill function each file above
re-declares):
```ts
export const PARSE_REGISTRY: readonly ParseCodeRegistryRow[] = parseRegistry(
  readFileSync(
    fileURLToPath(new URL(`../../${PARSE_REGISTRY_PATH}`, import.meta.url)),
    "utf8",
  ),
) as ParseCodeRegistryRow[];
...
export function registryMessageOf(
  registry: readonly RegistryRow[],
  registryPath: string,
  code: string,
  fills: ReadonlyArray<readonly [string, string]> = [],
): string {
  const template = registryMessage(registry, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: ${registryPath} must carry the Message row for ${code}`,
  ).toBeDefined();
  let out = template as string;
  for (const [placeholder, value] of fills) {
    expect(
      out,
      `DIAG-4: the ${code} Message template must carry the ${placeholder} placeholder; template=${JSON.stringify(template)}`,
    ).toContain(placeholder);
    out = out.replace(placeholder, value);
  }
  return out;
}
```

## Why this is a problem
The header comment of `tests/helpers/load-row-harness.ts` states its own
reason for existing: "Several `b02xx` files independently redeclared the same
... registry-message renderer (PTQ-0206, PTQ-0207). This module centralises
that one shared declaration." The three files cited here reproduce the exact
same read-parse-lookup-assert-fill sequence the helper module was written to
absorb (`registryMessageOf` differs from the three inline `msg()`/inline loops
only by threading `registry` and `registryPath` as parameters instead of
closing over file-local constants). All three are byte-for-byte identical in
the registry-read block (`readFileSync(fileURLToPath(new URL(...)))` against
the same path), and two of the three additionally duplicate the full
lookup-assert-fill function body.

## Suggested direction (non-binding, optional)
The natural shared home for this exact read-parse-lookup-fill sequence is the
already-existing `tests/helpers/load-row-harness.ts` (`PARSE_REGISTRY` /
`registryMessageOf`), which two of these three files predate.

## False-positive check
Gate-pin check: none of the three files match `*gate*.test.ts` or the named
kin patterns; this is not a census/pin gate. Recording-double check: not
applicable — no double or spy is involved. docs/bugs/ signature search: all
three files are cited by name as green witnesses in
`docs/bugs/0225-fn-param-list-foreign-close-paren-silent.md`,
`docs/bugs/0156-fn-parameter-sink-not-consulted-for-rule3-unions.md` and
`docs/bugs/0220-fn-return-void-sink-false-void-diagnostic.md` (and several
follow-on bug docs) — none of those citations pin the file's internal
`REGISTRY`/`msg` harness shape, only the tests' own cell counts and
assertions, so this finding does not propose merging, renaming or deleting any
cited test. Coverage-matrix / bug-doc citation search: `grep -rn` for each test
file's basename across `docs/` returned witness citations only, none of which
name the harness internals. This finding is scoped to the duplicated harness
code, not to test coverage or to any cited assertion.

## Triage
verdict: confirmed — independently re-verified: all three excerpts reproduce at the cited lines; `diff` of fn-param-not-identifier:203-239 vs fn-param-sink-array-literal:140-175 differs only in two doc-comment lines and the `fills = []` default, and the `readFileSync(fileURLToPath(new URL("../docs/spec_topics/diagnostics/code-registry-parse.md")))` read block is byte-identical across all three (fn-return-void-query-sink:112-119 differs only in the inline cast); `msg()`/`REGISTRY` are live in every file (calls at :318, 19 sites, :123); tests/helpers/load-row-harness.ts (added 2594cd44, 2026-09-11, 6 importers) exports PARSE_REGISTRY + registryMessageOf with the identical lookup-assert-fill body and its header names PTQ-0206/0207 as the redeclaration it centralises — all three test files (a63be7f5/5c700194/dc0b6911, 2026-08-21..22) predate it, so "two of three predate" understates; no `*gate*` match, no docs/bugs or coverage-matrix citation pins the REGISTRY/msg internals; none of these three files is cited by resolved PTQ-0215/0222/0237/0250/0260/0275/0311/0313/0404/0411 or any pending registry-oracle intake file, so not a duplicate (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
