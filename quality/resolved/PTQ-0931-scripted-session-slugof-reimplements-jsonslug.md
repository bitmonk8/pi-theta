---
id: PTQ-0931
title: scripted-live-session-harness.ts's ajv() and capturingAjv() each retype proto-named-harness.ts's exported jsonSlug closure inline
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/helpers/proto-named-harness.ts:5-8
  - tests/helpers/scripted-live-session-harness.ts:124-130
  - tests/helpers/scripted-live-session-harness.ts:142-151
sites: 3                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918092852
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# scripted-live-session-harness.ts's ajv() and capturingAjv() each retype proto-named-harness.ts's exported jsonSlug closure inline

## Observation
`tests/helpers/proto-named-harness.ts` exports `jsonSlug: SchemaSlugFn`, a
content-addressing function that derives a `SchemaSlug` (`{ slug,
canonicalBytes }`) by `JSON.stringify`-ing the schema once and using the
result for both fields. `tests/helpers/scripted-live-session-harness.ts`
declares the field-for-field identical closure twice, inline, under its own
two exported functions `ajv()` and `capturingAjv()`, rather than importing
`jsonSlug` from the sibling helper module.

## Evidence

`tests/helpers/proto-named-harness.ts:5-8` (re-read immediately before filing):
```ts
/** A content-addressing function deriving a distinct slug per distinct schema. */
export const jsonSlug: SchemaSlugFn = (schema) => {
  const bytes = JSON.stringify(schema);
  return { slug: bytes, canonicalBytes: bytes };
};
```

`tests/helpers/scripted-live-session-harness.ts:124-130` (re-read immediately
before filing):
```ts
/** The production AJV validator (matches the sibling live-seam harnesses). */
export function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}
```

`tests/helpers/scripted-live-session-harness.ts:142-151` (re-read immediately
before filing) — the identical closure retyped a second time in the same
file:
```ts
/** A real AJV validator together with its emitted diagnostics. */
export function capturingAjv(): { readonly validator: AjvSchemaValidator; readonly emitted: Diagnostic[] } {
  const emitted: Diagnostic[] = [];
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return {
    validator: new AjvSchemaValidator({ emit: (d) => emitted.push(d), slugOf }),
    emitted,
  };
}
```

`SchemaSlugFn`/`SchemaSlug` (`src/seams/schema-validator.ts:306-318`) pin the
exact shape both sites construct: `type SchemaSlugFn = (schema: LoweredSchema)
=> SchemaSlug` and `interface SchemaSlug { readonly slug: string; readonly
canonicalBytes: string }` — `jsonSlug` and both inline `slugOf` closures are
directly interchangeable: each returns `{ slug: JSON.stringify(schema),
canonicalBytes: JSON.stringify(schema) }` (the `jsonSlug` version computes the
string once into a local and reuses it for both fields; the two
`scripted-live-session-harness.ts` copies call `JSON.stringify` twice — an
implementation-detail difference, not an output difference). `grep -n
"JSON.stringify(schema)" tests/helpers/proto-named-harness.ts
tests/helpers/scripted-live-session-harness.ts` returns exactly the three
occurrences cited above (one in `jsonSlug`, two in `scripted-live-session-harness.ts`).

## Why this is a problem
`proto-named-harness.ts` names and exports this exact closure as `jsonSlug`
specifically so a caller building a `SchemaSlugFn` can import it.
`scripted-live-session-harness.ts` needs precisely this closure twice within
its own body — once for `ajv()`, once for `capturingAjv()` — and retypes it
both times rather than importing `jsonSlug` once, so the same three-line
closure exists three times across the two files in scope. A change to how a
schema is content-addressed for these test doubles (e.g. switching to a
stable-stringify or a hash instead of raw `JSON.stringify`) would have to be
applied at all three sites by hand, and the two in-file copies could already
have shared one local declaration even before considering the cross-file
import.

