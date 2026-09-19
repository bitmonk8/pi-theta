---
id: PTQ-1089
title: params-inline-object-lowering.test.ts declares three separate registry-message readers that each reimplement the canonical registryMessageOf/registryLineOf exports
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/params-inline-object-lowering.test.ts:147-159
  - tests/params-inline-object-lowering.test.ts:171-187
  - tests/params-inline-object-lowering.test.ts:198-221
  - tests/helpers/load-row-harness.ts:60-91
sites: 3
fix_scope: localized
wave: qw20260918220713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# params-inline-object-lowering.test.ts declares three separate registry-message readers that each reimplement the canonical registryMessageOf/registryLineOf exports

## Observation
`tests/params-inline-object-lowering.test.ts` declares three module-scope
function pairs — `unresolvedMessage`/`unresolvedLine` (:147-159),
`emptySchemaBodyMessage`/`emptySchemaBodyLine` (:171-187), and
`malformedYamlMessage`/`malformedYamlLine` (:198-221) — each performing the
identical sequence: read a registry row's *Message* template via
`registryMessage(REGISTRY, CODE)`, assert its definedness with an
`expect(template, "DIAG-4 anchor: … must carry the Message row for
${CODE}").toBeDefined()` call, fill one or more named placeholders with
`.replace(...)`, then a sibling `*Line` wrapper that prefixes `error ${CODE}:
`. `tests/helpers/load-row-harness.ts` already exports `registryMessageOf`
(a parameterised version of the identical read-assert-fill sequence) and
`registryLineOf` (the identical `error ${code}: ` wrapper) for exactly this
need.

## Evidence

`tests/params-inline-object-lowering.test.ts:147-159` (re-read immediately
before filing):
```ts
function unresolvedMessage(name: string): string {
  const template = registryMessage(REGISTRY, CODE) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/code-registry-parse.md must carry the Message row for ${CODE}`,
  ).toBeDefined();
  return (template as string).replace("<name>", name);
}

/** The one rendered diagnostic line fixtures A / D / F / G / H must all produce. */
function unresolvedLine(name: string): string {
  return `error ${CODE}: ${unresolvedMessage(name)}`;
}
```

`tests/params-inline-object-lowering.test.ts:171-187` — the second copy,
same skeleton, one extra `toContain` placeholder-presence check before the
fill:
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

/** The one rendered line an empty inline object type produces (bug 0045 §Fix). */
function emptySchemaBodyLine(subject: string): string {
  return `error ${EMPTY_SCHEMA_BODY}: ${emptySchemaBodyMessage(subject)}`;
}
```

`tests/params-inline-object-lowering.test.ts:198-221` — the third copy, same
skeleton with four placeholders filled in sequence:
```ts
function malformedYamlMessage(
  loc: { line: number; column: number },
  text: string,
  scope: string,
): string {
  const template = registryMessage(REGISTRY, MALFORMED_YAML) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/code-registry-load.md must carry the Message row for ${MALFORMED_YAML}`,
  ).toBeDefined();
  return (template as string)
    .replace("<line>", String(loc.line))
    .replace("<column>", String(loc.column))
    .replace("<text>", text)
    .replace("<scope>", scope);
}

/** The one rendered line a frontmatter block the YAML parser rejects produces (bug 0263 §Fix). */
function malformedYamlLine(
  loc: { line: number; column: number },
  text: string,
  scope: string,
): string {
  return `error ${MALFORMED_YAML}: ${malformedYamlMessage(loc, text, scope)}`;
}
```

`tests/helpers/load-row-harness.ts:60-91` — the canonical exports performing
the same read-assert-fill-render sequence, generalised over an arbitrary
`registryPath`, `code` and ordered `fills` list:
```ts
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

