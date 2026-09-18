---
id: PTQ-0872
title: production-typed-query-validation.test.ts's TRIAGE_SOURCE/buildTriageValidation pair is redeclared from tests/e2e-s3-typed-query-conformance.test.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/production-typed-query-validation.test.ts:57-95
  - tests/e2e-s3-typed-query-conformance.test.ts:65-101
sites: 2
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# production-typed-query-validation.test.ts's TRIAGE_SOURCE/buildTriageValidation pair is redeclared from tests/e2e-s3-typed-query-conformance.test.ts

## Observation
`tests/production-typed-query-validation.test.ts` already imports
`NOOP_CHECKPOINT`, `liveSignal`, `forcedRespondConfig`, `RespondingModel`,
`schemaDeclsOf` and `ajv` from `tests/helpers/typed-query-harness.ts`
(the fix for PTQ-0644). Beside that import it declares its own
module-scope `TRIAGE_SOURCE` fixture string and `buildTriageValidation`
function — the "build the production `TypedQuerySchemaValidation` for
`@<Triage>`" scaffold. `tests/e2e-s3-typed-query-conformance.test.ts`
declares the identical `TRIAGE_SOURCE` and a structurally identical
`buildTriageValidation`, also importing the same six pieces from the same
helper module. Neither file imports the other's `TRIAGE_SOURCE`/
`buildTriageValidation`, nor does `tests/helpers/typed-query-harness.ts`
export anything Triage-specific.

## Evidence

`tests/production-typed-query-validation.test.ts:57-95`:
```ts
const TRIAGE_SOURCE = [
  "schema Triage {",
  '  category: "bug" | "feature" | "question",',
  "  urgent: boolean",
  "}",
].join("\n");

/**
 * Build the production `TypedQuerySchemaValidation` for `@<Triage>` exactly as
 * the fixed producer composes it, over a scripted respond-repair follow-up.
 */
function buildTriageValidation(
  followUps: readonly string[],
): { readonly validation: TypedQuerySchemaValidation; readonly lowered: LoweredSchema; followUpCalls: number } {
  const schemas = schemaDeclsOf(TRIAGE_SOURCE, "triage.theta");
  const lowered = lowerQueryResponseSchema("Triage", schemas);
  if (lowered === undefined) {
    throw new Error("Triage schema failed to lower — parser did not retain the schema body");
  }
  const state = { followUpCalls: 0 };
  const validation = buildTypedQueryValidation({
    lowered,
    schemaValidator: ajv("triage"),
    attempts: followUps.length,
    maxRounds: 0,
    driveFollowUp: () => {
      const reply = followUps[state.followUpCalls] ?? "{}";
      state.followUpCalls += 1;
      return Promise.resolve(reply);
    },
  });
  return {
    validation,
    lowered,
    get followUpCalls() {
      return state.followUpCalls;
    },
  };
}
```

`tests/e2e-s3-typed-query-conformance.test.ts:65-101` (the counterpart —
identical `TRIAGE_SOURCE`, identical schema-lower-then-build sequence,
identical error message, differing only in the `followUpCalls` accessor
shape — a getter above vs a closure-returning function here — and one
doc-comment clause):
```ts
const TRIAGE_SOURCE = [
  "schema Triage {",
  '  category: "bug" | "feature" | "question",',
  "  urgent: boolean",
  "}",
].join("\n");

/**
 * Build the production `TypedQuerySchemaValidation` for `@<Triage>` exactly as
 * the shipped producer composes it, over a scripted respond-repair follow-up
 * sequence. `followUps` are the raw reply strings the driven follow-up turns
 * would return.
 */
function buildTriageValidation(followUps: readonly string[]): {
  readonly validation: TypedQuerySchemaValidation;
  readonly lowered: LoweredSchema;
  readonly followUpCalls: () => number;
} {
  const schemas = schemaDeclsOf(TRIAGE_SOURCE, "triage.theta");
  const lowered = lowerQueryResponseSchema("Triage", schemas);
  if (lowered === undefined) {
    throw new Error("Triage schema failed to lower — parser did not retain the schema body");
  }
  const state = { calls: 0 };
  const validation = buildTypedQueryValidation({
    lowered,
    schemaValidator: ajv("triage"),
    attempts: followUps.length,
    maxRounds: 0,
    driveFollowUp: () => {
      const reply = followUps[state.calls] ?? "{}";
      state.calls += 1;
      return Promise.resolve(reply);
    },
  });
  return { validation, lowered, followUpCalls: () => state.calls };
}
```

Search: `grep -rl "function buildTriageValidation" tests/*.ts` returns
exactly these two files. `grep -n "Triage\|export function\|export const\|export class"
tests/helpers/typed-query-harness.ts` shows the helper exports only
`liveSignal`, `forcedRespondConfig`, `RespondingModel`, `schemaDeclsOf` and
`ajv` — nothing Triage-specific.

