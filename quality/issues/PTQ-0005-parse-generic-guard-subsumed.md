---
id: PTQ-0005
title: TypeParser.parsePrimaryHead carries a generic-application guard whose condition and body are wholly subsumed by the guard immediately below it
lens: D2                     # the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/parser/type-grammar.ts:774-782
  - src/parser/type-grammar.ts:601-603
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# TypeParser.parsePrimaryHead carries a generic-application guard whose condition and body are wholly subsumed by the guard immediately below it

## Observation
`TypeParser.parsePrimaryHead` (src/parser/type-grammar.ts) dispatches an
identifier head to `parseGeneric` through two consecutive `if` statements. The
first tests `name in GENERIC_ARITY && this.peek()?.text === "<"`; the second
tests `this.peek()?.text === "<"`. Both bodies are the identical statement
`return this.parseGeneric(name);`. The first condition is a strict conjunction
of the second with an extra term, and both condition expressions are
side-effect-free, so every input the first branch takes would be taken
identically by the second; removing the first branch is behavior-preserving.

## Evidence
src/parser/type-grammar.ts:774-782:

```ts
    if (name in GENERIC_ARITY && this.peek()?.text === "<") {
      return this.parseGeneric(name);
    }
    // A generic head used without `<...>`, or any non-generic head with a
    // following `<`, is still parsed as an application so the arity check
    // fires (e.g. `array` arity computed from however many args appear).
    if (this.peek()?.text === "<") {
      return this.parseGeneric(name);
    }
```

src/parser/type-grammar.ts:601-603 — `peek()` is a pure read, so evaluating
the first guard cannot change what the second guard sees:

```ts
  private peek(): TypeToken | undefined {
    return this.tokens[this.pos];
  }
```

Search: `grep -n "in GENERIC_ARITY" src/parser/type-grammar.ts` — 1 hit
(:774). `GENERIC_ARITY`'s live consumers are `walkType`'s arity check
(src/parser/type-grammar.ts:1512) and `lowerTypeExpr`
(src/parser/params.ts:799, :813, :840); neither depends on this branch.

## Why this is a problem
Dead weight, mechanically proven: a branch whose guard implies the very next
guard and whose body is byte-identical to it can never contribute behavior —
`name in GENERIC_ARITY` decides nothing at this seam, yet the branch reads as
if closed-set membership selects a distinct parse path here. `git log -S` on
both branch texts shows both landed together in commit 3cadc1ff (V2a — the
type-grammar parser's first implementation), and `git show
3cadc1ff:src/parser/type-grammar.ts` shows the same subsumed pair, so no
historical version ever gave the first branch a distinct body; it has been a
no-op since introduction.

## Suggested direction (non-binding, optional)
Collapse the two guards into the single `this.peek()?.text === "<"` guard the
comment already describes; the closed-set/`GENERIC_ARITY` distinction stays
where it is actually consumed (`walkType`'s arity check and params.ts's
`lowerTypeExpr`).

## False-positive check
- Side effects: verified `peek()` (src/parser/type-grammar.ts:601-603) is a
  pure index read and `name in GENERIC_ARITY` reads a frozen module constant
  (:487-490), so condition evaluation order cannot distinguish the branches.
- Body identity: both branches are exactly `return this.parseGeneric(name);`
  (:775, :781).
- Reference search: `grep -n "in GENERIC_ARITY" src/parser/type-grammar.ts` →
  only :774; no other code path depends on the first guard existing.
- Git history intent: `git log -S 'if (name in GENERIC_ARITY && this.peek()?.text === "<")'`
  and `git log -S '// A generic head used without'` both return only 3cadc1ff —
  the pair was born together; the first guard never had independent behavior.
- Tests: behavior of the two branches is observationally identical, so no test
  can witness the first branch specifically; tests referencing
  `TypeParser.parsePrimary` (e.g. tests/b0281-…, tests/b0282-…,
  tests/generic-argument-bracket-group-truncation.test.ts) cite it in prose
  comments only and assert on diagnostics, which are unchanged by the
  subsumption.

## Triage
verdict: confirmed — re-verified at src/parser/type-grammar.ts:774-782 (in `parsePrimaryHead`): the first guard is a strict conjunction of the second with identical body `return this.parseGeneric(name)`, both operands pure (`peek()` :601-603 is an index read, `GENERIC_ARITY` :487-490 is a frozen plain object), sole `in GENERIC_ARITY` hit in the whole tree is :774, and `git log -S` on both branch texts returns only 3cadc1ff, so the branch has never been able to affect behavior. (triage: claude-opus-5)
