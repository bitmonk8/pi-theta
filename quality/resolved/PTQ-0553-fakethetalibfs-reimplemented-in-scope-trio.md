---
id: PTQ-0553
title: b0422live, b0445live and b0428live each redeclare a local fakeThetaLibFs double instead of importing tests/helpers/thetalib-load-harness.ts's canonical export
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/live/acceptance/b0422live-imported-schema-system-interp-wire-and-refusal.test.ts:211-249
  - tests/live/acceptance/b0445live-imported-array-element-system-interp.test.ts:165-198
  - tests/live/acceptance/b0428live-unreadable-thetalib-load-refusal.test.ts:156-203
  - tests/helpers/thetalib-load-harness.ts:85-118
sites: 3
fix_scope: cross-module       # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0422live, b0445live and b0428live each redeclare a local fakeThetaLibFs double instead of importing tests/helpers/thetalib-load-harness.ts's canonical export

## Observation
`tests/helpers/thetalib-load-harness.ts` exports `fakeThetaLibFs(files)`: an
in-memory `FileSystem` double for `.thetalib` import tests that derives a
directory listing from a flat path→content map, serves only `readdir` /
`readBytes`, and rejects every other member with the fixed message
`"filesystem member not exercised by this test"`. Three files in this
review's scope each declare their own module-scope `fakeThetaLibFs` (or an
equivalent) reproducing that exact member list and reject wording rather than
importing the export. `b0422live` and `b0445live` reproduce it member-for-member
identically (down to the reject message string); `b0445live`'s own doc comment
names its source as "the b0422/b0423 `fakeThetaLibFs`", i.e. the shape
originates in the very trio under review. `b0428live` reproduces the same base
shape and additionally layers on an `unreadable`-path/EACCES branch the
canonical export does not support.

## Evidence
`tests/helpers/thetalib-load-harness.ts:85-100` (the canonical export):
```ts
export function fakeThetaLibFs(files: Record<string, string>): FileSystem {
  const dirs = new Map<string, string[]>();
  for (const path of Object.keys(files)) {
    const slash = path.lastIndexOf("/");
    const parent = path.slice(0, slash);
    const entries = dirs.get(parent) ?? [];
    entries.push(path.slice(slash + 1));
    dirs.set(parent, entries);
  }
  const reject = (): Promise<never> =>
    Promise.reject(new Error("filesystem member not exercised by this test"));
  return {
    readText: reject,
    writeText: reject,
    exists: reject,
```

