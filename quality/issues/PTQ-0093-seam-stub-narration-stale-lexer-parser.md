---
id: PTQ-0093
title: Six lexer/parser/mvp seam modules still narrate their tests-task stub state as current ("stubs X as an inert no-op", "until V1b fills in", "the body below is an inert stub") after every paired implementation leaf landed
lens: D2                     # the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/lexer/lexer.ts:11-14
  - src/lexer/lexer.ts:41-46
  - src/lexer/lexer.ts:48-53
  - src/lexer/literals.ts:27-29
  - src/mvp/minimal-theta.ts:12-16
  - src/parser/callable-set.ts:25-30
  - src/parser/frontmatter.ts:14-18
  - src/parser/control-flow.ts:62
  - src/parser/control-flow.ts:101
  - src/parser/control-flow.ts:144
sites: 10                    # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# Six lexer/parser/mvp seam modules still narrate their tests-task stub state as current ("stubs X as an inert no-op", "until V1b fills in", "the body below is an inert stub") after every paired implementation leaf landed

## Observation
Each of these modules was delivered in two commits: a tests-task (`*-T`) that
declared the seam with an inert stub, then the paired implementation leaf
that filled it in. The header (or per-function doc) narration written for the
stub era remains, in present tense, asserting that the implementation is
absent — while the implementation sits in the same file. One root cause,
replicated per module: the tests-task narration was never retensed when the
paired leaf landed.

## Evidence
src/lexer/lexer.ts:11-14 — header asserts the logic "is absent":
```
// V1a-T (tests-task) declares this seam shape and stubs `lexTheta` as an inert
// no-op so the failing tests compile and red on their own primary assertions
// (the tokeniser / validator / continuation logic is absent). The paired V1a
// implementation leaf fills it in.
```
`lexTheta` in the same file validates, normalises, tokenises, and emits
(lexer.ts:101-133, e.g. `emitDiagnosticBatch([encodingDiag], deps)` at :109
and `return { tokens, diagnostics, ok: diagnostics.length === 0 }` at :133).

src/lexer/lexer.ts:41-46 — `Token.value` doc still says "until V1b fills in":
```
  /**
   * For `string` tokens: the decoded literal value with the escape table
   * (`\"`, `\'`, `\\`, `\n`, `\t`, `\r`, `\u{XXXX}`) lowered to its characters
   * (lexical.md §"String literals"). Absent on non-string tokens and until V1b
   * fills in escape decoding.
   */
```
Escape decoding is in this same file: the string arm pushes `value`
(lexer.ts:588-592).

src/lexer/lexer.ts:48-53 — `Token.numericType` doc, same shape:
```
  /**
   * For `number` tokens: the integer/number type classification — a literal
   * with no fractional or exponent part is `integer`, otherwise `number`
   * (lexical.md §"Number literals"). Absent on non-number tokens and until V1b
   * fills in numeric typing.
   */
```
Numeric typing is in this same file: the number arm pushes `numericType`
(lexer.ts:701-706).

src/lexer/literals.ts:27-29 — header asserts both functions are inert:
```
// V1b-T (tests-task) declares the seam shapes and stubs both functions as inert
// no-ops so the failing tests compile and red on their own primary assertions
// (no diagnostic produced). The paired V1b implementation leaf fills them in.
```
Both are implemented below (`validatePathLiteral` emits
`theta/parse/invalid-path-separator` at literals.ts:78; `checkIntegerNarrowing`
returns its diagnostic at :119-133).

src/mvp/minimal-theta.ts:12-16 — header asserts the body "is an inert stub":
```
// This file is the seam the `M-T` tests pin and the `M` implementation fills
// in. Until `M` lands the parse + prompt-mode drive, the body below is an inert
// stub: it registers the command (so the harness can dispatch it) but drives no
// turn, so the `M-T` SLSH-2 assertions red on the absent prompt-mode pipeline —
// the intended-reason red for the tests task.
```
The body parses and drives the turn (`pi.sendUserMessage(parsed.queryText)`
at minimal-theta.ts:112, `await ctx.waitForIdle()` at :113).

src/parser/callable-set.ts:25-30 — header asserts the resolver is inert:
```
// V6c-T (tests-task) declares the seam shapes — `resolveCallableSet`, the
// injected `CallableSetDeps` lookups, the `ToolsField` input, and the
// `CallableSetSnapshot` / result records — and stubs `resolveCallableSet` as an
// inert seam (registers an empty, unfrozen snapshot; raises no diagnostic) so
// the failing V6c-T tests compile and red on their own primary assertions. The
// paired V6c implementation leaf fills it in.
```
The implementation raises the nine rejections and freezes the snapshot
(`Object.freeze({ entries })`, callable-set.ts:316).

src/parser/frontmatter.ts:14-18 — header asserts the parser is inert:
```
// V6a-T (tests-task) declares the seam shapes — `parseFrontmatter`, the
// `ModelReferenceMatcher` injection interface, and the result/option records —
// and stubs `parseFrontmatter` as an inert seam so the failing tests compile and
// red on their own primary assertions. The paired V6a implementation leaf fills
// it in.
```
`parseFrontmatter` implements the whole field contract (e.g. the
`theta/load/missing-mode` emission at frontmatter.ts:2050).

src/parser/control-flow.ts:62, :101, :144 — three per-function docs assert a
present-tense stub:
```
 * V3c-T stubs this inert (always `undefined`); the paired V3c leaf fills it in.
