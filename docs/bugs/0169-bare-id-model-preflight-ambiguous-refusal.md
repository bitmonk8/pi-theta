# Bug 0169 — PIC-62 obligation 2's child-side model pre-flight re-resolved the marshalled reference by BARE model id, and `matchAvailableModel` answers `undefined` for *ambiguous* with the same value it answers for *no match*: on a host registry serving one id through two providers (a first-party endpoint beside a gateway) the child read a resolvable model as total non-resolution, refused the invocation with `theta/runtime/subagent-model-preflight-mismatch` naming `(unresolved: no matching model)`, and every subagent-mode invocation on that registry failed — while the marshalled reference carried both halves the qualified form needs

- **Status:** fixed (0.89.0) — landed at HEAD `3752003f` on `feat/omp-host-support`
  (external PR #1, host-agnostic fix 4; the producer-level witness added in
  review round 1). `package.json` reads `0.88.0` at that commit: the release
  commit assigns the number.
- **Sev/Diff estimate:** S2/D2 — S2 because a conformant invocation on a legal
  registry shape was refused loudly rather than mis-executed: no wrong value
  reached a body, the failure carried a registered code, and the blast radius is
  the whole subagent-mode feature on any host whose registry serves the
  marshalled id through more than one provider. D2 because the settled fix is one
  expression pair inside one method of one subsystem plus one spec sentence, with
  no new registered code, no Message-template change and an ordinary offline
  witness file.
- **Kind:** defect — the implementation re-resolved a reference by a key the
  corpus's own match rule declares non-unique, and read the resulting
  `undefined` as a verdict it does not carry. Three elements, cited at HEAD
  `3752003f` (the pre-fix element at `faac6841`, v0.88.0, by `git show`).
  1. *The key was the bare id.* The pre-flight inside `driveSubagentRootRegime`
     (`src/extension/production-theta-producer.ts`) called
     `matchAvailableModel(model.id, available)` and confirmed
     `confirmChildModel(model.id, resolvedId)` with
     `resolvedId = resolved?.id ?? "(unresolved: no matching model)"`
     (`git show faac6841:src/extension/production-theta-producer.ts`, the PIC-62
     obligation 2 block, `:2081`–`:2102`). Both halves of the marshalled
     reference were in hand at that point: the parent marshals
     `--provider <p> --model <id>` (`buildChildArgv`,
     `src/runtime/subagent-launcher.ts:445`, fed `provider: String(model.provider)`
     / `model: model.id` from `spawnSubagentConversation`,
     `production-theta-producer.ts:1887`–`:1888`), and the child's `ctx.model`
     carries `provider` and `id`.
  2. *A bare id is not a unique key, and the matcher collapses that into
     non-resolution.* `matchAvailableModel` (`src/binder/binder-model.ts:116`)
     filters by `m.id === reference` for a bare reference and returns
     `matches.length === 1 ? matches[0] : undefined` — one value for "no match"
     and for "more than one match". The rule is the corpus's, not an accident of
     the helper: `docs/spec_topics/binder/binder-model-and-context.md:10`
     (`#binder-model-parse-rule`) states "A bare `modelId` that matches models
     under more than one provider is ambiguous, resolving to no model (not
     pick-first)".
  3. *The pre-flight read that `undefined` as total non-resolution and refused.*
     The `?? "(unresolved: no matching model)"` fallback made the confirmation
     compare `claude-x` against `(unresolved: no matching model)`, so
     `confirmChildModel` (`src/runtime/subagent-model-guard.ts:150`) returned the
     failing verdict, `driveSubagentRootRegime` emitted the diagnostic and the
     `Err` envelope and returned before the callee body ran. On a registry
     serving the marshalled id through two providers that outcome is
     unconditional: every subagent-mode invocation of every theta failed the
     same way.
