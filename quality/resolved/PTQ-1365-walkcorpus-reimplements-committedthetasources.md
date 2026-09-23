---
id: PTQ-1365
title: params-scalar-nontype-text-refusal.test.ts reimplements the committed .theta/.thetalib corpus discovery tests/helpers/theta-corpus.ts already centralises
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/params-scalar-nontype-text-refusal.test.ts:1346-1376
  - tests/helpers/theta-corpus.ts:1-50
  - tests/pattern-field-literal-integer-narrowing-refusal.test.ts:325-327
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# params-scalar-nontype-text-refusal.test.ts reimplements the committed .theta/.thetalib corpus discovery tests/helpers/theta-corpus.ts already centralises

## Observation
`tests/helpers/theta-corpus.ts` exports `committedThetaSources()`, whose own header states its purpose: "A shared 'discover the committed `.theta` / `.thetalib` corpus' reader for the many independent per-bug GOV-15 corpus-census sweeps (PTQ-0226)." It returns every `git ls-files -- '*.theta' '*.thetalib'` path, throwing loudly if `git` is unavailable or the result is empty. `tests/params-scalar-nontype-text-refusal.test.ts`'s section (h) needs exactly this: "every committed `.theta` / `.thetalib`" for its own GOV-15 blast-radius census (its own comment at line 1338-1344 names the same GOV-15/committed-corpus goal). Instead of importing `committedThetaSources`, it declares its own `CENSUS_SKIP_DIRS` set and a recursive `readdirSync`-based `walkCorpus` function, resolved from `process.cwd()` rather than the module URL. The sibling in-scope file, `tests/pattern-field-literal-integer-narrowing-refusal.test.ts`, imports and calls `committedThetaSources()` directly for the identical "committed `.theta`/`.thetalib` corpus for a GOV-15 census" purpose (its own section (f)).

## Evidence
`tests/params-scalar-nontype-text-refusal.test.ts:1346-1376`:
```ts
/** Build and vendor trees the census never descends into. */
const CENSUS_SKIP_DIRS = new Set(["node_modules", ".git", "dist", "coverage"]);

/**
 * The seeded-invalid fixture, which is malformed on purpose and belongs to the
 * H7b gate's own red-path assertion rather than to the shipped corpus.
 */
const SEEDED_INVALID = "tests/fixtures/h7b-invalid/malformed.theta";

/** Every committed `.theta` / `.thetalib`, as repo-relative POSIX paths. */
function walkCorpus(dir: string, acc: string[]): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (CENSUS_SKIP_DIRS.has(entry.name)) continue;
      walkCorpus(join(dir, entry.name), acc);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".theta") || entry.name.endsWith(".thetalib"))
    ) {
      acc.push(join(dir, entry.name));
    }
  }
  return acc;
}

const REPO_ROOT = process.cwd();

const CORPUS = walkCorpus(REPO_ROOT, [])
  .map((p) => p.slice(REPO_ROOT.length + 1).split(sep).join(posix.sep))
  .sort()
  .filter((p) => p !== SEEDED_INVALID);
```

`tests/helpers/theta-corpus.ts:1-50` (the canonical export, re-read immediately before filing):
```ts
// A shared "discover the committed `.theta` / `.thetalib` corpus" reader for
// the many independent per-bug GOV-15 corpus-census sweeps (PTQ-0226).
...
export function committedThetaSources(): readonly string[] {
  const listed = execFileSync("git", ["ls-files", "-z", "--", "*.theta", "*.thetalib"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  const files = listed
    .split("\0")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .sort();
  if (files.length === 0) {
    throw new Error(
      "harness: `git ls-files -- '*.theta' '*.thetalib'` listed no file, so the GOV-15 corpus " +
        "census measured nothing — a harness failure, never a skip",
    );
  }
  return files;
}
```

