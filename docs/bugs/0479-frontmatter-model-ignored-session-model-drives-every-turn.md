# Bug 0479 — a present frontmatter `model:` is validated at load and then ignored at every dispatch: a subagent child is launched with the parent's *session* model (`ctx.model`) instead of the theta's, and a prompt-mode theta's free-phase `@` turns run on the session model too — only the off-session forced respond turn honours the pin

- **Status:** fixed (0.479.0) — both halves, human-ruled 2026-09-17: the
  subagent launch marshals the theta-resolved model (PIC-62 as written), and
  every prompt-mode free-phase turn runs under a PIC-17 **model window**
  (`pi.setModel` swap before the turn, restore in `finally`, PIC-8-style
  single re-attempt then `theta/runtime/model-restore-failed` + a display
  note).
- **Sev/Diff estimate:** S1/D3 — S1: the `model` frontmatter field has been
  inert on both driven-turn surfaces since RFC 0005 (`fed12acd`, 2026-07-03):
  every theta with a `model:` pin has run its turns on whatever model the
  invoking session happened to have selected, with no diagnostic, while the
  pin itself was validated at load (`theta/load/model-unresolved`) — a
  silently-wrong-model defect class. Concretely, the `/quality-loop` roster
  pins seven distinct models across its lens / triage / fix / review workers
  (`.pi/theta/workers/*.theta`); every wave to date ran all of them on the
  operator's session model. D3: two dispatch-site changes, one new runtime
  window with its restore protocol and one new diagnostic code, spec
  amendments at five anchors, one obligation-2 tightening, witnesses at both
  surfaces.
