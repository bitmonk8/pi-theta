---
id: PTQ-1473
title: generic-argument-literal-lowering.test.ts re-implements canonical-slug-oracle's slugOfCanonicalForm/inlineDefName inline despite already importing that module
lens: D7
status: open
verdict: confirmed
locations:
  - tests/generic-argument-literal-lowering.test.ts:11
  - tests/generic-argument-literal-lowering.test.ts:322-330
  - tests/helpers/canonical-slug-oracle.ts:8-15
sites: 1
fix_scope: localized
wave: qw20260923145222
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# generic-argument-literal-lowering.test.ts re-implements canonical-slug-oracle's slugOfCanonicalForm/inlineDefName inline despite already importing that module

## Observation
`tests/helpers/canonical-slug-oracle.ts` exports `slugOfCanonicalForm(canonical)`
and `inlineDefName(canonical)` as the independent, non-SUT oracle for the
`__inline_<slug>` naming scheme this file's own header describes ("THE SLUG
ORACLE IS INDEPENDENT"). `tests/generic-argument-literal-lowering.test.ts`
already imports `keyOrderOf` from that exact module on line 11, but instead of
also importing `slugOfCanonicalForm`/`inlineDefName`, it imports `createHash`
directly and locally re-declares module-scope functions `slugOfBytes` and
`inlineDefName` that perform the identical two-step computation.

## Evidence
`tests/helpers/canonical-slug-oracle.ts:8-15` (re-read immediately before filing):
```ts
/** SHA-256 of the canonical-form bytes, first 16 lowercase hex characters. */
export function slugOfCanonicalForm(canonical: string): string {
  return createHash("sha256").update(canonical, "utf8").digest("hex").slice(0, 16);
}

/** The synthesised `$defs` key for a fragment given its canonical form (:73). */
export function inlineDefName(canonical: string): string {
  return `__inline_${slugOfCanonicalForm(canonical)}`;
}
```

`tests/generic-argument-literal-lowering.test.ts:11` — the import line that
already reaches into the same module, omitting the two functions above:
```ts
import { keyOrderOf } from "./helpers/canonical-slug-oracle";
```

`tests/generic-argument-literal-lowering.test.ts:322-330` — the local
re-declaration, byte-identical in behaviour to the canonical pair above
(only the parameter/function names differ: `bytes` vs `canonical`,
`slugOfBytes` vs `slugOfCanonicalForm`):
```ts
/** SHA-256 of the given bytes, first 16 lowercase hex characters (:106, :107). */
function slugOfBytes(bytes: string): string {
  return createHash("sha256").update(bytes, "utf8").digest("hex").slice(0, 16);
}

/** The synthesised `$defs` key for a fragment given its canonical form (:73, :108). */
function inlineDefName(canonical: string): string {
  return `__inline_${slugOfBytes(canonical)}`;
}
```

`slugOfBytes`/local `inlineDefName` are then used at lines 346, 361, 376 (to
build `M_ARRAY_XY_INLINE`, `M_ARRAY_X_INLINE`, `M_ARRAY_STRING_INLINE`) and at
lines 1345 and 1358 (inline in the `g`-group `it()` titles and the
`__theta_respond_${slugOfBytes(canonicalBytes)}` expectation).

## Why this is a problem
The file's own header states the slug oracle must be independent of the
implementation under test and hand-written, which is exactly what
`tests/helpers/canonical-slug-oracle.ts` was extracted to provide once, for
every file needing this exact SHA-256-truncation-and-`__inline_` formula. This
file already imports a sibling export (`keyOrderOf`) from that same module,
so the two-function computation living in this file instead is a copy of
logic that has a canonical, already-in-scope home rather than an oracle this
file needed to invent for itself.

## Suggested direction (non-binding, optional)
Importing `slugOfCanonicalForm` and `inlineDefName` from
`./helpers/canonical-slug-oracle` alongside the existing `keyOrderOf` import
would let the local declarations at lines 322-330 be dropped, with call sites
renaming `slugOfBytes` to `slugOfCanonicalForm`.

## False-positive check
- Gate-pin carve-out: file is not named `*gate*.test.ts` and does not match
  the census/pin family; N/A.
- Recording-double carve-out: neither function is a recording double or
  negative witness; N/A.
- docs/bugs/ signature search: `grep -rn "slugOfBytes\|inlineDefName"
  docs/bugs/` returns no hits — this is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -rn
  "generic-argument-literal-lowering" docs/reference/coverage-matrix.md
  docs/bugs/*.md` found no citation of this test file by name; the finding
  proposes no merge/rename/delete of any named-cited test, only an import
  substitution for two private helper functions.
- Confirmed the claim is D7 (copy-paste fixture where a canonical helper
  already exists and is already partially imported in the same file), not a
  coverage gap: no assertion about what should be tested, only about
  duplicated helper code that exists today.
- Checked prior filings: `grep -rl "slugOfBytes\|inlineDefName" quality/`
  shows this exact file/function pair has not previously been filed (matches
  found are for other test files: PTQ-0410, PTQ-0665, PTQ-0793, PTQ-0794,
  PTQ-0874, PTQ-1027, PTQ-1352, PTQ-1386, PTQ-1388 — none cite
  `generic-argument-literal-lowering.test.ts`).

## Triage
verdict: confirmed — independently re-verified: generic-argument-literal-lowering.test.ts:322-330 reproduces verbatim (`slugOfBytes` = `createHash("sha256").update(bytes,"utf8").digest("hex").slice(0,16)`, local `inlineDefName` = `__inline_${slugOfBytes(...)}`), byte-identical in behaviour to tests/helpers/canonical-slug-oracle.ts:8-15's exported `slugOfCanonicalForm`/`inlineDefName`; line 11 already imports `keyOrderOf` from that module (the PTQ-1086 fix) and line 2's `createHash` import has no other use in the file (only :324); the pair is live at :346/:361/:376 and :1345/:1358 as the filing states; searches re-run — `slugOfBytes|inlineDefName` in docs/bugs 0 hits, coverage-matrix 0 hits for the file, bug 0099/0164/0204/0235/0236/0281/0282 cite the file's cells by name but the fix substitutes an import and renames no it()/describe(), so no witness carve-out applies; both locations under tests/, D7 copy-paste-helper class with the identical fix-shape confirmed in PTQ-0665/0794/0874 (resolved) and PTQ-1352/1386 (open); not a duplicate — every prior slug-oracle filing cites a different test file, PTQ-1086 on this file covered only `keyOrderOf` (now fixed), and same-wave d7-02 covers a disjoint readAt/fragmentOf harness; sites: 1 is scope-honest (triage: claude-fable-5-1)
