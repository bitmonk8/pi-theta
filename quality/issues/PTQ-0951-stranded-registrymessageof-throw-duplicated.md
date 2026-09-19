---
id: PTQ-0951
title: inline-object-stranded-entry-refusal.test.ts's throw-based registryMessageOf is one of nineteen byte-identical repo-wide copies with no shared home
lens: D7
status: open
verdict: confirmed
locations:
  - tests/inline-object-stranded-entry-refusal.test.ts:155-176
  - tests/inline-object-keyless-entry-refusal.test.ts:200-219
sites: 2
fix_scope: cross-module
d4_class: clone
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
fix_skips: 1
---

# inline-object-stranded-entry-refusal.test.ts's throw-based registryMessageOf is one of nineteen byte-identical repo-wide copies with no shared home

## Observation
`tests/inline-object-stranded-entry-refusal.test.ts` declares a local
`registryMessageOf(code: string): string` that looks up a registry row's
*Message* template and, if it is `undefined`, THROWS an `Error` naming the
missing code (rather than using `expect(...).toBeDefined()`). The identical
function shape — same signature, same `registryMessage(REGISTRY, code)` read,
same `if (template === undefined) { throw new Error(...) }` guard, same
closing `return template;` — recurs, independently declared with no shared
import, in at least nineteen `tests/*.test.ts` files repository-wide,
including a second file quoted below for a line-for-line structural
comparison. No `tests/helpers/` module exports this throw-based variant (the
only exported sibling, `tests/helpers/load-row-harness.ts`'s
`registryMessageOf`, uses `expect(...).toBeDefined()` instead of a throw and
takes `registry`/`registryPath`/`fills` as parameters, so it is not what any
of the nineteen files use).

## Evidence

