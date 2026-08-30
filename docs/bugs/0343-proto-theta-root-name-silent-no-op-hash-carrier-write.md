# Bug 0343 — a callable whose derived/presented name is `__proto__` never marshals a closure-hash row: the write into the plain-object hash-carrier map is a silent no-op through the inherited `Object.prototype` setter, so the child admits that callable with no hash verification — `#subagent-theta-callable-hash`'s "whole callee file" window reopens for one degenerate name at both the root-row write (bug 0328) and the pre-existing `tools:`-entry write

- **Status:** open.
- **Sev/Diff estimate:** S3/D1 — S3 because triggering it requires an
  author-controlled name of exactly `__proto__` (a root file basename
  `__proto__.theta`, or a `tools:` entry presented as `__proto__`), an odd
  filename rather than an everyday one; but the consequence is the 0031/0038
  silent-verification-degradation class: the marshalled row is absent, the
  child never verifies that callable, and an edit to it between parent load
  and child spawn runs unvalidated with zero diagnostics — the exact
  failure mode RFC-0005 hash marshalling exists to close. Not S2: the bytes
  run are the author's own current file, and the odd basename is not
  attacker-supplied in the normal threat model. D1 because the remedy is a
  two-site swap to the repo's own null-prototype/own-key house helper
  (`defineRecordField`, already imported in the file), no logic change.
- **Kind:** defect — a record keyed by author-controlled strings written
  through a plain-object setter, missing the 0031/0038 null-prototype guard.
- **Related:**
  - [0328](./0328-root-callee-closure-hash-never-marshalled.md) (fixed,
    0.306.0) — added the root-row write this report finds is a no-op for the
    `__proto__` basename; its `## Fix` record names this exact residual and
    defers it. The `!Object.hasOwn` guard 0328 added lets the `__proto__`
    write be attempted, but the write itself no-ops on the plain object.
  - [0330](./0330-as-renamed-callable-spurious-hash-mismatch.md) (fixed,
    0.306.0) — its `## Fix` records this residual as NOT closed there: 0330 is
    child-side name-alignment only, its `byName` is a `Map` (immune to the
    inherited-setter no-op), and it does not touch the producer parent-side
    write.
  - [0329](./0329-hash-mismatch-refusal-does-not-refuse-invocation.md) (open)
    — owns invocation-level enforcement of a mismatch. Disjoint: this report
    is a parent-side marshalling no-op (no row is produced to enforce on),
    not a failure to enforce a produced mismatch.
  - [0331](./0331-theta-root-marshalling-flattens-source-priority.md) (open)
    — owns source-priority flattening of the marshalled root set. Disjoint
    from the map key-space no-op.
  - [0031](./0031-ctor-field-value-typing-unchecked.md) /
    [0038](./0038-typeenv-prototype-member-names-resolve-as-declared-types.md)
    (fixed) — the null-prototype / own-key-guard hazard class this site
    missed; the house helper `defineRecordField` (`src/runtime/value.ts:596`)
    was written for exactly these record-building sites.
- **Affected** (at 7ec6fd2f, v0.309.0):
  - `src/extension/production-theta-producer.ts:2066` — the carrier map is a
    plain object literal (`const callableHashes: Record<string, string> = {}`),
    which inherits `Object.prototype`'s `__proto__` accessor.
  - `src/extension/production-theta-producer.ts:2069` — the pre-existing
    `tools:`-entry write `callableHashes[entry.presentedName] = entry.closureHash`.
    When `entry.presentedName` is `__proto__` the assignment routes through the
    inherited setter and creates no own row.
  - `src/extension/production-theta-producer.ts:2082–2083` — the bug-0328
    root-row write `callableHashes[rootClosureHash.name] = rootClosureHash.hash`,
    guarded by `!Object.hasOwn(callableHashes, rootClosureHash.name)`. For
    `rootClosureHash.name === "__proto__"` the guard passes (no own key) and
    the write no-ops identically.
  - `src/extension/production-theta-producer.ts:2195–2198` — the carrier is
    emitted only when `Object.keys(callableHashes).length > 0`, else `undefined`;
    a root whose only callable is `__proto__` yields an empty map and no carrier.
  - `src/runtime/subagent-child-hash-verify.ts:143` — the child verifies only
    keys present in the marshalled map (`for (const [callableName, expected]
    of marshalled)`); an absent row is never iterated, so the callable is
    admitted with no hash check.
  - `src/runtime/subagent-child-hash-verify.ts:130–140`
    (`readMarshalledCallableHashes`) — returns `undefined` when the carrier is
    absent, yielding `active: false` (no verification of any callable).
