# Bug 0337 — A `.theta`-file enum tags on its bare declared name, so two different `.theta` files each declaring `enum Sev` mint the identical tag `"Sev"`: a callee's `Sev.Low` returned across an in-process `invoke<Sev>` compares `==` true against the caller's unrelated same-named `Sev.Low`, silently, where the same two declarations in `.thetalib` files carry file-qualified keys and compare unequal

- **Status:** open.
- **Sev/Diff estimate:** S1/D2 — S1: two nominally distinct enum
  declarations compare `==` true with zero diagnostics at any phase, and the
  divergence is invisible on the wire (`JSON.stringify` of both sides prints
  the same bare string), so it surfaces only as a wrong branch/match decision
  on a value the caller never declared. D2: the fix generalises bug 0305's
  declaring-key scheme to `.theta`-file enums (mint the registration tag from
  the theta's own resolved path, thread it to the same callers 0305 covered),
  one subsystem, with same-commit spec edits.
- **Kind:** defect. `runtime-value-model.md:13` defines an enum value as "the
  variant's wire string plus an interpreter-private tag **identifying the
  declaring enum**" and states "Cross-enum equality compares both:
  `Severity.High == OtherEnum.High` is `false` even when wire values match".
  `:29` keys equality on "the declaring-enum tag and the wire value". For two
  distinct `.theta` files each declaring `enum Sev`, the tag is the bare name
  `"Sev"` for both, so it does not identify the declaring enum and the two
  declarations compare `==` true. `:29`'s justification for the bare-name
  scheme — "An enum declared in a `.theta` file (which cannot itself be
  imported) tags on its bare declared name, which is collision-free within
  that file" — rests on a `.theta` enum value never leaving its file. An
  in-process `invoke<Sev>` return carries it to another file: `invocation.md`
  and bug 0174 (the prompt→prompt attach cell) route the callee's terminal
  value back to the caller in-process, so the premise is false and the
  collision is reachable.
- **Affected** (citations verified at `52712fb3`, v0.294.0):
  - `src/extension/production-theta-producer.ts:4270` — the top-level `.theta`
    enum registration pushes `{ name, variants, values? }` with no
    `declaringKey`.
  - `src/runtime/lexical-environment.ts:404–406` — the registration sets
    `tag: reg.declaringKey ?? reg.name`, so a `.theta` enum's tag is the bare
    declared name.
  - `src/runtime/lexical-environment.ts:683` — `resolveEnumVariant` mints the
    variant via `makeEnumValue(entry.tag, …)`.
  - `src/extension/production-theta-producer.ts:3923`, `:3926–3931` —
    `#validateInvokeReturn` AJV-validates the wire projection
    (`projectForValidation(result.value)`) but hands `decodeInboundValue` the
    original boxed carrier (`validated: result.value`).
  - `src/runtime/wire-translation.ts:298` — `rebuildInbound` reattaches a
    declaring-enum tag only when `typeof value === "string"`; a boxed carrier
    is `"object"`, so the callee's tag survives the invoke-return decode
    untouched (the arm-dispatch path `:429` has the same string-only guard).
  - `src/runtime/value.ts:503` — `valuesEqual` returns
    `tagA === tagB && String(a) === String(b)`.
  - `docs/spec_topics/runtime-value-model.md:13`, `:29` — the enum-value and
    equality prose whose "identifying the declaring enum" / "collision-free
    within that file" wording the collision contradicts; mirror at
    `docs/reference/type-system.md:154`, `:183–185`.
- **Observed at:** `0.294.0` (`52712fb3`). Offline, deterministic; no live
  model. Pre-existing since the bare-name scheme; not introduced by bug 0305,
  which fenced this corner as residual R4 (flagged for a standalone report).

## Summary

An enum declared in a `.theta` file tags its runtime values on the bare
declared name. Two different `.theta` files each declaring an enum of the same
name mint the identical tag, so their variants compare `==` true even though
they are distinct nominal declarations. The comparison is reachable across an
in-process `invoke<Sev>`: the callee's returned variant retains its bare tag,
and the caller's variant of its own same-named enum carries the same tag and
same wire value, so `==` evaluates true with no diagnostic. The byte-identical
two declarations in `.thetalib` files carry file-qualified declaring keys
(`<resolvedPath>#<name>`, bug 0305) and compare unequal.

## Reproduction

Two `.theta` files, each declaring `enum Sev { Low = "low", High = "high" }`:

- `b.theta` body ends `Sev.Low`.
- `a.theta`: `let v = invoke<Sev>("./b.theta"); … v == Sev.Low`.

