# Bug 0023 — Production drops every factory/`session_start` bootstrap diagnostic (`emitDiagnostic` unwired), and the compose-supplier catch mislabels every compose throw `capability: "pi.registerCommand"`

- **Status:** open
- **Kind:** defect — two diagnostic-surface defects on the same
  `theta/load/extension-bootstrap-failed` path (two-defect report per the
  bug-0002 precedent). (1) The implementation does not deliver what the spec
  prescribes: the code-registry-load.md row routes
  `theta/load/extension-bootstrap-failed` "through the **System notes**
  fallback chain (`sendSystemNote` → `ctx.ui.notify` → `console.error`)"
  (extension-bootstrap-and-per-theta.md states the same routing rule), but
  the shipped default export supplies no `emitDiagnostic`, so every
  constructed bootstrap diagnostic is dropped by an optional chain —
  regardless of runtime staleness. (2) The payload misattributes: the
  compose-supplier catch labels every compose throw
  `details.capability: "pi.registerCommand"` even when nothing reached
  `pi.registerCommand`, although the registry row defines `capability` as
  naming "the failing call".
- **Affected** (at the current HEAD, 0.29.0):
  - `thetaExtension`, the production default export
    (`src/extension/factory.ts:703–717`) — constructs the factory with
    `fixtures: []`, `composeInstance`, and `isSubagentChild` only; no
    `emitDiagnostic`.
  - Every `deps.emitDiagnostic?.(…)` optional chain in the factory
    (`src/extension/factory.ts:300`, `:315`, `:336`, `:365`, `:389`, `:412`,
    `:474`, `:532`, `:566`, `:677`, `:684`) — with the seam unwired, each is
    a silent drop of a constructed diagnostic.
  - The compose-supplier catch in `runComposeInstanceRegistration`
    (`src/extension/factory.ts:532`) —
    `bootstrapFailedDiagnostic("pi.registerCommand", e)` for ANY compose
    throw. The discovery-supplier catch in `runProductionRegistration`
    (`:473–476`; not on the production path, which supplies
    `composeInstance`) applies the same label to any discovery-supplier
    throw.
  - The closed label set: `BootstrapCapability`
    (`src/extension/factory.ts:91–96`), mirroring the code-registry-load.md
    row's closed `details.capability` union
    (`"pi.registerMessageRenderer" | "pi.registerCommand" |
    "pi.registerFlag" | "pi.on" | "pi.getCommands"`).
- **Observed at:** `0.28.0`, mechanical — offline, deterministic; no live
  model. Witnessed via the bug-0022 test harness's injected `emitDiagnostic`
  recorder (`tests/hot-reload-stale-ctx-replacement.test.ts`
  `Boot.diagnostics`), the seam's only observer: in production the default
  export drops the same diagnostics.

## Summary

The factory converts every factory-time and `session_start`-time
host-boundary failure into a `theta/load/extension-bootstrap-failed`
diagnostic and hands it to `deps.emitDiagnostic` — a seam declared optional
for the harness paths that do not observe diagnostics. The production
default export never supplies it, so in the shipped extension every one of
those diagnostics is constructed and discarded: a renderer-registration
failure, a per-theta `pi.registerCommand` failure, a `pi.getCommands`
collision-pass read failure, a `pi.on` subscription failure, and any
compose-pass throw all yield no transcript note, no toast, and no stderr
line, although extension-bootstrap-and-per-theta.md prescribes delivery
through the **System notes** fallback chain for exactly these failures and
names `/reload` as the recovery path.

Compounding the silence, the one catch that sees every compose-pass throw
labels it with the wrong capability. `runComposeInstanceRegistration`'s
catch arm receives whatever the whole `deps.composeInstance` pass threw —
discovery walk, settings read, parse, AJV compile, registry build — and
stamps it `capability: "pi.registerCommand"` unconditionally, so (for
example) a `ctx.cwd` stale read reports as a slash-registration failure.

Both defects were recorded, and deliberately not fixed, by the bug-0022 fix
(0.29.0): that fix suppresses diagnostic *construction* on the
shutdown-observed race (where the channel is dead and PIC-67 clause (c)
forbids the delivery attempt); this report is about the live-runtime case,
where delivery is prescribed and does not happen.

## Reproduction

Offline; the defects are structural and witnessed by the bug-0022 harness:

- **Drop (defect 1).** Read `thetaExtension`
  (`src/extension/factory.ts:703–717`): the deps object carries no
  `emitDiagnostic`, and every emission site is a `deps.emitDiagnostic?.(…)`
  optional chain — with the member absent, the diagnostic is constructed and
  the result discarded. The bug-0022 tests observe constructions only
  because their harness injects a recorder (`Boot.diagnostics`,
  `tests/hot-reload-stale-ctx-replacement.test.ts`); the shipped export has
  no recorder and no sink.
