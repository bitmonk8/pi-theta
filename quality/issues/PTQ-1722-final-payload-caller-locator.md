---
id: PTQ-1722
title: inferFinalValuePayload describes its caller as module-level below after the class extraction.
lens: D2
status: open
verdict: confirmed
locations:
  - src/parser/type-layer-walk.ts:952-961
  - src/parser/type-layer-checks.ts:431-442
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d2-cruft (openai/gpt-6.1-sol)
date: 2026-10-28
---

# inferFinalValuePayload describes its caller as module-level below after the class extraction.

## Observation
The documentation of `TypeLayerWalk.inferFinalValuePayload` identifies `inferCalleeReturnPayload` as a module-level function below it. That function is declared in `type-layer-checks.ts`, while the method and its documentation are in `type-layer-walk.ts`. The class extraction retained the former same-file locator.

## Evidence

`src/parser/type-layer-walk.ts:952-961`:
```ts
  /**
   * Infer a body's final-value payload — the tail/`return` LUB `resolveReturnType`
   * computes — without checking it against any annotation. `inferCalleeReturnPayload`
   * (module-level, below) is the sole caller: it runs this SAME resolution
   * `checkSubagentReturnAnnotation` uses for an in-file `subagent fn`, over a
   * whole parsed `.theta` body instead of one `fn`'s. The `site` passed to
   * `resolveReturnType` is a placeholder — its only consumer is a discarded
   * no-common-type diagnostic this call site never reads.
   */
  public inferFinalValuePayload(
```

The caller is instead at `src/parser/type-layer-checks.ts:431-442`:
```ts
export function inferCalleeReturnPayload(
  body: ThetaBody,
  file: string,
  paramsFields: readonly ParamsFieldSource[],
): CompatType | undefined {
  const { checker } = buildTypeLayerWalk(body, file, paramsFields);
  const payload = checker.inferFinalValuePayload(body, paramsFieldBindings(paramsFields));
  if (payload === undefined || containsNamedType(payload)) {
    return undefined;
  }
  return payload;
}
```

## Why this is a problem
Under the simplicity-and-cruft principle, a same-file locator retained after its target moves to a different module is stale implementation prose. Following “module-level, below” in `type-layer-walk.ts` cannot reach the caller whose declaration is quoted above. The finding does not challenge the method's public surface, its test callers, or the placeholder-range design.

## Suggested direction (non-binding, optional)
Describe the caller's current location rather than its former position beneath the class.

## False-positive check
- Ran `rg -n '\b(inferFinalValuePayload|inferCalleeReturnPayload)\b' src/ extensions/ tools/ tests/`: 31 matching lines. The method's comment is the only occurrence of `inferCalleeReturnPayload` in `type-layer-walk.ts`; the declaration and production method call are in `type-layer-checks.ts` as quoted above.
- Ran `rg -n '\.inferFinalValuePayload\(' src/ extensions/ tools/ tests/`: six matching lines, comprising the production call in `type-layer-checks.ts` and five test calls. Those test callers are legitimate; no deadness or removal claim is made. The finding is the wrong module locator, independent of whether “sole caller” is read as production-only.
- Ran `git blame -L 950,960 src/parser/type-layer-walk.ts` and `git log -3 --oneline -S 'class TypeLayerWalk' -- src/parser/type-layer-walk.ts src/parser/type-layer-checks.ts`: the class was extracted by `bd8e73b7`, retaining this documentation. The later helper extraction `33548129` left the quoted locator present, as confirmed with `git show 33548129^:src/parser/type-layer-walk.ts | grep -nE 'module-level, below|export function inferCalleeReturnPayload'` (the comment matches at 953; there is no function declaration match).
- PTQ-1248 concerns `letAnnotationToCompatType`'s caller comment, not this method. No current intake file found by `rg -n 'type-layer-provable|inferFinalValuePayload|inlineObjectFieldKeys' quality/intake --glob '*.md'` before filing covered this locator.

## Triage
verdict: confirmed — type-layer-walk.ts:955 still locates inferCalleeReturnPayload as “module-level, below”, but its declaration and production call are in type-layer-checks.ts:431-442; both excerpts, the 31-reference/six-call searches, and extraction history reproduce, and no existing finding tracks this stale locator. (triage: claude-opus-5-5)
