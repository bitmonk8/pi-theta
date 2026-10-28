---
id: PTQ-1755
title: schema-alias-rhs-malformed.test.ts repeats the registryMessageOf lookup-and-fill harness.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/schema-alias-rhs-malformed.test.ts:190-215
  - tests/helpers/load-row-harness.ts:64-80
  - tests/helpers/load-row-harness.ts:87-104
  - tests/helpers/registry-oracle.ts:3-10
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# schema-alias-rhs-malformed.test.ts repeats the registryMessageOf lookup-and-fill harness.

## Observation
`tests/schema-alias-rhs-malformed.test.ts` defines a local `msg(code, fills)` that reads a registry Message template, checks its presence, checks each supplied placeholder, replaces each placeholder once, and returns the result. The canonical `registryMessageOf` in `tests/helpers/load-row-harness.ts` already implements that sequence with registry and registry-path parameters. These are two implementations of the harness sequence: one canonical helper and one in-scope duplicate. They are not byte-identical today: the local initial check is `toBeDefined()`, while the canonical check is `toBeTypeOf("string")`, and the canonical helper also exposes optional checks and replace-all substitution.

## Evidence
**In-scope duplicate — `tests/schema-alias-rhs-malformed.test.ts:190-202`:**

```ts
function msg(code: string, fills: ReadonlyArray<readonly [string, string]>): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/code-registry-parse.md must carry the Message row for ${code}`,
  ).toBeDefined();
  let out = template as string;
  for (const [placeholder, value] of fills) {
    expect(
      out,
      `DIAG-4: the ${code} Message template must carry the ${placeholder} placeholder; template=${JSON.stringify(template)}`,
    ).toContain(placeholder);
    out = out.replace(placeholder, value);
```

**Return and the declaration-specific callers — `tests/schema-alias-rhs-malformed.test.ts:203-215`:**

```ts
  }
  return out;
}

/** The malformed-RHS message for one declaration name (`<X>` is the schema name). */
function malformedMessage(declName: string): string {
  return msg(CODE, [["<X>", declName]]);
}

/** The bug 0061 refusal's message for one declaration name (`<X>` is the schema name). */
function refusalMessage(declName: string): string {
  return msg(REFUSAL, [["<X>", declName]]);
}
```

**Canonical helper signature — `tests/helpers/load-row-harness.ts:64-75`:**

```ts
export function registryMessageOf(
  registry: readonly RegistryRow[],
  registryPath: string,
  code: string,
  fills: ReadonlyArray<readonly [string, string]> = [],
  options: {
    /** Require a non-empty template before substituting placeholders. */
    readonly requireNonEmpty?: boolean;
    readonly replaceAll?: boolean;
    readonly unfilledPattern?: RegExp;
  } = {},
): string {
```

**Canonical lookup and template assertion — `tests/helpers/load-row-harness.ts:76-80`:**

```ts
  const template = registryMessage(registry, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: ${registryPath} must carry the Message row for ${code}`,
  ).toBeTypeOf("string");
```

**Canonical placeholder loop — `tests/helpers/load-row-harness.ts:87-96`:**

```ts
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
```

**Canonical return — `tests/helpers/load-row-harness.ts:103-104`:**

```ts
  return out;
}
```

**Current shared-helper scope — `tests/helpers/registry-oracle.ts:3-10`:**

```ts
// WHY THIS FILE EXISTS. `RegistryRow` and the `REGISTRY` load it backs — read
// the four sharded registry pages (code-registry-{parse,load,runtime,host}.md),
// parse each through the real `parseRegistry`, and join the rows into one
// array — were redeclared byte-for-byte (confirmed via `diff`) in several test
// files. This module centralises that read, placeholder interpolation,
// pointer-message composition and the identical live-cell fragment assertions.
// Readers whose assertion style and wording vary per file stay local, using
// the shared registry read.
```

The counted inventory is limited to these two definitions. Exact searches `rg -n '^function msg\(' tests/schema-alias-rhs-malformed.test.ts` and `rg -n '^export function registryMessageOf\(' tests/helpers/load-row-harness.ts` each return one hit, at lines 190 and 64 respectively. `sites: 1` counts the in-scope duplicate, not the canonical implementation.

## Why this is a problem
This is D7 **boilerplate duplication** in the diagnostic-expectation harness, not a request for another behavioral witness. The repeated sequence includes the same placeholder-presence assertion wording and the same ordered single-replacement operation; the declaration-specific information is passed through `code` and `fills`. The current initial-template assertions already differ between the two implementations, so this is a separately maintained copy rather than use of the existing shared sequence. The natural shared home is the existing `tests/helpers/load-row-harness.ts` helper, while `malformedMessage` and `refusalMessage` carry this file's declaration-specific inputs.

## False-positive check
- **Gate-pin check:** the scoped file is not a gate/census test, and the cited code performs message lookup and substitution rather than asserting a pinned corpus inventory. No pinned count is challenged.
- **Recording-double check:** neither implementation records calls or serves as a MUST-NOT witness; both render expected diagnostic strings.
- **docs/bugs/ signature search:** inspected `docs/bugs/0042-schema-decl-same-line-residue-silent.md`, whose status is fixed (0.52.0). `rg -n 'registryMessageOf|function msg\(' docs/bugs/0042-schema-decl-same-line-residue-silent.md` returns zero hits. The claim is not about a red or disabled test and does not challenge the diagnostic disposition documented there.
- **Coverage-matrix/bug-doc citation search:** `rg -n 'schema-alias-rhs-malformed|malformedMessage|refusalMessage' docs/reference/coverage-matrix.md docs/plan_topics/coverage-matrix.md` returns zero hits. Searching `docs/bugs/` for the file name finds citations in bugs 0061, 0062, 0063, 0124, 0132, 0133, 0149, 0285, 0421, 0510 and 0517. No merge, rename or deletion of a cited test is proposed; this finding concerns the rendering utility only.
- **Deliberate-local-reader check:** the current `registry-oracle.ts` header quoted above retains local readers whose assertion style and wording vary. Here the placeholder-check wording and substitution sequence repeat the canonical helper; the initial-template guard difference and optional canonical features are disclosed rather than described as byte identity.
- **History and overlap check:** `git log -S 'function msg(' --oneline -- tests/schema-alias-rhs-malformed.test.ts` identifies introduction in `9c961f7f`; `git log -S 'export function registryMessageOf(' --oneline -- tests/helpers/load-row-harness.ts` identifies the shared helper in `2594cd44`. Resolved PTQ-0505 covers this file's former four-page registry read, not its message renderer. Resolved PTQ-0834 covers the renderer in `tests/schema-alias-union-decl.test.ts`, a different file. PTQ-1472 covers declaration/arm lookup accessors. None is the local `msg` sequence cited here.
- **Coverage boundary:** the finding inventories existing harness code and its existing callers. It makes no claim about missing tests, suite composition, runtime behavior, or test-runtime performance.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — Excerpts and stated searches reproduce: the live local msg duplicates registryMessageOf's lookup, template guard, identical placeholder assertion and ordered single replacement; the disclosed guard difference and optional features do not supply a distinct local need. This is D7 boilerplate duplication entirely under tests/, with no applicable carve-out or existing renderer filing for this file. PTQ-0505 migrated only the registry read without prescribing a new renderer shape; PTQ-0834 concerns the sibling file and PTQ-1472 the declaration accessors. (triage: claude-opus-5-5)
