---
id: PTQ-0819
title: fn-call-arity-unchecked.test.ts and fn-param-annotation-optional.test.ts each re-declare a local msg()/row() pair that duplicates the canonical registryMessageOf helper the third file in the same trio already imports
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/fn-call-arity-unchecked.test.ts:140-175
  - tests/fn-param-annotation-optional.test.ts:322-335
  - tests/fn-param-list-unclosed.test.ts:132-134
  - tests/helpers/load-row-harness.ts:56-73
sites: 2
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# fn-call-arity-unchecked.test.ts and fn-param-annotation-optional.test.ts each re-declare a local msg()/row() pair that duplicates the canonical registryMessageOf helper the third file in the same trio already imports

## Observation
`tests/helpers/load-row-harness.ts` exports `registryMessageOf(registry, registryPath, code, fills)`, which looks up a registry row's *Message* template, asserts it is defined (naming the registry page in the failure), fills each named placeholder after asserting its presence, and returns the rendered string. `tests/fn-param-list-unclosed.test.ts` imports this export directly and wraps it in a one-line local `msg`. `tests/fn-call-arity-unchecked.test.ts` and `tests/fn-param-annotation-optional.test.ts` each instead declare a local `msg` (and, in the arity file, a companion `row`) that performs the same lookup-assert-fill sequence over the same `readRegistry(["parse"])` registry object, without importing `registryMessageOf`.

## Evidence
tests/helpers/load-row-harness.ts:56-73 (the canonical helper):
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

tests/fn-param-list-unclosed.test.ts:132-134 (the correct, thin usage — the contrastive baseline inside this same file trio):
```ts
function msg(code: string, fills: ReadonlyArray<readonly [string, string]> = []): string {
  return registryMessageOf(REGISTRY, "docs/spec_topics/diagnostics/code-registry-parse.md", code, fills);
}
```
(import at tests/fn-param-list-unclosed.test.ts:1 — `import { registryMessageOf } from "./helpers/load-row-harness";`.)

tests/fn-call-arity-unchecked.test.ts:140-175 (re-implements the same lookup-assert-fill sequence, split across two locally-declared functions, despite importing `PARSE_REGISTRY_PATH` from the very module that exports `registryMessageOf` — see import at line 1):
```ts
function row(code: string, why: string): RegistryRow {
  const found = REGISTRY.find((r) => r.code === code);
  expect(
    found,
    `DIAG-4 / DIAG-2: ${REGISTRY_PAGE} must carry the registered row for ${code} — ${why}. ...`,
  ).toBeDefined();
  return found as RegistryRow;
}

function msg(
  code: string,
  fills: ReadonlyArray<readonly [string, string]>,
  why: string,
): string {
  row(code, why);
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4: ${REGISTRY_PAGE} carries no *Message* column value for ${code} — ${why}`,
  ).toBeDefined();
  let out = template as string;
  for (const [placeholder, value] of fills) {
    ...
```

tests/fn-param-annotation-optional.test.ts:322-335 (re-implements the identical lookup-assert-fill sequence, with the registry path hard-coded in the assertion string rather than threaded as a parameter, and imports only `readRegistry` from `./helpers/registry-oracle`, never `registryMessageOf`):
```ts
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

## Why this is a problem
The three files in this wave's review scope share one bug-family (fn parameter-list parsing) and one DIAG-4 message-rendering need, and the canonical helper for exactly that need — `registryMessageOf` — already exists and is already imported successfully by one of the three (`fn-param-list-unclosed.test.ts`). The other two independently retype the identical `expect(template).toBeDefined()` / placeholder-fill loop rather than importing the export sitting in a module one of them (`fn-call-arity-unchecked.test.ts`) already partially imports (`PARSE_REGISTRY_PATH`). A change to the placeholder-fill contract — e.g. asserting placeholder order, or changing the "row absent" failure wording — would need to be hand-applied in three places with nothing to keep them in step, and two of the three copies are already worded differently from the canonical one and from each other.

## Suggested direction (non-binding, optional)
`tests/helpers/load-row-harness.ts`'s `registryMessageOf` is already the shared home for this lookup-assert-fill sequence and is already imported successfully by the third file in this same trio, as observation rather than design.

## False-positive check
Gate-pin check: none of the three files matches `*gate*.test.ts` or the named gate-kin patterns; these are message-rendering utility functions, not a pinned count or inventory. Recording-double check: not applicable — these functions render a string from a registry lookup and record no calls. docs/bugs/ signature search: `grep -rl "registryMessageOf" docs/bugs/*.md` returned no hits; no open bug pins either local `msg`/`row` shape as a witnessed correct-reason red. coverage-matrix/bug-doc citation search: `grep -n "fn-call-arity-unchecked\|fn-param-annotation-optional" docs/reference/coverage-matrix.md` returned no hits naming either file by its `msg`/`row` helpers; this finding proposes no merge, rename or deletion of any `it()`/`describe()`, only that the two local re-implementations could import the already-exported helper the third file in this same trio uses. Checked quality/intake and quality/issues for prior filings naming `registryMessageOf` (PTQ-0430, PTQ-0431, PTQ-0638, PTQ-0747, PTQ-0750, PTQ-0776, PTQ-0777, PTQ-0786, and this wave's `qw20260918050411-d7-01-generic-argument-msg-reimplements-registrymessageof.md`) — none cite `fn-call-arity-unchecked.test.ts` or `fn-param-annotation-optional.test.ts`, so this is a distinct pair of sites for the same already-recognised root cause, not a re-file of an existing finding.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all excerpts reproduce (canonical `registryMessageOf` sits at tests/helpers/load-row-harness.ts:62-82, a tolerated 6-line drift from the cited 56-73); awk-extracted `msg` body from tests/fn-param-annotation-optional.test.ts:322-335 diffs to ZERO against the canonical body after substituting the closed-over `REGISTRY`/hard-coded path, and tests/fn-call-arity-unchecked.test.ts:161-174 `msg` is the same lookup-assert-fill body plus a `row(code, why)` pre-check and `why` threaded into two assertion strings (`*Message*` vs `Message`), exactly the divergence the filing states; neither file imports `registryMessageOf` (0 hits each; 47 other tests do), both copies are live (5 `msg(`+2 `row(` and 2 `msg(` call sites), all locations under tests/, D7 boilerplate-duplication class, stated searches reproduce (docs/bugs `registryMessageOf` → 0; coverage-matrix cite of either file → 0), no gate/recording-double/red-test carve-out; not a duplicate — PTQ-0522 cites the same file pair but covers the `at`/`render` helpers, PTQ-0567 covered the trio's third file (now fixed, hence its thin wrapper), and store precedent (PTQ-0616, PTQ-0495, PTQ-0747, both same-wave `msg-reimplements-registrymessageof` siblings confirmed) rules these per file set since the fix is a per-file import rather than a canonical-side change (triage: claude-fable-5-1)
