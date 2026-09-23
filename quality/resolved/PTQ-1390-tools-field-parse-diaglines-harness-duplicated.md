---
id: PTQ-1390
title: tools-field-shape-refusal and tools-field-zero-entry-scalar-refusal each redeclare the identical parse/diagCodes/diagLines/matcher frontmatter-parse harness
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/tools-field-shape-refusal.test.ts:273-288
  - tests/tools-field-zero-entry-scalar-refusal.test.ts:194-209
sites: 2                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# tools-field-shape-refusal and tools-field-zero-entry-scalar-refusal each redeclare the identical parse/diagCodes/diagLines/matcher frontmatter-parse harness

## Observation
Both in-scope files declare, at module scope, an identical four-symbol
frontmatter-parse harness: a `ModelReferenceMatcher` constant named `matcher`
that always resolves, a `parse(source)` wrapper around
`parseFrontmatter(source, { file: "<bugstem>.theta", modelMatcher: matcher })`,
a `diagCodes(r)` mapping diagnostics to `"<severity> <code>"` strings, and a
`diagLines(r)` mapping diagnostics to `"<severity> <code>: <message>"`
strings. The bodies are byte-identical apart from the literal `file:` string
passed to `parseFrontmatter` (`"bug0104.theta"` vs `"bug0206.theta"`).

## Evidence
`tests/tools-field-shape-refusal.test.ts:273-288`:
```ts
const matcher: ModelReferenceMatcher = { resolve: () => "resolved" };

/** Parse a whole `.theta` source through the shipped frontmatter reader. */
function parse(source: string): FrontmatterParseResult {
  return parseFrontmatter(source, { file: "bug0104.theta", modelMatcher: matcher });
}

/** Every diagnostic rendered `<severity> <code>`, in emission order. */
function diagCodes(r: FrontmatterParseResult): string[] {
  return r.diagnostics.map((d) => `${d.severity} ${d.code}`);
}

/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(r: FrontmatterParseResult): string[] {
  return r.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

`tests/tools-field-zero-entry-scalar-refusal.test.ts:194-209` — the same
block, only the `file:` literal differing (verified line-by-line):
```ts
const matcher: ModelReferenceMatcher = { resolve: () => "resolved" };

/** Parse a whole `.theta` source through the shipped frontmatter reader. */
function parse(source: string): FrontmatterParseResult {
  return parseFrontmatter(source, { file: "bug0206.theta", modelMatcher: matcher });
}

/** Every diagnostic rendered `<severity> <code>`, in emission order. */
function diagCodes(r: FrontmatterParseResult): string[] {
  return r.diagnostics.map((d) => `${d.severity} ${d.code}`);
}

/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(r: FrontmatterParseResult): string[] {
  return r.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

## Why this is a problem
Both files (explicitly noted in each file's own header as siblings — the
zero-entry file's header states it is "bug 0206's witness and the
value-EMPTINESS half of the field whose node-KIND half is bug 0104's",
naming the other in-scope file by path) independently re-derive the same
`ModelReferenceMatcher` stub, the same `parseFrontmatter` wrapper, and the
same two diagnostic-rendering projections. A change to how a diagnostic is
rendered for a failure message (e.g. adding the range to `diagLines`, or
changing `diagCodes`' separator) needs the identical edit applied twice, with
no single source either file draws from for this shared shape.

## Suggested direction (non-binding, optional)
A shared `parse(source, file)`/`diagCodes`/`diagLines`/matcher-stub helper,
living beside the other frontmatter-parse test-support pieces already
extracted under `tests/helpers/`, would give both call sites one definition
each to change; that is an observation about a natural home, not a design
this filing owns.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate-kin
  patterns; not applicable.
- Recording-double check: `matcher` is a fixed-answer stub used to satisfy
  `parseFrontmatter`'s option shape, not a call-recording double used for a
  MUST-NOT witness; not applicable.
- docs/bugs/ signature search: `grep -n "Status:" docs/bugs/0104-*.md
  docs/bugs/0206-*.md` — both `Status: fixed`; not a documented
  correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -rn
  "tools-field-shape-refusal\|tools-field-zero-entry-scalar-refusal"
  docs/reference/coverage-matrix.md docs/bugs/` — each file is named in its
  own bug doc as that bug's witness file, but no citation pins the
  `parse`/`diagCodes`/`diagLines`/`matcher` block or a line range inside it;
  this finding proposes no merge, rename, or deletion of either test.
- This is a duplication claim about existing harness code in two files both
  in scope; no assertion is made about a missing test or an untested path.

## Triage
<!-- triage appends here -->
verdict: confirmed — independently re-verified: the 16-line matcher/parse/diagCodes/diagLines block at tools-field-shape-refusal.test.ts:273-288 and tools-field-zero-entry-scalar-refusal.test.ts:194-209 is byte-identical after normalising the `file:` literal (diff clean via mktemp scratch); D7 boilerplate/copy-paste-fixture class in tests/ only, neither file is a gate test, matcher is a fixed-answer stub not a recording double, bugs 0104/0206 both `Status: fixed`, bug docs cite the files only as whole witnesses (cell counts, no pinned line range) and coverage-matrix.md names neither; prior PTQs on this pair hit distinct ranges/root causes (PTQ-0724 registry read 188-208/150-170, PTQ-0840 templateMessage 195-201/157-163, PTQ-0723 production-load harness 666-748/654-723) and same-wave sibling d7-01 is the outcomeOf/observed wrapper at 653-686/626-659, so not a duplicate; note for the fixer that tests/helpers/e2e-s1.ts already exports `parseFrontmatterSource`/`resolvingMatcher` (63-69) and a `diagLines` accepting `readonly Diagnostic[]` (436), which neither file imports (triage: claude-fable-5-1)
