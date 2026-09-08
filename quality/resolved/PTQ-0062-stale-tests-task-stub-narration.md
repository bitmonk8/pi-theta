---
id: PTQ-0062
title: Five modules still carry present-tense "tests-task stubs this function" narration although the paired implementations replaced the stubs
lens: D2                     # the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/discovery/settings.ts:77-78
  - src/discovery/settings.ts:356-358
  - src/discovery/settings.ts:13-16
  - src/discovery/discovery-walk.ts:11-16
  - src/discovery/package-discovery.ts:20-25
  - src/diagnostics/placeholder.ts:12-16
  - src/extension/drain-state.ts:9-11
sites: 7                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# Five modules still carry present-tense "tests-task stubs this function" narration although the paired implementations replaced the stubs

## Observation
These modules were built with a tests-task/implementation-task split: the
tests task landed stub bodies and comments describing them; the paired
implementation later filled the bodies in. The stub-phase comments were not
removed. Two of them make flatly false claims about the function they sit on
("returns an empty object", "returns an empty settings view and no
diagnostics"); the module headers state in present tense that the module
"stubs" its behavior-bearing functions with inert results. All the named
functions are fully implemented today.

## Evidence
src/discovery/settings.ts:77-78 — on `mergeSettings`, whose body (:80-95) is
the full recursive merge:
```ts
 * V10c-T stub: returns an empty object so the merge tests red on their own
 * assertions; V10c implements the recursive merge.
```

src/discovery/settings.ts:356-358 — on `loadSettings`, whose body (:360-408)
reads both files, validates, and merges:
```ts
 * V10c-T stub: returns an empty settings view and no diagnostics so the
 * file-read / validation / merge tests red on their own assertions; V10c
 * implements the reads, validation, and merge.
```

src/discovery/settings.ts:13-16 — module header:
```ts
// V10c-T (tests-task) declares the seam shape and stubs the two behaviour-
// bearing functions with inert, empty results so the failing tests compile and
// red on their own primary assertions (no diagnostics emitted, no merged keys
// produced). The paired V10c implementation leaf fills these in.
```

src/discovery/discovery-walk.ts:11-13 — `discoverThetas` (:1155) is the full
five-source walk:
```ts
// V10a-T (tests-task) declares the seam shape and stubs `discoverThetas` with an
// inert result (no thetas, no diagnostics) so the failing tests compile and red
// on their own primary assertions — the discovery walk is absent, not throwing.
```

src/discovery/package-discovery.ts:20-22 — `discoverPackageThetas` (:664) is
the full bounded walk:
```ts
// V10b-T (tests-task) declares the seam shape and stubs `discoverPackageThetas`
// with an inert result (no thetas, no diagnostics) so the failing tests compile
// and red on their own primary assertions — the walk is absent, not throwing.
```

src/diagnostics/placeholder.ts:12-16 — every renderer in the file is
implemented; none returns the empty string:
```ts
// V7c-T (tests-task) declares this seam and stubs the per-category renderers so
// the failing tests compile and red on their own primary assertions. The paired
// V7c implementation leaf fills these in. Each stub returns a benign wrong value
// (the empty string) so the byte-identical vector assertion reds for the
// intended reason (implementation absent), never on a thrown harness error.
```

src/extension/drain-state.ts:9-11 — every function in the file is implemented:
```ts
// V9m-T (tests-task) declares these seams and stubs the behaviour-bearing
// functions so the failing tests compile and red on their own primary
// assertions; the paired V9m implementation fills them in.
```

## Why this is a problem
Historical narration / leftover scaffolding, with the landing of the
replacing feature shown: each comment describes the tests-task stub phase in
the present tense, and the implementation that retired that phase sits in the
same file, directly below the comment (function declarations cited per site
above). The two settings.ts function-level comments are actively false — a
reader of `mergeSettings`'s contract block is told the function "returns an
empty object" when the body eight lines down performs the recursive merge.
The five headers all assert "stubs ... with an inert result / benign wrong
value" about code that has no stub left. This is scaffolding-era prose whose
feature (the paired V-leaf implementation) has landed, retained verbatim.

## Suggested direction (non-binding, optional)
Delete the stub-phase sentences (or recast them into past-tense provenance
where the V-leaf pairing is worth keeping), so no doc comment asserts a stub
behavior the code no longer has.

## False-positive check
Verified each named function is implemented, not stubbed: `mergeSettings`
(settings.ts:80-95, recursive merge), `loadSettings` (settings.ts:360-408,
reads + validation + merge), `discoverThetas` (discovery-walk.ts:1155-1307,
full walk), `discoverPackageThetas` (package-discovery.ts:664-758, full
bounded walk), the placeholder renderers (placeholder.ts:39-383, none returns
`""` as a stub value), and the drain-state functions
(drain-state.ts:26-146, all implemented). Searched `stub` case-insensitively
across all ten in-scope files — the seven cited comment sites are the
complete hit set; no stub code remains behind any of them. Confirmed this is
not a spec-mandated text: the comments describe increment mechanics
(V*-T/V* pairing), not diagnostic bytes or contract wording. One root cause:
stub-phase narration retained after the paired implementation replaced the
stub bodies.

## Triage
verdict: confirmed — all 7 excerpts byte-match at the cited lines and every named function is implemented (mergeSettings:80-93 recursive merge, loadSettings:360-405 reads+validate+merge, discoverThetas:1155 full walk, discoverPackageThetas:664 bounded walk with cap/timeout, drain-state 28-154 all six functions, placeholder.ts has zero `return ""`), my own `grep -ni stub` over the five files reproduces exactly 8 hits at those 7 comment sites with no stub code behind any of them, and blame proves the scaffolding anchor: each block was written in its `*-T` tests-task commit (e5e5f216, 7619ca38, 2ea35258, e7cee8a9, 5af22b2f) and left untouched when the paired implementation landed (ac37f0cb V10c, 070a1ef3 V10a, 1d9be00e V10b, 26059e2b V7c, c1f11bbe V9m), while four sibling modules (terminal-outcomes.ts:17, bindings.ts:25, schema-declarations.ts:27, query-error.ts:20) carry the past-tense landed-pair form, so this is leftover narration and not house style or spec-mandated text; historical narration comments are named in the D2 brief, and no sibling covers these files (d2-01 = binder/* + diagnostic.ts, d2-05 = runtime/*, d2-08 = inventory-closure-audit/load-pre-eval, and the 183353 filings explicitly defer discovery/, placeholder.ts and drain-state.ts to this one) (triage: claude-opus-5)
