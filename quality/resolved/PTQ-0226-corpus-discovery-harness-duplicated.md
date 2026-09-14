---
id: PTQ-0226
title: The GOV-15 committed-`.theta`/`.thetalib`-corpus discovery sequence (git ls-files, split/filter, loud-empty-check) is reimplemented independently in this file and 14 sibling test files
lens: D7                     # D2 | D7 — the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/annotation-nontype-text-refusal.test.ts:2601-2613
  - tests/capitalised-bare-match-pattern-refusal.test.ts:913-929
  - tests/division-result-type-number.test.ts:1624-1639
  - tests/for-empty-array-iterand-adjudication.test.ts:429-440
  - tests/match-pattern-increment-decrement.test.ts:862-876
  - tests/modulo-zero-result-type-number.test.ts:1566-1581
  - tests/object-pattern-head-unresolved-refusal.test.ts:1072-1087
  - tests/object-pattern-head-field-set-refusal.test.ts:1221-1238
  - tests/pattern-field-literal-integer-narrowing-refusal.test.ts:969-983
  - tests/params-default-unresolvable-enum-variant.test.ts:1821-1836
  - tests/binder-param-type-projection.test.ts:481-495
  - tests/binder-prompt-description-hint-line-forgery.test.ts:409-427
  - tests/interpolation-parse-diagnostics.test.ts:1239-1257
  - tests/match-fn-return-lub-dominating-discipline.test.ts:773-788
  - tests/type-name-as-value-refusal.test.ts:1464-1486
sites: 15
fix_scope: cross-module
wave: qw20260912091742
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# The GOV-15 committed-corpus discovery sequence is reimplemented independently in 15 test files

## Observation
`tests/annotation-nontype-text-refusal.test.ts`'s group (x) cell (`x1`, the
GOV-15 census) fetches the committed `.theta`/`.thetalib` corpus by shelling
out to `git ls-files`, splitting stdout on newlines, trimming, filtering empty
lines, and throwing a loud harness error naming the unmet precondition if the
result is empty — before parsing each listed file to look for its own bug's
diagnostic code. The same "shell out to `git ls-files -- *.theta *.thetalib`,
turn stdout into a trimmed non-empty path list, fail loudly if it's empty"
sequence recurs, with only cosmetic wording/style differences, in at least 14
other test files. No `tests/helpers/` module exports this discovery step; the
suite already extracts the analogous single-file read
(`tests/helpers/corpus-reader.ts`'s `readCorpus`/`repoFile`, built for the
doc/spec-corpus oracle files) but not this fixture-corpus-listing one.

## Evidence
`tests/annotation-nontype-text-refusal.test.ts:2601-2613` (in scope):
```ts
    const files = execFileSync("git", ["ls-files", "*.theta", "*.thetalib"], {
      encoding: "utf8",
      cwd: fileURLToPath(new URL("..", import.meta.url)),
    })
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (files.length === 0) {
      throw new Error(
        "harness: `git ls-files '*.theta' '*.thetalib'` listed nothing, so the census has no " +
          "corpus to range over — a loud failure, never a vacuous pass",
      );
    }
```

