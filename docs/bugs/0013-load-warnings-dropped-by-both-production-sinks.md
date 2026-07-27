# Bug 0013 — Load-phase warning diagnostics are dropped by both production sinks

- **Status:** open.
- **Kind:** defect — documented behaviour absent. The diagnostics contract
  delivers **all** `theta/load/*` diagnostics through the persistent
  `theta-system-note` channel (five carved-out exceptions, every one a
  runtime/host code on the `console.error` teardown/tripwire path — no load
  code among them), and the per-code spec prose repeatedly promises emission
  ("the runtime **emits** `theta/load/typed-query-unsupported-provider`
  (warning) naming the model";
  "**All warnings and errors above are emitted via the standard diagnostics
  channel**"). In production every warning-severity load diagnostic is
  dropped: both load-emit sinks early-return on `severity !== "error"`, and no
  other channel exists — the toast surface is typed `"error"`-only, the
  headless stderr mirror sits inside the error arm, no `--mode json`
  diagnostic event exists, nothing aggregates. Every warning-emittable load
  row in the closed registry — 15 pure-W codes plus the warning arms of three
  E/W codes — is unobservable by an operator.
- **Affected:** the two production load-emit sinks in
  `src/extension/production-composition.ts`: `makeLoadEmit` (:170–191, early
  return :172–174) — the emit for the H8a `discoverAndComposeFixtures` helper
  path (:282) and the note channel's own delivery-failure fallback (:981) —
  and `composeExtensionInstance`'s `emitLoadNote` (:1002–1011, early return
  :1003–1005) — the emit for the shipped extension entry
  (`factory.ts:659` → `runComposePass` :1043) and for watcher-time re-compose
  (`emitErr7 = emitLoadNote`, :1037). Every load-pass emit site feeds one of
  the two: settings (:346), discovery walk (:361), package walk (:377), parse
  drops (:562), tools resolution (:610), invoke checks (:657), imports
  (:710), binder-model resolution (:739), the bug-0010 typed-query provider
  gate (:773), plus five sites whose codes are all E-severity (subagent
  executable :591, extension-tool reachability :639, subagent-fn static/model
  checks :677/:694, registration verification :898). A third, upstream drop
  site compounds the sink filter:
  `parseDiscoveredTheta`'s registering path (:1827–1834) returns only the
  fixture and discards `document.diagnostics` entirely, so parse/frontmatter
  warnings on a theta that registers never reach a sink at all.
- **Observed at:** `0.20.0`. The error-only filter has been present since the
  first live composition (H8a, commit `3a8732da`) and survived both sink
  evolutions unchanged. Recorded as a residual by the bug-0010 fix
  (§Residuals) and as fix-review finding F4.

## Summary

Production composes every load-phase diagnostic — discovery, settings,
package walk, parse drops, `tools:` resolution, invoke/import checks,
binder-model resolution, the typed-query provider gate — into one
`emitDiagnostic` stream per pass. Both functions that production ever
installs as that stream filter to error severity before doing anything:

```ts
// makeLoadEmit, src/extension/production-composition.ts:170
function makeLoadEmit(ctx: ExtensionContext): (diagnostic: Diagnostic) => void {
  return (diagnostic: Diagnostic): void => {
    if (diagnostic.severity !== "error") {
      return;
    }
    ctx.ui.notify(diagnostic.message, "error");
    ...
```

```ts
// emitLoadNote, src/extension/production-composition.ts:1002
const emitLoadNote = (diagnostic: Diagnostic): void => {
  if (diagnostic.severity !== "error") {
    return;
  }
  preEvalRouter.routePreEvalFailure(preEvalCauseOf(diagnostic.code), {
    ...
```

A warning-severity `emitDiagnostic` call therefore reaches nothing: no
transcript note, no toast (`UiNotifier.notify` is typed
`(message, type: "error")` — no warning arm exists on the surface), no stderr
line in headless `-p`/CI mode (the mirror is inside `makeLoadEmit`'s error
arm), no JSON event, no aggregation. The only severity-agnostic delivery path
in the tree — `emitDiagnosticBatch` onto the `theta-system-note` channel — is
production-wired only for the lexer (whose codes are all E-severity) and the
watcher ERR-7 arm. The gap is not hypothetical: the registry documents 18
load rows that can fire as warnings, all with live production emit sites, and
one of them (`theta/load/binder-model-strict-capability-unknown`) is per the
registry "the universal production branch under the pin" — it fires for every
non-bypass theta on every load and is dropped every time.

