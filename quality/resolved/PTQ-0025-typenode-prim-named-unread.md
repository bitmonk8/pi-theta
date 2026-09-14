---
id: PTQ-0025
title: TypeNode's prim/named leaf split and both arms' name payloads are never read, and PRIMITIVE_TYPES exists only to choose between the two indistinguishable arms
lens: D2                     # the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/parser/type-grammar.ts:247-250
  - src/parser/type-grammar.ts:478
  - src/parser/type-grammar.ts:783-786
  - src/parser/type-grammar.ts:557-567
  - src/parser/type-grammar.ts:1490-1755
sites: 5                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# TypeNode's prim/named leaf split and both arms' name payloads are never read, and PRIMITIVE_TYPES exists only to choose between the two indistinguishable arms

## Observation
The module-private `TypeNode` AST (src/parser/type-grammar.ts) has two leaf
arms, `prim` and `named`, each carrying a `name: string` payload.
`parsePrimaryHead` classifies an identifier head through the module-local
`PRIMITIVE_TYPES` set solely to decide which of the two arms to construct. The
only two functions in the module that branch on `TypeNode.kind` — `walkType`
and `carriesUnclosedInterior` — have no `"prim"` or `"named"` case; both kinds
fall to each function's `default` arm, and no expression anywhere in the module
reads `.name` off a `TypeNode`. The two arms are therefore behaviorally one
opaque leaf, and the classifier plus both payloads produce information nothing
consumes.

## Evidence
src/parser/type-grammar.ts:247-250 — the declaration, whose own doc comment
states the retention contract the two arms exceed:

```ts
/** A type-expression AST node (only what the position checks need to walk). */
type TypeNode =
  | { readonly kind: "prim"; readonly name: string }
  | { readonly kind: "named"; readonly name: string }
```

src/parser/type-grammar.ts:478 and :783-786 — the classifier and its single
use, the construction site:

```ts
const PRIMITIVE_TYPES = new Set(["string", "number", "integer", "boolean", "null"]);
```

```ts
    if (PRIMITIVE_TYPES.has(name)) {
      return { kind: "prim", name };
    }
    return { kind: "named", name };
```

src/parser/type-grammar.ts:557-567 — consumer 1, `carriesUnclosedInterior`:
`prim` and `named` fall to `default`:

```ts
function carriesUnclosedInterior(node: TypeNode): boolean {
  switch (node.kind) {
    case "object":
      return !node.braceClosed || node.fieldTypes.some(carriesUnclosedInterior);
    case "generic":
      return node.args.some(carriesUnclosedInterior);
    case "union":
      return node.arms.some(carriesUnclosedInterior);
    default:
      return false;
  }
}
```

src/parser/type-grammar.ts:1490-1755 — consumer 2, `walkType`: its switch has
exactly the cases `"void"` (:1493), `"generic"` (:1510), `"object"` (:1542),
`"union"` (:1747), and `default` (:1753-1754), which is where `prim` and
`named` land:

```ts
    default:
      return;
  }
```

Searches (exact, with hit counts): `grep -n '"prim"\|"named"'
src/parser/type-grammar.ts` → 4 hits, all declaration (:249, :250) or
construction (:784, :786), no `kind === "prim"` / `kind === "named"` test;
`grep -n "\.name" src/parser/type-grammar.ts` → 0 hits; `grep -n '{ name\|\["name"\]\|stringify' src/parser/type-grammar.ts` → 0 hits;
`grep -n "PRIMITIVE_TYPES" src/parser/type-grammar.ts` → definition :478 plus
the one use at :783 (the `PRIMITIVE_TYPES` in src/parser/params.ts:662 is a
separate module-local constant).

## Why this is a problem
Vestigial fields, proven unread: the payloads are written at construction and
never read, and the kind split is never tested, so the `PRIMITIVE_TYPES`
membership check at :783 selects between two arms no consumer can tell apart.
The module's own convention shows what an opaque leaf looks like — `literal`
(:252) and `bracket-group` (:262) carry no payload, and `bracket-group`'s doc
comment says a leaf "falls to that function's `default` arm" — while `prim`/
`named` deviate by carrying a classifier set and two string payloads with zero
readers, against the declaration's own stated contract ("only what the
position checks need to walk", :247). `git log -S 'kind === "prim"' --
src/parser/type-grammar.ts` returns no commit: the distinction has never had a
reader in the file's history (introduced in 3cadc1ff, V2a, and unconsumed
since).

## Suggested direction (non-binding, optional)
Collapse `prim`/`named` into a single payload-free leaf kind alongside
`literal` and `bracket-group`, which also retires the module-local
`PRIMITIVE_TYPES` set; if a future position check needs the head spelling, the
payload can return with its reader.

## False-positive check
- Kind-test search: `grep -n '"prim"\|"named"' src/parser/type-grammar.ts` — 4
  hits, all declaration/construction; neither `walkType` (:1490-1755) nor
  `carriesUnclosedInterior` (:557-567) has a case for either kind.
- Payload-read search: `grep -n "\.name" src/parser/type-grammar.ts` — 0 hits;
  destructuring (`{ name`), string-keyed access (`["name"]`), and
  `stringify` — 0 hits each, so no dynamic read path exists in the module.
- External reach: `TypeNode` and `TypeParser` are not exported (module exports
  are `TypePosition`, `TypeCheckSite`, `TypeCheckRules`, `parseTypeExpression`,
  `GENERIC_ARITY` only — grep `export (class|type|function|const|interface)`
  on the file); repo-wide grep for `TypeNode|TypeParser` across src/,
  extensions/, tools/, tests/ finds only prose comments
  (src/parser/theta-document.ts:7393, :7608; test header comments) — no import
  and no code reference, and the one code hit (`ts.TypeNode` in
  src/extension/inventory-closure-audit.ts) is the TypeScript compiler's type,
  not this one.
- Test reachability: `parseTypeExpression` returns `Diagnostic[]`; no
  `TypeNode` value escapes the module, so no test can be the payload's caller
  (this is not a test-only-reachable seam — it is unreachable, period).
- Git history intent: `git log -S 'kind === "prim"' -- src/parser/type-grammar.ts`
  → no commits; the arms landed in 3cadc1ff with no reader then or since, so
  this is not a residue of a removed consumer.

## Triage
verdict: confirmed — re-verified independently: all five excerpts match verbatim at cited lines; `"prim"|"named"` in type-grammar.ts is exactly 4 hits (:249/:250 declaration, :784/:786 construction) with no `case`/`===` test anywhere, `.name` is 0 hits with no spread/alias/string-keyed/dynamic path and no assertNever forcing the arms, the only TypeNode kind switches (:558, :1492) both drop both kinds to `default` (:1753-1754), module-local `PRIMITIVE_TYPES` (:478) has its single use at :783 and is unexported (params.ts:662 is a separate LoweredPrimitiveType constant), TypeNode/TypeParser are unexported (surface is TypePosition/TypeCheckSite/TypeCheckRules/parseTypeExpression/GENERIC_ARITY) so no test can be a caller and repo-wide hits are prose comments plus TS's own `ts.TypeNode`, the many repo `kind: "prim"|"named"` hits belong to the distinct exported CompatType/InferredSchema types as the filing states, and `git log -S 'kind === "prim"'` returns no commit with the arms landing unread in 3cadc1ff ("V2a — type-grammar parser"); anchored as proven-dead data plus a classifier whose distinction no consumer can observe, sharpened by the file's own convention of documenting every retained payload while this one has none — not a duplicate of d2-01-parse-generic-guard-subsumed (:774-782, distinct root cause) (triage: claude-opus-5)
