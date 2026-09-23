---
id: PTQ-1341
title: Both in-scope files redeclare a local fetch-assert-substitute registry-message renderer instead of the canonical registryMessageOf/registryMessageOrThrow
lens: D7
status: open
verdict: confirmed
locations:
  - tests/union-generic-arm-lowering.test.ts:157-193
  - tests/unresolvable-operand-structural-target-adjudication.test.ts:271-301
  - tests/helpers/load-row-harness.ts:61-126
sites: 2
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# Both in-scope files redeclare a local fetch-assert-substitute registry-message renderer instead of the canonical registryMessageOf/registryMessageOrThrow

## Observation
`tests/helpers/load-row-harness.ts` exports `registryMessageOf` (61-98,
fetch a registry row's *Message* template, assert it is defined naming the
registry page, assert each placeholder is present, substitute it) and
`registryMessageOrThrow` (111-126, the same fetch-and-assert-defined shape
with a caller-supplied failure sentence). Both files in this review's scope
independently declare local functions performing the identical
fetch-template / assert-defined / (optionally assert-placeholder-present) /
substitute sequence, one code and one placeholder at a time, rather than
importing either export: `unresolvedMessage`/`emptySchemaBodyMessage` in
`union-generic-arm-lowering.test.ts`, and `registered`/`interpolate` in
`unresolvable-operand-structural-target-adjudication.test.ts`.

## Evidence

`tests/helpers/load-row-harness.ts:111-126`:
```ts
export function registryMessageOrThrow(
  registry: readonly RegistryRow[],
  code: string,
  missingRowContext: string,
): string {
  const template = registryMessage(registry, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: the diagnostics code registry carries no Message row for ${code} — DIAG-4 ` +
        `(docs/spec_topics/diagnostics/diagnostic-shape.md) makes that column this file's only ` +
        `oracle, so a missing row is a loud harness failure, never a skip and never a ` +
        `hard-coded fallback. ${missingRowContext}`,
    );
  }
  return template;
}
```

`tests/union-generic-arm-lowering.test.ts:157-170`:
```ts
function unresolvedMessage(name: string): string {
  const template = registryMessage(REGISTRY, UNRESOLVED) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/code-registry-parse.md must carry the Message row for ${UNRESOLVED}`,
  ).toBeDefined();
  return (template as string).replace("<name>", name);
}

/** The one rendered line every position of the row must produce for `name`. */
function unresolvedLine(name: string): string {
  return `error ${UNRESOLVED}: ${unresolvedMessage(name)}`;
}
```
`tests/union-generic-arm-lowering.test.ts:178-193` (the second, near-identical
copy inside the same file, with the placeholder-presence check added):
```ts
function emptySchemaBodyMessage(subject: string): string {
  const template = registryMessage(REGISTRY, EMPTY_SCHEMA_BODY) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/code-registry-parse.md must carry the Message row for ${EMPTY_SCHEMA_BODY}`,
  ).toBeDefined();
  expect(
    template,
    `DIAG-4: the ${EMPTY_SCHEMA_BODY} Message template must carry the <X> placeholder; template=${JSON.stringify(template)}`,
  ).toContain("<X>");
  return (template as string).replace("<X>", subject);
}
```

`tests/unresolvable-operand-structural-target-adjudication.test.ts:282-301`:
```ts
function registered(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: ${REGISTRY_PAGE} carries no Message column for ${code} — DIAG-4 makes it this file's oracle, so a missing template is a harness failure, never a skip`,
    );
  }
  return template;
}

