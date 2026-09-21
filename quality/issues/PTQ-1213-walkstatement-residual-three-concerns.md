---
id: PTQ-1213
title: walkStatement remains 303 LOC after the annotation-validation extraction, bundling statement recursion, annotation-window orchestration, and an inline schema field-type rule pipeline
lens: D9
status: open
verdict: confirmed
locations:
  - src/parser/theta-document.ts:9124-9426
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/parser/theta-document.ts#walkStatement
d9_band: strong
wave: qw20260921001431
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-21
---

# walkStatement remains 303 LOC after the annotation-validation extraction, bundling statement recursion, annotation-window orchestration, and an inline schema field-type rule pipeline

## Observation
`walkStatement` (src/parser/theta-document.ts:9124-9426, 303 LOC per the wave's
structural map, strong band FN >= 200) is the per-statement arm of the
structural checker pass. It switches over the `Stmt` closed union (declared at
theta-document.ts:980-998). The annotation-validation clone previously tracked
as PTQ-1131 has been extracted (commit bb21dacc; `validateTypeAnnotation` is
now imported from `./annotation-validation`, theta-document.ts:95-97), which
brought the function from 386 to 303 LOC — still over the strong threshold.
Triage of the prior wave's filing (qw20260920202922-d9-06, rejected as
duplicate of PTQ-1131) stated the post-extraction residual "needs a fresh >= 2
concern inventory"; this is that inventory.

## Evidence
Distinct-concern inventory (all ranges re-read this wave):

| concern | members | line ranges | LOC |
|---|---|---|---|
| statement recursion & placement checks over the `Stmt` closed set | `reassign`/`if`/`while`/`for`/`break`/`continue`/`return`/`query`/`tool-call`/`invoke`/`expr`/`enum`/default arms (checkLetBinding, checkBreakStatement, checkContinueStatement, checkFnPlacement, checkBareReturn, checkDiscardedQueryResult, checkEnumDeclaration, walkExpr/walkBlock recursion) | 9132-9139, 9171-9233, 9296-9337, 9408-9426 | ~120 |
| annotation-validation orchestration: propagation/absorption window wiring per capture position | `let`-arm annotation block (validateTypeAnnotation at 9161 with `propagatedToQuery`/`captureAbsorptionWindow` closures), `fn`-arm param loop (9252) and return block (9278) with `fnHeaderWindow` closures, plus the bug 0262/0279 clause commentary | 9140-9170, 9239-9294 | ~87 |
| schema field-type rule pipeline, applied inline per field | `schema` arm: checkObjectSchema (9341), per-field `fieldDiagStart` guard (9357), checkInlineEnumForm (9362), parseTypeExpression, collectUnresolvedNamedTypes (9378), reserved-keyword/unresolved-name emission, guard-1 unspellable refusal via schemaTypeNotExpressionDiagnostic | 9338-9407 | 70 |

Excerpt of the third concern's core (theta-document.ts:9357-9367):

```ts
          const fieldDiagStart = out.length;
          // An inline `enum[...]` in a schema field type is `theta/parse/inline-enum`
          // — `enum` is top-level only (schemas.md §Enum declarations).
          pushDiag(
            out,
            checkInlineEnumForm(f.typeSource, { file, range: s.range }),
          );
          out.push(
            ...parseTypeExpression(f.typeSource, "schema-feeding", {
              file,
              range: s.range,
            }),
          );
```

Importer counts (structural map): `walkStatement` is module-private (0 src / 0
tests importers); the host file's public parse entry `parseThetaDocument` has
2 src / 74 tests importers.

## Why this is a problem
Strong band: presumption of breakdown; a strong concrete reason is required to
keep whole. Reasons considered and defeated:
- Closed-enumeration dispatch: `Stmt` is a spec-mirrored closed set
  (theta-document.ts:980-998; grammar.md statement productions), but the reason
  requires each arm to be short — the longest arm (`schema`, 9338-9407) is 70
  LOC of inline rule pipeline, and the `fn` arm is 62 LOC. Defeated.
