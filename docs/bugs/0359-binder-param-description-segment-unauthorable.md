# Bug 0359 — the binder Parameters-block ` — <description>` segment is prescribed, normatively reference-rendered, and unauthorable: no theta 1.0 surface attaches a description to a `params:` field, `binderPromptParamField` hard-codes the segment absent, and all three description-bearing rows of the MUST-reproduce Parameter-line reference renderings are unreachable from any input

- **Status:** fixed (0.373.0).
- **Sev/Diff estimate:** S3/D1 — the same verification-gap class bug 0349
  filed at S3 ("a documented shape no … input can fire"): three normative
  byte-sequences (binder-bypass-and-envelope.md *Parameter-line reference
  renderings*, rows 1–3) and item 4's conditional ` — <description>`
  arm cannot be produced by any theta, so their MUST is vacuously green and
  a conformance test for the positive arm cannot be written. No runtime
  misbehaviour today — the omitted-description arm is the only reachable
  one and it renders correctly. D1 for the spec-side resolution (pin the
  carrier or mark the segment reserved); the alternative — building an
  authoring surface — is `[bug 0357](./0357-doc-comment-field-variant-anchors-refused.md)` +
  `[bug 0358](./0358-doc-comment-descriptions-never-lower.md)` follow-on work, not this fix.
- **Kind:** spec gap (spec-internal inconsistency with implementation
  corroboration). Item 4 (`binder-bypass-and-envelope.md:123`) appends the
  segment "iff the field carries a non-empty `description:` (per
  [Descriptions](../descriptions.md), after that section's normalisation)"
  — but Descriptions defines `///` anchors only for schema declarations,
  schema fields, enum declarations/variants, and `fn`
  (`descriptions.md:35`); a `params:` field is a frontmatter YAML entry
  whose RHS is a type expression
  (`frontmatter/frontmatter-fields-a.md:58`), with no
  doc-comment position. The cross-reference points at a rule that cannot
  bind the referenced position.
