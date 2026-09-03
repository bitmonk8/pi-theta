# Bug 0407 — A `system:` object/array interpolation renders theta-side field names into the child's system prompt: `toSystemParamType` never populates the translation sidecars, so the shared renderer's outbound wire-name pass is silently skipped on the one surface QRY-18 says shares the query-template rendering

- **Status:** open.
- **Sev/Diff estimate:** S2/D2 — theta-side names silently render into the child's system prompt against the single-rendering guarantee, teaching the model names its typed responses must not emit, with zero diagnostics; fix needs one adjudication (sidecar wiring vs the brand-driven route 0120's line favours) plus discriminated-union threading within one subsystem.
- **Kind:** defect — implementation diverges from a stated rule:
  `docs/spec_topics/query/query-escapes-stringification.md:26–27` (the
  `array<T>` / Schema-typed-object rows: compact `JSON.stringify` "with
  wire-name translation applied recursively") and `:34` ("There is no second
  translation map for interpolation: the theta-side names an author writes
  never appear in the rendered prompt"), both applied to `system:` by `:16`
  ("The same rule applies to the bare-path `${param}` / `${param.field}` form
  in the frontmatter `system:` field") and by
  `docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md:46`
  ("the same table so that the model sees the same rendering of a given value
  regardless of which surface introduced it").
- **Related:**
  - [bug 0406](./0406-object-typed-params-misclassified-string.md) — misclassification on the branches that
    never reach `kind: "object"`; this report is the branch that DOES.
  - [0120](./0120-inbound-rebuild-ignores-declaration-order-and-brand.md)
    (fixed) — prior art: its §Affected (`query-render.ts:396–443` entry)
    already RECORDS "no site in `src/` ever sets `sidecars` on an
    `InterpolationType`, so that arm is unentered in production too" and
    names `src/parser/system-interpolation.ts:480` as one of the two
    callers — noted, never adjudicated (0120 §Non-goals adjudicates no call
    site, and it records no residual covering the `system:` render). It also
    constrains §Fix: the production outbound path chose the brand-driven
    route (`translateInterpolationOutbound`), leaving the sidecar arm dead.
  - 0079 / 0114 (fixed) — the private-encoding-leak family on the query
    surface; same "renderer skipped a pinned lowering" shape.
  - 0210 (fixed 0.136.0) — prior `system:`-prompt corruption via params
    record writes; cited for the spawn threading map.
- **Affected** (verified at c2c25d81, v0.398.0):
  - `src/parser/frontmatter.ts:833` (`{ kind: "array" }` with no
    sidecars/rootDef) and `:858–865` (`{ kind: "object", fields }` with no
    sidecars/rootDef): the only production construction site of
    `SystemParamType` never wires the translation inputs the type declares
    for exactly this purpose (`src/parser/system-interpolation.ts:104–129`,
    "the wire-name-translation sidecars so the compact `JSON.stringify`
    rendering applies outbound translation").
  - `src/parser/system-interpolation.ts:390–420` — `toInterpolationType`
    copies sidecars only `!== undefined` (never here), and maps
    `discriminated-union` to a bare `{ kind: "object" }` with no sidecar
    plumbing at all.
  - `src/render/query-render.ts:415–430` — the object/array row applies
    `translateOutbound` only when `type.sidecars !== undefined && type.rootDef
    !== undefined`; otherwise it serialises the theta-side value unchanged.
  - Contrast surface: `src/extension/production-theta-producer.ts:7415–7447,
    7503–7560` — the query-template render (`stringifyInterpolation` →
    `translateInterpolationOutbound`) DOES rename theta→wire recursively,
    brand-driven.
  - `src/extension/production-theta-producer.ts:2197–2211, 2432` — the
    untranslated text is installed as the child's `--system-prompt`.
- **Observed at:** v0.398.0 (c2c25d81). Offline, deterministic: scratch
  vitest through `parseDoc` + `renderSystemPrompt` (the exact call pair the
  spawn site runs).

## Summary

For a schema with wire renames, the same value renders differently on the two
surfaces the spec unifies under one table: a `@`-template `${author}` renders
`{"FirstName":"Ada",…}` (outbound translation, brand-driven), while the
frontmatter `system:`'s `${author}` renders `{"first_name":"Ada",…}` —
theta-side names, which the wire contract says never appear in a rendered
prompt. The unit that CAN translate (`stringifyInterpolatedValue`) silently
skips the pass when its sidecar inputs are absent, and the only production
builder of `system:` interpolation types never supplies them. The shipped
unit test hand-builds sidecars to prove the renderer works
(`tests/system-interpolation.test.ts:309–318`), so the gate witnesses the
unit, not the production wiring.

## Reproduction

At c2c25d81, offline. File:

```yaml
---
mode: subagent
system: 'Reviewer: ${author}'
params:
  author: Author
---
```

body:

```theta
schema Author {
  first_name as "FirstName": string,
  role: string
}
let x = 1
```

`parseDoc` → zero diagnostics; template part
`{"kind":"path","segments":["author"],"type":{"kind":"object"}}` — no
sidecars, no rootDef. `renderSystemPrompt` with
`{ author: { first_name: "Ada", role: "dev" } }` (the theta-side record the
validated-params boundary produces) →

```
Reviewer: {"first_name":"Ada","role":"dev"}
```

Expected wire form: `{"FirstName":"Ada","role":"dev"}`. Same result for
`team: array<Author>` → `Team: [{"first_name":"Ada"}]`. A discriminated-union
param (`pet: Cat | Dog`) reaches `toInterpolationType`'s
`discriminated-union → { kind: "object" }` arm, which cannot carry sidecars
even in principle.

## Expected behaviour

- `query-escapes-stringification.md:26–27`: both container rows render
  "with wire-name translation applied recursively", using "the **outbound**
  translation pass" (`:34`); "the theta-side names an author writes never
  appear in the rendered prompt" (`:34`).
- `:16` + `frontmatter-fields-b-and-templates.md:46`: the `system:` slot uses
  the same canonical table precisely so the model sees ONE rendering of a
  given value regardless of surface. The query surface translates (verified
  at `production-theta-producer.ts:7503–7560`); `system:` must match.

## Actual behaviour / root cause

`toSystemParamType` builds `{ kind: "object", fields }` / `{ kind: "array" }`
without ever reading the lowered schema's sidecars
(`buildSidecar`, `src/parser/schema-lowering.ts`) or a root `$def` name —
the two inputs `stringifyInterpolatedValue` requires before it will call
`translateOutbound` (`query-render.ts:421–427`). Absent them, the renderer's
comment says "otherwise `JSON.stringify` already collapses enum values" —
true for enums, but renames are lost with zero diagnostics. The
`SystemParamType` union was designed to carry the sidecars
(`system-interpolation.ts:104–129`); no producer fills the slot.

## Why it matters

- The system prompt is the contract-setting text for every query in the
  spawned conversation. Where an author's schema pins wire names (the names
  the model must emit in typed responses, per the lowered schemas), the
  system prompt now teaches the model the theta-side names instead —
  internally inconsistent instruction, and the divergence is invisible: no
  diagnostic, both spellings look plausible.
- The same value moved from a `system:` slot to a query template silently
  changes bytes, defeating the spec's stated single-rendering guarantee.

## Non-goals

- The misclassified-as-string branches (inline object / imported schema /
  recursion) — [bug 0406](./0406-object-typed-params-misclassified-string.md).
- Scalar unions routed to the object row — [bug 0408](./0408-scalar-union-params-render-json-row.md).
- Enum collapse inside containers — correct today (`JSON.stringify` of the
  boxed wire string).

## Fix

Wire the sidecars at the construction site: `parseFrontmatter` already has
the lowered `params:` schema (`parseParams` output) and `collectBodyTypes`'
`lowered` map; build the per-schema `SchemaSidecar` map (the
`buildSidecar` recipe the tests use) and set `sidecars` + `rootDef` on the
`array` / `object` arms in `toSystemParamType`. For the
`discriminated-union` arm, either thread the union's arm sidecars (the
outbound pass is brand-driven at runtime, so a value-brand-keyed sidecar map
suffices) or route the union case through the same brand-driven
`translateInterpolationOutbound` used by the query surface. Alternative with
a smaller seam: have `renderSystemPrompt` accept the brand-driven outbound
translator as a dep and reuse the producer's walk — one translation
implementation instead of two (the two-implementation drift is how this bug
arose). 0120's line of adjudication favours the brand-driven route: its
§Affected records the sidecar arm as producer-less and dead in production,
and production outbound already standardised on
`translateInterpolationOutbound`. Constraints: rendering of sidecar-less primitives byte-identical;
`Result` unreachable stays unreachable; no re-render of `\${` escapes.

## Provenance

Fresh find. Probed at c2c25d81 with scratch vitest
`tests/scratch-system-templates.test.ts` (A1/A2 rows; deleted). Query-surface
contrast established by code read of `stringifyInterpolation` /
`translateInterpolationOutbound` (`production-theta-producer.ts:7415–7560`)
and the hand-built-sidecar unit test at
`tests/system-interpolation.test.ts:309–318`.
