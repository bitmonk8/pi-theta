# Bug 0315 — Stdlib method calls with missing or mistyped arguments parse clean and pass raw JS `undefined`/mistyped values into the host methods: `"a-b".replace("-")` answers `"aundefinedb"`, `"undefinedX".startsWith()` answers `true`, `["a","b"].join()` answers `"a,b"`, and extra arguments are silently ignored

- **Status:** fixed (0.294.0).
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

## Fix (0.294.0)

**Registry-half adjudication (parent-settled): a NEW DIAG-2 row, not a widening
of `theta/parse/unknown-method`.** Recorded verbatim: (1) 0131's precedent
minted a dedicated row for the fn-namespace arity class; (2) `unknown-method`'s
registered trigger is name-not-on-the-list — semantically distinct from a
signature mismatch on a *known* member; (3) `expressions.md:122` frames stdlib
misuse as a parse-time refusal — a dedicated row gives the author member +
expected/got in one message.

**Naming / message / prose choices (orchestrator-settled under that delegation).**
Two new `type`-phase parse codes were minted (the minimal set that flips every
witness including the type witness X2, mirroring 0131's arity + arg-type split):

- `theta/parse/stdlib-arity-mismatch` — one code, both directions, mirroring the
  precedented single-code `theta/parse/generic-arity-mismatch`. Message:
  `stdlib method '<method>' on type <type> expects <required> argument(s); got <provided>`.
  `<required>` renders the arity boundary the call VIOLATES — the member minimum
  for a too-few call, the maximum for a too-many call (every member has
  `min == max` except `slice`, whose boundary is exact either way).
- `theta/parse/stdlib-arg-type-mismatch` — per-argument type, checked AFTER arity
  (arity-before-type; on a mismatch the type check does not run), deferring
  statically-unresolvable / withheld argument types exactly as
  `checkFnCallArgs` / `checkInvokeArgTypes` do. Message:
  `stdlib method '<method>' on type <type> argument <i> type mismatch: expected <expected>, got <actual>`.

No new placeholder was coined — `<method>` (cat 7), `<type>`/`<expected>`/
`<actual>` (cat 1), `<i>`/`<required>`/`<provided>` (cat 4) are all pre-existing;
only the `<required>`/`<provided>` scope enumeration in placeholder-rendering-a.md
§4 gained the new code. The `concat` any-`array<U>` parameter renders its
`<expected>` as the category-1-conformant `array<unknown>` (the `unknown`
stand-in token inside an `array<…>` composite), so no per-arm carve-out was
needed (round-1 review finding F1).

**Object-member scope decision: INCLUDED.** Premeasured before implementing — no
committed test or doc fixture pins the silent wrong-arity behaviour of
`keys()` / `values()` / `has(k)` on a resolvable object (the only `.has()` /
`.keys(` occurrences are correct-arity theta fixtures, the non-object-receiver
message-render input `read: ".has()"`, and TypeScript-harness `Object.keys(...)`);
a scratch probe confirmed `o.has()` and `o.keys(1)` parse clean today. Object
members are therefore in the shared signature table.

- What shipped:
  - `src/runtime/stdlib-string.ts` — `StdlibParamKind`/`StdlibMemberSignature`
    types + `STRING_MEMBER_SIGNATURES` (the shared table's home); runtime belt in
    `evaluateStringMember`.
  - `src/runtime/stdlib-array.ts`, `src/runtime/stdlib-object.ts` —
    `ARRAY_MEMBER_SIGNATURES` / `OBJECT_MEMBER_SIGNATURES`; runtime belt in each
    dispatcher.
  - `src/runtime/runtime-panics.ts` — `StdlibMethodArgumentDefectError` (routes
    through the existing `surfaceUnexpectedThrow` → `theta/runtime/internal-error`;
    no new runtime registry code), thrown by the three dispatchers on an
    out-of-`[min,max]` `args.length` instead of the unchecked `args[i] as …` cast;
    fires only on genuine mismatch, never for a correct-arity laundered call.
  - `src/parser/stdlib-arg-diagnostics.ts` (new) — the two message builders +
    `checkStdlibMethodCall` (arity-before-type; `provableArgType` for soundness).
  - `src/parser/type-layer-checks.ts` — wires the check into `checkMethodCall`
    after the existing `join` precondition + A2 allow-list; concrete receivers
    only (laundered receivers defer to the runtime belt).
  - `docs/spec_topics/diagnostics/code-registry-parse.md`,
    `docs/reference/diagnostics.md`,
    `docs/spec_topics/diagnostics/placeholder-rendering-a.md`,
    `docs/spec_topics/expressions.md` — the two rows + mirror + `<required>`/
    `<provided>` scope + one additive normative sentence (DIAG-2 same-commit).
  - `tests/fixtures/diag2/asserted-code-not-in-registry-baseline.json` — the
    `theta/b0315` sourcePath-literal false-positive waiver (bug 0230 convention,
    matching `theta/conformance` / `theta/bug0019`).
- Gates: witness run `npx vitest run tests/b0315-stdlib-arg-surface.test.ts
  tests/b0315-stdlib-arg-runtime-belt.test.ts` → 32 passed; full suite `npm test`
  → 471 files / 9505 tests passed; `npm run typecheck` clean; `npm run lint`
  clean.
- Review: 2 rounds. Round 1 (`bug-fix-reviewer`): one `spec` finding F1 — the
  `concat` `<expected>` rendered the non-conformant `array<T>`; fixed to
  `array<unknown>` + three type-witness cells added. Round 2
  (`bug-fix-reviewer-fast`): CLEAN, no correctness/fidelity/spec blocker.
- Verification (`bug-fix-verifier`, SOLID): (1) witnesses genuinely witness —
  parse-check neutralised → 14 witnesses RED, restored byte-exact
  (blob `8e443ef3…`) → GREEN; belt neutralised → RED with the `"aundefinedb"`
  signature, restored byte-exact (blob `a937fb70…`) → GREEN; (2) full suite 471
  files / 9505 tests green; (3) live — `tests/live/acceptance/b0315live-stdlib-arg-refusal.test.ts`
  1 test passed via real `pi -p` (control drove `263+514=777`; offender refused,
  `REFUSED` sentinel, `LOADED` absent), and H9a `noninteractive-acceptance` 10/10
  with every area's codes ⊆ permitted (permitted-codes.json byte-unchanged — the
  new parse codes never reach H9a stderr from committed fixtures); (4) lint +
  typecheck clean.
- Residuals: none. (The `"element"` / `"integer"` / `"array"` type-descriptor
  arms each carry a committed witness cell as of the round-1 fixer pass.)
- Discharge notes appended: none — 0131 scoped itself to `fn` calls and never
  claimed or deferred the stdlib-method argument surface, so it is owed none.
- Pinned dispositions / non-goals: the laundered-receiver runtime net is a belt,
  not a parse check (the parse layer still defers a statically-unresolvable
  receiver, per `checkMethodCall`'s comment); correctly-arity'd calls' documented
  JS semantics are unchanged (the five normative `replace` vectors and every
  control cell stay byte-identical).
