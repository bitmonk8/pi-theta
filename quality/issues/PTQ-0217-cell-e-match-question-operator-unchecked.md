---
id: PTQ-0217
title: b0117's cell E test name claims non-containment by match and the ? operator, but no assertion in the test checks either
lens: D7                     # D2 | D7 — the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0117-panic-namespace-scoping-gate.test.ts:393-407
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260911104855
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-11
---

# b0117's cell E test name claims non-containment by match and the ? operator, but no assertion in the test checks either

## Observation
`tests/b0117-panic-namespace-scoping-gate.test.ts` names one test "cell E —
the exception keeps panic routing, is not contained by `match` / `?` / `let _
=`, and is not on the runtime-defect surface". The test body runs three
`expect` calls against the extracted spec paragraph (`SPEC.headerParagraph`):
one for the literal substring `"let _ ="`, one for a `/QRY-21/` citation, and
one for a `runtime-defect` exclusion clause. None of the three inspects the
paragraph for anything about `match` or the `?` operator, and none is keyed to
"panic routing" as its own property.

## Evidence
tests/b0117-panic-namespace-scoping-gate.test.ts:393-407:
```ts
  it("cell E — the exception keeps panic routing, is not contained by `match` / `?` / `let _ =`, and is not on the runtime-defect surface", () => {
    const p = SPEC.headerParagraph;
    expect(
      p.includes("let _ ="),
      `cell E (ruling: the exception "is a panic in every other respect" — QRY-21 containment): ${ERROR_MODEL} line ${SPEC.headerLine} must state the panic is not contained by \`let _ =\` (QRY-21, ${"docs/spec_topics/query/query-escapes-stringification.md"} line 59).`,
    ).toBe(true);
    expect(
      /QRY-21/.test(p),
      `cell E (same clause): ${ERROR_MODEL} line ${SPEC.headerLine} must cite QRY-21 by req id, since that is the invariant the ThetaPanic subclassing exists to preserve.`,
    ).toBe(true);
    expect(
      /runtime-defect/i.test(p) && /\b(?:not|never|outside)\b/i.test(p),
      `cell E (ruling: the exception "is deliberate/registered and therefore NOT on the runtime-defect surface"): ${ERROR_MODEL} line ${SPEC.headerLine} must say so, because the exclusion clause at ${ERROR_MODEL} line 74 ("not one of the six closed-list sources above") otherwise classifies it as a runtime defect.`,
    ).toBe(true);
  });
```
Exact search within this file: `grep -in "match" tests/b0117-panic-namespace-scoping-gate.test.ts`
returns only import/identifier hits (`MatchError`, `.matchAll(`, the word
"matching" inside unrelated failure messages) plus this one test's own title;
no assertion anywhere in the file tests the paragraph for the word `match`, and
no assertion tests it for the `?` operator either (the only `?`-operator
cross-reference check, an `expressions.md#question-operator` link-fragment
test, lives in the file's separate "cell C", not in cell E).

## Why this is a problem
Every sibling cell in this file (A, B, C, D, F, G, H, I, J, K, L) has a title
whose clauses map one-to-one onto its `expect` calls — e.g. cell C's title
("cross-references QRY-18 and the `?` operator paragraph") is backed by two
regex checks for exactly those two cross-references. Cell E's title asserts
four distinct properties (keeps panic routing; not contained by `match`; not
contained by `?`; not contained by `let _ =`) plus a fifth (not on the
runtime-defect surface), but its three assertions test only a `let _ =`
substring, a `QRY-21` citation, and the runtime-defect exclusion. A reader
who takes the name at face value would expect this test to fail if the spec
paragraph, while otherwise unchanged, gained a sentence claiming the panic
IS caught by a `match` arm or swallowed by the `?` operator; mechanically, no
`expect` in the test body inspects the paragraph for either word, so no such
regression is detectable here — the paragraph could omit `match` and `?`
entirely, or state the opposite of what the title claims about them, and this
test would still pass on the `let _ =` and `runtime-defect` clauses alone.

## Suggested direction (non-binding, optional)
None offered beyond the observation above; the fix stage owns whether the
title is narrowed to what the three `expect` calls verify or the assertions
are extended to match the title's `match`/`?` claims.

## False-positive check
- Gate-pin check: this file matches `*gate*.test.ts`, but the carve-out
  concerns pinned counts and inventories (e.g. cells H and J's six/seven
  counts in this same file, which this finding does not touch); a test name
  overclaiming relative to its own assertions is a different property and is
  not shielded by that carve-out.
- Recording-double check: not applicable; no fake, double, or recording array
  is involved in cell E.
- docs/bugs/ signature search: `docs/bugs/0117-error-model-omits-parse-coded-interpolation-panic.md`
  Status is "fixed (0.256.0)"; the doc's own operator-ruling quote (reproduced
  at the top of the test file) states only "The namespace <-> list
  correspondence stays exact; code-registry-runtime.md line 7's matching prose
  stays true unmodified; the list is NOT widened to seven" — it does not
  itself require the spec paragraph to name `match` or `?`, so this is not a
  documented correct-reason justification for the gap between the title and
  the assertions. `npx vitest run tests/b0117-panic-namespace-scoping-gate.test.ts`
  passes (12/12) at HEAD, so this is not a red test.
- coverage-matrix / bug-doc citation search: `grep -n "cell E"
  docs/bugs/0117-error-model-omits-parse-coded-interpolation-panic.md
  docs/reference/coverage-matrix.md` → 0 hits; "cell E" is not pinned by name
  in either document. This finding proposes no merge, rename, or deletion of
  the test — only that its name and its assertions disagree — so no citation
  is disturbed.
- Coverage check: this finding does not claim `match`- or `?`-containment
  should be tested (that would be a coverage claim, out of scope for D7); it
  claims only that the EXISTING title, as worded, is not backed by the
  EXISTING assertions in this test.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — verified cell E's title claims 5 properties (panic routing; not contained by `match`/`?`/`let _ =`; not on runtime-defect surface) but its 3 asserts check only `let _ =`, QRY-21, and the runtime-defect exclusion; independent grep confirms no assertion anywhere in the file tests `match` or `?` containment or "panic routing," a genuine D7 misleading-name gap not shielded by the gate carve-out (which covers pinned counts, not title accuracy) (triage: claude-opus-5)
