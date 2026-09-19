---
id: PTQ-0768
title: alias-sink-array-element-check-live-cell.test.ts redeclares the registry-oracle read and a byte-identical registryFragment reader
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/live/alias-sink-array-element-check-live-cell.test.ts:84-109
  - tests/helpers/registry-oracle.ts:29-44
sites: 1
fix_scope: localized
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# alias-sink-array-element-check-live-cell.test.ts redeclares the registry-oracle read and a byte-identical registryFragment reader

## Observation
`tests/live/alias-sink-array-element-check-live-cell.test.ts` declares its
own module-scope `REGISTRY` constant by hand-rolling `readFileSync` +
`fileURLToPath` + `parseRegistry(...)` over
`docs/spec_topics/diagnostics/code-registry-parse.md`, and a local
`registryFragment(code, substitutions)` DIAG-4 message-fragment reader on top
of it, instead of importing `tests/helpers/registry-oracle.ts`'s exported
`readRegistry(shards)` (which this review's scope does not import: `grep -n
"registry-oracle" tests/live/alias-sink-array-element-check-live-cell.test.ts`
→ 0 hits). The local `registryFragment` function is byte-identical (by hash)
to the same-named function already cited, in three other files, by this
wave's `qw20260917154546-d7-02-live-cells-bypass-registry-oracle-helper.md`.

## Evidence

`tests/live/alias-sink-array-element-check-live-cell.test.ts:84-109`:
```ts
const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

/** DIAG-4: the message half is read from the registry row, not copied. */
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

`tests/helpers/registry-oracle.ts:29-44` (the canonical helper this file
bypasses):
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

Hash check: `awk '/^function registryFragment/,/^}/' tests/live/alias-sink-array-element-check-live-cell.test.ts | md5sum`
→ `a9d54c56fdada803f67d1b3ebff2fe77`, the identical hash
`qw20260917154546-d7-02-live-cells-bypass-registry-oracle-helper.md` records
for the same-named function in
`empty-object-discriminator-field-withhold-live-cell.test.ts`,
`fn-call-arity-live-cell.test.ts`, and
`fn-param-sink-array-literal-live-cell.test.ts`.

## Why this is a problem
`tests/helpers/registry-oracle.ts` exists specifically because this exact
single-page registry read was already found redeclared byte-for-byte across
several test files (its own header names PTQ-0215 as the reason it was
centralised). This file redeclares that same read without importing the
helper that already generalises it, and additionally carries a
`registryFragment` reader that is byte-for-byte identical to copies already
cited in three other files by a sibling finding in this same wave.

## Suggested direction (non-binding, optional)
`tests/helpers/registry-oracle.ts`'s `readRegistry(["parse"])` already
produces the same rows this file hand-parses; it is the module PTQ-0215 built
for exactly this read, and this file does not currently import it.

## False-positive check
- Gate-pin: the file does not match `*gate*.test.ts` or the named kin;
  neither `REGISTRY` nor `registryFragment`'s output is a pinned count or
  inventory assertion.
- Recording-double: `REGISTRY`/`registryFragment` read an immutable parsed
  registry and derive a string; neither records a call for a "never called"
  witness, so the recording-double carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "const REGISTRY = parseRegistry"
  docs/bugs/` → 0 files; bug 0157 (this file's own subject) documents no
  rationale for bypassing `tests/helpers/registry-oracle.ts`.
- coverage-matrix/bug-doc citation search: `grep -n
  "alias-sink-array-element-check-live-cell" docs/reference/coverage-matrix.md`
  → 0 hits. This finding proposes no change to any `it()`/`describe()` name,
  count, or assertion — only that the repeated registry-read and
  fragment-reader could import the existing helper.
- Overlap check: `qw20260917154546-d7-02-live-cells-bypass-registry-oracle-helper.md`
  already exists for this exact root cause but cites five different files
  (`empty-object-discriminator-field-withhold-live-cell.test.ts`,
  `empty-template-warning-registration-live-cell.test.ts`,
  `escaped-quote-inline-rename-live-cell.test.ts`,
  `fn-call-arity-live-cell.test.ts`,
  `fn-param-sink-array-literal-live-cell.test.ts`) — none of which is the
  file cited here, confirmed by direct comparison of both location lists.

## Triage
<!-- pending -->
verdict: confirmed — re-verified independently: the 84-109 excerpt reproduces verbatim (single-page parse read + registryFragment), registry-oracle.ts:29-44 matches, 0 `registry-oracle` imports in the file vs 30 files in tests/ that import the helper, both looked-up codes (array-element-type-mismatch, let-rhs-type-mismatch) sit on code-registry-parse.md so `readRegistry(["parse"])` yields identical rows, md5 a9d54c56… of registryFragment reproduces and is in fact byte-identical across 8 live cells (candidate undercounts at 4), the cell (9d378465, 2026-09-10) predates the helper (2594cd44, 2026-09-11) so it is an unmigrated pre-helper copy, docs/bugs and coverage-matrix greps both 0, gate/recording-double carve-outs inapplicable; same confirmed D7 copy-paste-fixture class as PTQ-0404 (which covered this cell's offline twin tests/alias-sink-array-element-check.test.ts) and PTQ-0313/0327/0411, and no existing PTQ or intake sibling cites this file for this root cause (d7-73 cites it for systemNoteContents only) (triage: claude-fable-5-1)
