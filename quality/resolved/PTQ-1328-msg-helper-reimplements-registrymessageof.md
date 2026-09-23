---
id: PTQ-1328
title: Both in-scope files redeclare a local msg() that reimplements the canonical registryMessageOf/registryLineOf pair from tests/helpers/load-row-harness.ts
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/inline-empty-object-type.test.ts:137-157
  - tests/inline-object-duplicate-field-name.test.ts:170-190
  - tests/helpers/load-row-harness.ts:61-136
sites: 2
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# Both in-scope files redeclare a local msg() that reimplements the canonical registryMessageOf/registryLineOf pair from tests/helpers/load-row-harness.ts

## Observation
Both files in scope declare a module-private `msg(code, fills)` helper that
looks up a registry row's *Message* template via `registryMessage(REGISTRY,
code)`, asserts the template is defined (naming DIAG-4), then asserts each
placeholder is present before substituting it with `.replace`. This is the
same lookup-assert-substitute sequence, with the same DIAG-4 failure-message
wording, that `tests/helpers/load-row-harness.ts` already exports as
`registryMessageOf` (feeding `registryLineOf`, which additionally renders the
`"<code>: <message>"` line both files build separately via their own local
`line()` helper). Neither file imports `registryMessageOf` or
`registryLineOf`.

## Evidence
`tests/helpers/load-row-harness.ts:61-100` (the canonical export; excerpt of
the lookup-assert-substitute body, re-read immediately before filing):
```ts
export function registryMessageOf(
  registry: readonly RegistryRow[],
  registryPath: string,
  code: string,
  fills: ReadonlyArray<readonly [string, string]> = [],
  options: { ... } = {},
): string {
  const template = registryMessage(registry, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: ${registryPath} must carry the Message row for ${code}`,
  ).toBeTypeOf("string");
  ...
  let out = template as string;
  for (const [placeholder, value] of fills) {
    expect(
      out,
      `DIAG-4: the ${code} Message template must carry the ${placeholder} placeholder; template=${JSON.stringify(template)}`,
    ).toContain(placeholder);
    out = options.replaceAll ? out.replaceAll(placeholder, value) : out.replace(placeholder, value);
  }
  return out;
}
```

`tests/inline-empty-object-type.test.ts:137-152` (re-read immediately before
filing):
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

`tests/inline-object-duplicate-field-name.test.ts:170-186` (re-read
immediately before filing; identical body, the only diff being the anchor
string on line 4, `docs/spec_topics/diagnostics/` rather than
`docs/spec_topics/diagnostics/code-registry-parse.md`):
```ts
function msg(code: string, fills: ReadonlyArray<readonly [string, string]>): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/ must carry the Message row for ${code}`,
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

Exact search: `grep -n "^function msg(code: string, fills" tests/inline-empty-object-type.test.ts tests/inline-object-duplicate-field-name.test.ts` returns exactly one declaration per file (the entire in-scope set for this review). Neither file's import list (`import { REGISTRY } from "./helpers/registry-oracle"` at :1, or the `./helpers/e2e-s1` import) names `registryMessageOf` or `registryLineOf`, and `grep -n "load-row-harness" tests/inline-empty-object-type.test.ts tests/inline-object-duplicate-field-name.test.ts` returns 0 hits in both files.

## Why this is a problem
The lookup-assert-substitute sequence — read the registry row, assert it is
defined naming DIAG-4, assert each placeholder is present before
substitution — is restated independently in both files with the same failure
wording the canonical export already carries, rather than composed from the
existing `registryMessageOf` export both files could reach (each already
imports from a sibling `tests/helpers/` module: `registry-oracle` for
`REGISTRY`, `e2e-s1` for `parseDoc`/`body`/etc.). The two local copies have
already drifted from each other in one respect (the anchor path string in the
`toBeDefined` failure message), which is exactly the kind of drift a shared
definition would foreclose.

## Suggested direction (non-binding, optional)
Both files' local `msg()`/`line()` pair could be replaced by calls to the
existing `registryMessageOf`/`registryLineOf` exports of
`tests/helpers/load-row-harness.ts`, which already perform the same
lookup-assert-substitute-and-render sequence.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate kin
  (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate); the cited
  lines are a message-rendering helper, not a pinned count or inventory.
- Recording-double check: `msg`/`registryMessageOf` render an
  already-looked-up template string for a positive-value assertion; neither
  records calls nor backs a "never called" witness, so the negative-witness
  carve-out does not apply.
- docs/bugs/ signature search: `grep -n "function msg(" docs/bugs/0045*.md
  docs/bugs/0052*.md` → 0 hits; neither bug document states a rationale for
  keeping this lookup local to each file rather than importing the existing
  export.
- coverage-matrix/bug-doc citation search: `grep -n
  "inline-empty-object-type\|inline-object-duplicate-field-name"
  docs/reference/coverage-matrix.md` → 0 hits. Both files are pinned by name
  in their own bug documents' witness lists (0045, 0052, and related
  0093/0159-0161/0176/0228/0233/0245/0262/0263 citations by absolute cell
  id); this finding proposes no merge, rename, or deletion of any file,
  `describe()`, or `it()` — only that each file's local `msg()`/`line()`
  declaration could call the existing `registryMessageOf`/`registryLineOf`
  exports instead, so no cited witness cell is disturbed.
- Coverage check: the claim is entirely about a repeated function
  DEFINITION; every copy is exercised by its own file's tests, and no
  behaviour path is claimed untested.
- Overlap check: `grep -rl "inline-empty-object-type\|inline-object-duplicate-field-name" quality/resolved quality/intake quality/issues` finds PTQ-0205 (diagLines/diagCodes, a different helper pair, already fixed — both files now import `diagLines`/`diagnosticListHarness` from `./helpers/e2e-s1`), PTQ-0425 (the `ajv()` builder in the second file, a different function), and PTQ-0751 (the `body`/`paramsSrc`/`annotSrc`/`invokeSrc`/`emptyCtx`/`expectList` fixture-and-assertion harness, already fixed — confirmed both files now import that whole set from `./helpers/e2e-s1` rather than declaring it locally). None of the three names `msg()` or `registryMessageOf`/`registryLineOf`; this is a distinct, previously untracked root cause.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — excerpts reproduce verbatim at tests/inline-empty-object-type.test.ts:137-152 and tests/inline-object-duplicate-field-name.test.ts:170-186 (bodies identical except the DIAG-4 anchor path string, i.e. already drifted), the lookup-assert-substitute sequence is the same one tests/helpers/load-row-harness.ts:61-100 exports as registryMessageOf, neither file imports load-row-harness (grep 0 hits), both copies are live (7 and 9 call sites), and no prior PTQ names either file for msg() (PTQ-0205/0425/0751 cover diagLines, ajv(), and the fixture harness; the msg→registryMessageOf family PTQ-0616/0808/0811/0819/0827/0834/0835/0859/0997/1089 cite other files) — one caveat for the fixer: the second file's local line() renders a "warning" severity at :244, which registryLineOf (hardcoded "error") does not cover, so only msg() maps 1:1 onto the canonical export (triage: claude-fable-5-1)
