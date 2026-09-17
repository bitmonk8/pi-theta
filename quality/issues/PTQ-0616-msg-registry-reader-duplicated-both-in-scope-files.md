---
id: PTQ-0616
title: Both in-scope files redeclare the same registry-message reader byte-for-byte instead of importing the canonical registryMessageOf
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/reserved-keyword-remaining-identifier-positions.test.ts:211-232
  - tests/reserved-keyword-type-position.test.ts:218-239
  - tests/helpers/load-row-harness.ts:56-82
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# Both in-scope files redeclare the same registry-message reader byte-for-byte instead of importing the canonical registryMessageOf

## Observation
Both files in this review's scope declare a local function `msg(code, fills)`
whose executable body is byte-identical: read the registry row's *Message*
template through `registryMessage`, assert it is defined naming the parse
registry page, walk the `fills` pairs asserting each placeholder is present
before substituting it, and return the filled string.
`tests/helpers/load-row-harness.ts` already exports `registryMessageOf`, a
parameterised function with the identical five-step body (definedness assert,
per-placeholder presence assert, substitution, return), taking the registry
array and registry path as explicit arguments so any file's own registry
setup threads through it. Neither in-scope file imports it.

## Evidence
tests/reserved-keyword-remaining-identifier-positions.test.ts:211-232:
```ts
/**
 * The registry row's normative *Message* template with its named placeholders
 * filled (DIAG-4). Definedness and placeholder presence are asserted first, so
 * a missing row or a reworded template reds by naming the registry rather than
 * by a bare `undefined` comparison.
 */
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

tests/reserved-keyword-type-position.test.ts:218-239 (executable body
byte-identical to the block above; only the doc comment's wording differs):
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

tests/helpers/load-row-harness.ts:56-82 — the canonical, already-exported
parameterised equivalent:
```ts
/**
 * The registry row's normative *Message* template with its named placeholders
 * filled (DIAG-4). Definedness and placeholder presence are asserted first, so
 * a row whose *Message* moved reds by naming the registry page rather than by a
 * bare `undefined` comparison downstream.
 */
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
The two in-scope files each carry their own copy of the identical five-step
registry-message reader — the same DIAG-2/DIAG-4 assertions, in the same
order, with the same interpolated messages — rather than either importing
each other's or, more directly, importing the parameterised
`registryMessageOf` that `tests/helpers/load-row-harness.ts` already exports
and that a number of `b02xx` test files already call with their own
registry/path pair as the first two arguments. Both in-scope files' `msg`
would reduce to a one-line call — `registryMessageOf(REGISTRY,
"docs/spec_topics/diagnostics/code-registry-parse.md", code, fills)` — with
no loss of the file-specific `REGISTRY` value each already builds.

## Suggested direction (non-binding, optional)
Importing `registryMessageOf` from `tests/helpers/load-row-harness.ts` and
calling it with each file's own `REGISTRY` constant and registry-page path
string is the natural point the two identical local `msg` bodies already
converge on; the fix stage owns whether the local `msg` wrapper name is kept
as a one-line delegator or removed entirely in favour of direct calls.

## False-positive check
- Gate-pin check: neither in-scope file matches `*gate*.test.ts` or the
  named gate kin.
- Recording-double check: `msg`/`registryMessageOf` read an already-parsed
  static registry array; neither records calls nor backs a "never called"
  witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "function msg(code" docs/bugs/*.md`
  → 0 files; no open bug documents a rationale for keeping a local copy in
  either file.
- coverage-matrix/bug-doc citation search: `grep -n
  "reserved-keyword-type-position\|reserved-keyword-remaining-identifier-positions"
  docs/reference/coverage-matrix.md` → 0 hits. Both files are cited by their
  own bug documents (0044, 0153) by row id, never by `msg`'s name; this
  finding proposes no change to any `it()`/`describe()` name, count, or
  assertion — only to where the message-reading function's body is defined.
- Existing-helper verification: `tests/helpers/load-row-harness.ts:56-82` was
  read in full above and compared clause-by-clause against both in-scope
  files' `msg` bodies — identical registry-message call, identical
  definedness assertion shape (differing only in the literal registry-path
  string vs. the parameterised argument), identical per-placeholder loop,
  identical return.
- Cross-check with prior filing in this wave: this review's own earlier
  finding (`qw20260917154546-d7-02-type-position-registry-reimplements-registry-oracle.md`)
  concerns the separate `REGISTRY` constant's four-page construction against
  `tests/helpers/registry-oracle.ts`; this finding is a distinct root cause —
  the message-READING function's duplication against
  `tests/helpers/load-row-harness.ts`'s `registryMessageOf` — and does not
  restate that finding's claim.
- Prior-filing overlap check: `grep -rl "registryMessageOf"
  quality/intake/*.md quality/resolved/*.md` lists many prior filings, none
  of which names either of this review's two files in `locations:`.
- Coverage check: the claim is about a repeated function DEFINITION, not a
  missing test path; both copies of `msg` are exercised by every group in
  their own file today.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — re-verified independently: both `msg` bodies reproduce verbatim at remaining-identifier-positions:211-232 and type-position:218-239 and diff byte-identical (executable lines :217-232 vs :224-239); tests/helpers/load-row-harness.ts:56-82 `registryMessageOf(registry, registryPath, code, fills)` is the same five-step body bar the parameterised path string, is live (26 other tests import it), and is a drop-in since every `msg` call site in both files (6 and ~20 resp.) is a plain `(code, fills)` call and both local `RegistryRow` shapes structurally satisfy the helper's `{code, message}`; neither file imports load-row-harness; stated greps re-run (docs/bugs `function msg(code` → 0; coverage-matrix → 0; bug docs 0044/0153 never name `msg`); neither file is a gate nor backs a recording double; 118/118 green at HEAD; not a duplicate — resolved PTQ-0206/0219/0228/0271/0327/0409/0412 name other files and same-wave siblings d7-02 target the REGISTRY load at :116-135 / registry-oracle, not this reader; minor: frontmatter carries an extraneous `d4_class` on a D7 filing, non-blocking — same D7 boilerplate-duplication class as PTQ-0219/0228/0409 (triage: claude-fable-5-1)
