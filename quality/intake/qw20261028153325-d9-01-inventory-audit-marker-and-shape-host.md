---
id: pending
title: inventory-closure-audit.ts hosts marker-language classification alongside TypeScript surface recognition
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/inventory-closure-audit.ts:1-996
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/extension/inventory-closure-audit.ts
d9_band: zone
wave: qw20261028153325
reported_by: lens-d9-placement (openai/gpt-6.1-sol)
date: 2026-10-28
triaged_at: e071eada0d46fdc4e5ebc1a9f3bb2a97f028d3a5
---

# inventory-closure-audit.ts hosts marker-language classification alongside TypeScript surface recognition

## Observation
The authoritative map measures this module at 996 LOC, file band zone. Its header identifies it as the pure, in-memory negative-direction inventory-closure audit, with disk walking and infrastructure handling outside the core. It contains both the comment-marker language and its authorisation rules, and the TypeScript AST surface recognisers. These already have separate function boundaries but remain in one module.

## Evidence
Distinct-concern inventory; LOC below sums declaration LOC from the supplied map, not surrounding comments or imports. This inventory names the principal concern groups rather than assigning every header/helper line to a group.

| concern | members | line ranges | LOC |
|---|---|---|---|
| marker grammar and authorisation | MarkerClause, MarkerVerdict, MALFORMED_CLAUSE_TOKEN, classifyMarker, classifyAndEmitMarkers | 152-211; 675-744 | 112 |
| TypeScript surface shapes and references | visitShapes, visitRefs | 372-555; 561-672 | 296 |
| invocation-level audit orchestration | runInventoryClosureAudit | 757-949 | 193 |

`src/extension/inventory-closure-audit.ts:183-193`:
```ts
function classifyMarker(commentText: string): MarkerVerdict {
  const lineText = commentText;
  const m = /^(\/\/|\/\*)\s*([A-Za-z-]+)/.exec(lineText);
  const run = m?.[2];
  if (m === null || run === undefined || run.toLowerCase() !== "allow-pi-surface") {
    return { kind: "none" };
  }
  // (g) a block-comment opener is not the single-line `//` well-formed shape.
  if (m[1] === "/*") return { kind: "malformed", clause: "g" };
  // (f) the `allow-pi-surface` run must be byte-for-byte lowercase ASCII.
  if (run !== "allow-pi-surface") return { kind: "malformed", clause: "f" };
```

`src/extension/inventory-closure-audit.ts:372-382`:
```ts
function visitShapes(
  n: ts.Node,
  sf: ts.SourceFile,
  emitFamilyFour: (pos: number, symptom: string, symbol: string) => void,
): void {
  if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
    const spec = n.moduleSpecifier.text;
    if (isInScopeSpecifier(spec)) {
      const ic = n.importClause;
      if (!ic) {
        emitFamilyFour(n.getStart(sf), "side-effect-import", n.getText(sf));
```

The marker pass receives already-collected references and line sets rather than invoking either AST recogniser. Its six inputs are `sf`, `commentByLine`, `refs`, `familyFourLines`, `clauseELines`, and `push`; it returns `authorisedLines`. The marker group has two references to declarations outside that group: `Ref` as a type and `NA` as the emitted absent-symbol value. The AST visitors do not call `classifyMarker` or `classifyAndEmitMarkers`.

Map importer counts: both visitors and both marker functions are private, 0 src / 0 tests; `runInventoryClosureAudit` is exported, 0 src / 1 test. This is not evidence of deadness: these private groups are called by the audit driver inside this module.

## Why this is a problem
The zone band has no presumption of breakdown; the evidence is the two independently bounded rule groups above, not the file size alone. The marker-language group implements audit-resolution.md's malformed/stale-marker clauses, while the visitors implement audit-recognised-shapes.md's TypeScript surface rules. Their communication is through data already explicit at the call boundary.

Reasons considered: a single algorithm with shared local state does not explain the module boundary, because the marker group receives its six inputs explicitly and reads none of the visitors' recursive locals. Closed-enumeration dispatch explains individual recognisers and the marker classifier, not their co-location with each other and the driver. This is not a data-only/type-family module: the two executable visitor declarations alone account for 296 mapped LOC, and the marker group is primarily executable code. One grammar production does not explain the file: comment-marker recognition and TypeScript surface inspection are different inputs/rules. Generated-code status does not apply; the source has no generator banner and its history contains implementation and quality-fix commits.

## Suggested direction (non-binding, optional)
Unproven hypothesis, for human ratification: Seam A: MarkerClause, MarkerVerdict, MALFORMED_CLAUSE_TOKEN, classifyMarker and classifyAndEmitMarkers -> src/extension/inventory-audit-markers.ts (hypothesis) - 112 mapped declaration LOC, 0 currently exported symbols moved, external importers 0 src / 0 tests, cross-references back into the host: Ref (type) and NA (constant), plus the existing caller supplying the six explicit inputs. No further split design is asserted.

## False-positive check
- Band: zone, 996 LOC, from the authoritative map; the concern inventory supplies the required two groups.
- Reasons-considered check: shared state, enumeration, data/type family, grammar and generation considered above with the existing call boundary as evidence.
- Exemptions check: quality/exemptions.json has no key for this module or its audit functions.
- Generated-code check: the scoped-source search for `@generated|DO NOT EDIT|autogenerated` returned no hits. `git log --oneline --follow -- src/extension/inventory-closure-audit.ts` shows implementation, bug and quality commits, including the visitor/marker hoists in 9d5a0f17 and 282198e3; no reverted split appears in that log.
- Spec-mirror check: audit-recognised-shapes.md# audit-recognised-shapes enumerates surface shapes; audit-resolution.md# audit-malformed-marker-discriminator and # audit-inventory-first-resolution define the marker rules and precedence. The proposed boundary moves the existing marker pass whole, retaining its position after reference collection; it does not divide a classifier's arms or change precedence.
- Prior-finding check: PTQ-0350 and PTQ-0416 concern the former nested bodies in #runInventoryClosureAudit, not this file-level host. Their ratified in-file hoists are present. The separate function-level candidate this wave concerns the remaining comment-trivia traversal, not the marker group's module boundary.
- Placement/husk check: the header expressly identifies the build-gate core; its test consumer is intentional. There is executable payload in every inventoried group, not an extraction facade or an almost-empty survivor. No misplacement or husk claim is made.

## Triage
verdict: questionable — accounting verified: size-scan reproduces 996 LOC/zone, the 112-LOC marker group, 296-LOC AST visitors, 193-LOC driver and stated importer counts; both excerpts match exactly, and the marker pass has six explicit inputs without capturing visitor locals. The cited spec clauses pin recognition and resolution precedence, not module co-location; no applicable exemption, generator marker or reverted split was found. PTQ-0350/PTQ-0416 ratified in-file function hoists, and the sibling intake concerns comment traversal, not this file-level boundary. Whether to split these concern groups into modules requires a human ruling under D9. (triage: claude-opus-5-5)
