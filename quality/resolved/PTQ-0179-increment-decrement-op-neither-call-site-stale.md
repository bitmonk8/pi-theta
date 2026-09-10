---
id: PTQ-0179
title: incrementDecrementOp's doc says its narrowing exists "so neither call site casts past the check"; the method has three call sites
lens: D2
status: fixed
verdict: confirmed
locations:
  - src/parser/theta-document.ts:5382-5388
  - src/parser/theta-document.ts:5403
  - src/parser/theta-document.ts:5548
  - src/parser/theta-document.ts:6161
sites: 4
fix_scope: localized
wave: qw20260910054544
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-10
---

# incrementDecrementOp's doc says its narrowing exists "so neither call site casts past the check"; the method has three call sites

## Observation
`BodyParser.incrementDecrementOp` returns the `"++" | "--"` literal at the
cursor or `undefined`. Its doc comment justifies the literal-union return type
with "so neither call site casts past the check" — "neither" counting two
callers. The method was introduced with two callers (`parseUnary`,
`parsePostfix`) by bug 0084's commit `9fe13534` (2026-08-04). Bug 0123's commit
`5d39edb7` (2026-08-21) added a third caller in `parsePattern` and left the
sentence unchanged.

## Evidence
src/parser/theta-document.ts:5382-5388 — the doc:

```ts
  /**
   * The increment/decrement operator at the cursor, or `undefined` for
   * anything else. Narrows the token's plain `string` text to the
   * `IncrementDecrementOp.op` literal union so neither call site casts past
   * the check.
   */
  private incrementDecrementOp(): "++" | "--" | undefined {
```

The three call sites (`grep -n "this.incrementDecrementOp()"
src/parser/theta-document.ts` → exactly :5403, :5548, :6161):

src/parser/theta-document.ts:5402-5404 (`parseUnary`, prefix form):

```ts
  private parseUnary(): Expr | null {
    const incDecOp = this.incrementDecrementOp();
    if (incDecOp !== undefined) {
```

src/parser/theta-document.ts:5548-5549 (`parsePostfix`, postfix form):

```ts
      const incDecOp = this.incrementDecrementOp();
      if (incDecOp !== undefined) {
```

src/parser/theta-document.ts:6161-6162 (`parsePattern`, pattern-position form):

```ts
    const incDecOp = this.incrementDecrementOp();
    if (incDecOp !== undefined) {
```

History: `git blame -L 5383,5387` → `9fe13534d 2026-08-04` for every doc line;
`git show 9fe13534:src/parser/theta-document.ts | grep -n
"this.incrementDecrementOp()"` → two hits (:3312, :3433 in that revision).
`git blame -L 6161,6162` → `5d39edb70 2026-08-21 fix(bug-0123): a
match-pattern increment/decrement draws its own registered row`.

## Why this is a problem
Stale count. "Neither" is a definite count of two; the method has had three
callers since 5d39edb7. The sentence is the method's only stated rationale (why
the return type is the literal union rather than `string`), so a reader
auditing that rationale against the callers finds it under-counting — the same
drift class as PTQ-0116 (`withBuiltinErrorModelNames` "four call sites" → five)
and PTQ-0039 (`parseInterpolationSource` "four" → five), both confirmed.

## Suggested direction (non-binding, optional)
State the rationale without a caller count ("so no call site casts past the
check"), or keep the count and update it where callers are added.

## False-positive check
- Counted every caller: the grep above is the complete list of
  `incrementDecrementOp()` invocations in the file; the method is `private`,
  so no external caller is possible (`grep -rn "incrementDecrementOp" tests
  extensions tools src --include=*.ts | grep -v theta-document.ts` → 0 hits).
- Alternate reading considered: "neither call site" as "neither of the two
  expression-position call sites" (prefix/postfix), excluding the pattern
  site. The sentence names no position and each of the three callers feeds
  the same `IncrementDecrementOp.op` slot of `checkIncrementDecrement`, so the
  narrowing serves all three alike; the count is stale under either reading.
- Git intent: the doc predates the third caller; the bug 0123 commit added the
  caller without touching the sentence, so this is decay, not a deliberate
  scoping.
- Not a duplicate: PTQ-0099 cites the three `checkIncrementDecrement` call
  sites for a different root cause (the checker's unproducible `undefined`
  arm); it does not cite :5382-5388 or the caller count. `grep -rln
  "incrementDecrementOp" quality/` → 0 hits.

## Triage
verdict: confirmed — re-verified independently: doc byte-matches at theta-document.ts:5382-5388 with all lines blaming to 9fe13534 (2026-08-04), whose revision had exactly two `this.incrementDecrementOp()` callers (:3312, :3433); HEAD has three (:5403, :5548, :6161), the third blaming to 5d39edb7 (2026-08-21) whose diff adds the call without touching the "neither" sentence; the method is private with zero callers outside the file (tests mention it only in comments), and all three callers feed the same `IncrementDecrementOp.op: "++" | "--"` slot (bindings.ts:169-171) so the narrowing rationale applies to all three and "neither" (a definite dual) under-counts under any reading; not a duplicate — no quality/ file names `incrementDecrementOp` or this sentence, and PTQ-0099 tracks the checker's unproducible `undefined` arm, a different root cause. Same drift class as confirmed PTQ-0039/PTQ-0116/PTQ-0125. (triage: claude-opus-5)
