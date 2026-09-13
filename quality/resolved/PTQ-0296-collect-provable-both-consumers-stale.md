---
id: PTQ-0296
title: collectProvableArgTypes's doc comment still says "Both type checks" and "both consumers" consume its value-type set, though five call sites now do
lens: D2
status: fixed
verdict: confirmed
locations:
  - src/extension/invoke-static-checks.ts:576-579
  - src/extension/invoke-static-checks.ts:592-595
  - src/extension/invoke-static-checks.ts:743-747
  - src/extension/invoke-static-checks.ts:345
  - src/extension/invoke-static-checks.ts:846
  - src/extension/invoke-static-checks.ts:1259
  - src/extension/invoke-static-checks.ts:1416
  - src/extension/invoke-static-checks.ts:1630
sites: 8
fix_scope: localized
wave: qw20260913183958
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-13
---

# collectProvableArgTypes's doc comment still says "Both type checks" and "both consumers" consume its value-type set, though five call sites now do

## Observation
`collectProvableArgTypes`'s doc comment opens "Both type checks below reason
over this SET rather than over `StaticTypeInferencePass`'s single reduced
type" and later says "Keeping the whole value-type set in front of both
consumers is what lets ... the every-arm-incompatible test below decide these
expressions correctly"; a third mention inside the function's own body
("`ident` included: both consumers below read types with an EMPTY bindings
map") repeats the same count. `git blame` attributes all three passages to
one commit, 80fef716 (bug 0072, 2026-08-04), when the function had exactly
two callers: the `.theta`-callable per-argument check and the Pi-tool
schema-conflict check, both inside `checkInvokeStaticResolution`. Three more
call sites of `collectProvableArgTypes` have been added since, by three later
commits, none of which touched this text: `checkClauseCwdType` (RFC 0009,
96303cc3, 2026-09-09), `buildInvokeArgSlot` (bug 0137, a314ac83, 2026-08-05),
and `checkImportedFnCallArgs` (bug 0138, 54dd6c1e, 2026-08-23). All three read
the function's return value through the same every-member test the doc
describes.

## Evidence
src/extension/invoke-static-checks.ts:576-579 — the opening count claim:
```ts
 * The flat set of static types whose UNION covers every value `expr` can
 * evaluate to, or `undefined` when any value-contributing position is past the
 * parser's static view. Both type checks below reason over this SET rather than
 * over `StaticTypeInferencePass`'s single reduced type.
```

src/extension/invoke-static-checks.ts:592-595 — the second count claim, same
comment block:
```ts
 * Keeping the whole value-type set in front of both consumers is what lets
 * `subsetKinds`' "an unrepresentable arm makes the whole union unprovable" rule
 * (../runtime/tool-call.ts) and the every-arm-incompatible test below decide
 * these expressions correctly. The RENDERING stays on `displayType`, the
```

src/extension/invoke-static-checks.ts:743-747 — the third count claim, inside
the function's own `ident`/`member`/`call`/`invoke`/`query`/`object`/
`result-ctor`/`method-call` case arm:
```ts
      // Each types as a `named` nominal reference past the parser's static view
      // — the shape `checkCompatible` answers `unknown` for and the runtime AJV
      // net owns. `ident` included: both consumers below read types with an
      // EMPTY bindings map, so even a `let`-bound name is nominal here.
      return undefined;
```

The five current non-recursive call sites of `collectProvableArgTypes`
(`grep -n "collectProvableArgTypes(" src/extension/invoke-static-checks.ts`
finds these five plus the function's own internal recursive calls to itself
and to `collectArmUnion`; no sixth external call site exists in `src/`):

src/extension/invoke-static-checks.ts:345 — `checkClauseCwdType` (RFC 0009):
```ts
    const valueTypes = collectProvableArgTypes(field.value, input.typeEnv, input.typePass);
```

src/extension/invoke-static-checks.ts:846 — `buildInvokeArgSlot` (bug 0137):
```ts
  const argTypes = collectProvableArgTypes(argExpr, typeEnv, typePass);
```

src/extension/invoke-static-checks.ts:1259 — the `.theta`-callable
per-argument loop inside `checkInvokeStaticResolution` (bug 0072, one of the
original two):
```ts
        const argTypes = collectProvableArgTypes(argExpr, typeEnv, typePass);
```

src/extension/invoke-static-checks.ts:1416 — the Pi-tool schema-conflict loop
inside `checkInvokeStaticResolution` (bug 0072, the other original one):
```ts
          const fieldTypes = collectProvableArgTypes(objField.value, typeEnv, typePass);
```

src/extension/invoke-static-checks.ts:1630 — `checkImportedFnCallArgs` (bug
0138):
```ts
      const argTypes = collectProvableArgTypes(argExpr, importerEnv, importerPass);
```

`git blame -L 574,604` and `git blame -L 738,747` (both `src/extension/invoke-static-checks.ts`)
attribute every line to 80fef716. `git show a314ac83`, `git show 54dd6c1e`
and `git show 96303cc3` (each `-- src/extension/invoke-static-checks.ts`) add
one of the three newer call sites above apiece and touch no line of
:574-604 or :738-747.

## Why this is a problem
"Both" and "both consumers" are definite counts of two, stated three times in
and around one function's doc comment as the justification for its
SET-returning design (rather than a single reduced type). The function now
has five non-recursive call sites relying on exactly that
SET-over-single-type property — three of them added after this text was
written, by three separate commits, none of which revisited the count. A
reader who uses the doc comment to learn how many places depend on this
function's whole-set behaviour — precisely the property the comment argues
for — undercounts by three.

## Suggested direction (non-binding, optional)
Restate the count-bearing sentences without a fixed number of consumers (e.g.
"every per-argument check below" / "every consumer"), the same generalisation
already applied to this file's module header and to `checkInvokeStaticResolution`'s
own doc comment after their "Both"/"three" counts went stale (see the
False-positive check below).

## False-positive check
- Counted every non-recursive call site of `collectProvableArgTypes`:
  `grep -n "collectProvableArgTypes("` over the whole file returns the
  function's own two internal recursive call sites (within its own body and
  inside `collectArmUnion`) plus the five entry points cited above; no sixth
  external call site exists.
