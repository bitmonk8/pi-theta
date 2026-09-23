---
id: PTQ-1402
title: params-inline-object-lowering.test.ts still carries its own loadCleanly() copy that resolved PTQ-0212 named and tests/helpers/e2e-s1.ts now exports
lens: D7
status: open
verdict: confirmed
locations:
  - tests/params-inline-object-lowering.test.ts:291-333
  - tests/helpers/e2e-s1.ts:670-690
sites: 1
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# params-inline-object-lowering.test.ts still carries its own loadCleanly() copy that resolved PTQ-0212 named and tests/helpers/e2e-s1.ts now exports

## Observation
`tests/helpers/e2e-s1.ts` exports `interface LoadedParams { readonly defs; readonly loweredSchema }` and `function loadCleanly(label, source, path = "test.theta"): LoadedParams`, a load-and-throw wrapper around `parseDoc` that asserts a clean diagnostic list and then throws, naming the absent intermediate, at each of three possible failure points (`frontmatter === null`, `params === undefined`, `loweredSchema === undefined`). `tests/params-inline-object-lowering.test.ts` declares its own private `interface LoadedParams` (a superset carrying `doc`, `properties`, `required`, `fields` in addition to `defs`/`loweredSchema`) and its own private `function loadCleanly(label, source): LoadedParams` with the same three throw clauses, byte-identical in two of the three messages. The file's own import line names only `parseDoc, diagLines, fieldOf` from `./helpers/e2e-s1` — not `loadCleanly` or its `LoadedParams`.

