# Bug 0017 — A user object carrying a boolean `ok` field is misclassified as a `Result` runtime value; typed-query payloads and callee final values are silently corrupted

- **Status:** open.
- **Kind:** defect — implementation representation diverges from the documented
  value model. `docs/reference/type-system.md` (Result row) pins `Result<T, E>`
  as "internally tagged `Ok`/`Err` with payload; **observed only via
  constructors, `match`, `?`**", and the value-model header
  (`src/runtime/value.ts`) pins the same posture for enums by installing an
  interpreter-**private**, non-enumerable tag (`__thetaEnum`) precisely so the
  brand can never collide with user data. The shipped `Result` representation
  has no such privacy: `makeOk` / `makeErr` produce bare
  `{ ok: true, value }` / `{ ok: false, error }` objects, and `isResultValue`
  recognises a `Result` by duck-typing — *any* non-array, non-enum object whose
  `ok` property is a boolean. A user- or model-produced object that happens to
  carry a boolean `ok` field is therefore indistinguishable from a genuine
  `Result` at every normalisation boundary.
- **Affected:** `isResultValue` (`src/runtime/value.ts:173`) and its callers:
  - `asResultValue` (`src/runtime/statement-executor.ts:1025`) — the CONV-6
    implicit-`Ok` wrap applied to every effect value (`@`-query, code-tool
    call, `invoke`) and to user-`fn` call operands of `?` / `match`. A payload
    shaped `{ ok: boolean, … }` passes through *unwrapped*, so `?` /
    `match Ok(v)` then unwrap its nonexistent `.value` → the binding is
    `undefined`.
  - `surfaceCalleeFinalValue`
    (`src/extension/production-theta-producer.ts:3308`) — the FN-3/FN-5
    callee-final-value wrap. A callee whose final value is
    `{ ok: false, … }` user data surfaces to the `invoke` parent as an **Err**
    with an undefined `error` payload; `{ ok: true, … }` loses its content the
    same way as above.
  - `valuesEqual` (`src/runtime/value.ts:216`) — the `==` relation routes an
    `ok`-carrying user object to the Result arm (discriminator + payload
    recursion), so equality against another object compares the wrong
    structure.
  - `isWireLowerable` (`src/runtime/value.ts:284`) — an `ok`-carrying user
    object is deemed not wire-lowerable.
- **Observed at:** `0.26.0`, host Pi pins `~0.80.10`, live model
  `claude-sonnet-5` (`npm run test:live`); the corruption itself is offline
  and deterministic (no live model required — see Reproduction).

## Summary

A typed `@`-query whose declared response schema contains a boolean field
named `ok` — e.g. `{ ok: boolean, label: string }` — resolves, validates
against its lowered schema, and is then destroyed at the bind: the theta
observes `null`/`undefined` instead of the validated object, and any member
access on it aborts the invocation with `null member access`. The same
misclassification corrupts a user `fn` or `invoke` callee whose final value
carries a boolean `ok` field, and skews `==` for such objects. Nothing about
this is model-specific; any schema with an `ok: boolean` field triggers it
deterministically.

Discovered by the `npm run test:live` failures after the suite moved to
`claude-sonnet-5`: the H8a typed-query test and H9a area (c) both use
`{ ok: boolean, label: string }` and bound `null` (`LIVE TYPED RESULT null`,
`ACC TYPED INLINE RESULT null`), while H9a area (b) — identical machinery, but
schema `{ status, summary }` with no `ok` field — passed. The failures were
initially misattributed to the inline-vs-named annotation form; a live trace
disproved that: `runTypedQueryLoop` returned the **validated** payload
`{"ok":true,"label":"…"}` (validation collaborator present, lowered schema
present) and the corruption happened downstream at the `?` unwrap.

## Reproduction

Offline, deterministic, no provider (unit level):

```ts
import { isResultValue } from "../src/runtime/value";
import { evaluateQuestion } from "../src/runtime/runtime-panics";

isResultValue({ ok: true, label: "x" });          // true — the defect
evaluateQuestion(() => ({ ok: true, label: "x" }) as never);
// → { kind: "value", value: undefined } — the payload is gone
```

Offline, through the production executor (fn-tail form):

```theta
fn f(): { ok: boolean, label: string } {
  { ok: true, label: "x" }
}
let r = f()?
@`${r.label}`
```

