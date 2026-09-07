---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: Eight extension modules carry tests-task stub narration describing implemented functions and populated constants as inert stubs
lens: D2                     # the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending             # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/reload-debounce.ts:20-24
  - src/extension/reload-wiring.ts:17-19
  - src/extension/reload-wiring.ts:221-222
  - src/extension/reload-wiring.ts:249-250
  - src/extension/reload-wiring.ts:261
  - src/extension/session-shutdown.ts:12-16
  - src/extension/session-shutdown.ts:162
  - src/extension/session-shutdown.ts:169-171
  - src/extension/session-shutdown.ts:211-212
  - src/extension/session-shutdown.ts:247
  - src/extension/session-shutdown.ts:276
  - src/extension/session-shutdown.ts:305-307
  - src/extension/session-shutdown.ts:385-386
  - src/extension/session-shutdown.ts:527-529
  - src/extension/sdk-inventory.ts:27-30
  - src/extension/unknown-reason-rule.ts:12-16
  - src/extension/watcher-recovery.ts:20-23
  - src/extension/theta-composition-producer.ts:27-35
  - src/extension/version-bump-gates.ts:49-54
  - src/extension/version-bump-gates.ts:130-132
  - src/extension/version-bump-gates.ts:157-159
  - src/extension/version-bump-gates.ts:183-184
  - src/extension/version-bump-gates.ts:207-208
  - src/extension/version-bump-gates.ts:248-250
  - src/extension/version-bump-gates.ts:293-294
  - src/extension/version-bump-gates.ts:309-311
  - src/extension/version-bump-gates.ts:363-365
sites: 27
fix_scope: cross-module      # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# Eight extension modules carry tests-task stub narration describing implemented functions and populated constants as inert stubs

## Observation
These modules were built under the repository's paired tests-task/implementation
flow ("V*-T declares the seams and stubs the behaviour; the paired V* fills them
in"). The stub-phase narration was left in place after the implementations
landed: 27 comment sites across eight files state, in present tense, that the
code they sit on is an inert stub — "does nothing", "returns a placeholder",
"performs no presence diff", "stubs both constants as empty frozen arrays",
"stubs the composed `run` INERTLY" — while the adjacent bodies are the full
implementations. Sibling filings covered this pattern in binder/, diagnostics/,
discovery/, drain-state.ts, inventory-closure-audit.ts, and load-pre-eval.ts;
none of the eight files here is covered by an existing finding (verified by
grep of quality/intake/ for `V9g-T|V18c-T|V9m-T|V19e-T|V18a-T|V9h-T|V9q-T|V10d-T`,
which matched only a drain-state.ts citation and a commit-message quote).

## Evidence
Exact searches: `grep -n "V18c-T stub" src/extension/version-bump-gates.ts` → 8
hits (:130, :157, :183, :207, :248, :293, :309, :363); `grep -n "V9g-T stub"
src/extension/session-shutdown.ts` → 7 hits (:169, :211, :247, :276, :305,
:385, :527) plus the section header at :162 and module header at :12. All other
sites are enumerated in the frontmatter and sampled below.

src/extension/reload-wiring.ts:249-254 — stub claim directly above the filled
body it contradicts:

```ts
   * V9m-T stub: a no-op leaving the field at its factory value, so the PIC-32
   * test reds on its primary assertion (the paired V9m sets the flag).
   */
  drain(): void {
    this.#drained = true;
  }
```

Same file :261-265 — `initDrainStateTag` doc says "V9m-T stub: a no-op (the
paired V9m sets the tag)."; the body at :263-265 sets the tag. :17-19 module
header: "V9b-T (tests-task) declares the seam shapes and stubs the
behaviour-bearing functions"; `rebuildAndSwap` (:340-363), `dropCollidingThetas`
(:448-472), `structuralChangeNote` (:487-508), `createModelReferenceMatcher`
(:518-553) are all implemented in the same file. :221-222 repeats "the paired
V9m implementation fills in the two writers" for the already-filled writers.

src/extension/session-shutdown.ts:169-175:

```ts
 * V9g-T stub: returns a placeholder `Error` so the CNCL-4 message-and-identity
 * assertions red on their primary check (the paired V9g synthesises the pinned
 * reason).
 */
export function synthesiseSessionShutdownReason(): Error {
  return new Error(SESSION_SHUTDOWN_ABORT_MESSAGE);
}
```

Same file :527-531 — on the fully-orchestrated five-sub-step handler
(:531-640):

```ts
 * V9g-T stub: does nothing (returns a resolved promise), so the spy-based
 * per-sub-step / isolation / cap / abort-reason assertions red on their primary
 * checks. The paired V9g implementation orchestrates the sequence.
 */
export async function runSessionShutdown(
```

The five remaining `V9g-T stub:` sites (:211, :247, :276, :305, :385) sit on
`teardownStepFailedDiagnostic`, `cancelledBySessionShutdownDiagnostic`,
`reloadTeardownTimeoutDiagnostic`, `emitTeardownDiagnostic`, and
`emitNestedShapeDiagnostic`, each of which builds the real diagnostic / performs
the real wrapped emission in its body.

src/extension/version-bump-gates.ts:130-143 — stub claim above the implemented
reconciliation:

```ts
 * V18c-T stub: performs no presence diff (returns no failures), so the
 * adversarial direction — which expects the dropped id — reds on its detection
 * assertion because the reconciliation is absent. The paired `V18c` fills it in.
 */
export function surfaceInventoryPresenceFailures(
  sdk: PinnedSdkSurface,
): readonly string[] {
  const presenceCheckableKinds: ReadonlySet<string> = new Set([
    "namespace-function",
    "pi-member",
    "ctx-member",
    "peer-named-import",
  ]);
  return SDK_SURFACE_INVENTORY.filter(
```

