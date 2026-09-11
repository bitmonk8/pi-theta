# Bug 0475 — `theta/load/binder-model-strict-capability-unknown` (W) fires for EVERY non-bypass theta on EVERY load/reload because pi exposes `strictCapable` on NO `Model<Api>`: a warning whose message and hint are identical for every model choice, restating a host-wide constant already documented once at the PIC absence anchor

- **Status:** fixed (unreleased; lands in the next version bump) — by **spec
  amendment**, not by a renderer change (see §Why dedup was not the fix).
- **Sev/Diff estimate:** S3/D2 — S3: nothing is functionally wrong (the theta
  registers and binds), but the diagnostic carries zero per-theta information
  while consuming the operator's scarcest channel. Every non-bypass theta in a
  project fires one copy at every load and every reload, so a six-theta corpus
  pays six identical notes per rescan; the notes participate in LLM context
  (Pi's `docs/extensions.md`), and the hint they carry ("Verify empirically
  that the chosen binder model supports strict structured-output…; upgrade
  `pi-coding-agent` once a minor exposes per-model strict capability") is
  advice about the HOST, not about the theta the note names. D2: the mechanical
  change is one extra boolean threaded from the load pass's existing
  `getAvailable()` snapshot into the probe result plus one branch; the
  adjudication (which of the four probe arms stays diagnostic-bearing) is a
  normative spec question and was human-ruled.
- **Kind:** spec-level defect — **human-ruled 2026-09-11**. The registry row
  itself named the condition: *"This is the universal production branch under
  the pin"*. A diagnostic that is universal under the only supported host
  configuration is not a per-theta observation; it is a restatement of the
  host-wide constant pinned at
  [PIC — Strict-capability absence under the pin](../spec_topics/pi-integration-contract/audit-target-categories.md#strict-capability-absence-pin),
  which is already that claim's single citation site. The ruling: **bifurcate
  the `undefined` arm of the probe on whether the host exposes the indicator at
  all.**
- **Spec basis** (at `ceb0a369`, v0.469.0 — pre-amendment wording):
  - [`binder/binder-model-and-context.md`
    §Strict-capability requirement](../spec_topics/binder/binder-model-and-context.md#strict-capability-requirement)
    — the probe was a **three-valued** check, with `undefined` unconditionally
    emitting the W, and the paragraph closing "so production behaviour is the
    universal-W branch".
  - [`diagnostics/code-registry-load.md`:43](../spec_topics/diagnostics/code-registry-load.md)
    — the W row's own description: "This is the universal production branch
    under the pin". Its `:42` sibling
    (`theta/load/binder-model-not-strict-capable`, E) already said "does not
    fire in production under the pin" — the asymmetry between two arms of one
    probe is what made the defect visible.
  - [`frontmatter/frontmatter-fields-a.md`:40](../spec_topics/frontmatter/frontmatter-fields-a.md)
    (`bind_model` row),
    [`pi-integration-contract/capability-inventory-items.md`:15](../spec_topics/pi-integration-contract/capability-inventory-items.md),
    [`pi-integration-contract/host-prerequisites.md`:18](../spec_topics/pi-integration-contract/host-prerequisites.md)
    — the citing sites that restated the absent-indicator behaviour.
- **Affected** (at `ceb0a369`, v0.469.0):
  - `src/binder/binder-model.ts:16-18` (header three-valued list) and the
    `strictCapable === undefined` arm of `resolveBinderModel` — the unconditional
    W.
  - `src/extension/production-composition.ts:735` — `probeStrictCapable`,
    which resolved the reference to a concrete `Model<Api>` and reported only
    that model's (always absent) field, never the host-wide condition.
- **Observed at:** v0.469.0 (`ceb0a369`), Windows. The field evidence is bug
  [0470](./0470-load-diagnostics-re-emit-without-dedup.md)'s own count: of 408
  load-diagnostic notes in one session, this code supplied one copy per
  non-bypass theta per scan, and 0470's §Affected recorded exactly why the set
  is *permanently* non-empty on current Pi.
- **Related:**
  - [0470](./0470-load-diagnostics-re-emit-without-dedup.md) (resolved via
    0471) — the storm this code fed. Its proposed renderer dedup was ruled
    **spec-forbidden** and remains so; see §Why dedup was not the fix.
  - [0013](./0013-load-warnings-dropped-by-both-production-sinks.md)
    (fixed 0.24.0) — the opposite failure on the same channel; its A3 cell used
    this very code as its W-delivery witness and is re-pointed, not deleted.
  - [0468](./0468-subagent-teardown-budget-shared-2000ms.md) (fixed 0.464.0) —
    the same "diagnostic that lies at scale" framing.

## Summary

The binder strict-capability probe reads
`(model as { strictCapable?: boolean }).strictCapable` off the resolved
`Model<Api>`. Pi's SDK at the theta 1.0 pin declares no such member on any
model, so the read is `undefined` for **every** theta on **every** host — and
the pre-amendment spec made `undefined` emit
`theta/load/binder-model-strict-capability-unknown` (W) unconditionally. The
result is a warning that:

1. fires for every non-bypass theta, at every load and every watcher reload;
2. renders with a message and a hint that are identical for every model choice
   (only the model name varies, and the name is not what the note is about);
3. states a fact about the HOST that the spec already documents exactly once,
   at the PIC absence anchor, as a pinned constant with its own audit gate.

No operator action follows from it, and no per-theta distinction is conveyed.

## Reproduction

Load any non-bypass theta through the production composition on a real host:

```
.pi/theta/quality-loop.theta       (mode: prompt, bind_model: anthropic/claude-sonnet-5, params:)
.pi/theta/workers/fix-cluster.theta
.pi/theta/workers/lens-d2-cruft.theta
```

Pre-amendment load notes (production composition, one pass over this
repository's own `.pi/theta/` corpus, real-shaped registry with no
`strictCapable` on any model):

```
theta: …/.pi/theta/workers/fix-cluster.theta: theta/load/binder-model-strict-capability-unknown: binder model 'anthropic/claude-sonnet-5' strict-capability flag unavailable; load-time check degraded to best-effort
theta: …/.pi/theta/workers/lens-d2-cruft.theta: theta/load/binder-model-strict-capability-unknown: binder model 'anthropic/claude-sonnet-5' strict-capability flag unavailable; load-time check degraded to best-effort
theta: …/.pi/theta/quality-loop.theta: theta/load/binder-model-strict-capability-unknown: binder model 'anthropic/claude-sonnet-5' strict-capability flag unavailable; load-time check degraded to best-effort
```

Three thetas, three byte-identical notes but for the path; the model name is
the same in all three because the whole corpus binds one binder model.

## Expected behaviour (post-ruling)

The probe is a **four-way** check
([#strict-capability-requirement](../spec_topics/binder/binder-model-and-context.md#strict-capability-requirement)):

| resolved model's `strictCapable` | host exposes the indicator on ≥ 1 available model | outcome |
|---|---|---|
| `true` | — | admit, no diagnostic (unchanged) |
| `false` | — | `theta/load/binder-model-not-strict-capable` (E), refuse (unchanged) |
| `undefined` | yes | `theta/load/binder-model-strict-capability-unknown` (W), admit — now genuinely per-model information |
| `undefined` | no | admit **silently**, no diagnostic of any severity |

"Host exposes the indicator" is read off the SAME
`ctx.modelRegistry.getAvailable()` snapshot the load pass already takes: true
iff some available model has `strictCapable !== undefined`. Under the theta 1.0
Pi-SDK pin that is `false` on every host, so **neither** strict-capability code
fires in production — symmetric with the `:42` sibling row, which the registry
already described that way.

The code and its pinned message template **stay** in the closed registry
(DIAG-2 / DIAG-4 untouched): the day a `pi-coding-agent` minor exposes
`strictCapable` on some models, the W becomes live and informative without a
registry change. The SDK-inventory audit arm
([absence-under-the-probed-name](../spec_topics/pi-integration-contract/inventory-audit-intro.md#strict-capability-absence-under-probed-name))
is untouched and still trips the day pi adds the field.

## Actual behaviour / root cause

`resolveBinderModel` (`src/binder/binder-model.ts`) branched on the resolved
model's field alone:

```ts
const strictCapable = input.probeStrictCapable(reference)?.strictCapable;
…
if (strictCapable === undefined) {  // the pinned production branch
  return { resolved: true, binderModel: reference, diagnostics: [W] };
}
```

The host-wide condition was never computed, because `probeStrictCapable`
(`src/extension/production-composition.ts:735`) returned the matched
`Model<Api>` cast to the duck-typed probe shape — a per-model view with no
visibility of the rest of the snapshot. There was therefore no seam at which
"this model lacks an indicator the host has" could be distinguished from "no
model anywhere has one", and the spec, written against that same seam, made
both the same W.

## Why dedup was NOT the fix

Bug 0470 proposed suppressing duplicate load notes. That remains
**spec-forbidden**:
[`diagnostics/diagnostic-shape.md` §Re-scan
deduplication](../spec_topics/diagnostics/diagnostic-shape.md#re-scan-deduplication)
pins a MUST NOT on renderer-side duplicate suppression, and
§"Argument-mismatch multiplicity" *depends* on that rule. Dedup would also have
been the wrong instrument here even if it were permitted: it addresses the
*repetition* of the note, not the fact that a single copy already carries no
per-theta information. The ruling therefore moves the fix to the **emission
condition** — the diagnostic is not suppressed after the fact, it is never
raised, because the condition that would make it informative is absent. One
note per *informative* event, zero notes for a host-wide constant; the renderer
contract is untouched.

## Non-goals

- No registry change: the code, its severity, phase, trigger *template* and
  Message column stay (DIAG-2 closed set, DIAG-4 message anchors).
- No renderer dedup / supersede (0470, above).
- No change to the `true` / `false` arms, to binder-model resolution, to
  BNDR-11, or to the hot-reload recovery note.
- No change to the SDK-inventory rename / absence-under-the-probed-name audit
  arms, nor to the version-bump procedure's strict-capability probe step.

## Fix (unreleased)

**Spec (amendment, landed first).**

- [`binder/binder-model-and-context.md`
  §Strict-capability requirement](../spec_topics/binder/binder-model-and-context.md#strict-capability-requirement)
  — the three-valued check becomes the four-way check above, naming the
  snapshot the host condition is read from and stating why host-wide absence is
  not a per-theta event; "production behaviour is the universal-W branch" is
  replaced by the silent-admit branch, with the "under the pin neither
  strict-capability code fires" symmetry spelled out. The MUST short-circuit
  sentence for an unresolved binder model is unchanged.
- [`diagnostics/code-registry-load.md`](../spec_topics/diagnostics/code-registry-load.md)
  — the W row's description now states the firing condition (host exposes the
  indicator on some available model; the resolved model lacks it) and mirrors
  the `:42` sibling's "does not fire in production under the pin"; the `:42`
  sibling's "the W-level … fires instead" clause is corrected to "does not fire
  either". **Message templates unchanged.**
- [`frontmatter/frontmatter-fields-a.md`](../spec_topics/frontmatter/frontmatter-fields-a.md)
  `bind_model` row, [`pi-integration-contract/audit-target-categories.md`
  #strict-capability-absence-pin](../spec_topics/pi-integration-contract/audit-target-categories.md#strict-capability-absence-pin)
  (still THE single citation site for the absence claim; "degrades … to the
  universal-`W` branch" → the silent-admit branch),
  [`capability-inventory-items.md`](../spec_topics/pi-integration-contract/capability-inventory-items.md),
  [`host-prerequisites.md`](../spec_topics/pi-integration-contract/host-prerequisites.md),
  and the `docs/reference/frontmatter.md` mirror — made consistent.

**Code.**

- `src/binder/binder-model.ts` — new `StrictCapableProbeResult extends
  StrictCapableProbe` adds a required `hostExposesIndicator: boolean`; the
  `undefined` arm is bifurcated on it (a probe that found no concrete model
  reports nothing about the host and takes the silent arm too); the header
  comment's three-valued list becomes the four-way list with the spec cite.
- `src/extension/production-composition.ts` — `hostExposesStrictCapability` is
  computed ONCE per load pass from the existing `getAvailable()` snapshot (it
  is a property of the host, identical for every theta in the pass) and
  reported by every `probeStrictCapable` call beside the per-model read. DI
  shape unchanged; no ambient reads.

### Witnesses

- `tests/binder-model-resolution.test.ts` — cell (a): `undefined` + no
  available model exposing the indicator → resolved, **zero** diagnostics;
  cell (a′): an unresolvable probe result → silent; cell (b): `undefined` +
  indicator exposed on another available model → the W exactly as before;
  `true` / `false` arms unchanged.
- `tests/load-warning-delivery.test.ts` — A3 re-pointed to the
  indicator-exposing host (the bug-0013 drop-site-2 W-delivery witness is
  preserved, not deleted), plus new A3b: the SAME fixture on the pinned host
  shape emits neither the W nor the E and still registers.
- `tests/live/live-production-acceptance.test.ts` — the bug-0197 live cell now
  asserts the W's **absence** through the real host (which exposes the
  indicator on no model), the real observable post-amendment; its former prose
  calling the W "expected on every conforming run" is gone.
- Red-direction proofs (temporary local breaks, restored):
  - silent arm disabled ⇒ `tests/binder-model-resolution.test.ts` cells (a),
    (a′) and `tests/load-warning-delivery.test.ts` A3b red with
    *"expected [ { severity: 'warning', …(3) } ] to have a length of +0 but got
    1"* carrying the strict-capability-unknown note verbatim;
  - host condition ignored (always silent) ⇒ cell (b) reds *"expected undefined
    to be defined"* and A3 reds on the bug-0013 PRIMARY message
    (*"Observed notes=[]"*), so the W arm cannot rot into unreachable code.
- Hand check (production composition over this repository's own `.pi/theta/`
  corpus): `quality-loop` registers with **zero** load notes and zero
  strict-capability mentions; with the silent arm disabled the same pass
  produces the three notes quoted in §Reproduction.