`tests/live/acceptance/b0422live-imported-schema-system-interp-wire-and-refusal.test.ts:211-226`
(same body, local, unexported, `cwd` returns a local `PROJ_DIR` const equal to
the canonical's hardcoded `"/proj"`):
```ts
function fakeThetaLibFs(files: Record<string, string>): FileSystem {
  const dirs = new Map<string, string[]>();
  for (const path of Object.keys(files)) {
    const slash = path.lastIndexOf("/");
    const parent = path.slice(0, slash);
    const entries = dirs.get(parent) ?? [];
    entries.push(path.slice(slash + 1));
    dirs.set(parent, entries);
  }
  const reject = (): Promise<never> =>
    Promise.reject(new Error("filesystem member not exercised by this test"));
  return {
    readText: reject,
    writeText: reject,
    exists: reject,
    homedir: (): string => "/home",
    cwd: (): string => PROJ_DIR,
```

`tests/live/acceptance/b0445live-imported-array-element-system-interp.test.ts:165-176`
(identical again, own doc comment attributes the shape to "the b0422/b0423
`fakeThetaLibFs`"):
```ts
function fakeThetaLibFs(files: Record<string, string>): FileSystem {
  const dirs = new Map<string, string[]>();
  for (const path of Object.keys(files)) {
    const slash = path.lastIndexOf("/");
    const parent = path.slice(0, slash);
    const entries = dirs.get(parent) ?? [];
    entries.push(path.slice(slash + 1));
    dirs.set(parent, entries);
  }
  const reject = (): Promise<never> =>
    Promise.reject(new Error("filesystem member not exercised by this test"));
  return {
```

`tests/live/acceptance/b0428live-unreadable-thetalib-load-refusal.test.ts:156-172`
(the same base shape, with an added `unreadable` list threaded through the
directory listing):
```ts
function fakeThetaLibFs(
  files: Record<string, string>,
  unreadable: readonly string[] = [],
): FileSystem {
  const dirs = new Map<string, string[]>();
  const list = (path: string): void => {
    const slash = path.lastIndexOf("/");
    const parent = path.slice(0, slash);
    const entries = dirs.get(parent) ?? [];
    entries.push(path.slice(slash + 1));
    dirs.set(parent, entries);
  };
  for (const path of Object.keys(files)) list(path);
  for (const path of unreadable) list(path);
  const unreadableSet = new Set(unreadable);
  const reject = (): Promise<never> =>
```

## Why this is a problem
The exact same directory-derivation loop, the exact same nine-member
`FileSystem` shape, and the exact same reject-message string are declared
three separate times inside the reviewed scope, in a test tree that already
has a canonical, exported double for this precise purpose
(`tests/helpers/thetalib-load-harness.ts`'s own header explains it centralised
this bundle after "tests/b0333…, tests/b0334… and tests/b0335…each
independently redeclared the same three-piece bundle"). Two of the three
in-scope copies (`b0422live`, `b0445live`) are byte-for-byte reproductions with
no functional variation from the export they could import instead; the third
(`b0428live`) needs one additional capability (a listed-but-unreadable path)
the export does not offer, but still reproduces the entire base shape to add
it, rather than varying only the delta.

## Suggested direction (non-binding, optional)
The natural home for the two identical copies is the existing
`tests/helpers/thetalib-load-harness.ts` export, which both files could import
directly; `b0428live`'s variant is an observation that the export does not yet
support an "unreadable path" mode, not a design for how it should.

## False-positive check
- Gate-pin check: none of the three files match `*gate*.test.ts` or the named
  gate kinds; not applicable.
- Recording-double check: `fakeThetaLibFs` answers `readdir`/`readBytes` from a
  fixed map and does not record calls for a "never called" assertion in any of
  the three files — the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "fakeThetaLibFs" docs/bugs/` returns no
  hits; no documented correct-reason-red pins this exact double's shape.
- coverage-matrix/bug-doc citation search: `grep -l "b0422live\|b0445live\|b0428live"
  docs/bugs/*.md docs/reference/coverage-matrix.md` finds the three files named
  in their own bug docs (0422, 0428, 0445) as witnesses of the fix itself, not
  as pins on this internal helper function; this finding proposes no merge,
  rename, or deletion of any test, only that the double could be imported
  rather than redeclared, so the citation-pinning rule is not engaged.
- Confirmed the canonical export exists and matches: read
  `tests/helpers/thetalib-load-harness.ts:85-118` directly before filing.

## Triage
verdict: confirmed — independently re-verified: all four excerpts reproduce at the cited lines (harness:85-118, b0422live:216-249, b0445live:165-198, b0428live:156-203; ≤5-line drift); scratch diff shows b0422live and b0445live are identical to each other and differ from the export only in `cwd` returning a local `PROJ_DIR` const that is `"/proj"` in both files (b0422live:101, b0445live:81), while b0428live reproduces the full nine-member base shape and reject string plus its own EACCES `unreadable` branch, exactly as accounted; no live file imports thetalib-load-harness, yet 41 tests/live/acceptance files (all three cited ones, via `parseDeps` from ../../helpers/e2e-s1) already import tests/helpers so no tier barrier applies (only the harness header's "same tier as every importer" line would need touching); all three bug docs read fixed (0.435.0/0.421.0/0.457.0) and none pins the double's shape — the candidate's "docs/bugs grep returns no hits" is slightly wrong (docs/bugs/0304:280 mentions it) but that hit itself flags this duplication and recommends a tests/helpers hoist; no D7 carve-out applies (no gate file, stateless non-recording double, no open-bug red, no merge/rename/delete proposed); dedupe verified — PTQ-0232 (b0333-35), PTQ-0310 (b0303-06) and PTQ-0393 (b0448/b0450) cover this identical double over disjoint file sets and are all fixed, so this is a distinct residual of the same thrice-confirmed copy-paste-double class, confined to tests/ (triage: claude-fable-5-1)
