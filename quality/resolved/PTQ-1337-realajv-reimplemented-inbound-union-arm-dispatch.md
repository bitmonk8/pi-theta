---
id: PTQ-1337
title: inbound-union-arm-dispatch.test.ts redeclares realAjv() byte-for-byte instead of importing the file's own already-open ajv() import line
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/inbound-union-arm-dispatch.test.ts:163-172
  - tests/helpers/scripted-live-session-harness.ts:143-145
sites: 1
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# inbound-union-arm-dispatch.test.ts redeclares realAjv() byte-for-byte instead of importing the file's own already-open ajv() import line

## Observation
`tests/inbound-union-arm-dispatch.test.ts` declares a module-scope
`function realAjv(): AjvSchemaValidator` (lines 163-172) that constructs an
`AjvSchemaValidator` with a no-op `emit` and a `slugOf` that content-addresses
via `JSON.stringify(schema)` into both `slug` and `canonicalBytes`. The same
file already has an open `import { ... } from
"./helpers/scripted-live-session-harness"` line (line 2), which exports a
function named `ajv()` (`tests/helpers/scripted-live-session-harness.ts:143-145`)
that builds the functionally identical validator via the module's own
`jsonSlug` slugger. The file imports three other names off that same module
(`assistantReply`, `contextToolsOf`, `ANTHROPIC_MODEL`) but not `ajv`, and
instead hand-writes the construction inline five call sites deep in the file
(lines 220, 644, 910, 997, 1108 reference `realAjv()`).

## Evidence
`tests/inbound-union-arm-dispatch.test.ts:163-172` (re-read immediately before filing):
```ts
/** The production content-addressing of `src/extension/production-composition.ts:3789-3818`. */
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

`tests/inbound-union-arm-dispatch.test.ts:2` — the already-open import from the
module carrying the canonical double:
```ts
import { assistantReply, contextToolsOf, ANTHROPIC_MODEL as SCRIPTED_MODEL } from "./helpers/scripted-live-session-harness";
```

`tests/helpers/scripted-live-session-harness.ts:143-145` — the canonical
export, functionally identical (no-op `emit`, `JSON.stringify(schema)`-keyed
slug via the module's own `jsonSlug`):
```ts
export function ajv(): AjvSchemaValidator {
  return new AjvSchemaValidator({ emit: () => {}, slugOf: jsonSlug });
}
```

Exact search: `grep -n "\bajv\b" tests/*.ts | grep -l scripted-live-session-harness` shows `ajv()` is already imported by 40+ other test files from this module (including sibling inbound-boundary files `inbound-boundary-binder-args.test.ts`, `inbound-boundary-typed-query.test.ts`, `inbound-rebuild-declaration-order.test.ts`, per the resolved PTQ-0490 finding); `tests/inbound-union-arm-dispatch.test.ts` is not among those importers despite importing three other names from the same module in the same statement.

## Why this is a problem
This is the same shape resolved twice already for sibling files
(PTQ-0490 for `inbound-boundary-binder-args.test.ts`,
`inbound-rebuild-declaration-order.test.ts`, `inbound-boundary-typed-query.test.ts`;
PTQ-0971 for a disjoint set of 13 other files) — a validator-construction
fixture re-typed rather than imported from an already-exported, already-widely-
used helper. Neither prior filing's `locations` list cites
`tests/inbound-union-arm-dispatch.test.ts`, so this site was not part of either
fix. The file's own single import statement already reaches into the exact
module that exports the double, which rules out a reachability gap as the
explanation.

## Suggested direction (non-binding, optional)
Adding `ajv` to the existing `import { ... } from
"./helpers/scripted-live-session-harness"` line and removing the local
`realAjv()` declaration is the mechanical route the file's own import
statement already points at.

## False-positive check
- Gate-pin: the file is not `*gate*.test.ts` or a listed gate kin; the cited
  lines are a validator-construction helper, not a pinned count or inventory.
- Recording-double: `realAjv()`/`ajv()` build a real `AjvSchemaValidator` for
  driving fixtures through real validation, not a recording double backing a
  MUST-NOT-called witness; the carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "realAjv" docs/bugs/` → no hits; no
  documented correct-reason red discusses this duplication.
- coverage-matrix/bug-doc citation search: `grep -n
  "inbound-union-arm-dispatch" docs/reference/coverage-matrix.md` → 0 hits.
  This finding proposes no merge, rename or deletion of any `it()`/`describe()`
  — only that the shared validator-construction function could be imported
  rather than redeclared.
- Overlap check: `grep -rl "realAjv" quality/intake/*.md
  quality/resolved/*.md` shows PTQ-0490 and PTQ-0971 cover this exact pattern,
  but neither's `locations` list names `tests/inbound-union-arm-dispatch.test.ts`
  — re-verified by reading both files in full; this is a new, uncited site of
  the same already-recognised pattern.

## Triage
verdict: confirmed — reproduces: `realAjv()` at tests/inbound-union-arm-dispatch.test.ts:163-172 (5 call sites: 220/644/910/997/1108) builds `new AjvSchemaValidator({emit: no-op, slugOf: JSON.stringify→{slug,canonicalBytes}})`, functionally identical to the exported `ajv()` at tests/helpers/scripted-live-session-harness.ts:143-145 whose `jsonSlug` (tests/helpers/proto-named-harness.ts:9-12) performs the same content-addressing; line 2 already imports three names from that module; D7 copy-paste-fixture class; no gate/recording-double/coverage-matrix carve-out applies (the file appears in docs/bugs only as a run path, never `realAjv`); not cited by PTQ-0490/0971/1079/0749/1003 — new uncited site (triage: claude-fable-5-1)
