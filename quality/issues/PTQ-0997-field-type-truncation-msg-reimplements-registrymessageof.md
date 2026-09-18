---
id: PTQ-0997
title: inline-object-empty-field-type-truncation.test.ts redeclares a local msg() that duplicates the canonical registryMessageOf helper
lens: D7
status: open
verdict: confirmed
locations:
  - tests/inline-object-empty-field-type-truncation.test.ts:270-284
  - tests/helpers/load-row-harness.ts:62-81
sites: 1
fix_scope: localized
wave: qw20260918155535
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# inline-object-empty-field-type-truncation.test.ts redeclares a local msg() that duplicates the canonical registryMessageOf helper

## Observation
`tests/helpers/load-row-harness.ts` exports `registryMessageOf(registry,
registryPath, code, fills)`: it looks up a registry row's *Message* template
via `registryMessage`, asserts the template is defined (naming the registry
page in the failure), asserts and fills each named placeholder in order, and
returns the rendered string. `tests/inline-object-empty-field-type-truncation.test.ts`
declares a local `msg(code, fills)` that performs the identical
lookup-assert-fill sequence against its own module-scope `REGISTRY` constant
and a hard-coded registry-path string literal, rather than importing
`registryMessageOf`.

## Evidence

`tests/helpers/load-row-harness.ts:62-81` (the canonical helper, re-read
immediately before filing):
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

`tests/inline-object-empty-field-type-truncation.test.ts:270-284` (re-read
immediately before filing — identical lookup-assert-fill body, only the
closed-over `REGISTRY` and a hard-coded path replace the two parameters):
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
Diffing the two bodies with only `registry`→`REGISTRY` and
`${registryPath}`→a hard-coded path string substituted back produces zero
differences. The file already imports `registryMessage` directly from
`../tools/code-registry/index.js` (its own header import block) and already
imports `REGISTRY` from `./helpers/registry-oracle`, but does not import
`registryMessageOf` from `./helpers/load-row-harness`. `msg` is live: it is
called from every `render(exp)` invocation the file's `renderAll` helper
drives, which every `expectGroup` call in the file depends on.

## Why this is a problem
The lookup-assert-fill sequence this file needs — read the *Message*
template, assert it is defined naming the registry page, assert and fill
each placeholder in order, return the rendered string — is byte-for-byte the
body of the already-exported `registryMessageOf`. `tests/fn-param-list-unclosed.test.ts`
demonstrates the thin, correct call-site usage in the same codebase
(`registryMessageOf(REGISTRY, "docs/spec_topics/diagnostics/code-registry-parse.md",
code, fills)`), so the duplication here is not a difference in need but a
second hand-typed copy of the same function body. A change to the
placeholder-fill contract (for example, the "row absent" wording or the
placeholder-order assertion) would need to be hand-applied here independently
of the canonical helper, with nothing to keep the two in step.

## Suggested direction (non-binding, optional)
`tests/helpers/load-row-harness.ts`'s `registryMessageOf`, already imported
successfully elsewhere in the suite (for example
`tests/fn-param-list-unclosed.test.ts`), is the natural source for this
file's `msg` body rather than a locally retyped copy.

## False-positive check
- Gate-pin check: `tests/inline-object-empty-field-type-truncation.test.ts`
  does not match `*gate*.test.ts` or the named gate-kin patterns
  (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate); the cited
  lines are a message-rendering utility, not a pinned count or inventory.
- Recording-double check: not applicable — `msg` renders a string from a
  registry lookup and records no calls; no MUST-NOT witness is involved.
- Design-comment check: `tests/helpers/registry-oracle.ts`'s own header
  states "each file's own `registryMessageOf` / `registryRowOf`-shaped
  reader — whose assertion style and wording vary per file — stays local,
  parameterised by the `REGISTRY` this module exports rather than by a
  locally re-parsed copy." That rationale is about wording that *varies* per
  file; this file's `msg` body is not a variant — its assertion strings and
  control flow are byte-identical to `registryMessageOf`'s (confirmed by
  direct comparison above), so the stated rationale for staying local does
  not describe this site.
- docs/bugs/ signature search: `grep -n "registryMessageOf\|function msg("
  docs/bugs/0237-empty-inline-field-type-truncates-interior.md` → 0 hits; the
  bug doc states no rationale for a locally re-typed message renderer.
- coverage-matrix/bug-doc citation search: `grep -n
  "inline-object-empty-field-type-truncation" docs/reference/coverage-matrix.md`
  → 0 hits. This finding proposes no change to any `it()`/`describe()` name,
  count, or assertion, only to where the `msg` body is sourced from. The file
  is named in docs/bugs/0237's own witness list (as `(e)`), which this
  finding does not disturb.
- Coverage check: the claim is about a repeated function DEFINITION; every
  registry row this file references is already exercised through the local
  `msg`, and no behaviour path is claimed untested.
- Overlap check: `grep -rl "inline-object-empty-field-type-truncation"
  quality/issues/*.md quality/intake/*.md quality/resolved/*.md` finds
  PTQ-0596 (Cell/expectGroup harness), PTQ-0755/PTQ-0759 (offender-probe
  clean harness), PTQ-0776 (a *live-cell* sibling file's registry re-read,
  not this unit-tier file), PTQ-0800/PTQ-0801/PTQ-0877 (diagLines
  reimplementation), and resolved PTQ-0473/PTQ-0555 (four-page REGISTRY read
  and the FM/theta fixture builder). None of these names `msg` or the
  registryMessageOf-duplication root cause; the established
  `msg`-reimplements-`registryMessageOf` class (e.g. PTQ-0808, PTQ-0811,
  PTQ-0817, PTQ-0819, PTQ-0827, PTQ-0834, PTQ-0835, PTQ-0859) is filed
  per-file and none of those locations lists include this file.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — both excerpts reproduce verbatim at tests/inline-object-empty-field-type-truncation.test.ts:270-284 and tests/helpers/load-row-harness.ts:62-81; a mktemp diff of the two bodies after substituting `REGISTRY`→`registry` and the hard-coded `docs/spec_topics/diagnostics/` path→`${registryPath}` is empty (only the signature line differs), the local `msg` is live (sole caller `render` at :376 feeds every `expectGroup`), the file imports `registryMessage` + `REGISTRY` but never `registryMessageOf` (`grep load-row-harness` → 0), tests/fn-param-list-unclosed.test.ts:1,133 shows the thin call-site shape already in use, and the file is green (10/10); the registry-oracle.ts:7-10 "wording varies per file — stays local" rationale does not cover a byte-identical body; docs/bugs/0237 (0) and coverage-matrix (0) searches reproduce; not a duplicate: resolved PTQ-0473 explicitly left the `msg` renderer out of scope (:135) and none of the per-file `msg`-reimplements-`registryMessageOf` issues (PTQ-0808/0811/0817/0819/0827/0834/0835/0859/0861/0880/0939/0840/0951) list this file — fix is a mechanical import + one-line delegation (triage: claude-fable-5-1)
