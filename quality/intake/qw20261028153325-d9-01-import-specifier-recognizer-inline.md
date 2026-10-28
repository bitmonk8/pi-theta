---
id: pending
title: BodyParser.parseImportSpecifierList keeps single-specifier recognition inside its list-state loop.
lens: D9
status: intake
verdict: pending
locations:
  - src/parser/body-parser.ts:1368-1533
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/parser/body-parser.ts#BodyParser.parseImportSpecifierList
d9_band: justify
wave: qw20261028153325
reported_by: lens-d9-placement (openai/gpt-6.1-sol)
date: 2026-10-28
triaged_at: e071eada0d46fdc4e5ebc1a9f3bb2a97f028d3a5
---

# BodyParser.parseImportSpecifierList keeps single-specifier recognition inside its list-state loop.

## Observation
The authoritative map gives `BodyParser.parseImportSpecifierList` 166 LOC, justify band, at lines 1368–1533. The module header describes recursive-descent body parsing and token lookahead for the theta-document seam, with schema/enum recognition delegated to a sibling. This method combines the comma/brace list state with source-name capture, optional alias recognition, and specifier-level diagnostics. The map records the method as private; its enclosing `BodyParser` declaration has 0/0 src/tests importers.

## Evidence
Step inventory; lengths below are the inclusive mapped-source spans, including their explanatory comments, not a new measurement of the host:

| phase | line ranges | LOC | locals read/written |
|---|---|---:|---|
| result shape and list-state initialization | 1368–1401 | 34 | writes `specifiers`, `symbols`, `hasBraces`, `sawSpecifier`, `separatorSeen`, `hasSeparatorDegeneracy`, `anyDanglingAlias` |
| brace/loop entry and missing-separator gate | 1402–1415 | 14 | reads/writes list flags; writes `t`, `isSymbolToken`; advances cursor |
| source and optional alias recognition | 1416–1464 | 49 | reads `t`; writes `source`, `sourceRange`, `local`, `endRange`, `aliasConsumedWithNoAlias`, `aliasTok`; writes diagnostics/cursor |
| specifier and local-name recording | 1465–1471 | 7 | reads source/alias outputs; writes `specifierRange`, `specifiers`, `symbols` |
| list-state transition | 1472–1480 | 9 | reads `aliasConsumedWithNoAlias`; writes `sawSpecifier`, `separatorSeen`, `anyDanglingAlias` |
| specifier-level dangling-alias and synthesised-name verdicts | 1481–1509 | 29 | reads `aliasConsumedWithNoAlias`, `local`, `specifierRange`; writes diagnostics; `danglingAlias`/`reserved` stay local |
| comma and catch-all recovery | 1510–1527 | 18 | reads `t`, `sawSpecifier`, `separatorSeen`; writes `hasSeparatorDegeneracy`, `separatorSeen`, cursor |
| closer and result | 1528–1533 | 6 | advances cursor; reads result arrays and flags |

Source/alias capture begins at `src/parser/body-parser.ts:1429-1438`:

```ts
          const source = t.text;
          const sourceRange = t.range;
          this.advance();
          let local = source;
          let endRange = sourceRange;
          let aliasConsumedWithNoAlias = false;
          // `Source as Local`: the `as` keyword rebinds to the trailing alias.
          if (this.isKeyword("as")) {
            this.advance(); // `as`
            const aliasTok = this.peek();
```

The list-state transition uses only the alias outcome, not the alias recognizer's working locals (`src/parser/body-parser.ts:1478-1480`):

```ts
          sawSpecifier = true;
          separatorSeen = false;
          anyDanglingAlias = anyDanglingAlias || aliasConsumedWithNoAlias;
```

Seam cost: single-specifier work needs the already-peeked `t` and the parser receiver. Its outputs consumed by the list are the specifier/local name and dangling-alias flag. `sawSpecifier`, `separatorSeen`, `hasBraces`, `hasSeparatorDegeneracy`, and the aggregate `anyDanglingAlias` need not enter that work. The specifier's `sourceRange`, `endRange`, `aliasTok`, and diagnostic temporaries have no subsequent list-state use.

