---
id: PTQ-0834
title: schema-alias-union-decl.test.ts redeclares a local msg() that duplicates the canonical registryMessageOf helper
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/schema-alias-union-decl.test.ts:190-205
  - tests/helpers/load-row-harness.ts:56-73
sites: 1
fix_scope: localized
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# schema-alias-union-decl.test.ts redeclares a local msg() that duplicates the canonical registryMessageOf helper

## Observation
`tests/helpers/load-row-harness.ts` exports `registryMessageOf(registry, registryPath, code, fills)`: it looks up a registry row's *Message* template via `registryMessage`, asserts the template is defined (naming the registry page in the failure), fills each named placeholder after asserting its presence, and returns the rendered string. `tests/schema-alias-union-decl.test.ts` declares a local `msg(code, fills)` that performs the identical lookup-assert-fill sequence against its own `REGISTRY` constant and a hard-coded registry-path string, rather than importing `registryMessageOf`.

## Evidence
`tests/helpers/load-row-harness.ts:56-73` (the canonical helper, re-read immediately before filing):
```ts
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

`tests/schema-alias-union-decl.test.ts:190-205` (re-read immediately before filing — identical lookup-assert-fill body, only the closed-over `REGISTRY`/hard-coded path replace the two parameters):
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
The file already imports `registryMessage` directly from `../tools/code-registry/index.js` (line 4) rather than through `load-row-harness.ts`, and already imports `REGISTRY` from `./helpers/registry-oracle` (line 1) but not `registryMessageOf` from `./helpers/load-row-harness`.

## Why this is a problem
The lookup-assert-fill sequence this file needs — read the *Message* template, assert it is defined naming the registry page, assert and fill each placeholder in order, return the rendered string — is byte-for-byte the body of the already-exported `registryMessageOf`. `tests/fn-param-list-unclosed.test.ts` demonstrates the thin, correct usage in the same codebase (`return registryMessageOf(REGISTRY, "docs/spec_topics/diagnostics/code-registry-parse.md", code, fills);`), so the duplication here is not a difference in need but a second hand-typed copy of the same function body. A change to the placeholder-fill contract (e.g. the "row absent" wording, or placeholder-order assertion) would need to be hand-applied here independently of the canonical helper, with nothing to keep the two in step.

## Suggested direction (non-binding, optional)
`tests/helpers/load-row-harness.ts`'s `registryMessageOf`, already imported successfully elsewhere in the suite (e.g. `tests/fn-param-list-unclosed.test.ts`), is the natural source for this file's `msg` body rather than a locally retyped copy.

## False-positive check
- Gate-pin check: `tests/schema-alias-union-decl.test.ts` does not match `*gate*.test.ts` or the named gate-kin patterns; the cited lines are a message-rendering utility, not a pinned count or inventory.
- Recording-double check: not applicable — `msg` renders a string from a registry lookup and records no calls; no MUST-NOT witness is involved.
- Design-comment check: `tests/helpers/registry-oracle.ts:1-13`'s own header states "each file's own `registryMessageOf` / `registryRowOf`-shaped reader — whose assertion style and wording vary per file — stays local, parameterised by the `REGISTRY` this module exports rather than by a locally re-parsed copy." That rationale is about wording that *varies* per file; this file's `msg` body is not a variant — its assertion strings and control flow are byte-identical to `registryMessageOf`'s (confirmed by direct comparison above), so the stated rationale for staying local does not describe this site.
- docs/bugs/ signature search: `grep -n "registryMessageOf\|function msg(" docs/bugs/0033-body-level-schema-alias-unsupported.md` → 0 hits; the bug doc states no rationale for a locally re-typed message renderer.
- coverage-matrix/bug-doc citation search: `grep -n "schema-alias-union-decl" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no change to any `it()`/`describe()` name, count, or assertion, only to where the `msg` body is sourced from.
- Overlap check: `grep -rl "schema-alias-union-decl" quality/intake/*msg*registrymessageof* quality/intake/*-02-msg-registered-reimplement-registrymessageof.md quality/issues/PTQ-0430* quality/issues/PTQ-0431* quality/issues/PTQ-0638* quality/issues/PTQ-0747* quality/issues/PTQ-0750* quality/issues/PTQ-0776* quality/issues/PTQ-0777* quality/issues/PTQ-0786*` → 0 hits; none of the existing `msg`-reimplements-`registryMessageOf` filings (this wave or prior) name this file, so this is a distinct, previously untracked site of the same recognised root cause.
- Coverage check: the claim is about a repeated function DEFINITION; every registry row this file references is already exercised through the local `msg`, and no behaviour path is claimed untested.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim (`msg` at tests/schema-alias-union-decl.test.ts:190-205; `registryMessageOf` at tests/helpers/load-row-harness.ts:62-81, tolerated drift from cited 56-73); sed-extracted `msg` body (:191-204) with only `REGISTRY`→`registry` and the path literal→`${registryPath}` substituted diffs to ZERO against the canonical body (:68-81); `msg` is live (52 call sites) and the file imports neither `registryMessageOf` nor `load-row-harness`, while its already-imported four-page `REGISTRY` is a drop-in first argument exactly as tests/fn-param-list-unclosed.test.ts:1,133 uses it; git shows `msg` landed in f959f8de (2026-08-01) before the helper existed (2594cd44, 2026-09-11) and was never migrated; stated searches reproduce (bug-0033 `registryMessageOf|function msg(` → 0; coverage-matrix file cite → 0); bug docs cite the test file but no it()/describe() change is proposed, not a gate file, no recording double, and registry-oracle.ts's "wording varies per file" rationale does not describe a byte-identical body; D7 boilerplate-duplication class, both locations under tests/; distinct from resolved PTQ-0506 (this file's four-page REGISTRY read — a different root cause, whose fix is why the file now imports `REGISTRY`), and no open/resolved registryMessageOf PTQ (0430/0431/0495/0502/0527/0539/0567/0616/0747/0750/0776/0777/0786) names this file; same-wave siblings on disjoint files (d7-01-generic-argument, -inline-object-type-source-wire-name, -msg-row, -quoted-stray, -misfire-faces) were each confirmed individually since the exported helper makes every site an independent per-file import (triage: claude-fable-5-1)
