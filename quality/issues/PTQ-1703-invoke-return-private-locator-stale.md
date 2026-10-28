---
id: PTQ-1703
title: InvokeReturnSite's comment points to a private return validator that no longer exists.
lens: D2
status: open
verdict: confirmed
locations:
  - src/extension/invoke-return-validation.ts:58-67
  - src/extension/invoke-return-validation.ts:177-189
  - src/extension/invoke-machinery.ts:787-801
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d2-cruft (openai/gpt-6.1-sol)
date: 2026-10-28
---

# InvokeReturnSite's comment points to a private return validator that no longer exists.

## Observation
The `InvokeReturnSite` comment identifies its consumer as `#validateInvokeReturn` (`src/extension/invoke-return-validation.ts:58-67`). The current implementation is the module-level `validateInvokeReturn` function, which destructures and merges the site's declarations (`src/extension/invoke-return-validation.ts:177-189`). The machinery's forwarding method is also named `validateInvokeReturn`, without the private-member prefix (`src/extension/invoke-machinery.ts:787-801`).

## Evidence
`src/extension/invoke-return-validation.ts:58-67` — the stale private-member locator:
```ts
/**
 * A resolved return-type site: the annotation source to lower and the theta
 * body whose `schema` / `enum` declarations resolve the names in it. Bug
 * 0465: `importedTypeDecls` rides alongside `declarations` so
 * `#validateInvokeReturn` can merge in the same file's imported schema/enum
 * decls the lowering seam needs — the AUTHORING file's for `annotated`
 * (the declaring library inside an imported fn), the CALLEE's for
 * `callee-inferred` (the inferred name resolves against the callee's own
 * decls, imports included).
 */
```

`src/extension/invoke-return-validation.ts:177-189` — the current declaration and merge:
```ts
export function validateInvokeReturn(
  schemaValidator: SchemaValidator,
  calleePath: string,
  returnSite: InvokeReturnSite | null,
  result: ResultValue,
  calleeResolvedPath: string | undefined,
  forwardedEnumTags?: readonly EnumTagEntry[],
): ResultValue {
  if (returnSite === null || !result.ok) {
    return result;
  }
  const { annotation: returnSchema, declarations, importedTypeDecls } = returnSite;
  const mergedSite = { body: declarations, importedTypeDecls };
```

`src/extension/invoke-machinery.ts:787-801` — the current forwarding method:
```ts
  validateInvokeReturn(
    calleePath: string,
    returnSite: InvokeReturnSite | null,
    result: ResultValue,
    calleeResolvedPath: string | undefined,
    forwardedEnumTags?: readonly EnumTagEntry[],
  ): ResultValue {
    return validateInvokeReturn(
      this.#input.root.schemaValidator,
      calleePath,
      returnSite,
      result,
      calleeResolvedPath,
      forwardedEnumTags,
    );
```

## Why this is a problem
This is a stale code locator, not a request to rename a live declaration. The comment sends a reader to a private member, while the declaration-merging implementation is now a module-level function and the machinery exposes a forwarding method with no `#` prefix. The historical member reference remains in the current contract explanation after the implementation moved.

## Suggested direction (non-binding, optional)
Align the consumer reference with the current return-validation implementation.

## False-positive check
- Ran `rg -n '#validateInvokeReturn' src extensions tools tests`; the matches are prose references, including the scoped comment, rather than a private implementation.
- Ran `rg -n '#validateInvokeReturn\s*\(' src extensions tools tests` and `rg -n '^\s*(async\s+)?#validateInvokeReturn|this\.#validateInvokeReturn' src extensions tools tests`; both returned no matches. This finding concerns the prose locator, not the reachability of the live validator or its exports.
- Inspected both current declarations reproduced above; the module-level function performs the merge and the machinery method forwards to it.
- History intent check: `git log -3 --oneline -S '#validateInvokeReturn(' -- src/extension/production-theta-producer.ts src/extension/invoke-machinery.ts` identifies the earlier producer/machinery transitions. `git show 44f7f921 -- src/extension/invoke-machinery.ts` shows the validation body extracted into the new module; `git log -1 --oneline -L 58,67:src/extension/invoke-return-validation.ts` shows the later declaring-scope comment update retaining the private-member reference.
- No change to validation behavior, test-only callers, or a spec-mandated branch is proposed.

## Triage
verdict: confirmed — All three excerpts and stated searches reproduce: the comment at invoke-return-validation.ts:62 names nonexistent #validateInvokeReturn, while the module-level function at :177-189 performs the declaration merge and InvokeMachinery.validateInvokeReturn at :787-801 forwards to it; commit 44f7f921 verifies the extraction and a21bd1b2 retained the stale locator, with no existing issue tracking this comment defect. (triage: claude-opus-5-5)
