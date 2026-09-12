---
id: PTQ-0255
title: The discoverThetas-over-real-PiFileSystem scratch harness (THETA_BODY, posix/sp/underScratch, json, runWalk) is redefined near-verbatim in a sibling bug-witness file
lens: D7                     # D2 | D7 — the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0363-file-entry-stem-judged-on-entry-spelling.test.ts:63-89
  - tests/b0363-file-entry-stem-judged-on-entry-spelling.test.ts:102
  - tests/b0363-file-entry-stem-judged-on-entry-spelling.test.ts:110-122
  - tests/b0364-healthy-junction-ancestor-misclassifies-missing.test.ts:81-108
  - tests/b0364-healthy-junction-ancestor-misclassifies-missing.test.ts:126
  - tests/b0364-healthy-junction-ancestor-misclassifies-missing.test.ts:134-146
sites: 2                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912112713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# The discoverThetas-over-real-PiFileSystem scratch harness (THETA_BODY, posix/sp/underScratch, json, runWalk) is redefined near-verbatim in a sibling bug-witness file

## Observation
`tests/b0363-file-entry-stem-judged-on-entry-spelling.test.ts` and
`tests/b0364-healthy-junction-ancestor-misclassifies-missing.test.ts` each
drive `discoverThetas` over a fresh per-test scratch directory through the
production `PiFileSystem`. Each file independently defines the same set of
local helpers to do this: the `THETA_BODY` constant with its identical doc
comment, the `scratchDir`/`scratchPosix` state pair with identical inline
comments, `posix()`, `sp()`, `underScratch()`, the `json` shorthand, and
`runWalk()`. `posix()`, `sp()`, `json`, and `runWalk()` are byte-identical
between the two files; `THETA_BODY` and the state-variable declarations are
byte-identical apart from b0363's one extra `xNativeDir` line; `underScratch()`
is byte-identical.

## Evidence
`tests/b0363-file-entry-stem-judged-on-entry-spelling.test.ts:63-89`:
```ts
/** A body that reads far enough to register — discovery validates the slash
 *  name and file readability only, never the mode block, so a prompt-mode body
 *  suffices to exercise the discovery name/diagnostic this file asserts on. */
const THETA_BODY = "mode: prompt\n---\n";

// ── Scratch workspace ─────────────────────────────────────────────────────────

let scratchDir: string; // native (backslash on Windows) — for on-disk writes
let scratchPosix: string; // forward-slash — for references and prefix compares
let xNativeDir: string; // <scratch>/x on disk

/** Forward-slash form for reference/compare (Node fs accepts `/` on Windows and
 *  the walk normalises to `/`; a drive-letter path stays absolute). */
function posix(path: string): string {
  return path.replace(/\\/g, "/");
}

/** A forward-slash absolute path under the scratch root. */
function sp(...parts: string[]): string {
  return [scratchPosix, ...parts].join("/");
}

/** True when `path` lies under the per-test scratch root (case-insensitive: the
 *  host may report the temp prefix in a different case than `tmpdir()` did). */
function underScratch(path: string): boolean {
  return posix(path).toLowerCase().startsWith(scratchPosix.toLowerCase());
}
```

`tests/b0364-healthy-junction-ancestor-misclassifies-missing.test.ts:81-108`,
the same declarations (b0364 additionally carries a longer `posix` doc comment
and no `xNativeDir` line; the four function bodies are byte-identical):
```ts
/** A body that reads far enough to register — discovery validates the slash
 *  name and file readability only, never the mode block, so a prompt-mode body
 *  suffices to exercise the discovery name/diagnostic this file asserts on. */
const THETA_BODY = "mode: prompt\n---\n";

// ── Scratch workspace ─────────────────────────────────────────────────────────

let scratchDir: string; // native (backslash on Windows) — for on-disk writes
let scratchPosix: string; // forward-slash — for references and prefix compares

/** Forward-slash form for reference/compare (Node fs accepts `/` on Windows and
 *  the walk normalises to `/`; a drive-letter path stays absolute). PiFileSystem
 *  reports forward-slash paths, so the `.file` field is the forward-slash
 *  junction/real spelling. */
function posix(path: string): string {
  return path.replace(/\\/g, "/");
}

/** A forward-slash absolute path under the scratch root. */
function sp(...parts: string[]): string {
  return [scratchPosix, ...parts].join("/");
}

/** True when `path` lies under the per-test scratch root (case-insensitive: the
 *  host may report the temp prefix in a different case than `tmpdir()` did). */
function underScratch(path: string): boolean {
  return posix(path).toLowerCase().startsWith(scratchPosix.toLowerCase());
}
```

`tests/b0363-file-entry-stem-judged-on-entry-spelling.test.ts:102` and
`:110-122` — the `json` shorthand and `runWalk`, both byte-identical to
`tests/b0364-healthy-junction-ancestor-misclassifies-missing.test.ts:126` and
`:134-146`:
```ts
const json = (value: unknown): string => JSON.stringify(value);

/**
 * Drive `discoverThetas` over the real scratch root with the production
 * `PiFileSystem` whose cwd is the scratch root (so the project conventional
 * root is `<scratch>/.pi/theta`, absent → silent). Only the explicit references
 * this test passes reach the scratch files.
 */
async function runWalk(extra: {
  settings?: ThetaSettings;
  cliPaths?: readonly string[];
}): Promise<{ thetas: readonly DiscoveredTheta[]; diagnostics: readonly Diagnostic[] }> {
  const fs = new PiFileSystem(scratchPosix);
  const inputObj: DiscoveryInput = {
    fs,
    settings: extra.settings ?? {},
    ...(extra.cliPaths !== undefined ? { cliPaths: extra.cliPaths } : {}),
  };
  const { thetas, diagnostics } = await discoverThetas(inputObj);
  return { thetas, diagnostics };
}
```

