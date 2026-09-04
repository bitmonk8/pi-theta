# Bug 0422 — An imported-schema `system:` param admits any `.Ident` chain: `${author.typo}` draws no `theta/parse/system-interp-bad-field`, renders the literal text `undefined` into the child's system prompt, and a `Result`-valued opaque param silently drops the entire system prompt

- **Status:** fixed (0.435.0).
- **Sev/Diff estimate:** S1/D3 — a typo'd field name loads with zero
  diagnostics and ships the eight bytes `undefined` into the surface that
  conditions every turn of the spawned child (the silent-wrong-value class),
  and the `Result` face silently deletes the whole `system:` prompt; D3
  because the 0406 premeasure (E1–E5) falsified both parse-phase fix routes —
  the sync `FileSystem`-free parser cannot see a `.thetalib`'s fields — so any
  fix is a load-phase or render-phase design decision coordinated with the
  imports surface.
- **Kind:** defect — the path grammar states a MUST the implementation does
  not enforce for the imported-schema class
  (`docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md:42`:
  "each subsequent `.Ident` must name a reachable field of an *object* schema
  in the theta-side `params:` declaration"), the registered trigger for
  `theta/parse/system-interp-bad-field` describes exactly this input
  (`docs/spec_topics/diagnostics/code-registry-parse.md:131`), and the render
  additionally violates QRY-18's stated purpose
  (`docs/spec_topics/query/query-escapes-stringification.md:16`: rendering is
  by static type, *not* by JavaScript defaults that "would silently corrupt
  prompts without any diagnostic for the author"). The disposition is a
  DELIBERATE shipped residual: bug 0406's parent adjudication (Rec A) chose
  admit-at-parse and designated this exact case a "filing candidate for the
  next hunt" (0406 §Fix (0.404.0) residual 1); `tests/b0406-*.test.ts` W7 pins
  the behaviour as documented. This report is that designated filing.
- **Related:**
  - [0406](./0406-object-typed-params-misclassified-string.md)
    (fixed 0.404.0) — the parent. Its fix classified imported-schema params as
    `opaque-object` (admit any `.Ident`, refuse nothing) after premeasures
    E1–E5 falsified both import-resolution orderings for a parse-time field
    carry; residual 1 is this report.
  - [bug 0423](./0423-imported-schema-bare-render-theta-side-names.md) — the sibling face on the SAME parse-time
    invisibility (bare `${author}` renders theta-side names): different
    consumer (sidecar construction vs path validation), different normative
    sentence, disjoint fix machinery — two reports by mechanism.
  - [bug 0427](./0427-alias-schema-param-permissive-string-terminal.md) — the alias/head-only class falls out of
    the same `toSystemParamType` dispatch one arm earlier, with a worse
    terminal (`string`-kind cast).
  - [0079](./0079-interpolated-result-unemitted-private-encoding-rendered.md)
    (fixed 0.69.0) — established the `Result`-interpolation disposition. Its
    §Non-goals (`:324`) pins "the `system:` interpolation surface, which
    cannot carry a `Result` by construction" — a sentence 0406's own fix
    FALSIFIED: row 3 below is exactly the input class it declared
    unreachable.
  - [0114](./0114-nested-result-in-interpolated-object-leaks-carrier.md)
    (fixed 0.108.0) — repeats the same by-construction claim (§Non-goals
    `:620`, grounded on the pre-0406 `system-interpolation.ts:383–389` — the
    very lines 0406 rewrote into the `opaque-object` admit arm) and pins
    (§Pinned dispositions `:1123`) that the `system:` surface "keeps no
    `result` arm"; `interpolationTypeOfValue` (`:552–554`) now has one,
    reached only from this surface. 0406's fix falsified both sentences.
  - [bug 0429](./0429-imported-schema-ctor-field-set-never-judged.md) — the imports-side face of the shared
    root: the parser is sync + FileSystem-free (`ParseThetaDocumentDeps =
    {systemNote, modelMatcher}`), so imported members do not exist at parse;
    that candidate consumes the missing data at body expression sites
    (`import-static-checks.ts`), this one at the frontmatter template.
    Coordination: if §Fix route (a) is chosen, the load-phase template
    revalidation is another site in the same import-resolution pass —
    schedule after/with imports-exports-2/02; do not merge.
  - [0028](./0028-unresolved-annotation-silent-permissive-lowering.md)
    (fixed 0.38.0) — the permissive-`{}` lowering family; the `Result` face
    below is reachable because an imported symbol still lowers `{}`
    permissively at the `params:` position
    (`src/parser/theta-document.ts:1647–1656`), which is imports-side ground
    (noted for that hunter), while the render-side silent prompt drop is this
    area's.
- **Affected** (verified at 04579e12, v0.415.0):
  - `src/parser/system-interpolation.ts:383–387` — the `.Ident` walk's
    `opaque-object` arm: every step is admitted (`continue`), no field set is
    consulted, `current` stays `opaque-object` so arbitrarily deep chains all
    admit.
  - `src/parser/system-interpolation.ts:403–404` — the opaque terminal is
    marked `valueDriven`; `:559–580` (`resolvePath`) walks the runtime record,
    yielding JS `undefined` for a walked-off or null-intermediate step;
    `:533–557` (`interpolationTypeOfValue`) maps `undefined` to the object row
    and a `Result` value to `{ kind: "result" }`.
  - `src/render/query-render.ts:416–430` — the object row `JSON.stringify`s
    the resolved `undefined`; the producing `text += rendered.text`
    (`system-interpolation.ts:499–521`) coerces it to the literal text
    `undefined`.
  - `src/extension/production-theta-producer.ts:2242–2245` — the spawn site's
    `!ok` fallback: `if (rendered.ok) { systemPrompt = rendered.text; }` with
    no `else` — a failed render silently leaves `systemPrompt` undefined; no
    diagnostic, no system note. The whole-prompt-drop chain: `:2242` (no
    `else`) → `:2466` (`systemPrompt: systemPrompt ?? ""`) →
    `src/runtime/subagent-launcher.ts:452–453` (`--system-prompt ""`; the
    launcher's comment: both hosts treat a falsy value as "no CLI system
    prompt" and fall back to their BUILT-IN DEFAULT) — the author's declared
    `system:` is entirely absent and the child runs under the host's default
    system prompt.
- **Observed at:** v0.415.0 (04579e12). Offline, deterministic: scratch vitest
  over `parseDoc` (`tests/helpers/e2e-s1.ts`) + `renderSystemPrompt` — the
  exact call pair the spawn site runs (run and deleted).

## Summary

An imported `.thetalib` schema's fields are invisible to the synchronous,
`FileSystem`-free frontmatter parser, so bug 0406's fix classifies such a
param `opaque-object`: any `.Ident` chain is admitted at parse and the render
selects the canonical row from the resolved value's runtime kind. Three
consequences, all with zero diagnostics on a document that registers:

1. A typo'd field (`${author.typo}`) — precisely the authoring mistake
   `system-interp-bad-field` exists to catch — is admitted, resolves to JS
   `undefined`, and renders the literal text `undefined` into the child's
   `--system-prompt`.
2. Deep chains (`${author.a.b.c}`) admit unconditionally; a `null` or absent
   intermediate takes `resolvePath`'s guard and renders `undefined` the same
   way.
3. A `Result`-valued param value — which
   `frontmatter-fields-b-and-templates.md:46` says "cannot fire here" —
   reaches `interpolationTypeOfValue`'s `result` arm, fails the render, and
   the spawn site's silent `!ok` fallback deletes the ENTIRE system prompt:
   the child spawns with `--system-prompt ""` and runs under the host's
   built-in default where the author declared context.

## Reproduction

At 04579e12, offline, `parseDoc` + `renderSystemPrompt`:

| params / body | `system:` | render input | observed |
|---|---|---|---|
| `author: Author` + `import { Author } from "./types.thetalib"` | `'Hi ${author.typo}'` | `{author: {name: "Ada"}}` | zero diagnostics; `{"ok":true,"text":"Hi undefined"}` |
| same | `'X ${author.a.b.c}'` | `{author: {a: null}}` | zero diagnostics; `{"ok":true,"text":"X undefined"}` |
| same | `'Hi ${author}'` | `{author: Ok(1)}` (`makeOk(1)`) | `{"ok":false,"diagnostic":{code:"theta/parse/interpolated-result",…}}` — at the spawn site (`production-theta-producer.ts:2242–2245`) this leaves `systemPrompt` undefined with no diagnostic on any channel |

Control: the same `${author.typo}` against a body-declared
`schema Author { name: string }` draws
`theta/parse/system-interp-bad-field` and the theta does not register
(pinned by `tests/b0406-*.test.ts` G1 for the inline-object class).

Reachability of row 3 is established by code read only — no end-to-end
`invoke(...)`-with-`Result`-argument drive was executed. The chain: the
imported symbol's `params:` lowering is the permissive `{}` (`theta-document.ts:1647–1656` comment: "an imported symbol
lower[s] permissively to `{}`"), so an `invoke("./callee.theta", <arg>)`
argument of ANY shape — a `Result` included — passes the AJV validation gate
(`projectForValidation` passes `Result` through unchanged,
`src/runtime/wire-translation.ts:689–695`) and lands in `paramBindings`
unchanged. The permissive lowering itself is imports-side; the silent-drop
disposition of the render is this surface's. Row 3's terminal does not
depend on that reachability argument: the `:2242` swallow is silent for
EVERY `!ok` render, whatever the cause.

## Expected behaviour

- `frontmatter-fields-b-and-templates.md:42`: "each subsequent `.Ident` must
  name a reachable field of an *object* schema in the theta-side `params:`
  declaration." `Author`'s fields are declared — in the imported `.thetalib` —
  and `typo` is not one of them; the MUST prescribes refusal.
- `code-registry-parse.md:131` pins the trigger: "A `.Ident` step in a
  `system:` `${...}` path does not name a reachable theta-side `params`
  object field" → `theta/parse/system-interp-bad-field` (E). The code is
  registered for exactly this input and never fires for the imported class.
- `query-escapes-stringification.md:16` (QRY-18): rendering is by Theta
  static type, "*not* by JavaScript's default `String(...)`", whose defaults
  "would silently corrupt prompts without any diagnostic for the author".
  `undefined` is not a Theta value, appears in no table row, and is exactly
  such a silent corruption.
- `frontmatter-fields-b-and-templates.md:46`: "The `Result<T, E>` row of that
  table cannot fire here — `params:` types do not include `Result`." The
  implementation makes it fire (row 3), and the consequence — the whole
  prompt silently dropped — is prescribed nowhere. QRY-18's containment
  notes (`:32–:33`) prescribe that the runtime renderer PANICS carrying
  `theta/parse/interpolated-result` when a `Result` is met; at this surface
  the prescribed panic became a discarded value — the render failure is
  returned as `!ok` and the spawn site throws it away.

## Actual behaviour / root cause

`toSystemParamType` classifies an imported name `opaque-object`
(`src/parser/frontmatter.ts:1029–1035`) because `collectBodyTypes` carries
imports as a name-only set — the parser is synchronous and `FileSystem`-free
(`ParseThetaDocumentDeps` carries only `{ systemNote, modelMatcher }`), so the
`.thetalib`'s field list does not exist at parse time. The `.Ident` walk's
`opaque-object` arm admits every step (`system-interpolation.ts:383–387`);
`resolvePath` yields `undefined` for the walked-off step (`:559–580`);
`interpolationTypeOfValue(undefined)` falls to the object row (`:533–557`,
whose own doc-comment names this residual); `JSON.stringify(undefined)`
returns JS `undefined` and the `text +=` concatenation coerces it to the
literal text (`:499–521`, `query-render.ts:416–430`). A `Result` value takes
the `result` arm instead and fails the render, which the spawn site swallows
(`production-theta-producer.ts:2242–2245`).

## Why it matters

- The system prompt is the contract-setting text for every query in the
  spawned conversation. A one-character field typo — the mistake the
  diagnostic family was specified to catch at parse — instead ships
  `undefined` where the author's context value was promised, invisibly: the
  theta registers, the spawn succeeds, and both the author and the model see
  plausible-looking text.
- The `Result` face is worse in kind: not one slot but the WHOLE `system:`
  field vanishes, and the only spec sentence about `Result` here asserts the
  case is unreachable.
- The same typo against a body-declared or inline-object schema is a
  load-time refusal — the enforcement asymmetry between declaration sites is
  itself the historically richest defect seam in this codebase.

## Non-goals

- The bare `${author}` render's missing wire renames — candidate
  system-templates-2/02 (different consumer of the same invisibility).
- The permissive `{}` lowering of imported symbols at the `params:` position
  and everything else about import LOAD semantics (resolution, visibility,
  what the FS-free parser could be given) — imports-exports-2 ground; this
  report takes the parse-time invisibility as given and files the render
  disposition.
- The `opaque-object` classification itself for the bare `${author}` admit —
  correct and required (`${param}` "is always allowed", :42).

## Fix

**Adjudicated (parent): route (a) + (c).** Shipped in 0.435.0 — see
`## Fix (0.435.0)` below. The 0406 premeasure constrains the space. E1–E5 falsified
both parse-phase routes (the registry `Phase = parse` pin plus the
synchronous `FileSystem`-free parser block moving `checkSystemInterpolation`
after import resolution AND a post-import second parse pass). Remaining
options:

- (a) **Load-phase template revalidation**: after import resolution (which
  does read the `.thetalib`), re-walk the parsed template's `opaque-object`
  paths against the now-known imported field sets and refuse with
  `system-interp-bad-field` at load severity. Cost: the code's registered
  `Phase = parse` needs a DIAG-2-governed registry amendment (or a sibling
  load-phase code), and the check runs in two phases.
- (b) **Render-time fail-closed**: at `renderSystemPrompt`, treat a resolved
  JS `undefined` on a `valueDriven` path as a render failure instead of a
  renderable value. Small seam, no new parse code — but it converts an
  authoring mistake into an invocation-time failure, and it lands in the
  spawn site's `!ok` fallback, which today is SILENT; that fallback must
  first gain a diagnostic (a `theta-system-note` naming the failed slot at
  minimum) or (b) trades one silence for another.
- (c) Independently of cause: the spawn site's `!ok` swallow is silent for
  EVERY cause, not only the `Result` face — any failed render today spawns
  the child under the host's built-in default prompt with no observable on
  any channel. Make the `!ok` arm emit an operator-visible note / refuse the
  spawn. This is worth doing under (a) or (b) as well.

Any fix must keep: bare `${author}` admitted for every declared param; the
`opaque-object` chain admit at parse (until a load-phase field carry exists,
parse cannot distinguish typo from valid); zero new diagnostics on the
already-refused local-schema classes.

## Fix (0.435.0)

- What shipped:
  - `src/extension/import-static-checks.ts` — route (a): a LOAD-phase re-walk
    inside `checkThetaImports` builds the real object shell for each
    directly-imported schema a `system:` template names (reusing
    `collectBodyTypes` + `toSystemParamType` over the resolved `.thetalib`'s
    own body) and refuses a walked-off `.Ident` step with the minted
    `theta/load/system-interp-bad-field`; an `opaque-object` (nested-import)
    intermediate admits, a non-object head shape (imported alias/head-only —
    0427's ground) is left admitted.
  - `src/parser/system-interpolation.ts` — mints/exports
    `LOAD_SYSTEM_INTERP_BAD_FIELD_CODE`.
  - `src/parser/frontmatter.ts` — exports `toSystemParamType`; adds
    `ParsedFrontmatter.systemRange` so the load diagnostic is Located.
  - `src/parser/theta-document.ts` — exports `collectBodyTypes`.
  - `src/extension/production-theta-producer.ts` — route (c): the spawn-site
    `!ok` render arm emits a `theta-system-note` naming the failed `system:`
    slot and refuses the spawn via `InvokeInfraCauseError("internal_error")`,
    instead of silently dropping the whole prompt to the host default.
  - `docs/spec_topics/diagnostics/code-registry-load.md` — new DIAG-2/DIAG-4
    row (GOV-15 diagnostic-registry carve-out; Located; direct-import scope).
    Premeasure: the *Phase* taxonomy is single-valued and closed (no compound
    `parse|load` cell; the only per-diagnostic resolution is *Sev* E/W; 0412
    widened a *Trigger* within one phase, not the *Phase* value), so the fix
    mints a sibling LOAD-phase code rather than widening the parse row's
    *Phase*. `docs/reference/diagnostics.md` mirror row;
    `docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md`
    two-stage-enforcement sentence (directly-imported).
- Gates: witness `tests/b0422-imported-schema-field-invisibility-load-refusal.test.ts`
  RED→GREEN (W(a1) load refusal, route(c) note+refuse; controls W(a2)/W(a3)/
  W(a4) nested-import admit / W(a5) alias-import admit); `tests/b0406-*.test.ts`
  W7 flipped to the load refusal; full default suite green (parallel-load
  hook/test timeouts on real-spawn files are known rotating noise, green
  isolated); `tsc -p tsconfig.json --noEmit` clean; `npm run lint` clean;
  `permitted-codes.json` byte-identical.
- Review: 2 rounds. R1 (deep) — 3 blockers: F1 nested-import intermediate
  wrongly refused, F2 imported alias-of-object head wrongly refused (0427's
  ground), F3 registry/spec prose overstated the whole imported class vs the
  direct-only impl; + residual R2 (stale W7 comment). Fixer resolved all + added
  W(a4)/W(a5) admit controls. R2 (fast) — CLEAN.
- Verification: VERIFIED — witness reds genuinely (neutralise-then-restore,
  byte-exact); full suite green modulo isolated-noise timeout; tsc + lint clean;
  non-regression (bare `${author}`, valid `${author.name}` load clean; zero new
  diagnostics on local-schema classes b0406 W1–W6/G1/G2, b0407, b0408). LIVE:
  `tests/live/acceptance/b0422live-imported-schema-system-interp-wire-and-refusal.test.ts`
  DIRECTION 2 — a walked-off imported field un-registers the callee at LOAD
  (real `pi -p`, real `.thetalib` import) → `invoke` resolves `Err` → prober
  answers 100; GREEN under the global lock, RED-proven (neutralised → the
  offline attribution guard reds: no `theta/load/system-interp-bad-field`).
- Residuals:
  1. Direct-import-only scope: a schema reached only through an
     `export … from` re-export chain is not re-walked at load (builds no shape)
     — documented residual mirroring the file's existing `importedFns`
     re-export withhold; the registry Trigger + frontmatter sentence are
     qualified to the directly-imported class to match.
  2. No dedicated cell for the in-scope scalar-*intermediate* load refusal
     (`${author.role.x}`, `role: string` — bug doc Summary consequence 2); the
     code path is present and correct (verified by review read).
  3. An imported *enum* param in `system:` stays unjudged at load (consistent
     with the imported-*schema* scope) — follow-up family material.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: opaque-object admit AT PARSE stays (load
  replaces the parse gap); bare `${author}` admitted for every declared param;
  body-expression sites (bug 0429) and L4's 0424/0425/0426 untouched.

## Provenance

Designated filing: bug 0406 §Fix (0.404.0) residual 1 ("Filing candidate for
the next hunt"), behaviour pinned by `tests/b0406-*.test.ts` W7
(`"W7: imported-schema walked-off `${author.typo}` renders the literal
`undefined`"`). Probed fresh at 04579e12 with scratch vitest
`tests/scratch-system-templates-2.test.ts` (rows C01a–C01c; deleted). Spawn
threading and the silent `!ok` fallback verified by code read at
`production-theta-producer.ts:2227–2246, 2466`.