`evalAsResult` normalises the fn's tail value via `asResultValue`; the
`ok`-carrying object is mistaken for an already-wrapped `Result`; `?` yields
`.value` = `undefined`; the member access aborts.

Live (how it was found): any typed query with an `ok: boolean` field in its
schema —

```theta
let r: { ok: boolean, label: string } = @`Return an object: set ok to true and label to a short string.`?
@`Reply with exactly: INLINE=[${r}] LABEL=[${r.label}]`?
```

The run aborts with the system note
`theta /<name> aborted: null member access: .label`; interpolating only
`${r}` renders `null`. Trace evidence (temporary instrumentation in
`runTypedQueryLoop`):

```
THETA-TRACE forced:     {"kind":"respond","payload":{"ok":true,"label":"settings-file-unreadable"}}
THETA-TRACE final-bind: {"hasValidation":true,"hasLowered":true,"payload":{"ok":true,"label":"…"}}
```

— the loop's value is correct; the bind after it is not.

## Expected behaviour (what the spec says)

`docs/reference/type-system.md` (Result row): `Result<T, E>` is "internally
tagged `Ok`/`Err` with payload; observed only via constructors, `match`, `?`;
never lowered to a schema … never crosses the wire". "Internally tagged"
and "observed only via constructors" jointly require the discriminator to be
interpreter-private: user data must not be able to *forge* a `Result`, exactly
as the enum representation already guarantees with its non-enumerable
`__thetaEnum` tag (`runtime-value-model.md` value-representation table). A
validated typed-query payload `{ ok: true, label: "x" }` must bind as that
object, wrapped in a genuine `Ok(...)` by the CONV-6 implicit wrap, and
`?` must unwrap it back to the object.

## Actual behaviour / root cause

`makeOk`/`makeErr` (`src/runtime/value.ts:184/189`) build plain enumerable
`{ ok, value }`/`{ ok, error }` objects, and `isResultValue`
(`value.ts:173`) recognises the shape structurally (`typeof value.ok ===
"boolean"`). Every normalisation site that must decide "already a `Result`,
or a plain value to wrap?" therefore misclassifies user data whose `ok`
field is a boolean:

1. The typed-query bind: `runQueryEffect` returns the validated payload;
   `evalAsResult` → `asResultValue(payload)` → `isResultValue` true → no
   `Ok` wrap → `evaluateQuestion` reads `payload.value` → `undefined`.
2. The callee final value: `surfaceCalleeFinalValue` passes the object
   through as a `Result`; an `ok: false` user object masquerades as `Err`.
3. Equality and wire-lowering, per the affected list above.

The `ok` field name is not exotic — it is one of the most common field names
in status-reporting schemas (this repo's own live tests used it three times
independently).

## Why it matters

- Silent data corruption: the value validated against the declared schema is
  not the value the theta observes — the QRY-22 guarantee is void for any
  schema containing `ok: boolean`.
- The failure is downstream and mystifying: authors see `null member access`
  or `null` interpolations after a *successful* typed query.
- The forgeability inverts error handling: a callee returning
  `{ ok: false, reason: … }` as *data* is routed into the parent's `Err` arm.

## Fix options and recommendation

1. **Private tag (recommended).** Mirror the enum representation: install a
   non-enumerable, interpreter-private tag (or a module-private `Symbol`) on
   the objects `makeOk`/`makeErr` construct, and make `isResultValue` test the
   tag instead of the shape. `valuesEqual` and `isWireLowerable` inherit the
   fix through `isResultValue`. JSON output is unaffected (a non-enumerable
   tag never serialises, and per spec a `Result` never crosses the wire
   anyway). Audit for places that construct Result-shaped literals without
   the constructors (e.g. test doubles, the PIC-59 child envelope decode) and
   route them through `makeOk`/`makeErr`.
2. Keep the duck-test but narrow it (e.g. require exactly the
   `{ok, value}`/`{ok, error}` key set). Rejected: still forgeable
   (`{ ok: true, value: … }` is plausible user data), and it silently changes
   which user objects are corrupted rather than eliminating the class.

Until fixed, the live-suite typed-query reds (H8a "typed-query lowering,
bounded" and H9a area (c)) are correct-reason failures of this bug, not test
defects; H9a area (b) passes only because its schema avoids the field name.
