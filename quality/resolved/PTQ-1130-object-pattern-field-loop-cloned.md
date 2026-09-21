---
id: PTQ-1130
title: Object-pattern field loop is duplicated for typed and bare object patterns
lens: D4
status: fixed
verdict: confirmed
locations:
  - src/parser/theta-document.ts:6118-6151
  - src/parser/theta-document.ts:6181-6214
sites: 2
fix_scope: module
d4_class: clone
wave: qw20260920183643
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-20
---

# Object-pattern field loop is duplicated for typed and bare object patterns

## Observation
`BodyParser.parsePattern` contains two branches that parse the fields of an
object pattern. One branch handles a typed object pattern whose head is an
identifier naming a type (`{ Type: field: p, … }`); the other handles a bare
object pattern (`{ field: p, … }`). Both branches run the same field-parsing
loop: consume an optional rest pattern, read each field name token, parse a
`field: pattern` pair or sugar a bare name, skip commas, and close on `}`. The
only difference between the two copies is the `typeName` carried on the returned
`object` node (`t.text` versus `null`).

## Evidence
Clone-map group **G001** (219 tokens, identical):

- `src/parser/theta-document.ts:6118-6151` (typed object-pattern arm):
  ```ts
        this.advance();
        const fields: { readonly name: string; readonly pattern: PatternNode }[] = [];
        while (!this.isPunct("}") && !this.atEnd()) {
          if (this.tryConsumeRestPattern()) {
            if (this.isPunct(",")) {
              this.advance();
            }
            continue;
          }
          const nameTok = this.peek();
          if (nameTok.kind !== "ident" && nameTok.kind !== "string") {
            this.advance();
            continue;
          }
          this.advance();
          let fieldPattern: PatternNode;
          if (this.isPunct(":")) {
            this.advance();
            fieldPattern = this.parsePattern();
          } else {
            // `{ field }` sugars `{ field: field }` (grammar.md §Pattern
            // grammar): a colon-less field binds the field value to a
            // same-named identifier, never a wildcard on the next token.
            fieldPattern = { kind: "identifier", name: nameTok.text };
          }
          fields.push({ name: nameTok.text, pattern: fieldPattern });
          if (this.isPunct(",")) {
            this.advance();
          }
        }
        if (this.isPunct("}")) {
          this.advance();
        }
        return { kind: "object", typeName: t.text, fields, range: spanRange(t.range, this.prevRange()) };
  ```

- `src/parser/theta-document.ts:6181-6214` (bare object-pattern arm):
  ```ts
      this.advance();
      const fields: { readonly name: string; readonly pattern: PatternNode }[] = [];
      while (!this.isPunct("}") && !this.atEnd()) {
        if (this.tryConsumeRestPattern()) {
          if (this.isPunct(",")) {
            this.advance();
          }
          continue;
        }
        const nameTok = this.peek();
        if (nameTok.kind !== "ident" && nameTok.kind !== "string") {
          this.advance();
          continue;
        }
        this.advance();
        let fieldPattern: PatternNode;
        if (this.isPunct(":")) {
          this.advance();
          fieldPattern = this.parsePattern();
        } else {
          // `{ field }` sugars `{ field: field }` (grammar.md §Pattern
          // grammar): a colon-less field binds the field value to a
          // same-named identifier, never a wildcard on the next token.
          fieldPattern = { kind: "identifier", name: nameTok.text };
        }
        fields.push({ name: nameTok.text, pattern: fieldPattern });
        if (this.isPunct(",")) {
          this.advance();
        }
      }
      if (this.isPunct("}")) {
        this.advance();
      }
      return { kind: "object", typeName: null, fields, range: spanRange(t.range, this.prevRange()) };
  ```

Diff verdict: **identical per clone map**; local inspection shows a single
substitution at the return statement (`typeName: t.text` versus `typeName:
null`). The field-parsing loop itself is byte-identical.

## Why this is a problem
The two branches encode the same grammar production (`ObjectPatternField`)
twice. If the object-pattern grammar or recovery rules change — for example,
rest-pattern comma handling, string-keyed fields, or missing-brace recovery —
the change must be applied in both places. A fix that updates only the typed
branch would make bare object patterns behave differently from typed object
patterns, violating the grammar's claim that the field-list syntax is the same
in both forms. The duplicate also inflates the parser and makes the
intentional difference (the `typeName`) harder to see.

## Suggested direction (non-binding, optional)
A single private helper that parses the object-pattern field list and returns
`{ fields, endRange }` could be called from both branches; each caller would
supply its own `typeName`. The helper would live next to `parsePattern` in the
same module.

## False-positive check
- Re-read both spans at the cited lines: the loop bodies match verbatim.
- Verified both copies are live call sites inside the active `parsePattern`
  method; neither is dead code.
- No spec clause repeats this exact parser implementation; the duplication is
  not a normative reference vector.
- The similarity is not in tests/ or generated code.

## Triage
verdict: confirmed — clone-scan map re-run lists G001 (219 tokens, identical) at src/parser/theta-document.ts:6118-6151 and :6181-6214; own diff of the two spans shows a single substitution (`typeName: t.text` vs `typeName: null`), both arms live in `parsePattern` via distinct head-token dispatch, no spec vector table, no tracked duplicate (PTQ-1074/PTQ-0645 are test-side) (triage: claude-fable-5-1)
