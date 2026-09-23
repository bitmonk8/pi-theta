---
id: PTQ-1388
title: literal-union-string-enum-emission.test.ts declares a local key-sort closure instead of importing canonical-slug-oracle.ts's assertKeysSorted
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/literal-union-string-enum-emission.test.ts:304-326
  - tests/helpers/canonical-slug-oracle.ts:37-51
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# literal-union-string-enum-emission.test.ts declares a local key-sort closure instead of importing canonical-slug-oracle.ts's assertKeysSorted

## Observation
`tests/literal-union-string-enum-emission.test.ts`'s "the oracle's own
honesty" test (`o2`) declares a ten-line recursive `sorted` closure to
canonicalise a fragment for a deep-stringify comparison against its
hand-written canonical form. `tests/helpers/canonical-slug-oracle.ts` already
exports `assertKeysSorted`, a recursive assertion built for exactly this
"object keys sorted by Unicode code point" check, and five sibling lowering
test files already import and call it in place of a local closure.

## Evidence

`tests/literal-union-string-enum-emission.test.ts:304-326` (re-read
immediately before filing):
```ts
  it("CONTROL (o2): the canonical form sorts every object's keys and carries no insignificant whitespace", () => {
    expect(
      B_XY_CANONICAL,
      `schema-subset.md:101 — no space or newline between tokens; observed ${B_XY_CANONICAL}`,
    ).toBe(JSON.stringify(JSON.parse(B_XY_CANONICAL)));
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
      B_XY_CANONICAL,
      `schema-subset.md:100 — object keys sorted by Unicode code point at every level; ` +
        `schema-subset.md:104 — array elements left in lowering order; observed ${B_XY_CANONICAL}`,
    ).toBe(JSON.stringify(sorted(B_XY_FRAGMENT)));
  });
```

`tests/helpers/canonical-slug-oracle.ts:37-51` — the exported helper this
file does not import:
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
→ 6 files, including this in-scope file (already recorded as a
scope-note in the resolved `PTQ-0793`, which filed only the other two of the
6). Exact search, `grep -rn "assertKeysSorted" tests/*.ts` → the helper's own
declaration plus five importing sibling call sites (already enumerated in
`PTQ-0793`), none of which is this in-scope file.

## Why this is a problem
The local `sorted` closure's comparator (`a < b`, UTF-16 code-unit order)
diverges from the spec rule it purports to check (schema-subset.md:100,
Unicode code-point order) and from the shared helper's own `compareCodePoint`
comparator — the same drift already documented for the two files fixed under
`PTQ-0793`. A change to how the shared oracle enforces "keys sorted by
Unicode code point" (e.g. switching the comparator at
`helpers/canonical-slug-oracle.ts:44`) would not reach this file's own
closure, and this file's closure does not itself implement code-point order,
so it can silently pass on inputs where a code-point-accurate check would
fail.

## Suggested direction (non-binding, optional)
Importing `assertKeysSorted` from `./helpers/canonical-slug-oracle` (already
imported in this file for other exports, per the sibling finding on
`inlineDefName`/`slugOfCanonicalForm`) and calling it in place of the local
`sorted` closure and the hand-rolled restringify comparison is the same
migration five sibling lowering tests already carry.

## False-positive check
- Gate-pin check: not a `*gate*.test.ts` file or named kin; not applicable.
- Recording-double check: `sorted`/`assertKeysSorted` are pure value
  utilities, not recording doubles backing a MUST-NOT witness; not
  applicable.
- docs/bugs/ signature search: `grep -rl "const sorted = (value: unknown)"
  docs/bugs/*.md` → 0 hits; no bug doc pins this local closure as a
  documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "literal-union-string-enum-emission" docs/reference/coverage-matrix.md`
  → 0 hits; the file is cited by name in `docs/bugs/0055-*.md` as a witness
  but not for cell `o2` or the `sorted` closure specifically — this finding
  proposes no rename/merge/delete of any `it()`/`describe()`, only the
  definition site of one internal comparator.
- Overlap check: `grep -rl "literal-union-string-enum-emission"
  quality/intake quality/issues quality/resolved` → only `PTQ-0793` (which
  explicitly names this file as one of "four further out-of-scope files"
  carrying the same closure and did not file for it) and `PTQ-1079`
  (unrelated). This finding closes that named gap for the file now in scope.
- Coverage check: this finding does not claim any missing test or untested
  code path; it is confined to a test file bypassing an existing shared
  test-only assertion helper.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: literal-union-string-enum-emission.test.ts:304-326 reproduces verbatim (o2's 11-line recursive `sorted` closure with `a < b` UTF-16 code-unit comparator, live at :325 via `toBe(JSON.stringify(sorted(B_XY_FRAGMENT)))`); the helper excerpt reproduces with line drift only (canonical-slug-oracle.ts now exports assertKeysSorted at :66-81, compareCodePoint at :23-34, content identical) and this file's :1-18 imports have 0 hits for `canonical-slug-oracle`; searches re-run with current counts — `const sorted = (value: unknown): unknown =>` → 4 tests/*.ts files (this one plus generic-argument-literal-lowering, schema-body-nontype-text-refusal, union-arm-literal-const-lowering; the filing's 6 predates PTQ-0793's fix of two), `assertKeysSorted` imported/called by 8 sibling tests (filing said 5; undercount, immaterial), docs/bugs 0 hits for the closure, coverage-matrix 0 hits for the file; both locations under tests/, D7 copy-paste-helper class with the same code-unit-vs-code-point drift PTQ-0793 confirmed, not a gate/recording-double/red-test carve-out, no it()/describe() rename proposed, helper header's "honesty checks remain in each test file" keeps the it() blocks per-file not the comparator (PTQ-0410/0665/0793 ruling); not a duplicate — resolved PTQ-0793 (fixed) cited only params-literal-sublanguage and params-scalar-nontype-text-refusal and named this file among the "four further out-of-scope files", and same-wave d7-01 on this file covers the slugOfCanonicalForm/inlineDefName pair, a disjoint root cause; sites: 1 is scope-honest (triage: claude-fable-5-1)