- `git blame -L 574,604 -- src/extension/invoke-static-checks.ts` and
  `git blame -L 738,747` both attribute every line to 80fef716 (2026-08-04,
  bug 0072); `git show a314ac83|54dd6c1e|96303cc3 --
  src/extension/invoke-static-checks.ts` each touch a different part of the
  file (the new call site itself, plus unrelated header text already fixed
  by prior waves) and none touch :574-604 or :738-747.
- Verified the three newer call sites genuinely rely on the described
  whole-SET property, not merely on the function's name: :345 and :846 both
  feed the result into an `argTypes.every((t) => checkCompatible(t, expected,
  env) === "incompatible")` test, the same shape the original :1259/:1265
  loop uses; :1630 feeds it into the structurally identical
  `argTypes.every((argType) => { const verdict = checkCompatible(...); return
  verdict !== "compatible" && verdict !== "unknown"; })`.
- Considered whether "both"/"both consumers" could be read as a stable,
  intentionally-scoped pair (e.g. "the two ORIGINAL bug-0072 checks" rather
  than "every consumer ever"): the sentences make no such scoping — each is
  phrased as an unqualified, present-tense count ("Both type checks below",
  "both consumers below"), the same phrasing this file's own module header
  and `checkInvokeStaticResolution`'s own doc comment used before being
  corrected from "Both"/"both" to "All three" (`quality/resolved/PTQ-0170`,
  `quality/resolved/PTQ-0178`) — this is the same pattern recurring at a doc
  comment those two fixes did not touch (their cited locations are
  :989-1028/:1046-1048 and
  :135-144/:1049-1052/:1065/:1223-1226/:1411-1412/:1449-1455/:27-28
  respectively; neither includes :574-604 or :738-747).
- Not a duplicate: `grep -rl "collectProvableArgTypes" quality/resolved
  quality/issues` returns no filing.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — every excerpt and line number reproduces verbatim, git blame confirms all three passages date to 80fef716 (2026-08-04) untouched since, and independently attributes the three later call sites (:345 to 96303cc3 RFC-0009, :846 to a314ac83 bug-0137, :1630 to 54dd6c1e bug-0138) each verified to consume the whole value-type set via the same every(...) test the doc describes, matching the file's own accepted precedent for this exact stale-count class (PTQ-0170, PTQ-0178) at non-overlapping locations, so not a duplicate (triage: claude-opus-5)
