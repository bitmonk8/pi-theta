---
id: PTQ-1273
title: StaticTypeInferencePass.#typeValue is a 217-LOC twenty-arm Expr switch in the strong band with no strong keep-whole reason
lens: D9
status: open
verdict: confirmed
locations:
  - src/parser/static-type-inference.ts:330-546
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/parser/static-type-inference.ts#StaticTypeInferencePass.#typeValue
d9_band: strong
wave: qw20260922150013
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-22
---

# StaticTypeInferencePass.#typeValue is a 217-LOC twenty-arm Expr switch in the strong band with no strong keep-whole reason

## Observation

`#typeValue` (src/parser/static-type-inference.ts:330-546) is 217 LOC (strong
band, ≥ 200 per the authoritative map). It is one exhaustive `switch` over the
code-defined `Expr` union that computes both the reduced static type and the
provable value-type members per arm. Its own doc comment (322-328) states the
design intent:

```
   * The ONE `Expr` switch behind both `typeOf` (the reduced static type) and
   * `collectProvableArgTypes` (the provable value-type set): each arm computes
   * the two answers together, which is what keeps a collected member from ever
   * rendering differently from the type the pass assigns — the shared source
   * of truth that replaced the extension-side mirror of this switch.
```

## Evidence

Arm/step inventory (case boundaries read directly; 91 of the 217 lines are
comment lines):