```
Each function directly below is implemented (e.g. `checkForIterand` returns
`theta/parse/non-array-iterand` at control-flow.ts:76).

## Why this is a problem
Historical narration comments: each excerpt makes a present-tense claim about
the file — "the tokeniser / validator / continuation logic is absent", "until
V1b fills in", "the body below is an inert stub", "stubs `resolveCallableSet`
as an inert seam", "V3c-T stubs this inert (always `undefined`)" — that is
false against the code in the same file. Git shows each paired leaf landed:
V1a 9021a627, V1b b7f981a9, M 0823f3b3, V6c 8ab16c21, V6a 4843d586, V3c
15a3f4c0. The narration describes the delivery process's intermediate state,
not the shipped module, and a reader trusting it would conclude these checks
and pipelines do not exist. bindings.ts's header in the same scope shows the
retensed form ("V3b-T … stubbed the five behaviour-bearing functions; V3b
(this leaf) implements every check"), so the stale six are the exception, not
the convention.

## Suggested direction (non-binding, optional)
Retense or drop the stub-era sentences the way bindings.ts's header already
does — state what the module owns now, and leave the tests-task/leaf split to
git history.

## False-positive check
- Verified against current code that every narrated absence is present: lexer
  emission/return (lexer.ts:109, :133), string `value` (:588-592), number
  `numericType` (:701-706); literals diagnostics (literals.ts:78, :119-133);
  minimal-theta drive (minimal-theta.ts:112-113); callable-set frozen
  snapshot (callable-set.ts:316) and nine rejection codes; frontmatter
  missing-mode emission (frontmatter.ts:2050); control-flow diagnostics
  (control-flow.ts:76, :108-125, :150-158).
- Git intent check: each tests-task commit is followed by its implementation
  leaf commit on the same file (V1a-T 69ac631e → V1a 9021a627; V1b-T 8fa4239f
  → V1b b7f981a9; M-T 36c361e6 → M 0823f3b3; V6c-T 4562852e → V6c 8ab16c21;
  V6a-T 2db83640 → V6a 4843d586; V3c-T 103802e1 → V3c 15a3f4c0).
- Duplicate check: the already-filed stale-stub-narration findings cover
  other files (src/binder/system-note.ts; src/extension/inventory-closure-audit.ts
  + load-pre-eval.ts; src/discovery/settings.ts + discovery-walk.ts +
  package-discovery.ts; src/seams/schema-validator.ts; value-model;
  runtime/tool-call.ts; extension/factory.ts) — none cites any of these six
  files.
- Scope check: the same pattern also survives in files OUTSIDE this brief's
  scope (runtime/control-flow.ts:49, parser/literal-sublanguage.ts:597,
  parser/type-grammar.ts:99, parser/invoke-diagnostics.ts:36); they are not
  cited as locations here.

## Triage
verdict: confirmed — all 10 excerpts verbatim at the exact cited lines and every narrated absence is implemented in the same file (lexTheta :92-133, value :588-592, numericType :701-706, literals :78/:119-133, minimal-theta :112-113, freeze :316, missing-mode :2050, control-flow :76/:108-125/:150-158); all 12 paired tests-task/leaf commits resolve (M via the loom->theta rename), bindings.ts shows the retensed convention, and no sibling stub-narration candidate cites any of these six files (triage: claude-opus-5)
