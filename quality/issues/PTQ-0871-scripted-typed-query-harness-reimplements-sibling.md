---
id: PTQ-0871
title: scripted-typed-query-harness.ts redeclares four pieces already exported by its sibling typed-query-harness.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/helpers/scripted-typed-query-harness.ts:36-39
  - tests/helpers/scripted-typed-query-harness.ts:42-44
  - tests/helpers/scripted-typed-query-harness.ts:79-92
  - tests/helpers/scripted-typed-query-harness.ts:97-103
  - tests/helpers/typed-query-harness.ts:22
  - tests/helpers/typed-query-harness.ts:25-27
  - tests/helpers/typed-query-harness.ts:57-68
  - tests/helpers/typed-query-harness.ts:72-78
sites: 4                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# scripted-typed-query-harness.ts redeclares four pieces already exported by its sibling typed-query-harness.ts

## Observation
`tests/helpers/scripted-typed-query-harness.ts` and `tests/helpers/typed-query-harness.ts`
sit in the same `tests/helpers/` directory and both build a scaffold for
driving the real parser / AJV / typed-query stack over a scripted
forced-respond model. Four pieces are declared independently in both files
with either byte-identical bodies or bodies that differ only by hardcoding a
value the sibling already takes as a parameter: `NOOP_CHECKPOINT`/`SEAM_NOOP_CHECKPOINT`,
`liveSignal()`, `schemaDeclsOf()`, and `ajv()`.

## Evidence

**`NOOP_CHECKPOINT`** — `tests/helpers/scripted-typed-query-harness.ts:36-39`:
```ts
export const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};
```
`tests/helpers/typed-query-harness.ts:22` (already re-exports the identical
canonical value under the same name):
```ts
export { SEAM_NOOP_CHECKPOINT as NOOP_CHECKPOINT } from "./invoke-seam-scaffold";
```

**`liveSignal()`** — `tests/helpers/scripted-typed-query-harness.ts:42-44`:
```ts
export function liveSignal(): AbortSignal {
  return new AbortController().signal;
}
```
`tests/helpers/typed-query-harness.ts:25-27` — byte-identical:
```ts
export function liveSignal(): AbortSignal {
  return new AbortController().signal;
}
```

**`schemaDeclsOf()`** — `tests/helpers/scripted-typed-query-harness.ts:79-92`:
```ts
export function schemaDeclsOf(src: string): readonly SchemaDecl[] {
  const deps = {
    systemNote: {
      pi: { sendMessage: () => Promise.resolve() },
      ui: { notify: () => {} },
      emitDiagnostic: () => {},
    },
    modelMatcher: { resolve: () => "resolved" as const },
  } as unknown as ParseThetaDocumentDeps;
  const source: ThetaSource = {
    path: "probe.theta",
    bytes: new TextEncoder().encode(src),
  };
  const doc = parseThetaDocument(source, deps);
  return doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema");
}
```
`tests/helpers/typed-query-harness.ts:57-68` — same `deps` object and
`parseThetaDocument`/filter sequence, differing only in taking `path` as a
parameter instead of the literal `"probe.theta"`:
```ts
export function schemaDeclsOf(src: string, path: string): readonly SchemaDecl[] {
  const deps = {
    systemNote: {
      pi: { sendMessage: () => Promise.resolve() },
      ui: { notify: () => {} },
      emitDiagnostic: () => {},
    },
    modelMatcher: { resolve: () => "resolved" as const },
  } as unknown as ParseThetaDocumentDeps;
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  const doc = parseThetaDocument(source, deps);
  return doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema");
}
```

**`ajv()`** — `tests/helpers/scripted-typed-query-harness.ts:97-103`:
```ts
export function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: "probe",
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}
```
`tests/helpers/typed-query-harness.ts:72-78` — same body, `slug` taken as a
parameter instead of the literal `"probe"`:
```ts
export function ajv(slug: string): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug,
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}
```

