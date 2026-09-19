---
id: PTQ-0809
title: Three inbound-boundary test files hand-roll the parse-clean precondition tests/helpers/e2e-s1.ts already exports as parseTheta
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/inbound-boundary-binder-args.test.ts:119-134
  - tests/inbound-rebuild-declaration-order.test.ts:71-80
  - tests/inbound-boundary-typed-query.test.ts:129-130,216-219
  - tests/helpers/e2e-s1.ts:56-64
sites: 3
fix_scope: module
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# Three inbound-boundary test files hand-roll the parse-clean precondition tests/helpers/e2e-s1.ts already exports as parseTheta

## Observation
tests/helpers/e2e-s1.ts exports `parseTheta(path, src)`, whose body parses a
source through `parseDoc`, filters `doc.diagnostics` to error severity, and
throws naming the file when any error is present. Three files in this wave's
scope reimplement that identical two-step "parse, then filter-and-throw on
error diagnostics" sequence locally instead of importing it, even though two
of the three already import a sibling export (`parseDeps`/`parseDoc`) from
the very module `parseTheta` lives in.

## Evidence
tests/helpers/e2e-s1.ts:56-64 — the canonical, exported helper:
```ts
export function parseTheta(path: string, src: string): ThetaDocument {
  const doc = parseDoc(src, path);
  const errors = doc.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `fixture ${path} failed to parse: ${errors.map((d) => `${d.code}: ${d.message}`).join("; ")}`,
    );
  }
  return doc;
}
```

tests/inbound-boundary-binder-args.test.ts:119-134 (imports `parseDeps as
makeParseDeps` from `./helpers/e2e-s1` at the top of the file, but not
`parseTheta`):
```ts
function loadFixture(): ThetaDocument {
  const source: ThetaSource = { path: "binder-args.theta", bytes: new TextEncoder().encode(SOURCE) };
  const doc = parseThetaDocument(source, makeParseDeps());
  const errors = doc.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `harness: the fixture theta did not load cleanly, so its \`params:\` block did not lower and ` +
        `no cell below drives the real binder document: ${JSON.stringify(errors)}`,
    );
  }
  if (doc.frontmatter === null) {
    throw new Error("harness: the fixture theta carries no parsed frontmatter");
  }
  return doc;
}
```

tests/inbound-rebuild-declaration-order.test.ts:71-80 (imports `parseDeps as
makeDeps, schemaDeclsOf, enumDeclsOf` from `./helpers/e2e-s1`, but not
`parseTheta`):
```ts
function parse(src: string, path = "order.theta"): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  const doc = parseThetaDocument(source, makeDeps());
  const errors = doc.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `harness: the fixture document did not load cleanly, so no cell below speaks about a ` +
        `real lowered schema: ${JSON.stringify(errors)}`,
    );
```

tests/inbound-boundary-typed-query.test.ts:129-130 and :216-219 (this file
does import `parseDoc` directly from `./helpers/e2e-s1`, but re-derives the
error filter and the throw inline instead of calling `parseTheta`):
```ts
const DOC = parseDoc(SOURCE, "typed-query.theta");
const DOC_ERRORS = DOC.diagnostics.filter((d) => d.severity === "error");
```
```ts
  if (DOC_ERRORS.length > 0) {
    throw new Error(
      `harness: the fixture theta did not load cleanly, so the query driven below is not ` +
        `the production one: ${JSON.stringify(DOC_ERRORS)}`,
    );
  }