- **Observed at:** 7ec6fd2f, v0.309.0.
- **Scope:** subagent launch — parent-side callable-hash marshalling into
  `PI_THETA_SUBAGENT_CALLABLE_HASHES`.

## Summary

The subagent hash carrier is built by writing rows into a plain object literal
keyed by author-controlled callable names. JavaScript resolves the string
`__proto__` on a plain object to the inherited `Object.prototype` accessor, not
an own data property, so `callableHashes["__proto__"] = hash` (a string value)
is a silent no-op: it neither throws nor creates a row. Both write sites carry
the hazard — the pre-existing `tools:`-entry write
(`production-theta-producer.ts:2069`) and the bug-0328 root-row write
(`:2082–2083`). The child only verifies callables that have a marshalled row,
so the `__proto__`-named callable is admitted without recomputing and comparing
its closure hash. RFC-0005's "whole callee file" edit window
(subagent.md `#subagent-theta-callable-hash`) reopens for that one name.

## Reproduction

Construct the carrier the way the shipped code does (plain object literal +
the `!Object.hasOwn` guard) and inspect the result:

```js
// node --input-type=module
function build(entries, root) {
  const callableHashes = {};                                   // producer :2066
  for (const e of entries)
    if (e.closureHash !== undefined)
      callableHashes[e.presentedName] = e.closureHash;         // producer :2069
  if (root !== undefined && !Object.hasOwn(callableHashes, root.name))
    callableHashes[root.name] = root.hash;                     // producer :2083
  return callableHashes;
}
// tools:-less root named __proto__.theta (root-row write path)
const A = build([], { name: "__proto__", hash: "sha256:aaa" });
console.log(Object.keys(A), JSON.stringify(A));    // []  {}
// a tools: entry presented as __proto__ (pre-existing write path)
const B = build([{ presentedName: "__proto__", closureHash: "sha256:bbb" }]);
console.log(Object.keys(B), JSON.stringify(B));    // []  {}
```

Both cases print `[] {}`: the write was silent and no row landed. The carrier
gate `Object.keys(callableHashes).length > 0` (`:2195–2198`) is then false, so
a `__proto__`-only root emits no carrier at all → the child's
`readMarshalledCallableHashes` returns `undefined` → `active: false` → no
callable of that spawn is verified. When another callable coexists, its row
marshals normally and only the `__proto__` row is missing, so the child
iterates every present key but never the `__proto__` one.

## Expected behaviour

A callable named `__proto__` marshals a closure-hash row exactly as any other
name, and the child recomputes and verifies it — matching the 0328 witness cell
`2c`, which already proves the sibling prototype name `constructor` marshals
its row.

## Actual behaviour / root cause

`callableHashes` is a plain object literal (`:2066`). For the string key
`__proto__`, `obj["__proto__"] = "sha256:…"` invokes the inherited
`Object.prototype` `__proto__` setter with a non-object value, which the
setter ignores — no own property, no throw. The `!Object.hasOwn` guard 0328
added (`:2082`) correctly detects that no own `__proto__` key exists and so
permits the write, but the write itself cannot create one. The row is therefore
absent from `Object.keys`, from the JSON carrier, and from the child's
verification loop. On the absent row the child's behaviour is: never verify —
`verifyChildCallableHashes` iterates only marshalled keys (`:143`), so the
callable is admitted with the parent-load-to-child-spawn edit window fully
open. This is the 0031/0038 hazard class (`defineRecordField`'s doc-comment,
`src/runtime/value.ts:580–597`) reaching the hash-carrier build sites, which
were written with an ordinary object literal instead of the house helper.

