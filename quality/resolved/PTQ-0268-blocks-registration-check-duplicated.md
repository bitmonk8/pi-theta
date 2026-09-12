---
id: PTQ-0268
title: expectBlocksRegistration (the registration-blocking diagnostic count check) is redefined near-verbatim in a sibling bug-witness file
lens: D7                     # D2 | D7 — the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/annotation-nontype-text-refusal.test.ts:502-509
  - tests/annotation-nontype-text-refusal.test.ts:510-522
  - tests/schema-body-nontype-text-refusal.test.ts:391-398
  - tests/schema-body-nontype-text-refusal.test.ts:399-411
sites: 4                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912112713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# expectBlocksRegistration (the registration-blocking diagnostic count check) is redefined near-verbatim in a sibling bug-witness file

## Observation
tests/annotation-nontype-text-refusal.test.ts declares `expectBlocksRegistration(label, diagnostics)`:
a helper that asserts at least one error-severity `theta/load/*` or
`theta/parse/*` diagnostic is present, mirroring the predicate `hasLoadParseError`
(src/extension/production-composition.ts) reads to withhold registration.
tests/schema-body-nontype-text-refusal.test.ts — a sibling witness file for bug
0061, the schema-field-position counterpart of this file's three non-schema
positions — declares a function of the identical name, over the identical
filter predicate, with a near-identical doc comment and assertion message.

## Evidence
tests/annotation-nontype-text-refusal.test.ts:502-509 (the doc comment):
```ts
/**
 * The predicate `hasLoadParseError`
 * (src/extension/production-composition.ts) computes, evaluated over the
 * diagnostics this fixture actually emitted. This is the reachability link
 * between the refusal and a theta that does not register: without an
 * error-severity `theta/load/` or `theta/parse/` diagnostic the drop arm is not
 * taken and the theta ships with its declared constraints unenforced.
 */
```

tests/annotation-nontype-text-refusal.test.ts:510-522 (the function):
```ts
function expectBlocksRegistration(label: string, diagnostics: readonly Diagnostic[]): void {
  expect(
    diagnostics.filter(
      (d) =>
        d.severity === "error" &&
        (d.code.startsWith("theta/load/") || d.code.startsWith("theta/parse/")),
    ).length,
    `${label}: the drop gate reads error severity AND the \`theta/load/\` / \`theta/parse/\` ` +
      `namespaces; a warning-severity or differently-namespaced refusal would leave the theta ` +
      `registered with the annotation unenforced. Observed diagnostics: ` +
      `${JSON.stringify(diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`))}`,
  ).toBeGreaterThan(0);
}
```

tests/schema-body-nontype-text-refusal.test.ts:391-398 (the doc comment):
```ts
/**
 * The predicate `hasLoadParseError`
 * (src/extension/production-composition.ts:3263) computes, evaluated over the
 * diagnostics this fixture actually emitted. This is the reachability link
 * between the refusal and a theta that does not register: without an
 * error-severity `theta/load/` or `theta/parse/` diagnostic the drop arm is not
 * taken and the declaration ships validating every JSON value.
 */
```