## Suggested direction (non-binding, optional)
`ajv()` and `capturingAjv()` both importing `jsonSlug` from
`./proto-named-harness` (or `capturingAjv()` at minimum reusing one local
`slugOf` instead of declaring its own second copy) is the target the existing
export already names; the fix stage owns which module keeps the single
definition.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin; the cited closures are a content-addressing function for an AJV
  validator double, not a pinned count or inventory.
- Recording-double check: `jsonSlug`/`slugOf` record no calls and back no
  "never called" witness — they derive a value from their input, not a call
  ledger; not applicable. (`capturingAjv()`'s `emitted` array IS a recording
  double, but it is not the duplicated fragment cited here — only the
  `slugOf` closure is.)
- docs/bugs/ signature search: `grep -rl "jsonSlug\|slugOf" docs/bugs/*.md` →
  0 hits; no open bug document discusses this duplication or gives a
  rationale for keeping separate copies.
- coverage-matrix/bug-doc citation search: `grep -n
  "proto-named-harness\|scripted-live-session-harness"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of either module or any exported function, only
  that the duplicated closure could be imported/shared rather than retyped.
- Coverage-drift check: the claim is about a repeated closure DEFINITION, not
  a missing test path; both `ajv()` and `capturingAjv()` are exercised by
  every test file that imports them.
- Prior-filing overlap search: `PTQ-0749` (open) covers a DIFFERENT pair —
  `scripted-live-session-harness.ts`'s `ajv()` (:112-119 in its cited
  revision) versus `tests/helpers/subagent-fn-child-regime.ts` (a file
  outside this wave's fourteen-file scope) — and does not mention
  `proto-named-harness.ts`, `jsonSlug`, or `capturingAjv()`'s own separate
  inline copy. `PTQ-0410` (resolved) covers an unrelated four-function
  canonical-form oracle (`slugOfCanonicalForm`/`compareCodePoint`/etc.) in
  `tests/*.test.ts` schema-lowering files, not this `SchemaSlugFn` closure.
  No filed or resolved item in the provided lists names
  `tests/helpers/proto-named-harness.ts`'s `jsonSlug` as a subject.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all three excerpts reproduce verbatim at the cited lines (proto-named-harness.ts:6-10 `export const jsonSlug`, scripted-live-session-harness.ts:124-130 `ajv()`, :142-151 `capturingAjv()`), a mktemp `diff` of the two in-file `slugOf` closures (:125-128 vs :144-147) is empty and `jsonSlug` is output-equivalent (one `JSON.stringify` reused for both fields); every site is live (proto-named-harness 3 importers; scripted-live-session-harness 31, `ajv()` reached from 21 test files, `capturingAjv()` from 2) and all three are under tests/helpers/, the canonical home; stated `JSON.stringify(schema)` search reproduces (3 closures) and coverage-matrix → 0, but the filing's "docs/bugs `slugOf` → 0 hits" is wrong — 6 files match, all about the PRODUCTION `slugOf` in production-composition.ts / bug 0099 slug hashing, none a rationale for separate helper copies, so the conclusion stands; chronology caveat for ticketing: `ajv()` (feefe7ca 2026-09-14) predates the `jsonSlug` export (71039544 2026-09-18, PTQ-0671's fix) while `capturingAjv()` (cc0a8fe7 2026-09-18) is contemporaneous, so "retypes rather than imports" is loose for `ajv()` though the in-file pair is duplication regardless; carve-outs clear (no gate file, real validator not a recording double, no red test, no merge/rename/delete); not a duplicate — open PTQ-0749 is `ajv()` vs subagent-fn-child-regime.ts (fixing it leaves all three of these closures in place), open PTQ-0824 is `capturingAjv()` vs params-inline-object-lowering.test.ts, and same-wave d7-01/d7-10 are proto-named-binder-write-sites.test.ts not migrating to `jsonSlug`/`range`; D7 copy-paste-double class with a mechanical fix (one shared `SchemaSlugFn` for both builders) — the fix stage should pick the shared home together with PTQ-0749's, noting proto-named-harness is a 3-importer proto-named-specific module while scripted-live-session-harness has 31 (triage: claude-fable-5-1)
