---
id: PTQ-0843
title: atEveryPosition and most of positions() in inline-object-field-name-comparison-key.test.ts duplicate inline-object-quoted-field-name-refusal.test.ts's functions of the same name
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/inline-object-field-name-comparison-key.test.ts:259-276
  - tests/inline-object-quoted-field-name-refusal.test.ts:305-319
  - tests/inline-object-quoted-field-name-refusal.test.ts:339-341
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# atEveryPosition and most of positions() in inline-object-field-name-comparison-key.test.ts duplicate inline-object-quoted-field-name-refusal.test.ts's functions of the same name

## Observation
Both files declare a `positions(type: string): Record<string, string[]>`
that maps a type text to the diagnostic-line list at a fixed set of labelled
`Type` positions, and both declare an `atEveryPosition(expected: readonly
string[]): Record<string, string[]>` that repeats one expected list across
`POSITION_LABELS`. `atEveryPosition`'s body is byte-identical between the two
files. `positions()`'s first eight object-literal entries (every position
through `invoke<T>`) are byte-identical between the two files; the reviewed
file's `positions()` has nine entries total and the sibling's has eleven (two
extra: `"union arm"`, `"nested one level"`), and the final `.thetalib schema
field` entry differs only in the fixture-path literal (`"bug0159.thetalib"`
vs `"bug0176.thetalib"`).

## Evidence

`tests/inline-object-field-name-comparison-key.test.ts:259-276`:
```ts
function positions(type: string): Record<string, string[]> {
  return {
    "@<T> annotation root": lines(annotSrc(type)),
    "let annotation": lines(body(`let x: ${type} = 1`)),
    "schema body field": lines(body(`schema S { p: ${type} }`)),
    "fn parameter": lines(body(`fn f(p: ${type}) { 1 }`)),
    "fn return": lines(body(`fn f(): ${type} { 1 }`)),
    "alias RHS": lines(body(`schema S = ${type}`)),
    "params: field": lines(paramsSrc(`  p: '${type}'`)),
    "invoke<T>": lines(body(`let r = invoke<${type}>("./x.theta")`)),
    ".thetalib schema field": lines(`schema S { p: ${type} }\n`, "bug0159.thetalib"),
  };
}

/** One expected list repeated across all nine positions — type-system.md:15's claim. */
function atEveryPosition(expected: readonly string[]): Record<string, string[]> {
  return Object.fromEntries(POSITION_LABELS.map((label) => [label, [...expected]]));
}
```

`tests/inline-object-quoted-field-name-refusal.test.ts:305-319` (first eight
entries byte-identical to the excerpt above, `.thetalib` entry's bug number
differs, two extra entries inserted before it):
```ts
function positions(type: string): Record<string, string[]> {
  return {
    "@<T> annotation root": lines(annotSrc(type)),
    "let annotation": lines(body(`let x: ${type} = 1`)),
    "schema body field": lines(body(`schema S { p: ${type} }`)),
    "fn parameter": lines(body(`fn f(p: ${type}) { 1 }`)),
    "fn return": lines(body(`fn f(): ${type} { 1 }`)),
    "alias RHS": lines(body(`schema S = ${type}`)),
    "params: field": lines(paramsSrc(`  p: '${type}'`)),
    "invoke<T>": lines(body(`let r = invoke<${type}>("./x.theta")`)),
    "union arm": lines(annotSrc(`${type} | null`)),
    "nested one level": lines(annotSrc(`{p: ${type}}`)),
    ".thetalib schema field": lines(`schema S { p: ${type} }\n`, "bug0176.thetalib"),
  };
}
```

`tests/inline-object-quoted-field-name-refusal.test.ts:339-341`, `atEveryPosition`
(byte-identical to the reviewed file's copy above, bar the doc comment's "nine"
vs "eleven"):
```ts
function atEveryPosition(expected: readonly string[]): Record<string, string[]> {
  return Object.fromEntries(POSITION_LABELS.map((label) => [label, [...expected]]));
}
```

Exact search: `grep -rln "function atEveryPosition" tests --include="*.test.ts"` returns exactly these two files. `grep -rln "^function positions(type: string): Record<string, string\[\]>"` returns these two files plus `inline-object-type-source-capture.test.ts` (whose `POSITION_LABELS` vocabulary and order differ enough that it is not cited here as a third byte-identical instance).

