---
id: pending
title: rebuildInbound re-tests `pointer === ""` at the rename lookup after the guard four lines above has already returned for every non-root pointer
lens: D2
status: intake
verdict: pending
locations:
  - src/runtime/wire-translation.ts:365-378
  - src/runtime/wire-translation.ts:404-408
sites: 1
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# rebuildInbound re-tests `pointer === ""` at the rename lookup after the guard four lines above has already returned for every non-root pointer

## Observation
`rebuildInbound` takes `pointer: string` and never reassigns it. At line 365 it
returns early whenever `sidecar === undefined || pointer !== ""`, so every
statement after that guard runs only with `pointer === ""`. Line 408 then
builds `thetaKey` through a ternary on `pointer === ""`, whose false arm
(`wireKey`, the un-renamed key) cannot be selected, and carries a four-line
comment justifying the deeper-position case the guard already excluded. The
same module's `orderedEntries` doc-comment states the opposite discipline for
itself: it says the guard makes the fragment-root scoping "structural" and that
it therefore "adds no redundant check of its own".

## Evidence
src/runtime/wire-translation.ts:318-323 — `pointer` is a parameter; a grep for
`pointer` across the whole of `rebuildInbound` (lines 318-423) returns no
assignment, only reads and the recursive calls that pass a freshly built string:

```ts
function rebuildInbound(
  value: unknown,
  sidecar: SchemaSidecar | undefined,
  pointer: string,
  walk: InboundWalk,
): ThetaValue {
```

src/runtime/wire-translation.ts:365-378 — the guard that fixes `pointer` to
`""` for everything below it:

```ts
  if (sidecar === undefined || pointer !== "") {
    // A fresh record is worth building only where the sidecar has something to
    // say about this object's OWN fields — its fragment's root position. A
    // described nested object is entered there by construction: through the
    // `$ref`-target arm above, or through the name-match arm below, both of
    // which re-enter at the empty pointer under the target's own sidecar. Any
    // other position is one no sidecar keys — a union arm, a permissive `{}`,
    // an unresolved reference — so copying would add nothing and would discard
    // a brand the value already carries: an in-process callee's value arrives
    // theta-side and already branded, and both `schemaTagOf` consumers (the
    // QRY-18 outbound render's `as` renames, the `QuestionOperandDefectError`
    // summariser's schema name) degrade silently once the brand is gone.
    return value as ThetaValue;
  }
```

src/runtime/wire-translation.ts:404-408 — the re-test and its justification for
the excluded case:

```ts
    // The wire-name map describes the fragment's OWN fields, so it applies at
    // the fragment root and nowhere deeper: a value one or more `/items`
    // segments down, or behind an unresolved nested position, is not a field of
    // this schema and must not be re-keyed by its map.
    const thetaKey = pointer === "" ? (index?.wireToTheta.get(wireKey) ?? wireKey) : wireKey;
```

src/runtime/wire-translation.ts:522-526 — the module's own statement that the
scoping is already structural, written for the sibling helper reached from the
same block:

```
 * Reached only at the fragment root: the guard above this function's one call
 * site already returns for every `pointer !== ""` position (`rebuildInbound`'s
 * `sidecar === undefined || pointer !== ""` arm), so the fragment-root scoping
 * is structural and this function takes no `pointer` and adds no redundant
 * check of its own.
```

## Why this is a problem
Dead branch: the ternary's false arm at :408 is selected by no input, because
the only path that reaches :408 has already been filtered by the `pointer !==
""` return at :365 and `pointer` is not reassigned between them. The redundancy
is not a compiler-forced one (unlike the `index?.` optional chaining on the same
line, which TypeScript cannot narrow) — `pointer` is a plain `string` the guard
fully decides. The accompanying comment documents a condition the code cannot
be in, and the module already records the opposite convention for the helper
invoked two lines earlier, so the two adjacent statements state different rules
about the same guarantee.

## Suggested direction (non-binding, optional)
The scoping fact already has one statement of record in this function (the
:365 guard) and one restatement in `orderedEntries`' doc; a third form of it as
a runtime ternary is the one that can go stale independently.

## False-positive check
- Reference search for reassignment: `awk 'NR>=318 && NR<=423'
  src/runtime/wire-translation.ts | grep -n "pointer"` — 9 hits (:321 the
  parameter; :325 / :333 / :337 map reads; :346 the array recursion; :365 the
  guard; :370 comment text; :408 the ternary; :409 the field-pointer build); no
  `pointer =` anywhere in the function.
- Entry points into `rebuildInbound` checked (`grep -n "rebuildInbound"
  src/runtime/wire-translation.ts` — 3 call sites): `rebuildUnder` (:293, passes
  `""`), the array arm (:346, passes `${pointer}/items`), the field arm (:420,
  passes `fieldPointer`). Every non-empty-pointer entry hits the :365 return
  before :408 for a plain object, and returns earlier still for a non-object.
- Verified the ternary is not compiler-forced: `pointer` is typed `string`, not
  `string | undefined`; TypeScript narrows it from the :365 guard. The `index?.`
  chain on the same line IS compiler-forced (`index` is a separate `const` that
  the `sidecar === undefined` narrowing does not reach) and is not part of this
  finding.
- Searched `src/`, `tests/`, `tools/`, `extensions/` for other callers of
  `rebuildInbound`: the function is module-private (`function rebuildInbound`,
  no `export`), so the three intra-module call sites at :293, :346 and :420 are
  exhaustive.
- Checked git history for intent: the `pointer === ""` scoping and the :365
  guard are both present in the current implementation; no comment records the
  ternary as a deliberate belt-and-braces re-check.

## Triage
