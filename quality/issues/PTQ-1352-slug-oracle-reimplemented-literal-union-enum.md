---
id: PTQ-1352
title: literal-union-string-enum-emission.test.ts redeclares slugOfCanonicalForm/inlineDefName instead of importing canonical-slug-oracle.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/literal-union-string-enum-emission.test.ts:1-18
  - tests/literal-union-string-enum-emission.test.ts:193-203
  - tests/helpers/canonical-slug-oracle.ts:1-15
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
fix_skips: 1
---

# literal-union-string-enum-emission.test.ts redeclares slugOfCanonicalForm/inlineDefName instead of importing canonical-slug-oracle.ts

## Observation
`tests/literal-union-string-enum-emission.test.ts` declares its own local
`slugOfCanonicalForm` and `inlineDefName` functions to compute the
`__inline_<slug>` `$defs` key for its hoisted-fragment fixture. A helper
module purpose-built for exactly this — `tests/helpers/canonical-slug-oracle.ts`
— already exports functions of the identical name and identical body, and
five other files in the same lowering-test family already import it for this
same computation.

## Evidence

`tests/literal-union-string-enum-emission.test.ts:193-203` (re-read
immediately before filing):
```ts
/** SHA-256 of the canonical-form bytes, first 16 lowercase hex characters (:106–:107). */
function slugOfCanonicalForm(canonical: string): string {
  return createHash("sha256").update(canonical, "utf8").digest("hex").slice(0, 16);
}

/** The synthesised `$defs` key for a fragment given its canonical form (:73). */
function inlineDefName(canonical: string): string {
  return `__inline_${slugOfCanonicalForm(canonical)}`;
}

const B_XY_INLINE = inlineDefName(B_XY_CANONICAL);
```

`tests/literal-union-string-enum-emission.test.ts:1-18` — the file's full
import list; no import from `./helpers/canonical-slug-oracle` appears:
```ts
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildBodyTypeSchemas,
  lowerInlineObject,
  lowerTypeSource,
} from "../src/parser/body-type-lowering";
import type { EnumDecl, SchemaDecl } from "../src/parser/theta-document";
import { lowerQueryResponseSchema } from "../src/parser/query-schema-lowering";
import {
  RESPOND_ENVELOPE_KEY,
  respondSchemaIsEnveloped,
  respondToolWireSchema,
} from "../src/runtime/respond-tool-wire";
import { respondSchemaSlug } from "../src/runtime/typed-query-validation";
import type { LoweredSchema } from "../src/seams/schema-validator";
import { ajv } from "./helpers/scripted-live-session-harness";
import { parseDoc } from "./helpers/e2e-s1";
```

`tests/helpers/canonical-slug-oracle.ts:1-15` — the canonical helper carrying
the byte-identical pair:
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

Exact search: `grep -rln "slugOfCanonicalForm\|inlineDefName" tests/*.test.ts`
→ 3 files (`tests/inline-slug-name-reservation.test.ts`,
`tests/literal-union-string-enum-emission.test.ts`,
`tests/schema-body-nontype-text-refusal.test.ts`); of these, filtering out
files that already `import ... from "./helpers/canonical-slug-oracle"` leaves
the same 3 — none of the 3 imports the helper for these two functions. Only
`tests/literal-union-string-enum-emission.test.ts` is in this review's scope.

## Why this is a problem
The helper module's own header states it is "the hand-written canonical
forms and their honesty checks remain in each test file" — i.e. the module
was built to be shared for exactly the slug/inline-name computation, which is
mechanical (SHA-256 truncation) rather than part of the "independent oracle"
honesty the header protects. The in-scope file instead types out a
byte-identical copy under the same names. A change to the truncation length,
hash algorithm, or `__inline_` prefix in the shared helper — the kind of
change five sibling files in the same family already receive automatically —
would silently not reach this file's local copy, and the file's own hoisted
`$defs` key assertions (`B_XY_INLINE`) would keep passing against a stale
formula.

## Suggested direction (non-binding, optional)
Importing `inlineDefName` (and, if needed, `slugOfCanonicalForm`) from
`./helpers/canonical-slug-oracle` in place of the two local function
declarations is the same migration already applied to the sibling lowering
tests.

## False-positive check
- Gate-pin check: not a `*gate*.test.ts` file or named kin; not applicable.
- Recording-double check: `slugOfCanonicalForm`/`inlineDefName` are pure
  value functions, not recording doubles backing a MUST-NOT witness; not
  applicable.