Search performed: `grep -rn "function posix(path: string): string {" tests`,
`grep -rn "function underScratch" tests`, and `grep -rn "async function
runWalk" tests` each return exactly two hits total — one in b0363, one in
b0364 — confirming 2 sites and no third copy anywhere in `tests/`.
Cross-checking every test file that imports both `discoverThetas`
(`src/discovery/discovery-walk`) and `PiFileSystem`
(`src/seams/pi-file-system`) turns up exactly five files: b0363, b0364,
`discovery-glob-universe-enumeration-failure.test.ts`,
`discovery-symlinked-root-classification.test.ts`, and
`live/discovery-cli-override-prefix-missing-source-live-cell.test.ts`. Reading
the latter three shows each uses an in-memory `FakeFileSystem` double with
differently-named helpers (`names`, `shape`, `build`, `input`) instead of this
real-`PiFileSystem` scratch harness, so they are not additional copies.

## Why this is a problem
Four of the seven duplicated pieces (`posix`, `sp`, `underScratch`, `json`) and
the `runWalk` driver are byte-for-byte identical between the two files, and the
other two (`THETA_BODY`, the `scratchDir`/`scratchPosix` pair) differ only by
one extra declaration line and a longer doc comment. Neither file's header or
inline comments credit the other as a source. This same pair of files does
practice cross-citation elsewhere for a different shared helper — b0363's
`filesystemIsCaseInsensitive` is explicitly commented "mirroring
tests/b0329-hash-mismatch-refuses-invocation.test.ts's rig" — so the absence of
any such note here indicates this particular harness was independently
authored twice rather than consciously copied forward. `tests/helpers/`
currently holds 19 modules (parse/lex drivers, fake doubles, corpus/registry
readers, composition-workspace and dispatch harnesses) and none of them
exports a discovery-walk-over-real-filesystem scratch driver of this shape.

## Suggested direction (non-binding, optional)
A shared `tests/helpers/` export for "drive `discoverThetas` over a real,
per-test scratch `PiFileSystem` root and read results back filtered to that
root" would be the natural home for these seven pieces, mirroring how
`tests/helpers/e2e-s1.ts` already centralises the analogous parse-driving
sequence for the language-core tests.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kinds (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate); not
  applicable.
- Recording-double check: none of the seven duplicated pieces is a
  call-recording double asserting a MUST-NOT witness; not applicable.
- docs/bugs/ signature search: `docs/bugs/0363-file-entry-stem-judged-on-entry-spelling.md`
  and `docs/bugs/0364-healthy-junction-ancestor-misclassifies-missing-as-unreadable.md`
  both exist and are cited in each test file's own header. This finding does
  not contest either test's redness or behaviour — both files' RED/CONTROL
  cells are untouched by this observation — only the shared harness plumbing
  that precedes those cells.
- coverage-matrix/bug-doc citation search: `grep -n "b0363\|b0364"
  docs/reference/coverage-matrix.md` returns no hits — neither file is pinned
  by that matrix. Each bug doc's own witness line names only its own test file
  (`docs/bugs/0363-...md:197` and `docs/bugs/0364-...md:201`), which is the
  expected self-citation, not a cross-file pin. This finding does not propose
  merging, renaming, or deleting either test.
- Coverage drift check: this observation is limited to code duplicated between
  two existing, currently-run test files; it does not claim any behaviour is
  untested.

## Triage
verdict: confirmed — every cited excerpt (THETA_BODY, posix, sp, underScratch, json, runWalk) reproduces byte-for-byte at the exact cited lines in both files (verified directly, including exact closing braces at b0363:89/122 and b0364:108/146); independent repo-wide greps for `function posix(path: string): string {`, `function underScratch`, and `async function runWalk` each return exactly the same 2 hits (b0363, b0364), and a broader independent search for every file constructing `new PiFileSystem(` that also calls `discoverThetas(` also narrows to exactly these 2 files — the other three files the candidate names (two FakeFileSystem-based, one a live cell using bootShippedExtension with no direct construction of either) are correctly excluded; none of tests/helpers/'s 20 modules (the candidate undercounts by one, immaterial) exports this shape; both docs/bugs/0363 and /0364 are status "fixed" and both test files run fully green (11/11) at HEAD, and coverage-matrix.md has zero b0363/b0364 hits, so no false-positive carve-out applies; not a duplicate of any tracked PTQ or sibling-wave intake candidate (qw20260912112713-d7-02-case-insensitive-host-probe-duplicated.md cites a disjoint function pair in different files, b0361/b0362); in-scope D7 boilerplate/copy-paste-duplication, matching the already-confirmed PTQ-0206/PTQ-0232 shape (triage: claude-opus-5)