`v` reaches `a.theta` carrying `b.theta`'s enum tag `"Sev"` and wire `"low"`;
`a.theta`'s `Sev.Low` carries tag `"Sev"` and wire `"low"`. `v == Sev.Low`
evaluates true, though `v` is a value of a declaration `a.theta` never wrote.

Mechanically measured offline over the value model (no live model):

- `valuesEqual(makeEnumValue("Sev","low"), makeEnumValue("Sev","low"))` is
  `true` — two distinct `.theta`-file `Sev` declarations both mint the bare
  tag `"Sev"`.
- Control: `valuesEqual(makeEnumValue(enumDeclaringKey("/a.thetalib","Sev"),
  "low"), makeEnumValue(enumDeclaringKey("/b.thetalib","Sev"),"low"))` is
  `false` — file-qualified keys distinguish the two.
- The invoke-return carrier is `typeof "object"` (a boxed `String`), below the
  `typeof value === "string"` retag guard at `wire-translation.ts:298`, so the
  callee's tag is neither replaced nor re-minted on return.

## Expected behaviour

Two enum declarations in different source files are distinct nominal types;
their variants compare `==` false, matching the `.thetalib` outcome
(`runtime-value-model.md:29`: "two distinct … declarations that happen to
share a name resolve to different declaring files and compare unequal") and
the general rule (`:13`: "a tag identifying the declaring enum"). A value of a
declaration the caller did not write does not satisfy the caller's own enum in
`==` or `match`.

## Actual behaviour / root cause

The `.theta` enum registration mints no declaring key
(`production-theta-producer.ts:4270`), so the tag falls to the bare name
(`lexical-environment.ts:404–406`) and every variant carries it
(`:683`). Across an in-process `invoke<Sev>`, `#validateInvokeReturn` validates
the wire projection but decodes the original boxed carrier
(`production-theta-producer.ts:3923`, `:3926–3931`); `rebuildInbound` retags
only string values (`wire-translation.ts:298`), so the boxed carrier passes
through with the callee's bare tag intact. `valuesEqual` compares tag then wire
(`value.ts:503`), so two same-named bare tags with equal wire values compare
true. The spec's stated justification — a `.theta` file "cannot itself be
imported", so bare names are "collision-free within that file"
(`runtime-value-model.md:29`) — omits the in-process invoke path, which carries
a `.theta` enum value out of its declaring file.

## Why it matters

A caller branching on `invoke<Sev>` output accepts a callee's unrelated
same-named enum as its own. The two values are indistinguishable on the wire
(`JSON.stringify` prints the bare string for both), so no serialized trace
exposes the confusion; it surfaces only as a wrong `match` arm or `==` result.
The `.thetalib` path already carries file-qualified identity, so the guarantee
holds there and fails only for `.theta`-declared enums crossing an in-process
invoke.

## Fix

Generalise bug 0305's declaring-key scheme to `.theta`-file enums. Thread the
loading `.theta` file's own resolved path to its enum registration and mint the
registration tag via `enumDeclaringKey(<theta resolvedPath>, <name>)` rather
than the bare name (`production-theta-producer.ts:4270`,
`lexical-environment.ts:404–406`), so two distinct `.theta` files' same-named
enums resolve to different keys and compare unequal while same-file variants
keep one key and compare equal. Mint the same key at the `.theta` body's
inbound retag sidecar so a body-constructed variant and an inbound query result
of the same declaration keep comparing equal, matching the discipline 0305
threaded for imports. The invoke-return decode needs no retag: with the callee
minting a file-qualified tag, its boxed carrier already differs from the
caller's declaration and `valuesEqual` returns false. Amend the
`runtime-value-model.md:29` justification ("collision-free within that file" /
"cannot itself be imported") and the `type-system.md:183–185` mirror in the
same commit to state the file-qualified `.theta` identity and drop the premise
the invoke path falsifies.

## Provenance

- Bug 0305 §Residuals R4 recorded this corner (bare-name `.theta` tags collide
  across an in-process invoke), scoped its own spec amendment to
  imported/re-exported declarations, and flagged a possible standalone report.
  This is that report.
- Related: [0305](./0305-enum-identity-minted-from-alias.md) — fixed
  (0.290.0); the declaring-key scheme this report extends to `.theta` files.
  [0067](./0067-subagent-envelope-drops-enum-tag.md) — fixed (0.90.0); the
  enum-tag identity fault across the subagent invoke envelope (tag dropped, so
  same-declaration variants compare false). This report is the converse — tag
  retained but under-qualified, so different-declaration variants compare true.
  [0174](./0174-typed-invoke-enum-return-validation-prompt-cell.md) — fixed
  (0.98.0); establishes that the in-process prompt→prompt cell delivers the
  callee's boxed enum carrier to the caller, the path over which this collision
  is reachable.