## Why this is a problem
The justify band presumes breakdown unless a concrete keep-whole reason applies. The grammar-family reason was considered against `docs/reference/grammar.md:34-37`: the list repeats the separately named `ImportSpec ::= Ident ("as" Ident)?` / `ExportSpec` subproduction, but that subproduction is inline, rather than already called out. Source/alias recognition and its specifier verdicts occupy 85 LOC across 1416–1471 and 1481–1509; separator bookkeeping is outside those ranges.

Shared-local-state does not require six threaded locals at this seam: the list retains its flags and arrays, while the specifier work uses `t` and the existing receiver and yields the captured specifier and alias outcome. Closed-enumeration dispatch does not account for this length: it is a repeated list recognizer, with a 101-line symbol branch at 1409–1509, not short arms mirroring a spec table. Data-only and generated-code reasons do not apply to the cursor mutation and diagnostic emission in the inventory. The grammar's statement/specifier diagnostic partition remains relevant, but the statement-level verdicts are already outside this method in `parseImportExport`; it does not require source/alias capture to remain inline here.

## Suggested direction (non-binding, optional)
Seam A: source/alias recognition, specifier construction and specifier-level verdicts -> `BodyParser.parseImportSpecifier` (hypothesis, unproven) - 85 LOC across 1416–1471 and 1481–1509, 0 exported symbols moved, 0/0 external src/tests importers; cross-references back into the host: existing receiver cursor/diagnostic/file facilities and a returned specifier plus dangling-alias outcome consumed by the list loop. The human ratifies the seam.

## False-positive check
- **Band:** 166 LOC, justify, from the supplied map; the file-level host is not the subject of this finding.
- **Reasons considered:** grammar-family, shared locals, closed enumeration, data-only, and generated code were checked against the phase inventory above.
- **Exemptions check:** `quality/exemptions.json` contains no key for this method. The `BodyParser.parseQuery` ruling is a different host.
- **Generated-code check:** the module is hand-authored recursive descent with bug-specific recovery commentary, not generator output.
- **Spec-mirror check:** reference grammar lines 34–37 separately name the list and the individual specifier; its symbol branch is 101 inclusive source lines, not a short dispatch arm.
- **Duplicate/history check:** PTQ-1182 concerned the former 244-LOC `parseImportExport` and extracted this entire list; PTQ-1523 concerns file-level declaration groups. Neither filed the inline single-specifier subproduction under this host. `git log -S 'parseImportSpecifierList' -- src/parser/body-parser.ts src/parser/theta-document.ts` shows extraction/move commits `7a0d5e0e` and `702a1f2e`, not a reverted single-specifier split.
- **Caller check:** `rg -n 'parseFnParamList|parseImportSpecifierList' src tests extensions tools --glob '*.ts'` finds this declaration and its call in `parseImportExport` at 1280 (the other matches concern `parseFnParamList`). This is live private grammar code, not a D2 deadness claim. Importer accounting uses the map's private member / enclosing declaration 0/0, not an estimated file count.
- **Range check:** all inventoried ranges and both excerpts were re-read immediately before filing; no end-to-end read of body-parser.ts was used.

## Triage
verdict: questionable — Accounting verified: size-scan reproduces 1368–1533 / 166 LOC / justify, private member and 0/0 enclosing-declaration importers; both excerpts and all eight inventory spans match, including 85 LOC of specifier recognition/recording/verdicts distinct from separator state. grammar.md:34–37 separately names the repeated specifier subproduction, and its working locals do not feed list bookkeeping except through the captured specifier and dangling-alias outcome; the diagnostic partition imposes no keep-whole boundary here. Searches and extraction/move history reproduce; no exemption, reverted split or same-root duplicate found (PTQ-1182 extracted the list; PTQ-1523 addressed file-level groups). The breakdown shape needs a human ruling. (triage: claude-opus-5-5)