```

All three restate the same predicate (`doc.diagnostics.filter((d) => d.severity
=== "error")`, then `.length > 0` guards a thrown `Error`) that `parseTheta`
already performs in one call.

## Why this is a problem
The three call sites restate, byte-for-byte on the filter predicate and
structurally on the guard, logic that `tests/helpers/e2e-s1.ts` already
exports under the name `parseTheta` from the exact module two of the three
files already import other exports from (`inbound-boundary-binder-args.test.ts`
imports `parseDeps`; `inbound-rebuild-declaration-order.test.ts` imports
`parseDeps`, `schemaDeclsOf`, `enumDeclsOf`; `inbound-boundary-typed-query.test.ts`
imports `parseDoc` itself, one call away from `parseTheta`). This is the same
class of duplication already confirmed at other individual files under
PTQ-0731 and PTQ-0737, both of which record that per-file instances of this
exact reimplementation are filed and treated as distinct rather than folded
into one another; these three files are three more distinct instances of the
same shape, unaddressed at today's HEAD.

## Suggested direction (non-binding, optional)
`tests/helpers/e2e-s1.ts`'s exported `parseTheta` is the home this shape
already converges on elsewhere in the suite; the binder-args file's extra
`doc.frontmatter === null` check is the only genuinely distinct precondition
among the three and would sit alongside a `parseTheta` call rather than
replace it.

## False-positive check
- Gate-pin check: none of the three files matches `*gate*.test.ts` or the
  named gate kin; no pinned count or inventory is involved.
- Recording-double check: `parseTheta`/`loadFixture`/`parse` are parse-time
  fixture wrappers, not recording doubles backing a MUST-NOT-called witness;
  the carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "inbound-boundary-binder-args"
  docs/bugs/` → docs/bugs/0172, 0178, 0186; `grep -rl
  "inbound-rebuild-declaration-order" docs/bugs/` → docs/bugs/0120, 0178,
  0172; `grep -rl "inbound-boundary-typed-query" docs/bugs/` → docs/bugs/0178,
  0352. Each citation lists the file as a reproduction/witness file for its
  bug; `grep -n "loadFixture\|parseTheta\|e2e-s1" docs/bugs/0172-*.md
  docs/bugs/0120-*.md` finds no discussion of the local
  parse-and-throw wrapper as a deliberate divergence from the shared helper.
- coverage-matrix/bug-doc citation search: `grep -rl` against
  docs/reference/coverage-matrix.md for all three filenames → 0 hits; this
  finding proposes no merge, rename or deletion of any `it()`/`describe()`
  block, only relocating the local parse-and-throw wrapper to the
  already-exported `parseTheta`.
- Duplicate-topic check: PTQ-0731 and PTQ-0737 are the same class at other
  files (import-specifier-separator-production-required.test.ts and
  wire-translation-inbound-retag.test.ts respectively), both explicitly ruled
  "distinct instance" rather than folded into a shared root-cause filing;
  `grep -rli "inbound-boundary-binder-args\|inbound-rebuild-declaration-order\|inbound-boundary-typed-query" quality/intake/*.md quality/issues/*.md` (excluding this file) → no hits naming these three files' own wrapper duplication.
- Coverage check: the claim is about a repeated fixture-precondition
  definition already covered by an existing exported helper, not about a
  missing test path.

## Triage
verdict: confirmed — independently re-verified: all three excerpts match verbatim at the cited lines (binder-args :119-134, declaration-order :71-80, typed-query :129-130/:216-219) and each restates the `filter(severity === "error")` → `length > 0` → throw guard that `tests/helpers/e2e-s1.ts:56-64` exports as `parseTheta`; the two `parseThetaDocument(source, makeDeps())` callers are additionally the PTQ-0731/0737 `parseDoc` shape, all three files already import from `./helpers/e2e-s1`, and `parseTheta` (minted 118fa3e7 2026-09-17, after the tests' c2d22aad 2026-08-16, so post-dating is why they lack it) now has 75 live call sites making it the convergence home; no in-file rationale for a local wrapper, none is a gate or recording double, coverage-matrix → 0 hits, docs/bugs 0120/0172/0178/0186/0352 cite the files only as witnesses (filing's list is slightly off — declaration-order is cited by 0120/0178, not 0172 — immaterial as no it()/describe() change is proposed); filing's "no hits" in quality/ is wrong (PTQ-0736 covers typed-query's scripted `complete()` scaffold, same-wave d7-02 its inline schemaDeclsOf) but neither tracks the parse-clean guard, PTQ-0212 (`loadCleanly`) is resolved and a different helper, and PTQ-0731/0737 plus same-wave d7-01-session-control are the same class at other files (per-file instances ruled distinct); the binder-args `frontmatter === null` check and typed-query's deferred throw are small local deltas that sit alongside, not against, the shared call (triage: claude-fable-5-1)
