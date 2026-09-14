---
id: PTQ-0309
title: collectProvableArgTypes's array-arm comment says its exactness guarantee matters to two checkCompatible consumers, but a third was added by a later commit
lens: D2                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/invoke-static-checks.ts:705-713
  - src/extension/invoke-static-checks.ts:1537-1541
  - src/extension/invoke-static-checks.ts:1639-1650
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260914060226
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-14
---

# collectProvableArgTypes's array-arm comment says its exactness guarantee matters to two checkCompatible consumers, but a third was added by a later commit

## Observation
`collectProvableArgTypes`'s `"array"` case carries a comment explaining why
that arm must be exactness-tested rather than trusting the type-inference
pass's own reduction: it names exactly two consumers — "the invoke and
`.theta`-callable arms" — as the ones that "compare `CompatType`s through
`checkCompatible`" and would therefore wrongly accept an undecidable case as
decidable if the arm were not exact. `git blame` attributes this comment to
commit `8762eb7f9` (bug 0146, 2026-08-23). A later commit, `54dd6c1e` (bug
0138, still 2026-08-23 but after `8762eb7f9` in the file's own history), added
`checkImportedFnCallArgs` to this same file — a third function whose own doc
comment states it "reuses `collectProvableArgTypes`'s every-member-incompatible
SET discipline… unchanged from the invoke / `.theta`-callable routes above,"
and whose body does exactly what the array-arm comment describes: it collects
an argument's value-type set via `collectProvableArgTypes` and decides each
member's fate by calling `checkCompatible` against a declared parameter type.

## Evidence
src/extension/invoke-static-checks.ts:705-713 (the array-arm comment, naming
exactly two `checkCompatible`-based consumers):
```ts
    case "array": {
      // The Pi-tool arm's own bail is untouched by this arm: `subsetKinds`
      // (../runtime/tool-call.ts) admits no `array<…>` kind, so that consumer
      // still proves nothing from an array member and stands down on its own
      // "an unrepresentable arm makes the whole union unprovable" rule whatever
      // this arm answers. The invoke and `.theta`-callable arms compare
      // `CompatType`s through `checkCompatible` instead, which decides
      // `array<string> ⋢ string` — so for those two consumers an unconditional
      // bail withheld a decidable case, not an undecidable one.
```

src/extension/invoke-static-checks.ts:1537-1541 (`checkImportedFnCallArgs`'s
own doc, added by a later commit, naming the identical mechanism as shared):
```ts
 * than resolving against the wrong file. The ARGUMENT side reuses
 * `collectProvableArgTypes`'s every-member-incompatible SET discipline over
 * the IMPORTING file's own `TypeEnv` / `StaticTypeInferencePass`, unchanged
 * from the invoke / `.theta`-callable routes above, and the parser's own
 * `checkFnArgCompat` emits, also unchanged.
```

src/extension/invoke-static-checks.ts:1639-1650 (`checkImportedFnCallArgs`'s
body: the same collect-then-`checkCompatible` pattern the array-arm comment
describes, run over `argType`s that can carry `kind: "array"`):
```ts
      const argExpr = call.args[i] as Expr;
      const argTypes = collectProvableArgTypes(argExpr, importerEnv, importerPass);
      if (argTypes === undefined) {
        // A value-contributing position past the parser's static view defers
        // to no runtime AJV net (this position registers none) — see this
        // file's `collectProvableArgTypes` doc comment.
        continue;
      }
      const everyMemberRefused = argTypes.every((argType) => {
        const verdict = checkCompatible(argType, paramType, libraryEnv);
        return verdict !== "compatible" && verdict !== "unknown";
      });
      if (!everyMemberRefused) {
```

`git blame -L 705,713` attributes the array-arm comment to `8762eb7f9`
("fix(bug-0146): invoke-arg provable set gains the array arm — v0.228.0").
`git log --oneline -- src/extension/invoke-static-checks.ts` places
`54dd6c1e` ("fix(bug-0138): imported-thetalib fn calls statically checked —
v0.235.0"), the commit that added `checkImportedFnCallArgs`, later in the
file's history than `8762eb7f9`.

## Why this is a problem
The array-arm comment's "so for those two consumers" is a closed count: it
distinguishes the Pi-tool arm (which does not need array exactness, because
`subsetKinds` admits no array kind at all) from "the invoke and
`.theta`-callable arms" (which do, because they route through
`checkCompatible`). `checkImportedFnCallArgs`'s own per-argument check —
added by a later commit to the same file — performs the identical
`collectProvableArgTypes` → `checkCompatible` sequence against a declared
parameter type, and its own doc comment says so directly ("unchanged from the
invoke / `.theta`-callable routes above"). A reader relying on the array-arm
comment's count to enumerate every place this exactness guarantee is
load-bearing would not learn that a third, same-file function also depends on
it.

## Suggested direction (non-binding, optional)
Extend the array-arm comment's enumeration to include the imported-`fn`-call
route (or reword it to state the property generically — "every consumer that
compares these types through `checkCompatible`" — instead of naming a fixed
count of two.

## False-positive check
`git blame -L 705,713 -- src/extension/invoke-static-checks.ts` → `8762eb7f9`,
2026-08-23. `git log --oneline -- src/extension/invoke-static-checks.ts`
places `54dd6c1e` (which added `checkImportedFnCallArgs`, confirmed via
`git show 54dd6c1e --stat` naming this file) after `8762eb7f9` in the same
file's history. Confirmed `checkImportedFnCallArgs` is live: called once from
`import-static-checks.ts:1800` (`...checkImportedFnCallArgs(...)`), itself
reached from `checkThetaImports`, which `production-composition.ts` calls per
theta with imports — not a test-only caller. Confirmed the mechanism match by
reading `checkImportedFnCallArgs`'s body (:1639-1650, quoted above): it calls
`collectProvableArgTypes` then `checkCompatible` per collected member, the
same two-function sequence the array-arm comment describes for "the invoke
and `.theta`-callable arms." Considered whether `checkImportedFnCallArgs`
might be deliberately excluded because its "refused" test
(`verdict !== "compatible" && verdict !== "unknown"`) differs from the
invoke/`.theta`-callable arms' `=== "incompatible"` test: the difference is
in which `checkCompatible` verdicts count as a match, not in whether an
`array<…>` argument type is compared at all — `checkCompatible`'s dispatch on
`argType.kind === "array"` is exercised identically either way, so the
distinction does not change whether this consumer needs the same exactness
the array arm supplies. Not a duplicate: `grep -rl "array-arm\|collectProvableArgTypes"
quality/resolved quality/issues` turns up no filing about this comment's
consumer count.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — every excerpt and line number reproduces verbatim (705-713, 1537-1541, 1639-1650); git blame/log confirm 8762eb7f9 (12:28) predates 54dd6c1e (15:36, same day) in file history and that commit's diff never touches :705-713; checkImportedFnCallArgs is a live production consumer (import-static-checks.ts:1800 → checkThetaImports → production-composition.ts, not test-only) running the identical collectProvableArgTypes→checkCompatible sequence over CompatTypes that can carry kind:"array" (annotationToCompatType, type-layer-checks.ts:1004; checkCompatible's TYPE-7 array rule, type-compat.ts:~289), so the comment's closed "two consumers" count is genuinely stale; distinct from PTQ-0296's fixed locations (576-579/592-595/743-747), which left this comment untouched, so not a duplicate (triage: claude-opus-5)