`tests/pattern-field-literal-integer-narrowing-refusal.test.ts:325-327` (the sibling in-scope file's use of the same canonical helper for the same purpose):
```ts
    const repoRoot = fileURLToPath(new URL("..", import.meta.url));
    const listed = committedThetaSources();
```

Search: `grep -rl "committedThetaSources\|walkCorpus" tests --include=*.ts` returns 17 files; 16 of them (including `tests/pattern-field-literal-integer-narrowing-refusal.test.ts`, the sibling in this same scope) import `committedThetaSources` from `tests/helpers/theta-corpus.ts`. `tests/params-scalar-nontype-text-refusal.test.ts` is the sole file whose only hit is its own local `walkCorpus` declaration — it does not import `theta-corpus.ts` anywhere (0 hits for the module specifier in the file).

## Why this is a problem
`theta-corpus.ts`'s own header records that this exact "discover the committed corpus for a per-bug GOV-15 sweep" step was independently reauthored across 15+ test files before being centralised (PTQ-0226); the sibling file in this same review scope demonstrates the one-line replacement (`committedThetaSources()`) is sufficient for the identical GOV-15 census goal this file's own section (h) states. The in-scope file's ~30-line `CENSUS_SKIP_DIRS`/`walkCorpus`/`REPO_ROOT` block restates that same discovery step by an independent mechanism (a manual `readdirSync` filesystem walk with a hand-maintained build/vendor exclusion set, rooted at `process.cwd()`) rather than the canonical `git ls-files`-based reader every other GOV-15 sweep in the suite now uses.

## Suggested direction (non-binding, optional)
Replacing the `CENSUS_SKIP_DIRS`/`walkCorpus`/`REPO_ROOT` block with `committedThetaSources()` (as the sibling file in this same scope already does) would let the local discovery logic drop; the file's own `SEEDED_INVALID`-exclusion `.filter` step is the only fixture-specific residue and can compose with the helper's return value directly.

## False-positive check
- Gate-pin check: the file name matches none of `*gate*.test.ts` or the named gate kin; not applicable.
- Recording-double check: `walkCorpus` is a plain filesystem enumerator, not a recording double asserting a MUST-NOT witness; not applicable.
- docs/bugs/ signature search: `grep -rl "params-scalar-nontype-text-refusal" docs/bugs` → `docs/bugs/0059-params-scalar-nontype-text-recorded-and-permissive.md` cites this file as its own witness, but the bug document licenses no bespoke corpus-walk mechanism — it names only the GOV-15 census property, which `committedThetaSources()` equally supplies.
- coverage-matrix citation search: `grep -n "params-scalar-nontype-text-refusal" docs/reference/coverage-matrix.md` → 0 hits; this finding proposes no merge, rename or deletion of any test, only a helper-call substitution, so the citation question does not bind here regardless.
- Confirmed the canonical helper is live and already the majority pattern: 16 of 17 files matching `committedThetaSources|walkCorpus` use the shared export, including the sibling file in this exact review scope.
- Checked prior review history: `quality/REVIEW_LOG.md` (shard qw20260917154546-D7-shard-119, 2026-09-17) explicitly considered this file's `walkCorpus`/`CENSUS_SKIP_DIRS` and left it unfiled, but only after comparing it against `tests/helpers/corpus-reader.ts` (a single-file spec-corpus reader, genuinely a different purpose) — that review did not check it against `tests/helpers/theta-corpus.ts`'s `committedThetaSources`, which serves the identical "committed `.theta`/`.thetalib` corpus for a GOV-15 sweep" purpose and was already the majority-adopted helper by that date (created 2026-09-12, five days before that review). This filing is not a re-file of that shard's conclusion; it names the specific canonical helper the prior pass did not check.

## Triage
verdict: confirmed — reproduces: tests/params-scalar-nontype-text-refusal.test.ts:1346-1376 declares `CENSUS_SKIP_DIRS`/`walkCorpus` (readdirSync recursion rooted at `process.cwd()`) and never imports `./helpers/theta-corpus` (grep for `theta-corpus` in the file: 0 hits; the file's only `readdirSync` use is this walker), while tests/helpers/theta-corpus.ts:1-56 exports `committedThetaSources()` whose header names exactly this GOV-15 committed-corpus discovery step and already returns sorted repo-relative POSIX paths with a fail-loud empty guard (so the local h1 anti-vacuity throw and the `.sort()`/`sep`→`posix.sep` mapping are also subsumed, leaving only the `SEEDED_INVALID` filter and a `fileURLToPath`-derived root for `readFileSync` as local residue); the stated grep reproduces at 17 files / 16 importers, and the in-scope sibling does import and call it — though at lines 19 and 775-776, not the cited 325-327 (content matches, line drift only); `git ls-files -- '*.theta' '*.thetalib'` lists 46 files including both h1 anchors and the seeded-invalid fixture, so the helper covers every need; no existing PTQ cites walkCorpus/CENSUS_SKIP_DIRS (quality/issues + resolved: 0 hits) and REVIEW_LOG.md:229 confirms the prior shard compared only against corpus-reader.ts — D7 boilerplate-duplication class, in tests/, no carve-out applies (not a gate file, no recording double, coverage-matrix cites the file 0 times) (triage: claude-fable-5-1)
