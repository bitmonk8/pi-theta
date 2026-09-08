---
id: PTQ-0109
title: checkImportSeparatorDegenerateSpecifierList's doc comment pins the ImportDecl grammar at imports.md:62-65 and the registry row at code-registry-parse.md:122, but both sit elsewhere (:79-:82 and :144)
lens: D2
status: open
verdict: confirmed
locations:
  - src/parser/imports.ts:496-498
  - src/parser/imports.ts:509-511
  - src/parser/imports.ts:520-521
sites: 3
fix_scope: localized
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# checkImportSeparatorDegenerateSpecifierList's doc comment pins the ImportDecl grammar at imports.md:62-65 and the registry row at code-registry-parse.md:122, but both sit elsewhere (:79-:82 and :144)

## Observation
The doc comment on `checkImportSeparatorDegenerateSpecifierList` anchors its contract to two spec locations by line number: the `ImportDecl` / `ExportDecl` productions at "imports.md §Re-exports, :62–:65 at this HEAD", and the `theta/parse/import-malformed-specifier-list` registry row's "statement-arm gate" and "partition sentence" at "code-registry-parse.md:122" (cited twice). At the current HEAD, imports.md:62-65 holds prose about `.theta`-hosted `export … from` refusal, and code-registry-parse.md:122 is the `theta/parse/duplicate-discriminator-value` row; the cited content actually sits at imports.md:79-82 and code-registry-parse.md:144.

## Evidence
src/parser/imports.ts:496-498:
```
 * token the specifier loop's catch-all discarded. `ImportDecl` / `ExportDecl`
 * spell the list as `"{" ImportSpec ("," ImportSpec)* ","? "}"` (imports.md
 * §"Re-exports", :62–:65 at this HEAD) — one specifier between separators and
```
src/parser/imports.ts:509-511 and :520-521:
```
 * (bug 0211 §Fix constraint 3; registry disposition at
 * `docs/spec_topics/diagnostics/code-registry-parse.md:122`'s statement-arm
 * gate) — a from-less degenerate list already draws that one code alone, and
```
```
 * statement (bug 0211 §Fix constraint 2's granularity, carried in
 * `code-registry-parse.md:122`'s partition sentence) — without the
```
docs/spec_topics/imports.md:79-82 (the actual productions; :60-:65 is unrelated prose about the `.theta` export-from refusal):
```
ImportDecl ::= "import" "{" ImportSpec ("," ImportSpec)* ","? "}" "from" STRING
ExportDecl ::= "export" "{" ExportSpec ("," ExportSpec)* ","? "}" "from" STRING
ImportSpec ::= Ident ("as" Ident)?
ExportSpec ::= Ident ("as" Ident)?
```
docs/spec_topics/diagnostics/code-registry-parse.md: `grep -n "import-malformed-specifier-list"` → the row (which carries the statement-arm gate and the partition sentence the comment names) is at line 144; line 122 is the `theta/parse/duplicate-discriminator-value` row.

## Why this is a problem
Historical narration that no longer matches the code's references: both pinned line numbers point a reader at unrelated spec content (`.theta` export prose; a discriminator registry row) instead of the production and the registry row the comment reasons from. The `:122` pin appears twice, so both load-bearing justifications in this comment (why the check is gated, why the arms partition) dereference to the wrong row. The comment even flags its own fragility ("at this HEAD") — the HEAD has moved and the pin was not updated.

## Suggested direction (non-binding, optional)
Re-anchor the three pins to the current lines (imports.md:79-82; code-registry-parse.md:144) or replace the raw line numbers with the section/row names the same comment already carries, which do not drift.

## False-positive check
- Read docs/spec_topics/imports.md:60-66 and :78-82 at HEAD: the grammar block starts at :79; :62-65 is prose about the from-bearing export refusal in `.theta` files.
- `grep -n "import-malformed-specifier-list" docs/spec_topics/diagnostics/code-registry-parse.md` → single row at :144, whose text contains both the statement-arm gate ("fires only where the trailing clause is well-formed") and the partition sentence ("the three statement/specifier arms partition") the comment cites; `sed -n '120,124p'` shows :122 is `duplicate-discriminator-value`.
- Checked the already-filed set for imports.ts citation findings: none of the listed candidates (including the two citation-drift findings of this wave, which cover binder-system-prompt.ts and production-composition.ts) cites src/parser/imports.ts.
- Verified the drift is not self-healing: no other spelling of these two anchors exists in the same comment.

## Triage
verdict: confirmed — re-verified at HEAD: all three excerpts are verbatim at the cited lines, imports.md:62-65 is `.theta` export-refusal prose with the productions at :79-82, and code-registry-parse.md:122 is `duplicate-discriminator-value` while the cited statement-arm-gate and partition sentences sit only in the sole `import-malformed-specifier-list` row at :144; `git show e0873e53` confirms genuine drift (the productions were at :62-65 when the comment was written, registry row at :123), no other intake candidate cites src/parser/imports.ts (triage: claude-opus-5)