tests/schema-body-nontype-text-refusal.test.ts:399-411 (the function):
```ts
function expectBlocksRegistration(label: string, read: DeclRead): void {
  expect(
    read.diagnostics.filter(
      (d) =>
        d.severity === "error" &&
        (d.code.startsWith("theta/load/") || d.code.startsWith("theta/parse/")),
    ).length,
    `${label}: the drop gate reads error severity AND the \`theta/load/\` / \`theta/parse/\` ` +
      `namespaces; a warning-severity or differently-namespaced refusal would leave the ` +
      `accept-anything declaration registered. Observed diagnostics: ` +
      `${JSON.stringify(read.lines)}`,
  ).toBeGreaterThan(0);
}
```

Pattern-wide search: `grep -rl "function expectBlocksRegistration" tests --include="*.test.ts"`
→ exactly these 2 files; no third site.

## Why this is a problem
The filter predicate —
`d.severity === "error" && (d.code.startsWith("theta/load/") || d.code.startsWith("theta/parse/"))`
— is byte-for-byte identical in both files. Both doc comments open with the
identical four-line clause "The predicate `hasLoadParseError` (...) computes,
evaluated over the diagnostics this fixture actually emitted. This is the
reachability link between the refusal and a theta that does not register:
without an error-severity `theta/load/` or `theta/parse/` diagnostic the drop
arm is not taken", diverging only in the trailing clause naming what stays
registered. Both assertion messages open with the identical sentence "the drop
gate reads error severity AND the `theta/load/` / `theta/parse/` namespaces; a
warning-severity or differently-namespaced refusal would leave the ...
registered", diverging only in the noun phrase for what is left registered
("the theta ... with the annotation unenforced" versus "the accept-anything
declaration"). This is the identical reachability check, explained in
near-identical prose, authored twice, each over its own local
diagnostics-wrapper type (a plain `readonly Diagnostic[]` here, a
`DeclRead.diagnostics` field in the sibling) rather than one shared assertion
helper.

## Suggested direction (non-binding, optional)
tests/helpers/e2e-s1.ts already hosts the `Diagnostic[]`-shaped read-only
helpers (`hasCode`, `errors`, `diagLines`, `diagCodes`) both files build their
assertions from; a `blocksRegistration`-shaped export over a plain
`readonly Diagnostic[]` would sit naturally beside them, with each file's own
wrapper-type adaptation staying at the call site.

## False-positive check
- Gate-pin: neither tests/annotation-nontype-text-refusal.test.ts nor
  tests/schema-body-nontype-text-refusal.test.ts matches `*gate*.test.ts` or
  the named kin.
- Recording-double: the function counts diagnostics an already-completed parse
  produced; it records no calls and backs no "never called" witness, so the
  negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "expectBlocksRegistration" docs/bugs`
  → 0 files; no open bug document names this duplication or gives a rationale
  for keeping this predicate local to each file.
- coverage-matrix/bug-doc citation search: `grep -n "expectBlocksRegistration"
  docs/reference/coverage-matrix.md` → 0 hits. Both files are cited by their
  own bug docs (0124, 0061) by file name and cell/group id (e.g.
  docs/bugs/0061-nonparams-type-positions-keep-junk-arm-text-silent.md:1169,
  "witness `tests/schema-body-nontype-text-refusal.test.ts` 96/96 green"),
  never by this helper's name; this finding proposes no change to any
  `it()`/`describe()` name, count or assertion, only to where the shared
  predicate is defined.
- Existing-helper search: `grep -rln "theta/load/\|theta/parse/"
  tests/helpers/*.ts` finds one near neighbour,
  tests/helpers/load-row-harness.ts:134-143's `registered(row: LoadRow):
  boolean`, whose OWN doc comment ("mirrored: `hasLoadParseError` ... is
  `diagnostics.some(d => d.severity === "error" && (d.code.startsWith(...) ||
  d.code.startsWith(...)))`") describes the same two-part predicate — but its
  body checks only `d.severity === "error"`, omitting the namespace test, and
  it returns a bare boolean rather than performing the assertion these two
  files need. `git log --follow --diff-filter=A` dates that helper to
  2026-09-11, three-plus weeks after both cited files (2026-08-08, 2026-08-20)
  and built for a different family (the `b02xx` composition-root fixtures), so
  it was not available to either file at authorship and is not, as written, a
  faithful stand-in for either copy of `expectBlocksRegistration`. Its
  existence does not change the claim: no helper in `tests/helpers/` performs
  this exact assertion, over either wrapper shape, today.
- Coverage check: the claim is about a repeated helper DEFINITION, not a
  missing test path; both copies are exercised by the tests that call them (12
  call sites in the reviewed file, confirmed via `grep -c
  "expectBlocksRegistration(" tests/annotation-nontype-text-refusal.test.ts` →
  12).

## Triage
verdict: confirmed — both `expectBlocksRegistration` definitions, doc comments, and the byte-identical filter predicate verified at the cited lines; grep reproduces exactly 2 sites, docs/bugs/ and coverage-matrix.md have 0 hits on the helper name, and no existing tests/helpers/*.ts export performs this exact assertion over either wrapper shape (triage: claude-opus-5)
