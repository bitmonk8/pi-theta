# Bug 0425 — A discriminated-union-of-schemas `system:` param (`pet: Cat | Dog`) renders the JSON row with NO arm wire renames: the value-driven object row carries no sidecar slot, so `${pet}` renders theta-side field names for every union arm

- **Status:** fixed (0.431.0).
- **Sev/Diff estimate:** S2/D2 — theta-side names silently reach the child's
  system prompt against the recursive-translation / no-second-map rules, with
  zero diagnostics (the 0407 calibration); D2 because 0407 §Fix already named
  the union-arm threading route (a value-brand-keyed sidecar map, or the
  brand-driven translator) inside one subsystem — it was measured and not
  adopted, twice.
- **Kind:** defect — same normative sentences as bugs 0407 and candidates
  /02–/03: `docs/spec_topics/query/query-escapes-stringification.md:26–27`
  (container rows translate "recursively"), `:34` ("the theta-side names an
  author writes never appear in the rendered prompt"), applied to `system:`
  by `:16` and
  `docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md:46`.
  Distinct mechanism from all three siblings: the union terminal's
  value-driven row selection produces an `InterpolationType` that CANNOT
  carry sidecars. The disposition is a DELIBERATE shipped residual, recorded
  twice: 0407 §Fix residual 2 ("union-arm threading not adopted") and 0408
  §Fix residual 2; `tests/b0408-*.test.ts` G2 pins the JSON-row routing for
  object unions (with rename-free arms, so the rename loss itself is
  unwitnessed by any committed test). This report is the designated filing.
- **Related:**
  - [0407](./0407-system-interp-object-render-skips-wire-translation.md)
    (fixed 0.405.0) — its §Fix names the exact remedy ("For the
    `discriminated-union` arm, either thread the union's arm sidecars … or
    route the union case through the same brand-driven
    `translateInterpolationOutbound`"); the landed fix scoped to the
    `object` / `array` arms and recorded the union arm as residual 2.
  - [0408](./0408-scalar-union-params-render-json-row.md)
    (fixed 0.406.0) — made the union terminal VALUE-driven (scalar values now
    take scalar rows); its §Non-goals held object-schema unions on the JSON
    row and its residual 2 re-recorded the missing arm renames.
  - candidates system-templates-2/02 (imported schemas) and /03 (nested
    renames) — same violated sentences, disjoint mechanisms; /03's brand-vs-
    sidecar adjudication should settle all three in one direction.
- **Affected** (verified at 04579e12, v0.415.0):
  - `src/parser/frontmatter.ts:985–988` — `toSystemParamType`: a non-`array`
    generic and any top-level `|` split return bare
    `{ kind: "discriminated-union" }` — no arm list, no sidecars, even when
    every arm names a body schema whose rename map
    `buildOutboundSidecars` could build.
  - `src/parser/system-interpolation.ts:403–404` — the union terminal is
    `valueDriven`; `:533–557` (`interpolationTypeOfValue`) maps an object
    value to a bare `{ kind: "object" }` — the value-driven path has no
    sidecar producer at all.
  - `src/render/query-render.ts:420–430` — `type.sidecars === undefined` →
    the theta-side value serialises unchanged.
  - Contrast: the query surface's brand-driven walk resolves a `Cat`-branded
    value's renames from the environment
    (`src/extension/production-theta-producer.ts:7642–7690`), so the same
    union value in a `@`-template renders wire-named.
- **Observed at:** v0.415.0 (04579e12). Offline, deterministic: `parseDoc` +
  `renderSystemPrompt`; scratch vitest run and deleted.

## Summary

Since 0408, a union-typed `system:` param renders by the resolved value's
runtime kind: an object-schema union value correctly takes the JSON object
row. But the value-driven row is minted with no sidecars — there is no code
path that could attach any, because the static type kept no arm information
(`frontmatter.ts:985–988`) and `interpolationTypeOfValue` builds
`InterpolationType`s from the value alone. A `Cat | Dog` param whose arms
declare `as` renames therefore renders every field theta-side, while the
identical value in a query template renders wire-named, and while a
NON-union param of the same schema (`p: Cat`) renders wire-named on this
very surface since 0407.

## Reproduction

At 04579e12, offline. File:

```yaml
---
mode: subagent
system: 'Pet: ${pet}'
params:
  pet: 'Cat | Dog'
---
```

body:

```theta
schema Cat { kind as "K": string, name as "N": string }
schema Dog { kind as "K": string, breed as "B": string }
let x = 1
```

`parseDoc` → zero diagnostics. `renderSystemPrompt` with
`{ pet: { kind: "cat", name: "Tom" } }` →

```
Pet: {"kind":"cat","name":"Tom"}
```

Expected wire form: `Pet: {"K":"cat","N":"Tom"}` (the lowered union's arms
carry `properties.K` / `properties.N`; a typed response for this schema must
emit those spellings). Control on the same surface: `p: Cat` (no union)
renders `{"K":"cat","N":"Tom"}` via the 0407 sidecar route.

Note the committed pin: `tests/b0408-*.test.ts` G2 uses rename-FREE arms
(`schema Cat { kind: string }`), so it pins only the JSON-row routing —
today's theta-side bytes for RENAMED arms are pinned by no committed test.

## Expected behaviour

- `query-escapes-stringification.md:26–27, 34` and
  `frontmatter-fields-b-and-templates.md:46` as quoted under **Kind** — the
  union value is a Schema-typed object at runtime (the row the
  implementation itself selects), and that row's translation clause is
  unconditional.
- Internal consistency: the same `Cat` value renders `{"K":…}` as `p: Cat`
  and `{"kind":…}` as `pet: 'Cat | Dog'` — one declaration-spelling step
  apart on one surface, either side of a rule that names neither spelling.

## Actual behaviour / root cause

Three seams in series: (1) `toSystemParamType` discards the union's arm
identities — `{ kind: "discriminated-union" }` carries nothing
(`frontmatter.ts:985–988`); (2) the terminal is `valueDriven`, and
`interpolationTypeOfValue` cannot mint sidecars from a plain record
(`system-interpolation.ts:533–557`); (3) the renderer's translation gate
requires `sidecars !== undefined && rootDef !== undefined`
(`query-render.ts:421–427`). 0407's fix wired (3)'s inputs for the `object` /
`array` arms only; 0408's fix changed which ROW the union takes, not the
translation inputs.

## Why it matters

- Discriminated unions are the spec's polymorphic-param idiom
  (`schemas.md` §Discriminated unions), and `as` renames exist precisely for
  wire-facing spellings a theta identifier cannot carry — the composition is
  ordinary, and the system prompt silently teaches the model the names the
  typed-response schema refuses.
- The author-visible trigger is declaration-spelling only: widening `p: Cat`
  to `p: 'Cat | Dog'` — an additive, backwards-compatible-looking change —
  silently flips every rendered key of the `Cat` values already flowing.

## Non-goals

- Which ROW an object-union value takes — settled by 0408 (JSON row; pinned
  by G2) and correct here.
- Scalar unions — settled by 0408 (value-driven scalar rows).
- The missing QRY-18 union row — [bug 0426](./0426-qry18-no-union-of-scalars-row.md) (spec side).
- `.Ident` descent into a union — correctly refused at parse
  (`b0408` G3).

## Fix

The two routes 0407 §Fix already named, still open:

- (a) **Arm-sidecar threading**: keep per-arm data on the union type
  (`{ kind: "discriminated-union", arms: [{name, sidecars, rootDef}] }`),
  and at render pick the arm — by the value's brand when present, else by
  discriminator-field match against the arm schemas (the lowered union
  already carries the literal-discriminator table). Contained in the same
  three files as 0406–0408.
- (b) **Brand-driven render** for `valueDriven` terminals (route the
  resolved value through `translateInterpolationOutbound`): one translation
  implementation for this class AND candidates /02–/03 — but it translates
  only branded values, and invoke-path bindings are plain records, so (a)'s
  discriminator-match fallback is needed regardless.

Constraints: rename-free unions stay byte-identical (`b0408` G2 green);
scalar-union values keep their scalar rows (`b0408` W1–W4 green); the
parse-time `.Ident` refusal stays (`G3`); a value matching NO arm (possible
on the permissive invoke path) must keep today's untranslated bytes rather
than guess an arm.

## Fix (0.431.0)

- What shipped (route (a) — arm-sidecar threading, per parent adjudication):
  - `src/parser/frontmatter.ts` — a top-level `|` union of body object
    schemas now builds per-arm data (`buildSystemUnionArms`): one arm per
    `|`-separated source naming a direct body object schema, carrying that
    schema’s outbound rename sidecars, its theta-side field-name set, and its
    literal-discriminator table. The union split now runs BEFORE the generic
    `<...>` branch (matching the canonical `lowerTypeExpr` order), so a
    `X | array<Y>` union is no longer swallowed whole as a malformed generic.
    `stringLiteralOf` extracts a field’s literal discriminator, mirroring
    `classifyDiscriminatorFieldType` (a top-level `|` pre-test excludes a
    literal-union field so it contributes no bogus literal).
  - `src/parser/system-interpolation.ts` — the `discriminated-union`
    `SystemParamType` and the value-driven `path` template part carry the
    arms; `renderSystemPrompt` picks the resolved value’s arm via
    `unionArmObjectType` — by schema brand (`schemaTagOf`) first, else by an
    EXACT field-set + literal-discriminator match — and translates through
    that arm’s sidecars. The UNIQUE admitting arm wins; zero or ≥2 admitting
    arms return `undefined`, so the value keeps today’s untranslated bytes
    (never guess). `src/render/query-render.ts` needed no change (its
    translation gate already fires on `sidecars !== undefined`).
- Gates: witness `tests/b0425-union-of-schemas-arm-renames-dropped.test.ts`
  9/9 green (W1/W2 field-set arms, W3 literal discriminator, W4 brand pick,
  W5 literal-union-field ambiguity → untranslated, W6 `Cat | array<Cat>`
  object translates, W7 `Dog | array<Cat>` real arm not blocked, G1 no-match
  & R1 renamed same-field-set → untranslated); full `npm test` 589 files /
  10550 tests green; `npm run typecheck` clean; `npm run lint` clean.
- Review: 2 code rounds + 1 comment-only polish. Round 1 (`bug-fix-reviewer`,
  deep) — 4 findings: F1 [correctness] `stringLiteralOf` false-positive on a
  literal-union field type (bogus literal → wrong-arm → wrong-wire), F2
  [correctness] `array<Schema>` arm source unwrapped into a phantom object
  arm, F3 [house-rule] detached JSDoc, R1 [test] ambiguity pin; all addressed
  (F1 `|` pre-test, F2 direct-name-only arm resolution + the union/generic
  reorder needed to reach the arms, F3 helpers moved, R1/W5/W6/W7 witnesses).
  Round 2 (`bug-fix-reviewer`, deep, chosen over fast for the reorder) —
  CLEAN. Polish (`bug-fix-fixer-light`, comment-only JSDoc rescope of the
  skipped-arm fallback) — verified by gate-diff, confirmation round skipped.
- Verification: `bug-fix-verifier` — witness reds on the neutralised fix
  (6 arms untranslated) and restores byte-exact green; full suite green
  (parallel-load flakes green isolated, off-surface); lint + typecheck clean;
  b0408 W1–W4/G2/G3 and b0424 green; the union/generic reorder flipped no
  committed test. Live discharged by the orchestrator
  (`b0406live-object-param-system-interp-registration` green under the global
  live lock — render-bytes class, registration unchanged).
- Residuals:
  1. An `array<Schema>` union arm source is skipped (not unwrapped): an array
     value on such a union keeps the untranslated array row — never a wrong
     wire name, a documented residual (array-arm-element renames not
     translated on this surface).
  2. A RECORD-shaped skipped arm source (an inline-brace arm, or an imported
     schema arm) that shares a field set with a kept schema arm is picked as
     the kept arm rather than falling through to untranslated — never a wrong
     wire name (the value is a valid instance of the kept schema by every
     parse-time observable), a statically-ambiguous pick the never-guess
     constraint does not reach.
  3. A literal-discriminated union whose arms share an identical field set AND
     carry no distinguishing string literal (only int/bool/null literals)
     renders untranslated (conservative), never wrong-wire.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: route (b) (brand-driven whole-value render
  via `translateInterpolationOutbound`) NOT taken — invoke-path bindings are
  unbranded, so route (a)’s structural fallback is load-bearing. The QRY-18
  union spec row is bug 0426 (spec side, this lane).

## Provenance

Designated filing: bug 0407 §Fix (0.405.0) residual 2 and bug 0408 §Fix
(0.406.0) residual 2 ("union-arm threading not adopted"). Probed fresh at
04579e12 with scratch vitest `tests/scratch-system-templates-2.test.ts`
(row C04, renamed arms with literal discriminators — document registers with
zero diagnostics; deleted). Committed-pin gap (G2 rename-free) verified by
reading `tests/b0408-scalar-union-params-render-json-row.test.ts:111–131`.
