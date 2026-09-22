---
id: pending
title: runWholeDocumentChecks in theta-document.ts spans 204 LOC across eight independent check phases
lens: D9
status: intake
verdict: pending
locations:
  - src/parser/theta-document.ts:332-535
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/parser/theta-document.ts#runWholeDocumentChecks
d9_band: strong
wave: qw20260922150013
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-22
---

# runWholeDocumentChecks in theta-document.ts spans 204 LOC across eight independent check phases

## Observation
runWholeDocumentChecks (src/parser/theta-document.ts:332-535, 204 LOC, strong band, threshold 200) is the private battery that PTQ-1166's fix extracted from parseThetaDocument. It takes nine parameters and returns eight diagnostic arrays, one per check family. Each phase is a short call to an already-extracted checker preceded by a large spec-anchor comment; only the identifier-roots phase computes anything inline.

## Evidence
Step inventory (phases named by their own comments; locals each phase reads/writes):

| phase | lines | LOC | reads | writes |
|---|---|---|---|---|
| structural AST checks (C2a) | 343-366 | 24 | statements, resolvedTail, bodyTypes, queryPropagations, priorDiagnostics | structuralDiags |
| identifier-root seeds + unknown-identifier walk (REQ-EXPR-7) | 368-406 | 39 | statements, resolvedTail, bodyTypes, frontmatter | identRoots, nonDeclarationRoots, typeOnlyNames, unknownIdentDiags |
| params-default name resolution (grammar.md NamedValueLit) | 408-421 | 14 | paramFields, statements, identRoots, frontmatterRefusedRanges | paramsDefaultNameDiags |
| lexical call-site walk (bugs 0003/0016) | 423-439 | 17 | statements, resolvedTail, frontmatter | callSiteLexicalDiags |
| type-layer checks (V20c) + runtime-tool success types (RFC 0011 C6) | 441-486 | 46 | statements, resolvedTail, frontmatter | runtimeToolSuccessTypes, typeLayerDiags |
| .thetalib top-level form check (imports.md) | 488-496 | 9 | statements, resolvedTail, file | thetalibTopLevelDiags |
| .thetalib call-with-clause check (RFC 0009 INV-8) | 498-507 | 10 | statements, resolvedTail, file | thetalibCallWithClauseDiags |
| statement-placement walk (bugs 0446/0447) + return tuple | 509-535 | 27 | statements, resolvedTail, file | statementPlacementDiags, return value |

The only inter-phase data flow beyond the shared parameters is identRoots (phase 2 -> phase 3). Every phase's diagnostics array is returned untouched in a fixed-order tuple (525-534) that parseThetaDocument feeds to assembleDiagnostics (307-314), which orders diagnostics itself.

## Why this is a problem
Strong band: presumption of breakdown; a strong concrete reason is required. Reasons considered and defeated: (1) single algorithm with shared local state — the phases share only the function's own parameters plus one local (identRoots) crossing one phase boundary, below the 6-local bar; (2) closed-enumeration dispatch — the eight checks are the implemented check roster, not a spec-named closed set (no spec table enumerates "the eight whole-document checks"); (3) spec-cited critical section — assembleDiagnostics performs the ordering, so no observable step interleaving depends on this body staying whole; (4) measured cost / reverted split — none cited; (5) exemptions — no D9 key for this host in quality/exemptions.json. Note the mechanical LOC is comment-dominated (each phase carries a 10-40-line spec-anchor comment; executable code is roughly 70 LOC), which the band does not discount.

## Suggested direction (non-binding, optional)
Hypotheses, unproven. Seam A: identifier-root seeds + typeOnlyNames subtraction (368-395) -> a small helper (e.g. identifierRootSeeds(statements, frontmatter, bodyTypes)) — ~28 LOC, 0 exported symbols, 1 cross-reference back. Seam B: relocate each phase's spec-anchor comment onto the called checker's own doc block (checkStructural, checkUnknownIdentifiers, checkLexicalCallSites, checkTypeLayer already exist as named functions), shrinking the battery to its dispatch. None identified beyond these.

## False-positive check
Band check: 204 >= 200 per the authoritative map (lines 332-535). Reasons-considered list above with defeating evidence. Exemptions check: quality/exemptions.json has no key for src/parser/theta-document.ts#runWholeDocumentChecks. Generated-code check: hand-authored, bug citations throughout. Spec-mirror check: each phase cites a different spec/bug anchor (C2a, REQ-EXPR-7, NamedValueLit, bugs 0003/0016, V20c, imports.md, RFC 0009, bugs 0446/0447) — a roster, not one spec enumeration. Prior-filing check: PTQ-1166 (fixed) covered parseThetaDocument's nine phases; this function is the extraction that fix created and is not named by any open filing (grep for runWholeDocumentChecks across quality/ found only PTQ-1156/1166 resolved texts).

