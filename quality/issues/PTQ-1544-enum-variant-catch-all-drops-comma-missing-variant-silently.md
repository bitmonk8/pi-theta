---
id: PTQ-1544
title: parseEnumVariants' catch-all silently discards a comma-missing variant, where the schema-body and import-specifier loops refuse the same separator fault
lens: D6
status: open
verdict: confirmed
locations:
  - src/parser/body-parser.ts:2016-2024
  - src/parser/body-parser.ts:1979-1995
  - src/parser/body-parser.ts:1807-1837
  - src/parser/body-parser.ts:2327-2343
sites: 3
fix_scope: module
d6_class: posture-divergence
d6_anchor: docs/bugs/0211-separator-degenerate-specifier-lists-parse-clean.md §Fix — "Refuse a separator-degenerate specifier list at parse time, at error severity"
wave: qw20260928060032
reported_by: lens-d6-errorposture (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# parseEnumVariants' catch-all silently discards a comma-missing variant, where the schema-body and import-specifier loops refuse the same separator fault

## Observation
`BodyParser` has three brace-delimited member-list loops whose members the spec says are comma-separated: the `schema` object body (`parseSchemaObjectBody`), the `import`/`export` specifier list (`parseImportSpecifierList`), and the `enum` variant list (`parseEnumVariants`). When two members sit next to each other with no `,` between them, the schema loop emits `theta/parse/unsupported-feature` ("schema fields must be comma-separated") and keeps both fields. The import loop sets `hasSeparatorDegeneracy` and emits `theta/parse/import-malformed-specifier-list`. The enum loop sends the second name to its catch-all `this.advance()`. That name is dropped from `names`/`variantDecls`, and no diagnostic is emitted. Measured in this session: `enum Color { Red Green, Blue }` parses to variants `["Red","Blue"]`, and the newline-separated `enum Color {\n  Red\n  Green\n}` parses to `["Red"]`. Both come back with zero diagnostics.

## Evidence
**Divergent side (fail-open, silent drop): `src/parser/body-parser.ts:2016-2024`.** This is the comma arm plus the catch-all. After a name is captured, `expectName` is `false` until a `,` re-arms it, so an adjacent second name falls through to the skip:
```ts
      if (depth === 1 && t.kind === "punct" && t.text === ",") {
        currentName = null;
        currentDecl = null;
        expectName = true;
        this.advance();
        continue;
      }
      // Any other in-variant token: skip; the next comma re-arms name capture.
      this.advance();
```
`src/parser/body-parser.ts:1979-1995` is the name-capture arm that sets `expectName = false`:
```ts
        if (t.kind === "keyword") {
          this.diagnostics.push(
            reservedKeywordAsIdentifierDiagnostic(t.text, t.range, this.file),
          );
        }
        names.push(t.text);
        currentName = t.text;
        currentDecl = { name: t.text };
        variantDecls.push(currentDecl);
        expectName = false;
        this.advance();
        continue;
```
Search: `sed -n 1935,2036p src/parser/body-parser.ts | grep -c "diagnostics.push"` returns 2 (the reserved-keyword push above, and `theta/parse/enum-body-unclosed` at :2026-2033). Neither covers the separator.

**Fail-closed sibling 1: `src/parser/body-parser.ts:1807-1837`** (schema object body, same missing-separator fault):
```ts
      // Grammar (`SchemaShape ::= "{" Field ("," Field)* ","? "}"`): fields are
      // comma-separated. Because a newline inside the schema brace body is
      // swallowed as a continuation (no `stmt-sep`), a comma-missing field body
      // otherwise coalesces two fields into one malformed field with no
      // diagnostic (silent data-shape corruption). Require the separator: when a
      // field is directly followed by the start of another field (an
      // ident/keyword name token) with no intervening comma, surface a parse
      // error against that boundary token, then continue parsing so the dropped
      // field is NOT lost.
      if (this.isPunct(",")) {
        this.advance();
      } else {
        ...
        if (startsNextField) {
          this.diagnostics.push({ severity: "error", code: "theta/parse/unsupported-feature", ...
              "unsupported syntactic feature: schema fields must be comma-separated",
```

**Fail-closed sibling 2 (the anchor's fixed side): `src/parser/body-parser.ts:2327-2343`** (import/export specifier list, same catch-all shape):
```ts
      } else if (t.kind === "punct" && t.text === ",") {
        ...
        if (!sawSpecifier || separatorSeen) {
          hasSeparatorDegeneracy = true;
        }
        this.advance();
        separatorSeen = true;
      } else {
        // The catch-all: a token `ImportSpec` / `ExportSpec` never admits
        // (`42`, `"x"`, `:`, a second `as`) is discarded rather than
        // reported, which is itself the production violation (bug 0211).
        hasSeparatorDegeneracy = true;
        this.advance();
      }
```

**Anchor (quoted verbatim, opened this session).** `docs/bugs/0211-separator-degenerate-specifier-lists-parse-clean.md` §Fix says: "**Refuse a separator-degenerate specifier list at parse time, at error severity, on both keywords.** `parseImportExport` raises the refusal for a list in which two specifiers are adjacent with no `,` between them, … or a token is discarded by the loop's catch-all". Its §Why section says: "**A missing comma is silently equated with a written one.**"

**Spec: one separator rule governs both schema and enum bodies.** `docs/spec_topics/descriptions.md:43` says: "Fields and enum variants are comma-separated; trailing comma is **optional**." `docs/spec_topics/schemas.md:17` says "Fields are comma-separated", and `docs/spec_topics/schemas.md:93` says "Variants are comma-separated; trailing comma optional."

**Measurement (this session).** The scratch script was `$TEMP/tmp.41otcpPFLF/probe.ts` and `probe2.ts`. They call `parseThetaDocument` over `---\nmode: prompt\n---\n` + body, with inert `systemNote` and a resolving `modelMatcher`, and were run with `npx --prefix C:/UnitySrc/pi-theta vite-node probe.ts`:
- `enum Color { Red Green, Blue }` → variants `["Red","Blue"]`, diagnostics `[]`
- `enum Color {\n  Red\n  Green\n}` → variants `["Red"]`, diagnostics `[]`
- `schema P { a: string b: string }` → fields `["a","b"]`, `theta/parse/unsupported-feature: unsupported syntactic feature: schema fields must be comma-separated`
- `import { a b } from "./lib.thetalib"` → `theta/parse/import-malformed-specifier-list: …`
- `enum Color { Red, Green Blue }` followed by `Color.Blue` → variants `["Red","Green"]`. The only diagnostic is `theta/parse/unknown-variant: unknown variant 'Blue' on enum 'Color'`, which lands on the use site and names a variant the author declared.

**Why these are the same failure class, stated mechanically.** All three loops iterate the members of one `{ … }` group, and the spec requires `,` between members. In each case the fault is the same token event: a member-start token (an `ident`/`keyword`) arrives while the previous member is complete and no `,` has been consumed. The schema loop detects that event through `startsNextField`, the import loop through `sawSpecifier && !separatorSeen` (or its catch-all), and the enum loop routes it to its catch-all `advance()`.

## Why this is a problem
This repository's posture is fail-closed. For this exact fault, the two sibling loops fail closed: the schema loop keeps the field and emits a diagnostic, and the import loop was moved to fail closed by the bug 0211 ruling, which calls a silently discarded catch-all token "itself the production violation". The enum loop fails open. It discards a declared variant and registers the theta with a shorter variant set than the author wrote, so the declaration no longer matches its source. The schema-site comment names this as "silent data-shape corruption". The loss shows up only indirectly, and only if the dropped variant is referenced somewhere, as an `unknown-variant` error at the use site. The newline-separated spelling (`enum E {\n A\n B\n}`) also parses silently to one variant.

## Suggested direction (non-binding, optional)
Bring the enum variant loop onto the posture its two siblings already have. One way is to raise a parse-time refusal when a variant-name token arrives while `expectName` is `false`, and keep the variant rather than discarding it. The fix stage chooses the registered code under DIAG-2.

## False-positive check
- **EXST-9 / PIC-73 class check:** not applicable. This is a parse-time recovery loop, not a status-bus sink or producer hook, and not an optional degrade-silent capability.
- **allow-broad-catch token check:** no `catch` is cited on either side. `grep -n "allow-broad-catch" src/parser/body-parser.ts` finds no hit in the cited ranges (the file-wide grep for `catch` at the start of this session returned only comment text at :2154 and :2338).
- **Stated-rationale check:**
  - Enum site: the only comment is ":2023 Any other in-variant token: skip; the next comma re-arms name capture". It describes the mechanism and gives no reason for staying silent. The `parseEnumVariants` doc comment (:1912-1934) says a non-string explicit value "is not captured (… the strictness diagnostic is a separate check)". That covers values, not names.
  - `docs/bugs/0259-unclosed-enum-variant-list-at-eof-loads-clean.md` §Non-goals fences "Every other `enum` body rule" as untouched and lists the non-string/duplicate/reserved/inline dispositions. It makes no ruling on a missing separator.
  - Schema site: its rationale (:1807-1815) argues for refusing, which is the posture this filing calls right.
- **Sibling-reality check:** all three sides were measured through `parseThetaDocument` this session, with the outputs above. `grep -rnE "enum [A-Za-z]+ \{ ?[A-Z][A-Za-z]* [A-Z][A-Za-z]*( |,|\})" tests src docs` returns 0 hits, and `grep -rnE 'enum [A-Za-z]+ \{\\n +[A-Z][a-z]+\\n +[A-Z]' tests` returns 0 hits. No test pins the silent drop as intended.
- **Already-filed check:** `grep -rli "parseEnumVariants\|enum variant" quality/intake quality/issues` returns 1 file (`quality/issues/PTQ-1523-body-parser-residual-strong.md`, a D9 size filing, not this topic). No listed PTQ or intake title covers the enum separator.

## Triage
verdict: confirmed — all excerpts match at the cited lines (enum capture arm :1979-1995 and comma/catch-all :2016-2024, schema `startsNextField` refusal :1807-1837, import catch-all `hasSeparatorDegeneracy` :2327-2343). Searches reproduce (2 diagnostics.push in :1935-2036; 0/0 test-pin hits; no allow-broad-catch; only PTQ-1523 (D9) and this file mention the topic). My own vite-node probe through parseThetaDocument reproduces every measurement: `enum Color { Red Green, Blue }`→[Red,Blue] with [], newline form→[Red] with [], schema→unsupported-feature, import→import-malformed-specifier-list, `Green Blue`→only unknown-variant at the use site. The sibling class is mechanical: a member-start token arrives with no `,` consumed. The anchor is real: bug 0211 §Fix refuses exactly this missing-separator/catch-all-discard shape at error severity, and §Why it matters says "A missing separator is not a separator". The spec gives enums the same separator rule (schemas.md:93 "Variants are comma-separated", descriptions.md:43), and code-registry-parse.md:114 cites that rule for parseEnumVariants. No stated rationale holds on the enum side, and bug 0259 §Non-goals makes no ruling on a missing separator. No duplicate found (triage: claude-opus-5-5)
