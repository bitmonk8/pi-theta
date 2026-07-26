# Bug 0005 — `subagent fn` return-type annotations: `with` swallowed, keyword recognition lost, `?` rejected

- **Status:** open
- **Kind:** defect cluster — three related failures around the grammatical
  `(":" ReturnType)?` slot on a `subagent fn` declaration. Symptoms (a) and (b)
  contradict the documented grammar; symptom (c) is a semantics gap the spec
  leaves ambiguous and the checker resolves in the least useful direction.
- **Affected:** the `FnDecl` parse path in `src/parser/theta-document.ts`
  (`parseType` termination before a `with` clause; the postfix-`?` /
  ternary-head disambiguation `isTernaryHead`), the trailing-`?`
  newline-continuation trigger in `src/lexer/lexer.ts` (`trailingTriggers`),
  and the `theta/parse/question-outside-result-fn` check (`checkQuestionScope`
  in `src/parser/match-result.ts`; scope built by `walkFn` in
  `src/parser/type-layer-checks.ts`) as applied to `subagent fn` bodies.
- **Observed at:** `0.12.0` (parse-lint via `parseThetaDocument`; (c) also hit
  live in a registered theta on 0.7.1 and 0.12.0).

## Summary

The grammar admits a return-type annotation and a `with` clause on a
`subagent fn`:

```
FnDecl ::= SubagentMod? "fn" Ident "(" FnParams? ")" (":" ReturnType)? WithClause? FnBody
```

In practice, combining a `subagent fn` with a return-type annotation misbehaves
three ways. The shipped examples sidestep all three by omitting the annotation
(`ralph-inline.theta`, `refine-inline.theta`), so the defects surface exactly
when an author adds the type the grammar documents.

## Symptoms and reproductions

**(a) `): T with { … }` — parse explosion.** The return-type parser consumes the
`with` clause as part of the type, then the parse disintegrates:

```theta
subagent fn s(a: string): string with { system: "terse" } {
  let v = @`Echo ${a}`?
  v
}
```

```
1:41 error theta/parse/unknown-identifier: unknown identifier 'system'
1:47 error theta/parse/unsupported-feature: stray ':' in statement position
1:59 error theta/parse/bare-object-literal: …
(+ cascading errors through the body)
```

The annotation lands on the AST as the concatenated source `stringwith`, the
`with` braces parse as the fn *body*, and the real body becomes a stray
top-level statement. Dropping the `: string` annotation makes the identical
declaration parse and run.

**(b) Contextual-keyword recognition lost after a statement ending in postfix
`?`.** A `subagent fn` **with** a return annotation, declared after a statement
whose line ends with the error-propagation `?`, is not recognised as a
declaration at all:

```theta
let x = "x"
let child_ack = invoke<string>("./worker.theta", x)?
subagent fn helper(a: string): string {
  let rep = @`Echo ${a}`?
  rep
}
```

```
3:1 error theta/parse/unknown-identifier: unknown identifier 'subagent'
4:13 error theta/parse/question-outside-result-fn: …
```

Control matrix (each cell = the only change):

| Preceding statements | Return annotation | Result |
|---|---|---|
| none | none | parses |
| plain `let`s | none | parses |
| `invoke<string>(…)?` | none | parses |
| `invoke<string>(…)` — no trailing `?` | `: string` | (c) only — `?` rejected |
| none / plain `let`s | `: string` | (c) only — `?` rejected |
| `invoke<string>(…)?` | `: string` | **`unknown identifier 'subagent'`** + (c) |
| non-generic `invoke(…)?` | `: string` | **`unknown identifier 'subagent'`** + (c) |
| ``let v = @`ping`?`` | `: string` | **`unknown identifier 'subagent'`** + (c) |

The keyword loss requires both the annotation and a preceding statement whose
line ends with the postfix `?`; the generic argument is incidental (a
non-generic `invoke(…)?` or a plain query triggers it, and dropping only the
trailing `?` clears it). A blank line between the two statements does not
protect: continuation crosses blank lines. The keyword loss is the swallowed
statement boundary after that `?`.

**(c) Explicit annotation rejects `?` in the body.** With the annotation, the
body's `?` fails:

```theta
subagent fn helper(a: string): string {
  let v = @`Echo ${a}`?      // 'used in a scope whose return type is not Result<T, QueryError>'
  v
}
```

