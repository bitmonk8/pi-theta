---
id: PTQ-1346
title: schema-alias-union-decl.test.ts retypes the {validator, emitted} AJV double instead of importing the canonical capturingAjv() export
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/schema-alias-union-decl.test.ts:580-590
  - tests/helpers/scripted-live-session-harness.ts:157-163
sites: 1
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# schema-alias-union-decl.test.ts retypes the {validator, emitted} AJV double instead of importing the canonical capturingAjv() export

## Observation
`tests/schema-alias-union-decl.test.ts` declares a private module-scope
`function ajv(): { readonly validator: AjvSchemaValidator; readonly emitted:
Diagnostic[] }` that constructs a real `AjvSchemaValidator` with a `slugOf`
closure computing `slug` and `canonicalBytes` as `JSON.stringify(schema)`
and a `emit` callback that pushes into a local `emitted` array.
`tests/helpers/scripted-live-session-harness.ts` already exports a function
of the identical name-shape, `capturingAjv()`, with the identical return
shape and identical behaviour (its `slugOf` is the shared `jsonSlug` helper
from `tests/helpers/proto-named-harness.ts`, which computes `slug =
canonicalBytes = JSON.stringify(schema)` — the same value the in-scope file
computes inline). `capturingAjv` is already imported (aliased `as ajv`) by
three other test files in this suite:
`tests/inline-object-wire-name-rename-refusal.test.ts:1`,
`tests/inline-slug-name-reservation.test.ts:1`, and
`tests/params-inline-object-lowering.test.ts:11`.

## Evidence
`tests/schema-alias-union-decl.test.ts:580-590` (re-read immediately before
filing):
```ts
/** A real `AjvSchemaValidator` plus the diagnostics it emitted (V8c seam). */
function ajv(): { readonly validator: AjvSchemaValidator; readonly emitted: Diagnostic[] } {
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

`tests/helpers/scripted-live-session-harness.ts:157-163` — the exported,
already-imported-elsewhere sibling with identical behaviour:
```ts
/** A real AJV validator together with its emitted diagnostics. */
export function capturingAjv(): { readonly validator: AjvSchemaValidator; readonly emitted: Diagnostic[] } {
  const emitted: Diagnostic[] = [];
  return {
    validator: new AjvSchemaValidator({ emit: (d) => emitted.push(d), slugOf: jsonSlug }),
    emitted,
  };
}
```

`tests/helpers/proto-named-harness.ts:9-12` — the `jsonSlug` the export
uses, whose behaviour matches the in-scope file's inline `slugOf` byte for
byte:
```ts
export const jsonSlug: SchemaSlugFn = (schema) => {
  const bytes = JSON.stringify(schema);
  return { slug: bytes, canonicalBytes: bytes };
};
```

Exact search confirming the sibling import sites: `grep -rn "capturingAjv"
tests/*.ts tests/helpers/*.ts` → 4 hits: the export declaration and three
files importing it aliased `as ajv`
(`tests/inline-object-wire-name-rename-refusal.test.ts:1`,
`tests/inline-slug-name-reservation.test.ts:1`,
`tests/params-inline-object-lowering.test.ts:11`).

## Why this is a problem
The in-scope file's local `ajv()` and the exported `capturingAjv()` are the
same return shape, the same construction (`new AjvSchemaValidator({ emit,
slugOf })` with `emit` pushing into a local array), and the same
content-addressing behaviour (`slug === canonicalBytes === JSON.stringify(schema)`),
so the local declaration is a rewrite of an export the suite already treats
as shareable — three sibling files import it under the exact call-site name
(`ajv`) the in-scope file gives its local copy.

## Suggested direction (non-binding, optional)
Importing `capturingAjv` (aliased `as ajv`, matching the three existing
importers) in place of the local declaration is the shape the sibling files
already demonstrate.

## False-positive check
- Gate-pin carve-out: `schema-alias-union-decl.test.ts` does not match
  `*gate*.test.ts` or any named kin; not applicable.
- Recording-double carve-out: the double is a real `AjvSchemaValidator` used
  for positive validation and lowering assertions, not a MUST-NOT-called
  recording double; not applicable.
- docs/bugs/ signature search: `grep -rl "capturingAjv\|function ajv" docs/bugs/*.md`
  → 0 hits; no documented correct-reason red covers this construction.
- coverage-matrix/bug-doc citation search: `grep -n "schema-alias-union-decl"
  docs/reference/coverage-matrix.md` → 0 hits; this finding proposes no
  merge, rename, or deletion of any `it()` in the file, only that the local
  builder function could import the existing export.
- Prior-filing search: `grep -rli "capturingajv" quality/intake quality/issues
  quality/resolved` hits PTQ-0824, PTQ-0848, PTQ-0931, PTQ-1079, and one open
  intake file (`params-inline-object-loadcleanly-not-migrated.md`) — each
  names a different in-scope file or a different root cause (a `loadCleanly`
  migration, a `jsonSlug` reimplementation, a `registrymessageof` trio); none
  cites `tests/schema-alias-union-decl.test.ts` or treats its local `ajv()`
  as the root cause. `grep -rl "schema-alias-union-decl" quality/resolved`
  shows this file already has three resolved D7 findings (registry-oracle
  reimplemented, `msg` reimplements `registryMessageOf`, `diagLines`
  reimplemented) — none of them is the `ajv()`/`capturingAjv` pair, so this
  is a distinct root cause on the same file, not a duplicate.

## Triage
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at the cited lines (test :580-590 `function ajv()` with the inlined JSON.stringify `slugOf`; harness :157-163 `export function capturingAjv()` on proto-named-harness.ts:9-12 `jsonSlug`, which yields the same slug === canonicalBytes === JSON.stringify(schema)), the local copy is live (destructured `{ validator, emitted }` at :983/:1025/:2249 with `emitted` read as positive values), the file imports nothing from ./helpers/scripted-live-session-harness, `capturingAjv` is imported by exactly the 3 files claimed, stated docs/bugs and coverage-matrix searches → 0 hits, both locations under tests/, D7 copy-paste-double class, no gate/recording-double/red-test carve-out and no merge/rename/delete proposed; dedupe: the two prior canonicals for this root cause are both closed and each migrated only its own cited files — PTQ-0425 (fixed; its 12-file pattern search listed this file but its fix touched only the two wire-name/slug files) and PTQ-0824 (fixed; params-inline-object-lowering only, confirmed on exactly this "predecessor fixed narrowly, this file still unmigrated" ground), so with no open row tracking the 9 remaining `function ajv(): { readonly validator…; readonly emitted… }` copies (re-run search → 9 tests/*.test.ts files incl. this one) this is an untracked residual site of a closed fix, not a duplicate of a live row (triage: claude-fable-5-1)
