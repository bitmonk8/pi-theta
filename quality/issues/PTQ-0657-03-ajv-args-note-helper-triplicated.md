---
id: PTQ-0657
title: The EM_DASH/AJV_SUMMARY_SEPARATOR/AJV_ARGS_PHRASE constants and ajvArgsNote() are redeclared byte-for-byte in three binder/params test files
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/params-default-enum-access-merge.test.ts:193-208
  - tests/binder-post-merge-ajv-enforcement.test.ts:168-180
  - tests/params-default-unresolvable-enum-variant.test.ts:296-306
sites: 3
fix_scope: cross-module       # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 1
---

# The EM_DASH/AJV_SUMMARY_SEPARATOR/AJV_ARGS_PHRASE constants and ajvArgsNote() are redeclared byte-for-byte in three binder/params test files

## Observation
tests/params-default-enum-access-merge.test.ts declares module-scope
constants `EM_DASH` (`"\u2014"`), `AJV_SUMMARY_SEPARATOR` (`"; "`) and
`AJV_ARGS_PHRASE` (`"argument binding produced invalid args"`), plus a
`function ajvArgsNote(thetaName, ajvSummary)` that renders
`` `theta /${thetaName}: ${AJV_ARGS_PHRASE} ${EM_DASH} ${ajvSummary}` ``. The
same three constants (identical names, identical literal values, identical
one-line doc comments) and the identical `ajvArgsNote` function body recur in
tests/binder-post-merge-ajv-enforcement.test.ts and
tests/params-default-unresolvable-enum-variant.test.ts. No file under
tests/helpers/ exports any of these four names.

## Evidence

tests/params-default-enum-access-merge.test.ts:193-208 (re-read immediately before filing):
```ts
/** The rule-3 prefix/suffix separator of `renderFailureNote` (U+2014 EM DASH). */
const EM_DASH = "\u2014";

/** The echo's elided-value marker and the rule-2 truncation marker (U+2026). */
const ELLIPSIS = "\u2026";

/** The two-character `<ajv-summary>` inter-issue separator (`renderAjvSummary`). */
const AJV_SUMMARY_SEPARATOR = "; ";

/** The AJV-on-`args` row's fixed phrase (determinism-cancellation-failure.md:52). */
const AJV_ARGS_PHRASE = "argument binding produced invalid args";

/** The AJV-on-`args` note for one theta and one rendered `<ajv-summary>`. */
function ajvArgsNote(thetaName: string, ajvSummary: string): string {
  return `theta /${thetaName}: ${AJV_ARGS_PHRASE} ${EM_DASH} ${ajvSummary}`;
}
```

tests/binder-post-merge-ajv-enforcement.test.ts:168-180 (identical constants and function, `ELLIPSIS` absent here):
```ts
/** The rule-3 prefix/suffix separator of `renderFailureNote` (U+2014 EM DASH). */
const EM_DASH = "\u2014";

/** The two-character `<ajv-summary>` inter-issue separator (`renderAjvSummary`). */
const AJV_SUMMARY_SEPARATOR = "; ";

/** The AJV-on-`args` row's fixed phrase (determinism-cancellation-failure.md:52). */
const AJV_ARGS_PHRASE = "argument binding produced invalid args";

/** The AJV-on-`args` note for one theta and one rendered `<ajv-summary>`. */
function ajvArgsNote(thetaName: string, ajvSummary: string): string {
  return `theta /${thetaName}: ${AJV_ARGS_PHRASE} ${EM_DASH} ${ajvSummary}`;
}
```