- Single algorithm with shared local state: the arms share only the five
  parameters (`s`, `scope`, `refs`, `file`, `out`) and each arm returns
  independently; no local crosses arms. Fewer than 6 threaded locals. Defeated.
- Data-only / generated / one-grammar-production: it is a hand-written checker
  pass (bug-citation comments throughout), not a recognizer or a table. Defeated.
- Strong reasons: no spec-cited single critical section (each arm enforces its
  own statement's rules; no ordered cross-arm sequence), no measured cost, no
  reverted split — the opposite: the validateTypeAnnotation extraction (commit
  bb21dacc) landed on this exact function without incident. No entry in
  quality/exemptions.json for this host.

## Suggested direction (non-binding, optional)
Seam A (hypothesis, unproven): the schema-arm field pipeline (9338-9407) -> a
`checkSchemaFieldTypes` helper beside `checkSchemaDeclarationGraph` — 70 LOC,
no exported symbols move, 0 external importers, cross-references back into the
host: `refs.typeNames`, `pushDiag`. Seam B (hypothesis, unproven): the fn-arm
param/return annotation orchestration (9239-9294) -> a `validateFnAnnotations`
helper next to `validateTypeAnnotation` (annotation-validation.ts) — ~56 LOC,
nothing exported, cross-references: `propagatedToQuery`, `fnHeaderWindow`,
`refs`. Note for D4 routing: the schema-arm pipeline sequence (inline-enum,
parseTypeExpression, collectUnresolvedNamedTypes, guard-1 refusal) parallels
the alias-arm sequence inside checkSchemaDeclarationGraph (8809-8872); the seam
stands regardless of whether that parallel is deduplicated.

## False-positive check
Band: map-quoted 303 LOC, strong (FN_BANDS.strong = 200); not recounted by
hand. Reasons-considered list above with defeating evidence per reason.
Exemptions check: quality/exemptions.json has no D9 entry for
src/parser/theta-document.ts or any #host in it. Generated-code check: file is
hand-maintained (bug-numbered rationale comments, no generator header).
Spec-mirror check: the Stmt-union dispatch is spec-mirrored but fails the
short-arm requirement (70-LOC longest arm, stated above). Duplicate check: the
prior walkStatement filing (qw20260920202922-d9-06) was rejected solely as a
duplicate of PTQ-1131 (annotation clone), whose fix has landed (commit
bb21dacc); this filing's inventory is the post-extraction residual triage
explicitly said would need a fresh filing. The file-level finding
(qw20260920202922-d9-01-theta-document-file-twelve-concerns) is a different
host key (the file, not this function).

## Triage
verdict: questionable — accounting verified: size-scan map re-run gives walkStatement 9124-9426 / 303 LOC / band strong (file 10272 LOC strong; no D9 key for the host in quality/exemptions.json); excerpt byte-exact at 9357-9367 and every inventory range lands on the arm boundaries read directly (let annotation block 9140-9170 with propagatedToQuery/captureAbsorptionWindow closures, fn param/return blocks 9239-9294 with fnHeaderWindow, schema arm 9338-9407 carrying its own fieldDiagStart/fieldReservedKeywords/fieldUnspellable/fieldUnresolved locals that no other arm touches, recursion/placement arms at 9171-9233/9296-9337/9408-9426), so the three rows are real distinct concerns sharing only the five parameters; Stmt is a closed union (980-998) but closed-enumeration is a concrete not strong reason and the longest arm is 70 LOC against kept-whole precedents of 10-54 LOC (REVIEW_LOG 2026-09-13/17), no ≥ 6 shared locals (none declared at function scope), hand-authored, git -S shows no prior split/revert of walkStatement; validateTypeAnnotation is imported from ./annotation-validation (95-97) and PTQ-1131 sits in quality/resolved/, so the prior d9-06 duplicate ground is gone and this is the residual inventory that rejection asked for; file-level qw20260920202922-d9-01 keys the file and sibling d9-02/d9-07 key checkSchemaDeclarationGraph/walkExpr — distinct root causes; seam shape (A/B, and the D4 schema-vs-alias parallel it defers) is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-21): accepted as confirmed - batch ruling, all D4/D9 intake items accepted.