- **Mislabel (defect 2).** At the pre-0.29.0 HEAD, the bug-0022 variant-2
  test recorded two dropped diagnostics for a mid-compose stale death: the
  first labelled `capability: "pi.registerCommand"` although the compose
  died on `buildRuntimeRoot`'s `ctx.cwd` read and no `pi.registerCommand`
  was reached. The 0.29.0 guard suppresses construction on that specific
  interleaving (shutdown observed mid-compose), so it no longer constructs
  anything there; any other compose throw — a live-runtime compose failure —
  still funnels into the same catch and takes the same label.

## Expected behaviour

- code-registry-load.md (row for `theta/load/extension-bootstrap-failed`)
  and extension-bootstrap-and-per-theta.md: the diagnostic is "Routed
  through the **System notes** fallback chain (`sendSystemNote` →
  `ctx.ui.notify` → `console.error`) because the renderer itself may be the
  failing capability". Delivery on a live runtime is prescribed, not
  optional; the row's remedy column names `/reload` as the recovery path,
  which presupposes the operator learns of the failure.
- code-registry-load.md: `details: { capability, error }` "names the
  failing call". A `capability` value naming a call that was never reached
  does not name the failing call.
- PIC-67 clause (c) (`session-shutdown-semantics.md#pic-67`) scopes the
  no-delivery rule to an *invalidated* runtime; it does not license
  dropping on a live one.

## Actual behaviour / root cause

**Defect 1.** The `emitDiagnostic` seam was declared for the `V9k`/`V9p`
harness pairs and left optional; the production composition wired
`composeInstance` but never the diagnostic seam, so `thetaExtension`
constructs the factory without it and all eleven emission sites reduce to
construct-then-drop. Nothing fails loudly: the optional chain is the
designed no-op for harnesses that do not observe diagnostics — production
is not supposed to be such a harness.

**Defect 2.** `runComposeInstanceRegistration`'s catch arm has one label to
give and five to choose from: `bootstrapFailedDiagnostic` takes a
`BootstrapCapability`, the closed five-member union pinned by the
code-registry-load.md row (`"pi.registerMessageRenderer" |
"pi.registerCommand" | "pi.registerFlag" | "pi.on" | "pi.getCommands"`) and
mirrored by the `BootstrapCapability` type in `factory.ts`. No member
describes "the compose pass itself threw", and `"pi.registerCommand"` was
used as the nearest step-3 surface. An honest label is therefore NOT a
one-line change: the closed set is spec-pinned, so widening it (or adding a
compose-phase code) is a registry amendment under DIAG-2.

## Why it matters

- Live-runtime bootstrap failures are silent today. A real
  `pi.registerCommand` collision, a `pi.getCommands` read failure on a LIVE
  runtime, or a compose-pass failure yields no operator signal — no
  transcript note, no toast, no stderr line — although the spec designed the
  System-notes chain for exactly these failures, and the documented recovery
  path (`/reload`) requires the operator to know a recovery is needed.
- Misattribution misleads triage: an operator (or a test) reading
  `capability: "pi.registerCommand"` looks at slash registration when the
  failure was, for example, a `ctx.cwd` read in the discovery walk.

## Fix options and recommendation

1. **Wire `emitDiagnostic` in the default export to the System-notes
   fallback chain** (defect 1; recommended), as
   extension-bootstrap-and-per-theta.md already prescribes — the same
   `sendSystemNote` → `ctx.ui.notify` → `console.error` chain the load-pass
   diagnostics ride. The wiring must keep PIC-67 clause (c): a wired sink
   still must not deliver through an invalidated runtime. The 0.29.0 guard
   already suppresses construction on the shutdown-observed race, and the
   bug-0018 stale-dead channel health covers the reactive case, so the new
   wiring changes behaviour only where delivery is legitimate.
2. **Amend the registry for an honest compose-phase label** (defect 2):
   either widen the code-registry-load.md `details.capability` set with a
   compose-phase member (updating the mirrored `BootstrapCapability` union
   in lock-step), or register a distinct compose-phase code.
   Closed-set constraint: the union is spec-pinned, so the type change and
   the registry row must move together — a DIAG-2 registry amendment, not an
   implementation change.

## Provenance

Bug 0022 §"Fix options and recommendation" item 3 recorded both defects as
adjacent and separable ("worth its own report if not folded in here"); the
0022 fix orchestration ruled that neither is folded into the 0.29.0 fix.
The drop is recorded in bug 0022's Affected list ("The production default
export … supplies no `emitDiagnostic`, so every `bootstrapFailedDiagnostic`
the tail constructs is dropped by the `deps.emitDiagnostic?.()` optional
chain") and the mislabel in its Variant-2 reproduction and root-cause
sections. Precedent for a two-defect report: bug 0002.
