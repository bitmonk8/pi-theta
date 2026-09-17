---
id: PTQ-0410
title: annotation-root-brace-union-lowering.test.ts redeclares a four-function canonical-slug oracle byte-identical in four sibling test files
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/annotation-root-brace-union-lowering.test.ts:218-224
  - tests/annotation-root-brace-union-lowering.test.ts:568-596
  - tests/inline-object-nested-lowering.test.ts:257-263
  - tests/inline-object-nested-lowering.test.ts:685-713
  - tests/params-brace-union-rhs-lowering.test.ts:256-262
  - tests/params-brace-union-rhs-lowering.test.ts:652-680
  - tests/params-inline-object-lowering.test.ts:323-329
  - tests/params-inline-object-lowering.test.ts:495-523
  - tests/schema-slug-canonical-form-mints.test.ts:135-147
  - tests/schema-slug-canonical-form-mints.test.ts:177-196
sites: 5                     # count of occurrences cited in Evidence
fix_scope: cross-module       # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917121953
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# annotation-root-brace-union-lowering.test.ts redeclares a four-function canonical-slug oracle byte-identical in four sibling test files

## Observation
`tests/annotation-root-brace-union-lowering.test.ts` (in this wave's scope) declares four
module-private helper functions — `slugOfCanonicalForm`, `inlineDefName`,
`compareCodePoint`, and `assertKeysSorted` — that together implement an
independent, hand-written oracle for the §Canonical schema hash recipe (key
sort by Unicode code point, SHA-256 of the canonical bytes, the
`__inline_<slug>` name). The same four functions, same names, same bodies,
recur byte-for-byte (or with only a quoted-message wording change) in four
sibling files: `tests/inline-object-nested-lowering.test.ts`,
`tests/params-brace-union-rhs-lowering.test.ts`,
`tests/params-inline-object-lowering.test.ts`, and
`tests/schema-slug-canonical-form-mints.test.ts`. A sixth file,
`tests/union-generic-arm-lowering.test.ts`, carries a renamed local variant
(`compareCodePointLocal`) of the same comparator.

## Evidence

`tests/annotation-root-brace-union-lowering.test.ts:218-224`:
```ts
function slugOfCanonicalForm(canonical: string): string {
  return createHash("sha256").update(canonical, "utf8").digest("hex").slice(0, 16);
}

/** The synthesised `$defs` key for a fragment given its canonical form (:73). */
function inlineDefName(canonical: string): string {
  return `__inline_${slugOfCanonicalForm(canonical)}`;
}
```

`tests/annotation-root-brace-union-lowering.test.ts:568-580` (`compareCodePoint`):
```ts
function compareCodePoint(a: string, b: string): number {
  const ap = [...a];
  const bp = [...b];
  for (let i = 0; i < Math.min(ap.length, bp.length); i += 1) {
    const x = ap[i]?.codePointAt(0) ?? 0;
    const y = bp[i]?.codePointAt(0) ?? 0;
    if (x !== y) {
      return x - y;
    }
  }
  return ap.length - bp.length;
}
```

`tests/annotation-root-brace-union-lowering.test.ts:582-596` (`assertKeysSorted`):
```ts
function assertKeysSorted(label: string, value: unknown, path = "$"): void {
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

`diff` verdicts against the reviewed file, run on the matching spans in each
sibling:
- `tests/inline-object-nested-lowering.test.ts:257-263` / `:685-713` — `diff`
  against the two excerpts above returns no output: byte-identical.
- `tests/params-brace-union-rhs-lowering.test.ts:256-262` — one comment word
  differs (`(:73)` → `` (`:73`/`:108`) ``); `:652-680` (`compareCodePoint` /
  `assertKeysSorted`) — byte-identical (`diff` empty).
- `tests/params-inline-object-lowering.test.ts:323-329` — byte-identical;
  `:495-523` (`compareCodePoint` byte-identical; `assertKeysSorted`'s
  `expect` message drops the `${JSON.stringify(keys)}` interpolation,
  otherwise identical).
- `tests/schema-slug-canonical-form-mints.test.ts:135-147` /`:177-196` —
  `compareCodePoint` byte-identical; `slugOfCanonicalForm` byte-identical;
  `assertKeysSorted`'s message is reworded and it omits the closing recursive
  call, otherwise the same four-function shape.

Exact search: `grep -n "^function slugOfCanonicalForm\|^function inlineDefName\|^function compareCodePoint\|^function assertKeysSorted" tests/annotation-root-brace-union-lowering.test.ts tests/inline-object-nested-lowering.test.ts tests/params-brace-union-rhs-lowering.test.ts tests/params-inline-object-lowering.test.ts tests/schema-slug-canonical-form-mints.test.ts` → all four function names present in all five files, at the line numbers cited under `locations`. `tests/union-generic-arm-lowering.test.ts:920-930` carries the same `compareCodePoint` body under the local name `compareCodePointLocal`, with a doc comment stating it is "Implemented locally, not imported, so this stays an oracle independent of the implementation it checks" — the same rationale the other five files' copies each carry independently, without cross-referencing one another.

## Why this is a problem
Each of the five files' own comments states the oracle must be independent of
the lowering implementation under test ("`schemaSlug` is deliberately NOT
imported: an oracle taken from the implementation under test proves
nothing"), which is a sound reason not to import the SUT's own slug function —
but it does not explain why the oracle's own code point comparator, SHA-256
truncation, `__inline_` name format, and recursive key-sort check are each
re-typed from scratch five times rather than defined once as a shared,
non-production test utility. A change to any one of the four bodies (for
example, a different `slice` bound, or a different treatment of an empty
string in `compareCodePoint`) would not propagate to the other four copies,
and nothing in the five files' text cites the sibling copies as a deliberate,
independently-maintained mirror.

## Suggested direction (non-binding, optional)
The four functions are pure, `expect`-free-except-`assertKeysSorted` value
utilities with no dependency on any one bug's fixtures; a shared test-helpers
module analogous to `tests/helpers/registry-oracle.ts`'s existing pattern of
centralising a repeated read is the kind of home the five files' identical
copies point at, named as observation rather than as a design.

## False-positive check
- Gate-pin check: none of the five files match `*gate*.test.ts` or the named
  kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate); the cited
  functions are a canonical-form comparator/hasher, not a pinned inventory or
  count.
- Recording-double check: none of the four functions records a call for a
  "never called" assertion; `assertKeysSorted` is a positive recursive
  structural check, not a negative witness, so the recording-double carve-out
  does not apply.
- docs/bugs/ signature search: `grep -rl "compareCodePoint\|assertKeysSorted\|slugOfCanonicalForm" docs/bugs/*.md` → no hits; no open bug document names this duplication or gives a rationale for keeping five independent copies.
- coverage-matrix/bug-doc citation search: `grep -n "annotation-root-brace-union-lowering\|inline-object-nested-lowering\|params-brace-union-rhs-lowering\|params-inline-object-lowering\|schema-slug-canonical-form-mints" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any file or `it()`/`describe()`, only that the four helper bodies could share one definition, so no citation is affected.
- Coverage check: the claim is about a repeated function DEFINITION, not a missing test path; all four functions are exercised by every test in each file that calls them (confirmed present and reachable at each cited line).
- Overlap check: grepped `quality/intake`, `quality/resolved`, `quality/issues` for `compareCodePoint` and `assertKeysSorted` — the only hit, PTQ-0357 (resolved, D4), is a `src/` production-code pair (`compact-transcript.ts` / `schema-lowering.ts`), not this tests/-only quintuplet; no existing PTQ names this five-file test duplication.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — re-diffed all cited spans: slugOfCanonicalForm/inlineDefName/compareCodePoint/assertKeysSorted are byte-identical (bar one comment word and one expect-message wording) across annotation-root-brace-union / inline-object-nested / params-brace-union-rhs / params-inline-object, and schema-slug-canonical-form-mints carries 3 of the 4 (no inlineDefName; its assertKeysSorted does keep the recursive call, contrary to the filing) plus compareCodePointLocal in union-generic-arm; grep shows slugOfCanonicalForm/inlineDefName in 7 further tests/ files, so the count is understated not overstated; tests/-only copy-paste helper (D7 class), not a gate/recording-double/coverage-matrix-cited test, the "not imported from SUT" rationale does not preclude a shared tests/helpers oracle (cf. PTQ-0215 registry-oracle precedent), docs/bugs/0099 names only the src/ comparator, and PTQ-0357 covers the src/ pair only — no existing PTQ tracks the tests/ copies (triage: claude-fable-5-1)
