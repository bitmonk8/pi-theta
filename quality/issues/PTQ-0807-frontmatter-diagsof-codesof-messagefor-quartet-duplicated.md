---
id: PTQ-0807
title: The FRONTMATTER/diagsOf/codesOf/messageFor production-parse-harness quartet is redeclared byte-identical in both in-scope index-*.test.ts files
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/index-element-alias-unfolded.test.ts:169-189
  - tests/index-sentinel-typeenv-case-fence.test.ts:162-182
sites: 2
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# The FRONTMATTER/diagsOf/codesOf/messageFor production-parse-harness quartet is redeclared byte-identical in both in-scope index-*.test.ts files

## Observation
Both in-scope files declare the same four module-scope items in the same
order with byte-identical bodies: the `FRONTMATTER` frontmatter-lines
constant, `diagsOf(body)` (joins `FRONTMATTER` and `body`, parses through the
shared `parseDoc`, returns `.diagnostics`), `codesOf(body)` (maps `diagsOf`'s
result to `.code`), and `messageFor(diags, code)` (looks up one diagnostic's
message via the shared `findCode` helper). Each file also independently
declares its own `msg()` registry-message filler beside this block, which is
a separate, file-local-by-design item under a prior accepted finding's
ruling and is not part of this claim.

## Evidence
tests/index-element-alias-unfolded.test.ts:169-189 (re-read immediately
before filing):
```ts
/** The frontmatter every body below is parsed under. */
const FRONTMATTER: readonly string[] = ["---", "mode: prompt", "---"];

/** The diagnostics the production parse reports for `body`, in emission order. */
function diagsOf(body: readonly string[]): readonly Diagnostic[] {
  return parseDoc([...FRONTMATTER, ...body].join("\n")).diagnostics;
}

/** The aggregated diagnostic codes, in emission order. */
function codesOf(body: readonly string[]): string[] {
  return diagsOf(body).map((d: Diagnostic) => d.code);
}

/**
 * The message reported for `code`, or `undefined` when no diagnostic carries it.
 * Selecting by code rather than by position keeps a message failure attributable
 * to its own row even where the code list is also wrong.
 */
function messageFor(diags: readonly Diagnostic[], code: string): string | undefined {
  return findCode(diags, code)?.message;
}
```

tests/index-sentinel-typeenv-case-fence.test.ts:162-182 — byte-identical:
```ts
/** The frontmatter every body below is parsed under. */
const FRONTMATTER: readonly string[] = ["---", "mode: prompt", "---"];

/** The diagnostics the production parse reports for `body`, in emission order. */
function diagsOf(body: readonly string[]): readonly Diagnostic[] {
  return parseDoc([...FRONTMATTER, ...body].join("\n")).diagnostics;
}

/** The aggregated diagnostic codes, in emission order. */
function codesOf(body: readonly string[]): string[] {
  return diagsOf(body).map((d: Diagnostic) => d.code);
}

/**
 * The message reported for `code`, or `undefined` when no diagnostic carries it.
 * Selecting by code rather than by position keeps a message failure attributable
 * to its own row even where the code list is also wrong.
 */
function messageFor(diags: readonly Diagnostic[], code: string): string | undefined {
  return findCode(diags, code)?.message;
}
```

