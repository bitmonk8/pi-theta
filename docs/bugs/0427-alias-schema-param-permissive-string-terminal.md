# Bug 0427 — An alias-declared schema in a `system:` param keeps the permissive `string` terminal: `p: B` over `schema B = Cat | Dog` renders `[object Object]`, an alias-of-array renders the comma-joined `a,b`, and a spec-legal `${p.field}` through an alias-of-object draws a spurious `theta/parse/system-interp-bad-field`

- **Status:** fixed (0.437.0).
- **Sev/Diff estimate:** S1/D2 — the two renders are QRY-18's own named
  corruption examples (`[object Object]`, comma-joined arrays) landing
  silently in the child's system prompt on documents that register with zero
  diagnostics — the exact S1 class bug 0406 fixed, reachable through the
  alias spelling; D2 because the alias right-hand side is already captured on
  `SchemaDecl.arms` and the classification machinery (0406's object shells,
  0408's value-driven union terminal) already exists — the fix is carrying
  the arms into `FrontmatterBodyTypes` and dispatching on them.
- **Kind:** defect — three faces of one fall-through:
  - the render faces violate QRY-18
    (`docs/spec_topics/query/query-escapes-stringification.md:16`): rendering
    is by static type, "*not* by JavaScript's default `String(...)`, whose
    `[object Object]` and comma-joined-array defaults would silently corrupt
    prompts without any diagnostic for the author" — both named defaults are
    what ships;
  - the refusal face violates the path grammar
    (`docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md:42`):
    `schema A = Cat` is "a top-level type alias …
    references to other named types"
    (`docs/spec_topics/schemas.md:60`), so the type one step in IS the object
    schema `Cat` and `${p.kind}` is an admitted path; the diagnostic's
    registered trigger (`docs/spec_topics/diagnostics/code-registry-parse.md:131`)
    does not describe it.
  The disposition is a DELIBERATE shipped residual: bug 0406 §Fix residual 4
  (round-1 R3) records the alias / head-only fall-through as "unchanged from
  the fork, outside Rec A scope" and names it a filing candidate. This report
  is that filing, widened by the alias-of-array and spurious-refusal faces
  the residual note did not enumerate.
- **Related:**
  - [0406](./0406-object-typed-params-misclassified-string.md)
    (fixed 0.404.0) — the parent: fixed the identical `[object Object]` /
    spurious-`bad-field` pair for inline-object, imported, and recursive
    spellings; its residual 4 is this report. The alias class was outside the
    parent adjudication's Rec A scope, not measured and rejected.
  - [0408](./0408-scalar-union-params-render-json-row.md)
    (fixed 0.406.0) — the INLINE union spelling `p: 'Cat | Dog'` of the same
    union renders correctly (value-driven JSON row, modulo candidate /04's
    renames); naming the union via an alias declaration flips it to
    `[object Object]` — a one-spelling divergence between two forms
    `schemas.md:60` presents as the same construct.
  - [0033](./0033-body-level-schema-alias-unsupported.md)
    (fixed 0.45.0) — made `schema X = A | B` parse and lower; the `params:`
    lowering of an alias is concrete since then, so the AJV boundary
    validates alias params correctly — only this surface's classifier is
    blind.
  - [bug 0425](./0425-union-of-schemas-arm-renames-dropped.md) — once an alias-union classifies as a
    union terminal, its render joins /04's rename question; the two fixes
    should agree.
- **Affected** (verified at 04579e12, v0.415.0):
  - `src/parser/frontmatter.ts:1013–1017` — `toSystemParamType`'s body-schema
    arm: `bodyTypes.schemas.get(s)` yields `undefined` for the alias /
    head-only form and returns `{ kind: "string" }` (comment: "Head-only /
    alias schema — out of scope for this fix; unchanged from the fork's
    fall-through").
  - `src/parser/theta-document.ts:1616–1623` — `collectBodyTypes` forwards
    only `stmt.fields` into the schemas map; `SchemaDecl.arms`
    (`:742–748`, the captured alias right-hand side) is dropped, so the
    classifier cannot see what the alias names even though the parse
    captured it.
  - `src/parser/system-interpolation.ts:388–401` — a `.Ident` step off the
    `string`-kind terminal is refused with `system-interp-bad-field`
    (the spurious-refusal face).
  - `src/render/query-render.ts:401–402` — the `string` row's unchecked
    `value as string`; the `text +=` concatenation
    (`system-interpolation.ts:499–521`) coerces an object to
    `[object Object]` and an array to its comma-join.
- **Observed at:** v0.415.0 (04579e12). Offline, deterministic: `parseDoc` +
  `renderSystemPrompt` (the spawn-site call pair); scratch vitest run and
  deleted.

## Summary

`toSystemParamType` resolves a `params:` `NamedType` against
`bodyTypes.schemas`, but that map carries only object-form field lists — an
alias declaration (`schema B = Cat | Dog`, `schema A = Cat`,
`schema L = array<string>`) is present with `fields === undefined` and falls
to the permissive `{ kind: "string" }`. Downstream that one wrong kind
reproduces bug 0406's exact symptom pair on the alias spelling: a bare
`${p}` renders through the string row's unchecked cast (`[object Object]`
for the union and object aliases, the comma-joined element text for the
array alias), and a `.Ident` step the path grammar admits is refused with a
diagnostic asserting something false about the author's declaration. The
same union written INLINE at the `params:` position (`p: 'Cat | Dog'`)
renders correctly since 0408 — the divergence is purely whether the author
gave the union a name.

## Reproduction

At 04579e12, offline, one file each through `parseDoc` →
`renderSystemPrompt`; every document registers (zero error diagnostics)
except row 4, whose refusal IS the observation:

| body declarations | params / `system:` | render input | observed |
|---|---|---|---|
| `schema Cat { kind: "cat", name: string }`, `schema Dog { kind: "dog", breed: string }`, `schema B = Cat \| Dog` | `p: B` / `'P: ${p}'` | `{p: {kind: "cat", name: "Tom"}}` | template part `{"type":{"kind":"string"}}`; render `P: [object Object]` |
| `schema L = array<string>` | `p: L` / `'L: ${p}'` | `{p: ["a","b"]}` | `L: a,b` |
| `schema Cat { kind: string }`, `schema A = Cat` | `p: A` / `'P: ${p}'` | `{p: {kind: "cat"}}` | `P: [object Object]` |
| same as row 3 | `p: A` / `'P: ${p.kind}'` | — | `E theta/parse/system-interp-bad-field`; theta not registered |
| control: `schema Cat { kind: string }` | `p: Cat` / `'P: ${p}'` | `{p: {kind: "cat"}}` | `P: {"kind":"cat"}` (0406-fixed JSON row) |
| control: inline union `p: 'Cat \| Dog'` (row-1 schemas) | `'Pet: ${p}'` | `{p: {kind: "cat", name: "Tom"}}` | `Pet: {"kind":"cat","name":"Tom"}` (0408 value-driven row) |

Row 1's document is fully legal: the arms carry literal discriminators
(`kind: "cat"` / `"dog"`), so no `missing-discriminator` fires — nothing
warns the author anywhere.

## Expected behaviour

- `query-escapes-stringification.md:16` (QRY-18): rendering by static type
  exists precisely so "`[object Object]` and comma-joined-array defaults"
  never reach a prompt; `:26–27` give the container rows these values must
  take (`{"kind":"cat","name":"Tom"}` — modulo candidate /04's renames —
  and `["a","b"]`).
- `schemas.md:60`: the alias form "composes with every shape from the type
  grammar … and references to other named types" — an alias is the type it
  names, not a distinct opaque kind; `frontmatter-fields-a.md:58` admits any
  resolving `NamedType` at the `params:` position with no alias carve-out.
- `frontmatter-fields-b-and-templates.md:42`: `${p.kind}` through
  `schema A = Cat` resolves one step in to an object schema's declared
  field — an admitted path; `code-registry-parse.md:131`'s trigger
  ("does not name a reachable theta-side `params` object field") does not
  describe it, so row 4's diagnostic fires outside its registered trigger.
- The AJV boundary already agrees: since 0033 the alias lowers concretely,
  so `{p: {kind: "cat", name: "Tom"}}` is exactly what validation admits for
  row 1 — the value the render then corrupts.

## Actual behaviour / root cause

`collectBodyTypes` maps `stmt.name → stmt.fields` (`theta-document.ts:1623`)
— `undefined` for the alias form, discarding the captured `arms`
(`SchemaDecl.arms`, `:742–748`). `toSystemParamType` treats
`fields === undefined` as unclassifiable and keeps the fork-era permissive
`string` terminal (`frontmatter.ts:1013–1017`). The `string` kind then feeds
both consumers: the `.Ident` walk refuses steps
(`system-interpolation.ts:388–401`) and the render takes the string row's
unchecked `value as string` (`query-render.ts:401–402`), whose `text +=`
concatenation produces JavaScript's default coercions.

## Why it matters

- Both render faces are silent wrong values on the surface that conditions
  every child turn, on documents with zero diagnostics — and they are the
  two corruption examples the spec's own rationale sentence names.
- Aliases are the spec's mechanism for NAMING a union once and reusing it
  (`schemas.md:50–60`); the natural refactor from `p: 'Cat | Dog'` to a
  shared `schema B = Cat | Dog` silently degrades the render from compact
  JSON to `[object Object]`.
- The refusal face un-registers legal thetas with a false message — the same
  lying-diagnostic shape as 0406's refusal face.

## Non-goals

- Alias declarations whose RHS is junk (`schema X = Cat +` etc.) — refused
  at declaration since 0061/0042; only legal aliases reach this classifier.
- The head-only degenerate form (`schema X` with neither body nor arms) —
  same fall-through, but it is already refused at its declaration
  (`empty-schema-body` family), so no registering document carries one; the
  alias forms are the reachable class.
- Union-arm wire renames after reclassification — candidate
  system-templates-2/04.
- The imported-alias composition (an alias importing its arms) — the
  imported half is candidates /01–/02's ground.

## Fix

Carry the alias arms into the classifier and dispatch on them:
`collectBodyTypes` forwards `stmt.arms` beside `stmt.fields` (a second map
or a widened value type in `FrontmatterBodyTypes`), and
`toSystemParamType`'s `fields === undefined` arm becomes: one arm →
`toSystemParamType(arm)` (alias-of-object gets the 0406 object shell with
sidecars, alias-of-array the array kind, alias-of-primitive the scalar kind;
`resolving` already guards cycles — and `type-alias-cycle` refuses pure
alias cycles at declaration); two or more arms →
`{ kind: "discriminated-union" }` (the 0408 value-driven terminal renders
scalar and object arms correctly today). This reuses every landed mechanism
and settles all three faces at once: row 1 → JSON row, row 2 → array row,
row 3 → object row, row 4 → admitted path. Alternative (narrower):
classify `fields === undefined && arms !== undefined` as `opaque-object`
(value-driven render kills both corruptions; `.Ident` admits) — smaller
diff, but it imports candidate /01's walked-off-`undefined` residual onto
body-declared types whose fields ARE visible at parse, so the first route is
preferable. Constraints: the recursive-alias cycle guard must terminate
(reuse `resolving`); `b0406`/`b0407`/`b0408` witnesses stay green; a
genuinely head-only decl (unreachable in a registering doc) may keep the
permissive terminal; and routing 2+-arm aliases into the
`discriminated-union` terminal lands on exactly `candidate
system-templates-2/04`'s rename-dropping ground — the two fixes must land
consistently on arm-rename behaviour (coordinate the alias routing with
whatever disposition /04 adopts).

## Fix (0.437.0)

- What shipped (primary route, as settled):
  - `src/parser/theta-document.ts` — `collectBodyTypes` carries each schema's
    alias/union RHS arms (`SchemaDecl.arms`) into a new
    `FrontmatterBodyTypes.aliasArms` map beside the object-form `fields`.
  - `src/parser/frontmatter.ts` — `toSystemParamType`'s `fields === undefined`
    arm dispatches on `aliasArms.get(s)`: undefined/empty → the permissive
    `{kind:"string"}` terminal (genuinely head-only — refused at declaration
    by the empty-schema-body family, unreachable in a registering doc); exactly
    1 arm → recurse `toSystemParamType(arm)` (alias-of-object → the 0406 object
    shell with sidecars, alias-of-array → array kind, alias-of-primitive →
    scalar); 2+ arms → the 0408 value-driven `{kind:"discriminated-union"}`
    terminal. Pure-alias cycles are guarded by a separate `aliasChain` set that
    RESETS on entry to an object schema (the object's parked `resolving` shell
    closes any LEGAL object-hop cycle; a sentinel in the shared `resolving` map
    would leak into that legal cycle and mis-render it — round-1 F1).
- Gates: witness `tests/b0427-alias-schema-param-permissive-string-terminal.test.ts`
  RED→GREEN (W1 union→JSON, W2 array→`["a","b"]`, W3 alias-of-object→JSON,
  W4 `${p.kind}` admits; R1a object-hop-cycle parity, R1b legal alias chain,
  R1c pure self-cycle terminates; G1/G2 controls); flips NO existing test
  (b0406/b0407/b0408 green); full default suite green (590/590, 10555/10555);
  tsc clean; lint clean; `permitted-codes.json` byte-identical.
- Review: 2 rounds. R1 (deep) — blocker F1: the 1-arm cycle guard parked a
  `{kind:"string"}` sentinel in the shared `resolving` shell map, which the
  object-schema arm's early return read back and mis-classified a LEGAL
  object-hop cycle (`schema A = Node; schema Node { next: A }` → `[object
  Object]`, and `p:A` vs `p:Node` diverged) — a SILENT wrong where the fork was
  a loud refusal; + residuals R1 (add cycle/parity cells), R2 (array<Alias>
  element-sidecar theta-side names — pre-existing 0407-class gap, filing
  candidate), R3 (stale sibling cite). Fixer: replaced the sentinel with the
  `aliasChain`-reset-on-object-entry guard, added R1a/R1b/R1c cells, fixed R3.
  R2 (fast) — CLEAN (the reset proven sufficient AND non-leaky: a pure-alias
  cycle never crosses an object hop, so the reset cannot erase it; an object-hop
  cycle is closed by the `resolving` shell the reset does not touch).
- Verification: VERIFIED — both faces red-proved (primary arm neutralised →
  W1–W4 red; old sentinel reintroduced → R1a red), byte-exact restore; full
  suite green; tsc + lint clean; non-regression (b0406/b0407/b0408 and the
  imported-schema family b0422/b0423 green — the new `aliasChain` param does not
  disturb the imported/opaque-object classification). LIVE: 0427's alias render
  flows through the IDENTICAL system-interp → `--system-prompt` spawn path that
  `tests/live/acceptance/b0406live-object-param-system-interp-registration.test.ts`
  exercises end-to-end through the real `pi -p`; the alias classification
  itself is a pure parse-time decision (no imports, no FS, no model) fully
  witnessed offline by b0427. Ran b0406live as the adjacent live witness —
  GREEN under the global lock. WHY a bespoke alias live cell was not minted:
  no real-host behaviour differs for the alias class beyond the offline
  classifier's verdict, so a bespoke cell would add a provider round trip to a
  decision no model participates in.
- Residuals:
  1. R2 — `array<Alias>` element sidecars render theta-side names (an
     alias-blind `buildOutboundSidecars` for the array element): a pre-existing
     0407-class wire-name gap, byte-identical pre/post this fix, outside the
     §Fix's prescribed `toSystemParamType` `fields === undefined` edit. Filing
     candidate in the 0406-residual pattern; not this fix's concern.
  2. The brace-group-union arms-capture caveat (`schema X = { a: string | null }`
     splits into 2 per-`|`-SEGMENT arms → discriminated-union) renders correct
     bytes via the value-driven object row (strict improvement over the fork's
     `[object Object]`); the mis-granularity is the documented bug-0033
     residual (ii) family, not new corruption.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: 2+-arm alias arm-rename translation is bug
  0425 (lane L4) — the discriminated-union terminal here carries NO arm-rename;
  the alias→union routing is CONSISTENT with L4's union-terminal mechanism (do
  not implement arm-rename here). Genuinely head-only decls keep the permissive
  terminal. Imported-schema load path (0422/0423), body-expression sites (0429),
  and L4's 0424/0425/0426 untouched.

## Provenance

Designated filing: bug 0406 §Fix (0.404.0) residual 4 (round-1 R3,
"Filing candidate"). Probed fresh at 04579e12 with scratch vitest
`tests/scratch-system-templates-2.test.ts` (rows C06a–C06e; deleted).
`SchemaDecl.arms` capture verified at `theta-document.ts:733–748`;
`collectBodyTypes` drop verified at `:1616–1623`.
