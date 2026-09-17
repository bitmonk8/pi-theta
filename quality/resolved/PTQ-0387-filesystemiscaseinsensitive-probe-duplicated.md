---
id: PTQ-0387
title: b0329's filesystemIsCaseInsensitive FS-case probe recurs verbatim in two later bug-witness files with no shared helper
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0329-hash-mismatch-refuses-invocation.test.ts:342-364
sites: 1                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260916144930
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-16
---

# b0329's filesystemIsCaseInsensitive FS-case probe recurs verbatim in two later bug-witness files with no shared helper

## Observation
tests/b0329-hash-mismatch-refuses-invocation.test.ts declares a module-scope
`filesystemIsCaseInsensitive(dir)` function: write a lowercase probe file,
attempt an uppercase read, return `true` on success, return `false` on
`ENOENT`, rethrow on any other error, and remove the probe file in a
`finally`. The identical function — same doc comment, same control flow,
same variable names, differing only in the probe filename's embedded bug
number — recurs in tests/b0363-file-entry-stem-judged-on-entry-spelling.test.ts
and tests/b0379-tools-entry-byte-match.test.ts. b0379's own header comment
names b0329 as the source it copied the helper from verbatim. No
`tests/helpers/` module exports this probe shape.

## Evidence

tests/b0329-hash-mismatch-refuses-invocation.test.ts:342-350 (re-read
immediately before filing — doc comment and signature):
```ts
/**
 * Whether the workspace filesystem is case-insensitive: write a lowercase file,
 * attempt the uppercase read. A successful read ⇒ case-insensitive. Only ENOENT
 * is the case-sensitive signal; any other error is a real fault and rethrows
 * (no swallow — CLAUDE.md/AGENTS.md "let crash"). The probe file lives in the
 * per-test tmp workspace and is removed with it.
 */
function filesystemIsCaseInsensitive(dir: string): boolean {
  const lower = join(dir, "b0329-case-probe-aa");
```

tests/b0329-hash-mismatch-refuses-invocation.test.ts:351-364 (re-read
immediately before filing — the body):
```ts
  writeFileSync(lower, "x", "utf8");
  try {
    readFileSync(join(dir, "b0329-case-probe-AA"), "utf8");
    return true;
  } catch (probeError: unknown) {
    const code = (probeError as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw probeError;
    }
    return false;
  } finally {
    rmSync(lower, { force: true });
  }
}
```

tests/b0379-tools-entry-byte-match.test.ts:173-184 (pattern context, outside
this wave's scope; re-read immediately before filing — the file's OWN
self-admission comment, immediately above its copy of the same doc comment
and signature):
```ts
// --- FS case-sensitivity probe (helper copied VERBATIM from -------------------
// --- tests/b0329-hash-mismatch-refuses-invocation.test.ts cell D; only the ----
// --- probe filename's bug number is localised to b0379) ----------------------

/**
 * Whether the workspace filesystem is case-insensitive: write a lowercase file,
 * attempt the uppercase read. A successful read ⇒ case-insensitive. Only ENOENT
 * is the case-sensitive signal; any other error is a real fault and rethrows
 * (no swallow — CLAUDE.md/AGENTS.md "let crash"). The probe file lives in the
 * per-test tmp workspace and is removed with it.
 */
function filesystemIsCaseInsensitive(dir: string): boolean {
```

tests/b0379-tools-entry-byte-match.test.ts:185-199 (pattern context; the
body, byte-identical to b0329's apart from the embedded bug number in the
two probe-filename literals):
```ts
  const lower = join(dir, "b0379-case-probe-aa");
  writeFileSync(lower, "x", "utf8");
  try {
    readFileSync(join(dir, "b0379-case-probe-AA"), "utf8");
    return true;
  } catch (probeError: unknown) {
    const code = (probeError as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw probeError;
    }
    return false;
  } finally {
    rmSync(lower, { force: true });
  }
}
```

tests/b0363-file-entry-stem-judged-on-entry-spelling.test.ts:82-104
(pattern context, outside this wave's scope; carries the same doc comment,
control flow, and variable names, again differing only in the embedded bug
number `b0363-case-probe-aa`/`-AA`) reproduces the identical shape a third
time.

Exact search, `tests/**/*.test.ts`: `grep -rln "function filesystemIsCaseInsensitive"
tests --include="*.test.ts"` → exactly 3 files repo-wide
(tests/b0329-hash-mismatch-refuses-invocation.test.ts,
tests/b0363-file-entry-stem-judged-on-entry-spelling.test.ts,
tests/b0379-tools-entry-byte-match.test.ts). `grep -n
"filesystemIsCaseInsensitive\|CaseInsensitive(" tests/helpers/*.ts` → 0
hits; the closest existing helper,
`tests/helpers/case-insensitive-host-probe.ts`'s `detectCaseInsensitiveHost`,
solves a different-shaped problem (an async `fsp.readdir` probe against an
ALREADY-POPULATED directory/entry pair the caller supplies) and cannot serve
as a drop-in for this synchronous, self-contained, write-then-read probe.

