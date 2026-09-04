# Bug 0423 — A bare `${author}` over an imported-schema `system:` param renders theta-side field names into the child's system prompt: no outbound sidecars exist at parse for an imported `.thetalib` schema, so the wire-name guarantee bug 0407 restored for local schemas is still violated for the imported class

- **Status:** open.
- **Sev/Diff estimate:** S2/D3 — theta-side names silently render into the
  child's system prompt against the single-rendering / no-second-map
  guarantee, teaching the model names its typed responses must not emit, with
  zero diagnostics (the 0407 calibration); D3 rather than D2 because — unlike
  0407, whose sidecar data existed in `collectBodyTypes` — an imported
  schema's rename data exists NOWHERE in the parent parse (the import lowers
  to the permissive `{}`), so the fix requires a load-phase carry coordinated
  with the imports surface, not a construction-site wiring.
- **Kind:** defect — implementation diverges from the same stated rules bug
  0407 was filed against, on a sibling input class:
  `docs/spec_topics/query/query-escapes-stringification.md:26–27` (container
  rows render "with wire-name translation applied recursively"), `:34`
  ("There is no second translation map for interpolation: the theta-side
  names an author writes never appear in the rendered prompt"), applied to
  `system:` by `:16` and by
  `docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md:46`
  ("the same table so that the model sees the same rendering of a given value
  regardless of which surface introduced it"). The disposition is a
  DELIBERATE shipped residual: 0406 §Fix residual 2 / 0407 §Fix residual 3
  both record it, and `tests/b0406-*.test.ts` W5 pins the theta-side bytes as
  documented behaviour. This report is the designated filing.
- **Related:**
  - [0407](./0407-system-interp-object-render-skips-wire-translation.md)
    (fixed 0.405.0) — the parent rule-holder: its fix wired
    `buildOutboundSidecars` for BODY-declared schemas only; residual 3
    records "Imported-schema bare render carries no renames (0406 residual 2)
    — sidecars unavailable at parse."
  - [0406](./0406-object-typed-params-misclassified-string.md)
    (fixed 0.404.0) — residual 2 is this report; the `opaque-object`
    classification (parent Rec A) is what routes the render to the
    sidecar-less value-driven object row.
  - [bug 0422](./0422-imported-schema-field-invisibility-renders-undefined.md) — the walked-off-field face of the same
    parse-time invisibility. Two reports by mechanism: /01 is the missing
    PATH-VALIDATION consumer (fix = field-set carry or render guard), this is
    the missing SIDECAR-CONSTRUCTION consumer (fix = rename-map carry); a fix
    for either leaves the other intact.
  - [bug 0424](./0424-nested-schema-renames-not-translated-bare-container.md) and /04 — the two remaining
    wire-translation gaps on this surface (nested renames; union arms); all
    three violate the same QRY-18 sentences via disjoint mechanisms.
- **Affected** (verified at 04579e12, v0.415.0):
  - `src/parser/frontmatter.ts:1029–1035` — `toSystemParamType`'s imported
    arm returns bare `{ kind: "opaque-object" }`; no sidecar slot exists on
    that variant (`src/parser/system-interpolation.ts:130`) and no rename
    data exists to fill one — `collectBodyTypes` carries imports as a
    name-only set (`src/parser/theta-document.ts:1616–1623`).
  - `src/parser/system-interpolation.ts:403–404` — the opaque terminal is
    `valueDriven`; `:533–557` (`interpolationTypeOfValue`) maps an object
    value to a sidecar-less `{ kind: "object" }`.
  - `src/render/query-render.ts:420–430` — with `type.sidecars === undefined`
    the object row serialises the theta-side value unchanged.
  - Contrast surface (translates): body-schema params carry sidecars since
    0407 (`frontmatter.ts:1020–1026`), and the query-template surface is
    brand-driven (`src/extension/production-theta-producer.ts:7642–7690`).
- **Observed at:** v0.415.0 (04579e12). Offline, deterministic: `parseDoc` +
  `renderSystemPrompt` (the spawn-site call pair); scratch vitest run and
  deleted.

## Summary

For a `.thetalib` schema with wire renames (`first_name as "FirstName"`), the
same value renders differently by where its declaration lives: a
body-declared `Author` param renders `{"FirstName":"Ada","role":"dev"}` into
the `system:` slot (0407's fix), while the identical schema imported from a
`.thetalib` renders `{"first_name":"Ada","role":"dev"}` — theta-side names,
which QRY-18:34 says never appear in a rendered prompt. Moving a shared
schema from the theta body into a library — the refactor `.thetalib` exists
for — silently changes the system-prompt bytes and teaches the model field
names that its typed responses (validated against the wire-named lowered
schema) must not use.

## Reproduction

At 04579e12, offline. File:

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
import { Author } from "./types.thetalib"
let x = 1
```

`parseDoc` → zero diagnostics; template part
`{"kind":"path","segments":["author"],"type":{"kind":"object"},"valueDriven":true}`.
`renderSystemPrompt` with `{ author: { first_name: "Ada", role: "dev" } }`
(the theta-side record the validated-params boundary produces) →

```
Reviewer: {"first_name":"Ada","role":"dev"}
```

Where `types.thetalib` declares `schema Author { first_name as "FirstName":
string, role: string }`, the wire form is `{"FirstName":"Ada","role":"dev"}` —
the bytes the body-declared control produces (pinned green by
`tests/b0407-*.test.ts` W1).

## Expected behaviour

- `query-escapes-stringification.md:26–27`: the Schema-typed-object row
  renders "with wire-name translation applied recursively"; `:34`: "the
  theta-side names an author writes never appear in the rendered prompt."
  Neither sentence qualifies by where the schema is declared.
- `frontmatter-fields-b-and-templates.md:46`: one rendering per value
  regardless of surface. The query surface translates an imported schema's
  renames (brand-driven `translateInterpolationOutbound`,
  `production-theta-producer.ts:7642–7690` — the value's brand resolves the
  declaring schema through the runtime environment, which HAS the import);
  `system:` renders different bytes for the same value.
- `frontmatter-fields-a.md:58`: an imported symbol is a first-class
  `NamedType` at the `params:` position ("any symbols imported from
  `.thetalib` files") — nothing grades the rendering guarantee down for it.

## Actual behaviour / root cause

The rename map for an imported schema does not exist anywhere in the
parent's parse output: the frontmatter parser is synchronous and
`FileSystem`-free, `collectBodyTypes` records imports as names only
(`theta-document.ts:1616–1623`), and the `params:` lowering for the import is
the permissive `{}`. `toSystemParamType` therefore classifies the param
`opaque-object` with no sidecar slot (`frontmatter.ts:1029–1035`), the
value-driven render maps the object value to a sidecar-less object row
(`system-interpolation.ts:533–557`), and `stringifyInterpolatedValue`
serialises theta-side keys unchanged (`query-render.ts:420–430`). 0407's fix
deliberately scoped sidecar construction to body-declared schemas because
only their field lists are visible at parse.

## Why it matters

- The wire names are the names the model must emit in typed responses; the
  system prompt teaching theta-side spellings is internally inconsistent
  instruction, invisible to the author (both spellings look plausible; no
  diagnostic on any channel).
- The divergence is triggered by exactly the act `.thetalib` promotes:
  factoring a schema out of the theta body. A theta that rendered wire names
  yesterday renders theta-side names after the refactor, byte-identical
  source at the use site.

## Non-goals

- The walked-off-field / `undefined` face — [bug 0422](./0422-imported-schema-field-invisibility-renders-undefined.md).
- Nested body-schema renames (root-flat sidecars) — candidate
  system-templates-2/03.
- Union-arm renames — [bug 0425](./0425-union-of-schemas-arm-renames-dropped.md).
- Import LOAD semantics (how a load-phase pass could surface the
  `.thetalib`'s field list; the permissive `{}` lowering) — imports-exports-2
  ground; this report needs only the fact, already recorded by 0406/0407,
  that the data is absent at parse.

## Fix

Not yet decided; two routes, both load-or-later:

- (a) **Load-phase sidecar carry**: import resolution already parses the
  `.thetalib` (the same per-load-pass parse cache `tools:`/`invoke` use);
  after it, attach the imported schema's flat rename map + `rootDef` to the
  already-parsed template's `opaque-object` parts (a post-load template
  patch, not a re-parse). Mirrors the 0407 sidecar route; leaves parse
  behaviour untouched.
- (b) **Brand-driven render**: at spawn time the resolved params VALUE can
  carry its declaring-schema brand (the inbound boundary brands schema
  values); route the `system:` render through the same brand-driven
  translator the query surface uses (`translateInterpolationOutbound`),
  which resolves renames from the runtime environment rather than from
  parse-time sidecars. This was 0407 §Fix's stated primary route, rejected
  there for parent-minimality (zero producer hunks); it is the only route
  that also covers /03's nested and /04's union-arm classes in one
  mechanism. Constraint: the render must stay correct for UNbranded records
  (the invoke path binds plain records; a brand-less value must keep today's
  bytes rather than crash). Optional precedent:
  [0120](./0120-inbound-rebuild-ignores-declaration-order-and-brand.md)
  (fixed 0.97.0) — the sidecar-vs-brand adjudication 0407 §Fix leaned on
  when weighing these two routes (`SchemaSidecar` carries no field order;
  the brand resolves against the runtime environment).

Either way: rename-free imported schemas must render byte-identically to
today (`b0407` G1's class), and the `b0406` W5 pin flips from theta-side to
wire bytes in the same commit.

## Provenance

Designated filing: bug 0406 §Fix (0.404.0) residual 2 and bug 0407 §Fix
(0.405.0) residual 3; behaviour pinned by `tests/b0406-*.test.ts` W5
(`"W5: imported-schema bare `${author}` renders compact JSON with theta-side
names"`). Probed fresh at 04579e12 with scratch vitest
`tests/scratch-system-templates-2.test.ts` (row C02; deleted). Query-surface
contrast by code read of `translateInterpolationOutbound`
(`production-theta-producer.ts:7642–7690`).
