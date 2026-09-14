---
id: PTQ-0180
title: parseFrontmatter's `"value" in toolLoopResult ? … : 25` and `"value" in respondRepairResult ? … : 3` fallback arms are unreachable — the comment directly above them states that both results carry a `value` at that point, and the `if (!registered) return` above it is what guarantees it
lens: D2
status: fixed
verdict: confirmed
locations:
  - src/parser/frontmatter.ts:2376-2391
  - src/parser/frontmatter.ts:2107-2128
  - src/parser/frontmatter.ts:771-779
  - src/parser/frontmatter.ts:794-796
sites: 2
fix_scope: localized
wave: qw20260910054544
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-10
---

# parseFrontmatter's `"value" in toolLoopResult ? … : 25` and `"value" in respondRepairResult ? … : 3` fallback arms are unreachable — the comment directly above them states that both results carry a `value` at that point, and the `if (!registered) return` above it is what guarantees it

## Observation
`resolveNonNegIntBlock` returns either `{ value }` or `{ diagnostic }`, where
the diagnostic is always `severity: "error"`. `parseFrontmatter` calls it for
`tool_loop` and `respond_repair`, pushes any `diagnostic` into `diagnostics`,
later computes `registered` as "no error-severity diagnostic", and returns
early when `registered` is false. The `ParsedToolLoop` / `ParsedRespondRepair`
records are built only after that early return, each with a ternary whose
false arm re-supplies the default (`25`, `3`) already passed to the helper as
`defaultValue`. The comment immediately above the ternaries says the false arm
cannot occur. The sibling invariant on the same lines (`modeValue` defined) is
expressed with a cast (`modeValue as ThetaMode`), not a fallback.

## Evidence
src/parser/frontmatter.ts:771-779 — the helper's return union:

```ts
function resolveNonNegIntBlock(
  blockNode: Node | null | undefined,
  subKey: string,
  dottedKey: string,
  defaultValue: number,
  file: string,
  lineCounter: LineCounter,
  lineOffset: number,
): { value: number } | { diagnostic: Diagnostic } {
```

src/parser/frontmatter.ts:794-796 — the `diagnostic` arm's severity (the only
`diagnostic` return in the function):

```ts
  return {
    diagnostic: {
      severity: "error",
```

src/parser/frontmatter.ts:2107-2128 — the two calls (with defaults `25` and
`3`) and the pushes of their diagnostics:

```ts
  const toolLoopResult = resolveNonNegIntBlock(
    toolLoopNode,
    "max_rounds",
    "tool_loop.max_rounds",
    25,
    file,
    lineCounter,
    lineOffset,
  );
  const respondRepairResult = resolveNonNegIntBlock(
    respondRepairNode,
    "attempts",
    "respond_repair.attempts",
    3,
    file,
    lineCounter,
    lineOffset,
  );
  if ("diagnostic" in toolLoopResult) {
    diagnostics.push(toolLoopResult.diagnostic);
  }
  if ("diagnostic" in respondRepairResult) {
    diagnostics.push(respondRepairResult.diagnostic);
  }
```

src/parser/frontmatter.ts:2376-2391 — the early return, the comment stating
the invariant, and the two ternaries whose false arms it rules out:

```ts
  const registered = !diagnostics.some((d) => d.severity === "error");
  if (!registered) {
    return { registered: false, paramFields: fieldInputs, diagnostics };
  }

  // `modeValue` is defined here: a missing `mode:` is an error, which would have
  // set `registered` to `false` above. An out-of-range `tool_loop` /
  // `respond_repair` value also unsets `registered`, so both results carry a
  // `value` here.
  const toolLoop: ParsedToolLoop = {
    maxRounds: "value" in toolLoopResult ? toolLoopResult.value : 25,
  };
  const respondRepair: ParsedRespondRepair = {
    attempts: "value" in respondRepairResult ? respondRepairResult.value : 3,
  };
```

Mechanical proof: a `{ diagnostic }` result has `severity: "error"` (:796),
is pushed at :2126/:2129, makes `registered` false at :2376, and exits at
:2378. Control reaches :2387/:2390 only when neither result was a
`{ diagnostic }`, i.e. both are `{ value }`, so `"value" in …` is `true` at
both sites and `: 25` / `: 3` are never evaluated.

## Why this is a problem
Unreachable branch, stated as such by the code's own comment. The false arms
carry a second copy of each default (`25`, `3`) that the helper already
received as `defaultValue` (:2111, :2120) — a constant kept in two places
where one of the two can never be read. Blame: the comment and the ternaries
were introduced together in dcbc5d72 (V6e, 2026-07-01), i.e. the fallback was
written already known to be unreachable; the early return at :2377-2378 dates
from 4843d586 (V6a) and predates it. The adjacent `mode: modeValue as ThetaMode`
(:2393) handles its identical "guaranteed by the early return" invariant with
a narrowing assertion instead of a shadow default, so the file expresses the
same invariant two different ways within eight lines.

## Suggested direction (non-binding, optional)
Express the invariant once — either narrow the two results the way `modeValue`
is narrowed, or split the helper's success/failure so the value is in hand
before the early return — so the defaults live only at the `defaultValue`
arguments. The fix stage owns the shape.

## False-positive check
- Severity of the helper's failure: `resolveNonNegIntBlock` has exactly one
  `return { diagnostic: … }` (:794-805) and it is `severity: "error"`; the
  other returns (:781, :787 `{ value: defaultValue }`, :791 `{ value: raw }`) all carry `value`. No path yields
  a warning-severity diagnostic that would leave `registered` true with no
  `value`.
- Nothing between :2129 and :2376 reassigns `toolLoopResult` /
  `respondRepairResult` (`grep -n "toolLoopResult\|respondRepairResult" src/parser/frontmatter.ts`
  → :2107, :2125-2126, :2387 and :2116, :2128-2129, :2390 only) and both are
  `const`.
- Nothing removes entries from `diagnostics` between the pushes and :2376
  (`grep -n "diagnostics\.\(splice\|pop\|shift\|length =\)\|diagnostics = " src/parser/frontmatter.ts`
  → no hits inside `parseFrontmatter`).
- Not test-only-reachable: the arms are unreachable for every input; tests
  cannot exercise them either.
- Not a duplicate: no filed finding cites frontmatter.ts:2376-2391; PTQ-0120
  (parseParams double call) cites :2270-2297.

## Triage
verdict: confirmed — every excerpt byte-matches (:771-779, :794-806, :2107-2130, :2377-2391) and the proof reproduces independently: `resolveNonNegIntBlock` has exactly one `{ diagnostic }` return and it is `severity: "error"`, both result bindings are `const` with only the cited 8 references, `diagnostics` is a single `const` array (:1742) with no splice/pop/filter/reassign/`.severity =` anywhere in the file, so a `{ diagnostic }` result always trips `registered` at :2377 and exits at :2379 before the ternaries — the `: 25` / `: 3` arms cannot execute for any input; blame confirms dcbc5d72 (V6e, 2026-07-01) added the "both results carry a `value` here" comment and the ternaries in one hunk atop 4843d586's (V6a) early return, and `modeValue as ThetaMode` at :2393 already expresses the identical early-return invariant as a narrowing assertion; in-scope D2 dead-arm-with-shadow-default cruft in src/, not test-only, no filed issue cites :2376-2391 (sibling d2-07 targets :780-782 for a different root cause) (triage: claude-opus-5)
