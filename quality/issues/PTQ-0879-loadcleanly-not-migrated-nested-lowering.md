---
id: PTQ-0879
title: inline-object-nested-lowering.test.ts still carries its own loadCleanly() copy that PTQ-0212's fix centralised into tests/helpers/e2e-s1.ts
lens: D7
status: open
verdict: confirmed
locations:
  - tests/inline-object-nested-lowering.test.ts:540-585
  - tests/helpers/e2e-s1.ts:177-212
sites: 1
fix_scope: localized
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# inline-object-nested-lowering.test.ts still carries its own loadCleanly() copy that PTQ-0212's fix centralised into tests/helpers/e2e-s1.ts

## Observation
`tests/helpers/e2e-s1.ts` exports `loadCleanly(label, source, path = "test.theta"): LoadedParams`
and an `export interface LoadedParams { readonly defs; readonly loweredSchema }`.
PTQ-0212 ("The `loadCleanly` params-loading harness … is duplicated
byte-for-byte across seven schema/params-lowering test files", status: fixed)
named `tests/inline-object-nested-lowering.test.ts:591-605` as one of the
seven duplicate sites and recommended this exact centralisation. The file
still declares a private `LoadedParams` interface and a private `loadCleanly`
function today; it imports only `parseDoc` from `./helpers/e2e-s1` and does
not import the now-existing `loadCleanly` export.

## Evidence

`tests/helpers/e2e-s1.ts:177-212` (re-read immediately before filing):
```ts
export interface LoadedParams {
  readonly defs: Record<string, unknown>;
  readonly loweredSchema: LoweredSchema;
}

/**
 * Parse a fixture that must LOAD cleanly, and read its lowered `params:`
 * schema back. A non-empty diagnostic list, a `null` frontmatter, an absent
 * `params`, or an absent `loweredSchema` all throw, with the diagnostics
 * rendered, rather than let a caller read a field off an unloaded document.
 */
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
  const lowered = params.loweredSchema;
  if (lowered === undefined) {
    throw new Error(
      `${label}: the params block lowered to NOTHING (loweredSchema absent), so there is no AJV-validatable document for the argument boundary. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
    );
  }
  return { defs: (lowered["$defs"] ?? {}) as Record<string, unknown>, loweredSchema: lowered };
}
```

`tests/inline-object-nested-lowering.test.ts:540-585` (re-read immediately
before filing) — the same interface fields plus `properties`, and the same
three throw messages verbatim:
```ts
interface LoadedParams {
  readonly properties: Record<string, unknown>;
  readonly defs: Record<string, unknown>;
  readonly loweredSchema: LoweredSchema;
}

/**
 * Parse a fixture that must LOAD, and read its lowered `params:` schema back.
 * Every absent intermediate — a `null` frontmatter, an absent `params`, an
 * absent `loweredSchema` — throws with the diagnostics rendered.
 */
function loadCleanly(label: string, source: string): LoadedParams {
  const doc = parseDoc(source, "bug0039.theta");
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
    );
  }
  const properties = lowered["properties"];
  if (properties === null || typeof properties !== "object") {
    throw new Error(
      `${label}: the lowered params document carries no \`properties\` object: ${JSON.stringify(lowered)}`,
    );
  }
  return {
    properties: properties as Record<string, unknown>,
    defs: (lowered["$defs"] ?? {}) as Record<string, unknown>,
    loweredSchema: lowered,
  };
}
```

The three `throw new Error(...)` messages ("the theta was REFUSED — frontmatter
is null…", "the frontmatter carries no parsed params block…", "the params
block lowered to NOTHING (loweredSchema absent), so there is no
AJV-validatable document for the argument boundary…") are byte-identical
between the two excerpts. `grep -n "helpers/e2e-s1" tests/inline-object-nested-lowering.test.ts`
→ line 24, `import { parseDoc } from "./helpers/e2e-s1";` only.

## Why this is a problem
PTQ-0212 named this exact file and this exact function as one of seven
duplicate sites and its fix produced the `loadCleanly`/`LoadedParams` export
now present in `tests/helpers/e2e-s1.ts`, byte-identical to this file's
copy in every clause the two share. The file was not updated to call the new
export; it still carries its own throw-message copies, so a future edit to
the canonical wrapper's wording or null-checking order would not reach this
site.

## Suggested direction (non-binding, optional)
Importing `loadCleanly` from `./helpers/e2e-s1` and reading `properties` off
the returned `loweredSchema["properties"]` locally (the one field the
canonical `LoadedParams` does not carry) would remove the duplicate
three-throw wrapper while keeping the file's own `properties` extraction.

## False-positive check
- Gate-pin check: the file does not match `*gate*.test.ts` or the named gate
  kin; the cited lines are a load-and-throw harness, not a pinned count or
  inventory.
- Recording-double check: `loadCleanly` parses and returns fields off one
  document; it records no calls and backs no "never called" witness, so the
  negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -n "loadCleanly" docs/bugs/0039-inline-object-annotation-root-phantom-fields-and-silent-nested-walk.md`
  → 0 hits stating a rationale for keeping a local copy rather than importing
  the now-existing helper.