The other seven `V18c-T stub: performs no …/detects neither arm` sites sit on
`capabilityCountCoEditFailures` (:161), `enginesNodeEqualityFailures` (:186),
`peerDependencyPinFailures` (:210), `reasonSnapshotConsistencyFailures` (:252),
`apiCoverageFailures` (:296), `seedFieldFixtureFailures` (:313), and
`strictCapabilityProbeFailures` (:368) — every body performs the check its doc
denies. The module header :49-54 adds "stubs each with an inert sentinel result
— never the real reconciliation … The paired `V18c` implementation leaf fills
the gate bodies in."

src/extension/sdk-inventory.ts:27-30 — both constants are populated at
:135-175 (`CAPABILITY_OBLIGATIONS`, seven rows) and :177-372
(`SDK_SURFACE_INVENTORY`, ~50 rows):

```ts
// V18a-T (this tests-task) declares the seam types and stubs both constants as
// empty frozen arrays so the paired failing tests compile and red on their own
// primary assertions (cardinality / partition / row-resolution). The paired
// `V18a` implementation leaf fills the two constants in.
```

src/extension/theta-composition-producer.ts:27-35 — the composed `run`
(:431-615) runs the binder, routes on mode, drives the executor, and surfaces
the result:

```ts
// V19e-T (this tests task) declares the producer seam and stubs the composed
// `run` INERTLY: the returned fixture carries the correct `slashName` but its
// `run` runs NO binder, performs NO mode routing, drives NO executor, and
// surfaces NO result. Every paired test therefore reds on its own primary
// assertion — a binder that never ran, an executor never driven against the
// user / private conversation, a prompt turn never issued, a subagent session
// never spawned, or a bind step that never committed ahead of the executor's
// first statement — not on a compile error, a missing fixture, or a harness
// throw. The paired `V19e` implementation leaf fills the composed `run` in.
```

src/extension/reload-debounce.ts:20-24 — `onWatcherEvent` (:130-138) and
`#startRebuild` (:210-247) implement the debounce and the rebuild dispatch:

```ts
// V10d-T (tests-task) declares the seam shape and stubs the behaviour-bearing
// method so the failing tests compile and red on their own primary assertions
// (no reload ever fires, so the debounce and serialization tests red because
// the implementation under test is absent). The paired V10d implementation
// leaf fills this in.
```

src/extension/unknown-reason-rule.ts:12-16 ("stubs the behaviour-bearing
`classifyShutdownReason` … the paired V9h implementation fills it in") — the
classifier is implemented at :96-162. src/extension/watcher-recovery.ts:20-23
("stubs the behaviour-bearing `armWatcherWithTerminalRecovery` … the paired V9q
implementation fills in the terminal-recovery body") — the recovery body is
implemented at :139-198.

## Why this is a problem
Leftover scaffolding narration: the stub-phase comments were part of the
tests-task delivery mechanism, and the paired implementations have landed in
every cited file (each excerpt above shows the implemented body adjacent to the
claim that it is absent). A reader of `runSessionShutdown` is told it "does
nothing"; a reader of `surfaceInventoryPresenceFailures` is told "the
reconciliation is absent"; a reader of `sdk-inventory.ts` is told both
constants are "empty frozen arrays". Each claim is false by inspection of the
lines immediately below it, so the comments now actively misdescribe the code
they annotate.

## Suggested direction (non-binding, optional)
Delete the stub-phase sentences (module headers and per-function "V*-T stub:"
paragraphs), keeping the surrounding spec citations and behavioural
descriptions that remain accurate — the same cleanup shape as the sibling
findings covering binder/, discovery/, and diagnostics/ modules.

## False-positive check
- Verified every cited claim against the adjacent body in the current tree:
  `drain`/`initDrainStateTag` set their fields (reload-wiring.ts:252-266);
  `runSessionShutdown` orchestrates sub-steps 1–5 (session-shutdown.ts:531-668);
  all eight version-bump gates compute failures (version-bump-gates.ts:134-385);
  both sdk-inventory constants are populated (:135-372); the composed `run`
  is the full dispatch (theta-composition-producer.ts:431-616);
  `classifyShutdownReason` and `armWatcherWithTerminalRecovery` are implemented.
- Checked in-scope files for the same pattern and excluded those with accurate
  narration: system-note-channel.ts ("The V7d implementation fills in … the
  V7d-T tests-task declared") is past-tense and true; version-bump-acceptance.ts,
  session-swap-tripwire.ts, stale-ctx.ts, subagent-fn-static-checks.ts,
  system-note-renderer.ts, prompt-tool-loop-governor.ts carry no stub claims.
- Duplicate check: grepped quality/intake/ for `V9g-T|V18c-T|V9m-T|V19e-T|
  V18a-T|V9h-T|V9q-T|V10d-T|V9b-T` — the existing stub-narration findings
  (qw20260907130901-d2-01/-08/-09) cover src/binder/*, src/diagnostics/*,
  src/discovery/*, src/extension/inventory-closure-audit.ts,
  src/extension/load-pre-eval.ts, and src/extension/drain-state.ts only; none
  of the eight files cited here appears in any pending or resolved finding.
- Not a behaviour claim: comments only; no code change implied beyond deletion.

## Triage
