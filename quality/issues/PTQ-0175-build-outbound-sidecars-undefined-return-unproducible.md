---
id: PTQ-0175
title: buildOutboundSidecars accepts `rootSchema: string | undefined` and returns `undefined` through two guards that every one of its four call sites has already discharged (a non-undefined name with a present object body), so the `undefined` outcome and the four callers' fallbacks for it are unreachable
lens: D2
status: open
verdict: confirmed
locations:
  - src/parser/frontmatter.ts:934-945
  - src/parser/frontmatter.ts:907-909
  - src/parser/frontmatter.ts:874-877
  - src/parser/frontmatter.ts:1015-1023
  - src/parser/frontmatter.ts:1244-1255
  - src/parser/frontmatter.ts:1371-1376
  - src/parser/frontmatter.ts:1408-1457
  - src/parser/frontmatter.ts:1201-1204
sites: 5
fix_scope: localized
wave: qw20260910054544
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-10
---

# buildOutboundSidecars accepts `rootSchema: string | undefined` and returns `undefined` through two guards that every one of its four call sites has already discharged (a non-undefined name with a present object body), so the `undefined` outcome and the four callers' fallbacks for it are unreachable

## Observation
`buildOutboundSidecars` (module-private) opens with two early returns:
`rootSchema === undefined || !bodyTypes.schemas.has(rootSchema)` and
`bodyTypes.schemas.get(rootSchema) === undefined`. It has four call sites.
Two pass a name returned by `namedSchemaOf`, which returns a non-`undefined`
value only for a name `s` with `schemas.has(s) && schemas.get(s) !== undefined`;
the other two pass a name after the caller has itself tested `schemas.has(s)`
and exited (`continue` / `return`) on `fields === undefined`. Every caller then branches on the
`undefined` result (`continue`, `return undefined`, or fall through to a
sidecar-less shape). None of those branches can execute. The function's own
doc says the callers pre-resolve before reaching it.

## Evidence
src/parser/frontmatter.ts:934-945 — the signature and the two guards:

```ts
function buildOutboundSidecars(
  rootSchema: string | undefined,
  bodyTypes: FrontmatterBodyTypes,
  reserved: Set<string> = new Set(),
  building: Set<string> = new Set(),
): { readonly sidecars: ReadonlyMap<string, SchemaSidecar>; readonly rootDef: string } | undefined {
  if (rootSchema === undefined || !bodyTypes.schemas.has(rootSchema)) {
    return undefined;
  }
  if (bodyTypes.schemas.get(rootSchema) === undefined) {
    return undefined;
  }
```

src/parser/frontmatter.ts:907-909 — the doc's own statement of the callers'
pre-resolution:

```ts
 * `undefined` when `rootSchema` names no object body schema (an imported name,
 * an alias, or no root at all) — callers resolve an alias/`array<...>` source
 * through `namedSchemaOf` before reaching here.
```

src/parser/frontmatter.ts:874-877 — `namedSchemaOf`'s only non-`undefined`
return, guarded by exactly the two conditions the callee re-tests (the other
two returns at :889/:893 recurse into this same function):

```ts
  if (bodyTypes.schemas.has(s)) {
    if (bodyTypes.schemas.get(s) !== undefined) {
      return s;
    }
```

Call site 1 — src/parser/frontmatter.ts:1015-1023 (`refTargetInto`):

```ts
  const named = namedSchemaOf(typeSource, bodyTypes);
  if (named !== undefined) {
    if (building.has(named)) {
      return named;
    }
    const nested = buildOutboundSidecars(named, bodyTypes, reserved, building);
    if (nested === undefined) {
      return undefined;
    }
```

Call site 2 — src/parser/frontmatter.ts:1244-1255 (`buildSystemUnionArms`),
which re-establishes both conditions inline before the call:

```ts
    const schemaName = bodyTypes.schemas.has(s) ? s : undefined;
    if (schemaName === undefined) {
      continue;
    }
    const fields = bodyTypes.schemas.get(schemaName);
    if (fields === undefined) {
      continue;
    }
    const sc = buildOutboundSidecars(schemaName, bodyTypes);
    if (sc === undefined) {
      continue;
    }
```

Call site 3 — src/parser/frontmatter.ts:1371-1376 (`toSystemParamType`,
`array<...>` element):

```ts
        const named = namedSchemaOf(element, bodyTypes);
        if (named !== undefined) {
          const sc = buildOutboundSidecars(named, bodyTypes);
          if (sc !== undefined) {
            return { kind: "array", sidecars: sc.sidecars, rootDef: sc.rootDef };
          }
```

Call site 4 — src/parser/frontmatter.ts:1408 and :1452-1457
(`toSystemParamType`, object-schema arm, inside `if (bodyTypes.schemas.has(s))`
at :1403; every path of the `fields === undefined` block at :1409-1452
returns):

```ts
      const fields = bodyTypes.schemas.get(s);
      if (fields === undefined) {
```
```ts
      const map = new Map<string, SystemParamType>();
      const sc = buildOutboundSidecars(s, bodyTypes);
      const shell: SystemParamType =
        sc !== undefined
          ? { kind: "object", fields: map, sidecars: sc.sidecars, rootDef: sc.rootDef }
          : { kind: "object", fields: map };
```