`tests/capitalised-bare-match-pattern-refusal.test.ts:913-919`, the identical
call-and-chain shape:
```ts
    const listed = execFileSync("git", ["ls-files", "--", "*.theta", "*.thetalib"], {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      encoding: "utf8",
    })
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
```
(followed at :926-929 by the same "fail loudly on an empty list" `expect(...).toBeGreaterThan(0)`, worded differently from the target file's `throw`.)

A second stylistic family wraps the identical operation in a named function —
three files even choose the same name, `committedThetaSources`.
`tests/match-fn-return-lub-dominating-discipline.test.ts:774-788`:
```ts
function committedThetaSources(): string[] {
  const result = spawnSync("git", ["ls-files", "-z", "--", "*.theta", "*.thetalib"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      "harness: the census corpus is the git index (`git ls-files '*.theta' '*.thetalib'`), so the unmet precondition is a working `git` executable plus a repository checkout at the test root — never a skip. " +
        `status=${String(result.status)} error=${result.error?.message ?? "none"} stderr=${result.stderr}`,
    );
  }
  return result.stdout
    .split("\0")
    .filter((p) => p.length > 0)
    .sort();
}
```

`tests/type-name-as-value-refusal.test.ts:1464-1476`, the same function body
(only the message text and an added length-zero check differ):
```ts
function committedThetaSources(): string[] {
  const result = spawnSync("git", ["ls-files", "-z", "--", "*.theta", "*.thetalib"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      "harness: the corpus is the git index (`git ls-files -- '*.theta' '*.thetalib'`), not the " +
        "working tree; the unmet precondition is a working `git` executable plus a repository " +
        `checkout at the test root. status=${String(result.status)} ` +
        `error=${result.error?.message ?? "none"} stderr=${result.stderr}`,
    );
  }
```

`tests/params-default-unresolvable-enum-variant.test.ts:1821-1836`, a third
name (`committedThetaCorpus`) over the `execFileSync`/newline-split variant of
the identical operation:
```ts
function committedThetaCorpus(): readonly string[] {
  const listed = execFileSync("git", ["ls-files", "--", "*.theta", "*.thetalib"], {
    cwd: fileURLToPath(REPO_ROOT_URL),
    encoding: "utf8",
  });
  const files = listed
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (files.length === 0) {
    throw new Error(
      "harness: `git ls-files -- '*.theta' '*.thetalib'` listed no file, so the GOV-15 corpus census measured nothing — a harness failure, never a skip",
    );
  }
  return files;
}
```

Pattern search: `rg '(execFileSync|spawnSync)\("git",\s*\[\s*"ls-files"' tests/*.test.ts`
returns exactly 15 hits, one per file listed above, each opening the identical
"discover the committed `.theta`/`.thetalib` corpus, fail loudly on an
unavailable `git` or an empty result" block (the remaining 10 sites —
`division-result-type-number.test.ts:1624-1639`,
`for-empty-array-iterand-adjudication.test.ts:429-440`,
`match-pattern-increment-decrement.test.ts:862-876`,
`modulo-zero-result-type-number.test.ts:1566-1581`,
`object-pattern-head-unresolved-refusal.test.ts:1072-1087`,
`object-pattern-head-field-set-refusal.test.ts:1221-1238`,
`pattern-field-literal-integer-narrowing-refusal.test.ts:969-983`,
`binder-param-type-projection.test.ts:481-495`,
`binder-prompt-description-hint-line-forgery.test.ts:409-427`, and
`interpolation-parse-diagnostics.test.ts:1239-1257` — are the same two shapes
already excerpted above, re-read at each cited range and omitted here only for
length). `tests/committed-fixture-parse-gate.test.ts:73-94` carries a fourth,
near-identical copy under the same `discoverShippedFixtures` name (that file
is the named gate/kin carve-out, so it is not counted among the 15 sites, but
its presence shows the shape these 15 files each converged on independently
already has a canonical form on disk).