- **Related:**
  - **0064** —
    [`0064-binder-temperature-400-newest-anthropic-models.md`](./0064-binder-temperature-400-newest-anthropic-models.md),
    **open.** **Boundary.** Different site, different mechanism, no shared fix.
    0064 is a PARENT-side failure of the binder inference call — `temperature: 0`
    on `buildBinderCompleteCall` (`src/binder/binder-inference.ts`) rejected by
    the provider with an HTTP 400 — and it kills `params:` binding for every
    non-bypass theta against the affected model, subagent mode or not. This
    report is a CHILD-side pre-flight over `ctx.modelRegistry.getAvailable()`
    that reaches no provider at all. The two touch the model surface at opposite
    ends of the boundary: fixing either leaves the other exactly as it was.
  - **0086** —
    [`0086-subagent-wire-parse-failed-no-emitter.md`](./0086-subagent-wire-parse-failed-no-emitter.md),
    **open.** Its element 4 counts `subagent-model-preflight-mismatch` among the
    nine PIC-65 codes that have emitters, against `subagent-wire-parse-failed`
    which has none. That census is unchanged here: the fix moves the pre-flight's
    match key, not its emission, and the same `emitDiagnostic` call still
    delivers the code.
  - **0167** —
    [`0167-clean-leaf-walk-warns-on-absent-conventional-root.md`](./0167-clean-leaf-walk-warns-on-absent-conventional-root.md),
    **fixed.** Filed from the same change. Disjoint surface (discovery-root
    classification); recorded here only because the two reports share a landing
    commit and a provenance.
