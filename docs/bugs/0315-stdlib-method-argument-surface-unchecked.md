# Bug 0315 — Stdlib method calls with missing or mistyped arguments parse clean and pass raw JS `undefined`/mistyped values into the host methods: `"a-b".replace("-")` answers `"aundefinedb"`, `"undefinedX".startsWith()` answers `true`, `["a","b"].join()` answers `"a,b"`, and extra arguments are silently ignored

- **Status:** open.
- **Sev/Diff estimate:** S1/D2 — S1 because a parse-clean call injects the JS
  spelling `undefined` into a string value (`"aundefinedb"`), answers a
  content-dependent predicate over the literal string `"undefined"`
  (`startsWith()` → `true` exactly when the receiver starts with
  `"undefined"`), and substitutes JS defaults the theta stdlib never specifies
  (`join()` → comma) — all with zero diagnostics; D2 because the natural fix is
  one table-driven parse-time arity/argument-type check beside the existing
  `unknown-method` check plus a DIAG-2 row decision, with no runtime dispatch
  change.
- **Kind:** defect against the stdlib signature table plus a registry gap.
  `docs/spec_topics/expressions.md:83`/`:87`/`:108` give each member a typed
  signature (`replace(from, to)` is `(from: string, to: string): string`,
  `join(sep)` is `(sep: string): string`), and `:89` makes the `replace`
  reference vectors normative; a two-argument method invoked with one argument
  satisfies no row of that table. No registered code covers the position
  (the A2 check, `theta/parse/unknown-method`, gates the member *name* only),
  so the gap has a registry half.
- **Related:**
  - [0131](./0131-in-document-fn-call-arity-unchecked.md)
    (fixed 0.199.0) — the same class one namespace over: in-document `fn` call
    arity was checked at no parse seam. Its fix minted the fn-call row; the
    stdlib-method argument list was outside its scope and has no runtime
    `ThetaFnArityError` analogue either — the dispatchers index `args[0]` /
    `args[1]` unconditionally.
  - [0072](./0072-tool-arg-checks-dead-and-no-runtime-net.md)
    (fixed 0.65.0) — the Pi-tool argument surface's version of "no parse check
    and no runtime net".
  - [0032](./0032-absent-member-binds-undefined.md) (fixed
    0.42.0) — the precedent that raw JS `undefined` is an out-of-model value
    the runtime must not let in; here it enters as a method *argument* and is
    stringified into a result.
- **Affected** (verified at bc52da38):
  - `src/parser/type-layer-checks.ts:3411` — `checkMethodCall`: checks the
    `join` element-type precondition and the A2 `unknown-method` allow-list,
    and nothing else. No arity comparison against the stdlib signatures, no
    argument-type check (`e.args` is never read).
  - `src/runtime/stdlib-string.ts:73` — `evaluateStringMember`: every argument
    read is an unchecked cast (`args[0] as string`); a missing argument is
    `undefined` handed to the JS method (`:91` `startsWith`, `:99` `split`) or
    to `replaceLiteral` (`:102`).
  - `src/runtime/stdlib-string.ts:118`/`:130` — `replaceLiteral`: with
    `to === undefined`, `:130`'s `result += receiver.slice(cursor, at) + to`
    string-concatenates `undefined`, producing `"aundefinedb"`.
  - `src/runtime/stdlib-array.ts:54` — `evaluateArrayMember`: `join` (`:66`)
    forwards `args[0] as string` to `Array.prototype.join`, whose JS default
    for `undefined` is `","`; `includes`/`indexOf` compare elements against
    `undefined` via `valuesEqual` (always `false`/`-1`); `slice` ignores extra
    arguments.
- **Observed at:** 0.287.0 (bc52da38), offline — production executor harness
  (`parseThetaDocument` → `bindPromptConversation` → `executeBody`).

## Summary

The parse layer gates stdlib method calls by member name only; nothing anywhere
compares the call's argument list against the stdlib table's signatures, and
the runtime dispatchers cast-and-forward whatever arrived. A missing argument
therefore reaches the host JS method as `undefined`, where JS coercion rules —
never theta rules — decide the result: `String(undefined)` inside a
concatenation (`replace`), the `","` default (`join`), the search string
`"undefined"` (`startsWith`/`includes`/`endsWith`), no-op splitting (`split`).
Mistyped arguments coerce the same way (`"abc".includes(1)` → `false`), and
extra arguments vanish. All observed values are silent successes.

## Reproduction

Offline, deterministic; body sources under a `mode: prompt` frontmatter, driven
through `executeBody`. Parse diagnostics `[]` in every row.