## Why it matters

RFC-0005 hash marshalling exists to detect a `.theta`/`.thetalib` edit between
parent load and child spawn and refuse the diverged callee fail-closed. For a
callable named `__proto__` that detection is silently absent: the child runs
the file as found on disk, with no diagnostic on any channel, racy under
parallel siblings. The silence is the defect — the same input that any other
name would hash-verify passes unchecked. The trigger is narrow (an author must
name a root file `__proto__.theta` or present a `tools:` entry as `__proto__`),
which is why this is filed distinct from the general 0328 window, but the
degradation is the class 0031/0038 established must be closed at every
record-building site keyed by author-controlled strings.

## Fix

Write both carrier rows through the repo's own null-prototype/own-key house
helper `defineRecordField` (`src/runtime/value.ts:596`), which is already
imported in `production-theta-producer.ts` (line 208) and used at four other
author-controlled-key sites in the same file. `defineRecordField` calls
`Object.defineProperty`, so a row named `__proto__` lands as an own enumerable
data property byte-identical to an ordinary assignment, and no downstream
consumer (`Object.keys`, `JSON.stringify`, the child's `Object.entries`
reader) observes any difference for ordinary names.

Both write sites are the fix surface — neither alone closes the hazard:

- `production-theta-producer.ts:2069` — replace
  `callableHashes[entry.presentedName] = entry.closureHash` with
  `defineRecordField(callableHashes, entry.presentedName, entry.closureHash)`.
- `production-theta-producer.ts:2082–2083` — replace
  `callableHashes[rootClosureHash.name] = rootClosureHash.hash` with
  `defineRecordField(callableHashes, rootClosureHash.name, rootClosureHash.hash)`,
  keeping the `!Object.hasOwn(callableHashes, rootClosureHash.name)` guard
  (own-key-guarded read, unchanged).

An equivalent route is a `Map` or an `Object.create(null)` carrier; the
`defineRecordField` route is the shipped house preference (its doc-comment
states `defineProperty` is preferred over a null-prototype record so
`Object.prototype` and own-key-only reads stay unperturbed). The child side
needs no change: its `byName` is already a `Map`, and its `Object.entries`
reader already materialises a `__proto__` key as an own property when present
in the JSON.

Constraints the fix must hold:

- Bug 0328's 8-cell witness
  (`tests/b0328-root-closure-hash-marshalled.test.ts`) stays green, including
  cell `2c` (the `constructor` prototype-name row).
- Bug 0330's end-to-end block
  (`tests/subagent-child-hash-refusal-e2e.test.ts`) stays green.
- Add a witness cell for `__proto__` at both the root-row and `tools:`-entry
  paths: the row is present in the carrier, and a byte-edited `__proto__`
  callee is dropped with `theta/runtime/subagent-callable-hash-mismatch`.

## Provenance

Found while reconciling the residuals of the landed 0328 fix
(`.pi/tmp/fixes/0328-report.md`, Residual 1) against 0330's disposition
(`.pi/tmp/fixes/0330-report.md`, Residual 3). 0328's report records the
`__proto__.theta` root-row write as a silent no-op deferred to the map
key-space owner; 0330's report confirms it remains open because 0330 is
child-side only. Neither 0329 (enforcement) nor 0331 (source priority) owns
the parent-side key-space no-op; no other open bug in `docs/bugs/` cites this
producer write. The measurement in `## Reproduction` was run against a plain
object built to mirror `production-theta-producer.ts:2066–2083` at 7ec6fd2f
and confirmed: `__proto__` writes silently drop the row at both sites; a
`__proto__`-only root emits no carrier and the child verifies nothing; a
`Object.create(null)` carrier lands the `__proto__` row as an own key.