- **Related:**
  - [0060](./0060-binder-parameters-line-shape-violable-by-embedded-newlines.md)
    (fixed 0.61.0) — first recorded the slot's deadness: §Fix constraint 5
    ("`binderPromptParamField` sets no `description` … item 4's
    ` — <description>` segment is unreachable from a `params:` block
    today") and §Fix (0.61.0)'s decision to leave the segment untransformed
    as dead code. Recorded as an implementation disposition; the spec side
    (normative renderings that no input reaches) was never filed.
  - [0103](./0103-binder-description-argument-hint-lines-forgeable-by-newline.md)
    (fixed 0.131.0) — its §Non-goals restates the same "no `params:` field
    populates it" fact. Items 2/3 (frontmatter description/argument-hint)
    are the *reachable* description lines; this report is the per-field
    segment only.
  - [Bug 0357](./0357-doc-comment-field-variant-anchors-refused.md) /
    [bug 0358](./0358-doc-comment-descriptions-never-lower.md) — if their fixes wire `///` descriptions
    end-to-end, the natural carrier question ("does a schema-field
    description flow onto the per-field line of a schema-typed `params:`
    field?") is exactly the adjudication this report asks the spec to pin.
    Note the reference rendering's `language: string` row is a *primitive*
    field — no named type exists to carry a description — so even that
    carrier cannot reach it.
- **Affected** (verified at af476df2, v0.347.0):
  - `docs/spec_topics/binder/binder-bypass-and-envelope.md:123` — item 4's
    conditional segment and its "per Descriptions" cross-reference;
    `:144–151` — the *Parameter-line reference renderings* table, normative
    ("MUST reproduce these exact byte sequences"), all three of whose rows
    (`:148–150`) carry a description: `language: string` with
    `description: "the language being reviewed"`, `focus_areas:
    array<string> = []` with `description: "comma-separated focus areas"`,
    and `author: Author` with `description: "the author of the code under
    review"` — field declarations with descriptions no grammar admits; `:83` — the illustration's three per-field lines elevated to
    normative via the same table.
  - `src/extension/production-theta-producer.ts:739–757` —
    `binderPromptParamField`, the sole production mapper into the prompt's
    per-field descriptor; sets no `description`, and its doc comment
    (`:745–746`) states the ground truth: "The `params:` syntax carries no
    per-field description, so that segment is always absent."
  - `src/binder/binder-system-prompt.ts:258–272` — `renderBinderParamLine`;
    the `description` branch (`:266–270`) is reachable only from tests, and
    per its doc (`:246–251`) deliberately receives no line-break transform
    because "no `params:` field populates one" — an invariant only the
    caller's comment enforces.
  - `src/parser/frontmatter.ts:1050–1090` — the `params:` field loop:
    records wire name, type source, default source; no description-shaped
    input exists to record.
- **Observed at:** 0.347.0 (af476df2). Offline, deterministic: scratch
  vitest over `parseDoc` (carrier probes below; deleted) plus code read at
  the citations above.

## Summary

The binder system prompt's per-field template is
`<wire-name> (<type>) <requirement>[ — <description>]`, and the spec makes
the description arm conditional on "the field carr[ying] a non-empty
`description:` (per Descriptions…)". No such carrier exists:

- Descriptions' anchor list has no `params:`-field position; `///` is theta
  body syntax, and inside the frontmatter YAML block it is not comment
  syntax at all.
- The `params:` RHS grammar is `type [= default]` — no description half.
- The reference-rendering table's description-bearing rows include
  primitive and generic fields (`language: string`, `focus_areas:
  array<string>`), so a named-schema-type description (even once
  `[bug 0358](./0358-doc-comment-descriptions-never-lower.md)` wires lowering) could not supply
  those either.

The implementation agrees and hard-codes the absence. The net state: a
normative MUST-reproduce table none of whose three rows any conforming
input can elicit, a conditional item-4 arm whose positive half is untestable, and a
rendering branch kept alive for a caller that cannot exist.

## Reproduction

Offline, at af476df2.

Carrier probe 1 — `///` inside the `params:` block is a YAML error, not a
description:

```
---
mode: prompt
params:
  /// the language being reviewed
  language: string
---
```

→ `error theta/load/malformed-frontmatter-yaml`, frontmatter `null`, theta
refused. Control: a `#` YAML comment in the same position parses clean and
records nothing (YAML comments are discarded before the field loop).

Carrier probe 2 — code read: `ParamFieldInput` / `BypassParamsField`
(recorded at `frontmatter.ts:1050–1090`) carry `{ name, typeSource,
defaultSource?, nullable }`; no description field exists in the record
shape, so `binderPromptParamField` has nothing to map even in principle.

Consequence: for every registrable theta, every per-field line ends at
`<requirement>` (the fourth, prose-stated description-omitted reference
rendering at `:152`). All three table rows at
`binder-bypass-and-envelope.md:148–150` — `  language (string) required
— the language being reviewed`, `  focus_areas (array<string>) default=[]
— comma-separated focus areas`, and `  author (Author) required — the
author of the code under review` — are dead oracles: no input reaches
`renderBinderParamLine` with `description` set outside hand-built test
descriptors.

## Expected behaviour

One of the two, decided in the spec:

- A named authoring surface for a `params:`-field description, with the
  Descriptions cross-reference made true (e.g. a description position in
  the `params:` grammar, or a pinned flow from a schema-typed field's
  `$defs` description — noting the primitive-field rows rule the latter
  out as stated); **or**
- the segment pinned as reserved/currently-unreachable: item 4's
  conditional arm marked as having no theta 1.0 carrier, and the three
  description-bearing reference renderings either removed from the
  MUST-reproduce set or annotated as forward-looking oracles for the
  renderer function, not for any theta input.

What is not acceptable is the current state: "MUST reproduce these exact
byte sequences" over inputs described as theta source ("Field declaration
(Theta source)") that the language cannot spell.

## Actual behaviour / root cause

The spec's item 4 was drafted with a per-field description concept
(mirroring the illustration's `language … — the language being reviewed`
lines) and grounded on Descriptions via cross-reference, but Descriptions
only defines anchors in theta *body* syntax; the frontmatter `params:`
grammar was never given a description half
(`frontmatter/frontmatter-fields-a.md:58`/`:60` define exactly the type and
default
halves). The implementation implemented the truth (`binderPromptParamField`
comment) and 0060 §Fix recorded the resulting dead render branch, leaving
the spec's unreachable normative rows standing. Every subsequent
strengthening pass (0103/0209 items 2/3) touched the reachable description
lines and left item 4's segment as-is.

## Why it matters

- A normative reference rendering that no input reaches is an
  unfalsifiable obligation: a conformance suite keyed on the table
  necessarily fakes its inputs (as `tests/binder-system-prompt.test.ts`
  does, hand-building `SystemPromptParamField` records), so the table
  cannot catch a renderer regression *from theta source* and misleads
  readers about what authors can do — the illustration reads as a feature
  advertisement.
- The dead branch carries a real latent hazard the moment any future
  carrier lands: `renderBinderParamLine` interpolates `description` with no
  line-break transform (deliberately, per its doc), so the first wiring of
  a real carrier re-opens the 0060/0103 forged-structural-line class at
  item 4 unless the fix re-visits the slot. Pinning the carrier decision in
  the spec is what makes that re-visit discoverable.
- Binder quality: the segment is the binder model's only per-field prose
  channel; whether theta wants to offer it (and from where) is a real
  design decision currently encoded as an accident.

## Non-goals

- **The lowering gap** (`[bug 0358](./0358-doc-comment-descriptions-never-lower.md)`) and the
  **placement refusal** (`[bug 0357](./0357-doc-comment-field-variant-anchors-refused.md)`) —
  independent defects; fixing both still leaves this
  report's question open for primitive-typed fields.
- **Items 2/3** (`Description:` / `Argument hint:` lines) — reachable,
  fixed surfaces (0103/0209/0299); untouched here.
- **The renderer's description branch behaviour on test-built inputs** —
  correct for the bytes it is handed (em-dash separator, omission on
  empty); not contested.

## Fix

Not yet decided between the two Expected-behaviour arms. Constraints:

1. The adjudication is spec-first: item 4's conditional arm, the
   cross-reference, and the reference-rendering table move together in one
   commit; `docs/reference/` mirrors (none currently carries the table —
   verified: no reference page mirrors §System-prompt structure) checked in
   the same pass.
2. If a carrier is introduced, the fix inherits
   [0060](./0060-binder-parameters-line-shape-violable-by-embedded-newlines.md)
   residual (iii) — the third slot is interpolated with no line-break
   transform — and must close it in the same commit: the segment gets the
   item-2/3 line-break discipline (or the 0060 two-arm rule — decide
   which, since a field description is prose) and
   `renderBinderParamLine`'s "no transform needed" doc contract is updated
   in the same commit; otherwise the 0060/0103 forged-structural-line
   class re-opens at item 4.
3. If the segment is pinned reserved, `binderPromptParamField`'s comment
   and `renderBinderParamLine`'s doc become the implementation mirror of a
   stated spec disposition instead of private knowledge, and the three
   dead table rows stop being "Theta source" claims.
4. No behaviour change for any registrable theta at HEAD (all render the
   description-omitted form); byte-stability of the shipped fourth
   rendering.

## Provenance

Fresh find as a spec gap (README sweep: no report files the unreachable
normative renderings; 0060 records the implementation-side deadness as a
§Fix constraint/residual, never the spec side). Probed at af476df2: scratch
`parseDoc` probes for the two carrier candidates (`///`-in-YAML,
`#`-comment; deleted); code read
`production-theta-producer.ts:739–757`,
`binder-system-prompt.ts:175–181/:246–272`, `frontmatter.ts:1050–1090`.
Spec read: `binder-bypass-and-envelope.md:83/:110–152`,
`descriptions.md:35–38`, `frontmatter/frontmatter-fields-a.md:58–60`.

## Fix (0.373.0)

- What shipped (records-only; Arm (b) — pin the segment RESERVED):
  - `docs/spec_topics/binder/binder-bypass-and-envelope.md` — §System-prompt structure item 4's conditional ` — <description>` arm rewritten to pin the segment RESERVED with no theta 1.0 carrier: no authoring surface attaches a description to a `params:` field, the `params:` RHS grammar is `type [= default]` with no description half, and the Descriptions `///` anchor list (schema/enum decl, schema field, enum variant, `fn`) carries no `params:`-field position, so its normalisation never reaches the slot (items 1+3). The near-carrier is acknowledged: a schema-typed field's `///` on its named TYPE lowers into the type's `$defs` description, NOT the field's, and does not flow onto the parameter line; a primitive-typed field has no named type to carry one. The *Parameter-line reference renderings* table re-labelled from "Theta source" MUST-reproduce rows to RENDERER-LEVEL oracles normative for `renderBinderParamLine` alone, marked unreachable from any registrable theta, byte sequences kept verbatim (item 2). Forward pin added: any future carrier MUST first extend items 2/3's line-break discipline to the third slot before wiring it (item 4; 0060 residual (iii) made discoverable; no code transform now).
  - `src/extension/production-theta-producer.ts` — `binderPromptParamField` comment now mirrors the spec disposition (RESERVED slot, no carrier) and cites §System-prompt structure item 4 (item 5; comment-only).
  - `src/binder/binder-system-prompt.ts` — `renderBinderParamLine` doc now mirrors the spec disposition and states the future-carrier line-break obligation, citing the spec section (item 5; comment-only).
  - `tests/binder-system-prompt.test.ts` — the three hand-built description-bearing descriptor cells annotated as RENDERER-LEVEL oracles (reserved-slot byte pins for a future carrier), kept not deleted (item 6; comment-only).
- Re-measured premise (holds): `binderPromptParamField` sets no `description` post-0358 — it returns `{wireName, type, requirement}` only. The adjudication's premise stands.
- Gates: full suite `npx vitest run` → 550 files / 10232 tests green (identical to fork baseline 074740b1); `npm run typecheck` clean; `npm run lint` clean; live `npx vitest run --config config/vitest/vitest.live.config.ts tests/live/acceptance/noninteractive-acceptance.test.ts -t "runs the binder off-session"` → PASS under the live lock (H9a-T(d) params binder off-session render — adjacent existing cell; NO registration/drive change, so no new cell).
- Review: 1 round. R1 (`bug-fix-reviewer`, deep) — CLEAN. Independently re-derived the diff, confirmed all six adjudication items, confirmed no assertion / no executable line changed, STYLE/CLAUDE compliance.
- Verification: PASS. `bug-fix-verifier` (lean) plus orchestrator gate re-runs and the independent deep review all discharge the obligations (records-only fix: no behavioural Phase-1 witness to revert→red; every `.ts` change is comment-only and every `.md` change prose-only by `git diff -U0`; the RESERVED-slot disposition verified TRUE against re-measured production — `binderPromptParamField` returns `{wireName, type, requirement}` only).
- Residuals: R1 (non-blocking, follow-up) — the `### Binder system prompt` illustration intro still reads "a conforming implementation MUST emit those bytes verbatim for the inputs shown"; now true (it defers to the renderer-oracle table) but carries no reserved qualifier. Naming it would widen scope beyond adjudication items 1–6 / §Fix constraint 1, so left for a follow-up.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: Arm (a) (an authoring surface for a `params:`-field description) is NOT taken — the segment is pinned reserved. No behaviour change for any registrable theta; the shipped description-omitted rendering is byte-stable. The renderer's description branch and its byte pins are retained for a future carrier.
