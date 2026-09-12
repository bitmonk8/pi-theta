---
id: PTQ-0246
title: b0380's "(I-break-carrying)" cell names render-seam unreachability but its body only repeats cell (J)'s diagnostic-code check
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/b0380-params-key-not-identifier.test.ts:184-195
  - tests/b0380-params-key-not-identifier.test.ts:197-208
sites: 1
fix_scope: localized
wave: qw20260912112713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# b0380's "(I-break-carrying)" cell names render-seam unreachability but its body only repeats cell (J)'s diagnostic-code check

## Observation
`tests/b0380-params-key-not-identifier.test.ts` has a cell titled `(I-break-free)` (lines 157-182) that actually drives `renderBinderParamLine` and `renderArgumentEcho` and asserts their output. The next cell, titled `(I-break-carrying)` (lines 184-195), names the same two functions in its title and body comment ("never reaches `renderBinderParamLine` or `renderArgumentEcho` at all — the seams are unreachable-at-render") but never calls either function. Its only two lines of executable code recompute `errors(parseDoc(carrierBreak).diagnostics)` and assert the mapped `.code` array `toContain(CODE)` — the identical expression and assertion already present, two cells later, in `(J) REGISTRATION OUTCOME` (lines 197-208).

## Evidence
tests/b0380-params-key-not-identifier.test.ts:184-195
```ts
  it("(I-break-carrying) the break-carrying key is unreachable-at-render because the refusal is the covering — RED at fork", () => {
    // The refusal IS the covering. Because parseDoc(carrierBreak) raises an
    // error-severity CODE, the theta does not register (the parseFrontmatter
    // contract, src/parser/frontmatter.ts:1109 "The theta registers iff no
    // error-severity diagnostic was raised"), so the break-carrying wireName
    // never reaches renderBinderParamLine or renderArgumentEcho at all — the
    // seams are unreachable-at-render, not normalised. RED at fork: no
    // error-severity CODE is raised yet, so the theta DOES register and the
    // break-carrying wireName reaches both seams (the 0380 defect).
    const carrierErrors = errors(parseDoc(carrierBreak).diagnostics);
    expect(carrierErrors.map((d) => d.code)).toContain(CODE);
  });
```

tests/b0380-params-key-not-identifier.test.ts:197-208
```ts
  it("(J) REGISTRATION OUTCOME: carrierBreak has ≥1 error-severity diagnostic (registers nothing); identKey has zero (registers)", () => {
    // parseFrontmatter doc (src/parser/frontmatter.ts:1109): "The theta
    // registers iff no error-severity diagnostic was raised." Error-severity
    // count is therefore the offline registration proxy.
    const carrierErr = errors(parseDoc(carrierBreak).diagnostics);
    // RED at fork: currently zero error-severity diagnostics — registers.
    expect(carrierErr.length).toBeGreaterThanOrEqual(1);
    expect(carrierErr.map((d) => d.code)).toContain(CODE);

    const identErr = errors(parseDoc(doc("  topic: string")).diagnostics);
    expect(identErr.length).toBe(0);
  });
```
Both cells compute the exact same source expression, `errors(parseDoc(carrierBreak).diagnostics)`, map it to `.code`, and assert `toContain(CODE)` — `(I-break-carrying)`'s entire assertion is a byte-for-byte subset of `(J)`'s. Neither `renderBinderParamLine` nor `renderArgumentEcho` (both imported at lines 35-36 and both called by the preceding `(I-break-free)` cell at lines 162-179) is referenced anywhere inside `(I-break-carrying)`'s body — only in its title and comment.

## Why this is a problem
The test's own title and in-body comment assert a claim about a different observable than what the assertion checks: that the two named render functions are made unreachable for the break-carrying wireName. The body never drives either function (contrast the immediately preceding `(I-break-free)` cell, which does), and the one fact the body does establish — that `errors(parseDoc(carrierBreak).diagnostics)` contains `CODE` — is already established, under an accurate name, by cell `(J)` immediately below. A reader scanning cell names for where the render-seam reachability of a break-carrying field name is pinned would read `(I-break-carrying)` as that witness (its title and comment name both functions explicitly), and would misread a pass here as evidence the renderers were exercised (or shown unreachable) with the break-carrying `wireName`; in fact no such exercise happens in this cell, and the render-unreachability claim rests entirely on an uninvoked, cited contract (`src/parser/frontmatter.ts:1109`) rather than on anything this cell's own execution demonstrates.

## Suggested direction (non-binding, optional)
Cell `(J)` is the cell that already, and accurately, names what this assertion computes ("REGISTRATION OUTCOME"); aligning `(I-break-carrying)`'s name with what its body actually checks, or folding its one assertion into `(J)` since the two are now duplicates, is a direction — not a design this finding prescribes.

## False-positive check
- Gate-pin check: the file is not `*gate*.test.ts` and is not in the named gate family (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate, committed-fixture-parse-gate, registry-closed-set-corpus-gate); the carve-out does not apply.
- Recording-double check: neither cell asserts on a recording double's call log (a MUST-NOT witness); both assert directly on `parseDoc(...).diagnostics`, so the recording-double carve-out does not apply.
- docs/bugs/ signature search: `docs/bugs/0380-nonidentifier-params-key-registers-and-forges-binder-prompt-and-echo.md:233` names the whole test file as an "offline witness (12 cells)" and separately says "the break-carrying key is unreachable-at-render because load refuses" — the same framing as the cell's title/comment — but cites the FILE, not this specific cell title, as a witness, and nothing in the doc marks any cell of this file as a documented correct-reason red. Running `npx vitest run tests/b0380-params-key-not-identifier.test.ts` confirms all 12 cells currently pass, so this is not a red/disabled test the "Expect documented correct-reason reds" carve-out would shield.
- coverage-matrix/bug-doc citation search: `grep -rn "b0380-params-key-not-identifier" docs/` finds only the whole-file citation in the bug doc above; `grep -n "0380" docs/reference/coverage-matrix.md` returns no hits. No document pins the individual cell title `(I-break-carrying)` as a named witness, and this finding proposes no merge/rename/delete of the file — only an observation about one cell's name-body mismatch — so no citation obligation is triggered.
- Coverage drift check: the observation is confined to what the existing cell's body verifies versus what its name claims; it does not assert that a new test should exist or that any behaviour is untested, so it does not drift into coverage territory.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — verified verbatim at both cited ranges (184-195, 197-208) and the imports (35-36)/I-break-free call sites (162-179): I-break-carrying's only executable lines duplicate J's `errors(parseDoc(carrierBreak).diagnostics)` → `.map(d=>d.code)).toContain(CODE)` check and never call renderBinderParamLine/renderArgumentEcho despite naming both in title and comment; docs/bugs/0380:233 cites only the whole file (12/12 passing, reproduced) and coverage-matrix.md has 0 hits for "0380", so no per-cell witness pin shields the mismatch — a genuine misleading-name D7 finding, same pattern as confirmed PTQ-0235 (triage: claude-opus-5)