- docs/bugs/ signature search: `grep -rl "slugOfCanonicalForm\|inlineDefName" docs/bugs/*.md`
  → 0 hits; no bug doc pins this local declaration as a documented
  correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "literal-union-string-enum-emission" docs/reference/coverage-matrix.md`
  → 0 hits; this file is cited by name in `docs/bugs/0055-*.md` as a witness,
  but that citation names no specific cell or the helper-import mechanism —
  this finding proposes no rename/merge/delete of any `it()`/`describe()`,
  only the definition site of two internal functions.
- Overlap check: `grep -rl "literal-union-string-enum-emission"
  quality/intake quality/issues quality/resolved` → only `PTQ-0793` (a
  different pair of files, different closure — `assertKeysSorted`/`sorted`,
  not `slugOfCanonicalForm`/`inlineDefName`) and `PTQ-1079` (an unrelated
  `ajv` builder finding). Neither prior filing covers this file's
  `slugOfCanonicalForm`/`inlineDefName` redeclaration.
- Coverage check: this finding does not claim any missing test or untested
  code path; it is confined to a test file bypassing an existing shared
  test-only helper.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim (canonical-slug-oracle.ts:8-15 exports slugOfCanonicalForm/inlineDefName; literal-union-string-enum-emission.test.ts:194-200 redeclares the pair byte-identically, imports createHash at :1 and has 0 hits for `canonical-slug-oracle` in its :1-18 import list), B_XY_INLINE is live (:388/:391 build the hoisted `$ref`/`$defs` fixture), both locations under tests/, D7 copy-paste-helper class; stated searches reproduce (grep slugOfCanonicalForm|inlineDefName in tests/*.test.ts → the 3 named files, 11 importer files of the helper, docs/bugs 0 hits for the identifiers, coverage-matrix 0 hits for the file), not a gate/recording-double/red-test carve-out, no it()/describe() rename proposed, and the helper header's "honesty checks remain in each test file" keeps the hand-written canonical forms per-file not the hash formula (same ruling as PTQ-0410/0665/0794/0874); not a duplicate — the local copy dates from 0b1e20ab (2026-08-03) and predates the helper's minting in c79a9039 (2026-09-17), resolved PTQ-0793 covers this file's `sorted` closure only, PTQ-1079 its ajv builder, and same-wave d7-02 cites the disjoint schema-body-nontype-text-refusal.test.ts, so this is a residual reimplements-existing-helper filing per the PTQ-0665/0794 precedent; sites: 1 is scope-honest (triage: claude-fable-5-1)

## Fix attempts
- qw20260923093622: skipped — [PTQ-1332-parsedtheta-fixture-builder-duplicated.md] PTQ-1332: removed all 6 local NOOP_RUN/theta ParsedTheta builders across the 5 files and switched every call site to the canonical makeTheta from tests/helpers/watch-arming-harness; in registration-reload-wiring and watcher-terminated-recovery the toEqual(theta(...)) comparisons were rewritten to compare against a single hoisted makeTheta(...) instance (makeTheta's default run mints a fresh function per call, and toEqual treats distinct function refs as unequal — confirmed by an initial red run, then fixed); unused ParsedTheta type imports pruned where the builder was the only user. PTQ-1353: added stderrLinesWithPrefix(calls, prefix) to tests/helpers/compose-workspace-harness.ts (the existing console.error-capture helper home; prefix is a caller argument per the triage's RED-at-HEAD literal-prefix carve-out) and replaced all three cited partitions plus the triage-named fourth partial copy in tests/system-note-channel.test.ts (its spy now records full arg arrays instead of args[0] so the shared projection applies; assertion counts unchanged). PTQ-1338: moved RecordingQueryModel (with the log array as the superset shape) into tests/helpers/scripted-typed-query-harness.ts beside the existing QueryModelDriver doubles; both test files now import it; the b0316 copy gains inert log pushes it never reads; newly-unused type imports pruned. PTQ-1344: added RespondFixture/respondFixtureFor(thetaSource) (memoised per source string) and qry15Body to tests/helpers/scripted-live-session-harness.ts (the home the issue names; carrying the bug-0010/0099 slug-recipe and QRY-15 doc comments); typed-repair-two-phase and typed-two-phase-live keep a one-line respondFixture wrapper over their own theta constant so their 17 call sites are untouched; per the triage correction the drifted third copy in typed-query-provider-gate.test.ts was folded in too, replacing its hand-rolled sha256(JSON.stringify) slug with the canonical respondSchemaSlug path (the fixture is only self-consistent fallback-tool-name plumbing; gate suite passes); dead createHash/lowerQueryResponseSchema/respondSchemaSlug/LoweredSchema/SchemaDecl imports pruned. Verification: the verbatim unset+tsc+npm test gate ran green (705 files, 11780 tests). ||
