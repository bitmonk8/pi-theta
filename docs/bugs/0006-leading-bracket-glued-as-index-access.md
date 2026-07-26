# Bug 0006 — A leading-`[` expression statement glues onto the previous statement as index access

- **Status:** open
- **Kind:** defect — statement segmentation treats a newline-separated leading
  `[` as postfix index access on the preceding statement's trailing expression,
  mis-parsing a legal tail expression into a type error plus stray-token
  cascade.
- **Affected:** expression/statement segmentation in
  `src/parser/theta-document.ts` (postfix `[` acceptance across a statement
  boundary).
- **Observed at:** `0.12.0` (parse-lint via `parseThetaDocument`; first hit at
  `0.7.1`).

## Summary

An array literal in tail-expression position, placed on the line after any
completed statement, is parsed as an index access on that statement's value
rather than as a new expression statement. Theta has no statement terminator, so
the newline is the only boundary — and the parser ignores it for a leading `[`.

## Reproduction

```theta
fn f(): array<string> {
  let a = "x"
  ["a", a]          // intended tail expression
}
```

```
error theta/parse/non-indexable-receiver: indexed access requires an array<T> or object receiver; got string
error theta/parse/unsupported-feature: stray ',' in statement position
error theta/parse/unsupported-feature: stray ']' in statement position
```

The parser read `"x"["a", a]`. The same gluing occurs after a `match` binding
(`let mark = match r { … }` followed by a `[ … ]` tail → the match result is the
"receiver"), which is how it was first hit. Binding the array to a `let` first
and returning the binding —

```theta
  let out = ["a", a]
  out
```

— parses, which is the workaround in circulation.

## Expected behaviour

`docs/reference/grammar.md` §Blocks: a block body is `Stmt* Expr?` — a trailing
array-literal expression is a legal tail. No documented rule joins a
next-line `[` to the previous statement; the language's other bracket
constructs treat the newline-separated form as a new statement (a leading `{`
on a new line is not parsed as continuation, for comparison). JavaScript-style
ASI hazards are not part of the documented surface — the grammar has no
semicolons at all, so line structure is the only segmentation authors can
control.

## Why it matters

- The natural way to end a `fn` with an array value is broken; the workaround
  (bind-then-return) is non-obvious and the diagnostic
  (`non-indexable-receiver … got string`) points at the wrong construct two
  lines away.
- The failure mode compounds with bug 0005 (c): authors writing compact
  `subagent fn` bodies hit both and cannot tell which rule they violated.

## Options

1. **Terminate postfix parsing at a line break before `[`** (recommended):
   index access must open on the same line as its receiver. Deterministic, easy
   to state in the grammar ("a `[` that begins a line begins a new statement"),
   and matches how authors already read the code. Requires a grammar note plus
   fixtures for the tail-expression and mid-block cases.
2. Keep the gluing but add a targeted diagnostic when the glued receiver's
   statement ended in a complete expression and the `[` opened a new line —
   weaker; still mis-parses valid programs.

## Provenance

- Spec measured against: `docs/reference/grammar.md` §Blocks, §"Expression
  sublanguage" (postfix index), §Comments/§"String literals" (no ASI surface
  documented).
- Repro verified with `parseThetaDocument` at 0.12.0; first recorded during the
  pi-config theta-migration spikes (0.7.1 round; workaround noted in that
  repo's `phase0-spikes/README.md`).
