---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: type-grammar.ts's rule-count narration ("all eight checks", "the five checks inline-object-shape admits", "all six rules at this arm") undercounts the module's current rule set at nine sites
lens: D2                     # the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending             # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/parser/type-grammar.ts:88-93
  - src/parser/type-grammar.ts:95-96
  - src/parser/type-grammar.ts:191-199
  - src/parser/type-grammar.ts:1360
  - src/parser/type-grammar.ts:1407
  - src/parser/type-grammar.ts:1433
  - src/parser/type-grammar.ts:1471
  - src/parser/type-grammar.ts:1477-1478
  - src/parser/type-grammar.ts:1547
sites: 9
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# type-grammar.ts's rule-count narration ("all eight checks", "the five checks inline-object-shape admits", "all six rules at this arm") undercounts the module's current rule set at nine sites

## Observation
type-grammar.ts's header, the `TypeCheckRules` doc, and `walkType`'s doc
comments carry fixed counts of the module's checks: "all eight checks", a
five-member list of what `"inline-object-shape"` admits (repeated as "one of
the five checks" four times and "the fifth check" once), and "all six rules at
this arm" / "The six rules at the `object` arm". In current code the module
emits eleven distinct `theta/parse/*` codes, `walkType`'s object arm holds
seven rules, and all seven run under `"inline-object-shape"` — the counts
predate the later-landed `theta/parse/inline-field-name-not-identifier`,
`theta/parse/reserved-keyword-as-identifier`, and
`theta/parse/malformed-schema-field` emissions in this file.

## Evidence
src/parser/type-grammar.ts:95-96 — the header's set size:
```
// A caller may select a narrower rule SET than all eight checks
// (`parseTypeExpression`'s `rules` parameter; see `TypeCheckRules` below).
```
Current emission set: eleven distinct codes constructed in this file —
`malformed-schema-field` :1176, `void-in-non-return-position` :1501,
`generic-arity-mismatch` :1516, `result-in-schema-position` :1525,
`empty-schema-body` (`emptySchemaBodyDiagnostic`) :912/:1548,
`reserved-keyword-as-identifier` :1591, `binding-case-mismatch` :1603,
`duplicate-inline-field-name` :1656, `quoted-inline-field-name` :1674,
`renamed-inline-field-name` :1711, `inline-field-name-not-identifier` :1734.

src/parser/type-grammar.ts:191-199 — the `TypeCheckRules` doc lists five
admitted checks:
```
 *   - `"inline-object-shape"` — the checks that run at an inline object
 *     type's own arm independent of position and of the other three
 *     `"all"`-only checks: `theta/parse/empty-schema-body`'s
 *     empty-brace-interior rule, `theta/parse/binding-case-mismatch`'s
 *     lowercase-first identifier rule over the field name (bug 0154),
 *     `theta/parse/duplicate-inline-field-name`'s repeated-name rule,
 *     `theta/parse/quoted-inline-field-name`'s non-identifier-key rule, and
 *     `theta/parse/renamed-inline-field-name`'s (bug 0160) rename-clause
 *     refusal.
```
Counter-evidence: `walkType`'s object arm tests `rules` nowhere (the only
`rules` gates in the function are the `void` arm's :1494 and the `generic`
arm's :1511), so under `"inline-object-shape"` the arm also emits
`reserved-keyword-as-identifier` (:1591) and
`inline-field-name-not-identifier` (:1734) — seven checks, not five. The
"five checks"/"fifth check" phrasing recurs at :1360, :1407, :1433, :1471,
:1547, e.g. :1547:
```
        // `rules`, being one of the five checks `"inline-object-shape"` admits.
```

src/parser/type-grammar.ts:88-93 and :1477-1478 — the object-arm count:
```
//     rule's closing-brace gate, the same gate the two raw-key rules above
//     share: all six rules at this arm answer alike regardless of nesting
```
```
 * three `"all"`-only checks are withheld. The six rules at the `object` arm
 * below judge the SOURCE key at every depth and through every generic
```
Counter-evidence: the object arm holds seven emitting rules —
empty-schema-body :1548, reserved-keyword-as-identifier :1591,
binding-case-mismatch :1603, duplicate-inline-field-name :1656,
quoted-inline-field-name :1674, renamed-inline-field-name :1711,
inline-field-name-not-identifier :1734.

## Why this is a problem
Historical narration with drifted counts: the numbers were correct for an
earlier rule set and were not raised when this file gained the
`inline-field-name-not-identifier` loop arm (bug 0227/0228, :1717-1741), the
`reserved-keyword-as-identifier` emission (bug 0249, :1580-1593), and the
parse-side `malformed-schema-field` refusal (bug 0244, :1168-1180). A reader
sizing `"inline-object-shape"`'s emission set from the `TypeCheckRules` doc —
the documented purpose of the narrower set is precisely to bound what a
position emits — gets five codes where the selection actually admits seven.
The same stale-count decay is already cataloged for other files
(qw20260907130901-d2-03-countable-frame-three-count-stale,
qw20260907130901-d2-05-system-note-four-arm-comment-stale); neither cites
this file.

## Suggested direction (non-binding, optional)
State the sets by membership rather than by count (or recount at the three
places the number is load-bearing), so the next added rule cannot silently
falsify five more comments.

## False-positive check
- Emission inventory: `grep -n 'code: "theta/parse/' src/parser/type-grammar.ts`
  → ten construction sites, plus `emptySchemaBodyDiagnostic` calls at :912 and
  :1548 (imported builder); eleven distinct codes total.
- Rules gating: `grep -n "rules" src/parser/type-grammar.ts` inside `walkType`
  → only :1494 (`rules !== "all"`, void arm) and :1511 (`rules === "all"`,
  generic arm); no `rules` test between the object arm's :1542 and :1745, so
  all seven object-arm rules run under `"inline-object-shape"` — verified
  against the full arm body.
- The counts were checked against every occurrence: `grep -n "eight checks\|six rules\|five checks\|fifth check" src/parser/type-grammar.ts`
  → exactly the nine cited sites (:90, :95, plus the five-member list at
  :191-199 it summarises, :1360, :1407, :1433, :1471, :1477, :1547).
- Deliberate-exclusion check: the `TypeCheckRules` doc's own descent sentence
  (:199-204) and the object-arm comments (:1580-1593) treat
  reserved-keyword-as-identifier and inline-field-name-not-identifier as
  members of the same arm, so the five/six counts are omissions, not a
  documented narrower definition.
- Duplicate check: no already-filed finding cites type-grammar.ts count
  narration; the two prior type-grammar findings
  (qw20260907130901-d2-01-parse-generic-guard-subsumed,
  qw20260907130901-d2-02-typenode-prim-named-unread) concern different code.

## Triage
