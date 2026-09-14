---
id: PTQ-0152
title: parseEnumVariants re-tests `currentName !== null` inside a branch whose own entry condition already requires it
lens: D2
status: fixed
verdict: confirmed
locations:
  - src/parser/theta-document.ts:4238-4255
sites: 1
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# parseEnumVariants re-tests `currentName !== null` inside a branch whose own entry condition already requires it

## Observation
`parseEnumVariants`'s explicit-value arm is entered only when
`currentName !== null` is part of its guard. Twelve lines into that arm the same
condition is tested again, conjoined with the value-kind test, before writing
`values[currentName]`. Nothing between the two tests assigns `currentName`: the
only writes to it are the variant-name capture at 4231 and the comma reset at
4258, both in sibling arms of the same `while` that `continue` rather than fall
through.

## Evidence
src/parser/theta-document.ts:4238-4255 — the arm's guard (4238) and the
subsumed re-test (4250):

```ts
      if (depth === 1 && currentName !== null && t.kind === "punct" && t.text === "=") {
        // An explicit `= <value>` for the current variant. Only a string literal
        // becomes the wire value; a non-string literal is retained on the
        // variant decl (kind + text) so `checkEnumDeclaration` can reject it
        // (schemas.md §Enum declarations — string values only).
        this.advance(); // `=`
        const valueTok = this.peek();
        const captured = classifyEnumValueToken(valueTok);
        if (captured !== undefined) {
          if (currentDecl !== null) {
            currentDecl.value = captured;
          }
          if (captured.kind === "string" && currentName !== null) {
            values[currentName] = captured.text;
          }
          this.advance();
        }
        continue;
      }
```

The only two writes to `currentName` in the enclosing loop, both in arms that
`continue` before reaching 4250 — src/parser/theta-document.ts:4230-4236 and
:4257-4261:

```ts
        names.push(t.text);
        currentName = t.text;
        currentDecl = { name: t.text };
        variantDecls.push(currentDecl);
        expectName = false;
        this.advance();
        continue;
```

```ts
      if (depth === 1 && t.kind === "punct" && t.text === ",") {
        currentName = null;
        currentDecl = null;
        expectName = true;
        this.advance();
```

The declaration, showing `currentName` is a plain function-local `let` with no
closure capture anywhere in the method (src/parser/theta-document.ts:4203):

```ts
    let currentName: string | null = null;
```

## Why this is a problem
A guard that can only ever evaluate true is dead as a condition: it selects no
input and rules out no state, so it reads as protection against a case the arm's
own entry test has already excluded. It also gives the arm two apparently
independent null-hypotheses for one variable, which makes the invariant the
loop actually maintains (`currentName` and `currentDecl` are written and cleared
as a pair) harder to see rather than easier.

## Suggested direction (non-binding, optional)
Drop the redundant conjunct at 4250 so the arm's single entry guard is the one
place `currentName`'s nullability is decided.

## False-positive check
- Verified `currentName` is not captured by any closure inside
  `parseEnumVariants` (src/parser/theta-document.ts:4176-4277 contains no arrow
  function or nested `function`), so control-flow narrowing from the arm guard
  at 4238 is not invalidated by the intervening `this.advance()` /
  `this.peek()` / `classifyEnumValueToken` calls.
- Verified the write set: `grep -n "currentName" src/parser/theta-document.ts`
  → 4203 (declaration), 4231 (assign in the name-capture arm), 4238 (the arm
  guard), 4250 (the re-test), 4251 (the read), 4258 (reset in the comma arm).
  Both assigning arms end with `continue`, so neither can reach 4250 within the
  same iteration.
- Not a deadness claim about `parseEnumVariants` or its arm — both are live
  (called from `parseEnum`, src/parser/theta-document.ts:4141). Only the
  conjunct is unreachable-as-false.
- Distinguished from the sibling test at 4247 (`currentDecl !== null`), which is
  NOT claimed here: the arm guard tests `currentName`, not `currentDecl`, so
  that test still carries the compiler's narrowing for `currentDecl.value`.
- Reference searches for the identifier outside this file are not applicable —
  `currentName` is a function-local; `grep -rn "currentName" src extensions
  tools tests --include=*.ts` shows no cross-file use of this binding.

## Triage
verdict: confirmed — re-verified at src/parser/theta-document.ts (lines exact, no drift): the arm guard :4238 narrows `currentName`, and the TS checker itself reports its flow type as already `string` at the :4250 re-test (vs `string | null` at :4238 and at the :4247 `currentDecl` sibling the candidate correctly excludes), so the conjunct is always-true and not load-bearing for the :4251 write; sole writes :4231/:4258 sit in sibling arms that `continue` (:4236/:4262), the function 4176-4277 contains no closure capture, and `grep -rn currentName src extensions tools tests` shows no other binding. (triage: claude-opus-5)
