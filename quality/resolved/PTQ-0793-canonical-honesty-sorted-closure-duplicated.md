---
id: PTQ-0793
title: Both files reimplement a local key-sort canonicaliser instead of importing canonical-slug-oracle.ts's assertKeysSorted
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/params-literal-sublanguage-lowering.test.ts:483-505
  - tests/params-scalar-nontype-text-refusal.test.ts:944-970
  - tests/helpers/canonical-slug-oracle.ts:37-51
sites: 2
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# Both files reimplement a local key-sort canonicaliser instead of importing canonical-slug-oracle.ts's assertKeysSorted

## Observation
Both in-scope files already import `inlineDefName` from
`tests/helpers/canonical-slug-oracle.ts`, whose header states the oracle
holds the schema-subset.md §Canonical schema hash checks independent of the
implementation under test. That same module also exports `assertKeysSorted`,
which asserts recursively that every object's keys in a parsed value are
Unicode-code-point sorted — exactly the check both in-scope files' own "the
oracle's own honesty" describe blocks perform. Instead of importing
`assertKeysSorted`, each file declares its own byte-identical local `sorted`
closure and compares `JSON.stringify(sorted(fragment))` against the
canonical string by hand.

## Evidence
`tests/params-literal-sublanguage-lowering.test.ts:483-505`:
```ts
    it(`CONTROL (o2, ${label}): the canonical form sorts every object's keys and carries no insignificant whitespace`, () => {
      expect(
        canonical,
        `schema-subset.md:101 — no space or newline between tokens; observed ${canonical}`,
      ).toBe(JSON.stringify(JSON.parse(canonical)));
      const sorted = (value: unknown): unknown => {
        if (Array.isArray(value)) {
          return value.map(sorted);
        }
        if (value !== null && typeof value === "object") {
          return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
              .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
              .map(([k, v]) => [k, sorted(v)]),
          );
        }
        return value;
      };
      expect(
        canonical,
        `schema-subset.md:100 — object keys sorted by Unicode code point at every level; :104 — ` +
          `array elements left in lowering order; observed ${canonical}`,
      ).toBe(JSON.stringify(sorted(fragment)));
    });
