---
id: PTQ-1380
title: The renamed-field-plus-named-enum SchemaSidecar fixture is re-literalised verbatim in a second file
lens: D7
status: open
verdict: confirmed
locations:
  - tests/wire-translation-inbound-retag.test.ts:40-47
  - tests/wire-name-translation.test.ts:29-39
sites: 2
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# The renamed-field-plus-named-enum SchemaSidecar fixture is re-literalised verbatim in a second file

## Observation
`tests/wire-translation-inbound-retag.test.ts` declares `personSidecar()`, a `SchemaSidecar` literal with one renamed field (`first_name` ↔ `FirstName`) and one named-enum position (`/properties/severity` ↔ `Severity`). `tests/wire-name-translation.test.ts` declares `externalUserSidecar()`, a `SchemaSidecar` with the identical field/wire-name pair and the identical enum pointer/name pair, wrapped in a `Map` under a different key ("ExternalUser" vs the caller-supplied "Person"). The `wireNames` and `namedEnumPositions` array literals are byte-identical between the two functions.

## Evidence
tests/wire-translation-inbound-retag.test.ts:40-47
```ts
/** A hand-built `Person` sidecar: one renamed field, one named-enum field. */
function personSidecar(): SchemaSidecar {
  return {
    wireNames: [{ theta: "first_name", wire: "FirstName" }],
    namedEnumPositions: [{ pointer: "/properties/severity", enumName: "Severity" }],
    refTargets: [],
  };
}
```

tests/wire-name-translation.test.ts:29-39
```ts
// A schema with one renamed field (`first_name as "FirstName"`), one
// non-renamed field (`age`), and one non-renamed named-enum field
// (`severity: Severity`). The V5f sidecar carries the wire-name map (renamed
// fields only) and the named-enum-position map (named `enum` positions only).
function externalUserSidecar(): ReadonlyMap<string, SchemaSidecar> {
  const sidecar: SchemaSidecar = {
    wireNames: [{ theta: "first_name", wire: "FirstName" }],
    namedEnumPositions: [{ pointer: "/properties/severity", enumName: "Severity" }],
  };
  return new Map([["ExternalUser", sidecar]]);
}
```

Search run: `grep -rl "namedEnumPositions" tests/*.test.ts` — 6 files hit (`enum-schema-tag-privacy.test.ts`, `inbound-rebuild-declaration-order.test.ts`, `inbound-translation-plan.test.ts`, `inbound-union-arm-dispatch.test.ts`, `schema-lowering-hash.test.ts`, `wire-name-translation.test.ts`); of those, only `wire-name-translation.test.ts` carries the exact `first_name`/`FirstName`/`/properties/severity`/`Severity` literal quadruple that `wire-translation-inbound-retag.test.ts`'s `personSidecar()` also carries (`grep -n "properties/severity" tests/*.test.ts` confirms both files as the only two hits).

## Why this is a problem
Two files independently hand-author the same `SchemaSidecar` fixture data (same field name, same wire name, same enum pointer, same enum name) rather than one file importing the other's fixture or both importing a shared one from `tests/helpers/`. A future change to the fixture's shape (e.g. adding a required sidecar field, as this same corpus did when `refTargets: []` was added to `personSidecar` but not to `externalUserSidecar`) has to be caught and applied at both literal sites independently.

## Suggested direction (non-binding, optional)
A shared minimal-sidecar fixture (one renamed field, one named-enum field) under `tests/helpers/` would let both `translateInbound` unit-test files construct their `Person`/`ExternalUser` sidecars from one definition; naming and placement is a fix-stage decision.

## False-positive check
Gate-pin check: neither file matches `*gate*.test.ts` or its named kin. Recording-double check: `personSidecar`/`externalUserSidecar` are plain data fixtures, not recording doubles witnessing a never-called assertion, so the negative-witness carve-out does not apply. docs/bugs/ signature search: `grep -n "wire-translation-inbound-retag" docs/bugs/0173-inbound-rebuild-record-not-null-prototyped.md` shows the file cited by name as a witness at lines 217, 435, 603, 634, 774, 786, 935; this filing does not propose merging, renaming, or deleting either file or test, only observes the duplicated fixture literal, so the pinned-by-citation rule is respected. coverage-matrix search: not applicable since no test removal is proposed.

## Triage
verdict: confirmed — both excerpts reproduce verbatim (retag.test.ts:40-47 `personSidecar`, wire-name-translation.test.ts:29-39 `externalUserSidecar`) with byte-identical `wireNames`/`namedEnumPositions` one-entry literals, no shared sidecar fixture exists under tests/helpers/ (grep SchemaSidecar tests/helpers → 0), and the two-site count verifies — the filing's stated `properties/severity` grep actually hits 5 lines in 4 files, but the extra hits (enum-schema-tag-privacy.test.ts:439 enum-position-only sidecar, schema-lowering-hash.test.ts:211/223 assertions on buildSidecar output) are not the first_name/FirstName quadruple; the `refTargets` drift example is weak since `refTargets?` is optional (schema-lowering.ts:292) so nothing broke, but the D7 copy-paste-fixture class stands on the duplicated literal itself, both tests are live, neither is a gate/pin and no merge/delete is proposed (triage: claude-fable-5-1)
