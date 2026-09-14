---
id: PTQ-0149
title: The isMap arm of renderNonScalarModeKind and renderNonScalarBindContextKind returns the same "object" their own fallback returns, so the test selects nothing
lens: D2                     # the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/parser/frontmatter.ts:565-570
  - src/parser/frontmatter.ts:583-588
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# The isMap arm of renderNonScalarModeKind and renderNonScalarBindContextKind returns the same "object" their own fallback returns, so the test selects nothing

## Observation
Both helpers map a non-scalar YAML value node onto a bounded kind token for a
diagnostic's `<value>` placeholder. Each has four exits: `null`/`undefined` →
`"null"`, `isSeq` → `"array"`, `isMap` → `"object"`, and a fall-through →
`"object"`. The last two produce the identical string, so `isMap(node)` decides
nothing — every input that reaches it leaves with `"object"` whichever way the
test goes. Each function's own doc comment states this outcome explicitly ("a
mapping is `object` … Any other non-scalar node (an alias) falls back to
`object`").

## Evidence
src/parser/frontmatter.ts:565-570 — the `mode:` helper:

```ts
function renderNonScalarModeKind(node: unknown): string {
  if (node === null || node === undefined) return "null";
  if (isSeq(node)) return "array";
  if (isMap(node)) return "object";
  return "object";
}
```

src/parser/frontmatter.ts:583-588 — the `bind_context:` / `bind_echo:` helper,
the same shape:

```ts
function renderNonScalarBindContextKind(node: unknown): string {
  if (node === null || node === undefined) return "null";
  if (isSeq(node)) return "array";
  if (isMap(node)) return "object";
  return "object";
}
```

src/parser/frontmatter.ts:561-563 — the first helper's own doc, stating that
the two arms coincide:

```ts
 * token. Any other non-scalar node (an alias) falls back to `object`: the field
 * contract pins no token for it, and the only observable is that the value is
 * present-but-neither-recognised-mode.
```

src/parser/frontmatter.ts:579-581 — the second helper's doc, the same
statement:

```ts
 * token as bare `bind_context:`. Any other non-scalar node (an alias) falls
 * back to `object`: the field contract pins no token for it and the only
 * observable is that the value is present-but-neither-recognised.
```

Mechanical proof: for any `node` reaching line 568 (resp. 586), the function
returns `"object"` when `isMap(node)` is true (line 568/586) and `"object"`
when it is false (line 569/587). There is no input for which the two lines
differ, so line 568 and line 586 are extensionally no-ops.

## Why this is a problem
Dead branch: a predicate whose true and false arms yield identical results
selects nothing, and the guard exists only to be read as though it did. Both
copies are already documented as collapsing to one token, so the test carries
no information a reader can act on and no behaviour a caller can observe. The
`isMap` import is not at stake — `isMap` is used for real decisions elsewhere
in the module (e.g. frontmatter.ts:535 inside `paramValueCanCarryType`,
frontmatter.ts:1566 `!isMap(paramsNode)`, frontmatter.ts:1762 `isMap(doc.contents)`), so this is about the two inert tests
alone.

## Suggested direction (non-binding, optional)
The mapping and alias cases already share one token; the helper's exits can
state that directly, leaving `null` and `array` as the only discriminated
arms.

## False-positive check
- Both functions read in full (frontmatter.ts:565-570 and :583-588): the
  `isMap` arm and the fall-through are the last two statements of each body,
  with no code between them and no other return.
- Callers: `grep -n "renderNonScalarModeKind\|renderNonScalarBindContextKind"
  src/parser/frontmatter.ts` → declarations at 565/583 and call sites at 1844
  (`mode:` arm), 1913 (`bind_echo:` arm) and 1935 (`bind_context:` arm). Every
  call site consumes the returned string as a message token; none branches on
  which arm produced it.
- Cross-tree references: `grep -rn "renderNonScalarModeKind\|renderNonScalarBindContextKind"
  src/ extensions/ tools/ tests/` → hits only inside
  src/parser/frontmatter.ts; both functions are module-private (no `export`),
  so no re-export, barrel, or string-keyed access can reach them.
- `isMap` semantics: imported from the `yaml` package
  (src/parser/frontmatter.ts:24-32) as a type guard returning `boolean`; it has
  no side effect that the call could exist for. The other `isMap` uses in the
  module do discriminate (they gate early returns), so the import is not itself
  the subject.
- Not test-driven: no test asserts a difference between the mapping and alias
  cases — searching the two identifiers across `tests/` returns nothing, since
  the functions are unexported.

## Triage
verdict: confirmed — re-verified at 565-570/583-588: both arms return the identical literal "object", `isMap` (yaml) is a pure predicate and the narrowed node is never consumed, so the test provably discriminates nothing; spec placeholder-rendering-b.md:76 itself groups "`object` for a mapping or alias", and `git log -S` shows the arm born redundant in the 0296/0297 batch, with witness cells C (mapping) and G (alias) both expecting "object". (triage: claude-opus-5)
