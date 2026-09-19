---
id: PTQ-0840
title: templateMessage in both in-scope tools-field files reimplements the already-imported registryMessageOf/loadRowMessage helper
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/tools-field-shape-refusal.test.ts:195-201
  - tests/tools-field-zero-entry-scalar-refusal.test.ts:157-163
  - tests/helpers/load-row-harness.ts:62-80
  - tests/helpers/registry-oracle.ts:41-44
sites: 2
fix_scope: localized
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# templateMessage in both in-scope tools-field files reimplements the already-imported registryMessageOf/loadRowMessage helper

## Observation
Both in-scope files declare a local `templateMessage(code)` function that
reads a registry row's Message template and asserts its definedness with the
exact string `` `DIAG-4 anchor: docs/spec_topics/diagnostics/code-registry-load.md must carry the Message row for ${code}` ``.
`tests/helpers/load-row-harness.ts` already exports `registryMessageOf(registry,
registryPath, code, fills)`, which performs the identical read-and-assert
step and additionally handles placeholder substitution through its `fills`
parameter — the same substitution both in-scope files perform manually via
`.replaceAll(...)` on `templateMessage`'s return value. `tests/helpers/
registry-oracle.ts`, which both in-scope files already import `readRegistry`
from, further wraps `registryMessageOf` as `loadRowMessage(code)` for exactly
the single-shard "load" read both files perform. Neither in-scope file calls
either exported helper.

## Evidence
`tests/tools-field-shape-refusal.test.ts:195-201` (re-read immediately before
filing):
```ts
function templateMessage(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/code-registry-load.md must carry the Message row for ${code}`,
  ).toBeDefined();
  return template as string;
}
```

`tests/tools-field-zero-entry-scalar-refusal.test.ts:157-163` (re-read
immediately before filing) — byte-identical apart from the doc comment above
it:
```ts
function templateMessage(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/code-registry-load.md must carry the Message row for ${code}`,
  ).toBeDefined();
  return template as string;
}
```

Both files also declare a byte-identical `UNKNOWN_TOOL_NULL_MESSAGE` built
from it — `tests/tools-field-shape-refusal.test.ts:216-218` and
`tests/tools-field-zero-entry-scalar-refusal.test.ts:175-177`:
```ts
const UNKNOWN_TOOL_NULL_MESSAGE = templateMessage(
  "theta/load/unknown-tool",
).replaceAll("<name>", "null");
```

`tests/helpers/load-row-harness.ts:62-80` — the canonical export both files
bypass:
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
```

`tests/helpers/registry-oracle.ts:41-44` — the single-shard "load" wrapper
both files' own `readRegistry(["load"])` call already sits beside, unused for
the message read:
```ts
/** The load registry Message column, refusing an absent row. */
export function loadRowMessage(code: string): string {
  return registryMessageOf(LOAD_REGISTRY, "docs/spec_topics/diagnostics/code-registry-load.md", code);
}
```

Exact search: `grep -n "function templateMessage" tests/*.test.ts` → exactly
these two files. `grep -n "registryMessageOf\|loadRowMessage" tests/tools-field-shape-refusal.test.ts tests/tools-field-zero-entry-scalar-refusal.test.ts` → 0 hits in either file.

## Why this is a problem
Both in-scope files already import `readRegistry` from `tests/helpers/registry-
oracle.ts`, the same module that exports `loadRowMessage` — a same-signature
wrapper (`code: string) => string`) over `registryMessageOf`, itself built for
exactly the "read a Message template, assert it is defined with a DIAG-4-named
message, optionally substitute a placeholder" sequence both files' local
`templateMessage` re-derives verbatim, including the placeholder substitution
`registryMessageOf`'s `fills` parameter already performs. A change to the
DIAG-4 anchor wording, or to how a missing row is reported, needs the same
edit made in both in-scope files' local copies rather than flowing through
the already-imported module.

## Suggested direction (non-binding, optional)
Both files' local `templateMessage` calls name the same shared `loadRowMessage`
(or `registryMessageOf` with `fills`) the module they already import
`readRegistry` from also exports.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin; `ls tests/*gate*.test.ts` has no `tools-field-*` entry.
- Recording-double check: `templateMessage` reads a static parsed registry
  table for a positive message-template lookup; it records no calls and
  backs no "never called" witness, so the negative-witness carve-out does not
  apply.
- docs/bugs/ signature search: `grep -rl "templateMessage" docs/bugs/*.md` →
  0 hits; no documented correct-reason red names this function.
- coverage-matrix/bug-doc citation search: `grep -n "tools-field-shape-
  refusal\|tools-field-zero-entry-scalar-refusal" docs/reference/coverage-
  matrix.md` → 0 hits. `grep -rl` for both filenames across `docs/bugs/*.md`
  finds both files cited only as their respective bug's witness file (by name
  and cell count), never by the `templateMessage` function or a line range
  inside it; this finding proposes no merge, rename or deletion of any cell,
  only that the local function call `registryMessage(...)` be replaced by the
  already-imported `loadRowMessage`/`registryMessageOf`.
- Coverage check: the claim is about a repeated helper-function DEFINITION;
  every cell that calls `templateMessage` keeps running regardless of which
  module supplies the lookup.
- Distinct root cause from PTQ-0723 (open, the `runProductionLoad`/
  `LoadOutcome` harness pair in these same two files) and from PTQ-0724
  (fixed, the `RegistryRow`/`REGISTRY` declaration in these same two files,
  already resolved by importing `readRegistry`): this finding is scoped to
  the per-code message-lookup function only, one root cause per finding.

## Triage
<!-- triage appends here -->
verdict: confirmed — independently re-verified: both `templateMessage` bodies reproduce at tools-field-shape-refusal.test.ts:195-201 and tools-field-zero-entry-scalar-refusal.test.ts:157-163 and sed-extracted diff is empty; tests/helpers/registry-oracle.ts:41-44 `loadRowMessage(code)` (live, 7 importing test files) produces the byte-identical DIAG-4 anchor string for the load page via load-row-harness.ts:62-80 `registryMessageOf`, so it is a drop-in for every local call site (:211/:216 and :172/:175), and the `<name>`/`<value>` placeholders each occur once in their templates so `fills`' `.replace` equals the local `.replaceAll`; both files already import `readRegistry` from that same module; stated greps reproduce (`function templateMessage` → these two plus two 3-arg variants in other files not cited; `registryMessageOf|loadRowMessage` → 0 in both; docs/bugs `templateMessage` → 0; coverage-matrix → 0; no `tools-field-*gate*`); D7 boilerplate-duplication class under tests/, not a gate, no recording double, bugs 0104/0206 both Status: fixed and 88/88 green so no correct-reason red, no cell merged/renamed/deleted; not a duplicate — fixed PTQ-0724's evidence covers only the RegistryRow/REGISTRY block (:188-208/:150-170, pre-fix) and leaves this residual, open PTQ-0723 is the production-load harness, and same-wave siblings d7-02 (parseFrontmatter sextet) and d7-03 (binder-param-line's 3-arg variant/REGISTRY read) are distinct root causes (triage: claude-fable-5-1)
