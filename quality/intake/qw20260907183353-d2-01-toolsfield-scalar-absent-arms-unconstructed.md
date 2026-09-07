---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: ToolsField's "absent" and "scalar" arms are constructed by no production caller — both resolveCallableSet call sites pass kind "list" after frontmatter already collapsed the scalar spelling upstream
lens: D2                     # the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending             # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/parser/callable-set.ts:49-52
  - src/parser/callable-set.ts:348-360
  - src/parser/callable-set.ts:8-9
  - src/extension/production-composition.ts:2251-2255
  - src/extension/production-composition.ts:2099-2108
  - src/extension/production-composition.ts:3060-3064
  - src/extension/production-composition.ts:2859-2868
  - src/parser/frontmatter.ts:623-630
sites: 8                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# ToolsField's "absent" and "scalar" arms are constructed by no production caller — both resolveCallableSet call sites pass kind "list" after frontmatter already collapsed the scalar spelling upstream

## Observation
`ToolsField` is a three-arm union (`absent` / `scalar` / `list`) that is the
`tools` input to `resolveCallableSet`. In the shipped pipeline, the frontmatter
layer (`extractToolsList`, frontmatter.ts) already collapses both YAML
spellings — the comma-separated scalar and the sequence — into a plain
`readonly string[]` before load resolution runs, and both production
`resolveCallableSet` call sites wrap that array as `{ kind: "list", items }`,
early-returning before the call when the array is absent or empty. The
`absent` and `scalar` arms of the union, and `splitEntries`' comma-split and
empty-return branches that serve them, are therefore constructed only by
tests. The module header still claims this module owns "the two
interchangeable YAML spellings".

## Evidence
src/parser/callable-set.ts:49-52 — the union:
```ts
export type ToolsField =
  | { readonly kind: "absent" }
  | { readonly kind: "scalar"; readonly text: string }
  | { readonly kind: "list"; readonly items: readonly string[] };
```

src/parser/callable-set.ts:348-360 — the arms' only reader:
```ts
function splitEntries(tools: ToolsField): readonly string[] {
  switch (tools.kind) {
    case "absent":
      return [];
    case "scalar":
      return tools.text
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    case "list":
      return tools.items.map((s) => s.trim()).filter((s) => s.length > 0);
  }
}
```

src/parser/callable-set.ts:8-9 — the module-header ownership claim:
```
//   - the two interchangeable YAML spellings (comma-separated short form and
//     YAML list form) parsed by one per-entry grammar;
```

src/extension/production-composition.ts:2251-2255 — production call site 1:
```ts
  const result = resolveCallableSet({
    file: parsed.sourcePath,
    tools: { kind: "list", items: toolsList },
    deps,
  });
```

src/extension/production-composition.ts:2099-2108 — site 1 returns before the
call when the list is absent/empty, so `{ kind: "absent" }` is never built:
```ts
  const toolsList = parsed.frontmatter.tools;
  if (
    toolsList === undefined ||
    toolsList.length === 0 ||
    parsed.sourcePath === undefined
  ) {
    // No `tools:` → the empty callable set (no `<name>(...)` callables). Attach
    // the empty frozen snapshot so the runtime enforces "no ambient tools"
    // rather than falling back to the producer-wide resolver.
    return { diagnostics: [], callableSet: EMPTY_CALLABLE_SET, ...rootClosureSpread };
```

src/extension/production-composition.ts:3060-3064 — production call site 2:
```ts
  const result = resolveCallableSet({
    file: calleeAbsolutePath,
    tools: { kind: "list", items: toolsList },
    deps: stubDeps,
  });
```

src/extension/production-composition.ts:2859-2868 — site 2's identical
absent/empty early return:
```ts
  const toolsList = frontmatter.tools;
  if (toolsList === undefined || toolsList.length === 0) {
    return {
      fails: false,
      ownEscapes: false,
      consultedVisited: false,
```

src/parser/frontmatter.ts:623-630 — the scalar comma-split production
actually runs, upstream of the resolver:
```ts
function extractToolsList(node: unknown, yamlSource: string): readonly string[] | undefined {
  if (isScalar(node)) {
    const entries = String(node.value)
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    return entries.length > 0 ? entries : undefined;
  }
```

Search: `resolveCallableSet\(` across all `*.ts` → 2 production call sites
(production-composition.ts:2251, :3060), the definition, and 9 test call
sites. Search: `kind: "scalar"` / `kind: "absent"` across all `*.ts` → the
only `ToolsField`-typed constructions are tests
(tests/callable-set.test.ts:73, :272; tests/subagent-fn.test.ts:588;
tests/tools-entry-closed-grammar.test.ts:539). No src/ file besides
callable-set.ts even names `ToolsField`.

## Why this is a problem
Vestigial union arms: every production construction site of the resolver's
input passes the same variant (`kind: "list"`), and the absent case is
handled by both callers' own early returns before the resolver is reached.
The `scalar` arm's comma-split re-states logic the shipped pipeline performs
upstream in `extractToolsList` (frontmatter.ts:623-630), so in production
the arm can never fire — the scalar YAML spelling reaches
`resolveCallableSet` already list-ified. The module header's claim that this
module owns "the two interchangeable YAML spellings" (callable-set.ts:8-9)
and the union doc's arm descriptions (callable-set.ts:41-47) describe an
input surface the production wiring stopped exercising when the frontmatter
layer took over spelling collapse.

## Suggested direction (non-binding, optional)
Either narrow the resolver's input to the list shape production actually
supplies (updating the seam tests that construct the other arms), or move the
one production comma-split into this module so the header's ownership claim
is true again; today's split ownership keeps two arms and a header claim
alive that the shipped pipeline never uses.

## False-positive check
- Reference searches: `ToolsField` across src/, extensions/, tools/, tests/ —
  src hits only in callable-set.ts itself; test hits in
  tests/callable-set.test.ts, tests/subagent-fn.test.ts,
  tests/tools-entry-closed-grammar.test.ts (type imports + constructions).
- Constructor search: `kind: "scalar"` and `kind: "absent"` across all `*.ts`
  — no src/ construction of either arm (the `kind: "absent"` hits in
  discovery/ and the `kind: "scalar"` hits in runtime/subagent-envelope.ts
  belong to unrelated local unions).
- Call-site search: `resolveCallableSet(` across all `*.ts` — both production
  sites cited above pass `{ kind: "list", items: toolsList }`; every other
  call site is in tests/.
- Tests-as-callers rule: tests do construct the `scalar` and `absent` arms,
  so the arms are not claimed dead — the claim is the vestigial-arm /
  production-constant-input pattern (all production call sites pass one
  variant), with the upstream split cited.
- Git intent check: V6c landed the seam standalone (8ab16c21) before the
  production `tools:` wiring; `extractToolsList`'s scalar split in
  frontmatter.ts is the arm production has exercised since.
- Duplicate check: the already-filed callable-set findings
  (entry-resolution-fabricated-callable, resolved-theta-callee-field-unread,
  invoke-extension-surface-unread, pi-tool-load-entry-execute-unwritten)
  cover different members; none names `ToolsField` or `splitEntries`.

## Triage
