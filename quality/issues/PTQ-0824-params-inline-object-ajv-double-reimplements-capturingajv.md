---
id: PTQ-0824
title: params-inline-object-lowering.test.ts redeclares the capturingAjv() double tests/helpers/scripted-live-session-harness.ts already exports
lens: D7
status: open
verdict: confirmed
locations:
  - tests/params-inline-object-lowering.test.ts:429-438
  - tests/helpers/scripted-live-session-harness.ts:135-145
sites: 1
fix_scope: localized
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# params-inline-object-lowering.test.ts redeclares the capturingAjv() double tests/helpers/scripted-live-session-harness.ts already exports

## Observation
`tests/helpers/scripted-live-session-harness.ts` exports `capturingAjv()`, a
real `AjvSchemaValidator` wired with an `emit` callback that pushes onto a
local `emitted` array, keyed by a `slugOf` that JSON-stringifies the schema
into both the `slug` and `canonicalBytes` fields. `tests/params-inline-object-
lowering.test.ts` declares a private function `ajv()` with the identical
return-type annotation and an identical three-statement body rather than
importing the export, even though the same file already imports several
other test-only oracles from `tests/helpers/` (`./helpers/e2e-s1`,
`./helpers/canonical-slug-oracle`, `./helpers/registry-oracle`).

## Evidence
`tests/helpers/scripted-live-session-harness.ts:135-145` (re-read immediately
before filing):
```ts
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

`tests/params-inline-object-lowering.test.ts:429-438` (re-read immediately
before filing) — same return-type annotation, same body, only the local name
(`ajv` instead of `capturingAjv`) and the doc-comment wording differ:
```ts
/** A real `AjvSchemaValidator` plus the diagnostics it emitted. */
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

Exact search: `grep -n "helpers/scripted-live-session-harness" tests/params-
inline-object-lowering.test.ts` → 0 hits — the file's import list carries no
reference to that module. `grep -n "^function ajv(): { readonly validator:
AjvSchemaValidator" tests/params-inline-object-lowering.test.ts` → exactly one
hit, the cited declaration, used at the two call sites `tests/params-inline-
object-lowering.test.ts:934` (fixture B, group f1) and `:998` (NESTED-MULTI,
group f2).

## Why this is a problem
The exact double this file needs — a real `AjvSchemaValidator` with an `emit`
callback recording into a local array, keyed by a `slugOf` that
JSON-stringifies the schema for both fields — already exists as a named,
exported function (`capturingAjv`) with a matching return-type annotation and
identical three-statement body. The reviewed file restates that body under a
shorter local name instead of importing the existing export. This is at least
the second independent restatement of `capturingAjv()`'s exact body outside
its own module (the other being `tests/params-brace-union-rhs-lowering.test.ts`,
filed separately this wave), so the module's own export is not the place a
third author would find it without reading every sibling bug-report test file
first.

## Suggested direction (non-binding, optional)
Importing `capturingAjv` from `tests/helpers/scripted-live-session-harness.ts`
in place of the local `ajv()` declaration removes this restatement; this is
named as observation of where the duplication collapses, not as a design.

## False-positive check
- Gate-pin carve-out: `params-inline-object-lowering.test.ts` does not match
  `*gate*.test.ts` or named kin; not applicable.
- Recording-double carve-out: `ajv()`/`capturingAjv()` build a real validator
  whose emissions are read as positive values (`emitted.map((d) => d.code)`
  compared to `[]` or to a specific code), not a MUST-NOT-be-called negative
  witness; not applicable.
- docs/bugs/ signature search: `grep -rn "capturingAjv" docs/bugs/` → 0 hits;
  no documented correct-reason red cites this function by name.
- coverage-matrix/bug-doc citation search: `grep -n "params-inline-object-
  lowering" docs/reference/coverage-matrix.md` → 0 hits. The file itself is
  cited by name across dozens of `docs/bugs/*.md` reports as a byte-frozen
  regression lock (e.g. 0045, 0052, 0097, 0160, 0228 — "37 cells", "must not
  move byte-for-byte"), but none of those citations name the local `ajv()`
  helper specifically, and this finding proposes no merge, rename, or
  deletion of the test file or any of its `it()` cells — only that the
  existing helper import replace one locally re-typed function body.
- Confirmed both cited locations are under `tests/`; neither is `src/`,
  `extensions/`, or `tools/`.

## Triage
verdict: confirmed — independently re-verified: both excerpts reproduce at the cited lines (harness :135-145 `export function capturingAjv()`, test :429-439 `function ajv()`) and `diff` of the two sed-extracted blocks after a name-only substitution is empty; the local copy is live (called at :963 and :997 — the filing's ":934/:998" is minor line drift — and `emitted` is read as positive values), the file imports nothing from `./helpers/scripted-live-session-harness` (grep → 0), and `capturingAjv`'s only importers are inline-object-wire-name-rename-refusal and inline-slug-name-reservation, i.e. the export was minted by the now-fixed PTQ-0425 which migrated only its own two cited files while the same 12-file search it recorded still leaves 9 restatements (this file among them); stated searches reproduce (docs/bugs `capturingAjv` → 0, coverage-matrix file cite → 0), both locations under tests/, D7 copy-paste-double class, no gate/recording-double/red-test carve-out and no merge/rename/delete proposed; no open PTQ names this shape (0425/0490/0447/0452 are all resolved; PTQ-0751 mentions a different file pair's `ajv()` only in passing) — note same-wave siblings d7-02 (params-brace-union) and d7-57-02 (reserved-keyword-type-position) file the identical root cause on disjoint files and should be folded into this earliest-filed canonical at acceptance (triage: claude-fable-5-1)
