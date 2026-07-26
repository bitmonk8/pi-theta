# Bug 0005 — `subagent fn` return-type annotations: `with` swallowed, keyword recognition lost, `?` rejected

- **Status:** open
- **Kind:** defect cluster — three related failures around the grammatical
  `(":" ReturnType)?` slot on a `subagent fn` declaration. Symptoms (a) and (b)
  contradict the documented grammar; symptom (c) is a semantics gap the spec
  leaves ambiguous and the checker resolves in the least useful direction.
- **Affected:** the `FnDecl` parse path in `src/parser/theta-document.ts`
  (return-type parsing before a `with` clause; contextual-keyword recognition),
  and the `theta/parse/question-outside-result-fn` check as applied to
  `subagent fn` bodies.
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
4:41 error theta/parse/unknown-identifier: unknown identifier 'system'
4:47 error theta/parse/unsupported-feature: stray ':' in statement position
4:59 error theta/parse/bare-object-literal: …
(+ cascading errors through the body)
```

Dropping the `: string` annotation makes the identical declaration parse and run.

**(b) Contextual-keyword recognition lost after an `invoke<T>` statement.** A
`subagent fn` **with** a return annotation, declared after a statement containing
a generic invoke, is not recognised as a declaration at all:

```theta
let x = "x"
let child_ack = invoke<string>("./worker.theta", x)?
subagent fn helper(a: string): string {
  let rep = @`Echo ${a}`?
  rep
}
```

```
6:1 error theta/parse/unknown-identifier: unknown identifier 'subagent'
7:13 error theta/parse/question-outside-result-fn: …
```

Control matrix (each cell = the only change):

| Preceding statements | Return annotation | Result |
|---|---|---|
| none | none | parses |
| plain `let`s | none | parses |
| `invoke<string>(…)` | none | parses |
| none / plain `let`s | `: string` | (c) only — `?` rejected |
| `invoke<string>(…)` | `: string` | **`unknown identifier 'subagent'`** + (c) |

The keyword loss requires both the annotation and the preceding generic-invoke
statement, pointing at parser state carried across the statement boundary.

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
contextual keyword `with`. (b) is downstream of the same region: when the
annotated declaration follows an `invoke<T>` statement, `subagent` is not
recognised in declaration position and lexes as an expression identifier —
whatever state the generic-argument parse leaves behind changes the outcome for
the *next* statement, which should be impossible. (c) is a semantics choice: the
`question-outside-result-fn` check treats the annotation as a plain-`fn` body
return type. Under FN-6 the body is a subagent session whose failure channel is
the boundary `Err` — the same position as a subagent `.theta` body, where `?` is
legal. The coherent reading of `): T` on a `subagent fn` is "T is the Ok
payload", matching `invoke<T>` and the annotation-less inference; under that
reading `?` must be admissible.

## Options

1. **Fix all three under the Ok-payload reading** (recommended): terminate
   `ReturnType` parsing at `with` (a); make declaration-position keyword
   recognition independent of preceding-statement parse state (b); treat a
   `subagent fn` body as a Result scope for the `?` check regardless of
   annotation, validating the annotation against the inferred Ok payload (c).
2. Reject `): T` on `subagent fn` outright with a precise diagnostic pointing at
   the FN-6 typed-tail idiom, and update the grammar to remove the slot for the
   `SubagentMod` arm. Smaller, but gives up call-site-visible return typing and
   still requires fixing (b)'s state leak.

Either option needs the FN-6 prose to state explicitly what a supplied return
annotation means.

## Provenance

- Spec measured against: `docs/reference/grammar.md` §"`fn` declarations",
  `docs/spec_topics/functions.md` FN-3/FN-6.
- Repro matrix verified with `parseThetaDocument` at 0.12.0; symptom (b)+(c)
  first hit live in a registered theta during the pi-config theta-migration
  spikes (spike (e); the un-registered slug then fell through to the ordinary
  coding agent under `pi -p` — see RFC 0007 for that surface).
- Examples that sidestep the cluster: `docs/examples/ralph-inline.theta`,
  `docs/examples/refine-inline.theta` (no return annotations).
