---
id: PTQ-1095
title: type-grammar.ts's module header bullet list omits three diagnostic codes the file constructs
lens: D2                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/parser/type-grammar.ts:11-94
  - src/parser/type-grammar.ts:1171-1179
  - src/parser/type-grammar.ts:1588-1593
  - src/parser/type-grammar.ts:1730-1736
sites: 3
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260920183643
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-20
---

# type-grammar.ts's module header bullet list omits three diagnostic codes the file constructs

## Observation
The file's top-of-file module comment (lines 9-94) introduces a bulleted
roster of the diagnostic codes this seam owns ("The position-sensitive checks
need the surrounding annotation context the tokeniser does not carry, so the
seam takes an explicit `TypePosition`:" followed by one bullet per code). The
roster names eight codes: `generic-arity-mismatch`, `void-in-non-return-position`,
`result-in-schema-position`, `empty-schema-body`, `duplicate-inline-field-name`,
`quoted-inline-field-name`, `renamed-inline-field-name`, and
`binding-case-mismatch`. The file itself constructs three further
`theta/parse/*` diagnostics that appear nowhere in this list as their own
bullet: `malformed-schema-field` (bug 0244's discarded-entry refusal),
`reserved-keyword-as-identifier` (bug 0249), and
`inline-field-name-not-identifier` (bug 0228) — the last of these is not
mentioned anywhere in the header at all.

## Evidence
src/parser/type-grammar.ts:11-21 (the roster's opening, showing its complete
membership boundary — `binding-case-mismatch` at line 81 is the roster's last
bullet before the closing prose at line 96):
```
// The position-sensitive checks need the surrounding annotation context the
// tokeniser does not carry, so the seam takes an explicit `TypePosition`:
//
//   - `theta/parse/generic-arity-mismatch` — a closed-set generic constructor
//     (`array`/`Result`) applied with the wrong type-argument count; position-
//     independent.
//   - `theta/parse/void-in-non-return-position` — `void` in any `Type` position
//     other than a function/theta return type.
//   - `theta/parse/result-in-schema-position` — a `Result<T, E>` application in a
//     lowered-schema position (a schema field type, a `params:` field type, or
//     any type reachable transitively from those, including `array<T>` element
//     types and union arms).
```

src/parser/type-grammar.ts:87-89 — `reserved-keyword-as-identifier` appears
only as a parenthetical exception inside the `binding-case-mismatch` bullet,
never as its own list entry:
```
//     lexer's own `reservedKeywords()` (Disposition A — a reserved-keyword
//     spelling at this slot draws `theta/parse/reserved-keyword-as-identifier`
//     instead, bug 0249). Shares the empty
```

src/parser/type-grammar.ts:1171-1179 — `malformed-schema-field` constructed in
this file, absent from the header entirely:
```
  private discardedEntryRefusal(): Diagnostic {
    return {
      severity: "error",
      code: "theta/parse/malformed-schema-field",
      file: this.site.file,
      range: this.site.range,
      message:
        "malformed schema field; each field is 'name: Type' or 'name as \"WireName\": Type'",
    };
  }
```

src/parser/type-grammar.ts:1588-1593 — `reserved-keyword-as-identifier`'s own
construction site, never given its own header bullet:
```
            out.push({
              severity: "error",
              code: "theta/parse/reserved-keyword-as-identifier",
              file: site.file,
              range: site.range,
              message: `reserved keyword '${name}' cannot be used as an identifier`,
```

src/parser/type-grammar.ts:1730-1736 — `inline-field-name-not-identifier`,
absent from the header entirely:
```
          if (!INLINE_FIELD_IDENT.test(key)) {
            out.push({
              severity: "error",
              code: "theta/parse/inline-field-name-not-identifier",
              file: site.file,
              range: site.range,
              message: `field name '${normaliseLiteralValueLineBreaks(key)}' within one inline object type is not an identifier`,
            });
```

Full emission census: `grep -n 'code: "theta/parse/' src/parser/type-grammar.ts`
returns ten construction sites over nine distinct codes (`malformed-schema-field`
:1174, `void-in-non-return-position` :1500, `generic-arity-mismatch` :1515,
`result-in-schema-position` :1524, `reserved-keyword-as-identifier` :1590,
`binding-case-mismatch` :1602, `duplicate-inline-field-name` :1655,
`quoted-inline-field-name` :1673, `renamed-inline-field-name` :1710,
`inline-field-name-not-identifier` :1733), plus `empty-schema-body` emitted
through the imported `emptySchemaBodyDiagnostic` builder at :922 and :1548.
Ten distinct codes total; the header roster names eight.

## Why this is a problem
The header frames itself as the roster of codes this seam "takes an explicit
`TypePosition`" to compute (an inventory claim, one bullet per code), and the
`TypeCheckRules` doc further down the same file (lines ~185-210) already
enumerates all seven object-arm checks — including
`reserved-keyword-as-identifier` and `inline-field-name-not-identifier` — by
name, so the file has already settled what its own complete membership is at
that second location. The top-of-file header was not updated to match: bug
0244 (landing `malformed-schema-field`, August 2026) and bug 0228 (landing
`inline-field-name-not-identifier`) added emission sites this earliest,
most-visible summary of the module still omits, and bug 0249's
`reserved-keyword-as-identifier` is folded into a neighbour's bullet as an
aside rather than given the same one-bullet-per-code treatment as its seven
siblings. A reader learning what this module can refuse a load for from the
first comment in the file undercounts its diagnostic surface by three codes.

## Suggested direction (non-binding, optional)
Add the three missing codes as their own bullets in the header list (or
reword the header to point at the `TypeCheckRules` doc's now-accurate
enumeration instead of duplicating it); comment-only.

## False-positive check
- Emission census: `grep -n 'code: "theta/parse/' src/parser/type-grammar.ts`
  → ten sites, nine distinct codes (listed above); `grep -n
  'emptySchemaBodyDiagnostic(' src/parser/type-grammar.ts` → two more sites
  for the tenth code (`empty-schema-body`).
- Header membership search: `grep -n '^//   - \`theta/parse/' src/parser/type-grammar.ts`
  (lines 12-94) → exactly eight bullets, matching the eight codes named in
  Observation; `malformed-schema-field` and `inline-field-name-not-identifier`
  do not occur anywhere in lines 1-96; `reserved-keyword-as-identifier`
  occurs once, at line 88, inside the `binding-case-mismatch` bullet's own
  text rather than as a heading of its own.
- Reachability: all three omitted codes are live production emissions.
  `discardedEntryRefusal` is called from `TypeParser.parseObject`'s two
  discard arms (both reached by any malformed inline-object entry);
  `reserved-keyword-as-identifier`'s emission sits in `walkType`'s `object`
  arm, reached under every `rules` value; `inline-field-name-not-identifier`'s
  emission is the last arm of the same per-key loop, also reached under every
  `rules` value. No deadness is claimed here.
- Contrast check: the `TypeCheckRules` doc comment in the same file (around
  lines 185-210) already lists all seven object-arm checks by name, including
  the two entirely-omitted-from-the-header codes — confirming the header's
  omission is a drift between two in-file rosters, not a case where the
  narrower set is deliberately illustrative.
- Prior-fix check: `git log -p -S "malformed-schema-field" -- src/parser/type-grammar.ts`
  shows the code landing in commits from Aug 23-24, 2026 (bug 0244); none of
  those commits, nor any later one, touch the header lines cited here.
- Duplicate check: the two resolved findings against this file
  (`quality/resolved/PTQ-0095-type-grammar-rule-counts-stale.md`,
  `quality/resolved/PTQ-0103-type-grammar-registry-citations-drifted.md`)
  addressed stale rule-*counts* in the `TypeCheckRules` doc and `walkType`'s
  doc comments (now fixed, and verified above to be accurate) and a
  registry-citation mismatch, respectively — neither cites or fixes the
  top-of-file header bullet list at lines 11-94, which is a distinct
  location; `grep -rl "type-grammar.ts:1[1-9]\|type-grammar.ts:[2-9][0-9]\b" quality/intake/`
  shows no other pending candidate citing this range.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently reproduced: the header carries exactly eight `//   - \`theta/parse/` bullets (:12-81) while the file constructs ten distinct codes (nine `code:` sites :1174-1733 plus `emptySchemaBodyDiagnostic` :922/:1548), all three excerpts byte-match, all three omitted emissions are live production paths (`discardedEntryRefusal` has three callers :919/:945/:971, not the filing's "two" — immaterial; the other two sit in `walkType`'s object arm ungated by `rules`), the in-file `TypeCheckRules` doc (:185-200) already names both wholly-omitted codes so this is drift between two rosters not deliberate abbreviation, `git log -p` shows a header bullet for any of the three has never existed (0 hits) though the codes landed 2026-08-22/23 (36128659, 82f9ea05, 53cd0d86) and the one later header touch (264dcbd6) only reworded counts; not a duplicate — resolved PTQ-0095 fixed the "all eight checks" count at :95-96 and the `TypeCheckRules` five-member list, PTQ-0141 fixed the stale "open report" narration at :86-88, and the D9 intake siblings on this file are breakdown filings; none adds roster bullets (triage: claude-fable-5-1)