src/parser/frontmatter.ts:1201-1204 — a second doc passage narrating the
unreachable arm as a live case:

```ts
 * multi-arm alias, or a schema `buildOutboundSidecars` cannot build a sidecar
 * map for — is
 * SKIPPED, not pushed as a degraded arm, so the render-time pick never
 * chooses a half-built arm; a value that would have matched a SHAPE-DISJOINT
```

`grep -n "buildOutboundSidecars(" src/parser/frontmatter.ts` → exactly the
four call lines above (:1020, :1252, :1373, :1454) plus the declaration :934.
Body inspection: the function has no other `return undefined` — after the two
guards it always returns `{ sidecars, rootDef: rootSchema }` (:992).

## Why this is a problem
Unreachable branches, proven by the call graph: the `| undefined` half of the
return type, the `rootSchema === undefined` conjunct, the `schemas.get(...) === undefined`
guard, and the four callers' `undefined`-handling arms (`return undefined`
:1021-1023, `continue` :1253-1255, the fall-through past :1374, the
sidecar-less `shell` at :1457) are code paths no input can take. The
precondition is checked twice on every call — once by the caller, once by
the callee — and two doc passages (:907-909, :1201-1204) describe the second
check as a real outcome a reader must reason about. Blame: the guards date
from the bug 0407 commit (8f29983e), when `toSystemParamType` passed an alias
name straight in and the `get(...) === undefined` guard did fire; the bug
0442/0441/0443 commit (106db606) routed every caller through `namedSchemaOf`
or an inline `fields` test, which is when the guards stopped selecting
anything.

## Suggested direction (non-binding, optional)
Let the function take a `string` whose object body the caller has already
obtained (or take the `fields` directly), return the record unconditionally,
and drop the four callers' `undefined` arms and the two doc sentences that
describe them; alternatively keep the callee as the single check and remove
the callers' duplicate pre-tests. The fix stage owns the choice.

## False-positive check
- Call-site enumeration: `grep -rn "buildOutboundSidecars" src/ extensions/ tools/ tests/`
  → 4 calls + 1 declaration in frontmatter.ts, 1 comment in
  import-static-checks.ts:1521, and comment-only mentions in two tests
  (b0424, b0442). The function is not exported, so tests cannot call it and
  no dynamic/string-keyed access is possible.
- `namedSchemaOf` return analysis: its non-recursive returns are :876 (`s`,
  under `has(s) && get(s) !== undefined`), :883/:887/:895 (`undefined`); the
  recursive returns :889/:893 resolve to one of those. So every non-`undefined`
  value it yields satisfies both callee guards.
- Call site 4: confirmed every path inside `if (fields === undefined) { … }`
  (:1409-1452) ends in `return` (:1417, :1437, :1439, :1449-1451), so :1454
  runs only with `fields !== undefined`; the enclosing `if (bodyTypes.schemas.has(s))`
  at :1403 supplies the `has` half.
- Recursion via `refTargetInto` → `buildOutboundSidecars` → `buildInlineSidecars`
  → `refTargetInto`: every entry to the callee still goes through :1015-1020,
  so the argument is still a `namedSchemaOf` result.
- Type-narrowing necessity: the loop-body `if (fields === undefined) continue;`
  at :953-954 does the `Map.get` narrowing the body needs; the :943 guard is
  not what narrows anything used later (`rootSchema` is used only as a string
  key and seed).
- Not a duplicate: no filed finding cites frontmatter.ts:934-945 or the four
  call sites; PTQ-0149 and PTQ-0120 concern other frontmatter.ts sites.

## Triage
verdict: confirmed — every excerpt byte-matches at the cited lines and the call-graph proof reproduces independently: `grep -rn buildOutboundSidecars src/ extensions/ tools/ tests/` → declaration :934 + exactly four calls (:1020, :1252, :1373, :1454), all other hits comment-only (import-static-checks.ts:1521, b0424:9, b0442:12, frontmatter.ts:858/:1005), function not exported and no `export *`; `namedSchemaOf`'s sole non-`undefined` terminal (:876) sits under `has(s) && get(s) !== undefined` with :889/:893 recursing into it, so call sites 1 and 3 pass a name satisfying both guards; call site 2 re-tests `has`/`get` inline at :1244-1251 before calling; call site 4 runs under `has(s)` (:1403) with `s: string` (:1317) after a `fields === undefined` block whose every path returns (:1417, :1437, :1439, :1449-1451); `schemas` is a `ReadonlyMap` so nothing can change between the caller's check and the callee's re-check; blame confirmed — guards born in 8f29983e when the array arm passed `namedSchemaOf(element, …)` straight in and that era's `namedSchemaOf` returned any `has(s)` name including aliases (so both guards then fired), and 106db606 added the `get(s) !== undefined` requirement plus the `named !== undefined` pre-checks that made them unreachable; in-scope src/ dead branches (same species as PTQ-0005/0131/0152/0158/0161), no issue/resolved/intake file cites these identifiers or lines (PTQ-0149/0120 are other frontmatter.ts sites) (triage: claude-opus-5)