Bug 0010 made the gap newly load-bearing: its fix wired the load-time
typed-query provider gate through this same stream, so the spec-pinned
warning that a typed theta's `model:` cannot support forced tool choice is
emitted — and dropped. The theta loads silently; the operator's first signal
is `Err(QueryError { kind: "transport", retryable: false })` at dispatch.

## Reproduction

Code-reading chain; the sinks are unambiguous and the unobservability is
already recorded inside the repo's own test comments.

Mechanical check 1 — the two early-returns are the only constructions of the
load-pass emit:

```
$ rg -n 'severity !== "error"' src/extension/production-composition.ts
172:    if (diagnostic.severity !== "error") {
1003:    if (diagnostic.severity !== "error") {
```

`rg -n "makeLoadEmit|emitLoadNote" src/` shows every production consumer:
`discoverAndComposeFixtures` (:282), the fallback toast (:981), the shipped
`runComposePass` call (:1043), the watcher re-compose alias (:1037), and the
`buildRuntimeRoot` feed (:1013) — the last hands the sink to
`AjvSchemaValidator`, whose only construction is error-severity
(`src/seams/schema-validator.ts:131`), so no warning can arrive there.

Mechanical check 2 — the repo already records the consequence. The bug-0010
gate suite could not write a composition-level cell for the warning at all
(`tests/typed-query-provider-gate.test.ts:49–58`): "A full-composition
integration cell (through `discoverAndComposeFixtures` /
`composeExtensionInstance`) is NOT tractable for a WARNING: both production
load-emit sinks filter to ERROR severity … so a warning-severity diagnostic
emitted into them is UNOBSERVABLE from any injectable surface". The hardening
probe harness documents the same for its live captures
(`tests/hardening/probe-harness.ts:22–23`): "Load-phase WARNINGS (e.g.
invalid-json settings) … route to neither surface — `emitLoadNote` is
error-only." The e2e-s4 never-emitted / uncovered-emitted inventories do
**not** cover this gap: both suites drive `parseThetaDocument` directly with
an injected no-op `emitDiagnostic`, asserting the codes are *produced*, not
that production *delivers* them.

Operator-level observation (no tokens): author a theta containing a typed
query with `model:` resolved to any api outside the pinned six-member set
(e.g. a Gemini model), or a `.pi/settings.json` containing invalid JSON, or
two thetas whose names differ only in case — load a session. Nothing appears
in the transcript, no toast fires, stderr stays empty under `-p`. Each of
those conditions has a registry row whose stated purpose is to be seen.

## Expected behaviour (what the spec says)

- `docs/spec_topics/diagnostics/diagnostic-shape.md`, opening rule:
  "**Persistent diagnostics (default).** All `theta/parse/*`, `theta/load/*`,
  and `theta/runtime/*` diagnostics are delivered via the channel below, with
  five carved-out exceptions" — the five are `reload-teardown-timeout`, three
  `theta/host/session-shutdown-*` teardown codes, and the
  `theta/host/session-swap-instance-survived` tripwire; no load code, no
  severity-based carve-out. Same page, transient-toast paragraph:
  "theta-author-facing diagnostics (anything with a `theta/parse/*`,
  `theta/load/*`, or `theta/runtime/*` code) MUST go through the persistent
  channel above and MUST NOT be routed through `ctx.ui.notify` as their
  primary sink."
- `docs/spec_topics/discovery/discovery-sources.md` §Failure modes: "**All
  warnings and errors above are emitted via the standard diagnostics
  channel** ([Diagnostics](../diagnostics.md))". DISC-3: the loader "emits a
  load-time *warning* `theta/load/case-collision` naming both paths".
  Non-canonical extension case: "To surface this otherwise-undetectable
  authoring mistake, the loader emits a load-time *warning*
  `theta/load/non-canonical-extension`".
- `docs/spec_topics/discovery/package-and-settings.md` DISC-6: "it emits a
  single `theta/load/discovery-slow` warning that names the root being
  scanned and the cap that fired"; "a single `theta/load/package-read-timeout`
  warning is emitted naming the package".
- `docs/spec_topics/pi-integration-contract/conversation-drive.md` §Provider
  compatibility for typed queries: "the runtime emits
  `theta/load/typed-query-unsupported-provider` (warning) naming the model" —
  the bug-0010 spec anchor whose warning half this gap voids.
