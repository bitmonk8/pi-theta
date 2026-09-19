---
id: PTQ-0939
title: messageTemplate() reimplements the canonical registryMessageOf() instead of importing it
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/discriminator-field-classifier-brace-group.test.ts:93-105
  - tests/helpers/load-row-harness.ts:55-82
sites: 1
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918092852
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# messageTemplate() reimplements the canonical registryMessageOf() instead of importing it

## Observation
`tests/discriminator-field-classifier-brace-group.test.ts` declares its own module-scope `messageTemplate(code)` function: it calls `registryMessage(REGISTRY, code)`, asserts the result is defined with a `"DIAG-4 anchor: <page> must carry the Message row for <code>"` message, and returns the template. `tests/helpers/load-row-harness.ts` already exports `registryMessageOf(registry, registryPath, code, fills)`, which performs the identical `registryMessage` call and the identical `toBeDefined()` assertion with the identical `"DIAG-4 anchor: ..."` message template — plus a `fills` mechanism that asserts each placeholder is present (`toContain`) before substituting it. The in-scope file's five downstream renderer functions (`nestedDiscriminatorLine`, `missingDiscriminatorLine`, `nonLiteralDiscriminatorLine`, `emptySchemaBodyLine`, `commaSeparatedFieldsLine`) each call `messageTemplate(code).replace(...)` directly, reproducing by hand the substitution step `registryMessageOf`'s `fills` parameter already performs, minus its placeholder-presence assertion.

## Evidence

`tests/discriminator-field-classifier-brace-group.test.ts:93-105`:
```ts
/**
 * The registry row's normative *Message* template for `code`. Definedness is
 * asserted here so a missing or renamed row reds by naming the registry page
 * rather than by a bare `undefined` comparison downstream.
 */
function messageTemplate(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/code-registry-parse.md must carry the Message row for ${code}`,
  ).toBeDefined();
  return template as string;
}
```

`tests/helpers/load-row-harness.ts:55-82` — the canonical helper, same control flow and same assertion message template, generalised over `registry`/`registryPath` and extended with a placeholder-presence-checked `fills` substitution loop:
```ts
/**
 * The registry row's normative *Message* template with its named placeholders
 * filled (DIAG-4). Definedness and placeholder presence are asserted first, so
 * a row whose *Message* moved reds by naming the registry page rather than by a
 * bare `undefined` comparison downstream.
 */