## Why this is a problem
Both files already import the shared "scripted-forced-respond typed-query
substrate" from `tests/helpers/typed-query-harness.ts` (the module that
absorbed the six-piece duplication a prior finding, PTQ-0644, identified
between exactly these two files). The `TRIAGE_SOURCE`/`buildTriageValidation`
pair — the next layer of the same scaffold, built directly on top of the
imported `schemaDeclsOf`/`ajv` — was left as an independent restatement in
each file rather than following the same import path, down to the identical
schema source string and the identical "Triage schema failed to lower"
error message.

## Suggested direction (non-binding, optional)
Exporting `TRIAGE_SOURCE` and `buildTriageValidation` from
`tests/helpers/typed-query-harness.ts` alongside the six pieces it already
carries would give both files a single declaration to import, the same
treatment PTQ-0644's fix already applied one layer down in the same module.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin; the cited lines are a fixture constant and a validation-builder
  function, not a pinned count or inventory assertion.
- Recording-double check: `buildTriageValidation`'s `driveFollowUp` closure
  scripts a stimulus sequence for positive assertions about repair rounds,
  not a "never called" MUST-NOT witness; the negative-witness carve-out does
  not apply.
- docs/bugs/ signature search: `grep -rl "production-typed-query-validation\|e2e-s3-typed-query-conformance"
  docs/bugs/` finds each file's own bug/campaign documents (QRY-22/Defect B,
  CAND-1/S3 conformance) but none marking this specific
  `TRIAGE_SOURCE`/`buildTriageValidation` duplication as a documented
  correct-reason red; both files pass at HEAD.
- coverage-matrix/bug-doc citation search: `grep -n
  "production-typed-query-validation\|e2e-s3-typed-query-conformance"
  docs/reference/coverage-matrix.md` → 0 hits pinning this substrate by name.
  This finding proposes no merge, rename or deletion of any `it()`/
  `describe()`.
- Coverage check: the claim is entirely about a repeated harness/fixture
  DEFINITION; each file's own tests exercise their own copy, so this is not
  a coverage-gap claim.
- Prior-finding check: `quality/resolved/PTQ-0644-typed-query-validation-substrate-mirrors-e2e-s3.md`
  (fixed) and `quality/resolved/PTQ-0432-b0292-typed-query-substrate-mirrored.md`
  (fixed) both cite only the `NOOP_CHECKPOINT`/`liveSignal`/`config`/
  `RespondingModel`/`schemaDeclsOf`/`ajv` sextet at lines ending at
  production-typed-query-validation.test.ts:121 / e2e-s3-typed-query-conformance.test.ts:127
  in their pre-fix line numbering; re-reading both files at HEAD confirms
  the sextet migrated to `tests/helpers/typed-query-harness.ts` (now
  imported by both) while `TRIAGE_SOURCE`/`buildTriageValidation` — declared
  immediately after the sextet in both files — remained un-migrated and is
  not cited as a location in either prior filing. `grep -rl
  "buildTriageValidation\|TRIAGE_SOURCE" quality/issues quality/resolved
  quality/intake` finds no row citing these declarations. Not a duplicate of
  PTQ-0432/PTQ-0644.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at production-typed-query-validation:57-95 and e2e-s3-typed-query-conformance:65-101; a sed-extracted diff shows TRIAGE_SOURCE, the schemaDeclsOf→lowerQueryResponseSchema→buildTypedQueryValidation sequence, the `ajv("triage")`/`attempts`/`maxRounds: 0`/`?? "{}"` driveFollowUp body and the "Triage schema failed to lower" message byte-identical, diverging only in the followUpCalls accessor shape (getter vs closure) and doc-comment wording; `function buildTriageValidation` greps to exactly these two tests/ files and tests/helpers/typed-query-harness.ts exports only NOOP_CHECKPOINT/liveSignal/forcedRespondConfig/RespondingModel/schemaDeclsOf/ajv (nothing Triage-specific); both copies are live (8/7 in-file references), neither file is a gate or tests/live, driveFollowUp is scripted stimulus not a negative-witness recorder, coverage-matrix 0 hits, docs/ 0 hits for either identifier and no merge/rename/delete proposed; D7 copy-paste-fixture/boilerplate class; not a duplicate — PTQ-0432/0580/0644 (all fixed) cite only the sextet that has since migrated to the helper (PTQ-0432's triage note names TRIAGE_SOURCE merely as an "interleaved const" excluded from its diff), PTQ-0574 mentions e2e-s3 only in prose, and PTQ-0653/0666 concern a different TRIAGE_DEF lowered-shape constant in params-* files (triage: claude-fable-5-1)
