---
id: PTQ-1376
title: The Row interface and expectRow driver are duplicated near-verbatim across both in-scope files
lens: D7
status: open
verdict: confirmed
locations:
  - tests/loop-element-withhold-binding-scoped.test.ts:242-286
  - tests/match-arm-scope-inference-pass.test.ts:456-502
sites: 2
fix_scope: module
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# The Row interface and expectRow driver are duplicated near-verbatim across both in-scope files

## Observation
Both files define an identically-shaped `Row` interface (`label`, `src`, `sites`, `expected`, `reason`, optional `located`, optional `frontmatter`) and an `expectRow(row: Row): ThetaDocument` function that performs the same four-step sequence: parse the fixture, assert a binder-site precondition list (naming a drifted/unparsed fixture instead of letting a later assertion measure nothing), assert the whole ordered diagnostic-code list, assert the whole ordered diagnostic-message list, and — when `located` is supplied — assert the whole ordered `severity code @range` list. The doc comments describing the whole-list-equality rationale are near-identical sentences.

## Evidence
tests/loop-element-withhold-binding-scoped.test.ts:242-286
```ts
interface Row {
  readonly label: string;
  readonly src: string;
  readonly sites: readonly string[];
  readonly expected: Expectation;
  readonly reason: string;
  readonly located?: readonly string[];
  readonly frontmatter?: string;
}

function expectRow(row: Row): ThetaDocument {
  const doc = parse(row.src, row.frontmatter ?? FM);
  expect(
    binderSites(doc, "the loop arms under test"),
    `${row.label} PRECONDITION: the fixture's loop-variable / \`let\` binder sites must be exactly these, so a drifted or unparsed fixture fails here instead of letting the assertions below measure nothing. Diagnostics: ${render(doc)}`,
  ).toEqual([...row.sites]);
  expect(
    doc.diagnostics.map((d: Diagnostic) => d.code),
    `${row.label} — ${row.reason}\n  actual diagnostics: ${render(doc)}`,
  ).toEqual([...row.expected.codes]);
  expect(
    doc.diagnostics.map((d: Diagnostic) => d.message),
    `${row.label} — DIAG-4 (diagnostic-shape.md:74): the rendered messages are the registry *Message* column interpolated\n  actual diagnostics: ${render(doc)}`,
  ).toEqual([...row.expected.msgs]);
  const located = row.located;
  if (located !== undefined) {
    expect(
      doc.diagnostics.map((d: Diagnostic) => {
        const r = d.range;
        return `${d.severity} ${d.code} @${r === undefined ? "-" : at(r)}`;
      }),
      `${row.label} — the verdict belongs to the ARGUMENT node inside the loop body, not to the loop and not to the statement. Diagnostics: ${render(doc)}`,
    ).toEqual([...located]);
  }
  return doc;
}
```

tests/match-arm-scope-inference-pass.test.ts:456-502
```ts
interface Row {
  readonly label: string;
  readonly src: string;
  readonly frontmatter?: string;
  readonly sites: readonly string[];
  readonly expected: Expectation;
  readonly reason: string;
  readonly located?: readonly string[];
}

