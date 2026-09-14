---
id: PTQ-0103
title: TypeParser.parseObject's two code-registry-parse.md line citations (:104 "count law", :101 "count-consequence sentence") point at the duplicate-field and empty-schema rows instead of the malformed-schema-field row that states both laws
lens: D2                     # the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/parser/type-grammar.ts:939-943
  - src/parser/type-grammar.ts:979-981
sites: 2
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# TypeParser.parseObject's two code-registry-parse.md line citations (:104 "count law", :101 "count-consequence sentence") point at the duplicate-field and empty-schema rows instead of the malformed-schema-field row that states both laws

## Observation
Two comments in `TypeParser.parseObject`'s field loop anchor emission-count
decisions to specific lines of
docs/spec_topics/diagnostics/code-registry-parse.md. Both cited lines now hold
different registry rows: the adjacency-collapse "count law" cited at :104 and
the malformed-entry "count-consequence sentence" cited at :101 are both stated
in the `theta/parse/malformed-schema-field` row, which sits at line 102. The
quoted phrase "that field" appears in neither cited row.

## Evidence
src/parser/type-grammar.ts:939-943 — the SL5 adjacency-collapse comment:
```
            // Bug 0257 SL5 — adjacency collapse: the entry immediately behind
            // an empty slot is itself keyless, so ITS refusal replaces the
            // slot's buffered line rather than adding a second
            // (code-registry-parse.md:104's count law; §Reproduction (c)
            // c1–c3 stay at one line).
```
code-registry-parse.md:104 is the `theta/parse/duplicate-inline-field-name`
row. The replacement law lives in the `theta/parse/malformed-schema-field` row
at code-registry-parse.md:102: "An entry standing IMMEDIATELY behind such a
slot that itself qualifies for this row's own keyless-entry refusal draws that
refusal ALONE: its line REPLACES the slot's rather than joining it, so
`{a: integer,,void}` and `{,void}` still draw exactly one line each".

src/parser/type-grammar.ts:979-981 — the colon-gate resync comment:
```
          // A malformed entry accounts for itself and for nothing else
          // (code-registry-parse.md:101's count-consequence sentence, scoped to
          // "that field"): resynchronise at this interior's next depth-0 `,`
```
code-registry-parse.md:101 is the `theta/parse/empty-schema-body` row. The
per-entry count consequence for malformed entries ("the loop refuses each
KEYLESS entry its entry walk reaches ... with one diagnostic per such entry")
is in the `theta/parse/malformed-schema-field` row at code-registry-parse.md:102.
`grep -n "that field" docs/spec_topics/diagnostics/code-registry-parse.md`
hits lines 52, 56, 60, 107, 126 — other rows entirely; neither :101 nor :102
contains the quoted phrase.

## Why this is a problem
Historical narration, mechanically falsified: both comments justify an
emission-count decision (replace-not-join; refuse-per-entry-then-resync) by
citing the registry line that ratifies it, and both citations now land on
neighbouring rows about different diagnostics — a reader auditing the count
behaviour against :104 finds the duplicate-key row's one-line-per-repeat rule,
not the slot-replacement law. Registry row insertions above line 104 (the
`theta/parse/schema-body-unclosed` row at :103 is documented in-row as a later
"code addition") shifted the targets while the comments kept the old numbers.
This is the same per-module decay this wave cataloged as
qw20260907183353-d2-08-import-separator-check-citations-drifted and
qw20260907183353-d2-09-params-registry-line-citations-drifted; neither cites
type-grammar.ts.

## Suggested direction (non-binding, optional)
Cite the rows by code name (`theta/parse/malformed-schema-field`'s
replacement/count sentences) rather than by registry line number, matching how
the rest of this file's comments name registry rows.

## False-positive check
- Row positions re-verified by sed: code-registry-parse.md:99
  redundant-wire-name, :100 wire-name-collision, :101 empty-schema-body, :102
  malformed-schema-field, :103 schema-body-unclosed, :104
  duplicate-inline-field-name, :105 quoted-inline-field-name, :106
  renamed-inline-field-name, :107 inline-field-name-not-identifier.
- Quoted-phrase search: "that field" absent from rows :101-:104 (hits only at
  :52, :56, :60, :107, :126), so the quotation cannot be satisfied by either
  cited line.
- The file's other eleven line-numbered citations were checked and are
  accurate, so they are not claimed: schemas.md:17 (field names are
  identifiers), schemas.md:23 (rename clause position), schemas.md:93 (no
  inline enum form), grammar.md:99-:100 (GenericType production), grammar.md:107
  ("No other identifier is parameterisable"), grammar.md:101 (ObjectType
  production), lexical.md:13 (Ident production), lexical.md:20 (reserved
  keywords) — each verified by sed against the named text.
- Duplicate check: no filed citation-drift finding lists any type-grammar.ts
  location; the two prior type-grammar findings concern the subsumed generic
  guard and the prim/named payloads, not comments.

## Triage
verdict: confirmed — both citations reproduce as drifted (:104 is now duplicate-inline-field-name, :101 now empty-schema-body, "that field" only at 52/56/60/107/126, all eleven other citations in the file accurate), though git (fe3c53cf, a6816b96) shows each was authored against the inline-field-name-not-identifier row now at :107 carrying bug 0129's count-consequence law, not the :102 row this report names as the target (triage: claude-opus-5)
