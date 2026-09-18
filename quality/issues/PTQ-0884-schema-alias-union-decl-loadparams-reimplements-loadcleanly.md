---
id: PTQ-0884
title: schema-alias-union-decl.test.ts's loadParams() reimplements the loadCleanly() harness PTQ-0212 already centralised into tests/helpers/e2e-s1.ts
lens: D7
status: open
verdict: confirmed
locations:
  - tests/schema-alias-union-decl.test.ts:615-659
  - tests/helpers/e2e-s1.ts:177-210
sites: 1
fix_scope: localized
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# schema-alias-union-decl.test.ts's loadParams() reimplements the loadCleanly() harness PTQ-0212 already centralised into tests/helpers/e2e-s1.ts

## Observation
`tests/helpers/e2e-s1.ts` exports `loadCleanly(label, source, path = "test.theta"): LoadedParams`, a wrapper that parses a fixture through `parseDoc`, asserts a clean diagnostic list, and throws a labelled `Error` at each of three possible absent intermediates (`frontmatter === null`, `params === undefined`, `loweredSchema === undefined`) before returning `{ defs, loweredSchema }`. PTQ-0212 (fixed) documented this exact wrapper as duplicated byte-for-byte across seven other schema/params-lowering test files and centralised it into this export. `tests/schema-alias-union-decl.test.ts` (not one of PTQ-0212's seven original sites) declares its own private `loadParams(label, source): LoadedParams` performing the identical three-throw sequence, with the same three throw messages reproduced verbatim for the first and third checks, plus a locally-added fourth `properties` check and field.

## Evidence
`tests/helpers/e2e-s1.ts:177-210` (the canonical helper, re-read immediately before filing):
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
  const lowered = params.loweredSchema;
  if (lowered === undefined) {
    throw new Error(
      `${label}: the params block lowered to NOTHING (loweredSchema absent), so there is no AJV-validatable document for the argument boundary. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
    );
  }
  return { defs: (lowered["$defs"] ?? {}) as Record<string, unknown>, loweredSchema: lowered };
}
```

`tests/schema-alias-union-decl.test.ts:615-659` (re-read immediately before filing — the first and third throw messages are byte-identical to the canonical ones above, differing only in the parse-error-anchoring call and the added `properties` field/check):
```ts
interface LoadedParams {
  readonly loweredSchema: LoweredSchema;
  readonly properties: Record<string, unknown>;
  readonly defs: Record<string, unknown>;
}

function loadParams(label: string, source: string): LoadedParams {
  const doc = parseDoc(source, "bug0033.theta");
  expectLoadsClean(doc, `${label}: the aliased name is a declared top-level schema`);
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
      `${label}: the params block lowered to NOTHING (loweredSchema absent), so there is no ` +
        `AJV-validatable document. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
    );
  }
  const properties = lowered["properties"];
  if (properties === null || typeof properties !== "object") {
    throw new Error(
      `${label}: the lowered params document carries no \`properties\` object: ${JSON.stringify(lowered)}`,
    );
  }
  return {
    loweredSchema: lowered,
    properties: properties as Record<string, unknown>,
    defs: (lowered["$defs"] ?? {}) as Record<string, unknown>,
  };
}
```
`grep -n "helpers/e2e-s1" tests/schema-alias-union-decl.test.ts` → line 12, `import { codes, parseDoc } from "./helpers/e2e-s1";` — `loadCleanly` is not among the imports.

## Why this is a problem
The `frontmatter === null` and `params === undefined` throw clauses are byte-identical between the local `loadParams` and the exported `loadCleanly`, and the `loweredSchema === undefined` clause differs only by dropping the "for the argument boundary" phrase. PTQ-0212 already established that this exact three-throw wrapper, independently retyped across multiple files, was the duplication its fix closed; this file was not one of the seven sites that finding covered and was never migrated, so it stands as an additional, previously untracked copy of the same wrapper with the same throw wording. A future edit to the canonical wrapper's checking order or wording (as PTQ-0212's fix already did once) would not reach this file's copy.

## Suggested direction (non-binding, optional)
Calling `loadCleanly` from `./helpers/e2e-s1` for the shared frontmatter/params/loweredSchema chain and layering the file's own `properties` extraction on top of its returned `loweredSchema` would remove the duplicated three-throw body while keeping the one field (`properties`) the canonical `LoadedParams` does not carry.

## False-positive check
- Gate-pin check: `tests/schema-alias-union-decl.test.ts` does not match `*gate*.test.ts` or the named gate-kin patterns; the cited lines are a load-and-throw harness, not a pinned count or inventory.
- Recording-double check: `loadParams`/`loadCleanly` parse and return fields off one document; neither records calls nor backs a MUST-NOT-called witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -n "loadCleanly\|function loadParams" docs/bugs/0033-body-level-schema-alias-unsupported.md` → 0 hits stating a rationale for a local copy rather than the canonical export.
- coverage-matrix/bug-doc citation search: `grep -n "schema-alias-union-decl" docs/reference/coverage-matrix.md` → 0 hits. The bug 0033 doc cites this file by name and by group/cell id, never by `loadParams`'s internal implementation; this finding proposes no change to any `it()`/`describe()` name, count, or assertion, only to where the load-and-throw wrapper's shared portion is sourced from.
- Coverage check: the claim is about a repeated function DEFINITION with an already-fixed canonical counterpart, not a missing test path; the local `loadParams` is exercised by every `loadParams(...)` call in groups (c), (g) and (j).
- Overlap check: `grep -rl "schema-alias-union-decl" quality/intake/*loadcleanly* quality/resolved/PTQ-0212*` → 0 hits; PTQ-0212's own seven-site location list does not include this file, and this wave's `qw20260918050411-d7-03-loadcleanly-not-migrated-nested-lowering.md` names a different file (`inline-object-nested-lowering.test.ts`) — so this is a distinct, previously untracked site of the same recognised root cause, not a re-filing.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: tests/helpers/e2e-s1.ts:177-210 exports `LoadedParams`/`loadCleanly` exactly as excerpted and the private `LoadedParams`/`loadParams` reproduces at tests/schema-alias-union-decl.test.ts:616-659; a mechanical diff of the shared body shows the `frontmatter === null` and `params === undefined` throw clauses byte-identical and the `loweredSchema === undefined` clause differing only by the dropped "for the argument boundary" phrase, with the file's only e2e-s1 import (:12) being `codes, parseDoc`; the local copy is live (10 `loadParams(` call sites, suite green 77/77); stated searches reproduce (docs/bugs/0033 `loadCleanly|function loadParams` → 0, coverage-matrix file cite → 0); not a gate/kin file, no recording-double or red-test carve-out, no it()/describe() change proposed; D7 boilerplate-duplication class; not a duplicate — PTQ-0212 (fixed) never listed this file, PTQ-0506 covers this file's registry-oracle copy (:149-168) not this harness, the confirmed same-wave sibling d7-03-…-nested-lowering targets inline-object-nested-lowering.test.ts under the store's per-file convention, and the untriaged same-wave d7-57-03 that also names this site rests on the refuted claim that "no canonical helper currently exists" (loadCleanly does) so it is not a confirmed canonical to fold into; note for the fixer: the local `expectLoadsClean` runs a bug-0033 residue check (`expectNoResidue`, :499-506) before the clean-diagnostics assertion, so the migration must keep that pre-check alongside the `loadCleanly` call (triage: claude-fable-5-1)
