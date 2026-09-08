---
id: PTQ-0102
title: jsonTypeOf in respond-tool-wire.ts ends in a two-arm conditional whose every arm returns the tested value itself — the expression is provably `return t`
lens: D2                     # the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/runtime/respond-tool-wire.ts:221-231
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# jsonTypeOf in respond-tool-wire.ts ends in a two-arm conditional whose every arm returns the tested value itself — the expression is provably `return t`

## Observation
`jsonTypeOf` maps a runtime value to "the JSON type ... in JSON-Schema
vocabulary". After the `null` and array special cases it computes
`const t = typeof value` and returns
`t === "object" ? "object" : t === "number" ? "number" : t`. Both conditional
arms return a string literal that is, by the very equality just tested, equal
to `t`; the fall-through returns `t`. Every path through the chain therefore
yields exactly `t` — the two tests and two literal arms select nothing.

## Evidence
src/runtime/respond-tool-wire.ts:221-231 — the whole function:

```ts
/** The JSON type of a runtime value, in JSON-Schema vocabulary. */
function jsonTypeOf(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  const t = typeof value;
  return t === "object" ? "object" : t === "number" ? "number" : t;
}
```

Mechanical proof of the no-op: when `t === "object"` the first arm returns
`"object"`, the value `t` was just proven equal to; when `t === "number"` the
second arm returns `"number"`, likewise equal to `t`; otherwise the expression
returns `t`. There is no input for which the chain returns anything other than
`t`, so line 230 is extensionally identical to `return t;`.

The function was authored in this exact shape in the module's introduction
commit (`git show 1bd9361a:src/runtime/respond-tool-wire.ts` shows the same
ternary), so no behaviour was ever removed from the arms — they never selected
anything.

## Why this is a problem
Dead structure: two branch tests and two literal arms whose selection is
provably indistinguishable from the fall-through — code that executes but can
never influence the result, the branch-level form of dead code. It also
mis-signals: sitting under the doc line "in JSON-Schema vocabulary", the
conditional reads as if it performs a typeof→JSON-Schema normalisation at
exactly the two named points, when in fact no mapping occurs anywhere in the
chain (a `"bigint"`, `"function"`, `"symbol"`, or `"undefined"` typeof — none
of them JSON-Schema vocabulary — passes through just as unmapped as `"object"`
and `"number"` do). A reader auditing the coercion path
(`admitted.includes(jsonTypeOf(parsed))` at :251 and the union-arm probe at
:280 in the same module) must decode the ternary only to discover it decides
nothing.

## Suggested direction (non-binding, optional)
Collapse line 230 to `return t;` (behaviour-identical by the proof above), or —
if a genuine vocabulary mapping was intended — let the fix stage decide what
the arms should have mapped; this finding claims only that the current arms map
nothing.

## False-positive check
- Semantics check: enumerated every `typeof` result reachable at line 230
  (`"string"`, `"number"`, `"bigint"`, `"boolean"`, `"symbol"`, `"undefined"`,
  `"object"`, `"function"`; `null` and arrays are intercepted above) — each
  yields the identical return value with and without the conditional.
- TypeScript-narrowing check: the declared return type is plain `string`; no
  literal-type narrowing or exhaustiveness obligation depends on the ternary
  (`tsc` accepts `return t;` in that position — the arms serve no type-level
  purpose).
- Caller check: `jsonTypeOf` is module-private with two callers
  (`parseStructuredString` at :251 and `coerceNode`'s union-arm probe at :280,
  both in this file); both consume the returned string via
  `admitted.includes(...)` / `armTypes.includes(...)`, so no caller
  distinguishes the arms either.
- Git intent: single-shape history — introduced verbatim in `1bd9361a`
  (bug 0028) and untouched since (`git log -S "jsonTypeOf"` over the file shows
  only that one commit), so the arms are not residue of a removed mapping; they
  never mapped.
- Duplicate check: no intake finding cites respond-tool-wire.ts (grep over
  quality/intake for the path — no hits).

## Triage
verdict: confirmed — reproduced at :221-231: every typeof category returns identically with and without the ternary (runtime enumeration, 0 differences), `tsc --strict` accepts the collapsed `return t`, and both in-file callers (:251, :280) consume the string via `.includes`, so the two tests and literal arms select nothing. (triage: claude-opus-5)
