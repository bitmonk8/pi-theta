---
id: PTQ-0469
title: frontmatter-contract.test.ts redefines bind-context-transcript.test.ts's resolvingMatcher/theta()/withCode()/parse() frontmatter-parse harness
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/bind-context-transcript.test.ts:345-366
  - tests/frontmatter-contract.test.ts:22-49
sites: 2
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# frontmatter-contract.test.ts redefines bind-context-transcript.test.ts's resolvingMatcher/theta()/withCode()/parse() frontmatter-parse harness

## Observation
Both files independently declare the same four-piece harness for building and
parsing a `.theta` source from frontmatter lines and reading a diagnostic off
the result: a `resolvingMatcher` constant, a `theta(...frontmatterLines)`
fixture builder, a `withCode(diags, code)` diagnostic-finder, and a `parse(...)`
wrapper around `parseFrontmatter`. `theta()` and `withCode()` are byte-identical
between the two files; `resolvingMatcher` is byte-identical; `parse()` differs
only in that `frontmatter-contract.test.ts`'s version accepts an optional
second `matcher` parameter defaulting to `resolvingMatcher`, which is the exact
behaviour `bind-context-transcript.test.ts`'s fixed single-parameter `parse()`
already has when called with one argument.

## Evidence
tests/bind-context-transcript.test.ts:345-366:
```ts
const resolvingMatcher: ModelReferenceMatcher = { resolve: () => "resolved" };

function parse(source: string): FrontmatterParseResult {
  return parseFrontmatter(source, { file: "test.theta", modelMatcher: resolvingMatcher });
}

function theta(...frontmatterLines: string[]): string {
  return ["---", ...frontmatterLines, "---", "@`hello`"].join("\n");
}

function withCode(diags: readonly Diagnostic[], code: string): Diagnostic | undefined {
  return diags.find((d) => d.code === code);
}
```

tests/frontmatter-contract.test.ts:22-49 (the same four names, in the same
order, `theta()` and `withCode()` byte-identical, `parse()` widened by one
optional parameter):
```ts
function withCode(diags: readonly Diagnostic[], code: string): Diagnostic | undefined {
  return diags.find((d) => d.code === code);
}

/** A matcher that resolves every reference (for tests not exercising `model:`). */
const resolvingMatcher: ModelReferenceMatcher = { resolve: () => "resolved" };

/** A matcher that returns a fixed outcome for every reference. */
function fixedMatcher(outcome: ModelMatchOutcome): ModelReferenceMatcher {
  return { resolve: () => outcome };
}

/** Parse a full `.theta` source under the given (default resolving) matcher. */
function parse(
  source: string,
  matcher: ModelReferenceMatcher = resolvingMatcher,
): FrontmatterParseResult {
  return parseFrontmatter(source, { file: "test.theta", modelMatcher: matcher });
}

/** Build a `.theta` source from frontmatter lines plus a trivial body. */
function theta(...frontmatterLines: string[]): string {
  return ["---", ...frontmatterLines, "---", "@`hello`"].join("\n");
}
```

Exact search: `grep -rn "function theta(\.\.\.frontmatterLines: string\[\]): string {" tests --include="*.test.ts"`
returns exactly these two files (bind-context-transcript.test.ts:351,
frontmatter-contract.test.ts:49) and no others.

## Why this is a problem
The `theta()` fixture builder and the `withCode()` diagnostic finder are
retyped whole, byte-for-byte, into a second file that already has direct
access to the same `parseFrontmatter`/`ModelReferenceMatcher`/`Diagnostic`
imports; `resolvingMatcher` is likewise retyped verbatim. Neither file cites
the other as the origin of this harness, and no `tests/helpers/` module
exports any of the four names, so a reader of either file sees this plumbing
presented as freshly authored for that file alone.

## Suggested direction (non-binding, optional)
Both files already import `parseFrontmatter`, `FrontmatterParseResult`,
`ModelReferenceMatcher`, and `Diagnostic` directly; that shared import surface
is where a `theta()`/`withCode()`/`resolvingMatcher`/`parse()` frontmatter-parse
fixture module would sit beside the harness both files already build on.

## False-positive check
- Gate-pin check: neither `bind-context-transcript.test.ts` nor
  `frontmatter-contract.test.ts` matches `*gate*.test.ts` or the named kin
  (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate).
- Recording-double check: `theta()` builds a fixture string, `parse()` invokes
  the parser under test, and `withCode()` reads a field off an already-returned
  diagnostics array — none records a call to prove something was never
  invoked, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "frontmatter-contract\|bind-context-transcript" docs/bugs`
  returns only `0398-custom-type-unsafe-diagnostic-never-materialised.md` and
  `0478-compact-transcript-renderer-throws-on-augmented-agentmessage-variants.md`,
  neither of which discusses or pins this fixture/finder harness (0398/0478
  concern the compact-transcript renderer's custom-type-unsafe and
  augmented-AgentMessage-variant behaviour, not frontmatter parsing) — this is
  not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "frontmatter-contract\|bind-context-transcript" docs/reference/coverage-matrix.md`
  → 0 hits. This finding proposes no merge, rename, or deletion of either test
  file — only that the internal fixture-builder/finder/matcher trio could be
  shared — so no witness-list citation is disturbed.
- Distinct from the widely-used `withCode(diags, code)` one-line idiom that
  recurs on its own across 30+ unrelated test files repository-wide (an
  established convention this finding does not challenge): the claim here is
  narrower — the SAME four names (`resolvingMatcher`, `theta`, `withCode`,
  `parse`) recur TOGETHER, as a single frontmatter-parsing harness, in exactly
  these two files, confirmed by the `theta(...frontmatterLines)` search
  returning only these two hits.
- Coverage check: the claim is entirely about a repeated harness DEFINITION;
  every function cited is exercised by the tests already present in each of
  its two files.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts reproduce (bind-context-transcript.test.ts:345-357 verbatim; frontmatter-contract.test.ts:27-51, minor drift from cited 22-49) with resolvingMatcher/theta()/withCode() byte-identical and parse() differing only by the optional defaulted matcher param; the `function theta(...frontmatterLines` search returns exactly these two files; neither is a gate/kin file, no recording double, coverage-matrix.md 0 hits, docs/bugs 0398/0478 pin the renderer cells (lines 300-336) not this harness, both files green (28/28); PTQ-0227 is a different harness (doc()/expectRow/expectNoRow over parseDoc) so not a duplicate — genuine D7 copy-paste fixture in tests/. Two accuracy notes for the fixer, neither refuting: (1) the copy direction in the title is reversed — frontmatter-contract.test.ts landed first (2db83640, 2026-06-30) and bind-context-transcript.test.ts a day later (292e918d, 2026-07-01); (2) sites is undercounted — the same resolvingMatcher+parseFrontmatter-wrapper+withCode harness recurs with theta() folded into parse(...frontmatterLines) in tests/e2e-s2-advisory-diagnostics.test.ts:28-37, tests/e2e-s2-frontmatter-fields.test.ts:27-36 and tests/frontmatter-tool-loop-respond-repair.test.ts:40-55, so any shared helper should absorb those three copies too (triage: claude-fable-5-1)