Exact search run: `grep -n "^export function liveSignal\|^export function schemaDeclsOf\|^export function ajv\|^export const NOOP_CHECKPOINT" tests/helpers/scripted-typed-query-harness.ts tests/helpers/typed-query-harness.ts` →
the eight declarations cited above, one pair per name, both files.

## Why this is a problem
Both files already live in `tests/helpers/`, both declare all four pieces
under the same public names, and three of the four (`NOOP_CHECKPOINT`,
`liveSignal`, and the shared body of `schemaDeclsOf`/`ajv`) carry no
behavioural difference at all beyond a literal a caller could pass as an
argument. `typed-query-harness.ts`'s versions of `schemaDeclsOf`/`ajv` are
already the more general form (`path`/`slug` parameters), so
`scripted-typed-query-harness.ts`'s narrower duplicates add a second
declaration of the same scaffold piece under the identical exported name
rather than calling the sibling's with a literal argument.

## Suggested direction (non-binding, optional)
Importing `NOOP_CHECKPOINT`, `liveSignal`, `schemaDeclsOf`, and `ajv` from
`./typed-query-harness` (supplying the literal `"probe.theta"`/`"probe"`
arguments the general forms already accept) is the path already available in
the same directory.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or a listed gate kin;
  not applicable (these are `tests/helpers/` scaffold modules, not gate test
  files).
- Recording-double check: none of the four pieces is a recording double
  backing a MUST-NOT-witness assertion — `NOOP_CHECKPOINT` is an inert seam,
  `liveSignal`/`schemaDeclsOf`/`ajv` are stimulus/setup builders; carve-out
  does not apply.
- docs/bugs/ signature search: `grep -rln "NOOP_CHECKPOINT\|liveSignal\|schemaDeclsOf" docs/bugs/` →
  0 hits; no bug document cites any of these names as a deliberate,
  documented divergence between the two helper files.
- coverage-matrix/bug-doc citation search: `grep -rn "scripted-typed-query-harness\|typed-query-harness" docs/reference/coverage-matrix.md docs/bugs/` →
  0 hits for either helper module by filename; neither is cited by name, and
  no merge/rename/delete of any test is proposed — only that one helper
  module import pieces a sibling helper module already exports more
  generally.
- Duplicate-topic check: `grep -rl "scripted-typed-query-harness" quality/issues/ quality/resolved/ quality/intake/` →
  0 hits before this filing. Distinct from resolved PTQ-0439 (which covered
  the two b0352/b0353 TEST FILES' now-removed harness duplication, predating
  this shared module's creation) and from PTQ-0729/PTQ-0644/PTQ-0580 (which
  cover `typed-query-harness.ts`'s relationship to `tests/live/**` and
  `e2e-s3` substrates, not its relationship to this sibling helper).

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: all eight excerpts reproduce verbatim at the cited lines (scripted-typed-query-harness.ts:36-39/42-44/79-92/97-103; typed-query-harness.ts:22/25-27/57-68/72-78); `SEAM_NOOP_CHECKPOINT` at tests/helpers/invoke-seam-scaffold.ts:32-36 is byte-identical to the scripted helper's local `NOOP_CHECKPOINT`; `liveSignal` bodies are byte-identical; `schemaDeclsOf`/`ajv` bodies diff to zero after substituting the `"probe.theta"`/`"probe"` literals for the sibling's `path`/`slug` params; all four scripted-helper exports are live (both b0352/b0353 import every one, `ajv()` also called internally at :135); both files under tests/, D7 boilerplate-duplication class, no gate/recording-double/red-test carve-out, neither helper cited by coverage-matrix or any bug doc (the filing's docs/bugs "0 hits" is off — 4 files match, but all cite the unrelated production `schemaDeclsOf` in src/production-theta-producer.ts); no existing PTQ cites either helper module — PTQ-0439 (fixed) minted the scripted helper and PTQ-0644/0580 (fixed) minted typed-query-harness.ts in the same wave, each hoisting the overlapping quartet into a separate home, which is the untracked root cause here; same-wave d7-02-livesignal candidate covers test-file locals, a distinct root cause (triage: claude-fable-5-1)
