---
id: PTQ-0131
title: The expression tokenizer's integer-digit loop carries a `source[j] !== undefined` conjunct that `j < n` already excludes, while its two sibling scan loops omit it
lens: D2
status: fixed
verdict: confirmed
locations:
  - src/runtime/expression-evaluator.ts:162-172
  - src/runtime/expression-evaluator.ts:121-124
  - src/runtime/expression-evaluator.ts:181-185
sites: 1
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# The expression tokenizer's integer-digit loop carries a `source[j] !== undefined` conjunct that `j < n` already excludes, while its two sibling scan loops omit it

## Observation
`tokenize` binds `n = source.length` and scans with an index `j` that starts at
`i` (a value already `< n`) and only increments. The number-literal's
integral-part loop guards with three conjuncts: `j < n`, `source[j] !==
undefined`, and the digit regex. For a string index in `[0, length)`, `source[j]`
is always a one-character string, so the middle conjunct selects nothing. The
fractional-part loop three lines below and the identifier loop further down
perform the identical indexed access with only `j < n` plus the regex.

## Evidence
src/runtime/expression-evaluator.ts:121-124 — `n` is the string length and `j`
is derived from an in-range `i`:

```ts
function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = source.length;
```

src/runtime/expression-evaluator.ts:162-172 — the extra conjunct at :164 and
the sibling loop at :169 that omits it, over the same `source[j]` access:

```ts
    if (c >= "0" && c <= "9") {
      let j = i;
      while (j < n && source[j] !== undefined && /[0-9]/.test(source[j] as string)) {
        j += 1;
      }
      if (j < n && source[j] === ".") {
        j += 1;
        while (j < n && /[0-9]/.test(source[j] as string)) {
          j += 1;
        }
      }
```

src/runtime/expression-evaluator.ts:181-185 — the identifier loop, the second
sibling with the same access and no `undefined` conjunct:

```ts
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_]/.test(source[j] as string)) {
        j += 1;
      }
```

## Evidence that the conjunct cannot select
`j` is initialised to `i`, and the enclosing `while (i < n)` (:126) guarantees
`i < n`; the only mutation inside the digit loop is `j += 1`, gated by `j < n`.
So every evaluation of `source[j] !== undefined` happens with `0 <= j < n =
source.length`, where a string index returns a one-character string. The `as
string` cast on the very next conjunct records the same fact.

## Why this is a problem
A conjunct that can never be false is dead code inside a live condition: a
reader must work out whether `source[j]` can really be `undefined` under
`j < n` (it cannot), and the two sibling loops in the same function establish
the intended form, so the asymmetry reads as a meaningful difference where
there is none. `git blame -L 164,164` and `-L 169,169` show both loops landed
in the same commit (`81667f13b`), so this is not a later-added defensive guard
responding to a discovered case.

## Suggested direction (non-binding, optional)
Bring the integral-digit loop's condition into line with its two siblings.

## False-positive check
- Bounds proof re-read at source: `n = source.length` (:124), outer loop
  `while (i < n)` (:126), `let j = i` (:163), only `j += 1` inside the loop
  body — no other writer of `j` in that block.
- Sibling comparison: `grep -n "while (j < n" src/runtime/expression-evaluator.ts`
  → :142 (string scan, compares against the quote char), :164 (this loop), :169,
  :183. Only :164 carries the `undefined` conjunct.
- Not a deadness claim about an identifier, so no reference search applies;
  `tokenize` itself is live in-file (called from `evaluateSource`, :93).
- Behaviour check: the claim is that the conjunct selects nothing, not that
  removing it changes output — no behavioural assertion is made.
- Git intent: `git blame -L 164,164 --date=short src/runtime/expression-evaluator.ts`
  → `81667f13b` 2026-06-30; `-L 169,169` and `-L 183,183` → the same commit and
  date, i.e. the asymmetry was present at authoring time rather than introduced
  by a later fix.
- Duplicate check: `grep -rln "expression-evaluator" quality/intake/` → two
  files (qw20260907130901-d2-01-boolean-position-param-unread,
  qw20260907183353-d2-01-runtime-seams-stub-narration-stale); neither cites the
  tokenizer or the :162-172 range. The already-filed subsumed-guard findings
  (parse-generic-guard-subsumed, annotation-inferred-brace-guard-subsumed,
  enum-variant-currentname-guard-subsumed, walk-applies-guard-subsumed) all
  name other files.

## Triage
verdict: confirmed — verified at source: :164 is the only one of four `while (j < n` loops carrying the conjunct, `&&` short-circuit plus `const n = source.length`/`let j = i`/`j += 1`-only make it constant-true, and the repo's own strict flags (`noUncheckedIndexedAccess`) do not require it — the sibling form compiles clean, so it is not a type-checker necessity (triage: claude-opus-5)
