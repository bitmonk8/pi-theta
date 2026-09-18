---
id: PTQ-1082
title: params-block-mapping-rhs-refusal.test.ts reimplements loadCleanly's null-checking throw chain instead of importing the now-exported tests/helpers/e2e-s1.ts helper
lens: D7
status: open
verdict: confirmed
locations:
  - tests/params-block-mapping-rhs-refusal.test.ts:311-359
  - tests/helpers/e2e-s1.ts:445-475
sites: 1
fix_scope: localized
wave: qw20260918220713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# params-block-mapping-rhs-refusal.test.ts reimplements loadCleanly's null-checking throw chain instead of importing the now-exported tests/helpers/e2e-s1.ts helper

## Observation
`tests/params-block-mapping-rhs-refusal.test.ts` declares a module-private `interface LoadedParams` and `function loadCleanly(label, source): LoadedParams` that parses a fixture through `parseDoc`, asserts a clean diagnostic list, and throws a labelled error at each of three possible absent intermediates (`frontmatter === null`, `params === undefined`, `loweredSchema === undefined`) before returning the loaded fields. `tests/helpers/e2e-s1.ts` already exports an `interface LoadedParams` and a `function loadCleanly(label, source, path = "test.theta")` whose three throw messages are byte-identical to this file's, but the file's own import line (`import { parseDoc, fieldOf } from "./helpers/e2e-s1";`) omits both names.

## Evidence
`tests/params-block-mapping-rhs-refusal.test.ts:311-359`:
```ts
interface LoadedParams {
  readonly properties: Record<string, unknown>;
  readonly required: readonly string[];
  readonly defs: Record<string, unknown>;
  readonly fields: readonly BypassParamsField[];
  readonly loweredSchema: Record<string, unknown>;
}

function loadCleanly(label: string, source: string): LoadedParams {
  const doc = parseDoc(source, "bug0041.theta");
  expect(
    diagLines(doc),
    `${label}: this fixture's pinned disposition is a clean load — any diagnostic is drift`,
  ).toEqual([]);
  if (doc.frontmatter === null) {
    throw new Error(
      `${label}: the theta was REFUSED — frontmatter is null. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
    );
  }
  const params = doc.frontmatter.params;
  if (params === undefined) {
    throw new Error(
      `${label}: the frontmatter carries no parsed params block. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
    );
  }
```

`tests/helpers/e2e-s1.ts:445-467` — the canonical, exported version, whose three throw messages are byte-identical to the excerpt above:
```ts
export interface LoadedParams {
  readonly defs: Record<string, unknown>;
  readonly loweredSchema: LoweredSchema;
}