- **Kind:** implementation defect against normative text that already says
  the right thing in three places (see §Spec basis); the spec gap is only the
  *mechanism* of the prompt-mode half (no clause said how a prompt-mode turn,
  issued through `pi.sendUserMessage` into the shared session, is driven
  under the theta's model) and the provider-derivation sentence that
  assumed the session model drives the turn.
- **Spec basis** (at `754145b4`, v0.478.0 — pre-amendment wording):
  - [`frontmatter/frontmatter-fields-a.md` — `model`](../spec_topics/frontmatter/frontmatter-fields-a.md)
    line 72: "`model` and `tools` … apply to **every** query in the theta —
    a single theta file shares one model and one callable set across all of
    its turns"; line 73: a present `model:` "is resolved at theta-load time
    via the binder-model parse rule".
  - [`pi-integration-contract/subagent.md` PIC-62](../spec_topics/pi-integration-contract/subagent.md#pic-62)
    line 206: "The `model` reference marshalled to the child is the theta's
    resolved model — the theta's frontmatter `model:`, or the model inherited
    at invocation time when `model:` is absent".
  - [`pi-integration-contract/tool-registration-lifetime.md` PIC-17](../spec_topics/pi-integration-contract/tool-registration-lifetime.md#pic-17)
    — the per-query snapshot / install / query / restore window every
    prompt-mode turn already runs through; the model window added by this
    fix is its sibling.
  - [`errors-and-results/queryerror-variants.md` §`provider` derivation](../spec_topics/errors-and-results/queryerror-variants.md)
    line 108: "prompt-mode driven-turn failures take the user session's
    selected-model `.api` (`ctx.model`)" — true only because of this defect.

## Summary

Two dispatch sites read the session model where the spec says the theta's:

1. **Subagent launch.** `spawnSubagentConversation`
   (`src/extension/production-theta-producer.ts:2400`) does
   `const model = ctx.model;` and marshals that as `--provider <p> --model
   <id>`. Its own comment claims the value is "the theta's frontmatter
   `model:` resolved into the inherited session model" — nothing upstream
   performs that resolution. The child then confirms the marshalled
   reference against *itself* (`:3032`–`3068`: `qualified` is built from the
   child's `ctx.model`, which *is* the marshalled reference), so PIC-62
   obligation 2 can never observe the substitution.
2. **Prompt-mode free phase.** `LivePromptQueryModel.#driveUserVisibleTurn`
   (`:6339`) issues the turn with `this.#pi.sendUserMessage(text)` into the
   shared session, whose model is the session's. Only the off-session forced
   respond turn (`#buildRespondTurnContext`, `:3952`–`3964`) resolves
   `deps.theta.frontmatter.model` and dispatches `complete()` against it.

## Reproduction

Probe thetas (scratch, `$TEMP/astra-probe/`, global pi 0.85.1, session model
`anthropic/claude-sonnet-5`):

- `mode: subagent`, `model: "anthropic/claude-opus-5"`, one typed `@` query.
  Launched via `pi --mode json -p "/astra-sub" --theta <dir>`. The child
  process's command line (Win32 `CommandLine`) carries
  `--provider anthropic --model claude-sonnet-5`.
- `mode: prompt`, same pin. Every `message_end` on the `--mode json` stream
  reports `"model":"claude-sonnet-5"` — twelve assistant messages, zero on
  the pinned model; the theta's respond tool was called voluntarily by the
  session model, so the forced respond turn (the one surface that honours
  the pin) never ran.
- Control: `pi --mode json -p … --provider anthropic --model claude-opus-5`
  answers with `"model":"claude-opus-5"` — the host honours the reference;
  the defect is theta's failure to marshal it.

## Expected behaviour

- A subagent child launches with `--provider/--model` naming the theta's
  frontmatter `model:` when present (resolved by the same exact-match rule
  the load pass used), else the inherited `ctx.model` — PIC-62 verbatim. The
  child's obligation-2 confirmation compares the model it runs on against the
  theta's pin, so a parent that still marshals the session model is refused
  with `theta/runtime/subagent-model-preflight-mismatch`.
- A prompt-mode theta's free-phase turns run on the theta's `model:` when
  present. The user's session model is restored after every turn.
- `model:` absent: unchanged — inherit the session model (no `pi.setModel`
  call is made at all).

## Actual behaviour / root cause

`ctx.model` at both sites. The subagent site's comment
("the theta's frontmatter `model:` resolved into the inherited session
model — here the inherited `ctx.model`") describes an intent nobody
implemented; the prompt-mode site never had a model concept because the turn
is a session turn.

## Non-goals

- Probing `pi.setModel` in the factory capability probe: it stays on the
  post-probe SDK-shape-drift route (`capability-probe.md`), like the PIC-64
  bridge's own `setModel` use.
- Honouring `model:` for the **binder** (`bind_model:` owns that) or for the
  forced respond turn (already correct).
- Making `model:` re-resolve per query: it is resolved once per query
  construction from the registry snapshot, and the load pass has already
  refused an unresolvable reference.

## Fix (0.479.0)

1. **Subagent launch** (`spawnSubagentConversation`): the marshalled model is
   `frontmatter.model !== undefined ? matchAvailableModel(ref, registry) :
   ctx.model`. A present reference that no longer resolves at dispatch (the
   registry changed after load) is a refusal through the existing
   `guardResolvedModel` → `theta/runtime/subagent-model-unresolved` — never
   a silent session-model substitution.
2. **Child-side obligation 2**: the expected reference is the intended pin
   — for a `fn` entry the launched `subagent fn`'s `with { model }` override
   when it declares one (FN-7), else the theta's frontmatter `model:` —
   resolved in the child's own registry (the bare authored reference when it
   does not resolve there), else the marshalled reference; the child-resolved
   value is its `ctx.model`. A parent marshalling the wrong model now fails the
   invocation with the pinned preflight-mismatch diagnostic naming expected
   vs. resolved.
   **FN-7 collision (found in review):** with the theta's model now read from
   `frontmatter.model` on every surface, a fn-level `with { model }` override
   carried only on `ctx.model` (the pre-fix `#applySubagentFnConfig` shape)
   would have been shadowed by an enclosing pin — the child launched on the pin
   and the window swapped the fn body's turns back to it. The override now
   REPLACES `frontmatter.model` on the configured theta, so parent and child
   compute the same model and the window stays inert in the child.
3. **PIC-17 model window** (`withModelWindow`, `src/runtime/tool-registration.ts`):
   around each prompt-mode query whose theta has a present `model:`, when
   the resolved model differs from the session's (`provider` + `id`):
   `await pi.setModel(thetaModel)` before the send; `false` (the host
   declines: no authentication for the provider) refuses the query before
   any turn with a transport `Err`; a throw is a setup-side failure on the
   `internal-error` route (PIC-19's posture). The `finally` restores the
   snapshot; a restore throw or `false` gets exactly one re-attempt, then
   `theta/runtime/model-restore-failed` (E; `hint` = the snapshot
   reference) plus the `display: true` note
   `theta: failed to restore the session model after /<name>; the user
   session may have an unexpected model active. Use /model to reset.` The
   query's own outcome propagates unmasked (PIC-8(d)).
4. **Provider derivation** (`queryerror-variants.md`): a prompt-mode
   driven-turn failure takes the `.api` of the model the turn was driven
   under — the theta-resolved model inside a model window, else `ctx.model`.

Spec: `frontmatter-fields-a.md` (`model` prose: the three surfaces),
`tool-registration-lifetime.md` (`#pic-17-model-window`, PIC-8 sibling
clause), `code-registry-runtime.md` + `docs/reference/diagnostics.md`
(the new row), `runtime-event-channel.md` (the eighth informational note),
`capability-probe.md` (dedicated-codes list), `subagent.md` PIC-62 (pin
clarification: present-but-unresolvable at dispatch), `queryerror-variants.md`.

### Witnesses

`tests/b0479-frontmatter-model-drives-every-turn.test.ts`:

- A1 — a `mode: subagent` callee with `model: "anthropic/claude-pinned"`
  invoked from a session whose `ctx.model` is `anthropic/claude-test` spawns
  with `--provider anthropic --model claude-pinned`.
- A2 (control) — the same callee without `model:` spawns with the session
  model.
- A3 — a present reference absent from the registry at dispatch refuses the
  spawn with `subagent_model_unresolved` (no child launched).
- B1 — a prompt-mode theta with a differing `model:` calls
  `setModel(theta)` before `sendUserMessage` and `setModel(session)` after;
  the query binds the reply.
- B2 — `model:` equal to the session model: no `setModel` call.
- B3 (control) — no `model:`: no `setModel` call.
- B4 — `setModel(theta)` returns `false`: no `sendUserMessage`, the query
  is a transport `Err` naming the provider.
- B5 — restore fails once then succeeds: no diagnostic, no note.
- B6 — restore fails twice: `theta/runtime/model-restore-failed` (E) with
  the snapshot reference in `hint`, the verbatim display note, and the
  query's reply still binds.
- B7 — a present reference absent from the registry at dispatch refuses the
  query before any turn (provider `unknown`, no `setModel`, no send).

`tests/subagent-fn-child-launch.test.ts` (FN-7 collision, found in review):
an enclosing pin plus a fn `with { model }` override launches on the
**override**; a pin alone launches on the pin; child-side, a compliant
parent's override or pin is confirmed and a stale parent marshalling the
session model for a pinned theta is refused with
`subagent-model-preflight-mismatch` naming the pin.

Red path proven at `754145b4`: A1 marshals `claude-test`; B1/B4/B6 observe
zero `setModel` calls; the collision cell is red against the review-round-1
diff (it launched on the pin).

## Related

- Bug 0010 (the forced respond turn resolves the theta model — the one
  surface that was right).
- Bug 0372 (`withActiveSetGate` — the PIC-8/PIC-19 protocol this fix's
  model window mirrors).
- Bug 0417 (`openai-responses` forced-tool spelling; the typed-query gate
  it did not widen is a separate report).
- `quality/README.md` — the loop's per-worker model pins, inert until this
  fix.
