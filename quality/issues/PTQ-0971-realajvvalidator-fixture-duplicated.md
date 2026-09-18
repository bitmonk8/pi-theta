---
id: PTQ-0971
title: realAjvValidator() double is retyped byte-for-byte across thirteen test files instead of a shared tests/helpers export
lens: D7
status: open
verdict: confirmed
locations:
  - tests/result-value-privacy.test.ts:115-123
  - tests/b0337-theta-enum-identity-invoke.test.ts:180-188
  - tests/b0342-forwarded-enum-attach-control.test.ts:100-108
  - tests/binder-forced-tool-dispatch.test.ts:299-307
  - tests/invoke-depth-wire-form-metric.test.ts:253-261
  - tests/invoke-return-enum-carrier-projection.test.ts:196-204
  - tests/params-default-enum-access-merge.test.ts:371-379
  - tests/params-default-unresolvable-enum-variant.test.ts:702-710
  - tests/subagent-envelope-negative-zero-fidelity.test.ts:315-323
  - tests/subagent-envelope-nonfinite-ok-refusal.test.ts:332-340
  - tests/subagent-envelope-result-carriage.test.ts:1015-1023
  - tests/subagent-return-depth-refusal.test.ts:759-767
  - tests/b0409-omitted-defaulted-binds-default.test.ts:124-133
sites: 13
fix_scope: cross-module
wave: qw20260918131151
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# realAjvValidator() double is retyped byte-for-byte across thirteen test files instead of a shared tests/helpers export

## Observation
`tests/result-value-privacy.test.ts` (in this review's scope) declares a
private module-scope `function realAjvValidator(): AjvSchemaValidator`
that constructs a real `AjvSchemaValidator` with a `slugOf` closure
content-addressing a `LoweredSchema` via `JSON.stringify` into both `slug`
and `canonicalBytes`. The file's own doc comment names this as "the
`tests/binder-forced-tool-dispatch.test.ts` `realAjvValidator()` pattern" —
an explicit acknowledgement that the function is being copied from another
test file rather than imported. `grep -n "^function realAjvValidator"
tests/*.ts` returns exactly 13 files; a body-only diff of all 13 against the
in-scope copy shows 12 are byte-identical and one
(`b0409-omitted-defaulted-binds-default.test.ts`) diverges. No module under
`tests/helpers/` exports this builder — the closest sibling,
`tests/helpers/scripted-live-session-harness.ts`, exports the same shape
under the name `ajv()` for its own callers, demonstrating the shape is
already recognised elsewhere as an exportable, shareable double.

## Evidence
`tests/result-value-privacy.test.ts:115-123` (re-read immediately before
filing; the in-scope site):
```ts
function realAjvValidator(): AjvSchemaValidator {
  return new AjvSchemaValidator({
    emit: (): void => {},
    slugOf: (schema: LoweredSchema): SchemaSlug => {
      const canonicalBytes = JSON.stringify(schema);
      return { slug: canonicalBytes, canonicalBytes };
    },
  });
}
```

Exact search: `grep -n "^function realAjvValidator" tests/*.ts` → 13 hits,
listed in `locations` above with their declaration line and closing brace.
A `diff` of each file's function body (extracted via `awk` from the
declaration line to its first top-level closing `}`) against the excerpt
above shows all sites identical except
`b0409-omitted-defaulted-binds-default.test.ts`, which diverges (checked and
excluded from the byte-identical count, but still redeclares the same named
double with the same construction shape and is included in `locations` as a
divergent same-named copy, not folded into the "identical" tally).

`tests/helpers/scripted-live-session-harness.ts:112-119` — the sibling
export this shape already has a name for elsewhere in the suite:
```ts
export function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}
```

## Why this is a problem
Thirteen files hand-retype the identical `AjvSchemaValidator` construction
rather than importing one shared builder, and the in-scope file's own doc
comment names the specific sibling file it copied the pattern from — the
duplication is not independent convergent design, it is an acknowledged
copy. `tests/helpers/scripted-live-session-harness.ts` already demonstrates
that exactly this double is exportable and importable under the name
`ajv()`, so the absence of a shared export for the other 13 sites is not a
structural necessity of the double itself.

## Suggested direction (non-binding, optional)
A shared `realAjvValidator()` (or `ajv()`-named) export alongside
`AjvSchemaValidator` in `tests/helpers/` is the natural home the doc comment
in the in-scope file already gestures at by naming its source pattern
explicitly.

## False-positive check
- Gate-pin carve-out: none of the 13 files match `*gate*.test.ts` or the
  named kin; not applicable.
- Recording-double carve-out: `realAjvValidator()` is not a recording double
  used for a MUST-NOT witness — it is a real validator constructed for
  positive schema-validation behaviour; not applicable.
- docs/bugs/ signature search: `grep -rl "realAjvValidator" docs/bugs/*.md`
  → 0 hits; no documented correct-reason red covers this construction.
- coverage-matrix/bug-doc citation search: `grep -n "realAjvValidator"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of any of the 13 tests or their `it()`s, only
  that the identical builder function could be imported rather than
  re-derived at each site.
- Prior-filing search: `grep -rli "realajvvalidator" quality/issues/*.md
  quality/resolved/*.md quality/intake/*.md` hits several files
  (PTQ-0521, PTQ-0531, PTQ-0542, PTQ-0686, PTQ-0687, PTQ-0454, PTQ-0490,
  PTQ-0661, PTQ-0680), but each of those names a different, already-filed
  root cause bundling `realAjvValidator` together with other re-derived
  pieces (`parseDeps`/`NOOP_CHECKPOINT`/`rootDouble`/`ctxDouble`) for a
  specific pair of files distinct from `tests/result-value-privacy.test.ts`;
  none cites the in-scope file or treats the `realAjvValidator` copy as its
  own thirteen-site root cause.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: `grep -n "^function realAjvValidator" tests/*.ts` reproduces at exactly the 13 cited declaration lines; a mktemp awk-extract + md5sum of all 13 bodies shows 12 byte-identical (`emit` no-op + `JSON.stringify` slugOf into both `slug`/`canonicalBytes`) and only b0409-omitted-defaulted-binds-default diverging — and that copy's `slugOf` is `productionSchemaSlugOf(schema)`, a materially different content-addressing, so at ticketing it should be dropped to `sites: 12` rather than counted as the same double; every copy is live (1-4 call sites per file), none is a gate file, `realAjvValidator` → 0 hits in docs/bugs/ and docs/reference/coverage-matrix.md, real validator not a recording double, no merge/rename/delete proposed; the sibling `ajv()` export excerpt reproduces verbatim but at tests/helpers/scripted-live-session-harness.ts:126-133 (cited :112-119, 14-line drift), and git chronology (binder-forced-tool-dispatch's copy b027a524 2026-07-28 predates `ajv()` feefe7ca 2026-09-14) supports the "copied from a sibling test" reading while making "instead of importing" loose for the older copies; not a duplicate — resolved PTQ-0490 fixed a disjoint `realAjv()` trio (inbound-boundary files), open PTQ-0749/PTQ-0931 are helper-internal (subagent-fn-child-regime / jsonSlug), and the open bundle filings PTQ-0521 (2 of these files), PTQ-0686 (4 of these files) and PTQ-0531 (b0342) each track a file-specific parseDeps/NOOP_CHECKPOINT/rootDouble harness of which `realAjvValidator` is one member, none treating the shared AJV builder as its own root cause — the fix stage should coordinate the shared home with those and PTQ-0749/PTQ-0931; D7 copy-paste fixture with a mechanical import fix (triage: claude-fable-5-1)