| arm(s) | lines | LOC | locals read/written |
|---|---|---|---|
| number/string/bool/null literals | 337-344 | 8 | none (exactValue) |
| ident | 345-355 | 11 | bindings |
| array (exactness-tested members) | 356-388 | 33 | elements, element, type, collected; calls #commonType, unionMembers, renderCollectedTypes |
| binary (delegates) | 389-390 | 2 | none (#typeBinary) |
| ternary | 391-400 | 10 | consequent, alternate |
| try (runtime-tool unwrap, RFC 0011 C6) | 401-421 | 21 | operand, successType; reads #runtimeToolSuccessTypes |
| match (arm-scope typing, bug 0145) | 422-449 | 28 | arms; calls #matchArmScope, #matchArmType |
| member / index | 450-465 | 16 | target; calls #memberType, #typeExpr, unfoldAlias |
| call (runtime-tool Result nominal) | 466-483 | 18 | successType |
| invoke/query/object/result-ctor/method-call nominals | 484-493 | 10 | none |
| par-for (CTRL-3 array<Result<U,…>>) | 494-528 | 35 | iterandType, elementType, inner, tailType |
| block (tail pass-through, bug 0082) | 529-545 | 17 | none |

Every `const` above is arm-block-private; the only function-scope state is the
three parameters (`node`, `env`, `bindings`) and `this`. Seam cost of a
per-arm helper: 3 parameters plus a returned `ExprValueTypes` — no invented
state object.

## Why this is a problem

Strong band: presumption of breakdown absent a strong concrete reason. Reasons
considered and defeated: closed-enumeration dispatch — concrete only
(insufficient at strong), and the 20 arms mirror the code-declared `Expr`
union in theta-ast, not a spec table; longest arm is `par-for` at 35 LOC.
Single algorithm with shared local state — no function-scope locals; every arm
is self-contained on (node, env, bindings). Spec-cited critical section — the
doc comment's "ONE switch" consistency invariant couples the two answers *per
arm*; per-arm private methods each returning `ExprValueTypes` preserve exactly
that coupling, so no observable steps interleave. Measured cost — none cited.
Prior split reverted — `git log -S "#typeValue"` shows one commit (7c3f9eb2),
additive; the "extension-side mirror" the comment cites was a consolidated
duplicate consumer, not a reverted split of this function. Exemption — no
`static-type-inference` key in quality/exemptions.json. Ratified precedent:
PTQ-1178 (`provableArgType`, 283-LOC prose-dominated switch over the same
union) and PTQ-1187 (`walkExpr`, 248 LOC) were filed on identical grounds and
human-ratified confirmed 2026-09-21.

## Suggested direction (non-binding, optional)

All hypotheses unproven. Seam A: the three long arms (array 356-388, match
422-449, par-for 494-528) -> private per-arm methods `#typeArrayLiteral` /
`#typeMatch` / `#typeParFor` (hypothesis) — ~96 LOC, 0 exported symbols moved,
0 external importers, cross-references back to `#commonType` / `#matchArmScope`
/ `#matchArmType` / `#typeExpr` stay on `this`. Seam B: the try/call
runtime-tool pair (401-421, 466-483) -> one `#runtimeToolType` helper
(hypothesis) — ~39 LOC, same coupling to `#runtimeToolSuccessTypes`. No
cross-module seam identified.

## False-positive check

Band: the map reports 330-546 / 217 LOC / strong (FN strong = 200); not
recounted by hand. Reasons-considered list recorded above with the evidence
defeating each. Exemptions check: no key for this host or file in
quality/exemptions.json. Generated-code check: hand-authored (RFC 0011, bugs
0072/0082/0145 cited in-body). Spec-mirror check: arms mirror the code-defined
`Expr` union, not a spec-named table; recorded and defeated on the strong-band
bar. Duplicate check: no open/intake/resolved PTQ keys this host (grep over
quality/ for `#typeValue`/`StaticTypeInferencePass` returns only unrelated D2
consumer-roster items and test-harness D7 filings); PTQ-1138 (resolved) was a
D4 parallel against `collectProvableArgTypes`'s extension mirror, a different
root cause since consolidated into this switch.

## Triage
verdict: questionable — accounting verified at HEAD: `size-scan map --files` (mktemp manifest) reproduces `StaticTypeInferencePass.#typeValue — 330-546 — 217 LOC — band strong` (FN_BANDS strong=200; the file itself is 972 LOC / zone), host key exact; the doc-comment excerpt matches verbatim at 323-328 and all 12 inventory rows sit at the cited `case` boundaries (array 356-388, try 401-421, match 422-449, call 466-483, par-for 494-528, block 529-545), 91 of 217 lines are comment lines as stated, the 20 `case` labels map one-for-one onto the 20-member code-declared `Expr` union in theta-document.ts (not a spec table, so closed-enumeration is concrete-only), and every `const` (elements/element/type/collected, consequent/alternate, operand/successType, arms, target, iterandType/elementType/inner/tailType) is arm-block-private with only node/env/bindings/`this` at function scope, so the ≥6-shared-locals reason does not apply; the "ONE switch" invariant is a doc-comment design intent, not a docs/spec_topics-cited critical section, and it couples the two answers per arm, which per-arm helpers returning ExprValueTypes preserve; `grep static-type-inference quality/exemptions.json` → no match; `git log -S "#typeValue"` → single additive commit 7c3f9eb2 (no reverted split); dedupe clean — same-wave d9-01/d9-02 intake files mention StaticTypeInferencePass only as an imported type in misplacement affinity counts for other hosts, PTQ-1138 (D4 parallel, resolved) targeted the since-consolidated extension mirror, and no PTQ in issues/ or resolved/ carries this host key; PTQ-1178/PTQ-1187 precedents are real (ratified confirmed 2026-09-21) but the seam shape (Seam A per-arm methods vs Seam B runtime-tool helper vs keep-whole as a prose-dominated exhaustive switch) is a design ruling for a human, never confirmed (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified independently at HEAD: `size-scan map --files` (mktemp manifest) reports `StaticTypeInferencePass.#typeValue — 330-546 — 217 LOC — band strong` (file 972 LOC / zone), doc comment verbatim at 323-328, exactly 20 `case` labels in 330-546 matching the 20-member `Expr` union in src/parser/theta-ast.ts:339 (code-declared, not a spec table → closed-enumeration is concrete-only, insufficient at strong), 91 comment lines counted, every `const` in the range (elements/element/type/collected, consequent/alternate, operand/successType, arms, target, successType, iterandType/elementType/inner/tailType) is arm-block-private so no ≥6-shared-locals reason applies, no `static-type-inference` key in quality/exemptions.json, `git log -S "#typeValue"` → single additive commit 7c3f9eb2, and no file under quality/issues or quality/resolved names `#typeValue` (PTQ-1138 was the D4 parallel against the since-consolidated extension mirror); the seam shape (per-arm methods vs runtime-tool helper vs keep-whole) is a design ruling for a human (triage: claude-fable-5-1)
verdict: questionable — accounting verified a third time at HEAD: `size-scan map --files` (mktemp manifest) → `StaticTypeInferencePass.#typeValue — 330-546 — 217 LOC — band strong` (FN_BANDS strong=200; file 972 LOC / zone), doc comment verbatim at 323-328, `grep -c 'case "'` over 330-546 = 20 matching the 20-member code-declared `Expr` union at src/parser/theta-ast.ts:339-359 (concrete-only closed-enumeration, no spec table), 91 comment lines, all 15 `const` declarations (elements/element/type/collected, consequent/alternate, operand/successType, arms, target, successType, iterandType/elementType/inner/tailType) block-scoped inside their own `case` so no ≥6-shared-locals reason applies, the only spec citation in-range (type-system.md §Common-type rules in the match arm) governs `#matchArmType` not the switch shape, `grep static-type-inference quality/exemptions.json` → 0, `git log -S "#typeValue"` → only 7c3f9eb2 (additive), no file under quality/issues names the host and PTQ-1138 (resolved) was the D4 parallel against the extension mirror; per D9 rules a breakdown with accurate accounting is never confirmed — the seam shape (Seam A per-arm methods / Seam B runtime-tool helper / keep-whole prose-dominated exhaustive switch) needs a human ruling (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-22): confirmed - batch ruling over the RFC-0015-era review wave; triage verification trusted.
