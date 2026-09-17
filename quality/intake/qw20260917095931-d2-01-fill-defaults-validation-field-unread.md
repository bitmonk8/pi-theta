---
id: pending
title: fillDefaultsAndRevalidate's returned `validation` field is never read by its sole production caller
lens: D2
status: intake
verdict: pending
locations:
  - src/binder/defaulting.ts:63-66
  - src/binder/defaulting.ts:68-89
  - src/binder/defaulting.ts:157-177
  - src/extension/production-theta-producer.ts:862-866
  - src/extension/production-theta-producer.ts:1699-1706
sites: 1
fix_scope: localized
wave: qw20260917095931
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# fillDefaultsAndRevalidate's returned `validation` field is never read by its sole production caller

## Observation
`fillDefaultsAndRevalidate` (src/binder/defaulting.ts) returns a `FillDefaultsResult` carrying four fields: `args`, `defaultedWireNames`, `validation` (the raw `PostMergeValidation` AJV verdict), and `classification` (the derived `BinderArgsClassification` the binder path actually routes on). The sole production call site, `production-theta-producer.ts#mergeDeclaredDefaults`, destructures the result into its own local `MergedDeclaredDefaults` type, which carries only `args`, `classification`, and `defaultedWireNames` — `validation` is dropped at that boundary and never reaches any further production code.

## Evidence
`src/binder/defaulting.ts:68-89` — the four-field result type, with `validation` declared as its own field distinct from `classification`:
```ts
export interface FillDefaultsResult {
  readonly args: Readonly<Record<string, unknown>>;
  readonly defaultedWireNames: readonly string[];
  readonly validation: PostMergeValidation;
  readonly classification: BinderArgsClassification;
}
```

`src/binder/defaulting.ts:157-177` — both `validation` and `classification` are populated on both return paths (the depth-breach early return sets `validation: { ok: false, errors: [] }`; the normal path sets `validation` to the compiled validator's raw verdict):
```ts
  const validation = input.validator.validate(merged);

  return {
    args: merged,
    defaultedWireNames,
    validation,
    classification: classifyBinderArgs({
      depth,
      ajvIssues: validation.ok ? [] : toValidationIssues(validation.errors),
    }),
  };
```

`src/extension/production-theta-producer.ts:862-866` — the production-side result type the sole caller narrows to, which has no `validation` member:
```ts
interface MergedDeclaredDefaults {
  readonly args: Readonly<Record<string, unknown>>;
  readonly classification: BinderArgsClassification;
  readonly defaultedWireNames: readonly string[];
}
```

`src/extension/production-theta-producer.ts:1699-1706` — the one production call site, which reads only three of the four fields off `result`:
```ts
    const result = fillDefaultsAndRevalidate({ binderArgs, defaults, validator });
    return {
      args: result.args,
      classification: result.classification,
      defaultedWireNames: result.defaultedWireNames,
    };
  }
```

Search: `grep -rn "fillDefaultsAndRevalidate" src/` returns exactly one production import/call site (production-theta-producer.ts:360,1699) plus the definition itself; no other production file calls it. `grep -rn "\.validation\b"` restricted to non-test files under `src/` returns no reads of a `.validation` member anywhere (the only reads of `result.validation` / `r.validation` / `PostMergeValidation` are in `tests/defaulting-post-merge-classification.test.ts`, `tests/defaulting-revalidation.test.ts`, and the `tests/helpers/spy-validator.ts` test helper).

## Why this is a problem
`validation` is computed on every call (a real AJV invocation via `input.validator.validate(merged)`, or the depth-breach synthetic value) and threaded all the way to the function's public return type, but the one production consumer discards it before it can reach any further code — the routing decision it might have fed (`merged.classification.kind !== "ok"`, production-theta-producer.ts:1272) is driven entirely by the already-derived `classification` field instead. The field is a live computation with no live reader.

## Suggested direction (non-binding, optional)
Confirm whether any planned consumer needs the raw AJV verdict distinct from the derived classification before deciding whether `validation` should be narrowed out of the production-facing surface.

## False-positive check
- `grep -rn "fillDefaultsAndRevalidate" src/ tests/` — one production caller (production-theta-producer.ts), remaining hits are the definition and doc-comment cross-references in unrelated modules (theta-composition-producer.ts, inbound-boundary.ts, wire-translation.ts) that only reference the function by name in prose, not by call.
- `grep -rn "\.validation\b" src/` (excluding defaulting.ts's own file) — no hits.
- `grep -rn "PostMergeValidation" src/ tests/` — used as a type only in defaulting.ts (declaration) and in three test files (`defaulting-post-merge-classification.test.ts`, `spy-validator.ts` helper); no production import.
- Confirmed `MergedDeclaredDefaults` (the production-side narrowed type) has no `validation` member, so the drop is structural, not incidental.
- Not a MUST-NOT witness pattern: the tests assert concrete validation values (`expect(result.validation).toEqual({ ok: true })`), not "was not called."

## Triage
verdict: false-positive — facts reproduce (one production caller drops `validation` at production-theta-producer.ts:1699-1706), but the field is NOT dead under the D2 rule: it has deliberate witness readers (defaulting-revalidation.test.ts:78 — cited by bug 0066's fix evidence as pinning "the verdict is surfaced by the leaf"; defaulting-post-merge-classification.test.ts:233,292,333,366; proto-named-schema-validator-enforcement.test.ts:734 bug-0212 cell E PRIMARY assert; inbound-boundary-binder-args.test.ts:285; inbound-union-arm-dispatch.test.ts:1223; proto-named-binder-write-sites.test.ts:307), is spec-anchored (module header "the verdict is surfaced", defaulting-system-note-echo.md#post-default-merge-ajv-validation), and carries a stated rationale for staying distinct from `classification` (breach arm's `{ ok: false, errors: [] }` records AJV-not-asked); bug 0066 (94e81974) added `classification` alongside it, not in place of it (triage: claude-fable-5-1)
