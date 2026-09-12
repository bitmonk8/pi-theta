---
id: PTQ-0248
title: Two b0426 doc-gate cell names promise an order check and a both-cases check that their single toContain assertion does not perform
lens: D7                     # D2 | D7 — the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0426-qry18-no-union-of-scalars-row.test.ts:98-107
  - tests/b0426-qry18-no-union-of-scalars-row.test.ts:167-176
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912112713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# Two b0426 doc-gate cell names promise an order check and a both-cases check that their single toContain assertion does not perform

## Observation
`tests/b0426-qry18-no-union-of-scalars-row.test.ts` is a doc-content gate: each
cell reads a committed spec/reference `.md` file and asserts `text.toContain(…)`
for one or more literal substrings. Two of its cells carry names that describe a
relationship or a pair of conditions, while their bodies carry exactly one
`toContain` call apiece, checking a proper subset of what the name states. Cell
"pins the brand-first arm pick order" (:98-107) checks only that the phrase
"schema brand" occurs somewhere in the file; no assertion in the cell (or
anywhere else in the file) checks for an order-indicating token such as
"first" or "otherwise". Cell "mirrors both never-guess degenerate cases (no
arm, or more than one)" (:167-176) checks only that "or more than one" occurs
in `docs/reference/frontmatter.md`; the substring "no arm" is never asserted
against that file anywhere in this test file.

## Evidence
tests/b0426-qry18-no-union-of-scalars-row.test.ts:98-107 — the entire cell body,
one assertion, no order-indicating token checked:
```ts
  it("pins the brand-first arm pick order", () => {
    const text = readDoc(QRY_STRINGIFICATION);
    // Gates the pick order matching bug 0425-(a): the arm is selected by the
    // value's schema brand first (then, on the `system:` bare-path render, an
    // exact field-set match). Ungated, the brand clause could drift away.
    expect(
      text,
      "bug 0426 §Fix: the union row's translation clause must state the schema-brand arm pick (0425-(a)'s brand-first behaviour)",
    ).toContain("schema brand");
  });
```
`grep -o "schema brand" docs/spec_topics/query/query-escapes-stringification.md
| wc -l` → 2, both on line 35 (one paragraph); `grep -n "\"first\"\|'first'\|otherwise"
tests/b0426-qry18-no-union-of-scalars-row.test.ts` → 1 hit, at line 86, an
unrelated comment belonging to a different, earlier cell ("adds the union row
itself…") — no cell asserts an order token.

tests/b0426-qry18-no-union-of-scalars-row.test.ts:167-176 — the entire cell
body, one assertion, "no arm" absent from it:
```ts
  it("mirrors both never-guess degenerate cases (no arm, or more than one)", () => {
    const text = readDoc(REFERENCE_FRONTMATTER);
    // The mirror must carry BOTH cases the settled constraint names; a
    // no-match-only mirror lets a reference-only reader implement a first-arm
    // pick on ambiguity without contradicting the text (review F3).
    expect(
      text,
      "bug 0426 §Fix: the reference mirror must state that a value matching more than one arm also renders untranslated, not only a no-match value",
    ).toContain("or more than one");
  });
```
`grep -n "no arm" tests/b0426-qry18-no-union-of-scalars-row.test.ts` → 4 hits,
all inside the EARLIER describe-(A) cell's name/message/assertion string
(lines 109, 113, 114) which reads `QRY_STRINGIFICATION`, plus this cell's own
name (line 167); none is an assertion against `REFERENCE_FRONTMATTER`. The
current text of `docs/reference/frontmatter.md:322-323` already reads "a value
matching no arm — or more than one — renders untranslated", so the omitted
half is present and checkable, not merely a wording variant that would be hard
to phrase as a substring.

## Why this is a problem
Both names describe a two-part fact (an ordering between two match
strategies; two named degenerate cases) but each cell's only assertion proves
one part. A reader who trusts the name over the body — skimming a test-run
summary, or deciding a doc edit is safe because "the order is pinned" / "both
cases are mirrored" — would misjudge what a green run has actually shown: a
doc edit that kept the substring "schema brand" while reversing which match
strategy runs first (no "first"/"otherwise" token is checked) would leave the
first cell green; a doc edit that dropped the reference mirror's "no arm"
clause while keeping "or more than one" (the two are two independently
checkable substrings on the same line, per the Evidence excerpt above) would
leave the second cell green. This is the D7 "misleading test name" shape: the
name says X (an order; two conditions), the body verifies a proper subset of
X.

## Suggested direction (non-binding, optional)
Each cell's own name already states the exact fact it means to pin (an order;
two named cases); the gap is between that stated fact and the single
substring each body currently checks.

## False-positive check
- Gate-pin check: the file name `b0426-qry18-no-union-of-scalars-row.test.ts`
  does not match `*gate*.test.ts` or the named kin list
  (closing-gate/cross-cutting-gates/rfc-*-spec-surface-gate/
  committed-fixture-parse-gate/registry-closed-set-corpus-gate), and this
  finding is not about a pinned count or inventory — it is about a mismatch
  between a cell's stated name and the substring(s) its body actually checks —
  so the census/pin carve-out does not apply.
- Recording-double check: `readDoc` reads a file and returns/throws; no
  recording double or "never called" witness is involved, so the
  negative-witness carve-out does not apply.
- docs/bugs/ signature search: `docs/bugs/0426-qry18-no-union-of-scalars-row.md`
  Status is "fixed (0.432.0)" (confirmed: `grep -n "Status:"` line 3) — not an
  open, documented correct-reason red; `npx vitest run
  tests/b0426-qry18-no-union-of-scalars-row.test.ts` passes all 11 tests at
  HEAD, confirming both cited cells are green, not red-by-design. The bug doc's
  own §Review log (round 1, finding F4) states an earlier draft of this witness
  "did not gate … the brand clause" and that gap was "addressed" by adding
  cells including the one cited here, but the doc states no rationale for
  checking only one substring per two-part name — nothing in the bug doc
  contradicts this finding.
- coverage-matrix/bug-doc citation search: `grep -rn
  "b0426-qry18-no-union-of-scalars-row" docs/reference/coverage-matrix.md
  docs/bugs/*.md` → one hit, `docs/bugs/0426-…md:183`, naming the test FILE as
  bug 0426's witness (not either `it()` title individually). This finding
  proposes no merge, rename, or deletion of the file or either cell, only
  notes the name/assertion mismatch, so that citation is unaffected.
- Coverage check: this finding does not claim a missing test path or an
  untested behaviour — both cited cells exist, run, and currently pass; the
  claim is limited to what each cell's existing assertion mechanically proves
  relative to what its own name states.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — verified: "schema brand" occurs only on doc line 35 with no "first"/"otherwise" order-token ever asserted in the test file, and "no arm" is asserted only against QRY_STRINGIFICATION (lines 109/113/114) and this cell's own name, never against REFERENCE_FRONTMATTER, though frontmatter.md:322-323 already carries the checkable "no arm" substring — both cells' single toContain proves a proper subset of their two-part names, breaking this file's own per-name-component-assertion convention shown in sibling cells, the same misleading-name shape already confirmed in PTQ-0235/PTQ-0217 (triage: claude-opus-5)
