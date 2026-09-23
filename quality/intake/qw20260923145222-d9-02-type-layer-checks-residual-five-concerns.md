---
id: pending
title: type-layer-checks.ts post-split residual (857 LOC, zone) bundles five concern families, two consumed only by sibling modules
lens: D9
status: intake
verdict: pending
locations:
  - src/parser/type-layer-checks.ts:1-857
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/parser/type-layer-checks.ts
d9_band: zone
wave: qw20260923145222
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-23
---

# type-layer-checks.ts post-split residual (857 LOC, zone) bundles five concern families, two consumed only by sibling modules

## Observation
src/parser/type-layer-checks.ts is 857 LOC, band zone per the authoritative
map. Its header names it "type-layer diagnostics production wiring" — it
"prepares the type environment and wires `TypeLayerWalk` in
`./type-layer-walk`". PTQ-1158 (resolved) broke the former 4123-LOC file down;
the TypeLayerWalk class, annotation parsing, and local-binder walk now live in
sibling modules re-exported here (lines 71-90). The residual holds five
concern families, and two of them (the operand/receiver classifier substrate
and the generic AST child enumerators) have zero consumers among this file's
own wiring functions — they exist only to feed sibling modules through the
export block at 843-856.

## Evidence
Distinct-concern inventory (ranges from the authoritative map, each re-read
this session):

| concern | members | line ranges | LOC |
|---|---|---|---|
| operand/receiver classification + stdlib member/signature adapters | PRIMITIVE_NAMES, ORDERING_OPS, ARITHMETIC_OPS, NO_SUNK_ARRAYS, FN_PARAM_NAME_IS_IDENT, fnParamNamesAreIdentifiers, OperandCategory, classifyOperand, BuiltinReceiver, classifyReceiver, builtinMembers, EMPTY_MEMBERS, stdlibSignatureFor | 91-255 | ~120 |
| walk construction and check entries | WalkCtx, ParamsFieldSource, paramsFieldsFromFrontmatter, buildTypeLayerWalk, checkTypeLayer, inferCalleeReturnPayload | 261-439 | ~97 |
| type-env / declaration collection | collectTypeEnv, collectEnumNames, placeholderSiteRange, collectFnReturnAnnotations, collectImportedSymbols, collectSchemaFields | 507-633, 740-754 | ~98 |
| alias-cycle graph analysis (DFS back-edge marking) | aliasCycleParticipants, aliasReferences | 655-721 | ~65 |
| generic AST child enumeration | childExprs, stmtExprs, stmtBlocks | 761-841 | ~77 |

Counted affinity for row 1: its six behavioural symbols are imported solely by
./type-layer-operand-checks.ts (src/parser/type-layer-operand-checks.ts:15-22
imports ARITHMETIC_OPS, ORDERING_OPS, builtinMembers, classifyOperand,
classifyReceiver, stdlibSignatureFor — 6 members of this host touched), while
0 of this file's own functions call any of them (grep in-file: only
self-recursion at 169/207 and the export block at 843-856). Row 5 likewise:
childExprs/stmtExprs/stmtBlocks are imported by ./type-layer-walk.ts:59-63,
../parser/theta-document.ts:52 (used at 914 and 1690), and
./type-layer-interpolation.ts:24 — 0 in-file callers outside aliasReferences'
own switch (which walks CompatType, not Expr, so it does not use them).
Export block excerpt (src/parser/type-layer-checks.ts:843-856):

```ts
export {
  ARITHMETIC_OPS,
  NO_SUNK_ARRAYS,
  ORDERING_OPS,
  PRIMITIVE_NAMES,
  builtinMembers,
  childExprs,
  classifyOperand,
  classifyReceiver,
  placeholderSiteRange,
  stdlibSignatureFor,
  stmtBlocks,
  stmtExprs,
  type WalkCtx,
};
```

