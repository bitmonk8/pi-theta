---
id: PTQ-1404
title: Both in-scope files redeclare a local registry-message-template renderer instead of the canonical registryMessageOf/registryLineOf
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/params-block-mapping-rhs-refusal.test.ts:180-215
  - tests/params-brace-union-rhs-lowering.test.ts:187-220
  - tests/helpers/load-row-harness.ts:61-136
sites: 2
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# Both in-scope files redeclare a local registry-message-template renderer instead of the canonical registryMessageOf/registryLineOf

## Observation
`tests/helpers/load-row-harness.ts` exports `registryMessageOf` (lines 61-98)
and `registryLineOf` (lines 129-136): given a registry array, a registry page
path, a code, and a list of `[placeholder, value]` fills, it fetches the
template, asserts it is defined (naming the registry page), asserts each
placeholder is present, substitutes it, and — for `registryLineOf` — prefixes
`error <code>: `. Both files in this review's scope independently declare a
narrower local function that performs the same fetch-assert-substitute
sequence over one code and one placeholder at a time:
`templateMessage`/`refusalMessage`/`unresolvedMessage`/`malformedYamlMessage`
in `params-block-mapping-rhs-refusal.test.ts` (lines 180-215), and
`registryLine`/`unresolvedLine`/`emptySchemaBodyLine`/`paramsNotExpressionLine`/
`schemaNotExpressionLine` in `params-brace-union-rhs-lowering.test.ts`
(lines 187-220).

## Evidence

tests/helpers/load-row-harness.ts:61-98
```ts
export function registryMessageOf(
  registry: readonly RegistryRow[],
  registryPath: string,
  code: string,
  fills: ReadonlyArray<readonly [string, string]> = [],
  options: {
    readonly requireNonEmpty?: boolean;
    readonly replaceAll?: boolean;
    readonly unfilledPattern?: RegExp;
  } = {},
): string {
  const template = registryMessage(registry, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: ${registryPath} must carry the Message row for ${code}`,
  ).toBeTypeOf("string");
  if (options.requireNonEmpty) {
    expect(
      typeof template === "string" && template.length > 0,
      `DIAG-4: the ${code} Message column must be a non-empty string; got ${JSON.stringify(template)}`,
    ).toBe(true);
  }
  let out = template as string;
  for (const [placeholder, value] of fills) {
    expect(
      out,
      `DIAG-4: the ${code} Message template must carry the ${placeholder} placeholder; template=${JSON.stringify(template)}`,
    ).toContain(placeholder);
    out = options.replaceAll
      ? out.replaceAll(placeholder, value)
      : out.replace(placeholder, value);
  }
  ...
  return out;
}
```

tests/params-block-mapping-rhs-refusal.test.ts:180-192
```ts
function templateMessage(code: string, placeholder: string, value: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: the diagnostics code registry must carry the Message row for ${code}`,
  ).toBeDefined();
  return (template as string).replace(placeholder, value);
}

/** The new refusal's message for one field (`<param>` is category-5, unquoted). */
function refusalMessage(param: string): string {
  return templateMessage(CODE, "<param>", param);
}
```

tests/params-brace-union-rhs-lowering.test.ts:187-199
```ts
function registryLine(code: string, placeholder: string, value: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/ must carry the Message row for ${code}`,
  ).toBeDefined();
  expect(
    template,
    `DIAG-4: the ${code} Message template must carry the ${placeholder} placeholder; template=${JSON.stringify(template)}`,
  ).toContain(placeholder);
  return `error ${code}: ${(template as string).replace(placeholder, value)}`;
}
```

## Why this is a problem
Both files re-derive the same fetch-template / assert-defined /
assert-placeholder-present / substitute sequence that `registryMessageOf`
already generalises in `tests/helpers/load-row-harness.ts:61-98`, itself built
specifically (per that module's own header comment) because "several `b02xx`
files independently redeclared … the same registry-message renderer." Neither
in-scope file imports it; each declares a same-shape local instead, one
omitting the placeholder-presence check the canonical helper performs
(`params-block-mapping-rhs-refusal.test.ts`'s `templateMessage`), the other
reproducing it (`params-brace-union-rhs-lowering.test.ts`'s `registryLine`).

## Suggested direction (non-binding, optional)
The natural home for a per-code, per-placeholder message renderer is the
already-exported `registryMessageOf`/`registryLineOf` pair in
`tests/helpers/load-row-harness.ts`, which both files could call with a
single-element `fills` array in place of their local wrapper.

## False-positive check
- Recording-double check: not applicable — these are pure template-lookup
  functions, not doubles.
- Gate-pin check: not applicable — neither file matches `*gate*.test.ts` or
  named gate kin.
- docs/bugs/ signature search: both files document bugs 0041 and 0097
  respectively; the duplicated helper shape is unrelated to either bug's
  pinned red/green disposition.
- coverage-matrix/bug-doc citation search: this finding proposes no merge,
  rename, or deletion of any test — only that both local renderers could
  compose over the existing canonical helper; no citation search was needed
  to support that observation.
- Coverage: not claimed; both files exercise the registry read and message
  rendering as real observables throughout.

## Triage
verdict: confirmed — independently re-verified: all three excerpts reproduce verbatim (tests/params-block-mapping-rhs-refusal.test.ts:180-215 `templateMessage`/`refusalMessage`/`unresolvedMessage`/`malformedYamlMessage`, tests/params-brace-union-rhs-lowering.test.ts:187-220 `registryLine` + four one-placeholder wrappers, tests/helpers/load-row-harness.ts:61-136 `registryMessageOf`/`registryLineOf`); `grep -c "load-row-harness\|registryMessageOf\|registryLineOf"` → 0 in both files while `registryMessage(REGISTRY` counts 3 and 1; the canonical pair covers every local need (fetch, assert-defined naming the page, per-placeholder presence check, sequential single `replace` — `malformedYamlMessage`'s four placeholders map to a four-element `fills`, `registryLine`'s `error <code>: ` prefix is exactly `registryLineOf`) and every local caller (379 via a test-called helper, 627, 713; 717-1302) runs inside test bodies so the `expect`-based canonical is safe; docs/bugs/0041, 0097 and docs/reference/coverage-matrix.md give no rationale for a file-local renderer (grep → 0); D7 boilerplate-duplication class, no gate/recording-double/documented-red carve-out applies; not a duplicate — same-wave sibling d7-01 cites union-generic-arm/unresolvable-operand, PTQ-0651 covered this file's REGISTRY four-page read not the renderer, and PTQ-0840/0939/0832/1001/1089/0808/0819/0859 confirm the same family per-file against other files (triage: claude-fable-5-1)
