---
id: PTQ-0569
title: reserved-keyword-inline-object-and-literal-keys.test.ts re-reads the parse-shard registry and re-derives a msg() filler instead of importing tests/helpers/registry-oracle.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/reserved-keyword-inline-object-and-literal-keys.test.ts:122-135
  - tests/reserved-keyword-inline-object-and-literal-keys.test.ts:146-166
  - tests/helpers/registry-oracle.ts:1-45
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# reserved-keyword-inline-object-and-literal-keys.test.ts re-reads the parse-shard registry and re-derives a msg() filler instead of importing tests/helpers/registry-oracle.ts

## Observation
`tests/reserved-keyword-inline-object-and-literal-keys.test.ts` declares its
own `RegistryRow` interface and its own module-level `REGISTRY` constant,
built by `readFileSync`-ing `code-registry-parse.md` through a
`fileURLToPath(new URL(...))` resolution and feeding the text through the
real `parseRegistry`. `tests/helpers/registry-oracle.ts` exists specifically
to centralise this read — its own header states it exists because "the
shared four-page diagnostics-registry read … [was] redeclared byte-for-byte
… in several test files" — and exports a `readRegistry(shards)` function
whose `readRegistry(["parse"])` call performs the identical single-shard
read the reviewed file reconstructs inline. The file additionally declares
its own `msg(code, fills)` template-filler function, whose body — look up
the template via `registryMessage`, assert it is defined, assert and replace
each named placeholder — is byte-identical to the same-named function in
`tests/fn-param-name-reserved-keyword.test.ts:239-253` (confirmed by direct
read; differs only in a `(DIAG-4)` parenthetical in one file's doc comment).

## Evidence
tests/reserved-keyword-inline-object-and-literal-keys.test.ts:122-135
(re-read immediately before filing):
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

tests/reserved-keyword-inline-object-and-literal-keys.test.ts:146-166 (the
`msg` filler):
```ts
function msg(code: string, fills: ReadonlyArray<readonly [string, string]>): string {
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

tests/helpers/registry-oracle.ts:1-45 — the canonical read this
reconstructs:
```ts
// The shared four-page diagnostics-registry read (PTQ-0215).
//
// WHY THIS FILE EXISTS. `RegistryRow` and the `REGISTRY` load it backs — read
// the four sharded registry pages (code-registry-{parse,load,runtime,host}.md),
// parse each through the real `parseRegistry`, and join the rows into one
// array — were redeclared byte-for-byte (confirmed via `diff`) in several test
// files. This module centralises that read only: each file's own
// `registryMessageOf` / `registryRowOf`-shaped reader — whose assertion style
// and wording vary per file — stays local, parameterised by the `REGISTRY` this
// module exports rather than by a locally re-parsed copy.
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

Exact search: `grep -n "registry-oracle" tests/reserved-keyword-inline-object-and-literal-keys.test.ts` → 0 hits, confirming the file never imports the centralising module. `grep -rl "reserved-keyword-inline-object-and-literal-keys" quality/intake/*.md quality/resolved/*.md` → 0 hits before this filing, confirming this specific file is not already covered by any of the many prior "registry-oracle-reimplemented"-class filings this wave (which cite other files: `fn-param-list-unclosed.test.ts`, `fn-param-name-case.test.ts`, `fn-param-name-reserved-keyword.test.ts`, `reserved-keyword-type-position.test.ts`, among others).

## Why this is a problem
The parse-shard registry read and the message-filler are the same harness
concern this file needs — "get this code's registry Message template and
fill its placeholders" — not domain logic specific to bug 0249. The project
already factored the underlying shard read for exactly this reason
(`tests/helpers/registry-oracle.ts`'s own header names the byte-for-byte
redeclaration it was built to stop), yet this file's `REGISTRY` constant and
`msg` filler reconstruct both pieces locally rather than importing
`readRegistry(["parse"])` and composing a local filler on top of it, and its
`msg` filler is itself byte-identical to a sibling file's `msg`
(`fn-param-name-reserved-keyword.test.ts`), i.e. the same filler logic is
independently retyped a second time on top of an independently re-read
registry.

## Suggested direction (non-binding, optional)
Importing `readRegistry(["parse"])` from `tests/helpers/registry-oracle.ts`
would supply the same rows this file's local `REGISTRY` constant computes;
the byte-identical `msg` filler is a further candidate for promotion beside
it, given at least one sibling file already carries the identical body.

## False-positive check
- Gate-pin check: `tests/reserved-keyword-inline-object-and-literal-keys.test.ts` does not match `*gate*.test.ts` or the named gate kin.
- Recording-double check: `REGISTRY` is a parsed static array read once at module load and `msg` performs only lookups/assertions on it; neither records calls nor backs a "never called" witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "REGISTRY = parseRegistry\|registry-oracle" docs/bugs/*.md` → 0 files. `docs/bugs/0249-reserved-keyword-keys-no-parser-leaf-backstop.md` cites this test file by name as its §Fix constraint 6 witness, but only for its behavioural rows (a1-a13, sa1-sa8, b1-b10, sb1-sb2, c1-c3, g1-g2, r1-r2), never for the `REGISTRY`/`msg` construction; this finding proposes no change to any `it()`/`describe()` name, count, or assertion — only to where the parsed registry rows and the template filler are defined.
- coverage-matrix/bug-doc citation search: `grep -n "reserved-keyword-inline-object-and-literal-keys" docs/reference/coverage-matrix.md` → 0 hits.
- Prior-filing overlap check: `grep -rl "reserved-keyword-inline-object-and-literal-keys" quality/intake/*.md quality/resolved/*.md` → 0 hits before this filing; the same duplication class is filed against other files elsewhere this wave (e.g. the `fn-param-list-unclosed.test.ts`/`fn-param-name-case.test.ts`/`fn-param-name-reserved-keyword.test.ts` trio, and `reserved-keyword-type-position.test.ts` singly) but none of those filings lists this file in `locations:`.
- Coverage check: the claim is about a repeated read-and-fill DEFINITION, not a missing test path; every row in the file is exercised by the file's own existing tests regardless of where `REGISTRY`/`msg` are defined.

## Triage
verdict: confirmed — re-verified independently: the local RegistryRow + single-parse-shard `parseRegistry(readFileSync(fileURLToPath(new URL(...))))` read reproduces verbatim at :122-135 and is `readRegistry(["parse"])` (registry-oracle.ts:31-45) bar `../` depth and a 3-field row type; the `msg` filler at :146-166 is byte-identical to tests/fn-param-name-reserved-keyword.test.ts:240-255 (only the doc comment's `(DIAG-4)` parenthetical differs); 0 `registry-oracle` imports in the file; all eight looked-up codes are `theta/parse/*` so the shared parse-shard read yields identical rows; file is not a gate, backs no recording double, has 0 coverage-matrix citations, and bug 0249 cites it only as its 41-cell §Fix constraint 6 witness (cell names/count untouched by relocating the oracle; the doc's "reads every expected message through parseRegistry / registryMessage" stays true via readRegistry); 41/41 green at HEAD; no PTQ in issues/ or resolved/ cites this file (PTQ-0404/0411/0412 cover other files) — same confirmed D7 copy-paste-fixture class as PTQ-0313/0327/0404 which already ratify single-page narrow reads; minor: filing's docs/bugs grep actually returns 1 unrelated prose hit (bug 0123:1000), non-blocking (triage: claude-fable-5-1)
