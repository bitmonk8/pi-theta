---
id: pending
title: Two doc sites in type-grammar.ts state that a keyword-shaped inline field name "stays with the reserved-keyword class's own open report", while the same function emits theta/parse/reserved-keyword-as-identifier for exactly that spelling and the cited report is closed
lens: D2
status: intake
verdict: pending
locations:
  - src/parser/type-grammar.ts:86-88
  - src/parser/type-grammar.ts:1369-1372
  - src/parser/type-grammar.ts:1573-1581
  - src/parser/type-grammar.ts:1589-1596
sites: 2
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# Two doc sites in type-grammar.ts state that a keyword-shaped inline field name "stays with the reserved-keyword class's own open report", while the same function emits theta/parse/reserved-keyword-as-identifier for exactly that spelling and the cited report is closed

## Observation
The module header's `theta/parse/binding-case-mismatch` bullet and
`walkType`'s doc bullet for the same rule both say that a reserved-keyword
spelling at the inline field-name slot is excluded from the case rule and
"stays with its own open report" / "stays with the reserved-keyword class's
own open report, not this one". In current code `walkType`'s `object` arm
handles that spelling in place: the `RESERVED_KEYWORDS` branch pushes
`theta/parse/reserved-keyword-as-identifier` at the same site before
`continue`-ing past the case test. The report the two doc sites defer to,
docs/bugs/0249, records `**Status:** fixed (0.240.0)`, and the inline comment
beside the emission cites that same bug as the reason the code is there.

## Evidence
src/parser/type-grammar.ts:86-88 — module header,
`theta/parse/binding-case-mismatch` bullet:
```
//     body's own field name. Excludes a spelling that is a member of the
//     lexer's own `reservedKeywords()` (Disposition A — the reserved-keyword
//     class at this slot stays with its own open report). Shares the empty
```

src/parser/type-grammar.ts:1369-1372 — `walkType`'s doc, same rule:
```
 *     character is neither `_` nor a lowercase letter, excluding a spelling
 *     that is a member of the lexer's own `reservedKeywords()` (Disposition A:
 *     a keyword-shaped inline field name stays with the reserved-keyword
 *     class's own open report, not this one). `fieldNames` is NOT the same key
```

src/parser/type-grammar.ts:1573-1581 — the arm those two bullets describe; the
branch on the same `reservedKeywords()` membership, and the comment stating
that the class draws its refusal here:
```
      if (node.closingBraceSpelled) {
        for (const name of node.fieldNames) {
          if (RESERVED_KEYWORDS.has(name)) {
            // The exclusion above (Disposition A, docs/bugs/0154) keeps this
            // pass from drawing `binding-case-mismatch` on `Ok` / `Err` /
            // `Result` — but a reserved spelling still occupies an identifier
            // position (lexical.md:20), so it draws the reserved-keyword
            // refusal instead of falling through with none at all
            // (docs/bugs/0249). Ranged on `site.range`, the same
```

src/parser/type-grammar.ts:1589-1596 — the emission itself, in that branch:
```
            out.push({
              severity: "error",
              code: "theta/parse/reserved-keyword-as-identifier",
              file: site.file,
              range: site.range,
              message: `reserved keyword '${name}' cannot be used as an identifier`,
            });
            continue;
```

docs/bugs/0249-reserved-keyword-keys-no-parser-leaf-backstop.md:3 — the status
of the report the two bullets defer to:
```
- **Status:** fixed (0.240.0).
```
The same report's §Sev/Diff paragraph names this file as one of the two
landing leaves: "`TypeParser`'s identifier pass over `TypeNode.fieldNames`
(`src/parser/type-grammar.ts:1232`)".

## Why this is a problem
Historical narration: both bullets describe a deferral the code no longer
performs. "Stays with its own open report" asserts two things current code and
the repository contradict — that no diagnostic is drawn at this slot for a
keyword-shaped name (the arm draws
`theta/parse/reserved-keyword-as-identifier` about 1500 lines below the header
bullet and about 220 lines below the `walkType` bullet), and that the report
holding that class is open (docs/bugs/0249 is `fixed (0.240.0)`). A reader
sizing what the inline field-name slot emits from either bullet concludes that
a `{ let: string }` interior is silent on the keyword axis — the state bug
0249 was filed against.

## Suggested direction (non-binding, optional)
Say what the exclusion routes the spelling to now, rather than which report it
was once deferred to.

## False-positive check
- Emission check: `grep -n "reserved-keyword-as-identifier"
  src/parser/type-grammar.ts` → one hit, :1591, inside the
  `RESERVED_KEYWORDS.has(name)` branch of `walkType`'s `object` arm. The whole
  branch (:1573-1597) was read to confirm the push is unconditional on
  `rules`, `position` and `isRoot` once `node.closingBraceSpelled` holds
  (:1573).
- Deferral-claim enumeration: `grep -n "open report"
  src/parser/type-grammar.ts` → exactly two hits, :88 and :1372, both cited
  above. `grep -n "open subject" src/parser/type-grammar.ts` → one further hit
  at :290, about a field name's SPAN and deferred to bug 0154; that is a
  different claim about a different subject and is not filed here.
- Report-status check: `grep -n "Status" docs/bugs/0249-*.md` → `**Status:**
  fixed (0.240.0)`. The report's §Sev/Diff paragraph names
  `src/parser/type-grammar.ts` as one of the two leaves the fix lands at.
- Deliberate-narrowing check: both bullets were read in full to confirm
  neither carries a companion sentence saying the class is nonetheless refused
  here; both stop at the deferral. The only place the landing is stated is the
  inline comment at :1576-1588, which neither the header nor the `walkType`
  doc references.
- Duplicate check against already-filed candidates:
  qw20260907183353-d2-03-type-grammar-rule-counts-stale files the drifted rule
  COUNTS in this file and mentions `reserved-keyword-as-identifier` only as
  counter-evidence for the arithmetic; it cites neither :86-88 nor :1369-1372
  and does not file the deferral claim.
  qw20260907183353-d2-01-type-seam-stub-narration-stale cites :98-101 of this
  file only.
- No deadness is claimed here, so no reference-search inventory applies; the
  finding is a narration/code mismatch verified by reading both narration
  sites and the emitting branch.

## Triage
