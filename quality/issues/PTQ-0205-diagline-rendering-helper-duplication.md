---
id: PTQ-0205
title: diagLines/diagCodes redefine, verbatim, a diagnostics-rendering helper duplicated across dozens of test files
lens: D7                     # D2 | D7 — the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/annotation-nontype-text-refusal.test.ts:393-407
  - tests/binder-param-line-newline-normalisation.test.ts:337-345
  - tests/schema-body-nontype-text-refusal.test.ts:282-290
  - tests/helpers/e2e-s1.ts:60-81
sites: 4
fix_scope: cross-module       # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260911104855
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-11
---

# diagLines/diagCodes redefine, verbatim, a diagnostics-rendering helper duplicated across dozens of test files

## Observation
tests/annotation-nontype-text-refusal.test.ts declares two module-private helper
functions, `diagLines` and `diagCodes`, whose whole bodies are one-line
projections of `doc.diagnostics` into comparison strings (`"<severity> <code>:
<message>"` and `"<severity> <code>"`, both in emission order). Nearly every one
of the file's diagnostic assertions is built on these two functions. The
identical pair — same names, same doc comments, same one-line bodies — recurs as
a locally-defined, non-exported function in dozens of other test files.
tests/helpers/e2e-s1.ts, the canonical shared parse-driver module this same file
already imports `parseDoc` from, exports four adjacent `Diagnostic[]`-shaped
helpers (`hasCode`, `findCode`, `codes`, `errors`) but none in the
`"severity code: message"` / `"severity code"` shape, so every file needing that
exact shape re-derives it rather than adding it beside its siblings.

## Evidence
tests/annotation-nontype-text-refusal.test.ts:393-407
```ts
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

/**
 * Every diagnostic rendered `<severity> <code>`, in emission order — the
 * REGISTRY-FREE half of a refusal expectation. Asserted BEFORE the rendered
 * message on every refusal cell so the red at HEAD names the symptom the bug
 * reports (an annotation that draws nothing at all) rather than the absent
 * registry row, which is a separate, separately-titled red.
 */
function diagCodes(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}`);
}
```

tests/binder-param-line-newline-normalisation.test.ts:337-345 (byte-identical
`diagLines`, functionally identical `diagCodes`):
```ts
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

/** Every diagnostic rendered `<severity> <code>` — the count/code/severity triple. */
function diagCodes(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}`);
}
```

tests/schema-body-nontype-text-refusal.test.ts:282-290 (byte-identical
`diagCodes` and `diagLines`, declaration order swapped):
```ts
/** Every diagnostic rendered `<severity> <code>`, in emission order. */
function diagCodes(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}`);
}

/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

tests/helpers/e2e-s1.ts:60-81 — the established shared-helper home this same
review file already draws `parseDoc` from; no `diagLines`/`diagCodes`-shaped
export lives here despite hosting four adjacent `Diagnostic[]` projections:
```ts
/** True iff any diagnostic carries the given code. */
export function hasCode(diags: readonly Diagnostic[], code: string): boolean {
  return diags.some((d) => d.code === code);
}

/** The first diagnostic carrying the given code, if any. */
export function findCode(
  diags: readonly Diagnostic[],
  code: string,
): Diagnostic | undefined {
  return diags.find((d) => d.code === code);
}

/** All distinct diagnostic codes present (sorted, for readable failures). */
export function codes(diags: readonly Diagnostic[]): string[] {
  return [...new Set(diags.map((d) => d.code))].sort();
}

/** Error-severity diagnostics only. */
export function errors(diags: readonly Diagnostic[]): Diagnostic[] {
  return diags.filter((d) => d.severity === "error");
}
```

