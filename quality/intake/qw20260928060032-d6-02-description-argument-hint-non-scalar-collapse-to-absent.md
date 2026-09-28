---
id: pending
title: A present non-scalar `description:` or `argument-hint:` value (a sequence or mapping) is silently recorded as absent, while every other recognised frontmatter field's collect arm keeps a present non-scalar as present-but-bad and the load refuses it
lens: D6
status: intake
verdict: pending
locations:
  - src/parser/frontmatter.ts:203-209
  - src/parser/frontmatter.ts:220-229
  - src/parser/frontmatter.ts:279-289
  - src/parser/frontmatter.ts:353-373
  - src/parser/frontmatter.ts:891-900
sites: 5
fix_scope: module
d6_class: posture-divergence
d6_anchor: "docs/spec_topics/frontmatter/frontmatter-fields-a.md:46 (system row) — \"On a non-`prompt` theta, a present `system:` whose value is not a YAML scalar is `theta/load/malformed-system-field` and the theta does not register — mirroring the `tools` row above, \\\"absent\\\" and \\\"present-but-the-wrong-shape\\\" do not collapse into one behaviour.\""
wave: qw20260928060032
reported_by: lens-d6-errorposture (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: a251f7ea964be26c0d5a904fcf27fa00016b2aa0
---

# A present non-scalar `description:` or `argument-hint:` value (a sequence or mapping) is silently recorded as absent, while every other recognised frontmatter field's collect arm keeps a present non-scalar as present-but-bad and the load refuses it

## Observation
`collectRecognisedFields` sends each recognised key to one collect arm. For `mode:`, `bind_context:`, `thinking:`, `bind_echo:`, `bind_model:`, `system:` and `tools:`, a present non-scalar value is recorded as present-but-bad: a kind token, an unresolvable marker, a malformed range, or `systemPresent` with `systemValue === undefined`. `checkRecognisedFields` / `buildSystemTemplate` then refuse it with an error, and the theta does not register. The `description:` arm and the `argument-hint:` arm map a non-scalar value to `undefined`, which is the same value an absent field produces. No arm or later check reports it. I confirmed this in this session with a scratch `vite-node` probe under $TEMP. `parseThetaDocument` on `mode: prompt` + `description: [a]`, and on `argument-hint: {a: b}` + `description: x`, each returned a frontmatter and diagnostics `[]`. `parseFrontmatter` on `description: {a: b}` returned `registered: true`, diagnostics `[]`, and no `description`. The control `mode: prompt` + `system: [a]` returned `["theta/parse/system-on-prompt-mode"]`.

## Evidence
**Divergent side (fail-open): the two Pi-mirrored arms.** src/parser/frontmatter.ts:203-209
```ts
function collectDescriptionField(
  value: Node | null | undefined,
  fields: MutableRecognisedFields,
): void {
  fields.descriptionValue =
    isScalar(value) && value.value !== null ? String(value.value) : undefined;
}
```
src/parser/frontmatter.ts:220-229
```ts
function collectArgumentHintField(
  value: Node | null | undefined,
  keyRange: SourceRange | undefined,
  fields: MutableRecognisedFields,
): void {
  fields.argumentHintPresent = true;
  fields.argumentHintRange = keyRange;
  fields.argumentHintValue =
    isScalar(value) && typeof value.value === "string" ? value.value : undefined;
}
```
Both `undefined` results reach the output spreads at frontmatter.ts:1158-1165 (`descriptionValue !== undefined && descriptionValue !== ""`, and the same test for `argumentHintValue`), where they are indistinguishable from an absent field. `argumentHintPresent` is read only by the `argument-hint-not-displayed` advisory, which is about a missing `description:`, not about the hint's own shape.

**Sibling side (fail-closed): the same loop's other arms.** src/parser/frontmatter.ts:279-289 (`bind_context:`; `mode:` and `thinking:` use the identical `presentScalarOrKind` shape, and `bind_echo:` records `bindEchoValueKind`):
```ts
function collectBindContextField(
  value: Node | null | undefined,
  valueRange: SourceRange | undefined,
  fields: MutableRecognisedFields,
): void {
  fields.bindContextPresent = true;
  const v = presentScalarOrKind(value, renderNonScalarBindContextKind);
  fields.bindContextValue = v.value;
  fields.bindContextValueKind = v.kind;
  fields.bindContextRange = valueRange;
}
```
src/parser/frontmatter.ts:353-373 (`system:`, a free-text field like `description:`) keeps presence and leaves `systemValue` undefined for a non-scalar:
```ts
function collectSystemField(
  ...
  fields.systemPresent = true;
  if (!isScalar(value)) {
    fields.systemValue = undefined;
  } else if (value.value === null) {
```
The load then refuses that shape at src/parser/frontmatter.ts:891-900:
```ts
  if (systemPresent) {
    if (modeValue !== "prompt" && systemValue === undefined) {
      diagnostics.push({
        severity: "error",
        code: "theta/load/malformed-system-field",
        file,
        ...(systemRange !== undefined ? { range: systemRange } : {}),
        message:
          "malformed 'system:' field; expected a scalar system prompt",
      });
```

**Sibling-class argument.** Every site handles the same input class: a recognised top-level frontmatter key, read in the same `collectRecognisedFields` loop, whose YAML value node is a sequence or mapping where the field contract expects a scalar. The closest sibling is `system:`, a free-text scalar field whose null scalar maps to absent under the same bug 0299 fix as `description:`. There, a non-scalar value is kept as present-but-wrong-shape and refused. In `description:` / `argument-hint:`, the same node shape is converted to the absent value at the collect arm, so no later check can see it.

**Anchor (right side).** docs/spec_topics/frontmatter/frontmatter-fields-a.md:46 (the `system` row): "On a non-`prompt` theta, a present `system:` whose value is not a YAML scalar is `theta/load/malformed-system-field` and the theta does not register — mirroring the `tools` row above, \"absent\" and \"present-but-the-wrong-shape\" do not collapse into one behaviour." The `description` row (:38) and `argument-hint` row (:39) pin only the absent / `null` default ("The slash-command entry registers without description text … No warning — internal-only thetas legitimately omit this"). They give no sentence to a present non-scalar value, and code-registry-load.md has no row for one.

## Why this is a problem
The repository fixed this exact collapse field by field and stated the posture each time: bug 0104 (`tools:`), 0296 (`mode:`), 0297 (`bind_context:` / `bind_model:`), 0298 (`system:`) and 0301 (`bind_echo:` / `tool_loop:` / `respond_repair:`). The spec rows quoted above say present-but-wrong-shape must not collapse into absent. `description:` and `argument-hint:` are the two recognised fields still collapsing. An author who writes a list under `description:` gets a slash command with no description and a binder prompt with no `Description:` line, and no diagnostic. The deferral is recorded, not ruled. docs/bugs/0299-null-scalar-description-system-fabricate-literal-null.md:141-143 lists "Non-scalar `description:` / `system:` values — candidates 02/03 territory (node-kind seam, absent-collapse)" as a non-goal. The `system:` half has since been fixed (0298). The `description:` half has no bug doc.

## Suggested direction (non-binding, optional)
Keep a present non-scalar `description:` / `argument-hint:` distinguishable from absent at the collect arm, and let the load decide its disposition the way the `system:` arm does. The severity and code need a spec/registry decision first, because no row covers these two fields today.

## False-positive check
- **EXST-9 / PIC-73 class check:** not applicable. These are parse-time frontmatter field arms, not bus sinks, producer hooks, or an optional degrade-silent capability.
- **allow-broad-catch token check:** no catch at any cited site. `grep -nE "catch|allow-broad-catch"` over the 14 in-scope files returned 2 hits, both comments (imports.ts:334, invoke-diagnostics.ts:481).
- **Stated-rationale check:** the `description` arm's comment (frontmatter.ts:193-202) states a rationale for the null scalar only (bug 0299), not for a non-scalar. The `argument-hint` arm's comment (frontmatter.ts:211-219) says "the scalar VALUE is retained" and says nothing about non-scalars. Bug 0299 lists non-scalar `description:` as a non-goal, deferred to a candidate, not as a ruled posture. Its resolution notes (:222-223) repeat "non-scalar `description:`/`system:` values untouched". Bug 0297:125 lists "`description:` / `system:` non-scalar silence — candidates 03/04 territory". `ls docs/bugs | grep -i "description\|argument-hint\|nonscalar\|non-scalar"` returned 9 files: 0103, 0104, 0209, 0296, 0297, 0298, 0299, 0358, 0359. None rules on a non-scalar `description:` / `argument-hint:`. 0298 covers `system:` only: `grep -n -i "description\|argument-hint"` over 0298, 0296 and 0104 returned 0 hits.
- **Sibling-reality check:** the sibling arms and the `malformed-system-field` refusal are live in the same function (excerpts above), and the probe reproduced both postures. `grep -rnE "\"(description|argument-hint): ?(\[|\{)" tests` returned 0 hits, so no test pins the silent collapse.
- **Already-filed check:** the filed and pending list above has no description/argument-hint shape topic. The sibling finding qw20260928060032-d6-01-params-non-mapping-value-registers-as-no-params.md is a different field with a different expected shape (mapping) and a different fix site.

## Triage
verdict: questionable — divergence verified: collectDescriptionField/collectArgumentHintField (frontmatter.ts:203-209, 220-229) map a non-scalar to undefined, indistinguishable from absent at :1158-1165, while the bind_context/system arms (:279-289, :353-373) keep present-but-bad and :891-900 refuses it. Stated searches reproduce (9 bug docs, 0 test hits, 0299:141-143 non-goal). But the d6_anchor (fields-a.md:46) pins only the `system` row, and the `description` (:38) / `argument-hint` (:39) rows say nothing about a present non-scalar; the filing itself says a spec/registry decision is needed first. Which posture is right, and which code, needs a human ruling (triage: claude-opus-5-5)
