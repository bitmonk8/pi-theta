---
id: PTQ-0778
title: static-type-inference.test.ts redeclares the full invoke-seam-scaffold no-op checkpoint/mutator/span triad instead of importing it
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: intake
verdict: questionable
locations:                   # every cited site, repo-relative path:line-range
  - tests/static-type-inference.test.ts:52-54
  - tests/static-type-inference.test.ts:167-180
  - tests/helpers/invoke-seam-scaffold.ts:29-53
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 2
---

# static-type-inference.test.ts redeclares the full invoke-seam-scaffold no-op checkpoint/mutator/span triad instead of importing it

## Observation
`tests/static-type-inference.test.ts` declares its own module-scope `span()`
function, `NOOP_CHECKPOINT` constant, and `NoopMutator` class, all three of
which are functionally identical to the exports
`tests/helpers/invoke-seam-scaffold.ts` already publishes for exactly this
purpose (`span()`, `SEAM_NOOP_CHECKPOINT`, `SEAM_NOOP_MUTATOR`). The reviewed
file drives the real `executeBody` over these inert stand-ins (its "read-only
composition" bullet) but imports none of the three from the helper.

## Evidence
`tests/static-type-inference.test.ts:52-54`:
```ts
function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}
```

`tests/static-type-inference.test.ts:167-180`:
```ts
const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

/** A no-op partial-append mutator (the read-only body triggers no mutation). */
class NoopMutator implements CommittedConversationMutator {
  truncate(): void {}
  rewrite(): void {}
  replace(): void {}
  remove(): void {}
  injectCompensatingTurn(_surface: CommittedSurface): void {}
}
```

`tests/helpers/invoke-seam-scaffold.ts:29-53` (the canonical exports,
value-for-value identical to the reviewed file's own three copies above,
modulo the object-literal-vs-class spelling of the mutator):
```ts
export const SEAM_NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

/** A `ToolLoweringSink` that discards every diagnostic/system-note. */
export const SEAM_NOOP_SINK: ToolLoweringSink = {
  diagnostic(): void {},
  systemNote(): void {},
};

/** A `CommittedConversationMutator` whose every method is a no-op. */
export const SEAM_NOOP_MUTATOR: CommittedConversationMutator = {
  truncate(): void {},
  rewrite(): void {},
  replace(): void {},
  remove(): void {},
  injectCompensatingTurn(_surface: CommittedSurface): void {},
};

/** A throwaway 1:1–1:2 `SourceRange`, for a scaffold expr/site that carries no
 *  real source position. */
export function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}
```

Search: `grep -n "^function span\|^const NOOP_CHECKPOINT\|^class NoopMutator"
tests/static-type-inference.test.ts` returns exactly the three declarations
cited above, and none of them import from `"./helpers/invoke-seam-scaffold"`
(`grep -n "invoke-seam-scaffold" tests/static-type-inference.test.ts` — 0
hits).

## Why this is a problem
All three no-op stand-ins the file's "read-only composition" test needs
(`span()` for its hand-built AST spans, `NOOP_CHECKPOINT` for its
`ExecuteBodyDeps.checkpoint`, `NoopMutator` for its `.mutator`) are, method
body for method body, the same inert scaffolding
`tests/helpers/invoke-seam-scaffold.ts` already exports under its own
canonical name — a module whose own header states it exists precisely
because this triad recurs byte-for-byte across `executeBody`-driving test
files. The reviewed file is one more site reconstructing that same triad by
hand.

## Suggested direction (non-binding, optional)
Importing `SEAM_NOOP_CHECKPOINT`, `SEAM_NOOP_MUTATOR`, and `span()` from
`tests/helpers/invoke-seam-scaffold.ts` in place of the file's own three
local declarations is the natural fit the helper's own stated purpose points
to; this is an observation about the existing import surface, not a design
for the change.

## False-positive check
- Gate-pin carve-out: `tests/static-type-inference.test.ts` is not a
  `*gate*.test.ts` file and asserts no pinned count/inventory this finding
  touches.
- Recording-double carve-out: `NoopMutator`'s methods are all no-ops with no
  call log; it is not a MUST-NOT-called negative witness (unlike the file's
  separate `RecordingHost`-adjacent doubles in sibling files), so the
  carve-out does not apply, and this claim is not about any assertion's
  ability to fail.
- docs/bugs/ signature search: `grep -rl "static-type-inference"
  docs/bugs/*.md` — 0 hits; no bug document pins or excuses this file's local
  `span`/`NOOP_CHECKPOINT`/`NoopMutator` block.
- coverage-matrix/bug-doc citation search: `grep -n "static-type-inference"
  docs/reference/coverage-matrix.md` — hits exist naming the file as a whole
  by its own row (cka-token), never the internal `span`/`NOOP_CHECKPOINT`/
  `NoopMutator` block; this finding proposes no merge, rename, or deletion of
  the file or any test in it, only that the three no-op constructs could
  import the existing scaffold instead of redeclaring it.
- Reference/callers check: `tests/helpers/invoke-seam-scaffold.ts`'s exports
  are live (its own header names bug 0294/0295/0347/0349 as importers; this
  same wave's shards confirm further importers), not a dead-code target
  being proposed.
- Coverage-drift check: this finding is about a redeclared no-op scaffold, not
  a missing test path; the file's own per-node and read-only-composition
  tests are unaffected by this claim.

## Triage
<!-- triage appends its note here -->
verdict: questionable — observation reproduces (span()/NOOP_CHECKPOINT/NoopMutator at :52-54/:167-180 are body-for-body identical to invoke-seam-scaffold.ts:29-53, 0 helper imports, 0 coverage-matrix hits, not covered by PTQ-0244/0301/0344 which each migrated a different b-file) but the anchor is overstated: this file (57dd14ef, 2026-07-04) predates the helper (f593d10e, 2026-09-12) and was never in the helper's header roster, which scopes it to the four invoke/code-call bug-witness files around an InvokeChild double this test does not use; the identical local no-op Checkpoint appears in 84 tests/ files and the no-op mutator in 19, so whether invoke-seam-scaffold becomes the suite-wide no-op ExecuteBodyDeps home (vs this being one shard of a pervasive idiom, cf. PTQ-0278's 47-file span() note) is a human ruling, not a mechanical un-migrated residual (triage: claude-fable-5-1)
verdict: confirmed — independently re-verified: `span()` :52-54, `NOOP_CHECKPOINT` :167-171 and `NoopMutator` method bodies :175-179 each sed-extracted and diffed against tests/helpers/invoke-seam-scaffold.ts `span`/`SEAM_NOOP_CHECKPOINT`/`SEAM_NOOP_MUTATOR` → zero diff after name/export/class-vs-const normalisation; file imports nothing from invoke-seam-scaffold (0 hits; helper importers are exactly 3 files, this one absent) yet feeds them straight into the real `executeBody` deps (:218/:220) with no recording or negative-witness role; file is green (17/17), not a *gate* file, 0 docs/bugs cites of the test file (the candidate's 51 `static-type-inference` bug hits are all the src module), 0 coverage-matrix hits; not a duplicate — no issues/ or resolved/ row cites tests/static-type-inference.test.ts and same-shard d7-140-02 targets statement-executor; the prior questionable note's "predates the helper / not in its header roster" objection does not follow store precedent — PTQ-0650 (par-for-body-return-refusal, 2026-08-21) and PTQ-0705 (subagent-fn, 2026-07-21) likewise predate the 2026-09-12 helper, are absent from its roster, and were ratified confirmed as per-file not-migrated residuals, as were PTQ-0545/0594/0603/0613/0655/0720/0738 (triage: claude-fable-5-1)
verdict: questionable — parked by the store: skipped by the fixer in 2 waves (see "## Fix attempts"); rule with accept --note <direction> or reject (store)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
- qw20260919104142: skipped — [PTQ-0779-02-statement-executor-invoke-seam-scaffold-not-migrated.md] PTQ-0779: Already migrated to shared span and no-op checkpoint imports; no changes needed. / PTQ-0787: Replaced local parseDeps() with the existing helper import; all tests and assertions preserved. / PTQ-0788: Replaced local parseDeps() with the existing helper import; all tests and assertions preserved. / PTQ-0789: Both files now import the shared model and entry type and delegate appends to the newly exported existing helper; no tests or assertions removed. Required verification command passed: TypeScript and all 11,585 tests across 689 files. || [PTQ-0793-canonical-honesty-sorted-closure-duplicated.md] PTQ-0793: Reused assertKeysSorted; retained fragment equality, array-order, and whitespace checks. No tests deleted or renamed. / PTQ-0794: Reused inlineDefName; removed the inline hash computation and unused crypto import. No tests deleted or renamed. / PTQ-0795: Shared holder-bound accessors in scripted-live-session-harness.ts; preserved errors, casts, mocks, and assertions. No tests deleted or renamed. / PTQ-0796: Shared AST capture in e2e-s1.ts; preserved fixture paths and all three assertions. No tests deleted or renamed. Required gate passed for all four issues: TypeScript and 11,585 tests across 689 files; no production or quality-store changes. || [PTQ-0797-ctor-proto-named-field-livesessiondouble-not-migrated.md] PTQ-0797: Reused shared model, entry type, and append helpers; imported parseDeps from its current home, e2e-s1.ts. Recording behavior and assertions unchanged; no tests deleted. / PTQ-0798: Replaced all five duplicated diagnostic helpers across three files with existing exports; assertions unchanged and no tests deleted. / PTQ-0799: Replaced both local diagLines helpers with imports and removed unused types; assertions unchanged and no tests deleted. / PTQ-0800: Imported shared diagLines, preserving the lines wrapper and all assertions; removed unused types; no tests deleted. Exact required verification gate passed for all four issues: TypeScript clean, 689 test files and 11,585 tests passed. No production or quality-store edits. || [PTQ-0801-diaglines-reimplemented-inline-object-empty-pair.md] PTQ-0801: Replaced both local diagLines implementations with the existing shared helper; no tests removed. / PTQ-0804: Reused PARSE_REGISTRY and removed the duplicate registry interface/read; assertions unchanged and no tests removed. / PTQ-0806: Shared the diagnostic/fn harness across all five triaged sites, preserving the annotation-specific registration predicate; no tests renamed or removed. / PTQ-0808: Both triaged message readers now delegate to registryMessageOf, preserving registry scope and placeholder checks; no tests removed. Required gate passed for all fixes: tsc and 11,585 tests across 689 files. ||
- qw20260919114228: skipped — [PTQ-0778-01-static-type-inference-invoke-seam-scaffold-not-migrated.md] PTQ-0778: Already imports all three shared scaffold exports; no duplication remains and no changes made. / PTQ-0809: Reused parseTheta at all three sites, retained the frontmatter guard, and moved typed-query validation to fixture creation. No tests removed or renamed. / PTQ-0811: Both msg wrappers now delegate to registryMessageOf, preserving registry scope and placeholder checks. No tests removed or renamed. / PTQ-0812: Replaced duplicate registry loading and row type with readRegistry(["parse"]); assertions unchanged and no tests removed. Required verification command passed for all edits: TypeScript and 11,585 tests across 689 files. | review unconfirmed: PTQ-0778-01-static-type-inference-invoke-seam-scaffold-not-migrated.md — shed by the fixer (no working-tree change attributable), but the described problem is already absent at HEAD: tests/static-type-inference.test.ts line 1 imports span/SEAM_NOOP_CHECKPOINT/SEAM_NOOP_MUTATOR from ./helpers/invoke-seam-scaffold and the local span()/NOOP_CHECKPOINT/NoopMutator declarations cited at :52-54/:167-180 no longer exist (grep: only the import and a NOOP_CHECKPOINT usage at :193 remain). It was migrated by a prior wave's commit; the issue should be closed as already-resolved rather than re-queued. || [PTQ-0813-isregistrationerror-reimplements-isloadparseerror.md] PTQ-0813: Replaced all three predicate copies identified by triage with the existing isLoadParseError helper; assertions unchanged and no tests removed. / PTQ-0814: Centralized all four diagnostic-reader pairs in production-load-harness, preserving lazy outcome access and exact filtering; no tests removed. / PTQ-0815: Reused appendUserEntry/appendAssistantEntry and removed private append plumbing; recording and turn behavior unchanged, with no tests removed. / PTQ-0816: Reused rootDouble/noopPi and removed redundant doubles and imports; no tests removed. Required cluster gate passed: TypeScript succeeded and all 689 test files / 11,585 tests passed. || [PTQ-0817-misfire-faces-registry-msg-reimplements-load-row-harness.md] PTQ-0817: Reused the shared parse registry, row type, and registryMessageOf; existing assertions retained. / PTQ-0818: Replaced all seven redundant definedness checks with not.toThrow() preconditions; helper checks remain intact. / PTQ-0819: Both files now use registryMessageOf; removed the redundant row lookup and message-rendering boilerplate. / PTQ-0820: Reused runProductionLoad and LoadOutcome, extending options to preserve UI mode and system-note recording. No tests deleted or renamed across the cluster; required gate passed: TypeScript compilation and 689 files / 11,585 tests. || [PTQ-0822-off-surface-live-wiring-noop-checkpoint-sink-reimplemented.md] PTQ-0822: Re-verified and replaced local no-op checkpoint and sink with aliased shared imports; no tests or assertions removed or changed. Required gate passed. / PTQ-0823: Re-verified and replaced duplicate registry read with shared REGISTRY; local lookup wrapper, tests, and assertions unchanged. Required gate passed. / PTQ-0824: Re-verified and replaced local AJV factory with shared capturingAjv; tests and diagnostic-capture assertions unchanged. Required gate passed. / PTQ-0826: Re-verified and imported shared REGISTRY and RegistryRow; local readers, tests, and assertions unchanged. Required gate passed: TypeScript and all 11,585 tests across 689 files. No production or quality files changed. || [PTQ-0827-quoted-stray-msg-reimplements-registrymessageof.md] PTQ-0827: Both msg wrappers delegate to registryMessageOf; existing assertions retained. No tests removed or renamed. / PTQ-0829: Shared registryHintOf replaces all three parsers; failure wording and markup stripping preserved. All 386 equivalence comparisons passed. No tests removed or renamed. / PTQ-0830: Reused shared REGISTRY; removed the redundant interface, four-page read, and unused imports. No tests removed or renamed. / PTQ-0832: All three message-reader sites use registryMessageOf; template, severity, and phase assertions retained. No tests removed or renamed. Required cluster gate passed: TypeScript and 689 files / 11,585 tests. || [PTQ-0834-schema-alias-union-decl-msg-reimplements-registrymessageof.md] PTQ-0834: Replaced duplicate message rendering with registryMessageOf; all tests retained. / PTQ-0835: Reused registryMessageOf, preserving the pre-substitution non-empty guard through an opt-in option; added guard coverage and retained all existing tests. / PTQ-0836: Reused shared parse helpers across all four files, retaining fixture paths and error rejection; dispatch now uses the shared fixture-error wording. No tests renamed or deleted. / PTQ-0839: Moved the identical regex helper into registry-oracle.ts and replaced all four copies with imports; assertions unchanged and all tests retained. / Required verification command passed: TypeScript clean; 689 test files and 11,586 tests passed. No src/ or quality/ files changed. ||
