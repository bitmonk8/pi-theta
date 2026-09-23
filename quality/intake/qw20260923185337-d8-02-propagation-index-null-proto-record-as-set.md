---
id: pending
title: structural-checks' PropagationIndex hand-rolls a string set as a null-prototype Record<string, true> read through Object.hasOwn, guarding a prototype-key hazard that its code-composed keys cannot reach
lens: D8
status: intake
verdict: pending
locations:
  - src/parser/structural-checks.ts:149-188
  - src/parser/structural-checks.ts:98
  - src/parser/query-schema-resolve.ts:88-91
sites: 1
fix_scope: localized
d8_class: reimplemented
d8_host: src/parser/structural-checks.ts#indexQueryPropagations
wave: qw20260923185337
reported_by: lens-d8-simplification (anthropic/claude-opus-5-5)
date: 2026-09-23
---

# structural-checks' PropagationIndex hand-rolls a string set as a null-prototype Record<string, true> read through Object.hasOwn, guarding a prototype-key hazard that its code-composed keys cannot reach

## Observation
`indexQueryPropagations` turns QRY-2's propagation report into a membership index
keyed by a composed capture-identity string. It builds a `Record<string, true>`
with `Object.create(null)`, so every value is the constant `true`, and the only
read, `propagatedToQuery`, tests membership with `Object.hasOwn`. The type alias
and its doc comment justify both guards as protection against an
`Object.prototype` name answering for an unwritten capture. Every key is built by
`propagationKey` from a closed code-side kind union, an integer index and four
integers, so no key can spell a prototype member. The same function already uses
`Set<string>` for the file's other two name indexes (`fnNames`, `typeNames`).

## Evidence
The hand-rolled set. src/parser/structural-checks.ts:149-155, 172-176, 185-187:
```
/**
 * The propagating captures, keyed by capture identity. Null-prototyped: the key
 * is composed from a capture kind and a source range, and every read is
 * own-key-guarded (`propagatedToQuery`), so no `Object.prototype` name can
 * answer for a capture no propagation wrote.
 */
type PropagationIndex = Readonly<Record<string, true>>;
...
  const index: Record<string, true> = Object.create(null) as Record<string, true>;
  for (const propagation of propagations) {
    index[propagationKey(propagation.capture)] = true;
  }
  return index;
...
  const key = propagationKey(capture);
  return Object.hasOwn(refs.queryPropagations, key);
```

The key shape. src/parser/structural-checks.ts:145-146, 163-165:
```
  return `${range.start.line}:${range.start.column}-${range.end.line}:${range.end.column}`;
...
function propagationKey(capture: PropagationCapture): string {
  const position = capture.kind === "fn-param" ? `#${capture.paramIndex}` : "";
  return `${capture.kind}${position}@${rangeKey(capture.range)}`;