export function registryMessageOf(
  registry: readonly RegistryRow[],
  registryPath: string,
  code: string,
  fills: ReadonlyArray<readonly [string, string]> = [],
): string {
  const template = registryMessage(registry, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: ${registryPath} must carry the Message row for ${code}`,
  ).toBeDefined();
  let out = template as string;
  for (const [placeholder, value] of fills) {
    expect(
      out,
      `DIAG-4: the ${code} Message template must carry the ${placeholder} placeholder; template=${JSON.stringify(template)}`,
    ).toContain(placeholder);
    out = out.replace(placeholder, value);
  }
  return out;
}
```

The in-scope file's own downstream callers perform the substitution `registryMessageOf`'s `fills` loop already does, but without its placeholder-presence check, e.g. `tests/discriminator-field-classifier-brace-group.test.ts:118-125`:
```ts
function nestedDiscriminatorLine(field: string, schema: string): string {
  const code = "theta/parse/nested-discriminator";
  return line(
    code,
    messageTemplate(code).replace("<field>", field).replace("<X>", schema),
  );
}
```

Exact search: `grep -n "^function messageTemplate" tests/*.test.ts` → 1 hit (this file); `grep -n "registryMessageOf" tests/discriminator-field-classifier-brace-group.test.ts` → 0 hits, confirming the file does not import the canonical helper it duplicates the core of.

## Why this is a problem
`registryMessageOf` is a strict superset of `messageTemplate`: same `registryMessage` call, same defined-check, same assertion-message template, called with the file's own `REGISTRY` (already imported from `tests/helpers/registry-oracle.ts`, a structural superset of the narrower `RegistryRow` shape `registryMessageOf` declares) and `PARSE_REGISTRY_PATH`/the file's own page path. Every one of the file's five line-rendering functions could pass its own `[placeholder, value]` pairs through `registryMessageOf`'s `fills` parameter and gain the placeholder-presence assertion for free; instead each hand-rolls the same `.replace()` chain with no check that the placeholder it is substituting still exists in the template.

## Suggested direction (non-binding, optional)
Noting that `tests/helpers/load-row-harness.ts` already exports `registryMessageOf` with a `fills` parameter shaped exactly for the substitution the five downstream renderer functions perform by hand is an observation that the canonical helper's placeholder-presence check is unused here, not a design for wiring it in.

## False-positive check
- Gate-pin check: the file is not `*gate*.test.ts` or a named gate kin; the cited code is a diagnostic-message reader, not a pinned count or inventory.
- Recording-double check: `messageTemplate` reads a static registry row; it records no calls and backs no "never called" witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rn "messageTemplate\|registryMessageOf" docs/bugs/*.md` → 0 hits; no doc marks this reimplementation as a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "discriminator-field-classifier-brace-group" docs/reference/coverage-matrix.md` → 0 hits; docs/bugs/0096 cites this file by name and cell count only (per PTQ-0496's own false-positive check, reproduced here), not by the `messageTemplate` function; this finding proposes no merge, rename, or deletion of any `it()`/`describe()`, only that the reader function import the canonical helper.
- Coverage check: the claim is about a repeated helper-function DEFINITION; every cell that calls `messageTemplate` (via the five line-rendering functions) already exercises the local copy.
- Prior-finding check: `grep -rl "messageTemplate\|registryMessageOf" quality/issues/*.md quality/resolved/*.md quality/intake/*.md` → 0 hits. `quality/resolved/PTQ-0496-registry-oracle-bundle-redeclared-twice.md` (status: fixed) addressed this same file's local `RegistryRow`/`REGISTRY` construction (now imported from `tests/helpers/registry-oracle.ts`, confirmed by re-reading the file's current import block) but its evidence excerpts stop at the `REGISTRY` constant and do not cite `messageTemplate`, which remains a local reimplementation of the separate, still-uncited `registryMessageOf` helper.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts reproduce byte-for-byte at tests/discriminator-field-classifier-brace-group.test.ts:93-105 and tests/helpers/load-row-harness.ts:55-82 (same `registryMessage` call, same `toBeDefined` with the same `DIAG-4 anchor: <page> must carry the Message row for <code>` text, the file's hardcoded page string equal to `PARSE_REGISTRY_PATH`), `registryMessageOf|load-row-harness` → 0 hits in the file while 49 other tests import `registryMessageOf`, registry-oracle `RegistryRow` is a structural superset of the harness's `{code,message}` so `registryMessageOf(REGISTRY, PARSE_REGISTRY_PATH, code, fills)` type-checks, and a node run of `registryMessage` over code-registry-parse.md confirms every placeholder the five renderers (:122/:133/:146/:158/:174) substitute — `<field>`, `<X>`, `<construct>` — is present, so the `fills` migration is a green drop-in; the helper (2594cd44 2026-09-11) postdates the file (f505fc4a 2026-08-04); tests/-only D7 copy-paste-helper class, not a gate, not a recording double, docs/bugs and coverage-matrix greps → 0; not a duplicate — fixed PTQ-0496 covered only this file's REGISTRY bundle and fixed PTQ-0497 explicitly scoped `messageTemplate` OUT ("not part of this observation"). Two accounting corrections for acceptance: the stated `^function messageTemplate` search returns 3 hits, not 1 — tests/empty-object-discriminator-field-withhold.test.ts:85-92 and tests/non-literal-by-field-refusal.test.ts:124-131 carry byte-identical bodies untracked by any issue (same-wave d7-09 intake covers non-literal's REGISTRY read only), so sites should read 3 and the fixer should sweep all three; and the local `line()` at :108-110 mirrors `registryLineOf` (:85-92) and is absorbed by the same import swap (triage: claude-fable-5-1)