export function loadCleanly(label: string, source: string, path = "test.theta"): LoadedParams {
  const doc = parseDoc(source, path);
  expect(
    diagLines(doc),
    `${label}: this fixture must load with NO diagnostics; observed ${JSON.stringify(diagLines(doc))}`,
  ).toEqual([]);
  if (doc.frontmatter === null) {
    throw new Error(
      `${label}: the theta was REFUSED — frontmatter is null. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
    );
  }
  const params = doc.frontmatter.params;
  if (params === undefined) {
    throw new Error(
      `${label}: the frontmatter carries no parsed params block. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
    );
  }
```

Exact search: `grep -n "^function loadCleanly" tests/params-block-mapping-rhs-refusal.test.ts` → one local declaration; `grep -n "export function loadCleanly" tests/helpers/e2e-s1.ts` → one canonical export; `grep -n "from \"./helpers/e2e-s1\"" tests/params-block-mapping-rhs-refusal.test.ts` → the sole import line names only `parseDoc, fieldOf`.

## Why this is a problem
The two "the theta was REFUSED — frontmatter is null" and "the frontmatter carries no parsed params block" throw messages are copied character-for-character from the canonical helper into this file's local copy, and the third ("the params block lowered to NOTHING…") differs only by "at" vs. "for" the argument boundary — the same three-message pattern resolved doc PTQ-0212 already established across seven sibling files, one of which is this file. The canonical `tests/helpers/e2e-s1.ts` export postdates that finding's fix (git blame: `2594cd44`), so a helper now exists at the exact name and shape this file already calls its own local copy by, yet this file's import list still omits it and keeps its own hand-authored duplicate of the shared throw chain.

## Suggested direction (non-binding, optional)
This file's `loadCleanly` needs `properties`/`required`/`fields` in addition to what the canonical helper returns (`defs`/`loweredSchema`); a caller-side wrapper that imports the canonical `loadCleanly` and derives the extra three fields from its returned `loweredSchema`/`fields` would let this file drop its own copy of the shared null-checking throw chain.

## False-positive check
- Gate-pin check: the file does not match `*gate*.test.ts` or a named gate kin.
- Recording-double check: not applicable — `loadCleanly` reads a loaded document's fields; it records no calls and backs no MUST-NOT-called witness.
- docs/bugs/ signature search: `grep -rl "loadCleanly" docs/bugs/*.md` hits `docs/bugs/0045-...md` and `docs/bugs/0102-...md`, both discussing what `loadCleanly` asserts for their own fixtures, not naming this file's local copy as a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "params-block-mapping-rhs-refusal" docs/reference/coverage-matrix.md` → 0 hits. No merge, rename, or deletion of this file or any cell is proposed — only that a local helper duplicates a now-existing canonical export.
- Prior-filing overlap check: this file's own `loadCleanly` was cited by resolved PTQ-0212 (status fixed, wave qw20260911104855) as one of seven pre-migration duplicate sites; that finding's own fix subsequently created `tests/helpers/e2e-s1.ts`'s exported `loadCleanly` (confirmed by `git log -S"export function loadCleanly" -- tests/helpers/e2e-s1.ts` → commit `2594cd44`), but this file (last touched by a later, unrelated commit `93ed4e00`) was never migrated onto it — this is the same "canonical helper landed, this site not migrated" residual shape already recognised elsewhere in this wave (e.g. `qw20260918220713-d7-01-fail-closed-markers-still-not-migrated.md`), not a re-filing of PTQ-0212's pre-migration observation.
- Coverage-drift check: the claim is entirely about a repeated helper DEFINITION post-migration; every cell in this file that calls its local `loadCleanly` still runs and passes, so this is not a coverage-gap claim.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: the private copy reproduces at tests/params-block-mapping-rhs-refusal.test.ts:320-359 (local `loadCleanly` at :327; the cited 311-359 also sweeps in the unrelated diagLines/diagCodes pair at :311-318 that PTQ-0798 already carries) and the canonical export at tests/helpers/e2e-s1.ts:445-475; a mktemp diff of the two bodies shows the frontmatter-null and params-undefined `throw` clauses byte-identical, the loweredSchema-absent message differing only "at" vs "for" (so the Observation's "three byte-identical" is a slight overstatement the Why paragraph itself corrects), and the only other deltas are the `parseDoc` path literal, the `expect` wording, and the local copy's extra `properties` guard + `properties`/`required`/`fields` return, which the direction accounts for; the copy is live (10 `loadCleanly(` call sites, suite 24/24 green), the sole e2e-s1 import at :13 names only `parseDoc, fieldOf`, stated searches reproduce (one local decl, one export, coverage-matrix 0, docs/bugs hits 0045/0102 non-refuting), not a gate/kin file, no recording-double or red-test carve-out, no cell merge/rename proposed; git reproduces: `2594cd44` (PTQ-0212's fix) added the export and migrated only annotation-root-brace-union-lowering.test.ts (now a `loadCleanlyShared` wrapper), leaving 6 of 7 files with private copies, and this file's later touch `93ed4e00` did not migrate it; not a duplicate — PTQ-0212 is resolved and cannot absorb the residual, and the open per-file residual rows PTQ-0879 (inline-object-nested-lowering) and PTQ-0884 (schema-alias-union-decl) name different files, PTQ-0879's own triage note recording that the other unmigrated files are not covered by it; D7 boilerplate duplication, mechanical fix is import + a thin wrapper deriving the three extra fields (note: the candidate's cross-reference to a same-wave "d7-01-fail-closed-markers" sibling is a misname — this wave's d7-01 is the triageMap fixture filing — immaterial to standing) (triage: claude-fable-5-1)
