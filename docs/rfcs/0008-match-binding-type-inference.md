# RFC 0008 — Type match pattern bindings from the scrutinee

- **Status:** draft

## Summary

Static inference does not type `match` pattern variables: in
`let fs = match r { Ok(v) => v, Err(e) => [] }` the binding `fs` carries the
unresolved reference type `v`, so downstream code that needs a concrete type —
`for f in fs` — is rejected (`theta/parse/non-array-iterand: … got v`). This RFC
proposes binding pattern-variable types from the scrutinee's static type and
joining arm result types, so the dominant reduce idiom type-checks without
helper-function detours.

## Motivation

The `par for` reduce idiom the docs themselves teach — collect
`array<Result<T, QueryError>>`, then `match` each element after the loop — is
exactly where this gap lands. Reproduction (rejected today):

```theta
schema Item { id: string }
fn g(r: Result<array<Item>, QueryError>): integer {
  let fs = match r { Ok(v) => v, Err(e) => [] }
  let mut n = 0
  for f in fs { n = n + 1 }     // theta/parse/non-array-iterand: 'for' expects array<T> after 'in'; got v
  n
}
```

The scrutinee's type is fully known (`r: Result<array<Item>, QueryError>`), the
`Ok` payload is `array<Item>`, and both arms produce an `array` — yet the match
value types as the opaque pattern-variable name.

The workaround in circulation routes every match-extracted payload through a
typed-parameter helper so the *parameter annotation* supplies what inference
dropped:

```theta
fn count_of(fs: array<Item>): integer { … }   // exists only to re-type `v`
…
let fs = match r { Err(e) => [], Ok(v) => v }
total = total + count_of(fs)
```

Real fan-out thetas grow one such helper per payload shape (the pi-config
migration spikes carry `ids_of`/`count_of` pairs solely for this), and the
failure reads as a `for`-loop error two statements away from its cause. The gap
also compounds with bug 0004: the natural alternative — annotating the binding
(`let fs: array<Item> = match …`) — only papers over the join, not the arm
bodies, and pushes authors toward restructuring code around the type checker.

## Proposal

Two inference rules, both scoped to what is already statically known — no new
syntax, no runtime change (runtime values are what they always were; this is
type-checker precision):

1. **Pattern-variable typing.** When the scrutinee's static type is known, a
   pattern variable takes the type the pattern position implies:
   - `Ok(v)` against `Result<T, E>` → `v: T`; `Err(e)` → `e: E` (for
     `QueryError`, the existing variant-narrowing on
     `Err(QueryError { kind: "…" })` patterns is unchanged);
   - object/schema patterns bind fields at their declared field types;
   - array patterns bind elements at the element type;
   - literal and wildcard patterns bind nothing (unchanged).
   An unknown scrutinee type leaves the variable unresolved exactly as today —
   the rule only adds precision where the information exists.

2. **Arm-result join.** A `match` expression's static type is the join of its
   arm tail types: identical types join to themselves; a mix that includes
   unresolved arms degrades to unresolved (today's behaviour); otherwise the
   join is the union the type system already admits in annotations. The empty
   array literal `[]` joins with `array<T>` as `array<T>`.

With both rules, the motivation example types as written: `v: array<Item>`,
`[] ⊔ array<Item> = array<Item>`, `fs: array<Item>`, and the `for` iterand check
passes. Code that today routes through helper fns keeps working unchanged
(parameter annotations remain a valid way to state a type).

## Alternatives considered

- **Status quo + documented helper-fn idiom.** Works, but the idiom exists only
  to restate types the checker already saw; every reduce pays the tax and the
  diagnostic quality stays poor (`got v` names an author-invisible type).
- **Require binding annotations** (`let fs: array<Item> = match …`) and propagate
  top-down. Helps the binding site but does nothing for direct uses
  (`for f in match r { … } { … }`) and still rejects un-annotated arms; also a
  bigger checker change (bidirectional flow) than the two local rules above.
- **First-class `Result` combinators** (`unwrap_or`, `map_err`). New surface
  area, closed set of shapes, and contrary to the language's
  no-higher-order-functions posture; pattern typing solves the general case.

## Specification impact

- `docs/spec_topics/type-system.md` / `docs/reference/type-system.md`: add the
  pattern-binding and arm-join rules to the inference section.
- `docs/reference/grammar.md` §match: note that pattern variables are typed from
  the scrutinee where statically known.
- Diagnostics: no new codes; `theta/parse/non-array-iterand` and friends simply
  fire less often and, when they do, name concrete types.
- Fixtures: the motivation example verbatim; an unknown-scrutinee case pinning
  the unchanged degrade; a mixed-arm join case.

## Prior art in this repository

- The reduce-after-`par for` idiom this unblocks —
  `docs/how-to/fan-out-in-parallel.md`, `docs/examples/fan-out-reviews.theta`
  (its arms produce strings, which is why the published example does not trip
  the gap).
- Existing `Err(QueryError { kind: … })` variant narrowing —
  `docs/reference/errors-and-results.md`, `docs/examples/handle-error.theta`.
- The helper-fn workaround in the wild — pi-config
  `docs/theta-migration/phase0-spikes/spike-c-parfor.theta` (`ids_of`,
  `count_of`).