tests/params-default-unresolvable-enum-variant.test.ts:296-306 (`EM_DASH`,
`AJV_ARGS_PHRASE` and `ajvArgsNote` identical; this file has no
`AJV_SUMMARY_SEPARATOR` constant of its own):
```ts
/** The rule-3 prefix/suffix separator of `renderFailureNote` (U+2014 EM DASH). */
const EM_DASH = "\u2014";

/** The AJV-on-`args` row's fixed phrase (determinism-cancellation-failure.md:52). */
const AJV_ARGS_PHRASE = "argument binding produced invalid args";

/** The AJV-on-`args` note for one theta and one rendered `<ajv-summary>`. */
function ajvArgsNote(thetaName: string, ajvSummary: string): string {
  return `theta /${thetaName}: ${AJV_ARGS_PHRASE} ${EM_DASH} ${ajvSummary}`;
}
```

Search: `grep -rln "const AJV_ARGS_PHRASE = \"argument binding produced invalid args\"" tests/*.test.ts`
returns exactly these three files. `grep -c "function ajvArgsNote"` returns
exactly 1 in each of the three. `grep -rl "ajvArgsNote\|AJV_ARGS_PHRASE"
tests/helpers/*.ts` returns no files.

## Why this is a problem
Three files construct the identical AJV-on-`args` failure-note string
through an identically-named, identically-bodied helper and an identically-valued
constant trio, with the doc comments themselves copied verbatim rather than
independently authored. This is duplication with every copy cited above; no
helper module under tests/helpers/ currently holds any of these four names,
so each of the three files is the sole owner of its own copy of a string
format that all three assert against as their expected AJV-refusal row.

## Suggested direction (non-binding, optional)
A shared home for the `EM_DASH` / `AJV_SUMMARY_SEPARATOR` / `AJV_ARGS_PHRASE`
constants and `ajvArgsNote()` beside the other binder-note rendering helpers
already collected under tests/helpers/ is the natural landing spot three
identical copies already point toward; naming it is an observation, not a
design.

## False-positive check
- Gate-pin: none of the three files match `*gate*.test.ts` or the named gate
  kin; the cited lines are constant/format-helper declarations, not a pinned
  count or inventory.
- Recording-double: `ajvArgsNote` builds an expected string for a `toEqual`/
  `.includes` comparison; it records no calls and backs no MUST-NOT-called
  witness, so the carve-out does not apply.
- docs/bugs/ signature search: `grep -rln "ajvArgsNote\|AJV_ARGS_PHRASE"
  docs/bugs/*.md` → no hits; no documented correct-reason red discusses this
  helper's duplication.
- coverage-matrix/bug-doc citation search: `grep -n
  "params-default-enum-access-merge\|binder-post-merge-ajv-enforcement\|params-default-unresolvable-enum-variant"
  docs/reference/coverage-matrix.md` → 0 hits; the bug docs each file's own
  header cites (0181 and its siblings) name the files for their reproduction
  role, never for the `ajvArgsNote` definition site. This finding proposes no
  merge, rename or deletion of any `it()`/`describe()` — only that a
  three-times-copied constant/helper pair could be shared — so no citation is
  disturbed.
- Overlap check: `grep -rl "ajvArgsNote\|AJV_ARGS_PHRASE"
  quality/intake/*.md quality/resolved/*.md` (run before writing this file)
  returned no hits — no prior finding names this constant/helper
  duplication.

## Triage
verdict: confirmed — independently re-verified: all three excerpts reproduce at the cited lines (EM_DASH at 194/169/298, ajvArgsNote at 206/178/304) and a diff of the extracted ranges shows the copies byte-identical apart from the two deltas the filing itself declares (ELLIPSIS only in enum-access-merge; AJV_SUMMARY_SEPARATOR absent from unresolvable-enum-variant); `const AJV_ARGS_PHRASE = "argument binding produced invalid args"` greps to exactly these 3 files repo-wide, `function ajvArgsNote` once each, no tests/helpers/ file names any of the four identifiers, every copy is live (ajvArgsNote called 2/5/2 times), none is a gate/recording-double/bug-doc-cited test, and no intake/resolved finding names these identifiers (PTQ-0285 and PTQ-0326 are src/-side and distinct) — in-scope D7 copy-paste duplication whose fix is a mechanical hoist (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