Exact check: `diff <(sed -n '169,189p' tests/index-element-alias-unfolded.test.ts) <(sed -n '162,182p' tests/index-sentinel-typeenv-case-fence.test.ts)` produced zero differences (21 lines each, including the doc comments). Both files already import `parseDoc` and `findCode` from the same shared module (`./helpers/e2e-s1`, each file's own top-of-file `import` line), so the quartet is a thin, non-domain-specific wrapper layered directly on top of an already-shared entry point rather than two authors independently deriving the same shape from first principles.

## Why this is a problem
Both files are the unit-tier and restated-face-2 halves of the same two related bug reports (0125 and 0135, both naming the other in their own header comments — the sentinel-render/TypeEnv-write defect the first file leaves as groups (d7)/(d8)/(f1) and the second file closes as its own subject), yet each redeclares its own copy of the `FRONTMATTER`/`diagsOf`/`codesOf`/`messageFor` production-parse-body harness rather than sharing one declaration. A change to the frontmatter shape every body is parsed under, or to how a diagnostic's message is looked up by code, has to be made twice to stay in sync between the two files. This is the same boilerplate-duplication shape already confirmed for this repository's file-pair convention in PTQ-0592 (a six-function `theta`/`codesOf`/`render`/`range`/`messageFor`/`soleRange` block duplicated across a different file pair) and PTQ-0735 (a `FRONTMATTER`/`diagsOf`/`rowsOf`/`fnParamCarrier` block duplicated across a different file pair), where the accepted ruling in each case was that the harness plumbing — as distinct from each file's own `msg()`-style registry reader, which the registry-oracle.ts header rules stays local — is a natural shared-helper candidate.

## Suggested direction (non-binding, optional)
tests/helpers/e2e-s1.ts already hosts the `Diagnostic[]`-shaped precedents both files import beside this block (`parseDoc`, `findCode`); a `FRONTMATTER`/`diagsOf`/`codesOf`/`messageFor`-shaped export fits the same established home, leaving each file's own `msg()` registry reader local as PTQ-0735's triage already established for that shape.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate, committed-fixture-parse-gate, registry-closed-set-corpus-gate); this is a harness declaration, not a pinned count or inventory.
- Recording-double check: none of the four functions is a fake that records calls to back a MUST-NOT-called witness; the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "FRONTMATTER\b.*mode: prompt\|function diagsOf\|function codesOf\|function messageFor" docs/bugs/*.md` → 0 files; `grep -rl "index-element-alias-unfolded\|index-sentinel-typeenv-case-fence" docs/bugs/*.md` → docs/bugs/0125 and docs/bugs/0135 (and 0136/0247/0251/0262 by cross-reference within the files' own header comments) name the FILES as reproduction/witness sources but none documents this specific harness-quartet duplication as a correct-reason red, and this finding proposes no merge, rename, or deletion of either file or any `it()`/`describe()` block.
- coverage-matrix/bug-doc citation search: `grep -n "index-element-alias-unfolded\|index-sentinel-typeenv-case-fence" docs/reference/coverage-matrix.md` → 0 hits.
- Overlap check: `grep -rl "index-element-alias-unfolded\|index-sentinel-typeenv-case-fence" quality/intake/*.md quality/issues/*.md` (excluding this file) → one hit, quality/issues/PTQ-0776 (confirmed), which covers the LIVE-cell file `tests/live/index-sentinel-typeenv-case-fence-live-cell.test.ts` re-parsing the registry shard directly instead of importing `tests/helpers/registry-oracle.ts` — a disjoint file and a disjoint code block (the registry READ, not the `FRONTMATTER`/`diagsOf`/`codesOf`/`messageFor` quartet); both in-scope files here already import `readRegistry` from `./helpers/registry-oracle`, so PTQ-0776's claim does not reach either of them. No other filing names this quartet against this file pair.
- Coverage-drift check: this finding is about a harness declaration repeated across two files that already exist and already pass; it makes no claim that any behaviour or path is untested.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: sed-extracted tests/index-element-alias-unfolded.test.ts:169-189 vs tests/index-sentinel-typeenv-case-fence.test.ts:162-182 diff byte-identical (21 lines), both copies live (diagsOf/codesOf/messageFor called 42/15/46 and 15/7/11 times; 74/74 vitest green), both under tests/, D7 boilerplate-duplication class, no carve-out (not gate files, no recording double, no it()/file merge-rename-delete proposed, coverage-matrix 0 hits, docs/bugs signature grep 0), no shared helper exports this shape (tests/helpers grep for diagsOf/messageFor/FRONTMATTER → only load-row-harness's string-form LOAD_ROW_FRONTMATTER) — two accounting corrections for the fixer, neither refuting: (1) `sites: 2` undercounts — the same FRONTMATTER→messageFor block is byte-identical (md5 96360ad1) in tests/alias-sink-array-element-check.test.ts:141-160 and tests/fn-param-alias-unfolded-at-gates.test.ts:145-164 too, and present with interposed helpers in tests/fn-param-sink-array-literal.test.ts:151-185 and tests/nested-array-element-sink-descent.test.ts:141-175, so the shared export must serve six files and those four sites should be folded into this PTQ's location list at acceptance; (2) the FRONTMATTER/diagsOf half is byte-identical to the withheld-sentinel copies PTQ-0735 already tracks (its direction proposes the same tests/helpers export), so this is a sibling not a duplicate — the codesOf(body)/messageFor wrappers are outside PTQ-0735's inventory — but the two fixes should land one shared declaration, not two; the filing's docs/bugs file-name grep also undercounts (14 bug docs name the files, not 2), immaterial since nothing is merged or deleted (triage: claude-fable-5-1)
