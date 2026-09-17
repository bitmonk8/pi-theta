---
id: PTQ-0490
title: realAjv() is redeclared byte-for-byte in three inbound-boundary test files instead of importing tests/helpers/scripted-live-session-harness.ts's ajv()
lens: D7
status: open
verdict: confirmed
locations:
  - tests/inbound-boundary-binder-args.test.ts:175-183
  - tests/inbound-rebuild-declaration-order.test.ts:112-120
  - tests/inbound-boundary-typed-query.test.ts:111-119
  - tests/helpers/scripted-live-session-harness.ts:112-119
sites: 3
fix_scope: cross-module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# realAjv() is redeclared byte-for-byte in three inbound-boundary test files instead of importing tests/helpers/scripted-live-session-harness.ts's ajv()

## Observation
tests/inbound-boundary-binder-args.test.ts, tests/inbound-rebuild-declaration-order.test.ts
and tests/inbound-boundary-typed-query.test.ts each declare a module-scope
`function realAjv(): AjvSchemaValidator`, carrying the identical one-line doc
comment `/** The production content-addressing of
\`src/extension/production-composition.ts:3789\`. */`, and an identical body:
an `AjvSchemaValidator` constructed with a no-op `emit` and a `slugOf` that
computes `canonicalBytes = JSON.stringify(schema)` and returns `{ slug:
canonicalBytes, canonicalBytes }`. tests/helpers/scripted-live-session-harness.ts
already exports an `ajv()` function (lines 112-119) that builds the identical
validator (a no-op `emit`, a `slugOf` whose `slug` and `canonicalBytes` are
both `JSON.stringify(schema)`) and is already imported by three other test
files (tests/b0288-prompt-turn-completion-witness.test.ts,
tests/b0319-prompt-bidirectional-ctx-abort-witness.test.ts,
tests/b0414-preabort-send-issued-witness.test.ts). None of the three
in-scope files imports it.

## Evidence

tests/inbound-boundary-binder-args.test.ts:175-183 (re-read immediately before filing):
```ts
/** The production content-addressing of `src/extension/production-composition.ts:3789`. */
function realAjv(): AjvSchemaValidator {
  return new AjvSchemaValidator({
    emit: (): void => {},
    slugOf: (schema: LoweredSchema): SchemaSlug => {
      const canonicalBytes = JSON.stringify(schema);
      return { slug: canonicalBytes, canonicalBytes };
    },
  });
}
```

tests/inbound-rebuild-declaration-order.test.ts:112-120 — byte-identical apart
from surrounding whitespace:
```ts
/** The production content-addressing of `src/extension/production-composition.ts:3789`. */
function realAjv(): AjvSchemaValidator {
  return new AjvSchemaValidator({
    emit: (): void => {},
    slugOf: (schema: LoweredSchema): SchemaSlug => {
      const canonicalBytes = JSON.stringify(schema);
      return { slug: canonicalBytes, canonicalBytes };
    },
  });
}
```

tests/inbound-boundary-typed-query.test.ts:111-119 — the same declaration a
third time, in a file that already imports a DIFFERENT helper
(`parseDoc`) from `./helpers/e2e-s1` at line 107:
```ts
/** The production content-addressing of `src/extension/production-composition.ts:3789`. */
function realAjv(): AjvSchemaValidator {
  return new AjvSchemaValidator({
    emit: (): void => {},
    slugOf: (schema: LoweredSchema): SchemaSlug => {
      const canonicalBytes = JSON.stringify(schema);
      return { slug: canonicalBytes, canonicalBytes };
    },
  });
}
```

tests/helpers/scripted-live-session-harness.ts:112-119 — the canonical helper,
functionally identical (same no-op `emit`, same `JSON.stringify(schema)`-keyed
slug), already exported and already imported elsewhere:
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

## Why this is a problem
Three files under review redeclare the identical "production content-addressing
AJV validator" fixture — same doc comment, same constructor shape, same
slugging behaviour — instead of importing the already-exported, already-used-
elsewhere `ajv()` from tests/helpers/scripted-live-session-harness.ts. The
in-scope file tests/inbound-boundary-typed-query.test.ts demonstrates the
helpers directory is already reachable and already used for a sibling concern
(`parseDoc`) from the very same import line area, so the omission is not a
reachability gap.

## Suggested direction (non-binding, optional)
Importing `ajv` from tests/helpers/scripted-live-session-harness.ts (or
re-exporting it under a name that reads naturally at these call sites) is the
home the three redeclarations, and the three existing importers, already
point toward.

## False-positive check
- Gate-pin: none of the three files matches `*gate*.test.ts` or a listed gate
  kin; the cited lines are a validator-construction helper, not a pinned count
  or inventory.
- Recording-double: `realAjv()`/`ajv()` build a real `AjvSchemaValidator`
  instance for driving fixtures through validation, not a recording double
  backing a MUST-NOT-called witness; the carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "realAjv" docs/bugs/` → no hits; no
  documented correct-reason red discusses this duplication.
- coverage-matrix/bug-doc citation search: `grep -n
  "inbound-boundary-binder-args\|inbound-rebuild-declaration-order\|inbound-boundary-typed-query"
  docs/reference/coverage-matrix.md` → 0 hits for all three. This finding
  proposes no merge, rename or deletion of any file or `it()`/`describe()` —
  only that the shared validator-construction function could be imported
  rather than redeclared — so no citation is affected.
- Overlap check: `grep -rl "realAjv" quality/intake/*.md quality/resolved/*.md`
  (excluding this file) → no hits; no already-filed or already-resolved
  finding names this duplication.
- Coverage-drift check: the claim is about a repeated fixture-builder
  DEFINITION already covered by an existing exported helper, not about a
  missing test path.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: the three `realAjv()` declarations are byte-identical at the cited lines (binder-args :175-183, rebuild-declaration-order :112-120, typed-query :111-119), each is live (2/2/3 references per file), and tests/helpers/scripted-live-session-harness.ts:112-119 exports a functionally identical `ajv()` (same no-op `emit`, `slug`/`canonicalBytes` both `JSON.stringify(schema)`) whose only importers are b0288/b0319/b0414 — none of the three files imports it; carve-outs re-run and clear (no gate file, real validator not a recording double, 0 hits for `realAjv` in docs/bugs/, 0 hits for the three files in docs/reference/coverage-matrix.md, no test merge/rename/delete proposed); no tracked issue names this triplet (PTQ-0410 is the SHA-256 canonical-slug oracle, PTQ-0328 is the resolved filing that created the harness's `ajv()`, and the same-wave intake files mentioning `realAjvValidator` cite other files' harness bundles) — D7 copy-paste fixture, mechanical import fix (triage: claude-fable-5-1)
