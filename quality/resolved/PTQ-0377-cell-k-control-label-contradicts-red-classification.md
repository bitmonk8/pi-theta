---
id: PTQ-0377
title: b0380's cell (K) is titled CONTROL though the file's own overview and the bug doc classify it as a RED witness alongside A/B/C/J
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0380-params-key-not-identifier.test.ts:16-20
  - tests/b0380-params-key-not-identifier.test.ts:213-221
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260916045442
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-16
---

# b0380's cell (K) is titled CONTROL though the file's own overview and the bug doc classify it as a RED witness alongside A/B/C/J

## Observation
tests/b0380-params-key-not-identifier.test.ts's file-level overview comment states which lettered cells are RED-at-fork defect witnesses and which are "Controls": "cells A/B/C/J/K are RED at this fork ... Controls D/E/F/G/H and the break-free render seams (I) are GREEN". Cell (K)'s own `it()` title nonetheless begins "(K) CONTROL escape-form ...", the only cell in the RED group (A/B/C/J/K) whose title carries the word "CONTROL" — a word this same file uses, in every one of D/E/F/G/H's titles, to mean "a behaviour the fix must leave untouched, green at the fork." Cell (K)'s body asserts the same shape as the RED cells (that the offending key draws the new refusal `CODE`), not the "stays clean / keeps an existing, different disposition" shape every one of D/E/F/G/H's bodies asserts.

## Evidence
tests/b0380-params-key-not-identifier.test.ts:16-20 — the file's own RED/Controls classification, naming K among the RED cells and restricting "Controls" to D/E/F/G/H:
```ts
// These tests encode the SPECIFIED post-fix behaviour, so cells A/B/C/J/K are
// RED at this fork (0380 is open): the offending keys currently load with an
// empty diagnostic array / zero error-severity diagnostics — the doc's exact
// symptom. Controls D/E/F/G/H and the break-free render seams (I) are GREEN and
// pin the surfaces the fix must leave byte-untouched.
```

tests/b0380-params-key-not-identifier.test.ts:213-221 — cell (K) in full: the title labels it "CONTROL", the title's own tail says "RED at fork", the body comment says "RED at fork", and the assertion checks for the new refusal code rather than an untouched/preserved disposition:
```ts
  it("(K) CONTROL escape-form `\"a\\nb\"` (backslash-n escape): a non-identifier key the fix refuses — RED at fork (loads with `[]`)", () => {
    // WHY: documents the doc-Reproduction imprecision. The doc claims this
    // double-quoted ESCAPE yields `theta/load/malformed-frontmatter-yaml`;
    // VERIFIED FALSE — at this fork it loads clean with the non-identifier
    // wireName `a\nb`. Under Option A the cooked key is non-identifier-shaped,
    // so the fix refuses it with CODE. The physical-break spelling that
    // actually yields the yaml-lib refusal is cell G.
    expect(codesOf(doc('  "a\\nb": string'))).toEqual([CODE]);
  });
```
Compare cell (G), an actual Control, whose own title carries no RED claim and whose assertion checks that an EXISTING, unrelated code stays untouched (tests/b0380-params-key-not-identifier.test.ts:131, :150): `` it("(G) CONTROL dqRealBreak (real physical break inside double quotes): the yaml-lib refusal is untouched — my fix produces no field here", ...) `` asserting `expect(codesOf(dqRealBreak)).toEqual(["theta/load/malformed-frontmatter-yaml"]);` — a different, pre-existing code, not `CODE`. Cell (K)'s assertion, by contrast, asserts `.toEqual([CODE])` — the exact new-refusal shape cells (A), (B) and (K) share (tests/b0380-params-key-not-identifier.test.ts:94-107), not the "different, pre-existing disposition" shape (D)/(E)/(F)/(G)/(H) share.

Exact search confirming (K) is the only RED-group cell whose title contains "CONTROL": `grep -n 'it("(A)\|it("(B)\|it("(C)\|it("(J)\|it("(K)' tests/b0380-params-key-not-identifier.test.ts` → 5 hits; only the (K) line contains the substring "CONTROL".

External corroboration — docs/bugs/0380-nonidentifier-params-key-registers-and-forges-binder-prompt-and-echo.md:247 independently refers to this same cell as a witness for the refusal, not as a preserved-behaviour control:
```md
  3. Doc imprecision in §Reproduction: it attributes `theta/load/malformed-frontmatter-yaml` to the double-quoted \n-escape spelling of a break-carrying key; verified FALSE at this fork — the escape form loads clean (a non-identifier key the fix now refuses, witness cell K); only a REAL physical break in double quotes yields the yaml-lib refusal (witness cell G uses that spelling). The §Reproduction control line is inaccurate on this point; the fix and every other claim reproduce exactly.