- coverage-matrix/bug-doc citation search: `grep -n "inline-object-nested-lowering"
  docs/reference/coverage-matrix.md` → 0 hits. docs/bugs/0039 cites this file
  by name and by group/cell id (a-h), never by `loadCleanly`'s internal
  implementation; this finding proposes no change to any `it()`/`describe()`
  name, count, or assertion — only to where the load-and-throw wrapper is
  defined.
- Coverage check: the claim is about a repeated function DEFINITION that
  itself has an already-fixed canonical counterpart, not a missing test path;
  the local copy is exercised by every `loadCleanly(...)` call in the file.
- Overlap check: `grep -rl "inline-object-nested-lowering" quality/issues quality/intake quality/resolved`
  found PTQ-0574 (`schemaDeclsOf`), PTQ-0653 (`TRIAGE_DEF`/`BODY`), PTQ-0691
  (`loweredAnnotation`), qw20260918050411-d7-01-canonical-slug-oracle-reimplemented-inline.md
  (a different file, `binder-param-line-newline-normalisation.test.ts`, not
  this one), and the resolved PTQ-0212 itself, which names this file's
  `loadCleanly` at its pre-fix line numbers (591-605) as one of the seven
  sites its fix closed. PTQ-0212's status is `fixed`, and its own fix
  produced the `tests/helpers/e2e-s1.ts` export cited above, but this file's
  own copy — now at lines 540-585 after intervening edits — was left in
  place; this finding documents that this one site's migration did not
  happen, not a re-filing of PTQ-0212's original multi-site claim.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: tests/helpers/e2e-s1.ts:177-212 exports `LoadedParams`/`loadCleanly` exactly as excerpted and the private copy reproduces at tests/inline-object-nested-lowering.test.ts:540-585; a mechanical diff of the 20-line shared body shows only the `parseDoc` path literal and the `expect` message differ while all three `throw new Error` clauses are byte-identical, the local copy is live (13 `loadCleanly(` call sites), the file's sole e2e-s1 import (:24) is `parseDoc` only, and the suite is green (61/61); stated searches reproduce (docs/bugs/0039 `loadCleanly` → 0, coverage-matrix file cite → 0), not a gate/kin file, no recording-double or red-test carve-out, no it()/describe() change proposed; not a duplicate — PTQ-0212's fix commit 2594cd44 added the export and migrated only annotation-root-brace-union-lowering.test.ts (now a `loadCleanlyShared` wrapper) without touching this file (region last changed 52e257bc 2026-08-01, pre-export), no open PTQ names this file's `loadCleanly`, and the same-wave sibling d7-03-schema-alias-union-decl targets a different file — an unmigrated PTQ-0212 residual per the store's per-file convention (note: the filing's claim that PTQ-0212's fix "closed" all seven sites is wrong — five other files still carry private copies too, but that does not affect this site's standing); D7 boilerplate-duplication, mechanical fix is import + local `properties` read (triage: claude-fable-5-1)
