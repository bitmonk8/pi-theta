---
id: PTQ-0177
title: parseSchemaObjectBody opens with a not-`{` guard that returns null, but its sole caller finishObjectSchema is reached only from two `isPunct("{")`-gated dispatch arms, and the guard's own doc calls it "defensive only"
lens: D2
status: fixed
verdict: confirmed
locations:
  - src/parser/theta-document.ts:4194-4198
  - src/parser/theta-document.ts:4163-4166
  - src/parser/theta-document.ts:3999-4000
  - src/parser/theta-document.ts:3947-3949
  - src/parser/theta-document.ts:3958-3960
sites: 1
fix_scope: localized
wave: qw20260910054544
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-10
---

# parseSchemaObjectBody opens with a not-`{` guard that returns null, but its sole caller finishObjectSchema is reached only from two `isPunct("{")`-gated dispatch arms, and the guard's own doc calls it "defensive only"

## Observation
`BodyParser.parseSchemaObjectBody` begins by testing whether the current token
is the punct `{` and returning `null` otherwise. The method has exactly one
caller, `finishObjectSchema`, which is itself called from exactly two sites in
`parseSchema`, each inside an `if (this.isPunct("{"))` arm. The cursor is not
moved between the test and the call. The method's doc comment states this:
"unreachable from `parseSchema`'s dispatch, which calls this only after
confirming `{`, so this guard is defensive only." At the method's introducing
commit (`ecd83aedf`, 2026-07-03) `parseSchema` called `parseSchemaObjectBody()`
unconditionally and this guard was the live dispatch for the non-object forms;
bug 0033's fix (`f959f8de`, 2026-08-01) moved that dispatch into `parseSchema`
and left the guard in place with the "defensive only" annotation.

## Evidence
src/parser/theta-document.ts:4194-4198 — the guard:

```ts
  private parseSchemaObjectBody(): SchemaFieldSource[] | null {
    if (!(this.peek().kind === "punct" && this.peek().text === "{")) {
      return null;
    }
    const openTok = this.advance(); // opening `{`
```

src/parser/theta-document.ts:4163-4166 — the method's own doc:

```ts
   * Capture a `schema X { field: Type, … }` object body's field sources.
   * Returns `null` (and consumes nothing) when the next token is not `{` —
   * unreachable from `parseSchema`'s dispatch, which calls this only after
   * confirming `{`, so this guard is defensive only. A field name is an
```

src/parser/theta-document.ts:3999-4000 — the sole caller:

```ts
  private finishObjectSchema(kw: Token, name: string, by: string | undefined): Stmt {
    const fields = this.parseSchemaObjectBody();
```

src/parser/theta-document.ts:3947-3949 and :3958-3960 — the only two call
sites of `finishObjectSchema`, both gated on `{`:

```ts
    if (this.isPunct("{")) {
      return this.finishObjectSchema(kw, name, undefined);
    }
```

```ts
        if (this.isPunct("{")) {
          return this.finishObjectSchema(kw, name, byField);
        }
```

Caller enumeration: `grep -n "parseSchemaObjectBody()\|finishObjectSchema("
src/parser/theta-document.ts` → the definition at :4194, the one call at
:4000, the definition of `finishObjectSchema` at :3999, and the two calls at
:3948 and :3959; no other hits. `isPunct("{")` at :2937-2940 is
`this.peek(offset).kind === "punct" && t.text === text`, the same predicate the
guard re-tests.

History: `git show ecd83aedf:src/parser/loom-document.ts` shows `parseSchema`
calling `const fields = this.parseSchemaObjectBody();` with no `{` test, and
its comment "The `= …` alias and `by … = …` forms carry no leading `{`, so
they capture no field list and fall through to `skipDeclarationShape`" — the
guard was then the live non-object-form exit. `git log -S'unreachable from
\`parseSchema\`'` → `f959f8de 2026-08-01 fix(bug-0033)`, the commit that added
the `{` / `=` / `by` dispatch to `parseSchema` and the "defensive only" text.

## Why this is a problem
Dead branch, proven: the only path into the method passes through a test
identical to the guard, with no token consumed in between, so the `return
null` at :4196 cannot execute. It is refactor residue — the live dispatch it
once was moved one level up in bug 0033 and the original test stayed behind.
The residue also muddies the method's `null` contract: the doc's next
sentences describe the genuine `null` return (`recoverMalformedSchemaField`
with an empty captured prefix), and a reader has to separate the reachable
`null` from the unreachable one. It is not a spec-mandated fail-closed branch:
its own doc disclaims reachability rather than citing a rule.

## Suggested direction (non-binding, optional)
Let the method assume the `{` its callers already confirmed (consume it
directly), and trim the doc sentence that narrates the guard.

## False-positive check
- Caller search: the grep above enumerates every `parseSchemaObjectBody` and
  `finishObjectSchema` reference in src/; both are `private` members of
  `BodyParser`, so no external caller is possible; `grep -rn
  "parseSchemaObjectBody\|finishObjectSchema" tests extensions tools` → 0 hits.
- Cursor-movement check: between `this.isPunct("{")` at :3947/:3958 and the
  guard at :4195 the only statements executed are the `return
  this.finishObjectSchema(...)` call and `const fields =
  this.parseSchemaObjectBody();` — no `advance()`.
- Spec-mandated fail-closed check: the guard's own doc says "defensive only",
  citing no rule; `theta/parse/empty-schema-body` for the non-`{` forms is
  emitted by `parseSchema`'s own head-only / `by` / alias arms, not via this
  guard.
- Git intent: the introducing commit shows the guard as live dispatch; the
  bug 0033 commit moved dispatch up and annotated the guard rather than
  deleting it, so this is residue, not a deliberate belt.
- Not previously filed: `grep -rln "parseSchemaObjectBody" quality/` → 0.

## Triage
verdict: confirmed — all five excerpts byte-match at the cited lines and the deadness reproduces from my own hunt: `finishObjectSchema` is invoked only at :3948/:3959, each as the sole statement of an `if (this.isPunct("{"))` arm with no intervening `advance`, `parseSchemaObjectBody` is invoked only at :4000 as `finishObjectSchema`'s first statement, and `isPunct` (:2937-2940) is the same predicate as the guard (:4195) over a pure `peek` (:2915, array index with eof fallback), so the `return null` at :4196 cannot execute; both are `private` on `BodyParser` (:2855) with no subclass, no string-keyed/dynamic access, and every one of the ~45 tests/ hits is a comment or assertion-message string (the candidate's FP-check line quoting "0 hits" for the un-parenthesised grep is misquoted — only its paren'd Evidence grep yields 0 — but no invocation exists, so the conclusion stands); git reproduces the residue story exactly (ecd83aed 2026-07-03 had `parseSchema` call it unconditionally with the guard as live non-`{` dispatch; f959f8de bug-0033 2026-08-01 moved the dispatch up and added the "defensive only" sentence; `git log -S` returns only f959f8de); no quality/ filing names either method or the guard (PTQ-0104 is a different root cause in schema-declarations.ts), and an unreachable guard left behind by a dispatch hoist is in-scope D2 residue on the same footing as the confirmed PTQ-0005/0152/0158 subsumed-guard rulings (triage: claude-opus-5)
