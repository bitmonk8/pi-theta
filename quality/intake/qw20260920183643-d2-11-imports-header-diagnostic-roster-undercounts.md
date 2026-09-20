---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: imports.ts module header names only 4 of the 13 diagnostic codes the file owns
lens: D2                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending              # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/parser/imports.ts:1-12
  - src/parser/imports.ts:27-142
  - src/parser/imports.ts:298-418
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260920183643
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-20
---

# imports.ts module header names only 4 of the 13 diagnostic codes the file owns

## Observation
The file-header comment at the top of `src/parser/imports.ts` states the
module "owns" a specific, enumerated set of diagnostics: "the import-cycle /
unknown-symbol / name-collision / unresolvable-path diagnostics". The file
(excluding the separately-headed V15i export-visibility section) actually
defines thirteen distinct `_CODE` constants, of which the header names four.
The other nine — including two whole diagnostic families
(`import-reserved-synthesised-name`, `imported-type-name-collision`) and the
five `.thetalib`/`.theta`-placement/extension codes — are introduced only by
bare `// ── theta/…/… ──` section dividers with no narrative sentence and no
mention in the file's opening description.

## Evidence
src/parser/imports.ts:1-12
```ts
// V15c / V15c-T — `.thetalib` import resolution and diagnostics.
//
// This module owns the `.thetalib` import path: the permitted top-level forms
// (`import`/`export`/`schema`/`enum`/`fn`), relative `.thetalib`-only resolution
// through the named `Resolver` seam, and the import-cycle / unknown-symbol /
// name-collision / unresolvable-path diagnostics (per imports.md, incl. the
// IMP-1 resolver failure contract).
//
// Diagnostic *Message* strings are sourced from the diagnostics registry
// (diagnostics/code-registry-parse.md, diagnostics/code-registry-load.md) per
// the *Diagnostic message anchors* rule; `<path>` / `<name>` placeholders are
// rendered per diagnostics/placeholder-rendering-b.md (the path-literal text as
// written, no realpath normalisation).
```

Every `_CODE` constant declared in the file ahead of the V15i section
(`grep -n "^export const .*_CODE" src/parser/imports.ts`, lines before 671):
```
27:  THETALIB_TOP_LEVEL_STATEMENT_CODE   ("theta/parse/thetalib-top-level-statement")
81:  EXPORT_IN_THETA_CODE                ("theta/parse/export-in-theta")
89:  EXPORT_NOT_TOP_LEVEL_CODE           ("theta/parse/export-not-top-level")
96:  IMPORT_NOT_TOP_LEVEL_CODE           ("theta/parse/import-not-top-level")
103: IMPORT_NON_THETALIB_EXTENSION_CODE  ("theta/parse/import-non-thetalib-extension")
142: UNRESOLVABLE_THETALIB_PATH_CODE     ("theta/load/unresolvable-thetalib-path")
298: IMPORT_UNKNOWN_SYMBOL_CODE          ("theta/parse/import-unknown-symbol")
299: IMPORT_NAME_COLLISION_CODE          ("theta/parse/import-name-collision")
323: IMPORTED_TYPE_NAME_COLLISION_CODE   ("theta/load/imported-type-name-collision")
334: IMPORT_RESERVED_SYNTHESISED_NAME_CODE ("theta/parse/import-reserved-synthesised-name")
380: IMPORT_MISSING_FROM_CLAUSE_CODE     ("theta/parse/import-missing-from-clause")
418: IMPORT_MALFORMED_SPECIFIER_LIST_CODE ("theta/parse/import-malformed-specifier-list")
671: IMPORT_CYCLE_CODE                   ("theta/load/import-cycle")
```
Only `IMPORT_UNKNOWN_SYMBOL_CODE`, `IMPORT_NAME_COLLISION_CODE`,
`UNRESOLVABLE_THETALIB_PATH_CODE`, and `IMPORT_CYCLE_CODE` correspond to the
header's four named families ("unknown-symbol / name-collision /
unresolvable-path" + "import-cycle"). The other nine constants — six distinct
error codes plus the malformed-specifier-list code shared by three checking
functions — are each introduced only by a bare divider comment, for example:

src/parser/imports.ts:80-86
```ts
// ── theta/parse/export-in-theta ──────────────────────────────────────────────────

export const EXPORT_IN_THETA_CODE = "theta/parse/export-in-theta";
export const EXPORT_IN_THETA_MESSAGE =
  "a from-bearing 'export … from' is not permitted at a .theta top level; a .theta file is not importable, so its export is never read";
export const EXPORT_IN_THETA_HINT =
  ".theta files are not importable — remove the `from` clause or move this export into a .thetalib.";
```

## Why this is a problem
The header comment is written as a scope statement ("This module owns …") that
enumerates the diagnostic families as a closed list. A reader who trusts that
enumeration to find every diagnostic this module can raise — the header's
stated purpose — will miss two-thirds of them: the `.theta`/`.thetalib`
placement and extension codes (`export-in-theta`, `export-not-top-level`,
`import-not-top-level`, `import-non-thetalib-extension`), the reserved-name and
malformed-specifier-list codes, and the `imported-type-name-collision` code
added for cross-file collisions. None of these carry their own scope-declaring
header the way the later V15i section does (`// ── V15i / V15i-T — export
visibility and re-exports ─────`), so the top-of-file comment is the only
candidate description a reader has, and it undercounts.

## Suggested direction (non-binding, optional)
Widen the header's diagnostic-family list (or drop the closed enumeration in
favour of a general "and related diagnostics" phrasing) so it reflects what the
module has grown to own since V15c.

## False-positive check
- `grep -n "^export const .*_CODE" src/parser/imports.ts` — enumerated all
  thirteen exported code constants in the file ahead of the V15i section; cross
  referenced each against the header's four named families.
- Read the six-line header paragraph in full; it names no other diagnostic
  family and gives no "non-exhaustive" or "for example" qualifier — it is
  phrased as a scope statement ("This module owns …").
- Confirmed the nine omitted codes are wired to production checks
  (`checkThetaLibTopLevelForm`, `checkImportExtension`, `checkImportReservedSynthesisedName`,
  `checkImportMissingFromClause`, `checkImportMalformedSpecifierList`,
  `checkImportDanglingAlias`, `checkImportSeparatorDegenerateSpecifierList`),
  all called from `src/parser/theta-document.ts`, so they are live production
  diagnostics, not scaffolding — the omission is a stale/incomplete header
  claim, not a dead-code question.

## Triage
