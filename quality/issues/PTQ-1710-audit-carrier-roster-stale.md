---
id: PTQ-1710
title: Inventory audit carrier comments still describe two ctx literals after ExtensionToolContext was added.
lens: D2
status: open
verdict: confirmed
locations:
  - src/extension/inventory-closure-audit.ts:46-48
  - src/extension/inventory-closure-audit.ts:218-224
  - src/extension/inventory-closure-audit.ts:226-235
sites: 2
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d2-cruft (openai/gpt-6.1-sol)
date: 2026-10-28
---

# Inventory audit carrier comments still describe two ctx literals after ExtensionToolContext was added.

## Observation
The inventory audit's `CTX_TYPES` contains `ExtensionContext`, `ExtensionCommandContext`, and `ExtensionToolContext`. The header for `carrierKindOfName` still says there are two ctx literals. The adjacent `bareCarrierLiteral` header enumerates the earlier set without `ExtensionToolContext`, although its implementation delegates to the same classifier.

## Evidence
The current roster, `src/extension/inventory-closure-audit.ts:46-48`:

```ts
/** The canonical carrier-type literals (audit-target-categories.md (1)/(3)). */
const CTX_TYPES: ReadonlySet<string> = new Set(["ExtensionContext", "ExtensionCommandContext", "ExtensionToolContext"]);
const PI_TYPE = "ExtensionAPI";
```

The count claim and its implementation, `src/extension/inventory-closure-audit.ts:218-224`:

```ts
/** Which canonical carrier a bare literal name denotes (`ExtensionAPI` -> pi, the two ctx literals -> ctx). */
type CarrierKind = "pi" | "ctx";
function carrierKindOfName(name: string): CarrierKind | null {
  if (name === PI_TYPE) return "pi";
  if (CTX_TYPES.has(name)) return "ctx";
  return null;
}
```

The enumerated claim and delegation, `src/extension/inventory-closure-audit.ts:226-235`:

```ts
/**
 * The carrier a type node names when it is the BARE literal `ExtensionAPI` /
 * `ExtensionContext` / `ExtensionCommandContext` (a type-reference with no type
 * arguments), or `null`. A generic-applied form (`Pick<ExtensionAPI, ...>`) is
 * deliberately NOT a bare literal, so a `Pick`-narrowed structural cap is not a
 * carrier binding (bug 0373 §Fix).
 */
function bareCarrierLiteral(t: ts.TypeNode | undefined, sf: ts.SourceFile): CarrierKind | null {
  if (t === undefined || !ts.isTypeReferenceNode(t) || t.typeArguments !== undefined) return null;
  return carrierKindOfName(t.typeName.getText(sf).trim());
```

These are the two reported prose sites; the roster is supporting evidence for both, not a request to change it.

## Why this is a problem
This is stale header prose with a mechanically refuted count and roster. Both headers describe the accepted input names of their own helpers, but the code accepts a third ctx name. A reader using the headers to determine whether `ExtensionToolContext` is a canonical carrier gets a different answer from the implementation.

## False-positive check
- Read both helpers together with `CTX_TYPES`: the third name is accepted through `CTX_TYPES.has(name)`, and `bareCarrierLiteral` delegates without excluding it. The finding concerns prose only, not the live enumeration or any fail-closed branch.
- History intent: `git blame -L 214,235 -- src/extension/inventory-closure-audit.ts` attributes the two headers to d63c51487. `git blame -L 45,48 -- src/extension/inventory-closure-audit.ts` and `git show --format=short de146127e -- src/extension/inventory-closure-audit.ts` show de146127e added `ExtensionToolContext` to the set without changing those headers.
- Prior-topic searches for `two ctx literals`, `bareCarrierLiteral`, and inventory-audit literal/count wording in `quality/issues` and `quality/resolved` found no finding about these headers. The `bareCarrierLiteral` mention in PTQ-0350 is a concern inventory, not a report about its prose.
- No declaration, export, test seam, or spec-named arm is classified as unused here.

## Triage
verdict: confirmed — Both excerpts match: CTX_TYPES has three ctx names, but :218 says "two ctx literals" and :227-229 omits ExtensionToolContext even though bareCarrierLiteral delegates to that set-backed classifier; blame/show verifies de146127e added the third name without updating either header, and issue/resolved/intake searches found no duplicate root cause. (triage: claude-opus-5-5)