- The registry rows themselves
  (`docs/spec_topics/diagnostics/code-registry-load.md`) document
  author-facing messages and hints for every W code; DIAG-1 ("Every
  author-visible diagnostic emitted by the runtime MUST carry a code from
  the registry below") presupposes the diagnostics are visible.
  `errors-and-results/error-model.md`'s
  pre-evaluation failure list — the scope `emitLoadNote`'s WHY comment cites —
  enumerates eight **error** surfaces and says nothing that exempts warnings
  from the delivery contract above.

## Actual behaviour / root cause

Three drop sites, each verified at HEAD:

1. **`makeLoadEmit` filters to errors.**
   (`src/extension/production-composition.ts:172–174`, quoted above.) The
   toast + headless-stderr router used by the H8a helper path and retained as
   the note channel's off-channel fallback delivers nothing for a warning —
   the stderr mirror (:187–188) is unreachable for it.
2. **`emitLoadNote` filters to errors.** (:1003–1005, quoted above.) The
   shipped `composeExtensionInstance` path routes error-severity diagnostics
   onto the `theta-system-note` channel via the V4e pre-eval router and
   returns early for everything else. Its WHY comment records the posture:
   "the eight pre-eval FAILURES are all error-severity; a load-phase warning
   is not a pre-eval failure and does not surface at load (unchanged)"
   (:996–998) — correct about error-model.md's pre-eval scope, but the
   delivery contract for warnings is diagnostic-shape.md's
   persistent-channel default, which this sink does not implement. The
   watcher-time re-compose path reuses the same sink (:1037 → :1082), so hot
   reload drops warnings identically.
3. **Registering thetas discard their parse-phase warnings upstream.**
   `parseDiscoveredTheta` returns `{ fixture }` without `document.diagnostics`
   on the success path (:1827–1834), so the four frontmatter W codes
   (`unknown-frontmatter-field`, `deferred-frontmatter-field`,
   `bind-echo-without-params`, `argument-hint-not-displayed`) and the six
   `theta/parse/*` W codes never reach a sink for a theta that registers —
   a warning alone never un-registers, so these surface into the emit stream
   only when an unrelated error co-fires in the same dropped batch, where
   drop sites 1/2 then filter them. Fixing the sinks alone would not surface
   them.

Blast radius, from the registry's Sev column crossed with live emit sites:
15 pure-W codes (`unknown-frontmatter-field`, `deferred-frontmatter-field`,
`bind-echo-without-params`, `binder-model-strict-capability-unknown`,
`argument-hint-not-displayed`, `case-collision`, `cross-source-shadow`,
`unreadable`, `settings-unreadable`, `settings-invalid-json`,
`non-canonical-extension`, `manifest-escapes-package`, `discovery-slow`,
`package-read-timeout`, `typed-query-unsupported-provider`) plus the W arms
of `callee-has-errors` (`invoke(...)` literal), `unreadable-source` (every
source but `--theta`), and `wrong-type-source` (conventional roots). All have
production emit sites (`src/discovery/discovery-walk.ts`,
`src/discovery/settings.ts`, `src/discovery/package-discovery.ts`,
`src/parser/frontmatter.ts`, `src/binder/binder-model.ts`,
`src/binder/provider-error-mapping.ts`, `src/extension/invoke-static-checks.ts`).
(`missing-source` is E/W in the table but its trigger reads "warning never",
so it has no live W arm.)

History — the filter was born with production and never revisited: the H8a
live composition (`3a8732da`, 2026-07-02) shipped `emitDiagnostic` as
`if (severity === "error") ctx.ui.notify(...)` with a notes.md entry deferring
"full `loom-system-note` transcript routing for load-phase diagnostics" (the
channel's pre-rename name); `e7ebe458` added the headless stderr mirror
inside the error arm (and recast the filter as the early return); `4a38a4bf`
(V4e) routed the error arm onto the note channel and kept the early return.
Bug 0010's fix review (F4) then made the drop explicit: the gate-wiring
comment (:755–764) records "BOTH production load-emit sinks drop non-error
severities … so this warning (like EVERY load-phase warning today) is
currently DROPPED, not surfaced anywhere in production."

## Why it matters

- **The bug-0010 provider gate is half-dead.** The gate's design is
  two-stage: warn at load, refuse at dispatch. Production emits the load
  warning into a sink that drops it, so a typed theta pinned to an
  unsupported provider registers with zero signal and the author discovers
  the incompatibility only when the first typed query returns
  `Err(TransportError)` — at runtime, possibly mid-workflow, with the load
  remedy ("switch to a supported provider, drop the typed-query
  expressions") now a debugging exercise. The spec text this voids was
  deliberately written as a warning so "the theta still loads" — the lenient
  half works, the informative half does not.
- **Silent-mistake detectors detect silently.** Several W rows exist solely
  to surface conditions that have no other symptom:
  `non-canonical-extension` (registry row: "the warning's purpose is to
  surface an otherwise-silent authoring mistake" — a `Plan.THETA` file is
  invisible to discovery on every platform), `case-collision`,
  `cross-source-shadow` (a shadowed theta runs the wrong file with no
  indication), `settings-invalid-json` (a typo'd
  settings file silently reverts every knob to defaults), `unreadable` (a
  broken symlink un-registers a theta with no trace). Each condition's only
  documented observable is the warning that production drops.
- **A documented degradation signal never degrades visibly.**
  `binder-model-strict-capability-unknown` is the registry-documented
  universal branch under the SDK pin — every non-bypass theta emits it at
  every load — and its hint ("Verify empirically that the chosen binder model
  supports strict structured-output …") is advice no operator has ever seen.
- **Operator tooling contracts are dead on arrival.** diagnostic-shape.md
  entitles consumers (LSP integrations, log pipelines, test harnesses) to
  the structured `details.diagnostics` payload on the note channel. For
  warnings that payload never exists, and DIAG-2's closed-registry
  discipline — severity is a spec-versioned contract column — is moot for
  the W half of the load table.
- Bounded in degree: warnings by definition never change what registers or
  runs; every dropped code describes a condition the session survives. The
  loss is purely informational — but "purely informational" is the entire
  job of a warning.

## Options

1. **Route warnings onto the `theta-system-note` channel, symmetric to the
   error path** (recommended). In `emitLoadNote`, replace the early return
   with direct channel delivery for non-error severities —
   `sendSystemNote`/`emitDiagnosticBatch` with
   `content: renderDiagnosticBatch(...)`, `display: true`,
   `details: { diagnostics }`, `triggerTurn: false` — **not** through
   `routePreEvalFailure` (warnings are not pre-evaluation failures; the V4e
   router's cause mapping is error-shaped). The `channel` deps object is
   already in scope at `emitLoadNote`'s construction site (:987), and
   `emitDiagnosticBatch` (:235–251) constructs exactly the pinned envelope —
   the warning arm is one call. The serialised line format already carries
   the code, and severity is registry-derivable from it for all but the
   three E/W rows (structured consumers read it from `details.diagnostics`);
   the renderers (`renderDiagnosticLine`/`renderDiagnosticBatch`,
   `src/diagnostics/diagnostic.ts`) are severity-agnostic today. Mirror the
   same arm into `makeLoadEmit`'s headless-stderr branch so `-p`/CI users see
   warnings on stderr as they now see errors — stderr only: `makeLoadEmit`
   has no channel access, its `UiNotifier` surface is typed `"error"`-only,
   its :981 instance is deliberately off-channel (the PIC-54 fallback must
   not re-enter the channel), and
   `tests/e2e-s6-load-emit-toast-path.test.ts` pins the helper path as
   "never the note channel". Two obligations ride along:
   (a) forward `document.diagnostics` on `parseDiscoveredTheta`'s registering
   path (drop site 3), else frontmatter/parse warnings stay invisible after
   the sinks are fixed; (b) batch per pass or per file (the multi-error rule
   already mandates one `sendMessage` per `.theta` batch) to bound volume.
   Honest noise accounting: `binder-model-strict-capability-unknown` fires
   per non-bypass theta per load, and diagnostic-shape.md's re-scan rule
   forbids dedup across reloads — surfacing warnings per spec therefore adds
   a recurring per-reload note in warning-bearing workspaces. That is the
   documented contract; if the volume is judged wrong once visible, the
   remedy is a spec change to the offending row (severity regrade or a
   once-per-session emission rule under DIAG-2), not continued silent
   dropping. Seam tests already exist to extend: the provider-gate suite's
   comment (:60–68) states the helper-seam cells "become extendable to an
   integration cell the moment the shared sink routes warnings". One
   test-suite ripple: the hardening probes assume every load-phase
   `theta-system-note` entry is error-severity
   (`tests/hardening/discovery-cli.test.ts:18–19` — "the old per-diagnostic
   `type === \"error\"` checks are now implicit"); once warnings land on the
   channel that assumption needs re-stating per probe.
2. **Align the spec to the implementation:** carve warning-severity load
   diagnostics out of the persistent-channel default (a sixth carve-out
   class), rewrite the emission promises in discovery-sources.md /
   package-and-settings.md / conversation-drive.md, and mark the 18 W rows
   as registered-but-undelivered. Rejected as the recommendation: it deletes
   the stated purpose of every silent-mistake detector row, reverses the
   bug-0010 gate's documented two-stage design immediately after that fix
   deliberately wired the emission, and blesses a sink shortcut as contract
   — the repo's rule is that the Reference is the authority for intended
   behaviour (docs/bugs/README.md).

## Non-goals

- **Error-severity routing** — conforming since V4e on the shipped path; the
  H8a helper path's toast-instead-of-note routing for errors is a separately
  recorded, test-pinned state (`tests/e2e-s6-load-emit-toast-path.test.ts`).
- **The watcher-time settings re-merge re-emit severity** — `reload-wiring.ts`
  emits code `theta/load/settings-invalid-json` (registry Sev W) at severity
  `"error"` on the ERR-7 arm; a registry-conformance question adjacent to but
  distinct from this report.
- **Re-scan deduplication semantics** — the no-dedup rule is contract; option
  1 inherits it knowingly.
- **Severity regrades or row deletions** for any W code — DIAG-2 spec
  changes, to be argued per row once warnings are visible.
- **The e2e-s4 inventory suites** — their parser-seam scope is correct for
  their subject (code production); delivery coverage is new work under
  option 1.

## Provenance

- Origin: bug 0010 Fix §Residuals ("emitted but unobservable in production…
  a pre-existing routing gap for ALL load warnings"), fix-review finding F4,
  and the gate-wiring HONEST LIMIT comment
  (`src/extension/production-composition.ts:755–764`).
- Spec measured against:
  `docs/spec_topics/diagnostics/diagnostic-shape.md` (persistent-diagnostics
  default, five-exception carve-out, transient-toast MUST NOT, multi-error
  reporting, re-scan deduplication),
  `docs/spec_topics/diagnostics/code-registry-load.md` (Sev column, W-row
  triggers/hints), `docs/spec_topics/discovery/discovery-sources.md`
  (failure-modes table, "All warnings and errors above are emitted…",
  DISC-3, non-canonical extension),
  `docs/spec_topics/discovery/package-and-settings.md` (DISC-6),
  `docs/spec_topics/pi-integration-contract/conversation-drive.md`
  (§Provider compatibility — "the runtime emits … (warning)"),
  `docs/spec_topics/errors-and-results/error-model.md` (pre-eval scope is
  eight error surfaces), `docs/reference/diagnostics.md` (transcribed
  registry).
- Implementation: `src/extension/production-composition.ts` (`makeLoadEmit`
  :170–191, `emitLoadNote` :1002–1011, consumers :282/:981/:1013/:1037/:1043,
  emit sites :346/:361/:377/:562/:610/:657/:710/:739/:773 plus the E-only
  sites :591/:639/:677/:694/:898, `parseDiscoveredTheta` :1784–1835, V4e WHY
  :996–998, gate-wiring HONEST LIMIT :755–764),
  `src/extension/system-note-channel.ts`
  (`UiNotifier.notify` error-typed :77, severity-agnostic
  `emitDiagnosticBatch` :235), `src/diagnostics/diagnostic.ts` (renderers),
  warning constructors in `src/discovery/discovery-walk.ts`,
  `src/discovery/settings.ts` (:309/:322), `src/discovery/package-discovery.ts`,
  `src/parser/frontmatter.ts`, `src/binder/binder-model.ts` (:233),
  `src/binder/provider-error-mapping.ts` (:123).
- History: `3a8732da` (H8a — filter born with the first live composition),
  `e7ebe458` (stderr mirror, error arm only), `4a38a4bf` (V4e note routing,
  early return retained), `30492948` (bug-0010 fix wires the gate warning
  into the filtered stream and records the residual).
- Tests inspected: `tests/typed-query-provider-gate.test.ts` (:49–58 —
  warning "UNOBSERVABLE from any injectable surface"; :60–68 — disposition
  RECORDED, extendable integration cell), `tests/hardening/probe-harness.ts`
  (:19–23 — warnings "route to neither surface"),
  `tests/e2e-s6-load-emit-toast-path.test.ts` (pins the error path only),
  `tests/e2e-s4-never-emitted-diagnostics.test.ts` /
  `tests/e2e-s4-uncovered-emitted-diagnostics.test.ts` (parser-seam scope;
  no delivery coverage), `tests/hardening/discovery-cli.test.ts` (:11–16 —
  probes assert on error notes because warnings are unobservable).
