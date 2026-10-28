---
id: PTQ-1723
title: checkImportedFnCallArgs directs readers to a collectProvableArgTypes doc comment absent from its file.
lens: D2
status: open
verdict: confirmed
locations:
  - src/extension/invoke-imported-checks.ts:256-261
  - src/extension/invoke-imported-checks.ts:58-63
  - src/extension/invoke-expr-call-surface.ts:24-28
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d2-cruft (openai/gpt-6.1-sol)
date: 2026-10-28
---

# checkImportedFnCallArgs directs readers to a collectProvableArgTypes doc comment absent from its file.

## Observation
The `argTypes === undefined` branch in `checkImportedFnCallArgs` directs readers to “this file's `collectProvableArgTypes` doc comment.” That file imports the helper and has no declaration or API doc comment for it. The scoped call-surface module explicitly locates the collection in `../parser/static-type-inference.ts` and re-exports it.

## Evidence
The dangling local-documentation pointer, `src/extension/invoke-imported-checks.ts:256-261`:

```ts
      const argTypes = collectProvableArgTypes(argExpr, importerEnv, importerPass);
      if (argTypes === undefined) {
        // A value-contributing position past the parser's static view defers
        // to no runtime AJV net (this position registers none) — see this
        // file's `collectProvableArgTypes` doc comment.
        continue;
```

The helper is imported, `src/extension/invoke-imported-checks.ts:58-63`:

```ts
import {
  collectCallSites,
  collectProvableArgTypes,
  dedupeArgType,
  type CollectedCallSites,
} from "./invoke-static-checks";
```

The call-surface module identifies the collection's home, `src/extension/invoke-expr-call-surface.ts:24-28`:

```ts
// The provable value-type collection forward (`collectProvableArgTypes`) and
// the `<actual>`-placeholder renderer for a collected value-type set live beside
// the collection itself (../parser/static-type-inference.ts); re-exported so
// every extension call-surface consumer keeps its existing import shape.
export { collectProvableArgTypes, renderCollectedTypes } from "../parser/static-type-inference";
```

`rg -n -F collectProvableArgTypes src/extension/invoke-imported-checks.ts` returns five lines: header mention, import, usage-contract mention, call, and the reported pointer. `rg -n '(function|const|class)\s+collectProvableArgTypes' src/extension/invoke-imported-checks.ts` returns zero lines. None of the five mentions is the helper's API doc comment.

## Why this is a problem
This is a dangling explanatory pointer left in current code. The branch asks readers to consult a local contract that is not present, while its helper is supplied through imports and re-exports. The finding concerns the locator, not the withholding behavior or the helper's reachability.

## False-positive check
- Read all five local mentions found by the exact search in Evidence; the header and usage-contract mentions are references to the imported helper, not a local definition of its contract.
- `rg -n 'collectProvableArgTypes' src/extension/invoke-imported-checks.ts src/extension/invoke-static-checks.ts src/parser/static-type-inference.ts` confirms the import/re-export chain rather than a local declaration. The scoped call-surface excerpt independently names the collection's current module.
- History intent: `git blame -L 256,261 -- src/extension/invoke-imported-checks.ts` attributes the pointer to c3f8a0ef4. `git show --format=short c3f8a0ef -- src/extension/invoke-imported-checks.ts` shows the new extracted file already importing the helper while carrying this local-documentation wording. `git log --oneline -S 'collectProvableArgTypes' -- src/extension/invoke-imported-checks.ts src/parser/static-type-inference.ts` confirms subsequent helper relocation work as well.
- Prior-topic searches for `collectProvableArgTypes` doc-comment/self-citation wording in `quality/issues` and `quality/resolved` found no report about this pointer. PTQ-0296 and PTQ-0309 concern consumer-count prose, not this absent local doc comment.
- No assertion is made that the helper, branch, or imports are unused; no behavior change is proposed.

## Triage
verdict: confirmed — invoke-imported-checks.ts:258-260 points to “this file's” collectProvableArgTypes doc comment, but its five local mentions contain no such contract; the helper and contract live in parser/static-type-inference.ts behind verified re-exports, and c3f8a0ef carried the stale pointer into the extracted file; no existing finding tracks this locator. (triage: claude-opus-5-5)