Pattern-wide search: `grep -rl "function diagLines" tests --include="*.test.ts"`
→ 68 files; `grep -rl "function diagCodes" tests --include="*.test.ts"` → 19
files (out of 810 total `*.test.ts` files). Beyond the three files quoted above,
grepping each hit's surrounding lines shows the identical one-line `diagLines`
body and identical doc comment recurring verbatim in at least:
annotation-root-brace-union-lowering.test.ts:455,
b0431-export-in-theta-refused.test.ts:53, b0446-nested-export-inert.test.ts:73,
b0447-nested-import-inert.test.ts:66,
brace-and-angle-annotation-junk-refusal.test.ts:299,
brace-rooted-union-arm-capture.test.ts:237,
frontmatter-yaml-parse-failure-diagnostic.test.ts:330,
generic-argument-bracket-group-truncation.test.ts:365,
generic-argument-inline-field-key-rules.test.ts:320,
generic-argument-shredded-group-refusal.test.ts:268,
inline-empty-object-type.test.ts:249,
inline-object-duplicate-field-name.test.ts:332,
inline-object-keyless-entry-refusal.test.ts:334,
inline-object-stranded-entry-refusal.test.ts:285,
inline-slug-name-reservation.test.ts:251, params-default-type-compat.test.ts:232,
params-scalar-nontype-text-refusal.test.ts:286,
query-annotation-nontype-text-refusal.test.ts:268, and
typeenv-prototype-names.test.ts:300.

## Why this is a problem
This is harness code — how a test renders a `ThetaDocument`'s diagnostics for
string comparison — not domain logic specific to any one bug's subject. The
project already factors exactly this class of small, read-only
`Diagnostic[]`-shaped helper into tests/helpers/e2e-s1.ts (`hasCode`, `findCode`,
`codes`, `errors`, all exported, all reusable), and the reviewed file already
draws `parseDoc` from that same module. `diagLines`/`diagCodes` are the same
size and purpose as those four exports but have no counterpart there, so at
least 68 files (19 for `diagCodes`) each carry an independent copy instead of
one shared definition. Read alone, any one of those 68 definitions looks like
ordinary, well-commented local plumbing; only the cross-file count exposes that
it is one piece of harness reproduced at each of 68 sites rather than shared
once.

## Suggested direction (non-binding, optional)
tests/helpers/e2e-s1.ts already hosts the four sibling `Diagnostic[]`-shaped
projections this file (and dozens of its siblings) redefine one more of.

## False-positive check
- Gate-pin: none of the cited files (this one,
  binder-param-line-newline-normalisation.test.ts,
  schema-body-nontype-text-refusal.test.ts, tests/helpers/e2e-s1.ts) match
  `*gate*.test.ts` or the named kin (closing-gate, cross-cutting-gates,
  rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate); the census/pin carve-out concerns asserted
  pinned counts, not a rendering helper's definition site.
- Recording-double: `diagLines`/`diagCodes` map an already-produced, already
  returned array; they record no calls and back no "never called" assertion, so
  the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "diagLines" docs/bugs/` → 0 files; no
  open bug document names this duplication, or gives a rationale for keeping the
  definition local to each file, as a documented correct-reason design.
- coverage-matrix/bug-doc citation search: `grep -n "diagLines"
  docs/reference/coverage-matrix.md` → 0 hits. docs/bugs/0124's own text does
  cite this file BY NAME as its "Test witness" ("251 cells... every expected
  message read from the registry at runtime") and reproduces the gate output
  `Tests 251 passed (251)` — reverified during this review
  (`npx vitest run tests/annotation-nontype-text-refusal.test.ts` → `251 passed
  (251)`). That citation pins the file and its test count/behaviour, not the
  internal implementation of `diagLines`/`diagCodes`; this finding proposes no
  change to any `it()`/`describe()` name, count, or assertion, only to where the
  two helper bodies are defined, so the pinned witness is unaffected.
- Coverage check: the claim is entirely about a repeated function DEFINITION,
  not a missing test path; both functions are exercised by every test in the
  file that calls them.

## Triage
verdict: confirmed — all citations/grep counts (68 diagLines, 19 diagCodes, 810 total) reproduce exactly, e2e-s1.ts is confirmed to already export four sibling Diagnostic[]-shaped helpers without this shape, the docs/bugs/0124 witness-count carve-out was correctly checked and is inapplicable (proposal changes only definition site, not the pinned 251-count witness, reverified: 251 passed (251)), and this is genuine D7 boilerplate duplication confined to tests/ with no existing PTQ match (triage: claude-opus-5)