## Why this is a problem
The same ~15-line function — doc comment, control flow, variable names, and
all — is declared independently in three files rather than shared, and one
of the two later copies documents the duplication in its own header rather
than importing it ("helper copied VERBATIM from
tests/b0329-hash-mismatch-refuses-invocation.test.ts cell D; only the probe
filename's bug number is localised to b0379"). A prior D7 finding
(PTQ-0269, fixed) reviewed a DIFFERENT, async `fsp.readdir`-based probe pair
(b0361/b0362) and explicitly noted this synchronous trio's existence while
declining to file it ("it is not counted as a third instance of the async
probe cited here" — a different implementation of the same goal). That
carve-out left this trio's own duplication unfiled; `tests/helpers/`
currently holds no synchronous write-probe/read-probe FS-case detector for
b0329's shape to draw from.

## Suggested direction (non-binding, optional)
A `tests/helpers/` export for "probe whether `dir`'s filesystem folds case
by writing and re-reading a throwaway file", parameterised on the probe
directory (as `tests/helpers/case-insensitive-host-probe.ts` already
parameterises its own differently-shaped async probe), is the home b0379's
own header comment already points toward.

## False-positive check
- Gate-pin check: tests/b0329-hash-mismatch-refuses-invocation.test.ts does
  not match `*gate*.test.ts` or the named kin (closing-gate,
  cross-cutting-gates, rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate); the cited lines are an FS probe
  function, not a pinned count or inventory assertion.
- Recording-double check: `filesystemIsCaseInsensitive` reads the real
  filesystem and returns a boolean branch selector; it is not a
  call-recording double and backs no "never called" witness.
- docs/bugs/ signature search: docs/bugs/0329-hash-mismatch-refusal-does-not-refuse-invocation.md
  Status "fixed (0.322.0)"; docs/bugs/0363-file-entry-stem-judged-on-entry-spelling.md
  Status "fixed (0.355.0)"; docs/bugs/0379-tools-derived-name-judged-on-entry-spelling.md
  Status "fixed (0.368.0)". `npx vitest run
  tests/b0329-hash-mismatch-refuses-invocation.test.ts
  tests/b0363-file-entry-stem-judged-on-entry-spelling.test.ts
  tests/b0379-tools-entry-byte-match.test.ts` → 3 files, 14 tests, all
  passing at HEAD (verified 2026-09-16), so none is a documented
  correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0329-hash-mismatch-refuses-invocation" docs/reference/coverage-matrix.md`
  → 0 hits. This finding proposes no merge, rename, or deletion of any of
  the three files or any `it()`/`describe()` — only that the probe function
  could be shared rather than re-declared.
- Overlap check against already-filed/resolved topics: PTQ-0243
  (b0329-case-branch-tautological-assert, fixed) targets a different root
  cause in the SAME cell — two `expect(caseInsensitive, …).toBe(...)` calls
  that restate their own `if`/`else` guard — and does not cite or dispute
  the probe function's definition. PTQ-0269
  (case-insensitive-host-probe-duplicated, fixed) covers the unrelated async
  `detectCaseInsensitiveHost`/`fsp.readdir` pair (b0361/b0362) and its own
  Evidence section explicitly excludes this synchronous trio ("it is not
  counted as a third instance of the async probe cited here"). PTQ-0255
  (discovery-walk-scratch-harness-duplicated, fixed) cites
  `filesystemIsCaseInsensitive` only in passing, as proof that b0363 credits
  its sources elsewhere, for an unrelated b0363/b0364 harness pair. No filed
  or resolved item names this probe's own duplication as its root cause.
- Coverage-drift check: the claim is about a repeated function DEFINITION,
  not a missing test path; the probe is exercised by all three files' own
  currently-passing tests (14/14 confirmed above).

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently reproduced the exact-3-file grep and 0-hit helpers search, verified all cited excerpts byte-for-byte (including b0379's own "copied VERBATIM from b0329" admission) and b0363's control-flow/variable-name identity, confirmed all three bugs are "fixed" with 14/14 tests green and 0 coverage-matrix hits, and confirmed PTQ-0243 (different root cause, same file) and PTQ-0269 (explicitly excludes this sync trio as a different-shaped probe) leave this duplication unfiled (triage: claude-opus-5)
