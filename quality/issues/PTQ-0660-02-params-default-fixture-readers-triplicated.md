---
id: PTQ-0660
title: params-default fixture-builder and diagnostic-reader quartet (src/paramsDoc/diagLines/diagCodes) re-declared identically across three test files
lens: D7
status: open
verdict: confirmed
locations:
  - tests/params-default-trailing-residue-refusal.test.ts:405-427
  - tests/params-default-type-compat.test.ts:217-239
  - tests/params-default-unary-minus-non-numeric-refusal.test.ts:276-298
sites: 3
fix_scope: module
d4_class: clone
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# params-default fixture-builder and diagnostic-reader quartet (src/paramsDoc/diagLines/diagCodes) re-declared identically across three test files

## Observation
All three in-scope files declare the same four module-scope helpers with the same names, signatures and bodies: `src(paramsBlock)` (wraps a `params:` block into a `mode: prompt` theta source over a fixed `BODY`), `paramsDoc(rhs)` (wraps one RHS as a YAML single-quoted scalar and calls `parseDoc`), `diagLines(doc)` (renders `<severity> <code>: <message>` per diagnostic) and `diagCodes(doc)` (renders `<severity> <code>` per diagnostic). Two of the three files (trailing-residue and unary-minus) additionally both declare `recordedDefault(doc)` and `loweredP(doc)` with identical bodies. Only the `BODY` constant's declaration list, the doc-comment prose and the literal filename passed to `parseDoc` differ between files.

## Evidence

tests/params-default-trailing-residue-refusal.test.ts:405-440
```ts
function src(paramsBlock: string): string {
  return `---\nmode: prompt\nparams:\n${paramsBlock}\n---\n${BODY}\n`;
}

function paramsDoc(rhs: string): ThetaDocument {
  return parseDoc(src(`  p: '${rhs.replace(/'/g, "''")}'`), "bug0175.theta");
}

function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

function diagCodes(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}`);
}

function recordedDefault(doc: ThetaDocument): string | undefined {
  return doc.frontmatter?.params?.fields.find((f) => f.wireName === "p")?.defaultSource;
}

function loweredP(doc: ThetaDocument): unknown {
  const lowered = doc.frontmatter?.params?.loweredSchema as
    | { readonly properties?: Record<string, unknown> }
    | undefined;
  return lowered?.properties?.["p"];
}
```

tests/params-default-type-compat.test.ts:217-239 (the `src`/`paramsDoc`/`diagLines`/`diagCodes` quartet only — this file has no `recordedDefault` / `loweredP`):
```ts
function src(paramsBlock: string): string {
  return `---\nmode: prompt\nparams:\n${paramsBlock}\n---\n${BODY}\n`;
}

function paramsDoc(rhs: string): ThetaDocument {
  return parseDoc(src(`  p: '${rhs.replace(/'/g, "''")}'`), "bug0066.theta");
}

function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

function diagCodes(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}`);
}
```

tests/params-default-unary-minus-non-numeric-refusal.test.ts:276-311
```ts
function src(paramsBlock: string): string {
  return `---\nmode: prompt\nparams:\n${paramsBlock}\n---\n${BODY}\n`;
}

function paramsDoc(rhs: string): ThetaDocument {
  return parseDoc(src(`  p: '${rhs.replace(/'/g, "''")}'`), "bug0166.theta");
}

function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

function diagCodes(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}`);
}

function recordedDefault(doc: ThetaDocument): string | undefined {
  return doc.frontmatter?.params?.fields.find((f) => f.wireName === "p")?.defaultSource;
}

function loweredP(doc: ThetaDocument): unknown {
  const lowered = doc.frontmatter?.params?.loweredSchema as
    | { readonly properties?: Record<string, unknown> }
    | undefined;
  return lowered?.properties?.["p"];
}
```

Every function body across the three excerpts is character-for-character identical except the `"bug0175.theta"` / `"bug0066.theta"` / `"bug0166.theta"` literal argument passed to `parseDoc` inside `paramsDoc`. The `src`, `diagLines`, `diagCodes`, `recordedDefault` and `loweredP` bodies carry zero differences across every file that declares them.

## Why this is a problem
Three files (two of them, five functions) each carry their own copy of the same fixture-wrapping and diagnostic-projection helpers rather than sharing one. A change to how a `params:` RHS is wrapped as a YAML scalar (the `.replace(/'/g, "''")` escaping), to the emitted `mode: prompt` scaffold, or to how a diagnostic line is rendered would need the same edit repeated in every file that declared its own copy, inside this file set alone.

## Suggested direction (non-binding, optional)
A shared `tests/helpers/params-default-fixture.ts` parameterised by the fixture's declaration `BODY` and doc filename could hold `src`, `paramsDoc`, `diagLines`, `diagCodes`, `recordedDefault` and `loweredP` once, alongside the existing `tests/helpers/e2e-s1.ts` `parseDoc` these functions already all build on.

## False-positive check
- Gate-pin check: none of these three files match `*gate*.test.ts` or the named gate kin; not applicable.
- Recording-double check: `diagLines` / `diagCodes` project a real diagnostics array into strings for comparison, not a recording double asserting a MUST-NOT-call; not applicable.
- docs/bugs/ signature search: this is a structural duplication fact about existing passing/failing test bodies, not a documented correct-reason-red posture; no docs/bugs/ citation changes that.
- coverage-matrix / bug-doc citation search: `grep -rn "params-default-trailing-residue-refusal\|params-default-type-compat\|params-default-unary-minus-non-numeric-refusal" docs/reference/coverage-matrix.md docs/bugs/` hits docs/bugs/0066, 0163, 0165 and 0166, which cite specific cells (e.g. "cell c7 of `tests/params-default-type-compat.test.ts`", "cell f1 of tests/params-scalar-nontype-text-refusal.test.ts") by file and cell label. This finding does not propose to merge, rename or delete any cited file or cell; it proposes only that the shared helper functions move to a common module, leaving every cited cell's file, label and body untouched.
- Confirmed this is not a coverage claim: the finding is about code that exists (the duplicated helper functions), not about anything untested.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — re-verified independently: all three excerpts reproduce verbatim at the cited lines (src/paramsDoc byte-identical bar the bug0175/0066/0166 filename literal; recordedDefault/loweredP byte-identical in trailing-residue :430-440 and unary-minus :301-311), the `^function paramsDoc(rhs: string)` shape is exactly these 3 files (sibling params-default-empty-literal/scalar-nontype declare differently-shaped paramsDoc/recordedDefault, so the 3-site count is accurate), all three files already import parseDoc from tests/helpers/e2e-s1 (:202/:7/:170), none is a gate/kin file, coverage-matrix.md has 0 hits and the bug docs (0066/0163/0165/0166/0175 among 14 hits, more than the candidate's 4) cite cells by label which a helper move leaves intact, vitest reproduces 3 files/210 passed green; no PTQ tracks the src/paramsDoc/recordedDefault/loweredP fixture block (PTQ-0227/0279 are other harnesses) — genuine D7 copy-paste fixture. Caveat for the fixer: the diagLines/diagCodes pair is a PTQ-0205 residual (tests/helpers/e2e-s1.ts:100-108 has exported both since 2594cd44) so those two are fixed by importing, not by a new module as the direction paragraph implies (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
