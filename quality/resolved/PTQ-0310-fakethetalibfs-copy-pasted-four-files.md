---
id: PTQ-0310
title: b0303, b0304, b0305 and b0306 each redeclare the fakeThetaLibFs double that tests/helpers/thetalib-load-harness.ts already exports
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0303-imported-fn-body-declaring-scope.test.ts:87-120
  - tests/b0304-transitive-lib-diagnostics.test.ts:138-171
  - tests/b0305-enum-alias-identity.test.ts:66-99
  - tests/b0306-imported-enum-wire-values.test.ts:63-96
  - tests/helpers/thetalib-load-harness.ts:36-69
sites: 5                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260914060226
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-14
---

# b0303, b0304, b0305 and b0306 each redeclare the fakeThetaLibFs double that tests/helpers/thetalib-load-harness.ts already exports

## Observation
Each of tests/b0303-imported-fn-body-declaring-scope.test.ts,
tests/b0304-transitive-lib-diagnostics.test.ts,
tests/b0305-enum-alias-identity.test.ts and
tests/b0306-imported-enum-wire-values.test.ts declares, module scope, its own
`fakeThetaLibFs(files)`: an in-memory `FileSystem` double that derives a
directory listing from a flat path→content map and serves only
`readdir`/`readBytes`, every other member rejecting with a fixed
"filesystem member not exercised by this test" message. tests/helpers/thetalib-load-harness.ts
already exports a `fakeThetaLibFs` solving the identical problem; its own
header states it centralises exactly this double because it recurred
byte-for-byte across three sibling bug-witness files (PTQ-0232, resolved).
None of the four files reviewed here imports it — each carries its own copy.

## Evidence

tests/b0303-imported-fn-body-declaring-scope.test.ts:87-97 (of the full
declaration, 87-120):
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
```

tests/b0304-transitive-lib-diagnostics.test.ts:138-148 (of 138-171):
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
```

tests/b0305-enum-alias-identity.test.ts:66-76 (of 66-99):
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
```

tests/b0306-imported-enum-wire-values.test.ts:63-73 (of 63-96):
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
```

tests/helpers/thetalib-load-harness.ts:36-46 (of the canonical export,
36-69), byte-identical to the four excerpts above apart from the `export`
keyword:
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
```

Each full function body (through the shared `readdir`/`readBytes` closures to
the closing `} as FileSystem;` — b0303:87-120, b0304:138-171, b0305:66-99,
b0306:63-96 — against the canonical tests/helpers/thetalib-load-harness.ts:36-69)
was extracted and diffed immediately before filing (`diff` of each pair,
`export` keyword normalised): all four diffs produced zero output — the four
local declarations and the canonical export are byte-for-byte identical.

Exact search: `grep -n "^function fakeThetaLibFs" tests/b0301-bind-echo-tool-loop-respond-repair-holes.test.ts tests/b0303-imported-fn-body-declaring-scope.test.ts tests/b0304-transitive-lib-diagnostics.test.ts tests/b0305-enum-alias-identity.test.ts tests/b0306-imported-enum-wire-values.test.ts tests/b0310-watch-roots-root-union.test.ts` (the six files this wave reviews) → exactly 4 hits, the four files cited above; tests/b0301-... and tests/b0310-..., also in this wave's scope, carry no local declaration of this double.

## Why this is a problem
This is the "Copy-paste fixtures/doubles" class: a canonical helper
(tests/helpers/thetalib-load-harness.ts) already exists specifically to hold
this double — its own header names the earlier three-file duplication
(bug 0333/0334/0335, PTQ-0232) as the reason it was extracted — yet four
further sibling bug-witness files in the same import/`.thetalib` family carry
byte-identical copies rather than importing it. Every member the double
answers (the derived directory listing, the `readdir`/`readBytes` pair, the
fixed rejection message on every other `FileSystem` member) is identical
across all four local copies and the canonical export, so the helper already
covers each file's need in full.

## Suggested direction (non-binding, optional)
tests/helpers/thetalib-load-harness.ts already exports a `fakeThetaLibFs`
matching every one of these four declarations byte-for-byte; it is the
existing home each file's own copy could import instead of redeclaring.

## False-positive check
- Gate-pin check: none of the four files matches `*gate*.test.ts` or the
  named kin; the cited lines are a filesystem test double, not a pinned
  count or inventory assertion.
- Recording-double check: `fakeThetaLibFs` is a stateless, read-only double
  (it answers `readdir`/`readBytes` from a fixed map); it records no calls
  and backs no "never called" witness in any of the four files, so the
  negative-witness carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0303-imported-fn-body-resolves-in-caller-scope.md,
  docs/bugs/0304-transitive-lib-diagnostics-discarded.md,
  docs/bugs/0305-enum-identity-minted-from-alias.md and
  docs/bugs/0306-imported-enum-drops-explicit-wire-values.md all read
  "Status: fixed" (0.291.0 / 0.288.0 / 0.290.0 / 0.289.0 respectively).
  `npx vitest run tests/b0303-imported-fn-body-declaring-scope.test.ts tests/b0304-transitive-lib-diagnostics.test.ts tests/b0305-enum-alias-identity.test.ts tests/b0306-imported-enum-wire-values.test.ts`
  → 29 passed (29) at HEAD, so none of the four is a documented
  correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "b0303-imported-fn-body-declaring-scope\|b0304-transitive-lib-diagnostics\|b0305-enum-alias-identity\|b0306-imported-enum-wire-values" docs/reference/coverage-matrix.md`
  → 0 hits. Each file is named in its own bug doc's witness list (each test
  witnesses its own bug, as expected); tests/b0303-...'s `measure()` harness
  is additionally named by docs/bugs/0335 and docs/bugs/0354 as a pattern
  other investigations reused, and tests/b0306-...'s row 4 carries a parent
  ratification in docs/bugs/0305 explicitly bounded to "this ONE assertion
  operand, nothing else in that file." None of these citations names the
  `fakeThetaLibFs` declaration itself or requires it to stay locally
  declared, and this finding proposes no merge, rename or deletion of any
  file or `it()`/`describe()` — only that the double could be imported
  rather than redeclared.
- Coverage check: the claim is about a repeated double DEFINITION, not a
  missing test path; the double is exercised by every test in each of its
  four files (29/29 passing, confirmed above).

## Triage
verdict: confirmed — all 5 locations/excerpts and the byte-identity diffs reproduce exactly (independently re-diffed, zero output), the exact 4-of-6-file grep and the 29/29 vitest pass both reproduce, all four docs/bugs statuses and coverage-matrix's zero hits verify, and no D7 carve-out applies (no gate file, stateless non-recording double, no open-bug red, no guarded citation); PTQ-0232 is the exact same double centralised into this same helper for different sibling files, confirming this is a live consolidation target rather than an untouched "pervasive convention" false-positive, and PTQ-0239 covers a disjoint root cause (a `parse()` wrapper) in these same four files, so this is not a duplicate (triage: claude-opus-5)
