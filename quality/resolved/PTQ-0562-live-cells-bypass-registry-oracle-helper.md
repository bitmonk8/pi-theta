---
id: PTQ-0562
title: Five in-scope live cells redeclare the single-page registry read that tests/helpers/registry-oracle.ts already canonicalises, three of them also duplicating a byte-identical registryFragment reader on top
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/live/empty-object-discriminator-field-withhold-live-cell.test.ts:73-80
  - tests/live/empty-template-warning-registration-live-cell.test.ts:79-86
  - tests/live/escaped-quote-inline-rename-live-cell.test.ts:73-80
  - tests/live/fn-call-arity-live-cell.test.ts:85-92
  - tests/live/fn-param-sink-array-literal-live-cell.test.ts:88-95
  - tests/live/empty-object-discriminator-field-withhold-live-cell.test.ts:83-98
  - tests/live/fn-call-arity-live-cell.test.ts:95-110
  - tests/live/fn-param-sink-array-literal-live-cell.test.ts:98-113
  - tests/helpers/registry-oracle.ts:29-44
sites: 5
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# Five in-scope live cells redeclare the single-page registry read that tests/helpers/registry-oracle.ts already canonicalises, three of them also duplicating a byte-identical registryFragment reader on top

## Observation
Five of the ten in-scope files each declare their own module-scope `REGISTRY`
constant by hand-rolling `readFileSync` + `fileURLToPath` +
`parseRegistry(...)` over `docs/spec_topics/diagnostics/code-registry-parse.md`,
byte-identical to each other. `tests/helpers/registry-oracle.ts` (created per
its own header for PTQ-0215, "redeclared byte-for-byte... in several test
files") already exports `readRegistry(shards)` — which reads exactly the
sharded pages named — for this. On top of the redeclared `REGISTRY` constant,
three of the five also declare a byte-identical `registryFragment(code,
substitutions)` DIAG-4 message-fragment reader (verified by `md5sum` of the
function body, identical hash in all three).

## Evidence
tests/live/empty-object-discriminator-field-withhold-live-cell.test.ts:73-80:
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
The identical seven-line block recurs verbatim at
`tests/live/empty-template-warning-registration-live-cell.test.ts:79-86`,
`tests/live/escaped-quote-inline-rename-live-cell.test.ts:73-80`,
`tests/live/fn-call-arity-live-cell.test.ts:85-92`, and
`tests/live/fn-param-sink-array-literal-live-cell.test.ts:88-95`.

tests/helpers/registry-oracle.ts:29-44, the canonical helper all five bypass:
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

tests/live/empty-object-discriminator-field-withhold-live-cell.test.ts:83-98
(the `registryFragment` copy):
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
`awk '/^function registryFragment/,/^}/' <file> | md5sum` over
`empty-object-discriminator-field-withhold-live-cell.test.ts`,
`fn-call-arity-live-cell.test.ts`, and
`fn-param-sink-array-literal-live-cell.test.ts` → the same hash
(`a9d54c56fdada803f67d1b3ebff2fe77`) in all three.

Exact search, this review's scope: `grep -n "^const REGISTRY = parseRegistry"`
over the ten in-scope files → 5 hits (the files listed above);
`grep -n "^function registryFragment"` over the same ten → 3 hits.
`tests/helpers/registry-oracle.ts` is imported by none of the ten in-scope
files (`grep -n "registry-oracle" <each file>` → 0 hits in every one).

## Why this is a problem
`tests/helpers/registry-oracle.ts` exists specifically because this exact
single-page registry read — `readFileSync` + `fileURLToPath` +
`parseRegistry` over one or more `code-registry-*.md` shards — was already
found redeclared byte-for-byte across several test files (its own header
names PTQ-0215 as the reason it was centralised). Five files in this review's
scope redeclare that same read without importing the helper that already
generalises it, and three of those five layer a second byte-identical
function (`registryFragment`) on top of their own local copy.

## Suggested direction (non-binding, optional)
`tests/helpers/registry-oracle.ts`'s `readRegistry(["parse"])` already
produces the same rows these five files hand-parse; it is the module PTQ-0215
built for exactly this read, and none of the five currently imports it.

## False-positive check
- Gate-pin: none of the five files matches `*gate*.test.ts` or the named kin;
  confirmed by filename, and none of the constants asserted here is a pinned
  count or inventory.
- Recording-double: `REGISTRY`/`registryFragment` read an immutable parsed
  registry and derive a string; neither records a call for a "never called"
  witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "const REGISTRY = parseRegistry"
  docs/bugs/` → 0 files; none of the five files' own bug docs (0129, 0085,
  0229, 0131, 0156) documents a rationale for bypassing
  `tests/helpers/registry-oracle.ts`.
- coverage-matrix/bug-doc citation search: `grep -n
  "empty-object-discriminator-field-withhold-live-cell\|empty-template-warning-registration-live-cell\|escaped-quote-inline-rename-live-cell\|fn-call-arity-live-cell\|fn-param-sink-array-literal-live-cell"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  change to any `it()`/`describe()` name, count, or assertion — only that the
  repeated registry-read and fragment-reader could import the existing
  helper — so the citation carve-out does not bind.
- Coverage check: the claim is entirely about a repeated read/helper
  DEFINITION, not a missing test path; every copy is exercised by its own
  file's test.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: the seven-line `const REGISTRY = parseRegistry(...code-registry-parse.md...)` block is byte-identical (md5 8c53e5c9…) at all five cited ranges and `registryFragment` is byte-identical (md5 a9d54c56…) in the three cited files; `grep -l registry-oracle tests/live/*.ts` → 0 importers; tests/helpers/registry-oracle.ts:29-44 `readRegistry(["parse"])` reads the same page through the same `parseRegistry`, so the fix is a mechanical import swap; none of the five files is cited by docs/reference/coverage-matrix.md or a gate/recording-double carve-out, bug docs 0085/0129/0131/0156/0229 state no bypass rationale, and no open/resolved PTQ (0222/0237/0250/0260/0275/0311/0313/0327/0404/0411/0412 all cite other files) tracks these five — same D7 boilerplate class those precedents confirmed (triage: claude-fable-5-1)