## Why this is a problem
`atEveryPosition` is a pure, one-line projection over `POSITION_LABELS` with
zero domain-specific content — it is reimplemented identically rather than
imported once. `positions()` restates the same eight fixture-position
mappings (the same seven `lines(...)` calls in the same order, the same
template-string fixture bodies) in both files, so a change to how any of the
eight shared positions is constructed (e.g. the `params:` fixture's quoting)
would need the identical edit applied by hand at both sites, with the
sibling's two extra entries and differing `.thetalib` bug-number literal as
the only real per-file variation.

## Suggested direction (non-binding, optional)
A `tests/helpers/` export of `atEveryPosition` (parameterised by
`POSITION_LABELS`) and of the eight positions `positions()` shares between the
two files, with each file supplying its own extra entries and default
fixture path, is the natural home the byte-identical `atEveryPosition` and the
eight shared `positions()` entries point at.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named
  gate-kin patterns.
- Recording-double check: `positions()`/`atEveryPosition` build fixture-keyed
  diagnostic-line maps from a real parse; they record no call and back no
  "never called" witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "atEveryPosition\|POSITION_LABELS"
  docs/bugs/*.md` returns no hits — no documented correct-reason red names
  either function or states a rationale for two independent copies.
- coverage-matrix/bug-doc citation search: `grep -n
  "inline-object-field-name-comparison-key\|inline-object-quoted-field-name-refusal"
  docs/reference/coverage-matrix.md` returns no hits. Both files are cited by
  name in docs/bugs/ witness lists for their respective bug reports (0159 and
  0176 among others), always for the diagnostic behaviour under test, never
  for where `positions()`/`atEveryPosition`'s own code lives. This finding
  proposes no merge, rename, or deletion of either file or any
  `it()`/`describe()` — only that the duplicated helper code could be shared.
- Coverage check: the claim is about repeated helper-function code, not a
  missing test path; both copies are exercised by every `it()` in their own
  file that calls `positions()` or `atEveryPosition()` today.
- Prior-filing overlap check: `grep -rl "atEveryPosition\|POSITION_LABELS"
  quality/intake quality/issues quality/resolved` (before this filing)
  returned no hits; PTQ-0526 (the only other tracked "position matrix"
  duplication) names a disjoint `Position`/`POSITIONS`/`cells`/`expectMatrix`
  bundle in an unrelated pair of `b0281`/`b0282` files, not this one.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all three excerpts reproduce at the cited lines (comparison-key :259-276, refusal :305-319 and :339-341); sed-extracted `atEveryPosition` bodies diff to zero and the first eight `positions()` entries (:261-268 vs :307-314) diff to zero, the only per-file variation being the sibling's two extra entries (`union arm`, `nested one level`) and the `bug0159`/`bug0176` `.thetalib` path literal; both copies are live (16 and 8 `positions(`/`atEveryPosition(` call sites respectively); `function atEveryPosition` greps to exactly these two test files and no tests/helpers or src export exists for `atEveryPosition`/`POSITION_LABELS`/`positions`; one stated-search inaccuracy — `^function positions(type: string): Record<string, string\[\]>` returns only these two files, not three (inline-object-type-source-capture.test.ts declares `POSITION_LABELS` but no `positions()`), which is immaterial since the filing already excluded that file; both locations under tests/, D7 boilerplate-duplication class, neither a gate file, no recording double, docs/bugs `atEveryPosition|POSITION_LABELS` → 0 hits, coverage-matrix file cite → 0 hits, no merge/rename/delete proposed; not a duplicate — PTQ-0751 tracks the underlying `FM`/`TAIL`/`body`/`paramsSrc`/`annotSrc`/`lines`/`expectList` harness on a disjoint file pair and does not name the `POSITION_LABELS`/`positions()`/`atEveryPosition` position-matrix layer built atop it, PTQ-0526 names a different `Position`/`POSITIONS`/`cells`/`expectMatrix` bundle in b0281/b0282, and the two same-wave d7-01 intakes explicitly carve this pair out; the fixer should route the shared home alongside PTQ-0751's since `positions()` consumes that harness (triage: claude-fable-5-1)