Removing `: string` — leaving the body, and therefore the inferred type,
identical — parses and runs. Annotating a function with exactly its inferred
type changes body legality.

## Expected behaviour (what the spec says)

- `docs/reference/grammar.md` §"`fn` declarations": the FnDecl production above —
  `(":" ReturnType)?` and `WithClause?` are both admitted on a `subagent fn`, in
  that order. (a) and (b) violate this directly.
- `docs/reference/grammar.md` §"Newline continuation": "The `?` trigger is the
  **ternary head only**; the postfix error-propagation `?` … is a
  complete-expression terminator … and never continues." (b) violates this: the
  statement boundary after a trailing postfix `?` is not honoured.
- `docs/spec_topics/functions.md` FN-6 (Return): "the return type is inferred
  from the body tail … and validated at the boundary; an explicit return type
  uses the same typed `let` / tail annotation the body already supports, so no
  `invoke<Type>` analogue is required." The sentence rules out *needing* the
  annotation; it does not define what a supplied `): T` means on a `subagent fn`.
- FN-6 (isolation/return): a body `Err` crosses the boundary as
  `InvokeCalleeError`; the call site always receives `Result<T, QueryError>`. A
  subagent-mode `.theta` body — the construct FN-6 equates the boundary with —
  accepts top-level `?`.

## Analysis

(a) is a `parseType` termination defect: the type parser does not stop at the
contextual keyword `with`, so the returned type source is `stringwith` and the
`with` braces are taken as the body block. (b) is a two-step statement-boundary
leak: the lexer's trailing-trigger set (`trailingTriggers`,
`src/lexer/lexer.ts`) includes `?` unconditionally, so the newline after a
postfix `?` is swallowed as a would-be ternary continuation; the parser's
`isTernaryHead` disambiguation then scans forward for a `:` at bracket depth 0
before the next separator and — with the separator gone — reads into the *next*
declaration, where the return annotation's `:` sits at depth 0 (the parameter
list's parens have closed). The `?` is classified as a ternary head, `subagent`
is consumed as the consequent expression (`unknown identifier 'subagent'`), and
the `fn` keyword then parses as a plain fn: the modifier is silently dropped
and the kept annotation reproduces (c) at the body's `?`. Without the
annotation no depth-0 `:` precedes the body block's first separator, so the
scan correctly answers postfix; a plain annotated `fn` is immune because the
`fn` keyword cannot start an expression, while the contextual `subagent` lexes
as an identifier and can. (Kin to bug 0006's leading-`[` glue: both are
statement-boundary leaks.) (c) is a semantics choice: the
`question-outside-result-fn` check treats the annotation as a plain-`fn` body
return type. Under FN-6 the body is a subagent session whose failure channel is
the boundary `Err` — the same position as a subagent `.theta` body, where `?` is
legal. The coherent reading of `): T` on a `subagent fn` is "T is the Ok
payload", matching `invoke<T>` and the annotation-less inference; under that
reading `?` must be admissible.

## Options

1. **Fix all three under the Ok-payload reading** (recommended): terminate
   `ReturnType` parsing at `with` (a); honour "the `?` trigger is the ternary
   head only" at the statement boundary — the lexer must not join the newline
   after a postfix `?`, or the ternary-head scan must not read across the
   joined boundary (b); treat a
   `subagent fn` body as a Result scope for the `?` check regardless of
   annotation, validating the annotation against the inferred Ok payload (c).
2. Reject `): T` on `subagent fn` outright with a precise diagnostic pointing at
   the FN-6 typed-tail idiom, and update the grammar to remove the slot for the
   `SubagentMod` arm. Smaller, but gives up call-site-visible return typing and
   still requires fixing (b)'s state leak.

Either option needs the FN-6 prose to state explicitly what a supplied return
annotation means.

## Provenance

- Spec measured against: `docs/reference/grammar.md` §"`fn` declarations" and
  §"Newline continuation", `docs/spec_topics/functions.md` FN-3/FN-6.
- Repro matrix verified with `parseThetaDocument` at 0.12.0; symptom (b)+(c)
  first hit live in a registered theta during the pi-config theta-migration
  spikes (spike (e); the un-registered slug then fell through to the ordinary
  coding agent under `pi -p` — see RFC 0007 for that surface).
- Examples that sidestep the cluster: `docs/examples/ralph-inline.theta`,
  `docs/examples/refine-inline.theta` (no return annotations).