`tests/inline-object-stranded-entry-refusal.test.ts:155-176` (re-read
immediately before filing):
```ts
/**
 * A registry row's normative *Message* template (DIAG-4), read rather than
 * restated. THROWS, naming the missing row, so a missing row can never degrade
 * an assertion below into a comparison against `undefined` and can never be
 * silently replaced by a hard-coded string. Called only from inside a test
 * body: at module scope a throw would abort collection and take the green
 * fences down with it.
 */
function registryMessageOf(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: the diagnostics code registry carries no Message row for ${code} — DIAG-4 ` +
        `(docs/spec_topics/diagnostics/diagnostic-shape.md) makes that column this file's only ` +
        `oracle, so a missing row is a loud harness failure, never a skip and never a ` +
        `hard-coded fallback. Bug 0256's §Fix carries the ` +
        `theta/parse/malformed-schema-field Trigger rewrite in the same commit as the site it ` +
        `is raised from (docs/spec_topics/diagnostics/code-registry-parse.md:99)`,
    );
  }
  return template;
}
```

`tests/inline-object-keyless-entry-refusal.test.ts:200-219` — the same
signature, the same `registryMessage(REGISTRY, code)` read, the same
`if (template === undefined) { throw new Error(...) }` shape and the same
closing `return template;`, differing only in the bug number and code named
inside the thrown message's text:
```ts
function registryMessageOf(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: the diagnostics code registry carries no Message row for ${code} — DIAG-4 ` +
        `(docs/spec_topics/diagnostics/diagnostic-shape.md) makes that column this file's only ` +
        `oracle, so a missing row is a loud harness failure, never a skip and never a ` +
        `hard-coded fallback. Bug 0244's §Fix carries the row's Trigger widening in the same ` +
        `commit as the sites it is raised from ` +
        `(docs/spec_topics/diagnostics/code-registry-parse.md:99)`,
    );
  }
  return template;
}
```

Exact search: `grep -rl "function registryMessageOf(code: string): string" tests/*.test.ts` returns exactly 19 files: `annotation-nontype-text-refusal.test.ts`, `b0449-reexport-chain-enum-unknown-variant.test.ts`, `b0450-imported-enum-system-param.test.ts`, `generic-argument-shredded-group-refusal.test.ts`, `inline-object-empty-entry-slot-refusal.test.ts`, `inline-object-keyless-entry-refusal.test.ts`, `inline-object-stranded-entry-refusal.test.ts`, `nested-inline-enum-generic-argument-refusal.test.ts`, `params-default-empty-literal-refusal.test.ts`, `params-default-string-literal-raw-newline.test.ts`, `params-default-trailing-residue-refusal.test.ts`, `params-default-type-compat.test.ts`, `params-default-unary-minus-non-numeric-refusal.test.ts`, `params-default-unresolvable-enum-variant.test.ts`, `params-inline-enum-position-refusal.test.ts`, `params-scalar-nontype-text-refusal.test.ts`, `query-annotation-nontype-text-refusal.test.ts`, `schema-body-nontype-text-refusal.test.ts`, `type-name-as-value-refusal.test.ts`. A companion exact search, `grep -rl "harness: the diagnostics code registry carries no Message row for" tests/*.test.ts`, returns exactly 8 of these 19 (the ones using this precise thrown-message wording, including the one in scope), confirming the thrown-message template — not only the surrounding function shape — is itself copy-pasted.

## Why this is a problem
The function is pure harness plumbing — how a test converts a registry-row lookup into a loud, named failure — not domain logic specific to any one bug's subject; the file's own doc comment states the design rationale for throwing rather than asserting (module-scope safety), which is a real, considered choice, but that choice does not require the whole body, including the thrown-message wording, to be retyped independently at each of nineteen sites. `tests/helpers/load-row-harness.ts` already exports a `registryMessageOf` for the same lookup-and-guard need, but its `expect`-based, parameterised shape is not what any of these nineteen files import or extend, so each file re-derived its own throw-based sibling instead of adding one beside the existing export.

## Suggested direction (non-binding, optional)
A throw-based `registryMessageOf(registry, registryPath, code)` sibling beside
`tests/helpers/load-row-harness.ts`'s existing `expect`-based export would
give the nineteen files one shared throwing variant to import instead of each
retyping the guard and its message text.

## False-positive check
- Gate-pin check: `tests/inline-object-stranded-entry-refusal.test.ts` does not match `*gate*.test.ts` or the named gate-kin patterns (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate, committed-fixture-parse-gate, registry-closed-set-corpus-gate); `ls tests/*gate*.test.ts | grep -i stranded` → 0 hits.
- Recording-double check: `registryMessageOf` performs a synchronous lookup and throw; it records no calls and backs no "never called" witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "inline-object-stranded-entry-refusal" docs/bugs/*.md` returns three documents (0256, 0281, 0282); all cite the file as a witness by cell id or by name, none names or depends on the internal shape of `registryMessageOf`, and none states a rationale for the function being retyped at each site rather than shared.
- coverage-matrix/bug-doc citation search: `grep -n "inline-object-stranded-entry-refusal" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of the file or any `it()`/`describe()` — only that the local `registryMessageOf` definition could be replaced by a shared throw-based export.
- Coverage check: the claim is entirely about a repeated function DEFINITION, not a missing test path; the function is exercised by the file's own currently-running `render()` calls.
- Prior-filing overlap check: `grep -rl "inline-object-stranded-entry-refusal" quality/intake/*.md quality/issues/*.md quality/resolved/*.md` returns PTQ-0555, PTQ-0596 (different fixture-builder/`expectGroup` root causes, disjoint from this function), PTQ-0205 (the `diagLines`/`diagCodes` rendering pair, already fixed/exported and a different function), and PTQ-0488 (the four-page `REGISTRY` read itself, already fixed — this file now imports `REGISTRY` from `registry-oracle.ts`, and this finding is about the message-lookup guard built on top of that import, not the read). None of these covers `registryMessageOf`'s throw-based body; `PTQ-0638` covers a structurally different, `expect`-based `registryMessageOf` (no `fills` split into a separate `line()` helper) in two files outside this review's scope, which is not this pattern.

## Triage
<!-- pending -->
verdict: questionable — independently re-verified: both excerpts reproduce verbatim at tests/inline-object-stranded-entry-refusal.test.ts:155-176 and tests/inline-object-keyless-entry-refusal.test.ts:200-219 (same lookup→throw-if-undefined→return skeleton, differing only in the per-bug tail sentence), the in-scope copy is live (2 call sites), both locations under tests/, D7 boilerplate-duplication class, no gate/recording-double/coverage-matrix carve-out, and it is not a duplicate (same-wave d7-01-query-annotation triage names the throw-shaped reader a distinct root cause; no open PTQ tracks it) — but the accounting is overstated and the anchor collides with a recorded fix decision: awk-extracting every `function registryMessageOf(code: string): string` body shows only 10 of the 19 throw (9 — b0449, b0450, params-default-empty-literal, -string-literal-raw-newline, params-scalar-nontype-text, generic-argument-shredded-group, nested-inline-enum-generic-argument, params-inline-enum-position, schema-body-nontype-text — are `expect`-based and already covered by confirmed d7-02-params-inline-enum / pending d7-03), of the 10 only the 4 params-default copies are byte-identical while the 6 long-template copies each carry a distinct bug-0256/0244/0257/0124/0203/0140 sentence, and the "8 of these 19" message grep is 6-of-19 plus 2 `templateOf` functions in let-annotation-inline-object-compat / qry4-refused-annotation-withhold; more importantly resolved PTQ-0215 — whose title names `registryMessageOf` and whose evidence quoted this same 19-file count — was fixed by centralising the REGISTRY read only, and that fix wrote into tests/helpers/registry-oracle.ts:7-10 that each file's `registryMessageOf`-shaped reader "whose assertion style and wording vary per file — stays local", a split PTQ-0659/0488/0473's accept notes reiterated; no helper exports a throw body so the fix mints a new parameterised export (per-file message tail) rather than a drop-in migration, so whether to override the PTQ-0215 fixer's recorded decision for ~9 lines × 10 files needs a human ruling; if accepted, scope to the 10 throw-based files, not 19 (triage: claude-fable-5-1)
verdict: questionable — re-verified independently: both excerpts reproduce verbatim at tests/inline-object-stranded-entry-refusal.test.ts:155-176 and tests/inline-object-keyless-entry-refusal.test.ts:200-219 and both copies are live (called at :218 / :290 inside test bodies); the signature grep reproduces at exactly 19 tests/*.test.ts files and the message grep at exactly 8, both locations under tests/, D7 boilerplate-duplication class, not a gate file, not a recording double, 0 coverage-matrix hits, docs/bugs 0256/0281/0282 cite the file only as a witness, and no open PTQ tracks the throw-based reader in either file (PTQ-0555/0596/0878 cite these files for other helpers; PTQ-0880/0861 cover the expect-based copies) — but the title's "nineteen byte-identical" accounting is refuted (awk-extracted bodies: 9 of the 19 are `expect`-based, 10 throw, and of those 10 only the 4 params-default copies hash identical while the 6 long-message copies each carry a distinct per-bug tail sentence; the 8-file message grep is 6 of the 19 plus two `templateOf` readers), and the anchor collides with a recorded fix decision: resolved PTQ-0215 (whose title and 19-file count named `registryMessageOf`) was fixed by centralising the REGISTRY read only, with tests/helpers/registry-oracle.ts:7-10 stating that each file's `registryMessageOf`-shaped reader "stays local" and PTQ-0659's accept note reiterating that split, and no helper exports a throw-based body, so the fix is a newly minted per-file-message-parameterised export rather than a drop-in migration — whether to override that recorded split for ~9 lines × 10 files is a human ruling; if accepted, scope to the 10 throw-based files, not 19 (triage: claude-fable-5-1)
verdict: questionable — independently re-verified: both excerpts reproduce verbatim at tests/inline-object-stranded-entry-refusal.test.ts:155-176 and tests/inline-object-keyless-entry-refusal.test.ts:200-219 (same read→throw-if-undefined→return skeleton, differing only in the per-bug tail sentence), both copies live (called :218 / :290), signature grep = 19 and message grep = 8 both reproduce, both sites under tests/, D7 boilerplate-duplication class, not a gate file, not a recording double, 0 coverage-matrix hits, docs/bugs 0256/0281/0282 cite the file only as a witness, and no open PTQ tracks the throw-based reader in these two files (PTQ-0880/0861 cover the expect-based copies; PTQ-0750/0826 the REGISTRY read; PTQ-0555/0596/0878 other helpers) so not a duplicate — but the title's "nineteen byte-identical" is refuted by awk-extracted bodies (md5 in mktemp): 9 of 19 are `expect`-based, 10 throw, and of the 10 only the 4 params-default copies hash identical while the 6 long-message copies each carry a distinct bug-numbered sentence; the 8-file message grep is 6 of the 19 plus two `templateOf` readers; and the anchor collides with a recorded fix decision — resolved PTQ-0215 (title and 19-file count named `registryMessageOf`) was fixed by centralising the REGISTRY read only, tests/helpers/registry-oracle.ts:7-10 states each file's reader "whose assertion style and wording vary per file — stays local", PTQ-0659 reiterated that split, and load-row-harness.ts:62-72's only export is `expect`-based, so the fix mints a new throw-shaped, message-parameterised export rather than migrating to an existing one; overriding that recorded split for ~9 lines × 10 files is a human ruling — if accepted, scope to the 10 throw-based files, not 19 (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-18), NARROWED: dedupe exactly the TWO cited throw-based registryMessageOf copies (inline-object-stranded-entry-refusal.test.ts, inline-object-keyless-entry-refusal.test.ts) into the same home the PTQ-0880/PTQ-0861 fixes establish for the expect-based family (or a throw variant beside it in load-row-harness). The title's 'nineteen byte-identical copies' claim is REFUTED (triage hashing: 9 expect-based, only 4 of 10 throw-based identical) - do not chase the other seventeen under this issue.

## Fix attempts
- qw20260919193904: skipped — [PTQ-0967-fnarg-letrhs-message-builders-duplicated.md] PTQ-0967: Shared six builder pairs through registry-oracle, preserving each file's failure wording. / PTQ-0971: Reused the shared AJV fixture at seven remaining sites; five were already deduplicated. Preserved the distinct production-slug fixture. / PTQ-0972: Replaced the local registry read with readRegistry(["parse"]), retaining the error-message path. / PTQ-0973: Imported shared at/render helpers at three remaining sites. No tests or assertions changed across any issue; the required tsc and full test gate passed (689 files, 11,586 tests). || [PTQ-0975-invoke-arg-array-literal-registry-read-not-migrated.md] PTQ-0975: Replaced local registry parsing with readRegistry(["parse"]); preserved error wording and all assertions. Required TypeScript/full-test gate passed. / PTQ-0977: Replaced duplicated two-page parsing with readRegistry(["parse", "load"]); preserved shard order and all assertions. Required gate passed. / PTQ-0978: Adopted shared production-load and workspace helpers; preserved per-call isolation and cleanup. No tests deleted or weakened. Required gate passed. / PTQ-0981: Imported shared diagLines and removed its local copy and unused types; all assertions preserved. Exact required gate passed: TypeScript clean, 689 test files and 11,586 tests passed. || [PTQ-0982-hexinvocationroot-reimplements-imported-rootdouble.md] PTQ-0982: Delegated hexInvocationRoot to rootDouble with an invocation-ID override; sequence behavior preserved. / PTQ-0983: Shared invokeArgMessage across all five triaged copies, preserving registry interpolation and failure checks. / PTQ-0984: Shared loweredParams across all eight triaged copies, preserving source construction and paths; affected live cell passed. / PTQ-0986: Imported the existing noopPi and removed its local duplicate. No tests or assertions removed across these fixes; required gate passed—TypeScript clean, 689 files and 11,586 tests green. ||
