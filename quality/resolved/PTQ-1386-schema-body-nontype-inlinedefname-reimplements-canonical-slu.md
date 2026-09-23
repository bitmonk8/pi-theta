---
id: PTQ-1386
title: schema-body-nontype-text-refusal.test.ts redeclares inlineDefName instead of importing tests/helpers/canonical-slug-oracle.ts
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/schema-body-nontype-text-refusal.test.ts:1
  - tests/schema-body-nontype-text-refusal.test.ts:456-466
  - tests/helpers/canonical-slug-oracle.ts:1-15
sites: 1
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
fix_skips: 1
---

# schema-body-nontype-text-refusal.test.ts redeclares inlineDefName instead of importing tests/helpers/canonical-slug-oracle.ts

## Observation
`tests/schema-body-nontype-text-refusal.test.ts` imports `createHash` from
`node:crypto` at the top of the file and declares its own local
`inlineDefName(canonical: string): string` function that hashes the canonical
form with SHA-256 and truncates to 16 hex characters. `tests/helpers/
canonical-slug-oracle.ts` already exports a function of the identical name and
identical body (`slugOfCanonicalForm` plus the `__inline_` prefix), purpose-
built for exactly this computation. The in-scope file does not import from
`canonical-slug-oracle.ts` at all.

## Evidence

`tests/schema-body-nontype-text-refusal.test.ts:1`:
```ts
import { createHash } from "node:crypto";
```

`tests/schema-body-nontype-text-refusal.test.ts:456-466` (re-read immediately
before filing):
```ts
/**
 * SHA-256 of a hand-written canonical form, first 16 lowercase hex characters
 * (schema-subset.md:98 hashes the LOWERED fragment; `:106`/`:107` give the
 * digest and its truncation). `schemaSlug` is deliberately NOT imported — an
 * oracle taken from the implementation under test proves nothing.
 */
function inlineDefName(canonical: string): string {
  return `__inline_${createHash("sha256").update(canonical, "utf8").digest("hex").slice(0, 16)}`;
}
```