export function registryLineOf(
  registry: readonly RegistryRow[],
  registryPath: string,
  code: string,
  fills: ReadonlyArray<readonly [string, string]> = [],
): string {
  return `error ${code}: ${registryMessageOf(registry, registryPath, code, fills)}`;
}
```
Calling `registryMessageOf(REGISTRY, "docs/spec_topics/diagnostics/code-registry-parse.md", CODE, [["<name>", name]])`
produces the same string `unresolvedMessage(name)` returns; the two-placeholder
`emptySchemaBodyMessage` call collapses to a single `fills: [["<X>", subject]]`
entry (the canonical export's own `toContain` check reproduces the explicit
second `expect` the local copy adds); the four-placeholder
`malformedYamlMessage` call collapses to `fills: [["<line>", …], ["<column>",
…], ["<text>", …], ["<scope>", …]]`.

## Why this is a problem
All three pairs are pure harness plumbing — turning a registry-row lookup
into a loud, named failure and filling one or more placeholders — not domain
logic specific to bug 0035/0045/0263's subjects, and all three retype the
identical `registryMessage` read, the identical "DIAG-4 anchor … must carry
the Message row for …" assertion wording, and the identical placeholder-fill
loop that `tests/helpers/load-row-harness.ts` already exports as one
parameterised pair. A future change to the assertion wording, the
`toBeDefined()`/`toContain()` shape, or the fill order needs three
hand-synchronised edits inside this one file instead of one shared change.

## Suggested direction (non-binding, optional)
Calling the existing `registryMessageOf`/`registryLineOf` exports with the
appropriate registry page path and an ordered `fills` list in place of each
local pair's body would remove all three read-assert-fill copies while
keeping each site's own code constant and call sites unchanged.

## False-positive check
- Gate-pin check: the file does not match `*gate*.test.ts` or the named gate
  kin; the cited lines are registry-message readers, not a pinned count or
  inventory.
- Recording-double check: none of the three readers records a call for a
  "never called" witness; each performs a synchronous registry lookup and
  string fill, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rln "unresolvedMessage\|emptySchemaBodyMessage\|malformedYamlMessage" docs/bugs/*.md` → 0 hits; no documented correct-reason red cites any of the three functions by name.
- coverage-matrix/bug-doc citation search: `grep -n "params-inline-object-lowering" docs/reference/coverage-matrix.md` → 0 hits. Bug docs 0035/0045/0263 cite this file only as a whole-file witness (fixture group and cell letters), never by the internal reader function names; this finding proposes no merge, rename, or deletion of any `it()`/`describe()`, only that the three read-assert-fill bodies could call the existing exports.
- Coverage check: the claim is about three repeated function DEFINITIONS with an already-exported canonical counterpart, not a missing test path; all three are exercised by every `*Line(...)`/`*Message(...)` call in the file's own groups (a), (d), and (e7).
- Prior-filing overlap check: `grep -rl "params-inline-object-lowering" quality/issues/*.md quality/intake/*.md quality/resolved/*.md` returns PTQ-0793/PTQ-0794 (canonical-slug-oracle/key-sort duplication, a disjoint helper), PTQ-0824 (the `ajv()` double reimplementing `capturingAjv`, a disjoint function), PTQ-0865 (a different file's `fullOf`), and several resolved PTQs for the four-page `REGISTRY` read, `fieldOf`, the triage fixture pair, `diagLines`/`diagCodes`, and the canonical-slug-oracle quadruplet — none of these names `unresolvedMessage`, `emptySchemaBodyMessage`, or `malformedYamlMessage`. The wider `registryMessageOf`-signature family (PTQ-0832/PTQ-0880/PTQ-0861/PTQ-0951/PTQ-1001, several already ratified to scope narrowly per-file) tracks functions literally named `registryMessageOf`; this file's three readers use distinct names (`unresolvedMessage`, `emptySchemaBodyMessage`, `malformedYamlMessage`) and are not cited in any of those location lists.

## Triage
<!-- pending -->
verdict: confirmed — independently re-verified: all four excerpts reproduce verbatim at tests/params-inline-object-lowering.test.ts:147-159, :171-187, :198-221 and tests/helpers/load-row-harness.ts:60-91; each local pair is the same registryMessage→`DIAG-4 anchor: <page> must carry the Message row for <code>`→`.replace` sequence plus the `error ${code}: ` wrapper that `registryMessageOf`/`registryLineOf` export, and the file imports nothing from load-row-harness; the fold is mechanical and strictly stronger — registry-oracle's 6-field `RegistryRow` is a structural superset of the harness's `{code,message}` so `REGISTRY` passes through, and the live registry Messages carry every filled placeholder (`unresolved named type '<name>'`, `'<X>' has no fields…`, `…line <line>, column <column> near '<text>'<scope>`) so the harness's per-fill `toContain` holds; all three readers live (7 call sites outside the definitions), file green 37/37; all locations under tests/, D7 boilerplate-duplication class, not a gate file, no recording-double or documented-red carve-out; stated searches reproduce (docs/bugs identifier grep → 0, coverage-matrix → 0); dedupe clean — this repo rules the `unresolvedMessage` family per file (PTQ-1001 = inline-object-nested-lowering, PTQ-0832 = inline-slug-name-reservation, PTQ-0734 = three other files), resolved PTQ-0412 migrated only this file's four-page `REGISTRY` join and explicitly left `unresolvedMessage`/`unresolvedLine` in place, and the other PTQs naming this file (0793/0794/0824/0865, resolved 0212/0410/0425/0652/0653/0662/0663/0665/0674/0931) cite disjoint helpers; same-wave d7-01 only mentions the names in passing (triage: claude-fable-5-1)