```
`capture.kind` is the closed union at src/parser/query-schema-resolve.ts:88-91
(`"let" | "fn-return" | "fn-param"`), so every key has the form
`<kind>[#<n>]@<l>:<c>-<l>:<c>`. It always contains `@`, which no
`Object.prototype` member name does.

The facility being reimplemented: ECMAScript `Set.prototype.add` /
`Set.prototype.has` (ES2015 built-in), used two statements away in the same
caller. src/parser/structural-checks.ts:296, 317:
```
  const fnNames = new Set<string>();
...
  const typeNames = new Set<string>([
```

Feature-for-feature, against what the call sites need:

| need at the sites | `Record` + guards (today) | `Set<string>` |
|---|---|---|
| insert a key (1 site, :174) | `index[k] = true` | `add(k)` |
| test membership (1 site, :187) | `Object.hasOwn(index, k)` | `has(k)` |
| stored value | constant `true`, never read | none |
| no inherited key answers | needs `Object.create(null)` **and** `Object.hasOwn` | inherent |
| read-only view on `StructuralRefs` (:98) | `Readonly<Record<…>>` | `ReadonlySet<string>`, as the neighbouring `typeNames` field (:86) already uses |

Nothing reads it as a record: no enumeration, no serialisation, no value read.
`grep -rn "queryPropagations\|PropagationIndex" src/` finds only these
structural-checks.ts sites plus theta-document.ts:327,341, which pass the raw
`QueryPropagation[]` array, not the index.

## Why this is a problem
Two defensive mechanisms (the null prototype and the own-key read) and a
five-line doc comment exist only to neutralise a hazard that comes from choosing
a plain object as a set. The key shape cannot trigger that hazard anyway, so the
comment's premise (a prototype name could answer) is false for this index.
`Set<string>` is the built-in for exactly this job, is already what the same
function uses for its other name indexes, and has neither hazard to guard.

## Suggested direction (non-binding, optional)
Unproven hypothesis: make `PropagationIndex` a `ReadonlySet<string>` built with
`new Set(propagations.map((p) => propagationKey(p.capture)))` and read with
`.has(key)`, and drop the null-prototype rationale from the comment.

## False-positive check
- D2 precedents: the declarations are live (built at :328; read at :243, :269,
  :448 through `propagatedToQuery`), so this is not a dead-code claim. Neither
  guard is a spec-named enumeration or a MUST-NOT witness seam. The stated
  rationale (the prototype-key hazard) is shown false by the key composition
  above.
- Spec / bug-doc check: bug 0262's shipped-summary line (commit 76489c61)
  *describes* "a null-prototyped index … through `Object.hasOwn`". It records
  the implementation. It does not mandate it: clause (iv)(2) requires only that
  the withhold agree exactly with QRY-2's reported propagation set, and a `Set`
  keeps that agreement unchanged. No docs/spec_topics clause names the index
  representation.
- Test reach: no test imports `PropagationIndex`, `indexQueryPropagations` or
  `propagatedToQuery` (all are module-private; map importers 0/0).
- Exemption check: no D8 exemption on this host. PTQ-1232 (resolved,
  hasOwn-reimplements-Object.hasOwn) and PTQ-1263 (structural-checks D9
  breakdown) are different claims. No intake file names this index.

## Triage
verdict: questionable — accounting verified; the simpler shape is a design decision for a human ruling: the null-prototype `Record<string, true>` is at structural-checks.ts:149-155/172-176 with `Object.hasOwn` as its only read (:187), the type is on `StructuralRefs` at :98, and it is built once (:328) and read through `propagatedToQuery` at :243/:269/:448. Keys come from the closed `let|fn-return|fn-param` union (query-schema-resolve.ts:88-91) and always contain `@`, so no `Object.prototype` name can match one. The same function builds `fnNames` and `typeNames` as `Set<string>` (:296/:317), and nothing enumerates, serialises or reads a value from the index. It has no D8 exemption and no duplicate filing. No docs/spec_topics clause names the index representation; bug 0262:509 describes the implementation but does not require it. (triage: claude-opus-5-5)
verdict: questionable — accounting verified; the simpler shape is a design decision for a human ruling: the null-prototype `Record<string, true>` with `Object.hasOwn` as its only read is real (structural-checks.ts:149-155, 169-176, 185-187); it is built once at :328 and read only through `propagatedToQuery` (:243, :269, :448). Keys come from `propagationKey` over the closed `let|fn-return|fn-param` union (query-schema-resolve.ts:88-91) and always contain `@`, so no Object.prototype name can match. `Set` add/has covers every cited need, including a ReadonlySet view like `typeNames` (:86), and the same function uses `Set<string>` at :296/:317. Grep across src/extensions/tools/tests finds no other reader (only theta-document.ts:327/341 passing the raw array, plus a comment in the b0274 test). There is no D8 exemption in quality/exemptions.json and no duplicate filing (PTQ-0006, PTQ-1232 and PTQ-1263 are different claims). (triage: claude-opus-5-5)