## Evidence
`tests/params-inline-object-lowering.test.ts:12` (the file's sole `e2e-s1` import):
```ts
import { parseDoc, diagLines, fieldOf } from "./helpers/e2e-s1";
```

`tests/params-inline-object-lowering.test.ts:291-333` (re-read immediately before filing):
```ts
/** A parsed, cleanly-lowered `params:` block. */
interface LoadedParams {
  readonly doc: ThetaDocument;
  readonly properties: Record<string, unknown>;
  readonly required: readonly string[];
  readonly defs: Record<string, unknown>;
  readonly fields: readonly BypassParamsField[];
  readonly loweredSchema: LoweredSchema;
}

function loadCleanly(label: string, source: string): LoadedParams {
  const doc = parseDoc(source, "bug0035.theta");
  expect(
    diagLines(doc),
    `${label}: an inline object type is legal theta in every type position (grammar.md:109, type-system.md:15), so this fixture must load with NO diagnostics`,
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
  const lowered = params.loweredSchema;
  if (lowered === undefined) {
    throw new Error(
      `${label}: the params block lowered to NOTHING (loweredSchema absent), so there is no AJV-validatable document for the argument boundary. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
```

`tests/helpers/e2e-s1.ts:670-690` (the canonical, exported version — re-read immediately before filing):
```ts
/** A parsed, cleanly-lowered `params:` block. */
export interface LoadedParams {
  readonly defs: Record<string, unknown>;
  readonly loweredSchema: LoweredSchema;
}

/**
 * Parse a fixture that must LOAD cleanly, and read its lowered `params:`
 * schema back. Accept an already parsed document for callers with pre-checks.
 * A non-empty diagnostic list, a `null` frontmatter, an absent `params`, or an
 * absent `loweredSchema` all throw, with the diagnostics rendered, rather than
 * let a caller read a field off an unloaded document.
 */
export function loadCleanly(label: string, source: string | ThetaDocument, path = "test.theta"): LoadedParams {
  const doc = typeof source === "string" ? parseDoc(source, path) : source;
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

The `if (doc.frontmatter === null) { throw new Error(...) }` and `if (params === undefined) { throw new Error(...) }` clauses are byte-identical between the two excerpts; the third (`loweredSchema` absent) message is also byte-identical between the two files (both read "so there is no AJV-validatable document for the argument boundary"). Search: `grep -n "^function loadCleanly" tests/params-inline-object-lowering.test.ts` → one local declaration at line 310; `grep -n "export function loadCleanly" tests/helpers/e2e-s1.ts` → one canonical export at line 682; `grep -c "loadCleanly(" tests/params-inline-object-lowering.test.ts` → 13 call sites, all resolved by the local declaration.

## Why this is a problem
`tests/params-inline-object-lowering.test.ts:414-428` (its `loadCleanly` at the time) was one of the seven sites resolved finding PTQ-0212 named and closed as "fixed"; that finding's own fix is what produced the exported `LoadedParams`/`loadCleanly` now sitting in `tests/helpers/e2e-s1.ts` at lines 670-690, with the frontmatter-null and params-undefined throw clauses copied character-for-character from this file's own copy. The file was never updated to import the now-existing export: its sole `./helpers/e2e-s1` import (line 12) lists `parseDoc, diagLines, fieldOf` only, and its private `loadCleanly` (line 310) still carries the three-throw chain PTQ-0212 already cited from this exact file. A future edit to the canonical wrapper's wording, its null-checking order, or its accept-an-already-parsed-document overload (the canonical version now also accepts a pre-parsed `ThetaDocument`, which this file's copy cannot) would not reach this file's 13 call sites.

## Suggested direction (non-binding, optional)
Importing `loadCleanly`/`LoadedParams` from `./helpers/e2e-s1` and deriving the file's extra `doc`/`properties`/`required`/`fields` fields from the canonical helper's returned `loweredSchema` (as the `defOf`/`refNameOf`-style readers in sibling files already do) would remove the duplicate three-throw wrapper while keeping the file's own extra field reads.

## False-positive check
- Gate-pin check: the file does not match `*gate*.test.ts` or the named gate kin; the cited lines are a load-and-throw harness, not a pinned count or inventory.
- Recording-double check: `loadCleanly` parses and returns fields off one document; it records no calls and backs no "never called" witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -n "loadCleanly" docs/bugs/0035-params-rhs-inline-object-under-emission.md docs/bugs/0045-*.md docs/bugs/0263-*.md` → 0 hits stating a rationale for keeping a local copy rather than importing the now-existing helper.
- coverage-matrix/bug-doc citation search: `grep -n "params-inline-object-lowering" docs/reference/coverage-matrix.md` → 0 hits. The bug docs this file's header cites (0035, 0045, 0263) name the file by its fixture groups and cell letters, never by `loadCleanly`'s internal implementation; this finding proposes no change to any `it()`/`describe()` name, count, or assertion — only to where the load-and-throw wrapper is defined.
- Prior-filing overlap check: `grep -rl "params-inline-object-lowering" quality/issues quality/intake quality/resolved` returns PTQ-0212 (the original seven-site filing, which named this file's pre-fix `loadCleanly` at lines 414-428 as one of the seven sites its fix was meant to close), PTQ-0410/PTQ-0412/PTQ-0652/PTQ-0653/PTQ-0663/PTQ-0793/PTQ-0794/PTQ-0824/PTQ-1089 (all disjoint helpers in this same file — the canonical-slug-oracle pair, the registry four-page join, `fieldOf`, the triage fixture pair, `diagLines` shadowing, the sorted-closure check, `capturingAjv`, and the registry-message trio, respectively), and PTQ-0662 (a different file's registry read that cites this file only as a comparator). None of the prior filings against this file name `loadCleanly` itself; PTQ-0212 is resolved (`status: fixed`) and, per its own resolution mechanics, cannot absorb a residual against one of its seven original sites — the same "canonical helper landed elsewhere, this site not migrated" shape already recognised for two of PTQ-0212's other six sites in resolved PTQ-0879 (`inline-object-nested-lowering.test.ts`) and resolved PTQ-1082 (`params-block-mapping-rhs-refusal.test.ts`), neither of which names this file.
- Coverage-drift check: the claim is entirely about a repeated helper DEFINITION post-migration; every one of the file's 13 `loadCleanly(...)` call sites still runs and exercises the local copy, so this is not a coverage-gap claim.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: private `loadCleanly` reproduces at tests/params-inline-object-lowering.test.ts:310 (interface :292-299) and the export at tests/helpers/e2e-s1.ts:682 (interface :671-674); a mktemp diff of the two three-throw bodies shows all three `throw new Error` clauses byte-identical (only the `expect` message, the `parseDoc` path literal and the local copy's extra `properties` guard/return differ, which the direction accounts for); the copy is live (17 `loadCleanly(` mentions, suite 37/37 green), the sole e2e-s1 import at :12 names only `parseDoc, diagLines, fieldOf`, stated greps reproduce (one local decl, one export, coverage-matrix 0), not a gate/kin file, no recording-double or red-test carve-out, no it()/describe() change proposed; git confirms PTQ-0212's fix commit 2594cd44 never touched this file and its three later touches (93ed4e00, 4e83337e, 9a51e5ab) did not migrate it; not a duplicate — PTQ-0212 is resolved, PTQ-0879/PTQ-1082 are the same shape ruled per-file against other files, the same-wave d7-68a targets params-brace-union, and no open/intake row names this file's `loadCleanly`; D7 boilerplate duplication, mechanical fix is import + a thin wrapper deriving doc/properties/required/fields (triage: claude-fable-5-1)