```

`tests/params-scalar-nontype-text-refusal.test.ts:944-970`:
```ts
describe("bug 0059 (d0) — the independent `__inline_<slug>` oracle's own honesty", () => {
  for (const [label, canonical, fragment] of CANONICAL_PAIRS) {
    it(`GREEN (d0, ${label}): the hand-written canonical form is the fragment it names, canonicalised`, () => {
      expect(
        JSON.parse(canonical),
        `schema-subset.md:98 hashes the LOWERED fragment, so the oracle's canonical string must ` +
          `carry exactly that value; observed ${canonical}`,
      ).toEqual(fragment);
      const sorted = (value: unknown): unknown => {
        if (Array.isArray(value)) {
          return value.map(sorted);
        }
        if (value !== null && typeof value === "object") {
          return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
              .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
              .map(([k, v]) => [k, sorted(v)]),
          );
        }
        return value;
      };
      expect(
        canonical,
        `schema-subset.md:100 — object keys sorted by Unicode code point at every level; :101 — ` +
          `no insignificant whitespace; observed ${canonical}`,
      ).toBe(JSON.stringify(sorted(fragment)));
    });
  }
});
```

The `sorted` closure body (lines 488-500 in the first file, 952-964 in the
second) is character-for-character identical between the two files; only the
`describe`/`it` title wording and the accompanying `expect` message wording
around it differ.

`tests/helpers/canonical-slug-oracle.ts:37-51` (the exported helper neither
file imports for this check):
```ts
export function assertKeysSorted(label: string, value: unknown, path = "$"): void {
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertKeysSorted(label, item, `${path}[${i}]`));
    return;
  }
  if (typeof value !== "object" || value === null) {
    return;
  }
  const keys = Object.keys(value as Record<string, unknown>);
  expect(
    keys,
    `${label}: §Canonical schema hash step 2 (:100) sorts object keys by Unicode code point; keys at ${path} are ${JSON.stringify(keys)}`,
  ).toEqual([...keys].sort(compareCodePoint));
  for (const key of keys) {
    assertKeysSorted(label, (value as Record<string, unknown>)[key], `${path}.${key}`);
  }
}
```

Exact search, `grep -rln "const sorted = (value: unknown): unknown =>" tests/*.ts`
→ 6 files: the two in scope plus
`tests/generic-argument-literal-lowering.test.ts`,
`tests/literal-union-string-enum-emission.test.ts`,
`tests/schema-body-nontype-text-refusal.test.ts` and
`tests/union-arm-literal-const-lowering.test.ts` (out of this review's
scope, cited only to show the same closure is not unique to the pair filed
here).

Exact search, `grep -rn "assertKeysSorted" tests/*.ts` → the helper's own
declaration plus five importing call sites: `annotation-root-brace-union-lowering.test.ts:527`,
`inline-object-nested-lowering.test.ts:654`, `params-brace-union-rhs-lowering.test.ts:608`,
`params-inline-object-lowering.test.ts:472`, and
`schema-slug-canonical-form-mints.test.ts:184,907` — each importing
`assertKeysSorted` from `"./helpers/canonical-slug-oracle"` and calling it
as `assertKeysSorted(label, JSON.parse(canonical))` for the identical
"the canonical form's keys are code-point sorted" check that both in-scope
files instead perform with the local `sorted` closure.

## Why this is a problem
`tests/helpers/canonical-slug-oracle.ts` already carries a test-only,
non-production, recursive key-sort assertion (`assertKeysSorted`) purpose-built
for this exact check, and both in-scope files already import a sibling
export (`inlineDefName`) from that same module — so the module is already on
each file's import list. Rather than adding `assertKeysSorted` to that same
import, each file types out its own ten-line recursive canonicalising closure,
identically in both files, to perform the equivalent check by a different
mechanism (full deep-sort-and-restringify comparison instead of a recursive
key-order assertion). A change to how the shared oracle enforces "objects
keys sorted by Unicode code point" — for example switching the comparator
used at `helpers/canonical-slug-oracle.ts:44` — would not reach either
in-scope file's own `sorted` closure.

## Suggested direction (non-binding, optional)
Both `o2`/`d0` checks could add `assertKeysSorted` to the existing
`"./helpers/canonical-slug-oracle"` import already used for `inlineDefName`
and drop the local `sorted` closure, the way five sibling files in the same
lowering-test family already do.

## False-positive check
- Gate-pin check: neither `params-literal-sublanguage-lowering.test.ts` nor
  `params-scalar-nontype-text-refusal.test.ts` matches `*gate*.test.ts` or any
  named gate kin; not applicable.
- Recording-double check: `sorted`/`assertKeysSorted` are pure value
  utilities, not recording doubles or MUST-NOT witnesses; not applicable.
- docs/bugs/ signature search: `grep -rl "const sorted = (value: unknown)"
  docs/bugs` → 0 hits; no bug doc gives a rationale for keeping this closure
  file-local. The canonical-slug-oracle.ts header note ("No production
  canonicaliser or slug helper is imported…") concerns not importing the
  production `schemaSlug` implementation under test, not this test-only
  comparator — confirmed by the five sibling files that already import
  `assertKeysSorted` from the same module for the same check.
- coverage-matrix/bug-doc citation search: `grep -n
  "params-literal-sublanguage-lowering\|params-scalar-nontype-text-refusal"
  docs/reference/coverage-matrix.md` → 0 hits. Both files are cited by name
  as witnesses in several docs/bugs/*.md files (0056, 0059, 0061, 0097, 0099,
  0133, 0164, 0175, 0184, 0244, 0285 among them), but none of those citations
  name cell `o1`, `o2` or `d0`, or the `sorted` closure; this finding
  proposes no change to any `it()`/`describe()` name or assertion, only the
  definition site of the internal canonicalising helper.
- Coverage check: the claim is about a repeated function DEFINITION doing
  work an existing shared helper already does, not about a missing test
  path.
- Overlap check: grepped `quality/intake`, `quality/issues` and
  `quality/resolved` for `assertKeysSorted` and `const sorted = ` — the three
  hits (`PTQ-0410`, `PTQ-0494`, `PTQ-0665`) cover the shared oracle's own
  four-function quintuplet (now fixed) and the `slugOfCanonicalForm`/
  `inlineDefName` reimplementation in these same two files (also fixed); none
  names the `sorted` closure or the `o2`/`d0` cells this finding cites.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all three excerpts reproduce verbatim at the cited lines; sed-extracted params-literal-sublanguage-lowering.test.ts:488-500 and params-scalar-nontype-text-refusal.test.ts:952-964 diff to zero (13-line `sorted` closure byte-identical); both files import only `inlineDefName` from ./helpers/canonical-slug-oracle (line 1 each) while the module exports `assertKeysSorted` at :37-51, which five sibling lowering tests already import for the same check (annotation-root-brace-union:527, inline-object-nested:654, params-brace-union-rhs:608, params-inline-object:472, schema-slug-canonical-form-mints:184,907); the closure's `a < b` sort is UTF-16 code-unit order whereas schema-subset.md:100 and the shared `compareCodePoint` require code-point order, so the local copy also drifts from the oracle it bypasses; stated searches reproduce (6 `const sorted` files, 0 docs/bugs hits, 0 coverage-matrix hits); both locations under tests/, D7 copy-paste-helper class, not a gate/recording-double/red-test, no it()/describe() rename proposed; the helper header's "honesty checks remain in each test file" keeps the it() blocks per-file, not the comparator (same ruling as PTQ-0410/PTQ-0665); not a duplicate — PTQ-0665 (fixed cc0a8fe7) migrated only slugOfCanonicalForm/inlineDefName in these two files and left the `sorted` closure in place, PTQ-0410 covered the five siblings' quintuplet, same-wave d7-01-canonical-slug-oracle-reimplemented-inline is a different file and the slug formula; sites: 2 is scope-honest (four further out-of-scope files carry the same closure) (triage: claude-fable-5-1)
