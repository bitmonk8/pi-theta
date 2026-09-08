---
id: PTQ-0022
title: parsePattern's doc comment sits stacked above tryConsumeArmBodyStatement, three methods away from parsePattern, which is itself undocumented
lens: D2                     # the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/parser/theta-document.ts:5522-5536
  - src/parser/theta-document.ts:5654
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# parsePattern's doc comment sits stacked above tryConsumeArmBodyStatement, three methods away from parsePattern, which is itself undocumented

## Observation
Inside class `BodyParser`, two `/** … */` blocks are stacked directly above
`tryConsumeArmBodyStatement`. The first block describes a different method —
"Parse one `match` pattern …: wildcard `_`, `Ok(p)` / `Err(p)` constructors, a
named/bare object pattern …, an array pattern …, a literal …, or an identifier
binding" — which is `parsePattern`'s contract. `parsePattern` is declared 118
lines further down, after `tryConsumeArmBodyStatement`,
`tryConsumeRestPattern`, and `consumeTrailingAssignment`, and carries no doc
comment of its own. Later insertions between the comment and its subject left
the comment stranded on the wrong method.

## Evidence
src/parser/theta-document.ts:5522-5536 — the stacked pair; the first block
describes pattern parsing, then a second block (the correct one for the
method) follows, then the method:

```ts
  /**
   * Parse one `match` pattern (expressions.md §"Pattern grammar (theta 1.0)"):
   * wildcard `_`, `Ok(p)` / `Err(p)` constructors, a named/bare object pattern
   * `Ident { field: p, … }`, an array pattern `[p, …]`, a literal
   * (`"s"` / `42` / `true` / `null`), or an identifier binding.
   */
  /**
   * If the cursor begins a bare statement in `match`-arm-body position
   * (a leading `if` / `for` / `while` / `let` / `break` / `continue` /
   * `return` keyword, or a bare assignment), emit
   * `theta/parse/statement-in-arm-body`, consume the statement, and return
   * true; otherwise return false. Arm bodies are expressions; statements are
   * wrapped in a block expression `{ ... }` (grammar.md §"match arm body").
   */
  private tryConsumeArmBodyStatement(): boolean {
```

src/parser/theta-document.ts:5648-5654 — `parsePattern` itself, directly
preceded by `consumeTrailingAssignment`'s closing brace, with no doc block:

```ts
      this.advance(); // op
      this.advance(); // `=`
    }
    this.parseExpression(); // consume + discard the RHS
  }

  private parsePattern(): PatternNode {
```

Between the stranded block and its subject sit three declarations
(`tryConsumeArmBodyStatement` :5536, `tryConsumeRestPattern` :5598,
`consumeTrailingAssignment` :5628), each carrying its own correct doc block.

## Why this is a problem
Detached narration: a doc comment whose stated subject ("Parse one `match`
pattern") does not match the declaration it is attached to (a statement-in-
arm-body recovery check). Editor hover/JSDoc tooling associates the first of
two stacked blocks with nothing, or readers scanning the file attribute
pattern-parsing semantics to `tryConsumeArmBodyStatement`. Meanwhile the real
subject, `parsePattern` — the six-production pattern parser — is left with no
contract comment at all. This is the same leftover-insertion class the wave's
d2-06 candidate documents for production-theta-producer.ts, at a site in a
different file that that finding does not cover.

## Suggested direction (non-binding, optional)
Move the stranded block down to sit directly above `parsePattern` (its
content is accurate for that method as implemented today).

## False-positive check
- Verified the block's content against `parsePattern`'s body (:5654 onward):
  it handles exactly the listed productions (wildcard, Ok/Err constructor,
  named/bare object pattern, array pattern, literals, identifier binding), so
  the comment is a live description of `parsePattern`, not obsolete text.
- Verified `tryConsumeArmBodyStatement` has its own accurate doc block
  (:5528-5535), so the first block is not that method's documentation.
- Searched the span :5536-5654 for method heads: only
  `tryConsumeArmBodyStatement`, `tryConsumeRestPattern`,
  `consumeTrailingAssignment` sit between the stranded comment and
  `parsePattern`; none of them parses patterns.
- Duplicate check against the filed wave candidates: the detached-doc-comment
  candidate qw20260907130901-d2-06 cites only
  src/extension/production-theta-producer.ts sites; no filed candidate cites
  src/parser/theta-document.ts.
- Git history intent: `git log -S "Parse one \`match\` pattern"` resolves to
  the corpus-wide rename commit (history squashed), so intent was checked on
  current state only.

## Triage
verdict: confirmed — verified at 5522/5536/5654: the "Parse one `match` pattern" block sits above tryConsumeArmBodyStatement, which carries its own accurate block, 118 lines from the undocumented parsePattern whose six productions the stranded block exactly describes; no other filed candidate cites this site (triage: claude-opus-5)