```

## Why this is a problem
This file establishes its own vocabulary in its header (lines 16-20): "RED" cells witness the defect the fix corrects, "Controls" pin behaviour the fix must leave untouched. Every other use of the word "CONTROL" in this file's titles (D, E, F, G, H) matches that vocabulary exactly — each asserts a disposition the fix does not change. Cell (K)'s title borrows the same word while its own tail ("RED at fork"), its own body comment ("documents the doc-Reproduction imprecision", "VERIFIED FALSE ... it loads clean", "the fix refuses it with CODE"), its assertion (the new-code shape, matching A/B/J, not the preserved-disposition shape of D/E/F/G/H), the file's own header classification, and the bug doc's own independent "witness cell K" phrasing all agree K is a RED witness, not a Control. A reader scanning this file's cell titles for "which cells pin behaviour the fix must not touch" — the file's own definition of "CONTROL" — would read (K) as a sixth such invariant and misread its pass as evidence that behaviour is unchanged by the fix, when the cell's own body and every other authority in this file and its bug doc instead treat it as evidence that the fix's NEW refusal fires on one more input spelling.

## Suggested direction (non-binding, optional)
The file's own header sentence at lines 16-20 already gives this cell its correct classification ("cells A/B/C/J/K are RED"); the word "CONTROL" is the one place cell (K)'s own title diverges from that sentence.

## False-positive check
- Gate-pin check: tests/b0380-params-key-not-identifier.test.ts does not match `*gate*.test.ts` or the named kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate, committed-fixture-parse-gate, registry-closed-set-corpus-gate); cell (K) asserts a diagnostic-code list, not a pinned census count or inventory.
- Recording-double check: cell (K) asserts directly on `parseDoc(...).diagnostics` via `codesOf`; it is not a recording double and backs no "never called" witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0380-nonidentifier-params-key-registers-and-forges-binder-prompt-and-echo.md — Status "fixed (0.358.0)". `npx vitest run tests/b0380-params-key-not-identifier.test.ts` → 12 passed (12) at HEAD, so cell (K) is not a documented correct-reason red; this finding is about the word "CONTROL" in its title, independent of its current pass/fail state (the "RED at fork" language in the title/comment describes the pre-fix commit, the same historical-fork convention used throughout this file and its siblings, and is consistent with the file's own overview — only the word "CONTROL" conflicts with it).
- coverage-matrix/bug-doc citation search: `grep -n "b0380" docs/reference/coverage-matrix.md` → 0 hits. docs/bugs/0380-...md:233 cites the whole file ("offline witness (12 cells)") and :247 names "witness cell K" specifically (quoted above) — both citations characterise K as a refusal witness, matching this finding's claim rather than conflicting with it; this finding proposes no merge, rename, or deletion of cell (K) or any other cell, only that its title's word "CONTROL" does not match its own file's and its own bug doc's classification of it.
- Prior-finding overlap check: `grep -rl "cell K\|escape-form\|CONTROL escape" quality/issues quality/resolved quality/intake` → no hits. The given "already-filed"/resolved list's PTQ-0246 (b0380-render-cell-name-mismatch, in quality/resolved/) covers a disjoint pair of cells — "(I-break-carrying)" and "(J)" at lines 184-208 — verified already fixed in the current file (that cell's title and body no longer claim to exercise `renderBinderParamLine`/`renderArgumentEcho`); it does not mention cell (K) or the word "CONTROL", so this is a new, non-duplicate root cause in the same file.
- Coverage-drift check: this finding is about an existing, passing test's own title conflicting with its own file's stated cell classification and its own bug doc's characterisation of it; it does not claim any behaviour or path is untested.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — verified verbatim: header (16-20) restricts CONTROL to D/E/F/G/H and lists K as RED, cell K's own title still reads "(K) CONTROL ... RED at fork" with a `.toEqual([CODE])` assertion matching RED siblings A/B (94-102) not Control G's distinct-code shape (131/148), and bug doc:247 independently calls it "witness cell K" for the refusal; not a duplicate of resolved PTQ-0246 (disjoint cells I/J) (triage: claude-opus-5)
