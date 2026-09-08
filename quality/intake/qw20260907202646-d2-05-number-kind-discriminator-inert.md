---
id: pending
title: renderCanonicalNumber's NumberKind discriminator selects between two switch arms with identical bodies, so no call site's kind value changes the rendered string
lens: D2
status: intake
verdict: pending
locations:
  - src/render/canonical-number.ts:74-81
  - src/render/canonical-number.ts:63-72
  - src/discovery/settings.ts:126-129
  - src/parser/schema-lowering.ts:76-81
  - src/render/argument-echo.ts:206-209
  - src/render/query-render.ts:403-406
sites: 6
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# renderCanonicalNumber's NumberKind discriminator selects between two switch arms with identical bodies, so no call site's kind value changes the rendered string

## Observation
`renderCanonicalNumber(value, kind)` switches on the `NumberKind`
discriminator; both arms evaluate `canonicalDecimal(value)`. The function's own
doc records this ("For conforming inputs both rules emit the same exponent-free
fixed-point canonical decimal, so each arm delegates to `canonicalDecimal`; the
explicit branch keeps the discriminator the sole selector of the rendering
rule"). Five production call sites pass a `kind`; two of them compute it — one
from the lowered schema's declared kind, one from `Number.isInteger(value)` —
and for every input the two possible values produce the same string.

## Evidence
src/render/canonical-number.ts:74-81 — the two arms:

```ts
export function renderCanonicalNumber(value: number, kind: NumberKind): string {
  switch (kind) {
    case "integer": // BNDR-4 — canonical base-10 integer.
      return canonicalDecimal(value);
    case "number": // BNDR-5 — shortest round-tripping fixed-point.
      return canonicalDecimal(value);
  }
}
```

src/render/canonical-number.ts:63-72 — the doc stating the arms coincide:

```ts
/**
 * Render `value` as its canonical decimal string for the given `kind`.
 *
 * The caller-supplied `kind` discriminator selects BNDR-4 (`integer`) versus
 * BNDR-5 (`number`) — never the value's runtime integrality. The renderer
 * inspects only the discriminator and the value's IEEE-754 digits; it derives
 * nothing from a value model or schema. For conforming inputs both rules emit
 * the same exponent-free fixed-point canonical decimal, so each arm delegates
 * to {@link canonicalDecimal}; the explicit branch keeps the discriminator the
 * sole selector of the rendering rule.
 */
```

All five production call sites, with the argument each supplies:

src/discovery/settings.ts:126-129 — the kind is computed per call:

```ts
      return renderCanonicalNumber(
        value,
        Number.isInteger(value) ? "integer" : "number",
      );
```

src/parser/schema-lowering.ts:76-81 — the kind is read off the lowered value:

```ts
    case "integer":
    case "number":
      // Numeric `const` / `enum` literals are rendered by the binder
      // integer/number algorithm (BNDR-4 / BNDR-5) keyed off the declared kind,
      // never the value's runtime integrality.
      return renderCanonicalNumber(value.value, value.kind);
```

src/render/argument-echo.ts:206-209 — two literal arguments:

```ts
    case "integer":
      return renderCanonicalNumber(value as number, "integer");
    case "number":
      return renderCanonicalNumber(value as number, "number");
```

src/render/query-render.ts:403-406 — two more literal arguments:

```ts
    case "integer":
      return { ok: true, text: renderCanonicalNumber(value as number, "integer") };
    case "number":
      return { ok: true, text: renderCanonicalNumber(value as number, "number") };
```

## Why this is a problem
Vestigial flag: the parameter is read, but the read selects between two
byte-identical computations, so its value cannot change any output at any of
the five call sites — including the two that spend work deriving it
(`Number.isInteger(value) ? "integer" : "number"` at settings.ts:128 computes a
value that is then discarded by the identity switch). The branch is
documentation carried in executable form: two `case` labels and two identical
`return`s standing in for a BNDR-4/BNDR-5 distinction that the shared
`canonicalDecimal` body already collapses (canonical-number.ts:47-51 states
this: "For every conforming input both rules reduce to this one computation").
No pinned vector distinguishes the two arms: tests/canonical-number-render.test.ts
asserts `renderCanonicalNumber(1e21, "integer")` and
`renderCanonicalNumber(1e21, "number")` to the same string (:38, :67) and
likewise both `-0` cells (:45, :86).

## Suggested direction (non-binding, optional)
If the two BNDR rules are meant to stay separately expressible, the divergence
point is `canonicalDecimal`, not the caller-facing switch; if they are not, the
distinction belongs in a comment rather than in a branch. Either way this is a
shape question for the fix stage, not a behaviour change — every observable
output is already identical.

## False-positive check
- Call-site census: `grep -rn "renderCanonicalNumber" --include=*.ts src extensions tools`
  → the definition plus five call sites (settings.ts:126, schema-lowering.ts:81,
  argument-echo.ts:207 and :209, query-render.ts:404 and :406 — six call
  expressions at five distinct callers) and two comment mentions
  (schema-lowering.ts:839, argument-echo.ts:15). All are cited above.
- Arm-identity check: read both arms verbatim (:76-79); the bodies are the same
  expression, and `canonicalDecimal` (:53-61) takes only `value`, so no path
  observes `kind`.
- Not a deadness claim: `renderCanonicalNumber` and `NumberKind` are live and
  production-consumed; nothing here asserts an unused export.
- Test check: tests/canonical-number-render.test.ts and
  tests/subagent-envelope-negative-zero-fidelity.test.ts:1298-1299 exercise both
  kinds; no cell asserts different bytes for the same value under different
  kinds, so no witness distinguishes the arms today.
- Duplicate check: `grep -rn "renderCanonicalNumber\|canonicalDecimal\|NumberKind" quality/intake/`
  → no hits; src/render/canonical-number.ts is cited by no existing finding.

## Triage
verdict: questionable — every excerpt, the 6-call/5-caller census and both test claims reproduced exactly and `kind` is provably unobservable, but the "vestigial" anchor is refuted by git history (arms born byte-identical in the sole implementing commit e78482b9 with today's rationale doc already present — no removed feature, no dead code, no scaffolding); BNDR-4/BNDR-5 are separately normative (spec:36-37) and the header pins kind-from-static-type as the caller's obligation, so this is the shape question the candidate itself concedes, and collapsing it touches 5 production callers plus 21 test call sites and merges the two spec-anchored describes — a human should rule (triage: claude-opus-5)
