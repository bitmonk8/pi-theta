---
id: PTQ-0861
title: params-inline-enum-position-refusal.test.ts's registryMessageOf/line pair is a byte-identical third copy of the same two functions
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/params-inline-enum-position-refusal.test.ts:132-153
  - tests/generic-argument-shredded-group-refusal.test.ts:194-216
  - tests/nested-inline-enum-generic-argument-refusal.test.ts:222-236
sites: 3
fix_scope: localized
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# params-inline-enum-position-refusal.test.ts's registryMessageOf/line pair is a byte-identical third copy of the same two functions

## Observation
`tests/params-inline-enum-position-refusal.test.ts` declares a
`registryMessageOf(code)` / `line(code, subs)` pair that reads the DIAG-4
*Message* template for a registry row, asserts its definedness and its
placeholder presence, and renders `error <code>: <message>`. The same two
functions, byte-for-byte, already exist in `tests/generic-argument-shredded-
group-refusal.test.ts` and in `tests/nested-inline-enum-generic-argument-
refusal.test.ts` — the latter pair was already filed this wave as
`qw20260918050411`'s sibling-file duplication (tracked upstream as PTQ-0638,
which cites those two files only). The in-scope file is a third,
independently-typed copy of the identical 22-line block, not covered by that
filing's location list.

## Evidence
`tests/params-inline-enum-position-refusal.test.ts:132-153` (re-read
immediately before filing):
```ts
function registryMessageOf(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: the diagnostics code registry must carry the *Message* row for ${code}; ` +
      `without it every expected message in this file would be a restatement, which DIAG-4 bars`,
  ).toBeDefined();
  return template as string;
}

