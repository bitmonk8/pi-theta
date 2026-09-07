---
id: pending
title: Three params.ts comments pin diagnostic-registry rows at code-registry-parse.md:59/:60/:112 and code-registry-load.md:19, where different rows now sit
lens: D2
status: intake
verdict: pending
locations:
  - src/parser/params.ts:219-220
  - src/parser/params.ts:405-407
  - src/parser/params.ts:818-821
sites: 3
fix_scope: localized
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# Three params.ts comments pin diagnostic-registry rows at code-registry-parse.md:59/:60/:112 and code-registry-load.md:19, where different rows now sit

## Observation
Three comments in params.ts justify emission order and code choice by pointing at specific diagnostic-registry lines: the lowered-schema-position rows at "code-registry-parse.md:59, :60", the row a bare unresolved identifier draws at "code-registry-parse.md:112", and the "third precedence rule" at "code-registry-load.md:19". At the current HEAD those lines hold other rows (`tool-arg-not-object-literal`/`tool-arg-schema-conflict`, `empty-enum-body`, and `params-null` respectively); the cited rows sit at :69/:70, :115, and :20.

## Evidence
src/parser/params.ts:219-220:
```
    // A `params:` field type is a lowered-schema position
    // (code-registry-parse.md:59, :60), wired here as the schema-body field
```
Actual rows: `sed -n '59,60p;69,70p' docs/spec_topics/diagnostics/code-registry-parse.md` — :59 is `theta/parse/tool-arg-not-object-literal`, :60 is `theta/parse/tool-arg-schema-conflict`; the lowered-schema-position rows `theta/parse/void-in-non-return-position` and `theta/parse/result-in-schema-position` are at :69 and :70.

src/parser/params.ts:818-821:
```
      // constructor name at any arity, applied or not. `NamedType ::= Ident`
      // (grammar.md:98) is the only production such a head could otherwise
      // read as, so the refusal converges on the row the BARE spelling of the
      // same identifier already draws (code-registry-parse.md:112), and the
```
Actual row: `grep -n "| \`theta/parse/unresolved-named-type\`" docs/spec_topics/diagnostics/code-registry-parse.md` → :115; :112 is the `theta/parse/empty-enum-body` row. (The `grammar.md:98` pin beside it is correct at HEAD.)

src/parser/params.ts:405-407:
```
    // return in literal-sublanguage.ts). This sits BEHIND the bug-0059 guard
    // above, so a field whose type half was already refused still draws exactly
    // one diagnostic (code-registry-load.md:19's third precedence rule), and it
```
Actual row: the "Three precedence rules keep the two stages to one diagnostic per field" sentence lives in the `theta/load/params-type-not-expression` row at code-registry-load.md:20; :19 is the `theta/load/params-null` row.

## Why this is a problem
Historical narration whose anchors have drifted: each comment's justification dereferences to an unrelated registry row (a Pi-tool argument rule, an empty-enum rule, a `params: null` rule), so a reader following the pin lands on content that does not support — and appears to contradict — the claim being justified. The neighbouring section-name and code-name anchors in the same comments still resolve, which shows only the raw line pins decayed while the registry grew rows above them.

## Suggested direction (non-binding, optional)
Re-point the three pins at the rows' current lines (:69/:70, :115, :20) or cite the rows by their code names alone, which the registry already makes unique and which do not drift when rows are inserted.

## False-positive check
- Read the cited registry lines at HEAD: code-registry-parse.md:59-60 (tool-arg rows), :69-70 (void/result rows), :112 (empty-enum-body), :115 (unresolved-named-type); code-registry-load.md:19 (params-null), :20 (params-type-not-expression, containing the three-precedence-rules sentence).
- Verified the surrounding non-line anchors are correct so the drift is confined to the numeric pins: grammar.md:98 (`NamedType ::= Ident`), :107 ("No other identifier is parameterisable"), lexical.md:26 (string literals), frontmatter-fields-a.md:60 (`field: type = literal`), schema-subset.md:73/:76/:79/:80/:81/:108 all checked and correct at HEAD.
- Checked the already-filed set: this wave's citation-drift findings cover src/binder/binder-system-prompt.ts and src/extension/production-composition.ts; no filed candidate cites params.ts's registry pins.
- One root cause (registry/row renumbering not tracked by params.ts's numeric pins); the imports.ts pin drift in the same wave is filed separately because it decays against different documents from a different comment.

## Triage