function expectRow(row: Row): ThetaDocument {
  const doc = parseDoc((row.frontmatter ?? FM) + row.src, FILE);
  expect(
    armSites(doc),
    `${row.label} PRECONDITION: the fixture's binding, \`match\` and arm sites must be exactly these — the arm's binder spelling must still collide with the outer binding's, and the \`match\` node must still be at the asserted range. A drifted or unparsed fixture fails HERE instead of letting the assertions below measure nothing. Diagnostics: ${render(doc)}`,
  ).toEqual([...row.sites]);
  expect(
    doc.diagnostics.map((d: Diagnostic) => d.code),
    `${row.label} — ${row.reason}\n  actual diagnostics: ${render(doc)}`,
  ).toEqual([...row.expected.codes]);
  expect(
    doc.diagnostics.map((d: Diagnostic) => d.message),
    `${row.label} — DIAG-4 (diagnostic-shape.md:74): the rendered messages are the registry *Message* column interpolated\n  actual diagnostics: ${render(doc)}`,
  ).toEqual([...row.expected.msgs]);
  const located = row.located;
  if (located !== undefined) {
    expect(
      doc.diagnostics.map((d: Diagnostic) => {
        const r = d.range;
        return `${d.severity} ${d.code} @${r === undefined ? "-" : at(r)}`;
      }),
      `${row.label} — the verdict's range and severity. Diagnostics: ${render(doc)}`,
    ).toEqual([...located]);
  }
  return doc;
}
```
The only differences are: the site-list producer (`binderSites(doc, "the loop arms under test")` vs the file-local `armSites(doc)`), one wording variant in the precondition failure message and in the `located` failure message, and the field order of `frontmatter` inside `Row`. The parse-and-four-assertion skeleton, the `Expectation`-typed `expected.codes`/`expected.msgs` shape (both imported from the same `./helpers/load-row-harness`), and the whole-ordered-list rationale are otherwise identical.

## Why this is a problem
Two files under review carry the identical four-assertion row-driver shape side by side, each maintaining its own copy of the precondition-then-codes-then-messages-then-located sequence and its own copy of the `Row` interface. A wording or ordering change to the DIAG-4 message assertion (line "the rendered messages are the registry *Message* column interpolated") would need to be made in both files to stay consistent, and nothing enforces that.

## Suggested direction (non-binding, optional)
Both files already import `Expectation`, `CLEAN`, `one`, `two` from `tests/helpers/load-row-harness`, which is the existing shared home for this row-fixture vocabulary; a shared `expectRow`-shaped driver parameterised over the site-list producer is the kind of addition that module's existing exports already anticipate (observation, not design).

## False-positive check
- Gate-pin carve-out: neither file matches `*gate*.test.ts` or its named kin; not applicable.
- Recording-double carve-out: `expectRow` and `Row` are fixture-driver plumbing, not a recording double witnessing a MUST-NOT call; not applicable.
- docs/bugs/ signature search: ran `grep -rn "expectRow" docs/bugs/*.md` — no hits; neither copy is a documented correct-reason red.
- coverage-matrix/bug-doc citation search: ran `grep -rln "expectRow" docs/reference/coverage-matrix.md docs/bugs/*.md` — no hits; `expectRow` is not cited by name in the coverage matrix or any bug doc's witness list, so no merge/rename/delete-of-a-cited-test concern applies.
- Confirmed this stays inside D7 duplication territory: the claim is about the repeated driver/interface shape between two test files, not about missing coverage or suite composition.

## Triage
verdict: confirmed — independently re-verified: both excerpts match at the cited lines (loop-element:242-286, match-arm:456-502); a mktemp diff of the two `expectRow` bodies shows only the doc-comment wording, the parse-call spelling (`parse(body, fm)` wrapping the same `parseDoc(fm + body, FILE)`), the site-list producer (`binderSites` vs local `armSites`) and two failure-message strings differ — the parse→sites-precondition→codes→msgs→located skeleton is byte-identical and both consume the shared `Expectation` from tests/helpers/load-row-harness, which exports no row driver; stated searches re-run (0 hits in docs/bugs/*.md and coverage-matrix.md, neither file is gate-kin, `expectRow` is a real `toEqual` precondition driver not a recording double); not a duplicate — resolved PTQ-0633/PTQ-1023 cover the `binderSites` walker, not this driver, and no open issue names `expectRow`; the earlier declined-to-file note (REVIEW_LOG:390, "diverged signatures") concerned a broader sibling family, whereas these copies are mechanical clones. Fixer note: undercount — `tests/let-arm-withhold-binding-scoped.test.ts:241-272` is a third copy of the same `Row`+`expectRow` shape (exact search `toEqual([...row.expected.msgs])` returns exactly these 3 files), differing only in the `binderSites(..., { includeCallArguments: true })` producer and message strings, so the shared driver should be parameterised over site-producer + precondition/located messages and migrated in all three (triage: claude-fable-5-1)