## Why this is a problem
The same 8-to-18-line "list the git-tracked `.theta`/`.thetalib` corpus, fail
loudly if `git` or the corpus is unavailable" sequence is authored from
scratch at all 15 cited sites, with no shared source of truth. The
duplication has already drifted into two incompatible families — one calls
`execFileSync` and splits `stdout` on `"\n"` with a per-call `.trim()`/`.filter`
chain and an inline `expect(...).toBeGreaterThan(0)` or `if (...) throw`; the
other wraps `spawnSync` with an explicit `result.error`/`result.status` check
and NUL-delimited (`-z`) splitting behind a named function — and, within the
second family, three separate files (`match-fn-return-lub-dominating-discipline.test.ts`,
`binder-prompt-description-hint-line-forgery.test.ts`,
`type-name-as-value-refusal.test.ts`) each independently named their copy
`committedThetaSources`, and a fourth (`binder-param-type-projection.test.ts`)
matches that name too, while a fifth (`params-default-unresolvable-enum-variant.test.ts`)
calls the identical body `committedThetaCorpus` and a sixth
(`interpolation-parse-diagnostics.test.ts`) calls it `discoverShippedFixtures`
— the same name `tests/committed-fixture-parse-gate.test.ts` already uses for
its own copy. This is the shape `tests/helpers/corpus-reader.ts`'s own header
comment describes for a sibling case it already fixed ("`repoFile` /
`readCorpus` / `linesOf` were redefined, byte-for-byte apart from the bug
number named inside the thrown message, in several `b02xx`/`b04xx` spec-gate
test files (PTQ-0208)"): the corpus-fetch step here is the same kind of
byte-for-byte-apart-from-wording duplicate, just for a `.theta`/`.thetalib`
file listing rather than a single doc-corpus read, and no comparable
extraction exists for it yet.

## Suggested direction (non-binding, optional)
A `tests/helpers/` module — alongside the existing `corpus-reader.ts`, which
already centralises the analogous "read one corpus file, fail loud on
absence" step for the doc/spec-corpus oracle files — is the natural home for
the "list the committed `.theta`/`.thetalib` corpus via `git ls-files`, fail
loudly if `git` is unavailable or the corpus is empty" step; each file's own
per-bug offender-matching logic over the returned list would stay local,
exactly as `corpus-reader.ts`'s own header states it left each file's
own reader local while centralising only the shared read.

## False-positive check
- Gate-pin check: none of the 15 cited files match `*gate*.test.ts` or its
  named kin; `tests/committed-fixture-parse-gate.test.ts` itself carries a
  fourth near-identical copy (`discoverShippedFixtures`, `:73-94`) but is
  excluded from the 15 sites and from `locations` because it is the carved-out
  gate file — it is cited only as evidence that the shape these 15 files
  converged on independently already exists canonically on disk. This finding
  does not dispute any pinned count or census inventory produced by these
  cells; it is scoped to the corpus-discovery plumbing that precedes them.
- Recording-double check: not applicable — no fake, double, or MUST-NOT
  witness is at issue; the cited code is a real `git` subprocess call, not a
  test double.
- docs/bugs/ signature search: `ls docs/bugs/ | grep -i "corpus\|census\|ls-files\|duplicat"`
  returned four files (0052, 0159, 0230, 0250), each a production-code bug
  about duplicate schema/enum field names, none shaped as a documented
  correct-reason red for this harness duplication.
- coverage-matrix/bug-doc citation search: `grep -rn "annotation-nontype-text-refusal"
  docs/` returns many hits (bugs 0093, 0130, 0145, 0150, 0203, 0204, 0205,
  0222, 0244, 0262, 0279), all naming other groups/line ranges in this file
  (group (o), cells i2/i4, f5/f6, g4, the s4/p1/p2 cells) — none names the (x)
  census cell or its 2601-2652 range. `grep -n "the committed corpus declares
  no annotation" docs/reference/coverage-matrix.md` returned nothing. This
  finding proposes no merge, rename, or deletion of any test or cell; it
  observes duplicated setup code that precedes each file's own (untouched)
  census assertions.
- Coverage drift check: this finding does not claim a missing test or an
  untested path; every cited site is an existing, currently-passing harness
  sequence, and the claim is limited to its repetition across files.

## Triage
verdict: confirmed — every cited excerpt and line range reproduces at HEAD across all 15 sites, independently re-confirmed via `rg '(execFileSync|spawnSync)\("git",\s*\[\s*"ls-files"' tests/*.test.ts` (exactly 15 hits, none in the gate file), the two stylistic families and all four named-function collisions (`committedThetaSources` ×4, `committedThetaCorpus`, `discoverShippedFixtures` matching the gate file's own name at :73-94) check out verbatim, `tests/helpers/` has no export covering this discovery step, no gate/pin carve-out applies (none of the 15 filenames match `*gate*`), and no existing PTQ — including the analogous PTQ-0208 `readCorpus` case, which centralises a different single-file read — already tracks this `git ls-files` corpus-discovery duplication (triage: claude-opus-5)
