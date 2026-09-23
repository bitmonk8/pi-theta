---
id: PTQ-1378
title: unterminated-literal-params-type-refusal.test.ts's local msg() reimplements the canonical registryMessageOf reader
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/unterminated-literal-params-type-refusal.test.ts:161-175
  - tests/helpers/load-row-harness.ts:62-100
sites: 1
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# unterminated-literal-params-type-refusal.test.ts's local msg() reimplements the canonical registryMessageOf reader

## Observation
`tests/unterminated-literal-params-type-refusal.test.ts` declares a
module-private `msg(code, fills)` that reads a registry row's *Message*
template via `registryMessage(REGISTRY, code)`, asserts the template is
defined naming DIAG-4, loops over `fills` asserting each placeholder is
present before substituting it with `.replace`. `tests/helpers/load-row-harness.ts`
already exports `registryMessageOf(registry, registryPath, code, fills,
options)` performing the identical lookup-assert-substitute sequence with the
same failure-message wording, generalised over an arbitrary placeholder list
and an optional `replaceAll` mode. The file does not import
`load-row-harness.ts`.

## Evidence
`tests/unterminated-literal-params-type-refusal.test.ts:161-175` (re-read
immediately before filing):
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

`tests/helpers/load-row-harness.ts:62-89` (re-read immediately before
filing) — the canonical export performing the same lookup-assert-substitute
sequence:
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
`registryMessageOf(REGISTRY, "docs/spec_topics/diagnostics/code-registry-parse.md", code, fills)`
produces the same output `msg(code, fills)` returns today, save for the
`registryPath` string embedded in the failure message (the local copy hard-codes
`"docs/spec_topics/diagnostics/"`, dropping the page basename the export would
carry).

Exact search: `grep -n "^function msg(code: string, fills" tests/unterminated-literal-params-type-refusal.test.ts` returns exactly one declaration; `grep -n "load-row-harness" tests/unterminated-literal-params-type-refusal.test.ts` returns 0 hits.

## Why this is a problem
The function is harness plumbing — turning a registry-row lookup into a loud,
named failure and filling a placeholder list — not domain logic specific to
bug 0232's subject, and the same lookup-assert-substitute sequence already
exists as an exported, generalised helper. The local copy has already drifted
from the canonical one in its failure-message wording (a bare
`"docs/spec_topics/diagnostics/"` string rather than the specific registry
page path the export threads through), which a shared definition would
foreclose.

## Suggested direction (non-binding, optional)
Calling the existing `registryMessageOf` export with the
`code-registry-parse.md` path in place of the local `msg()` body would remove
the local lookup-assert-substitute copy.

## False-positive check
- Gate-pin check: the file does not match `*gate*.test.ts` or the named gate
  kin; the cited lines are a registry-message reader, not a pinned count or
  inventory.
- Recording-double check: `msg()` performs a synchronous registry lookup and
  string fill; it records no calls and backs no "never called" witness, so
  the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -n "function msg(\|registryMessageOf" docs/bugs/0232-unterminated-literal-params-type-drops-inline-fields.md` returns 0 hits stating a rationale for a local copy.
- coverage-matrix/bug-doc citation search: `grep -n "unterminated-literal-params-type-refusal" docs/reference/coverage-matrix.md` returns 0 hits. The bug doc cites this file by name and by cell id (A1-A9, B1-B9, D1-D8, E1-E2), never by `msg()`'s internal implementation; this finding proposes no change to any `it()`/`describe()` name, count, or assertion — only to where the lookup-assert-substitute sequence is defined.
- Coverage check: the claim is about a repeated function DEFINITION with an already-exported canonical counterpart, not a missing test path; the local copy is exercised by every `msg`/`render`/`renderAll` call in the file.
- Prior-filing overlap check: `grep -rl "unterminated-literal-params-type-refusal.test.ts" quality/resolved quality/intake quality/issues` returns PTQ-0058, PTQ-0596, PTQ-0734, PTQ-0830, PTQ-0864, PTQ-1055 — none name the local `msg()` function or `registryMessageOf`. The exact search `grep -rln "^function msg(code: string, fills" tests/*.test.ts` finds 49 files sharing this identical body (each reading different codes), reflecting this repo's established per-file filing convention (see PTQ-1001 for the `unresolvedMessage` analogue); this finding is scoped to this one file's copy only.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: `msg()` reproduces verbatim at tests/unterminated-literal-params-type-refusal.test.ts:161-175 and `registryMessageOf` at tests/helpers/load-row-harness.ts:62-100 performing the same lookup-assert-substitute with identical placeholder wording (local copy differs only in `toBeDefined` vs `toBeTypeOf("string")` and the hard-coded `docs/spec_topics/diagnostics/` path); `grep load-row-harness` in the file → 0 hits, `^function msg(code: string, fills` → 1 hit in file / 51 files repo-wide; the copy is live via `render`/`renderAll` → `expectGroupShared`; `registryMessageOf(REGISTRY, …)` is already called by 40 sibling tests with the same `registry-oracle` REGISTRY, so the migration is a drop-in; not a gate file, no recording double, docs/bugs/0232 and coverage-matrix greps → 0 rationale for a local copy; dedupe: PTQ-1055 covers only the `render`/`renderAll` trio (its note explicitly defers `msg` to per-file PTQ-0808-style filings), PTQ-0596/0734/0830/0864 name other helpers, and the per-file convention (PTQ-0808, 0819, 0827, 0834, 0835, 0997, 1001, 1046) has no entry for this file — D7 boilerplate-duplication class (triage: claude-fable-5-1)
