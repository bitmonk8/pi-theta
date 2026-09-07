---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: "In all three stdlib member modules the dispatcher's doc comment sits stacked above the *_MEMBERS allow-list const while the dispatcher itself is undocumented"
lens: D2                     # the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending             # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/runtime/stdlib-array.ts:32-47
  - src/runtime/stdlib-object.ts:91-105
  - src/runtime/stdlib-string.ts:115-130
sites: 3                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# In all three stdlib member modules the dispatcher's doc comment sits stacked above the *_MEMBERS allow-list const while the dispatcher itself is undocumented

## Observation

Each of `stdlib-array.ts`, `stdlib-object.ts`, and `stdlib-string.ts` carries
two `/** … */` blocks stacked directly above its `*_MEMBERS` allow-list
constant. The first block in each stack describes the module's
`evaluate*Member` runtime dispatcher ("Evaluate a … standard-library member on
`receiver` … with the arguments already evaluated by the V3a interpreter"),
not the constant it precedes. The dispatcher declarations themselves
(`evaluateArrayMember` at stdlib-array.ts:77, `evaluateObjectMember` at
stdlib-object.ts:125, `evaluateStringMember` at stdlib-string.ts:167) have no
attached doc block — each directly follows the closing `]);` of its
`*_MEMBER_SIGNATURES` map.

## Evidence

src/runtime/stdlib-array.ts:32-47 — the stranded dispatcher doc (note the
dangling empty ` *` line at 39, an edit scar) stacked above `ARRAY_MEMBERS`:

```ts
/**
 * Evaluate an `array<T>` standard-library member on `receiver`: the `length`
 * property (called with `args === []`) or one of the method calls (`join` /
 * `includes` / `indexOf` / `slice` / `concat`), with the arguments already evaluated by
 * the V3a interpreter. Returns the member's theta value per the expressions.md
 * stdlib table (`includes` / `indexOf` use the V2c `valuesEqual` structural
 * equality; `slice` follows JS semantics).
 *
 */
/**
 * The `array<T>` standard-library member surface (expressions.md §"Built-in
 * methods and properties"): the allow-list the `type`-phase
 * `theta/parse/unknown-method` check consumes. Kept in lockstep with the
 * `evaluateArrayMember` dispatcher below.
 */
export const ARRAY_MEMBERS: ReadonlySet<string> = new Set([
```

src/runtime/stdlib-array.ts:75-77 — the described dispatcher, undocumented:

```ts
]);

export function evaluateArrayMember(
```

src/runtime/stdlib-object.ts:91-105 — same shape:

```ts
/**
 * Evaluate an `object` standard-library member on `receiver`: one of the method
 * calls `keys()` / `values()` / `has(k)`, with the arguments already evaluated
 * by the V3a interpreter. Returns the member's theta value per the expressions.md
 * stdlib table (`keys()` / `values()` follow the object's key order; `has(k)`
 * returns `false` for an unknown key without panic).
 */
/**
 * The `object` standard-library member surface (expressions.md §"Built-in
 * methods and properties"): the allow-list the `type`-phase
 * `theta/parse/unknown-method` check consumes. Kept in lockstep with the
 * `evaluateObjectMember` dispatcher below. Object *field* access (`obj.field`)
 * is not a stdlib member and is not gated by this set.
 */
export const OBJECT_MEMBERS: ReadonlySet<string> = new Set(["keys", "values", "has"]);
```

src/runtime/stdlib-string.ts:115-130 — same shape:

```ts
/**
 * Evaluate a `string` standard-library member on `receiver`: the `length`
 * property (called with `args === []`) or one of the method calls
 * (`toLowerCase` / `toUpperCase` / `trim` / `startsWith` / `endsWith` /
 * `includes` / `split` / `replace`), with the arguments already evaluated by
 * the V3a interpreter. Returns the member's theta value per the expressions.md
 * stdlib table and the normative `replace` reference vectors.
 */
/**
 * The `string` standard-library member surface (expressions.md §"Built-in
 * methods and properties"): the allow-list the `type`-phase
 * `theta/parse/unknown-method` check consumes. Kept in lockstep with the
 * `evaluateStringMember` dispatcher below — every name the dispatcher accepts
 * appears here, and no other.
 */
export const STRING_MEMBERS: ReadonlySet<string> = new Set([
```

Undocumented dispatcher declarations: `grep -n "export function
evaluateObjectMember" src/runtime/stdlib-object.ts` → 125 (directly after
`OBJECT_MEMBER_SIGNATURES`'s `]);`); `grep -n "export function
evaluateStringMember" src/runtime/stdlib-string.ts` → 167 (directly after
`STRING_MEMBER_SIGNATURES`'s `]);`).

## Why this is a problem

Leftover narration detached from its subject — the same insertion-detachment
mechanism at three sites. Git shows the dispatcher docs predate the constants:
the docs landed with the V3f-T/V3g-T/V3h-T seam commits (`3233b435`,
`c7eb9fa1`, `a786706d`), and `git log -S "export const ARRAY_MEMBERS"` /
`"export const STRING_MEMBERS"` / `"export const OBJECT_MEMBERS"` each shows a
single insertion commit, `d23c22be` ("test+fix: end-to-end spec-conformance
campaign"), which put the allow-list const between each doc and its subject.
In the position each stranded block now occupies, a reader or doc tool
attributes the dispatcher's contract ("with the arguments already evaluated by
the V3a interpreter", the `replace` reference-vector obligation) to a
`ReadonlySet` constant it does not describe, while the three exported
dispatchers — the modules' central functions — read as undocumented.

## Suggested direction (non-binding, optional)

Reattach each first block to its dispatcher declaration
(`evaluateArrayMember`, `evaluateObjectMember`, `evaluateStringMember`) and
drop the dangling empty continuation line in the array copy.

## False-positive check

- Content check: each stranded block's member list matches its dispatcher's
  `switch` arms exactly (array: length/join/includes/indexOf/slice/concat;
  object: keys/values/has; string: length + the eight methods), not the
  constant it precedes — the constants carry their own correct second block.
- Stacked-block tooling: no jsdoc generator or lint rule consumes stacked
  leading blocks (package scripts and eslint config carry no jsdoc tooling),
  so the first block serves no tool.
- Git intent: dispatcher docs authored in the V3f-T/V3g-T/V3h-T commits;
  `d23c22be` inserted all three `*_MEMBERS` constants between doc and subject
  — insertion-detachment, not deliberate re-attribution.
- Duplicate check: the already-filed
  `qw20260907130901-d2-06-detached-doc-comments.md` covers three sites in
  src/extension/production-theta-producer.ts only; none of these three stdlib
  sites is cited there, and the insertion commit differs.
- Deadness/behaviour: nothing behavioural is claimed; the dispatchers and
  constants are all alive (src callers: statement-executor.ts,
  production-theta-producer.ts, parser type-layer checks).

## Triage

