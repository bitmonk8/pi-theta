---
id: PTQ-0762
title: b0303live/b0305live/b0306live each redeclare the composeCodesOf attribution-guard driver instead of sharing one
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/live/b0303live-imported-fn-private-sibling-live-cell.test.ts:131-151
  - tests/live/b0305live-imported-enum-alias-identity-live-cell.test.ts:121-141
  - tests/live/b0306live-imported-enum-wire-live-cell.test.ts:123-143
sites: 3
fix_scope: cross-module       # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 1
---

# b0303live/b0305live/b0306live each redeclare the composeCodesOf attribution-guard driver instead of sharing one

## Observation
tests/live/b0303live-imported-fn-private-sibling-live-cell.test.ts,
tests/live/b0305live-imported-enum-alias-identity-live-cell.test.ts and
tests/live/b0306live-imported-enum-wire-live-cell.test.ts each declare, module
scope, an identical `async function composeCodesOf(body)`: it parses the body
with `parseDoc` at the fixed path `/proj/attribution.theta`, asserts the
frontmatter parsed, builds a `FakeFileSystem` seeded with the file's own
`LIB_STEM`/`LIB_TEXT` closure at `/proj/${LIB_STEM}.thetalib`, assembles a
`ThetaCompositionInput` at the fixed `slashName: "attribution"`, drives the
real `checkThetaImports` seam over it, and returns the diagnostic codes. Each
file's own header comment calls this its "ATTRIBUTION GUARD driver" and each
names a DIFFERENT sibling file as the shape it "mirrors" (b0303's docstring
says "mirroring b0305's own driver"; b0305's says "mirroring b0306's own
driver"; b0306's says "mirroring b0138's own driver") — three files pointing
at each other as the origin of a body none of them imports from anywhere.
tests/live/b0138live-imported-fn-arg-refusal-live-cell.test.ts (outside this
wave's scope) carries a fourth byte-identical copy.

## Evidence

tests/live/b0303live-imported-fn-private-sibling-live-cell.test.ts:131-151:
```ts
async function composeCodesOf(body: string): Promise<readonly string[]> {
  const doc = parseDoc(body, "/proj/attribution.theta");
  expect(
    doc.frontmatter,
    "attribution precondition: the importing theta's frontmatter must parse",
  ).not.toBeNull();
  const fs = new FakeFileSystem({
    homedir: "/home",
    cwd: "/proj",
    files: { [`/proj/${LIB_STEM}.thetalib`]: LIB_TEXT },
    dirs: { "/proj": [`${LIB_STEM}.thetalib`] },
  });
  const input: ThetaCompositionInput = {
    slashName: "attribution",
    sourcePath: "/proj/attribution.theta",
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
  };
  const result = await checkThetaImports(input, { fs, parseDeps: parseDeps() });
  return result.diagnostics.map((d) => d.code);
}
```

tests/live/b0305live-imported-enum-alias-identity-live-cell.test.ts:121-141
and tests/live/b0306live-imported-enum-wire-live-cell.test.ts:123-143 are each
byte-identical to the excerpt above apart from the closed-over `LIB_STEM`/
`LIB_TEXT` values they reference (independently re-diffed immediately before
filing with the identifier-bearing lines stripped: zero output on the
remainder).

Exact search: `grep -rln "async function composeCodesOf" tests/live/*.test.ts`
→ 4 hits: tests/live/b0138live-imported-fn-arg-refusal-live-cell.test.ts,
tests/live/b0303live-imported-fn-private-sibling-live-cell.test.ts,
tests/live/b0305live-imported-enum-alias-identity-live-cell.test.ts,
tests/live/b0306live-imported-enum-wire-live-cell.test.ts; the three inside
this wave's scope are the three cited above. No tests/helpers/ module or
tests/live/harness.ts export named `composeCodesOf` exists (`grep -rn
"composeCodesOf" tests/helpers/*.ts tests/live/harness.ts` → 0 hits).

## Why this is a problem
This is the "Boilerplate duplication" class: an "attribution guard" driver
that parses an importing theta, seeds a `FakeFileSystem` from a
`LIB_STEM`/`LIB_TEXT` closure, and drives the real `checkThetaImports` seam
over it recurs byte-for-byte across (at least) four `tests/live/*.test.ts`
files in the same lib-importing family, each pointing at a different sibling
as its origin rather than at one shared declaration — evidence the sequence
was propagated by copying a neighbouring cell file rather than by importing a
common helper.

## Suggested direction (non-binding, optional)
The parameterisable pieces are exactly `LIB_STEM`/`LIB_TEXT`/the importing
body; a small helper taking those as arguments (alongside
`tests/helpers/thetalib-load-harness.ts`'s existing `fakeThetaLibFs`/
`loadThetaLibDiags`, which solve an adjacent but not identical problem for
offline unit tests) is the shape each file's own copy could reduce to.

## False-positive check
- Gate-pin check: none of the three files matches `*gate*.test.ts` or the
  named kin; `composeCodesOf` is a load-diagnostic driver, not a pinned count
  or inventory assertion.
- Recording-double check: `composeCodesOf` is a stateless driver (it returns
  the diagnostic codes from one `checkThetaImports` call); it records no
  calls and backs no "never called" witness, so the negative-witness
  carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0303-imported-fn-body-resolves-in-caller-scope.md,
  docs/bugs/0305-enum-identity-minted-from-alias.md and
  docs/bugs/0306-imported-enum-drops-explicit-wire-values.md all read
  "Status: fixed"; none names `composeCodesOf`.
- coverage-matrix/bug-doc citation search: `grep -n "b0303live\|b0305live\|b0306live" docs/reference/coverage-matrix.md`
  → 0 hits; no citing document pins this helper's name or location, and this
  finding proposes no merge, rename or deletion of any test or `it()`/
  `describe()` — only that the driver could be shared rather than redeclared.
- Coverage check: the claim is about a repeated driver DEFINITION, not a
  missing test path; each file's `composeCodesOf` is exercised by its own
  test's attribution-guard assertion.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: the excerpt reproduces at b0303live:131-151, b0305live:121-141 and b0306live:123-143; awk-extracted `composeCodesOf` bodies (21 lines each) from all four files incl. b0138live diff byte-identical; `async function composeCodesOf` greps to exactly those 4 tests/live files and to nothing in tests/helpers/, tests/live/harness.ts, src/, extensions/ or tools/; the three docstrings cite b0305/b0306/b0138 respectively as the mirrored origin; D7 boilerplate-duplication class in tests/ with no carve-out engaged (no *gate* file, stateless driver not a recording double, bugs 0303/0305/0306 all Status: fixed and none names the helper, 0 coverage-matrix citations, no test merge/rename/delete proposed); not a duplicate — PTQ-0310/PTQ-0315 cover the offline tests/b030x-*.test.ts unit copies (fakeThetaLibFs / materialise-then-execute harness), PTQ-0232/PTQ-0347 cover b0333-b0335/b0361, none cites the tests/live/*live-cell composeCodesOf driver (triage: claude-fable-5-1)

## Fix attempts
- qw20260918155535: skipped — [PTQ-0480-live-host-precondition-guard-duplicated.md] PTQ-0480: Centralized all 41 empty-model guards in requireLiveHost; added offline regression coverage. Exact gate passed: 687 files, 11,569 tests. / PTQ-0553: Reused the shared filesystem helper at all three sites, preserving EACCES behavior and the integrated own-property check. Retry conflict avoided: recording-system-note-channel.ts untouched. / PTQ-0554: Replaced all three filesystem copies with shared-helper imports; existing tests and assertions unchanged. / PTQ-0758: Removed both filesystem copies and shared the identical importCheckCodes driver, retaining its assertion. All nine targeted live tests across eight files passed. No existing tests were deleted. || [PTQ-0486-parseerrorcodes-helper-octuplicated-live-acceptance.md] PTQ-0486: Replaced all eight local readers with the existing errorCodes helper; attribution assertions remain unchanged. / PTQ-0552: Reused the already-integrated FAIL_CLOSED_MARKERS export at all three sites. Left recording-system-note-channel.ts untouched, addressing the retry conflict. / PTQ-0618: Consolidated all three readers into registry-oracle.ts, preserving every template assertion. Kept the LPA import at the removed declaration’s location to preserve the citation gate. / PTQ-0619: Shared the fixture builder and registration-refusal scaffold across all three cells, retaining extra controls and failure messages. No tests were renamed or deleted. Verification for all four issues: exact gate passed (687 files, 11,569 tests); all 17 targeted live witnesses passed. ||
