---
id: PTQ-1546
title: parseObjectPatternFields silently drops a reserved-keyword field name, where parseObjectLiteral refuses the same token with theta/parse/reserved-keyword-as-identifier
lens: D6
status: open
verdict: confirmed
locations:
  - src/parser/object-pattern-fields.ts:29-33
  - src/parser/body-parser.ts:3191-3210
  - src/parser/body-parser.ts:3533-3548
sites: 3
fix_scope: module
d6_class: posture-divergence
d6_anchor: "docs/bugs/0249-reserved-keyword-keys-no-parser-leaf-backstop.md §Fix — \"Emit `theta/parse/reserved-keyword-as-identifier` at both leaves through the shared builder `reservedKeywordAsIdentifierDiagnostic`\"; docs/spec_topics/lexical.md §Reserved keywords (cited at body-parser.ts:3200 as lexical.md:20)"
wave: qw20260928060032
reported_by: lens-d6-errorposture (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# parseObjectPatternFields silently drops a reserved-keyword field name, where parseObjectLiteral refuses the same token with theta/parse/reserved-keyword-as-identifier

## Observation
The body parser has two `{ Name: X, … }` field-list readers. The object-literal reader (`parseObjectLiteral`) and the object-pattern reader (`parseObjectPatternFields`) both have to decide what to do when the field-name token is a reserved keyword. The literal reader keeps the token as the field name and emits `theta/parse/reserved-keyword-as-identifier`. The pattern reader treats a `keyword`-kind token as "not a field name" and throws it away with no diagnostic (`cursor.advance(); continue;`). The loop then skips the `:` the same way and reads the field's sub-pattern binder as the next field name. So `R { match: x }` parses as `R { x }`, and a bare `{ if: x }` parses as `{ x }`, with no reserved-keyword refusal. A few lines above in the same pattern parser, a reserved keyword in the pattern's head position is refused with the same code the literal reader uses.

## Evidence
**Divergent side: the pattern field loop drops a keyword with no diagnostic.** `src/parser/object-pattern-fields.ts:29-33`:
```ts
    const nameTok = cursor.peek();
    if (nameTok.kind !== "ident" && nameTok.kind !== "string") {
      cursor.advance();
      continue;
    }
```

**Sibling 1: the object-literal field loop refuses the same token class.** `src/parser/body-parser.ts:3191-3210` (`parseObjectLiteral`):
```ts
    while (!this.isPunct("}") && !this.atEnd()) {
      const nameTok = this.peek();
      if (nameTok.kind !== "ident" && nameTok.kind !== "string" && nameTok.kind !== "keyword") {
        // Not a field name: drop the token to guarantee progress.
        this.advance();
        continue;
      }
      this.advance();
      if (nameTok.kind === "keyword") {
        // lexical.md:20 reserves all 32 spellings from identifier position, and
        // `FieldEntry ::= Ident ":" Literal` (grammar.md:599) admits an `Ident`,
        // which a reserved spelling is not. Admitting the token as the field
        // NAME (rather than dropping it, as the arm above still does for a
        // punct/number/etc. head) is what keeps it on `fields` for
        // `checkObjectExpr`'s `present` list, so the field-set checks see the
        // key instead of re-reading its value as the next field's name.
        this.diagnostics.push(
          reservedKeywordAsIdentifierDiagnostic(nameTok.text, nameTok.range, this.file),
        );
      }
```

**Sibling 2: the pattern parser refuses a keyword in the head position, then hands the field list to the divergent loop.** `src/parser/body-parser.ts:3533-3548` (`parsePattern`):
```ts
      if (this.isPunct("{")) {
        if (t.kind === "keyword") {
          this.diagnostics.push(reservedKeywordAsIdentifierDiagnostic(t.text, t.range, this.file));
        } else if (!this.patternHeadTypeNames().has(t.text)) {
          ...
          this.diagnostics.push(unresolvedNamedTypeDiagnostic(t.text, t.range, this.file));
        }
        const fields = parseObjectPatternFields(this.objectPatternCursor);
```
The bare-object-pattern arm at `body-parser.ts:3577-3578` calls the same `parseObjectPatternFields`.

**Why these are the same failure class.** Both loops run the same parse step: reading the field-name token of a brace-delimited `name: value` list, one token at a time from the same body-parser token stream. The test is the same (`peek()`, then branch on `nameTok.kind`), and the grammar constraint is the same (lexical.md §Reserved keywords, "Cannot be used as identifiers: `let`, `mut`, `fn`, `if`, … Using one of these in identifier position is `theta/parse/reserved-keyword-as-identifier`"). The only difference between the two branch conditions is `&& nameTok.kind !== "keyword"`.

**Measured behaviour.** I bundled `tests/helpers/e2e-s1.ts`'s `parseDoc` with `node_modules/.bin/esbuild --bundle --platform=node --format=cjs` into a `$TEMP` directory and ran each case under `---\nmode: prompt\n---\n`:
- `schema R { a: integer }` / `let d = R { a: 1, match: 2 }`: `["theta/parse/extra-object-field extra field 'match' on schema 'R'", "theta/parse/reserved-keyword-as-identifier reserved keyword 'match' cannot be used as an identifier"]`. This is the literal side, which refuses.
- `let d = [{ match: 2 }]`: `bare-object-literal` plus `reserved-keyword-as-identifier 'match'`. This is the literal side, which refuses.
- `schema R { a: integer }` / `let d = R { a: 1 }` / `match d { { if: x } => x, _ => 0 }`: `[]`. This is the pattern side: silent, and the loaded document has no diagnostics.
- `… let r = match d { R { match: x } => x, _ => 0 }`: `["theta/parse/extra-object-field extra field 'x' on schema 'R'"]`. The parsed pattern is `{"kind":"object","typeName":"R","fields":[{"name":"x","pattern":{"kind":"identifier","name":"x"}}]}`. The keyword field is gone, and its binder `x` has become a field name.
- `… R { a: 1, match: y } …`: `["theta/parse/extra-object-field extra field 'y' on schema 'R'"]`, and the fields are `a` and `y`.

**Searches run this session:**
- `grep -rn 'nameTok.kind !== "ident" && nameTok.kind !== "string"' src`: 2 hits, `src/parser/body-parser.ts:3193` (which carries the extra `&& nameTok.kind !== "keyword"`) and `src/parser/object-pattern-fields.ts:30`.
- `grep -rn "parseObjectPatternFields\|tryConsumeRestPattern" src`: 8 hits. `parseObjectPatternFields` is called only from `body-parser.ts:3547` (headed pattern) and `:3578` (bare pattern).

## Why this is a problem
The repository has already ruled on this failure class at the literal sibling. Bug 0249 (fixed 0.240.0) diagnosed a keyword field key being "dropped token-by-token, so `schema T { a: "s", let: nope }` re-reads `nope` as the next field name and reports `extra field 'nope'`". Its §Fix is to "Emit `theta/parse/reserved-keyword-as-identifier` at both leaves through the shared builder `reservedKeywordAsIdentifierDiagnostic`". The comment at `body-parser.ts:3202-3206` records the reason the token is admitted and refused rather than dropped. The pattern-field loop still uses the dropping posture that ruling removed, and it shows the same corruption bug 0249 describes: `R { match: x }` reports `extra field 'x'`, and `{ if: x }` loads clean as a pattern that binds a field named `x`. That violates lexical.md §Reserved keywords, which admits no reserved spelling in identifier position. Within `parsePattern` itself, the head keyword is refused (bug 0219) while the field keyword one production later is not. This is a diagnostic on one path and silence on its sibling for the same token class.

## Suggested direction (non-binding, optional)
Give `parseObjectPatternFields` the literal reader's keyword posture: admit a `keyword`-kind name token as the field name and emit `reservedKeywordAsIdentifierDiagnostic`. That requires a way to push the diagnostic through the cursor interface, which currently exposes no diagnostics sink.

## False-positive check
- **EXST-9 / PIC-73 class check:** neither applies. Both sites are synchronous parse-time diagnostic emission in the body parser. No sink call, producer hook, or optional capability is involved.
- **allow-broad-catch token check:** no catch at any cited site (`grep -n "catch" src/parser/object-pattern-fields.ts`: 0 hits). Nothing to check.
- **Stated-rationale check:** `object-pattern-fields.ts` has no comment on the drop branch, and its header says only "Shared field-list parsing for typed and bare object patterns." The rationale at `body-parser.ts:3200-3206` supports the refusing side. Bug 0249's §Non-goals excludes "The `match` object-pattern head (bugs 0219, 0226, both fixed)". That exclusion covers the HEAD position, which is refused today (`body-parser.ts:3534-3535`), not the field-name position. `grep -rln "parseObjectPatternFields\|object-pattern-fields" quality/ docs/bugs` returns 10 files, none under `docs/bugs/`, so no bug doc rules on the pattern field-name posture. Bugs 0141, 0219 and 0221 mention the "object-pattern field value" only as a recursion depth for head checks. None of them rules on field-name keywords.
- **Sibling-reality check:** both loops are live production parse paths, reached from `parsePattern` (`body-parser.ts:3547`, `:3578`) and `parseObjectLiteral` (`body-parser.ts:3186`). The measured outputs above show the divergence end to end.
- **Already-filed check:** none of the listed filings or rejections covers this. PTQ-1130 (object-pattern field loop cloned) is the D4 dedupe that extracted this helper, not a posture finding. `qw20260923145222-d4-05` concerns pattern-kind switch parallels.
- **Tests:** not consulted as evidence (D7's scope).

## Triage
verdict: confirmed — all three excerpts match at the cited lines (object-pattern-fields.ts:29-33 drops non-ident/string tokens with no diagnostic; body-parser.ts:3193-3210 admits a keyword name and emits reservedKeywordAsIdentifierDiagnostic; :3534-3535 refuses a keyword pattern head, then :3547/:3578 call parseObjectPatternFields). The shape grep gives the stated 2 hits. The call-site grep gives 9 hits, not the stated 8, but its conclusion (only callers are :3547 and :3578) still holds. I rebuilt the probe with esbuild: `R { a: 1, match: 2 }` gives extra-object-field plus reserved-keyword-as-identifier, `{ if: x }` gives [], and `R { match: x }` gives only `extra field 'x'`. The anchor lexical.md:20 ("Cannot be used as identifiers … is theta/parse/reserved-keyword-as-identifier") pins the refusing side. A pattern field name is an Ident position: it is a schema field name, and `{ attempts }` sugars a binder. The same file refuses the head keyword. Bug 0249's non-goal excludes only the pattern HEAD. No intake/issue tracks this (PTQ-1130 is the clone dedupe) (triage: claude-opus-5-5)