| # | Source (body) | Observed | JS mechanism |
|---|---|---|---|
| P2a | `let x = "a-b".replace("-")` / `x` | `value="aundefinedb"` | `"a" + undefined + "b"` via `replaceLiteral` |
| P2b | `let x = ["a", "b"].join()` / `x` | `value="a,b"` | `Array.prototype.join(undefined)` → `","` |
| P2c | `let x = "undefinedX".startsWith()` / `x` | `value=true` | `startsWith(undefined)` → search `"undefined"` |
| P2d | `let x = "a,b".split()` / `x` | `value=["a,b"]` | `split(undefined)` → whole string |
| P2e | `let x = [1,2,3].slice(0, 1, 9)` / `x` | `value=[1]` | third argument dropped |
| P2f | `let x = " a ".trim("z")` / `x` | `value="a"` | argument dropped |
| P2g | `let x = [1,2].includes()` / `x` | `value=false` | `valuesEqual(elem, undefined)` always false |
| X2 | `let x = "abc".includes(1)` / `x` | `value=false` | JS coerces `1` → `"1"` |
| X3 | `let x = "abc".endsWith()` / `x` | `value=false` | search `"undefined"` |

P2c is the sharpest witness: the zero-argument spelling answers `true`/`false`
depending on whether the receiver's content happens to begin with the eight
characters `undefined` — a predicate no theta rule defines.

## Expected behaviour

- expressions.md's stdlib table (`:83`–`:117`) fixes each member's signature;
  `replace` is binary, `join`/`startsWith`/`endsWith`/`includes`/`split` are
  unary, `trim`/`toLowerCase`/`toUpperCase`/`keys`/`values` are nullary.
  A call that does not satisfy its member's signature matches no row of the
  table; the page's closing rule ("Anything not on this list is
  `theta/parse/unknown-method` rather than a runtime failure", `:122`)
  expresses the design intent that stdlib misuse is a parse-time refusal, not
  a runtime JS behaviour.
- The `replace` reference vectors (`:89`, "conforming implementations MUST
  reproduce these exactly") pin `replace` as a two-string total function; no
  vector or sentence admits a one-argument call, and no theta value renders as
  `undefined` anywhere in the value model (runtime-value-model.md's table has
  no `undefined` row).
- theta 1.0's stated posture is "no implicit type conversion" (`:108`, the
  `join` row); JS coercing `1` → `"1"` inside `includes` (X2) contradicts it.

## Actual behaviour / root cause

`checkMethodCall` (`src/parser/type-layer-checks.ts:3411`) validates the member
name and the `join` element type only; `e.args` is never consulted, so no
arity or argument-type judgement exists at parse. The runtime dispatchers
(`evaluateStringMember`, `evaluateArrayMember`, `evaluateObjectMember`) index
`args[0]`/`args[1]` with `as` casts and forward to the JS prototype methods, so
JS coercion semantics govern every malformed call. There is no runtime belt
equivalent to `ThetaFnArityError` for the method namespace.

## Why it matters

The malformed spellings are ordinary author slips (forgetting `join`'s
separator, forgetting `replace`'s second argument, calling `startsWith()` while
composing). Each yields a plausible-looking value that flows onward into
interpolations and tool arguments — impact class 1 (silent wrong values), with
P2a additionally leaking the out-of-model JS token `undefined` into a
user-visible string.

## Non-goals

- Object-member arity (`keys(1)`, `has()` with no key) — same class, but
  `has()` → `false` and `keys(1)` → correct keys are lower-harm; a fix should
  sweep them in the same table, and this report does not enumerate them.
- The laundered-receiver runtime safety net (a method call on a
  statically-unresolvable receiver) — deferral is documented in
  `checkMethodCall`'s comment and is a separate question from argument checks
  on a *resolved* receiver.
- Any change to the JS semantics of correctly-arity'd calls (the documented
  "JS semantics" rows stay).

## Fix

Not yet decided on the registry half (DIAG-2: one new row, e.g.
`theta/parse/stdlib-arg-mismatch`, versus widening an existing row); the
mechanical half is one signature table (member → arity + parameter types)
shared by `checkMethodCall`, which already has the receiver classification and
range at hand, mirroring the fn-call check bug 0131 landed. A runtime belt in
the three dispatchers (throw a defect on `args.length` mismatch instead of
casting) closes the laundered-receiver residue; it must not fire for the
statically-deferred receivers the parse layer deliberately admits. Constraint:
the five normative `replace` vectors and every correctly-formed call must stay
byte-identical.

## Provenance

Found by reading `evaluateStringMember`'s `as`-casts against the expressions.md
signature table during the runtime-mutation hunt at bc52da38; all nine rows
probed offline through the production executor harness. Scratch probes deleted.