- **Affected** (citations verified against the tree at HEAD `3752003f`; symbols
  named beside lines):
  - **The site.** `driveSubagentRootRegime`
    (`src/extension/production-theta-producer.ts:2083`) and its PIC-62
    obligation 2 block (`:2092`–`:2130`): the qualified-reference assembly
    (`:2108`), the match (`:2109`), the unresolved marker (`:2118`), the
    re-qualified resolved side (`:2120`) and the `confirmChildModel` call
    (`:2121`). The refusal path emits through `emitDiagnostic` and `emitErr`
    and returns (`:2123`–`:2128`) before the params intake and the body drive.
  - **The matcher and its dual-form contract.** `matchAvailableModel`
    (`src/binder/binder-model.ts:116`) and its doc comment (`:104`–`:115`),
    which states the return as "the single matched model, or `undefined` when
    zero or more than one available model matches". The split is on the FIRST
    slash (`reference.indexOf("/")`), so a slash-bearing model id under a
    gateway provider survives qualification intact.
  - **The confirmation leaf.** `confirmChildModel`
    (`src/runtime/subagent-model-guard.ts:150`) — a string equality over
    `expected` / `resolved`, with `renderModelPreflightMismatchMessage` (`:77`)
    and `SUBAGENT_MODEL_PREFLIGHT_MISMATCH_CODE` (`:62`). The leaf is unchanged
    by the fix; it never chose the key. `guardResolvedModel` (`:105`) is
    obligation 1's parent-side guard and is likewise unchanged.
  - **The marshalling side.** `buildChildArgv`
    (`src/runtime/subagent-launcher.ts:445`) and its `provider` / `model` argv
    fields (`:347`, `:349`); `spawnSubagentConversation`
    (`production-theta-producer.ts:1645`) and its launch input
    (`:1887`–`:1888`).
  - **The `invoke`-parent carrier.** The `subagent_model_preflight_mismatch`
    cause on `InvokeInfraError` (`src/runtime/query-error.ts:130`–`:132`).
  - **The other five `matchAvailableModel` call sites, all unchanged.**
    `production-composition.ts:496` (the strict-capability probe) and `:866`
    (the typed-query provider gate), `production-theta-producer.ts:728` (the
    binder-model dispatch), `:2276` (a `subagent fn`'s `config.model` override)
    and `:2602` (the respond-model resolution). Every one of them takes an
    AUTHOR-WRITTEN reference string, where the dual-form contract and its
    ambiguity rule are the documented behaviour and a bare ambiguous reference
    is refused at load with `theta/load/binder-model-unresolved`. The child-side
    pre-flight was the one call site holding a concrete `Model` — both halves —
    and passing one of them.
  - **Spec.** `docs/spec_topics/pi-integration-contract/subagent.md:136`
    (*Model marshalling* — the reference-only crossing and the identical
    config universe), `:138` (PIC-62's two obligations), `:141` (obligation 2,
    including the re-resolution-key sentence added by the fix), `:143` (both
    failures terminal, and the `subagent_model_preflight_mismatch` cause),
    `:51` (the marshalled-artefact row for the resolved model), `:170` (the
    state-isolation matrix row), `:176` (the closed four-artefact enumeration);
    `docs/spec_topics/binder/binder-model-and-context.md:10` (the match rule and
    the ambiguity sentence);
    `docs/spec_topics/diagnostics/code-registry-runtime.md:34` (the
    `theta/runtime/subagent-model-preflight-mismatch` row and its Message
    template) and `docs/reference/diagnostics.md:261` (the reference mirror).
  - **Witnesses.** `tests/host-peer-version-and-model.test.ts` — the PIC-62
    describes at `:283` (four cells: bare-id ambiguity, qualified narrowing,
    provider-half narrowing, the child's qualified round-trip) and `:322`
    (three cells: pass, mismatch message, unresolved marker).
    `tests/subagent-root-drive-wiring.test.ts:257` — the producer-level cell
    (`PIC-62 obligation 2: a registry serving the SAME id through TWO providers
    passes the pre-flight`), beside the total-non-resolution cell at `:217`.
- **Observed at:** v0.88.0 (`faac6841`) and every release from v0.9.0
  (`4866d4d2`, the RFC-0006 child-process theta change that introduced the
  pre-flight; `git log -S 'matchAvailableModel(model.id'` names exactly those
  two commits — the introduction and the fix — so the bare-id key was
  continuous across that span). Established by source trace over the shipped
  pre-flight at `faac6841` and by the offline cells at HEAD that measure the
  matcher's verdicts on the two-provider registry. The fix landed in the
  second-host bring-up (`7f360d20`), whose commit message states the defect in
  the same terms.

## Summary

A subagent-mode invocation marshals the resolved model to the child as a
reference in two halves (`--provider <p> --model <id>`), and PIC-62 obligation 2
makes the child re-resolve that reference against its own registry and confirm
it. The child-side pre-flight re-resolved by the bare id alone.

A bare id is not a unique key. A host registry that serves one model through a
first-party endpoint and through a gateway holds two entries with that id, and
`matchAvailableModel` answers `undefined` for that input — the same value it
answers when the registry holds no entry at all. The pre-flight read `undefined`
as total non-resolution, substituted the marker `(unresolved: no matching
model)` for the child-resolved reference, and `confirmChildModel` then compared
`claude-x` against that marker and failed. The child emitted
`theta/runtime/subagent-model-preflight-mismatch` and an `Err` envelope, and
returned before the callee body ran. On such a registry the outcome does not
depend on the theta, the params, or the callee: every subagent-mode invocation
failed, and the diagnostic named a model that had not resolved when the model in
fact resolved twice.

The qualified form was available at that line the whole time. The parent
marshals both halves; the child's own `ctx.model` carries both. The fix
assembles `provider/id` and matches that, and re-qualifies the resolved side
before confirming.

## Reproduction

Offline, deterministic, provider-free, at HEAD `3752003f`.

### (a) The matcher's verdicts on the two-provider registry

The registry shape is one id under two providers — a first-party endpoint beside
a gateway (`tests/host-peer-version-and-model.test.ts:278`, `TWO_PROVIDERS`):

```
[ { provider: "anthropic",  id: "claude-sonnet-4-5" },
  { provider: "openrouter", id: "claude-sonnet-4-5" } ]
```

Against it, over the shipped `matchAvailableModel`:

```
matchAvailableModel("claude-sonnet-4-5",            …)  -> undefined   (ambiguous)
matchAvailableModel("anthropic/claude-sonnet-4-5",  …)  -> anthropic/claude-sonnet-4-5
matchAvailableModel("openrouter/claude-sonnet-4-5", …)  -> openrouter/claude-sonnet-4-5
matchAvailableModel("bedrock/claude-sonnet-4-5",    …)  -> undefined   (provider narrows)
matchAvailableModel("anthropic/no-such-model",      …)  -> undefined   (id narrows)
matchAvailableModel("anthropic/claude-sonnet-4-5",  [])  -> undefined  (no match)
```

Row 1 and row 6 are the two inputs the pre-flight could not tell apart: the
first is a model that resolves under both providers, the second is a registry
holding nothing.

### (b) The pre-fix refusal, traced

Input: a child whose `ctx.model` is `{ provider: "anthropic", id: "claude-test" }`
and whose registry holds `claude-test` under `anthropic` and under `openrouter`.
Over `git show faac6841:src/extension/production-theta-producer.ts:2081`–`:2102`:

1. `matchAvailableModel("claude-test", available)` filters by id, matches two
   entries, and returns `undefined`.
2. `resolvedId` takes the `??` arm: `"(unresolved: no matching model)"`.
3. `confirmChildModel("claude-test", "(unresolved: no matching model)")` is
   unequal, so the verdict carries
   `theta/runtime/subagent-model-preflight-mismatch` at severity `error` and
   `InvokeInfraError { cause: "subagent_model_preflight_mismatch" }` with the
   message `subagent model pre-flight mismatch: expected 'claude-test', child
   resolved '(unresolved: no matching model)'`.
4. `driveSubagentRootRegime` emits the diagnostic, emits the `Err` envelope, and
   returns — before the PIC-60 params intake and before the body.

### (c) The same input at HEAD, driven through the producer

`tests/subagent-root-drive-wiring.test.ts:257` constructs exactly that input —
`modelRegistry.getAvailable()` serving `claude-test` under `anthropic` and
`openrouter`, `ctx.model` naming the first — and drives
`driveSubagentRootRegime`. It observes one envelope, `kind: "ok"`, value
`"DUAL-PROVIDER-OK"`: the pre-flight passes and the callee's final value crosses
back. The review round that required this cell records it red with the
qualified-matching hunk reverted; re-proving that direction means reverting the
shipped hunk, which is outside this report's edit scope.

### (d) Total non-resolution still refuses

`tests/subagent-root-drive-wiring.test.ts:217` drives the same method against a
registry holding one unrelated model. The envelope is `kind: "err"`, kind
`invoke_infra`, cause `subagent_model_preflight_mismatch`, and the message
carries both `claude-test` and `unresolved` — expected versus the explicit
marker, never expected versus expected.

### (e) Command and result

```
npx vitest run tests/host-peer-version-and-model.test.ts tests/subagent-root-drive-wiring.test.ts
```

`2 passed (2)`, `26 passed (26)` at HEAD `3752003f`.

## Expected behaviour

- `docs/spec_topics/pi-integration-contract/subagent.md:136` (*Model
  marshalling*) — the model crosses as a reference and the child "re-resolves it
  against its own (identical) config universe", confirming "that the reference
  resolved to the intended model". A child whose registry serves the intended
  model resolves it; a re-resolution that cannot express which of two entries
  was intended is not the re-resolution this sentence describes.
- `:141` (PIC-62 obligation 2) — the failure fires "on mismatch". Two registry
  entries under the marshalled id are not a mismatch: the marshalled reference
  names one of them exactly.
- `docs/spec_topics/binder/binder-model-and-context.md:10` — the resolver
  "accepts both a canonical `provider/modelId` reference and a bare `modelId`",
  and a bare id ambiguous across providers "resolves to no model (not
  pick-first)". The rule is correct and stays; it makes the bare id the wrong
  key for a caller that holds the provider half.
- `docs/spec_topics/diagnostics/code-registry-runtime.md:34` — the code's
  Trigger is that the child "found it resolved to a **different model** than the
  intended one", and its Message names expected versus resolved. Under DIAG-2 a
  registered code fires on its documented trigger and not otherwise; a
  resolvable child is not a different model.

## Actual behaviour / root cause

One value, two meanings, and a caller that had the information to avoid asking
the ambiguous question.

`matchAvailableModel` is a resolver for author-written references. Its
`matches.length === 1 ? matches[0] : undefined` is the corpus's rule verbatim:
an ambiguous bare reference resolves to no model, and at load time that is
correct and sufficient, because the theta is refused with
`theta/load/binder-model-unresolved` either way and the author is the one who
wrote the ambiguous string. The child-side pre-flight is not that caller. Its
input is not an author's string but a concrete `Model` the parent already split
into `--provider` and `--model`, and its question is not "does this string name
a model" but "is the model I was sent the model I have". Passing `model.id`
discarded the half that answers it, and the discarded half was the only thing
separating "ambiguous" from "absent".

The consequences compound in the refusal path. Because the pre-fix confirmation
compared bare ids on both sides, the provider half was never confirmed even when
the match succeeded: a registry holding the id under a single, DIFFERENT
provider passed the pre-flight. So the same key that refused a resolvable child
also admitted a child resolved through a provider nobody marshalled.

A second arm of the same mis-key follows from the matcher's dual-form contract
and is trace-derived, not measured here: `matchAvailableModel` splits on the
first slash whenever the reference contains one, so a bare model id that itself
contains a slash — the ordinary gateway spelling, `anthropic/claude-sonnet-4-5`
served under provider `openrouter` — was read as a QUALIFIED reference,
filtered for provider `anthropic`, and matched nothing. The assembled form is
immune: `openrouter/anthropic/claude-sonnet-4-5` splits at the first slash into
provider `openrouter` and id `anthropic/claude-sonnet-4-5`.

Everything downstream of the key was correct. `confirmChildModel` is a string
equality and had no way to know its two arguments were bare where the contract
is qualified. The unresolved marker is deliberate and stays: falling back to the
expected value would make `confirmChildModel(x, x)` pass trivially and admit a
child whose model never resolved. The registry row, the Message template and the
`invoke_infra` cause are unchanged by this defect and by its fix.

## Why it matters

- **Subagent mode was unavailable, wholesale, on a legal registry shape.** The
  pre-flight runs on every child-side root drive before the params intake and
  the body. A host serving one model through a first-party endpoint and a
  gateway refused every invocation of every subagent-mode theta, independent of
  the callee.
- **The registry shape needs no misconfiguration.** Two entries under one id
  arise whenever a host is configured with a first-party endpoint and a gateway
  that resells the same model. No sentence in the corpus refuses that registry,
  and `binder-model-and-context.md:10` legislates for exactly that case by name.
- **The diagnostic misdirected triage.** The message named `(unresolved: no
  matching model)` for a model the child's registry held twice. An operator
  reading it looks for a missing model or a broken config universe — the two
  things that were not wrong.
- **The failure was paid for.** The parent had already spawned a child process,
  marshalled params, system prompt and callable set, and launched the host
  binary before the child refused on the first check of its drive.
- **The unconfirmed provider half was the mirror image.** With bare ids on both
  sides of the equality, a child resolving the id under a different provider
  passed the pre-flight — the exact substitution PIC-62 obligation 2 exists to
  catch.

## Fix (0.89.0)

Landed at HEAD `3752003f`; implementation, spec and witnesses in the same
change. Nothing blocks or is blocked: no other report shares the site.

**Implementation.** The pre-flight in `driveSubagentRootRegime`
(`src/extension/production-theta-producer.ts:2092`–`:2130`) assembles the
fully-qualified reference from the two halves the child holds —
`` const qualified = `${model.provider}/${model.id}` `` — and matches that
(`:2108`–`:2109`). The resolved side is re-qualified the same way,
`` `${resolved.provider}/${resolved.id}` `` (`:2120`), so
`confirmChildModel(qualified, resolvedRef)` (`:2121`) compares two references in
one spelling. Total non-resolution keeps the explicit marker `(unresolved: no
matching model)` (`:2118`): the confirmation is never expected-versus-expected,
so a child whose model genuinely resolved to nothing is still refused and the
message still says so. Two properties follow and are pinned: the qualified form
narrows by provider as well as id, so a differing provider is a real mismatch;
and the first-slash split leaves a slash-bearing model id intact.

`matchAvailableModel` is untouched — the dual-form contract and the
ambiguity-resolves-to-nothing rule are the corpus's and remain the behaviour
every author-written reference gets. `confirmChildModel`, the registered code,
its Message template, the `invoke_infra` cause and obligation 1's parent-side
`guardResolvedModel` are untouched. The other five `matchAvailableModel` call
sites are untouched.

**Spec.** PIC-62 obligation 2
(`docs/spec_topics/pi-integration-contract/subagent.md:141`) gained the
re-resolution-key sentence: the key is "the **fully-qualified `provider/id`**
form, assembled from both halves of the marshalled reference (`--provider <p>
--model <id>`), not a bare model id", with the reason stated — a bare id is not
a unique key in a registry that serves one model through several providers,
where it matches more than one available model and therefore resolves to none.
The sentence closes by pinning the code's Message template as unchanged, so
`code-registry-runtime.md:34` and its `docs/reference/diagnostics.md:261` mirror
needed no edit.

**Witnesses.** Two files, both offline and provider-free.

- `tests/host-peer-version-and-model.test.ts` — the seam cells. The PIC-62
  describe at `:283` pins the ambiguity itself (a bare id under two providers
  matches nothing), the qualified narrowing for both providers, the
  provider-half narrowing (`bedrock/…` and `anthropic/no-such-model` both
  `undefined`), and the qualified round-trip a child performs. The describe at
  `:322` pins the confirmation leaf: pass on equality, the registry-pinned
  mismatch message with the `subagent_model_preflight_mismatch` cause, and the
  unresolved marker for an empty registry.
- `tests/subagent-root-drive-wiring.test.ts:257` — the producer-level cell, at
  the defect's own site: a registry serving one id through two providers, a
  `ctx.model` naming one of them, and an assertion that
  `driveSubagentRootRegime` emits the callee's Ok envelope. This cell exists
  because the seam cells alone left the changed producer line unwitnessed —
  every other producer-level pre-flight cell uses a single-provider registry,
  where the bare id also resolves, so reverting the producer hunk kept the suite
  green. The review round that found the gap records the cell red with that hunk
  reverted.

## Non-goals

- **The matcher's collapsed `undefined`.** `matchAvailableModel` still returns
  one value for "ambiguous" and for "no match". The child-side site no longer
  depends on the distinction because it no longer asks an ambiguous question;
  every other caller resolves an author-written reference, where the collapse is
  the documented outcome (`binder-model-and-context.md:10`) and the load-time
  refusal `theta/load/binder-model-unresolved` is the same either way.
  Distinguishing the two verdicts for the author's benefit is a separate
  question this report does not open.
- **Author-written bare references.** `bind_model: claude-haiku`,
  `theta.binderModel`, frontmatter `model:` and a `subagent fn`'s `config.model`
  keep the dual-form contract exactly as specified, ambiguity included.
- **Bug 0064's parent-side binder call.** A provider-refused `temperature: 0` on
  the binder inference request is a different site and a different failure
  class, and this fix does not touch it.
- **Bug 0086's missing emitter.** `theta/runtime/subagent-wire-parse-failed`
  still has no emitter; the pre-flight's emitter is unchanged.
- **Obligation 1's key.** The parent-side guard tests `model?.id` for
  `undefined` before the spawn (`production-theta-producer.ts:1668`). That test
  asks whether a model exists, not which one, so the provider half is not needed
  and the guard is unchanged.
- **The unresolved marker's spelling.** `(unresolved: no matching model)` is
  carried into the Message's `<resolved>` placeholder. It is a marker, not a
  model reference, and whether the registry row should name it explicitly is not
  raised here.

## Provenance

- Filed from external PR #1 (`feat/omp-host-support`), part 1 host-agnostic fix
  4. The landing commit `7f360d20` states the defect in these terms: "a bare id
  is not a unique key in a registry that serves one model through several
  providers, and the ambiguity was read as total non-resolution, refusing the
  child". `3752003f` (review round 1) added the producer-level witness.
- Review round 1 finding F5 (`.pi/tmp/pr1/review-r1.md:126`) is why the
  producer-level cell exists: the seam cells exercised `matchAvailableModel` and
  `confirmChildModel` directly with the dual-provider registry and narrated the
  round-trip, but no cell constructed the qualified reference the way the
  producer does, and every producer-level pre-flight cell used a
  single-provider registry — so reverting the producer hunk left the suite
  green. F5's location line names a `#confirmChildModelPreflight` symbol; no
  such member exists at either commit, and the pre-flight is inline in
  `driveSubagentRootRegime`.
- Every `src/`, `tests/` and spec citation above was verified against the tree
  at HEAD `3752003f`; the pre-fix element was read with `git show faac6841:…`.
  The introduction point was located with
  `git log -S 'matchAvailableModel(model.id' -- src/extension/production-theta-producer.ts`,
  which names `4866d4d2` (v0.9.0, RFC-0006 child-process theta execution) and
  `7f360d20` (the fix) and nothing between them.
- The two witness files were run at HEAD (§Reproduction (e)); their green is
  measured. The red direction of the producer-level cell is recorded from the
  review round, not re-run here — proving it requires reverting a shipped hunk.
- The slash-bearing-id arm in §Actual behaviour is derived from the matcher's
  first-slash split and the pre-fix key, not measured; it is marked as such in
  the text.
