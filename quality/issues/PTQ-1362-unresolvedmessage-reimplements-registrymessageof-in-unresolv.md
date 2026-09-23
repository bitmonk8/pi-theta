---
id: PTQ-1362
title: unresolved-annotation-lowering.test.ts's unresolvedMessage reimplements the canonical registryMessageOf reader
lens: D7
status: open
verdict: confirmed
locations:
  - tests/unresolved-annotation-lowering.test.ts:142-149
  - tests/helpers/load-row-harness.ts:62-100
sites: 1
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# unresolved-annotation-lowering.test.ts's unresolvedMessage reimplements the canonical registryMessageOf reader

## Observation
`tests/unresolved-annotation-lowering.test.ts` declares a module-level
`unresolvedMessage(name: string): string` that reads the
`theta/parse/unresolved-named-type` row's *Message* template via
`registryMessage(REGISTRY, CODE)`, asserts its definedness with a
"DIAG-4 anchor: … must carry the Message row for …" string, then fills the
single `<name>` placeholder with `.replace`. `tests/helpers/load-row-harness.ts`
already exports `registryMessageOf(registry, registryPath, code, fills)`,
which performs the identical registry-read → defined-assertion (same "DIAG-4
anchor" wording) → placeholder-fill sequence, generalised over an arbitrary
placeholder/fills list rather than the one hard-coded `<name>` slot. The file
does not import `load-row-harness.ts`.

## Evidence
`tests/unresolved-annotation-lowering.test.ts:142-149` (re-read immediately
before filing):
```ts
function unresolvedMessage(name: string): string {
  const template = registryMessage(REGISTRY, CODE) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/code-registry-parse.md must carry the ` +
      `Message row for ${CODE}`,
  ).toBeDefined();
  return template!.replace("<name>", name);
}
```

`tests/helpers/load-row-harness.ts:62-89` (re-read immediately before
filing) — the canonical export performing the same sequence, parameterised:
```ts
export function registryMessageOf(
  registry: readonly RegistryRow[],
  registryPath: string,
  code: string,
  fills: ReadonlyArray<readonly [string, string]> = [],
  options: { ... } = {},
): string {
  const template = registryMessage(registry, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: ${registryPath} must carry the Message row for ${code}`,
  ).toBeTypeOf("string");
  ...
  let out = template as string;
  for (const [placeholder, value] of fills) {
    expect(
      out,
      `DIAG-4: the ${code} Message template must carry the ${placeholder} placeholder; template=${JSON.stringify(template)}`,
    ).toContain(placeholder);
    out = options.replaceAll ? out.replaceAll(placeholder, value) : out.replace(placeholder, value);
  }
  return out;
}
```
Calling `registryMessageOf(REGISTRY, "docs/spec_topics/diagnostics/code-registry-parse.md", CODE, [["<name>", name]])`
produces the same string `unresolvedMessage(name)` returns today: the same
registry read, the same "DIAG-4 anchor … Message row for …" wording, the same
placeholder substitution.

Exact search: `grep -n "function unresolvedMessage" tests/unresolved-annotation-lowering.test.ts` returns exactly one declaration; `grep -n "load-row-harness" tests/unresolved-annotation-lowering.test.ts` returns 0 hits.

## Why this is a problem
The function is harness plumbing — turning a registry-row lookup into a loud,
named failure and filling one placeholder — not domain logic specific to bug
0028's subject. An identical read-assert-fill sequence, generalised to an
arbitrary placeholder/fills list, is already exported from
`tests/helpers/load-row-harness.ts` for exactly this use, so a future change
to the assertion's wording or the placeholder-fill order needs a matching
hand-edit here that the export would otherwise enforce once.

## Suggested direction (non-binding, optional)
Calling the existing `registryMessageOf` export with the
`code-registry-parse.md` path and a one-entry fills list in place of the
local `unresolvedMessage` body would remove the local read-assert-fill copy.

## False-positive check
- Gate-pin check: the file does not match `*gate*.test.ts` or the named gate
  kin; the cited lines are a registry-message reader, not a pinned count or
  inventory.
- Recording-double check: `unresolvedMessage` performs a synchronous registry
  lookup and string fill; it records no calls and backs no "never called"
  witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -n "unresolvedMessage\|registryMessageOf" docs/bugs/0028-unresolved-annotation-silent-permissive-lowering.md` returns 0 hits stating a rationale for a local copy.
- coverage-matrix/bug-doc citation search: `grep -n "unresolved-annotation-lowering" docs/reference/coverage-matrix.md` returns 0 hits. The bug doc cites this file by name and by cell id, never by `unresolvedMessage`'s internal implementation; this finding proposes no change to any `it()`/`describe()` name, count, or assertion — only to where the read-assert-fill sequence is defined.
- Coverage check: the claim is about a repeated function DEFINITION with an already-exported canonical counterpart, not a missing test path; the local copy is exercised by every call site in the file.
- Prior-filing overlap check: `grep -rl "unresolved-annotation-lowering.test.ts" quality/resolved quality/intake quality/issues` returns PTQ-0574 (schemaDeclsOf/loadsCleanly harness, a different function), PTQ-0734 (a different registry re-read), PTQ-0736 (off-session scripted complete harness), and PTQ-1079 (ajv builder) — none name `unresolvedMessage`. `grep -rln "function unresolvedMessage" tests/*.ts` finds 10 files sharing this exact function name (each reading a different code and hard-coded placeholder), of which this repo's established convention files each independently (PTQ-1001, PTQ-0832, and others each cover one file's copy); this finding is scoped to this one file's copy only.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — excerpt reproduces verbatim at tests/unresolved-annotation-lowering.test.ts:142-149 with two live callers (195, 980) and zero `load-row-harness` imports; tests/helpers/load-row-harness.ts:62-100 `registryMessageOf` performs the identical registryMessage read → "DIAG-4 anchor: <path> must carry the Message row for <code>" assertion → `.replace` placeholder fill, so `registryMessageOf(REGISTRY, "docs/spec_topics/diagnostics/code-registry-parse.md", CODE, [["<name>", name]])` is a drop-in; D7 boilerplate-duplication class, not a gate/recording-double/coverage-matrix carve-out; not a duplicate — PTQ-1001 and PTQ-0832 cover the same pattern in inline-object-nested-lowering and inline-slug-name-reservation respectively, and PTQ-0734 (line 165) explicitly left "each file's own unresolvedMessage" in place (triage: claude-fable-5-1)