/** `error <code>: <message>` for one substitution set, rendered from the registry. */
function line(code: string, subs: ReadonlyArray<readonly [string, string]>): string {
  let message = registryMessageOf(code);
  for (const [placeholder, value] of subs) {
    expect(
      message.includes(placeholder),
      `DIAG-4 anchor: the registry *Message* for ${code} must carry the ${placeholder} ` +
        `placeholder this file interpolates; observed template ${JSON.stringify(message)}`,
    ).toBe(true);
    message = message.replace(placeholder, value);
  }
  return `error ${code}: ${message}`;
}
```

`tests/generic-argument-shredded-group-refusal.test.ts:194-216` (re-read
immediately before filing) — the identical two functions, character for
character:
```ts
function registryMessageOf(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: the diagnostics code registry must carry the *Message* row for ${code}; ` +
      `without it every expected message in this file would be a restatement, which DIAG-4 bars`,
  ).toBeDefined();
  return template as string;
}

/** `error <code>: <message>` for one substitution set, rendered from the registry. */
function line(code: string, subs: ReadonlyArray<readonly [string, string]>): string {
  let message = registryMessageOf(code);
  for (const [placeholder, value] of subs) {
    expect(
      message.includes(placeholder),
      `DIAG-4 anchor: the registry *Message* for ${code} must carry the ${placeholder} ` +
        `placeholder this file interpolates; observed template ${JSON.stringify(message)}`,
    ).toBe(true);
    message = message.replace(placeholder, value);
  }
  return `error ${code}: ${message}`;
}
```

Exact search: `grep -rn "DIAG-4 anchor: the diagnostics code registry must
carry the \*Message\* row for" tests/*.test.ts` → exactly 3 hits, one per file
named in `locations` above (`params-inline-enum-position-refusal.test.ts:136`,
`generic-argument-shredded-group-refusal.test.ts:198`, `nested-inline-enum-
generic-argument-refusal.test.ts:226`) — no fourth site.

The in-scope file's own doc comment immediately above the function
(`:123-130`) names the duplication directly: "the neighbour witness
(tests/nested-inline-enum-generic-argument-refusal.test.ts) reads its
expectations the same way, and this file must not become the one place where
the inline-enum bytes are hard-coded" — the author knew of at least one sibling
copy and restated the block rather than importing a shared one. Unlike the
`REGISTRY` constant itself (which this file imports from the canonical
`tests/helpers/registry-oracle.ts`, PTQ-0215's home), no equivalent shared
home exports `registryMessageOf`/`line`.

## Why this is a problem
The same 22-line, two-function block — read a registry row's *Message*
template, assert it is defined, assert each placeholder is present, substitute
it, and render `error <code>: <message>` — is now typed independently in
three test files with zero byte drift between them. A change to the wording
of either loud-failure message, or to the `error <code>:` rendering
convention, requires three hand-synchronised edits; the in-scope file's own
comment shows the duplication was a conscious choice at authoring time, not an
oversight discovered only now.

## Suggested direction (non-binding, optional)
A shared `tests/helpers/` module exporting `registryMessageOf`/`line`
parameterised over a `RegistryRow[]` (the shape `tests/helpers/registry-oracle.ts`
already exports as `REGISTRY`) would let all three files import one
implementation instead of retyping it; named here as observation of where the
duplication collapses, not as a design.

## False-positive check
- Gate-pin carve-out: none of the three files matches `*gate*.test.ts` or
  named kin; not applicable.
- Recording-double carve-out: `registryMessageOf`/`line` read a registry row
  and assert its shape/definedness; they are not a MUST-NOT-be-called negative
  witness; not applicable.
- docs/bugs/ signature search: `grep -rn "registryMessageOf" docs/bugs/` → 0
  hits; no documented correct-reason red cites this function by name.
- coverage-matrix/bug-doc citation search: `grep -n "params-inline-enum-
  position-refusal\|generic-argument-shredded-group-refusal\|nested-inline-
  enum-generic-argument-refusal" docs/reference/coverage-matrix.md` → 0 hits.
  `docs/bugs/0162-inline-enum-trigger-misses-params-position.md` cites
  `tests/params-inline-enum-position-refusal.test.ts` by name as its witness
  file (line 571, 609), but only the file as a whole (its cell count and the
  `vitest run` invocation), not the `registryMessageOf`/`line` functions
  specifically; this finding proposes no merge, rename, or deletion of the
  file or any of its `it()` cells, only that the shared block be imported
  rather than retyped.
- Duplicate-topic check: `grep -rl "generic-argument-shredded-group-refusal"
  quality/` shows the pair (`nested-inline-enum-generic-argument-refusal.test.ts`,
  `generic-argument-shredded-group-refusal.test.ts`) already tracked as
  confirmed under `quality/issues/PTQ-0638-...md`; that finding's `locations`
  list cites those two files only and does not name `params-inline-enum-
  position-refusal.test.ts`, so this filing adds the third site rather than
  restating an already-filed one.
- Confirmed all three cited locations are under `tests/`; none is `src/`,
  `extensions/`, or `tools/`.

## Triage
verdict: confirmed — independently re-verified: sed-extracted params-inline-enum-position-refusal.test.ts:132-153 diffs empty against generic-argument-shredded-group-refusal.test.ts:194-216 and against nested-inline-enum-generic-argument-refusal.test.ts:221-243 (filing's 222-236 clips `line()`'s tail; content matches), the loud-message grep reproduces at exactly 3 hits, `line`/`registryMessageOf` are live (8 call sites in the in-scope file), all locations under tests/, D7 boilerplate-duplication class, not a gate file, docs/bugs `registryMessageOf` → 0, coverage-matrix → 0, bug 0162 names the file only as a whole-file witness and no merge/rename/delete is proposed; one sub-claim is refuted but strengthens rather than weakens the finding — "no shared home exports registryMessageOf/line" is false: tests/helpers/load-row-harness.ts:62-91 already exports `registryMessageOf(registry, registryPath, code, fills)` + `registryLineOf` with the identical lookup→assert-defined→assert-placeholder→replace→`error <code>: <message>` body (10+ importers), so the fix is a migration to that helper (with REGISTRY from registry-oracle) rather than minting a new module, byte-preserving every rendered line; not a duplicate: PTQ-0638's locations are the two sibling files only, resolved PTQ-0662 migrated only this file's RegistryRow/REGISTRY and left :132-153 in place, and no open PTQ (0747/0777/0786) cites this file — same class as PTQ-0747 on a disjoint file set (triage: claude-fable-5-1)