`tests/helpers/canonical-slug-oracle.ts:1-15`:
```ts
// Independent test oracle for docs/spec_topics/schema-subset.md's canonical
// schema hash: Unicode code-point key order, SHA-256 truncation and inline names.
// No production canonicaliser or slug helper is imported; the hand-written
// canonical forms and their honesty checks remain in each test file.
import { createHash } from "node:crypto";
import { expect } from "vitest";

/** SHA-256 of the canonical-form bytes, first 16 lowercase hex characters. */
export function slugOfCanonicalForm(canonical: string): string {
  return createHash("sha256").update(canonical, "utf8").digest("hex").slice(0, 16);
}

/** The synthesised `$defs` key for a fragment given its canonical form (:73). */
export function inlineDefName(canonical: string): string {
  return `__inline_${slugOfCanonicalForm(canonical)}`;
}
```
The in-scope file's local `inlineDefName` body is byte-identical to the
helper's exported `inlineDefName` body (`__inline_` plus a 16-character
lowercase SHA-256 hex truncation of the argument). The doc comment's
rationale — "an oracle taken from the implementation under test proves
nothing" — argues against importing a hash function from `src/`, which
`canonical-slug-oracle.ts` is not: that module is itself a test-only,
independently-hand-written oracle (its own header: "No production
canonicaliser or slug helper is imported"), so the stated reason does not
address why this file re-derives the SAME test-only oracle rather than
importing it.

## Why this is a problem
`tests/helpers/canonical-slug-oracle.ts` exists specifically to be the one
independent SHA-256/`__inline_` oracle test files in this lowering-test
family share, and other files in the same family already import it for this
exact computation. This file's local copy is a second, textually identical
definition of `inlineDefName` outside that shared module, so a future change
to the truncation length, the digest algorithm, or the `__inline_` prefix
convention (all pinned facts about one spec clause,
`docs/spec_topics/schema-subset.md:106-107`) has to be applied to this file's
copy independently of the helper's.

## Suggested direction (non-binding, optional)
Importing `inlineDefName` (and `slugOfCanonicalForm` if needed) from
`tests/helpers/canonical-slug-oracle.ts` in place of the local declaration and
the `node:crypto` import is the shape the existing export already offers.

## False-positive check
- Gate-pin check: `tests/schema-body-nontype-text-refusal.test.ts` is not a
  `*gate*.test.ts` file or named kin; the cited lines are an oracle-helper
  declaration, not a pinned count or inventory assertion.
- Recording-double check: `inlineDefName` is a pure hashing function; it
  records no calls and backs no "never called" witness.
- docs/bugs/ signature search: `grep -rl "schema-body-nontype-text-refusal"
  docs/bugs/*.md` → 0 hits (the file's own header cites
  docs/bugs/0061-nonparams-type-positions-keep-junk-arm-text-silent.md, which
  says nothing about this helper choice); no documented correct-reason-red
  covers this declaration.
- coverage-matrix/bug-doc citation search: `grep -n
  "schema-body-nontype-text-refusal" docs/reference/coverage-matrix.md` → 0
  hits. This finding proposes no merge, rename, or deletion of the file or
  any `describe()`/`it()` — only that the local `inlineDefName` declaration
  could be replaced by the existing `canonical-slug-oracle.ts` export.
- Prior-finding overlap check: `grep -rl "schema-body-nontype-text-refusal"
  quality/intake/*.md` shows one existing filing,
  `qw20260922211400-d7-01-slug-oracle-reimplemented-literal-union-enum.md`,
  which files the same root cause against a DIFFERENT file
  (`tests/literal-union-string-enum-emission.test.ts`) and explicitly states
  in its own evidence section that this file is one of three matching the
  pattern but "Only tests/literal-union-string-enum-emission.test.ts is in
  this review's scope" for that filing — so this filing supplies the
  locations and excerpt that sibling filing named out of its own scope,
  without duplicating its cited sites.
- Coverage-drift check: the claim is about a repeated function DEFINITION
  this file's own fixture constants (`B_PERMISSIVE_INLINE`,
  `B_STRING_INLINE`, `C_PERMISSIVE_INLINE`, `B_REF_C_INLINE`) already call;
  no claim that any evaluator path is untested.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim (canonical-slug-oracle.ts:8-15 exports slugOfCanonicalForm/inlineDefName; schema-body-nontype-text-refusal.test.ts:464-465 redeclares inlineDefName with the helper's body inlined, imports createHash at :1, and grep `canonical-slug-oracle|slugOfCanonicalForm` in the file → 0 hits), the local copy is live (:477/:489/:500/:512 build B_PERMISSIVE_INLINE/B_STRING_INLINE/C_PERMISSIVE_INLINE/B_REF_C_INLINE), both locations under tests/, D7 copy-paste-helper class; not a gate/recording-double/red-test carve-out, no it()/describe() merge/rename/delete proposed, and the "schemaSlug deliberately NOT imported" banner concerns the production SUT not the test-only oracle (same ruling as PTQ-0410/0665/0794/0874 and same-wave confirmed d7-01); one FP-check error to correct at ticketing — `grep -rl schema-body-nontype-text-refusal docs/bugs/*.md` is 9 files not 0 (0061/0097/0124/0133/0165/0184/0203/0204/0285), but every hit cites cell ranges (e.g. 0204 :680-707, :815), none the :456-466 helper, so the conclusion stands; not a duplicate — the copy dates from 9cf3e026 (2026-08-08, bug-0061 fix) and predates the helper's minting in c79a9039 (2026-09-17); resolved PTQ-0410/0665/0794/0874 and d7-01 all cite disjoint files (d7-01 explicitly names this file as out of its scope), so this is a residual reimplements-existing-helper filing per the PTQ-0665/0794 precedent; sites: 1 is scope-honest (grep `^function inlineDefName` in tests/*.test.ts → 4 files, the other three tracked or already importing the helper) (triage: claude-fable-5-1)

## Fix attempts
- qw20260923093622: skipped — [PTQ-1332-parsedtheta-fixture-builder-duplicated.md] PTQ-1332: removed all 6 local NOOP_RUN/theta ParsedTheta builders across the 5 files and switched every call site to the canonical makeTheta from tests/helpers/watch-arming-harness; in registration-reload-wiring and watcher-terminated-recovery the toEqual(theta(...)) comparisons were rewritten to compare against a single hoisted makeTheta(...) instance (makeTheta's default run mints a fresh function per call, and toEqual treats distinct function refs as unequal — confirmed by an initial red run, then fixed); unused ParsedTheta type imports pruned where the builder was the only user. PTQ-1353: added stderrLinesWithPrefix(calls, prefix) to tests/helpers/compose-workspace-harness.ts (the existing console.error-capture helper home; prefix is a caller argument per the triage's RED-at-HEAD literal-prefix carve-out) and replaced all three cited partitions plus the triage-named fourth partial copy in tests/system-note-channel.test.ts (its spy now records full arg arrays instead of args[0] so the shared projection applies; assertion counts unchanged). PTQ-1338: moved RecordingQueryModel (with the log array as the superset shape) into tests/helpers/scripted-typed-query-harness.ts beside the existing QueryModelDriver doubles; both test files now import it; the b0316 copy gains inert log pushes it never reads; newly-unused type imports pruned. PTQ-1344: added RespondFixture/respondFixtureFor(thetaSource) (memoised per source string) and qry15Body to tests/helpers/scripted-live-session-harness.ts (the home the issue names; carrying the bug-0010/0099 slug-recipe and QRY-15 doc comments); typed-repair-two-phase and typed-two-phase-live keep a one-line respondFixture wrapper over their own theta constant so their 17 call sites are untouched; per the triage correction the drifted third copy in typed-query-provider-gate.test.ts was folded in too, replacing its hand-rolled sha256(JSON.stringify) slug with the canonical respondSchemaSlug path (the fixture is only self-consistent fallback-tool-name plumbing; gate suite passes); dead createHash/lowerQueryResponseSchema/respondSchemaSlug/LoweredSchema/SchemaDecl imports pruned. Verification: the verbatim unset+tsc+npm test gate ran green (705 files, 11780 tests). ||
