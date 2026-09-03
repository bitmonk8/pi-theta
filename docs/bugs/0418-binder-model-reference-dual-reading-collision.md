# Bug 0418 — A binder-model reference that is simultaneously a valid `provider/modelId` reference and an existing slash-carrying bare `Model.id` resolves silently by the provider/id reading: against the current host registry (openrouter ids like `anthropic/claude-sonnet-5`) the same string names two distinct available models under the spec's two accepted readings, the parse rule orders neither, and its own ambiguity posture elsewhere is refuse-not-pick

- **Status:** fixed (0.399.0).
  registry computation); the collision class is live-real — the registry the
  live suite runs against exhibits it today, and the winning reading decides
  which provider serves every subsequent binder call.
- **Sev/Diff estimate:** S2/D3 — silent pick between two spec-admitted readings against the corpus's refuse-not-pick posture: a verbatim openrouter id binds through a different provider/api/billing with zero diagnostics, live-real on four registry strings today; fix requires a spec ordering-vs-refusal decision before any code or conformance pin.
- **Kind:** spec gap with implementation corroboration. The parse rule
  (`docs/spec_topics/binder/binder-model-and-context.md`
  `#binder-model-parse-rule`) says "The resolver accepts both a canonical
  `provider/modelId` reference and a bare `modelId`", defines each reading's
  exact match, and pins the anti-pick-first posture for the one ambiguity it
  anticipates ("A bare `modelId` that matches models under more than one
  provider is ambiguous, resolving to no model (not pick-first)"). It does
  not say what a string satisfying BOTH readings resolves to. The
  implementation hard-orders them: any reference containing `/` is split at
  the FIRST slash and tried as `provider/modelId` only — the bare-id reading
  is never applied to a slash-carrying string, and no diagnostic marks the
  shadowed second reading.
- **Related:**
  - [0169](../../../docs/bugs/0169-bare-id-model-preflight-ambiguous-refusal.md)
    — fixed (0.89.0). The bare-id ambiguity ACROSS providers (the case the
    spec does anticipate) and `matchAvailableModel`'s no-match/ambiguous
    collapse; this report is the cross-READING ambiguity the same rule text
    leaves unordered.
  - [0064](../../../docs/bugs/0064-binder-temperature-400-newest-anthropic-models.md)
    — fixed (0.94.0). Context: which concrete model a reference resolves to
    now selects per-(api, model-id) request-shape rows (temperature), so a
    reading flip changes the constructed request, not just the endpoint.
- **Affected** (citations verified at HEAD `c2c25d81`, v0.398.0):
  - `src/extension/reload-wiring.ts:518–546` — `createModelReferenceMatcher`
    (the load-time resolver shared by `bind_model:` / `theta.binderModel` /
    `model:`): `reference.indexOf("/") >= 0` selects the provider/id filter
    exclusively; the bare-id filter runs only for slash-free strings.
  - `src/binder/binder-model.ts:116–130` — `matchAvailableModel` (the
    runtime re-resolution the binder dispatch uses): the same first-slash
    split, so load and dispatch agree on the pick.
  - `docs/spec_topics/binder/binder-model-and-context.md`
    `#binder-model-parse-rule` (`binder-model-and-context.md:10`) — accepts
    both readings, orders neither; the worked examples (`claude-haiku` bare, `anthropic/claude-haiku`
    qualified) never exercise a string that parses under both.
- **Observed at:** v0.398.0, HEAD `c2c25d81`. Registry evidence live
  (`ModelRegistry.getAvailable()` as configured for `npm run test:live`);
  resolution behaviour desk-verified against the shipped matcher sources.

## Summary

The host registry serves models whose bare `Model.id` contains a slash:
every openrouter-routed model (`anthropic/claude-sonnet-5`,
`anthropic/claude-fable-5`, `openai/gpt-4o`, …, provider `openrouter`).
Against the current catalog (575 rows) exactly four strings satisfy both
readings: `anthropic/claude-fable-5`, `anthropic/claude-opus-5`,
`anthropic/claude-sonnet-5`, and `openrouter/auto` — and `claude-sonnet-5`
is the live suite's preferred model, so the colliding pair is exercised on
every live run. For such ids the string `anthropic/claude-sonnet-5` is simultaneously:

1. the canonical `provider/modelId` reference for the anthropic-served
   `claude-sonnet-5` (api `anthropic-messages`), and
2. the exact bare `Model.id` of openrouter's `anthropic/claude-sonnet-5`
   (api `openai-completions`) — a distinct available model with a different
   provider, api, endpoint, and billing.

The spec's exact-match rule defines both readings and resolves neither
ordering; its only stated ambiguity posture (bare id across providers) is
refuse-not-pick. The implementation silently applies the provider/id
reading whenever a slash is present. Consequences:

- A reference matching both readings resolves with zero diagnostics to
  reading 1. An author who copied an openrouter model id verbatim (the id
  string openrouter surfaces) intends reading 2 and silently binds through
  a different provider and api.
- A slash-carrying bare id is unreachable by its own spelling; it must be
  written double-qualified (`openrouter/anthropic/claude-sonnet-5`), a form
  no spec example shows and the first-slash split only incidentally parses
  correctly (provider `openrouter`, id `anthropic/claude-sonnet-5`).

The strings the shipped live suites derive (`<provider>/<id>` —
`tests/live/live-production-acceptance.test.ts:6474`, `:10948`, and
`tests/live/acceptance/harness.ts:379`) are themselves double-readable
against this registry when the resolved model is one of the four colliding
entries: under a both-readings-then-ambiguity implementation of the same
spec text, those thetas would refuse to load with
`theta/load/binder-model-unresolved`. Which implementation is conforming is
currently undecidable from the spec. The same file's hardcoded
`bind_model: anthropic/claude-haiku-4-5` literals do NOT collide (openrouter
spells that id `anthropic/claude-haiku-4.5`), so the refusal-reading
exposure is confined to the derived-string cells. 0169's pre-flight
re-derivation (`${model.provider}/${model.id}`,
`production-theta-producer.ts:2682`) always intends reading 1, so this gap
does not resurrect 0169.

## Reproduction

At `c2c25d81`, against the configured live registry:

1. `ModelRegistry.getAvailable()` contains BOTH
   `{provider:"anthropic", id:"claude-sonnet-5", api:"anthropic-messages"}`
   and `{provider:"openrouter", id:"anthropic/claude-sonnet-5",
   api:"openai-completions"}` (recorded in the hunt census, this area's log).
2. `matchAvailableModel("anthropic/claude-sonnet-5", available)` →
   `indexOf("/") >= 0` → filters `provider==="anthropic" &&
   id==="claude-sonnet-5"` → exactly one → the anthropic model. The
   openrouter model whose bare id equals the whole reference is never
   consulted (`src/binder/binder-model.ts:120–128`).
3. A theta with `bind_model: anthropic/claude-sonnet-5` therefore loads and
   binds through the anthropic-messages api — observed in every live probe
   in this hunt — with no signal that a second exact match existed under the
   rule's other accepted reading.

## Expected behaviour

Undecided by the spec — that is the gap. The rule must either:

- pin the ordering (slash present ⇒ provider/id reading only, bare-id
  reading reserved for slash-free strings — the shipped behaviour), stating
  that slash-carrying ids are nameable only in double-qualified form; or
- pin cross-reading ambiguity as a refusal, consistent with the corpus's
  refuse-not-pick posture, in which case the shipped silent pick (and the
  live suites' `<provider>/<id>` derivations) is non-conforming on this
  registry. Precedent rows: the parse rule itself
  (`binder-model-and-context.md:10`, "ambiguous, resolving to no model (not
  pick-first)"); the `theta/load/model-unresolved` registry row
  (`diagnostics/code-registry-load.md:41`, "or is ambiguous across
  providers"); `theta/parse/ambiguous-discriminator` (`schemas.md:109`, "If
  multiple qualify … Declare explicitly"); and DISC-4's cross-format
  collision drop (`discovery/discovery-sources.md:78`).

## Actual behaviour / root cause

`createModelReferenceMatcher` and `matchAvailableModel` both branch on
`indexOf("/")` before any matching, so the two spec readings are never in
competition at runtime; the ordering is an implementation choice the spec
text does not record. No diagnostic (load warning or otherwise) exists for
"the other reading also matched".

## Why it matters

1. Slash-carrying model ids are no longer exotic: every openrouter model id
   is one, and openrouter-style `vendor/model` ids are the form authors see
   in provider UIs and docs.
2. The pick decides provider, api, endpoint and billing for every binder
   call the theta ever makes, and (post-0064) the request shape itself
   (temperature placement is keyed on the resolved (api, model-id) pair).
3. The same shared matcher resolves the theta's own `model:` and the
   subagent child pre-flight (bug 0169's surface), so the gap is not
   binder-local.

## Fix

Spec decision first (one sentence in `#binder-model-parse-rule` choosing an
ordering or a refusal), then either a conformance test pinning the shipped
first-slash split (ordering chosen) or a matcher change plus a
`theta/load/binder-model-unresolved` widening (refusal chosen). If the
ordering is chosen, a worked example naming a slash-carrying id
(`openrouter/anthropic/claude-sonnet-5`) belongs beside the existing two.

## Non-goals

- **Which model authors "really mean".** Both readings are defensible; the
  defect is the silence, not the pick.
- **The bare-id-across-providers ambiguity.** Already pinned
  (refuse-not-pick) and implemented; bug 0169 covered its one mis-reader.
- **Registry hygiene** (whether a host should serve slash-carrying ids).
  Host-owned; theta's rule must be total over what `getAvailable()` returns.

## Provenance

- Spec: `docs/spec_topics/binder/binder-model-and-context.md`
  `#binder-model-parse-rule` (both-readings sentence, exact-match rule,
  ambiguity posture, worked examples).
- Implementation at `c2c25d81`: `src/extension/reload-wiring.ts:518–546`;
  `src/binder/binder-model.ts:116–130`;
  `tests/live/live-production-acceptance.test.ts:6474`, `:10948` and
  `tests/live/acceptance/harness.ts:379` (the `<provider>/<id>` derivations
  producing double-readable strings);
  `src/extension/production-theta-producer.ts:2682` (the 0169 pre-flight
  re-derivation, reading 1 by construction).
- Live registry evidence at `c2c25d81`: the hunt census
  (`.pi/bug-hunt/logs/live-binder-hc3.md`) recording both colliding entries
  in `getAvailable()`.

## Fix (0.399.0)

- What shipped: `docs/spec_topics/binder/binder-model-and-context.md` `#binder-model-parse-rule` — one ordering sentence pinning the shipped first-slash split (a reference containing a slash is parsed exclusively as `provider/modelId`, split at the FIRST slash; the bare-`Model<Api>.id` reading applies only to a slash-free reference; a model whose bare id itself contains a slash is shadowed by the provider/id reading and is nameable only in double-qualified form), plus a third worked example (`bind_model: openrouter/anthropic/claude-sonnet-5` → provider `openrouter`, id `anthropic/claude-sonnet-5`) beside the existing two. No matcher/production change, no new diagnostic code, LPA never edited (§Fix Option A — ORDERING, parent-adjudicated).
- Gates: witness `tests/b0418-binder-model-reference-first-slash-ordering.test.ts` — 8/8 green at fork (this pins EXISTING behaviour, so green-by-design; the witness is the REVERSE red-proof: inverting either matcher's ordering to try both readings reds the double-readable cell — `expected 'ambiguous' to be 'resolved'` — restored byte-exact by `git hash-object`). Full default suite 571 files / 10439 tests green (one real-spawn flake, `shared-subtree-…` bug 0276, green isolated in 13.8s — parallel-load noise, off surface). Typecheck `tsc -p tsconfig.json --noEmit` exit 0. Lint `eslint "src/**/*.ts"` exit 0.
- Review: 1 round — `bug-fix-reviewer` CLEAN. Counterfactual analysis proved the test reds under both-readings, bare-id-first, and last-slash implementations; fidelity to Option A, spec correctness against both matchers (`matchAvailableModel`, `createModelReferenceMatcher`), and the 0169 cross-provider refuse-not-pick controls all verified; scope confirmed spec-doc + new test only.
- Verification: `bug-fix-verifier` PASS — (1) witness genuine via reverse red-proof, restored byte-exact (hash `eefd2bd3…`); (2) full suite 571/10439 green; (3) live adjacent binder cell `tests/live/withheld-binder-provenance-live-cell.test.ts` 1/1 (rc=0, orchestrator-run under the global live lock) driving real binder-model resolution through `bootShippedExtension` against the live registry serving the colliding openrouter ids; (4) typecheck + lint clean; scope confirmed — only the spec doc modified and the b0418 test added, with the LPA, `tests/fixtures/h7a/permitted-codes.json`, and the 14864-line `tests/live/live-production-acceptance.test.ts` all untouched.
- Residuals: none.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: Option B (REFUSAL) is NOT taken. The parent adjudicated Option A (ORDERING): the qualified `provider/modelId` reading is the spec's taught primary (the worked example's shape), the shadowed slash-carrying bare id keeps the well-defined double-qualified escape spelling, and A is total and stable over `getAvailable()`, whereas B would retroactively break existing thetas on any registry acquiring a mirror, red the LPA-pinned derived-string cells (`live-production-acceptance.test.ts:6474`/`:10948`, uneditable under the LPA law), and make load outcomes host-config-dependent. The defect, per the doc's own Non-goals, was THE SILENCE — cured at spec level; "which model authors really mean" and registry hygiene stay out of scope. No behaviour change, so no new live cell was owed.