## Why this is a problem
Zone band: no presumption; the finding rests on the ≥ 2-concern inventory
above — five families, of which two (rows 1 and 5, ~197 LOC combined) are
substrate for other modules with zero in-file consumers: the operand-check
split-out (type-layer-operand-checks.ts header: "Split out of
`TypeLayerWalk`") left its classifier inputs behind in this file, and the
generic Expr/Stmt child enumerators serve three sibling walkers, none of them
this file's wiring. The header's own role statement ("prepares the type
environment and wires TypeLayerWalk") covers only rows 2-4. Reasons
considered: single algorithm with shared state — defeated: the families share
no locals (the only cross-row link is PRIMITIVE_NAMES, read nowhere else
in-file); data-only — defeated: literal tables are ~15 LOC of 857; closed
enumeration — function-level, inapplicable; generated code — hand-authored
(bug 0033/0131/0225 rationale inline); exemptions — no key for this host.

## Suggested direction (non-binding, optional)
Hypotheses, unproven; the human ratifies. Seam A: operand/receiver classifier
substrate (91-255) -> src/parser/type-layer-operand-checks.ts (its sole
consumer) or a shared operand-classification module (hypothesis) — ~120 LOC,
exported symbols moved: classifyOperand, classifyReceiver, builtinMembers,
stdlibSignatureFor, ORDERING_OPS, ARITHMETIC_OPS (importers: 1 src file), 0
cross-references back. Seam B: childExprs/stmtExprs/stmtBlocks (761-841) ->
src/parser/ast-children.ts (hypothesis) — ~77 LOC, exported symbols moved:
childExprs (3 src importers), stmtExprs, stmtBlocks (1 src importer each), 0
cross-references back. Seam A + B leaves a ~660-LOC wiring/env module matching
the header's stated role.

## False-positive check
Band check: 600 <= 857 < 1000, zone per the authoritative map — filed on the
five-row inventory, not a presumption. Exemptions check: quality/
exemptions.json read — no key for src/parser/type-layer-checks.ts. Generated-
code check: hand-written, bug citations throughout. Spec-mirror check: the
header cites five spec areas as narrative, no closed enumeration. Prior-filing
check: PTQ-1158 is in quality/resolved/ (its inventory was the pre-split
4123-LOC file; its seams A/B/C all landed — annotation-compat.ts,
local-binders.ts, type-layer-walk.ts are imported/re-exported at 82-90 — and
the residual at 857 is a 79% shrink, well past the 25% re-file bar even had it
been an exemption, which it is not); no open filing keys this host (grep of
quality/issues and this wave's intake). Not a husk: the re-export lines
(71-90, 843-856, ~35 LOC) sit beside ~780 LOC of live payload with live
callers (collectTypeEnv imported by invoke-imported-checks.ts:48 and
invoke-static-checks.ts:118). Affinity counted both ways for rows 1 and 5
above (6 and 3 foreign-consumer members, 0 own-module callers); the map's
0/0 importer figures for childExprs/classifyOperand undercount because the
symbols leave through the late export block — grep counts quoted instead.

## Triage
verdict: questionable — accounting verified with one corrected count: `size-scan map` on a one-line manifest reproduces 857 LOC / band zone (FILE_BANDS zone=600), every inventory member sits at the cited map lines (classifiers 91-255, walk wiring 261-439, collectors 507-633/740-754, alias-cycle 655-721, child enumerators 761-841, late export block 843-856) and the load-bearing claim reproduces — rows 1 and 5 have ZERO in-file callers (in-file grep hits only the declarations, self-recursion at 169/207/829, doc comments, and the export block) while rows 2-4 never read them, so ≥ 2 distinct concerns stand even if rows 2-4 are read as one env-building algorithm (buildTypeLayerWalk → collect* → aliasCycleParticipants is a caller chain); no `type-layer-checks` key in quality/exemptions.json, not a barrel (~780 LOC payload; collectTypeEnv 3 src importers), `git log` shows PTQ-1158's split (bd8e73b7) plus dedupe touches and no revert; CORRECTION: row 1 is NOT consumed "solely by ./type-layer-operand-checks.ts" — classifyOperand is also imported by type-layer-provable.ts:10, ORDERING_OPS/ARITHMETIC_OPS by type-layer-interpolation.ts:22-23, PRIMITIVE_NAMES by annotation-compat.ts:4, NO_SUNK_ARRAYS by type-layer-walk.ts:58 (4 sibling importers, not 1), which strengthens the zero-own-caller substrate observation but refutes seam A's "sole consumer" home, and there is no in-file cross-row link at all (PRIMITIVE_NAMES has no in-file reader); context for the ruling: REVIEW_LOG:625 (2026-09-22) kept this host whole at 802 LOC on the package-discovery keep-whole precedent (D9:src/discovery/package-discovery.ts — zone band, split yields small modules with no band change; here 857 → ~660 stays zone), but that precedent is keyed to a different host and the three sibling consumers were only minted by 33548129 (PTQ-1281 fix, 2026-09-23) after that keep — the target shape is a human ruling, never confirmed (triage: claude-fable-5-1)
verdict: questionable — accounting verified; target shape needs a human ruling: size-scan map reproduces 857 LOC / band zone, no quality/exemptions.json key, all inventory members sit at the cited map lines, and rows 1 (91-255) and 5 (761-841) have zero in-file callers (in-file hits are only declarations, self-recursion at 169/207/829, doc comments at 237/475, and the 843-856 export block), so ≥ 2 distinct concerns stand with no shared locals and no overlooked concrete/strong reason (not a barrel, ~780 LOC payload, no reverted split, no open issue keys this host); one count is wrong — row 1 is not consumed "solely" by type-layer-operand-checks.ts: classifyOperand is also imported by type-layer-provable.ts:10, ORDERING_OPS/ARITHMETIC_OPS by type-layer-interpolation.ts, PRIMITIVE_NAMES by annotation-compat.ts:4, and NO_SUNK_ARRAYS by type-layer-walk.ts — so Seam A's "sole consumer" home is undercut, though the substrate observation still holds (triage: claude-opus-5-5)