/** Fill `slots` into `code`'s registered template; every placeholder required. */
function interpolate(code: string, slots: Readonly<Record<string, string>>): string {
  let message = registered(code);
  for (const [slot, value] of Object.entries(slots)) {
    if (!message.includes(slot)) {
      throw new Error(
        `harness: the registered Message for ${code} does not spell ${slot} — this file interpolates it, so an absent placeholder is a harness failure, never a skip. Template: ${message}`,
      );
    }
    message = message.replace(slot, value);
  }
  return message;
}
```

`registered`+`interpolate` together compose the identical
fetch/assert-defined/assert-placeholder-present/substitute sequence
`registryMessageOf` already performs in one call; `unresolvedMessage` and
`emptySchemaBodyMessage` are two in-file copies of the narrower
`registryMessageOrThrow` shape, one omitting and one adding the
placeholder-presence check that the other in-scope file's `interpolate`
performs generically.

Exact search: `grep -c "registryMessage(REGISTRY" tests/union-generic-arm-lowering.test.ts tests/unresolvable-operand-structural-target-adjudication.test.ts` →
`union-generic-arm-lowering.test.ts:2`,
`unresolvable-operand-structural-target-adjudication.test.ts:1` (three
independent local call sites across the two files, none importing
`registryMessageOf`/`registryMessageOrThrow`).

## Why this is a problem
Both files re-derive the same fetch-template / assert-defined /
assert-placeholder-present / substitute sequence that
`tests/helpers/load-row-harness.ts` already generalises and exports twice
over (`registryMessageOf` for the fills+placeholder-checked case,
`registryMessageOrThrow` for the single-fetch-and-throw case). Neither
in-scope file imports either export; each declares its own same-shape local
wrapper instead — `union-generic-arm-lowering.test.ts` even declares TWO
near-identical copies of the narrower shape within itself (differing only in
whether the placeholder-presence check runs), and
`unresolvable-operand-structural-target-adjudication.test.ts` splits the same
sequence across two locally-composed functions.

## Suggested direction (non-binding, optional)
The natural home for a per-code, per-placeholder message renderer is the
already-exported `registryMessageOf`/`registryMessageOrThrow` pair in
`tests/helpers/load-row-harness.ts`; both files could call it in place of
their local wrappers.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or a named gate kin;
  the cited functions are message-template readers, not pinned counts or
  inventories.
- Recording-double check: not applicable — both are pure template-lookup
  functions over a static registry, not doubles backing a "never called"
  witness.
- docs/bugs/ signature search: `grep -n "unresolvedMessage\|emptySchemaBodyMessage" docs/bugs/0043-union-nonprimitive-arm-lowers-permissive.md` → 0 hits;
  `grep -n "function registered\|function interpolate" docs/bugs/0144-annotated-unresolvable-arg-structural-param-emits.md` → 0 hits. Neither
  bug doc gives a rationale for a file-local renderer.
- coverage-matrix/bug-doc citation search: `grep -n "union-generic-arm-lowering\|unresolvable-operand-structural-target-adjudication" docs/reference/coverage-matrix.md` → 0 hits.
  Both bug docs (0043, 0144) cite their respective file by name and by cell
  id for behaviour, never for these renderer functions; this finding proposes
  no merge, rename, or deletion of any `it()`/`describe()` — only that the
  existing helper's exports be called in place of the local wrappers — so no
  pinned citation is disturbed.
- Coverage check: the claim is about repeated renderer definitions, not a
  missing test path; every local function cited here is exercised by the
  file's own currently-stated assertions.
- Overlap check: `grep -rl "unresolvedMessage\|emptySchemaBodyMessage" quality/intake quality/issues quality/resolved` finds prior filings
  (PTQ-0832, PTQ-1001, PTQ-1089, and the same-wave
  `qw20260922211400-d7-68b-registry-message-helper-duplicated-both-files.md`)
  naming the same reimplements-registryMessageOf/registryMessageOrThrow root
  cause in OTHER files (`params-block-mapping-rhs-refusal.test.ts`,
  `params-brace-union-rhs-lowering.test.ts`, and others outside this review's
  scope); none of them cites `tests/union-generic-arm-lowering.test.ts` or
  `tests/unresolvable-operand-structural-target-adjudication.test.ts`, and
  the sibling registry-oracle-import findings already resolved against these
  two files (PTQ-0842, PTQ-0874) are about a different local read (the
  `REGISTRY` constant itself and an unrelated slug formula), not this
  message-renderer shape. This is the first filing to cite these two
  in-scope files' own renderer copies against the canonical helper by name.

## Triage
verdict: confirmed — independently re-verified: all four excerpts reproduce verbatim (tests/union-generic-arm-lowering.test.ts:157-193 `unresolvedMessage`/`emptySchemaBodyMessage`, tests/unresolvable-operand-structural-target-adjudication.test.ts:282-301 `registered`/`interpolate`, tests/helpers/load-row-harness.ts:61-126 `registryMessageOf`/`registryMessageOrThrow`); `grep -n "load-row-harness\|registryMessageOf\|registryMessageOrThrow"` over both in-scope files → 0 hits while `registryMessage(REGISTRY` counts are 2 and 1 as stated; the canonical helper covers every need the local copies serve (fetch, assert-defined naming the page, per-placeholder presence check, substitute; the throw-shaped `registryMessageOrThrow` for the file-2 non-expect variant) and all local callers (764, 975, 313, 323, 328) run inside test bodies/lazy renderers; docs/bugs/0043, 0144 and docs/reference/coverage-matrix.md give no rationale for a file-local renderer (grep → 0); D7 boilerplate-duplication class, no gate/recording-double/documented-red carve-out applies; not a duplicate — PTQ-0832/1001/1089/0808/0819 confirm the same family per-file against other files and PTQ-0842/0874 (these two files) cover the REGISTRY constant and slug formula, not this renderer shape (triage: claude-fable-5-1)