## Triage
verdict: questionable — accounting verified: size-scan map (mktemp manifest) reproduces runWholeDocumentChecks 332-535 / 204 LOC / band strong (FN strong=200), importers 0/0, no theta-document key in quality/exemptions.json; the eight rows are real distinct delegated checks each writing its own const (checkStructural 350-366, collectIdentRoots×2 + typeOnlyNames subtraction + checkUnknownIdentifiers 384-406, checkParamsDefaultNames 415-421, checkLexicalCallSites 434-439, buildRuntimeToolSuccessTypes + checkTypeLayer 478-486, checkThetaLibTopLevel 493-496, checkThetaLibCallWithClauses 504-507, checkStatementPlacement 525) with identRoots the only local crossing a phase boundary (phase 2 → checkParamsDefaultNames), so the ≥ 6-shared-locals reason does not apply; the ordering claim holds — assembleDiagnostics (diagnostic.ts:121-143) flat-maps then stable-sorts by (file,line,col), and the return tuple order survives any intra-body extraction, so no spec-cited critical section; no generated code, no measured cost/reverted split, and the phases cite eight unrelated anchors rather than one spec table; the filing's own disclosure that executable code is ~70 LOC with the rest spec-anchor comments is accurate and is what a human must weigh (Seam B alone would drop the host under the band); not a duplicate — sibling d9-01 uses the file-level host key and PTQ-1166 (fixed) is the parent whose extraction created this function — target shape needs a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified independently: size-scan map (mktemp one-line manifest) gives runWholeDocumentChecks 332-535 / 204 LOC / band strong (FN strong=200), importers 0/0, no theta-document key in quality/exemptions.json; all eight inventory rows resolve at the cited ranges as distinct delegated checks each writing its own const (checkStructural 350-366, collectIdentRoots×2 + typeOnlyNames subtraction + checkUnknownIdentifiers 384-406, checkParamsDefaultNames 415-421, checkLexicalCallSites 434-439, buildRuntimeToolSuccessTypes + checkTypeLayer 478-486, checkThetaLibTopLevel 493-496, checkThetaLibCallWithClauses 504-507, checkStatementPlacement 525, tuple 527-534) with identRoots the only local crossing a phase boundary (below the ≥ 6-shared-locals bar); ordering argument holds — assembleDiagnostics (src/diagnostics/diagnostic.ts:121-143) flat-maps then stable-sorts by (file,line,col), so the tuple order is not a spec-cited critical section; phases cite eight unrelated anchors (no single spec table), hand-authored, no measured cost or reverted split; comment-dominance claim accurate (77 non-comment/non-blank lines of 204), which a human must weigh since a comment relocation alone drops the host under the band; not a duplicate — sibling d9-01 keys the file-level host and PTQ-1166 (fixed) is the parent extraction — target shape needs a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified at HEAD: size-scan map (mktemp one-line manifest) reports `332-535 | 204 | function | runWholeDocumentChecks | no | 0/0` under FN band strong (200), `grep theta-document quality/exemptions.json` exits 1 (no D9 key); all eight inventory rows are real distinct delegated checks each writing its own const at the cited lines (checkStructural 350-366, collectIdentRoots×2 + typeOnlyNames subtraction + checkUnknownIdentifiers 384-406, checkParamsDefaultNames 415-421, checkLexicalCallSites 434-439, buildRuntimeToolSuccessTypes + checkTypeLayer 478-486, checkThetaLibTopLevel 493-496, checkThetaLibCallWithClauses 504-507, checkStatementPlacement 525, tuple 527-534), body mutates nothing and identRoots is the sole local crossing a phase boundary (384→418), so the ≥ 6-shared-locals reason is inapplicable; ordering claim holds — assembleDiagnostics (src/diagnostics/diagnostic.ts:121-143) flatMaps then stable-sorts by (file,line,col) so no spec-cited critical section pins the body whole; anchors are eight unrelated spec/bug clauses (no closed spec table), hand-authored, no measured cost or reverted split; comment-dominance verified (77 non-blank non-`//` lines of 204), which a human must weigh since Seam B alone drops the host under the band; dedupe clean — `grep -rl runWholeDocumentChecks quality/` hits only resolved PTQ-1156/1166 (file-level and parent parseThetaDocument hosts, both fixed), REVIEW_LOG, tmp notes, and sibling d9-01 which keys the file-level host and lists this function only as a member of its orchestration row; D9 breakdown never confirms — Seam A vs B is a design decision for a human ruling (triage: claude-fable-5-1)
