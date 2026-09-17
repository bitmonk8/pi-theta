---
id: PTQ-0539
title: b0429 and b0430 each re-declare the registry Message-template reader a canonical tests/helpers/ version already provides
lens: D7
status: open
verdict: confirmed
locations:
  - tests/b0429-imported-schema-ctor-field-set.test.ts:70-104
  - tests/b0430-imported-enum-unknown-variant.test.ts:80-114
  - tests/helpers/load-row-harness.ts:35-77
sites: 2
fix_scope: module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0429 and b0430 each re-declare the registry Message-template reader a canonical tests/helpers/ version already provides

## Observation
tests/b0429-imported-schema-ctor-field-set.test.ts and tests/b0430-imported-enum-unknown-variant.test.ts each locally declare a `RegistryRow` interface, a `REGISTRY_PAGE` constant pointing at `docs/spec_topics/diagnostics/code-registry-parse.md`, a `REGISTRY` array built by `readFileSync` + `parseRegistry`, and a `msg(code, ...placeholders)` function that looks up the row, asserts its *Message* template is defined, asserts each named placeholder is present, and substitutes the supplied values. This four-piece block is identical in every file except which two placeholder names it substitutes (`<field>`/`<schema>` vs `<variant>`/`<enum>`). `tests/helpers/load-row-harness.ts` already exports the same `RegistryRow` shape, the same `PARSE_REGISTRY_PATH`/`PARSE_REGISTRY` pair read from the identical page, and a generalised `registryMessageOf(registry, registryPath, code, fills)` that performs the identical lookup-assert-substitute sequence over a caller-supplied list of `[placeholder, value]` pairs.

## Evidence

tests/b0429-imported-schema-ctor-field-set.test.ts:70-104:
```ts
interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

const REGISTRY_PAGE = "docs/spec_topics/diagnostics/code-registry-parse.md";

const REGISTRY = parseRegistry(
  readFileSync(fileURLToPath(new URL(`../${REGISTRY_PAGE}`, import.meta.url)), "utf8"),
) as RegistryRow[];

function msg(code: string, field: string, schema: string): string {
  const found = REGISTRY.find((r) => r.code === code);
  expect(
    found,
    `PRECONDITION (DIAG-2): ${REGISTRY_PAGE} must carry the registered row for ${code}`,
  ).toBeDefined();
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `PRECONDITION (DIAG-4): ${REGISTRY_PAGE} carries no *Message* value for ${code}`,
  ).toBeDefined();
  let out = template as string;
  for (const [placeholder, value] of [
    ["<field>", field],
    ["<schema>", schema],
  ] as const) {
    expect(
      out,
      `PRECONDITION (DIAG-4): the ${code} *Message* template must carry ${placeholder}; template=${JSON.stringify(template)}`,
    ).toContain(placeholder);
    out = out.replace(placeholder, value);
  }
  return out;
}
```

tests/b0430-imported-enum-unknown-variant.test.ts:80-114 is the same interface, constant, registry read, and function — same `expect` message text and same precondition-label scheme (`DIAG-2`, `DIAG-4`), only the placeholder pair and the two `msg` parameter names change (`variant`/`enumName` in place of `field`/`schema`).

tests/helpers/load-row-harness.ts:35-77 (the canonical generalisation, already covering both):
```ts
export interface RegistryRow {
  readonly code: string;
  readonly message: string;
}
...
export const PARSE_REGISTRY_PATH = "docs/spec_topics/diagnostics/code-registry-parse.md";

export const PARSE_REGISTRY: readonly ParseCodeRegistryRow[] = parseRegistry(
  readFileSync(
    fileURLToPath(new URL(`../../${PARSE_REGISTRY_PATH}`, import.meta.url)),
    "utf8",
  ),
) as ParseCodeRegistryRow[];

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
`registryMessageOf`'s `fills` parameter is exactly the `[placeholder, value]` pair list both b0429's and b0430's `msg` hard-code inline, so both files' `code, field, schema` / `code, variant, enumName` call shapes are call-site specialisations `registryMessageOf(REGISTRY, REGISTRY_PAGE, code, [["<field>","junk"], ["<schema>","Author"]])` would already express without a locally declared `msg`.

## Why this is a problem
The registry-Message-template read-assert-substitute sequence is declared twice, near byte-for-byte, inside the two files this review covers, and a generalised version of the same sequence (`registryMessageOf`, `PARSE_REGISTRY`, `PARSE_REGISTRY_PATH`, `RegistryRow`) already lives in `tests/helpers/load-row-harness.ts`, reading the identical `docs/spec_topics/diagnostics/code-registry-parse.md` page and performing the identical `toBeDefined`/`toContain`/`replace` steps under the same `DIAG-2`/`DIAG-4` precondition labels.

## Suggested direction (non-binding, optional)
`tests/helpers/load-row-harness.ts`'s `registryMessageOf`/`PARSE_REGISTRY`/`PARSE_REGISTRY_PATH` exports are the natural home; each file's `msg` wrapper is a thin, bug-specific `(field, schema)` / `(variant, enumName)` argument-naming convenience over that call.

## False-positive check
Gate-pin check: neither file matches `*gate*.test.ts` or the named gate-kin patterns — not applicable. Recording-double check: no recording double is involved in this block — a static registry-page reader, not a call-recording fake — the negative-witness carve-out does not apply. docs/bugs/ signature search: `docs/bugs/0429-imported-schema-ctor-field-set-never-judged.md` and `docs/bugs/0430-imported-enum-unknown-variant-panics-null-member.md` were read; neither documents a reason the two files' registry readers must diverge or stay file-local, and both cite `tests/helpers/e2e-s1.ts`-shaped conventions as their harness lineage, not a bespoke registry reader. coverage-matrix/bug-doc citation search: `grep -rn "b0429-imported-schema-ctor-field-set\|b0430-imported-enum-unknown-variant" docs/` returns only the two bug docs' own self-references, not `docs/reference/coverage-matrix.md` or any other bug doc's witness list. This finding does not propose a coverage change — it only observes that the registry-reading code inside the two files' current bodies is repeated and a shared version already exists.

## Triage
verdict: confirmed — re-verified independently: both excerpts reproduce exactly at the cited lines (b0429:70-104 and b0430:80-114 are byte-identical bar the `<field>`/`<schema>` vs `<variant>`/`<enum>` pair and parameter names; load-row-harness.ts:35-77 exports RegistryRow/PARSE_REGISTRY_PATH/PARSE_REGISTRY/registryMessageOf reading the same page), neither file imports `./helpers/load-row-harness` (6 test files do; registryMessageOf has 27 references in tests/), the local DIAG-2 `found` pre-check is subsumed by the DIAG-4 template check since `registryMessage` is the same `find(...)?.message` (tools/code-registry/index.js:88-90) so the shared helper is pass/fail-equivalent, all three looked-up codes carry placeholder-bearing *Message* templates on code-registry-parse.md:50/51/115, no carve-out applies (not a gate file, no recording double, docs/ grep re-run shows only the two bug docs' own witness lines at 0429:222/0430:243 and 0 coverage-matrix hits, and no test is merged/renamed/deleted), both files landed together in fae6d6a4 so the drift is same-commit copy-paste, and no tracked PTQ cites either file (grep of quality/ finds only same-wave intake siblings; the d7-01 fn-arg-single-page candidate counts these two among a 22-file pattern but does not cite them as locations) — same D7 boilerplate/copy-paste-fixture class as confirmed PTQ-0206/0207/0219/0228/0409 against the same helper (triage: claude-fable-5-1)
