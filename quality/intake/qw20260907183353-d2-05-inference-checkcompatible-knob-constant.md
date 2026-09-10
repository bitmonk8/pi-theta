---
id: pending
title: StaticTypeInferenceDeps.checkCompatible is an injection knob every construction site in the repository binds to the same production function
lens: D2
status: intake
verdict: pending
locations:
  - src/parser/static-type-inference.ts:50-54
  - src/parser/static-type-inference.ts:71-73
  - src/parser/static-type-inference.ts:99-104
  - src/parser/type-layer-checks.ts:338-341
  - src/extension/invoke-static-checks.ts:943-946
  - src/extension/invoke-static-checks.ts:1386-1389
sites: 11
fix_scope: cross-module
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# StaticTypeInferenceDeps.checkCompatible is an injection knob every construction site in the repository binds to the same production function

## Observation
`StaticTypeInferencePass` declares an injectable compatibility relation (`CheckCompatible`, stored as `#checkCompatible`) as a constructor dependency. Every construction site in the repository — three in production and eight in tests — passes the identical `checkCompatible` function imported from `./type-compat` (`../src/parser/type-compat` in tests). No second relation value exists anywhere. The same module meanwhile imports the engine's sibling functions (`commonType`, `unfoldAlias`, `resolveNamed`, `widenLiteralTypes`, `enumVariantType`, `withheldBinderType`) directly from `./type-compat`, so the injection provides no module decoupling either.

## Evidence
src/parser/static-type-inference.ts:50-54 and :71-73, :99-104 — the seam and its storage:
```
export type CheckCompatible = (
  sub: CompatType,
  sup: CompatType,
  env: TypeEnv,
) => Compatibility;
...
  readonly checkCompatible: CheckCompatible;
...
  readonly #checkCompatible: CheckCompatible;
```
The direct sibling imports in the same module (static-type-inference.ts:37-48): `commonType, displayType, enumVariantType, resolveNamed, unfoldAlias, widenLiteralTypes, withheldBinderType` from `"./type-compat"`.

All construction sites (`grep -rn "new StaticTypeInferencePass(" src tests extensions tools` — exhaustive, 11 hits):
- src/parser/type-layer-checks.ts:338-341 — `{ checkCompatible, enumNames: collectEnumNames(body.statements) }`
- src/extension/invoke-static-checks.ts:943-946 — `{ checkCompatible, enumNames: collectEnumNames(input.body.statements) }`
- src/extension/invoke-static-checks.ts:1386-1389 — `{ checkCompatible, enumNames: collectEnumNames(importingBody.statements) }`
- tests/array-ternary-common-type-union.test.ts:494, tests/division-result-type-number.test.ts:645, tests/for-empty-array-iterand-adjudication.test.ts:343, tests/match-fn-return-lub-dominating-discipline.test.ts:280, tests/modulo-zero-result-type-number.test.ts:691, tests/par-for.test.ts:2216-2217, tests/static-type-inference.test.ts:134-135, tests/subagent-fn.test.ts:431-432 — each `{ checkCompatible, enumNames: new Set() }`.
Test binding provenance (representative): tests/static-type-inference.test.ts:6:
```
import { checkCompatible, type TypeEnv } from "../src/parser/type-compat";
```

## Why this is a problem
Speculative generality / vestigial parameter: a config knob with exactly one value across all eleven users — "every call site passes the same value". The indirection costs a seam type, a deps interface field, a private field, and per-site ceremony, and buys nothing current code exercises: no caller (production or test) ever supplies an alternative relation, and the module already reaches the same engine's other functions by plain import, so the boundary does not isolate the module from `type-compat`. The sibling `enumNames` dep is not in this finding's scope — its value genuinely varies per site.

## Suggested direction (non-binding, optional)
Import `checkCompatible` directly like the module's six other `type-compat` imports and drop the constructor knob — or, if the seam is to stay, leave it as-is; the fix stage owns the call.

## False-positive check
- Counted every constructor call across src/, extensions/, tools/, tests/: 11 sites, listed above; each passes the symbol `checkCompatible` and each file's import of that symbol resolves to src/parser/type-compat (verified in type-layer-checks.ts, invoke-static-checks.ts, and the eight test files — e.g. static-type-inference.test.ts:6, par-for.test.ts:26). No mock, wrapper, or alternative relation is constructed anywhere.
- Dynamic-construction search: no factory or barrel constructs the pass; `StaticTypeInferenceDeps` is referenced only at the cited sites and the class itself.
- Deliberate-seam consideration: the module header (:14-16) states the pass "is constructor-injected over the `V2b` engine … the seam `V20c` binds against", and tests/static-type-inference.test.ts:133 repeats it — but every binder binds the one production engine, and witness tests exercising the seam with the production value do not constitute a second user of the knob.
- Not a deadness claim about the class or `typeOf`/`infer` (both alive in production); the finding is the constant-valued dependency alone.

## Triage
verdict: questionable — all 11 sites reproduce binding the same production `checkCompatible`, but the anchor is contested by explicit in-repo rationale (type-compat.ts:749-758 names and rejects "importing `checkCompatible` into the inference pass"; static-type-inference.ts:616-624 "rather than reach for a copy that would silently bypass it"), and the deps interface, constructor and per-site literal all survive for `enumNames`, so the fix buys one field against documented intent — a human should rule (triage: claude-opus-5)
verdict: questionable — independently re-verified: all 11 sites reproduce (grep for `new StaticTypeInferencePass(` across src/tests/extensions/tools = 11; production trio now at type-layer-checks.ts:341, invoke-static-checks.ts:1096/:1670, drifted from the filed lines but content-identical, caused by 264dcbd6 (2026-09-10, the PTQ-0127 fix) editing doc comments above; static-type-inference.ts's own three citations shift the same way for the same reason), and a targeted sweep of every `checkCompatible` occurrence in tests/*.ts turns up no spy/wrapper/alternative relation anywhere, only the one production symbol, so the "exactly one value, eleven binders" premise holds exactly as filed; but the seam is real, restated intent, not silent leftover — type-compat.ts:757 states the `CompatRelation` parameter exists specifically so "the checker and the inference pass compute the same answer for the same candidate set" rather than importing `checkCompatible` into the pass, static-type-inference.ts:624-627 repeats it for `#matchArmType`, and docs/bugs/0158 §Fix (:997-1001) shows that exact choice made again, deliberately, in a later refactor rather than merely inherited; confirmed distinct from PTQ-0030 (InferredTypeMap) and PTQ-0127 (enumNames roster, already fixed) — no duplicate. Two real, mechanically-grounded readings in tension (proven single-value knob vs. documented anti-drift seam) is exactly a human call, not a triage one (triage: claude-opus-5)
