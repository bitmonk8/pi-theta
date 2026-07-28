# Bug 0024 — After a re-bind, a surviving slash name is collision-dropped against the extension instance's own prior registration: its handler stays bound to the superseded drained registry and dispatch yields the shutting-down note until `/reload`

- **Status:** open
- **Kind:** defect — the supersession flow's `session_start` compose pass
  treats the instance's OWN prior `pi.registerCommand` registrations as
  foreign collisions. The spec's
  [superseded-entry dispatch](../spec_topics/pi-integration-contract/registration-steps.md#superseded-entry-dispatch)
  enumerates the supersession-drop causes as "a later-appearing Pi prompt
  template, skill, or sibling-extension command" — NOT the instance's own
  prior registration — so the self-collision drop is a defect in the
  supersession flow: a pre-existing code path, newly load-bearing now that a
  repeat `session_start` is a designed supersession pass per
  [registration-steps.md#repeat-start-supersession](../spec_topics/pi-integration-contract/registration-steps.md#repeat-start-supersession)
  (the bug-0021 fix).
- **Affected** (citations verified against the 0.30.0 tree):
  - `src/extension/production-composition.ts:1107–1116` — the `session_start`
    compose path's `runComposePass` call passes
    `excludeOwnedNames = undefined` (:1114). The own-name exclusion exists
    only on the hot-reload rediscover path (:1146–1155, exclusion
    `new Set(registry.snapshot().keys())` at :1153).
  - `readPiOwnedCommands` (`production-composition.ts:1972–1990`, exclusion
    filter :1981) — with `excludeOwnedNames` absent, every
    `source: "extension"` entry, including the instance's own, lands in the
    collision source set.
  - `resolveSlashNames` (`src/discovery/discovery-walk.ts:903`;
    theta-vs-Pi-owned drop arm :922–931) — drops the re-discovered theta and
    emits a `theta/load/cross-format-collision` diagnostic whose message
    claims "Pi-owned command '<name>' survives".
  - Pi exposes no `pi.unregisterCommand`
    ([registration-steps.md, *Structural changes*](../spec_topics/pi-integration-contract/registration-steps.md#structural-changes-no-unregister)),
    so the name's registered handler survives, bound to the superseded
    generation's drained registry.
- **Observed at:** `0.30.0` (fix commit for bug 0021). Offline,
  deterministic — locked as pre-existing behaviour by test 4 of
  `tests/double-session-start-supersession.test.ts` (the `registeredNames`
  length-1 witness and its inline comment).

## Summary

After any re-bind of the same extension instance — a shutdown-less
supersession or a start-after-shutdown rebind — a slash name that SURVIVES
into the new generation's discovery (its `.theta` file still present) is
dropped by the new pass's collision read: the pass calls `runComposePass`
with `excludeOwnedNames = undefined`, so `resolveSlashNames` sees the name's
existing `source: "extension"` entry (the instance's own prior registration)
as a foreign cross-format collision and drops the re-discovered theta. No
second `pi.registerCommand` call is issued, so the name's registered handler
stays bound to the superseded generation's registry — which the bug-0021 fix
drains at supersession (and the step-4 teardown drains on the rebind path) —
and every post-re-bind dispatch of the surviving name returns the drain-state
arm-(b) note `theta /<name>: extension shutting down` on a live session,
until the operator runs `/reload` (fresh extension instance).

This is fail-safe and spec-coherent with the step-5 pin (which contemplates
surviving stale-bound names failing safe on arm (b)), and materially better
than the pre-fix behaviour (silent dispatch against a stale stranded
registry). The defect is that the supersession pass does not re-own surviving
names, and the note misnames the state: "shutting down" on a session that is
live, where the accurate story is supersession.

## Reproduction

Offline, deterministic — the start-after-shutdown control mechanism of
`tests/double-session-start-supersession.test.ts` (test 4) with `greet.theta`
KEPT on disk: `session_start` (registers `/greet`), completed
`session_shutdown`, `session_start` again. The rebind pass re-discovers
`greet.theta` but its collision read has no own-name exclusion, so generation
1's own `/greet` (`source: "extension"`) drops the re-discovered theta and no
second `registerCommand` call is issued — test 4 locks exactly this with its
`registeredNames` length-1 assertion and marks it in the inline comment as
pre-existing behaviour, not part of the bug-0021 fix. Dispatching `/greet`
after the rebind then routes through generation 1's drained registry to the
arm-(b) shutting-down note. The shutdown-less variant is identical with the
`session_shutdown` omitted (the bug-0021 supersession drains the outgoing
registry instead).

## Expected behaviour

Per
[registration-steps.md#repeat-start-supersession](../spec_topics/pi-integration-contract/registration-steps.md#repeat-start-supersession)
a repeat `session_start` is a supersession pass — step 3's supersession-pass
language treats it as a contemplated re-registration input — so a surviving
name should be re-owned: its dispatch re-bound to the new generation's
registry, where the re-discovered theta lives. At minimum, a live-session
dispatch of a surviving name should return the superseded note pinned by
[#superseded-entry-dispatch](../spec_topics/pi-integration-contract/registration-steps.md#superseded-entry-dispatch)
(`theta /<name>: superseded; /reload to refresh`) — which names the actual
state and the recovery — not the shutting-down note.

## Actual behaviour / root cause

`excludeOwnedNames` is `undefined` on the `session_start` compose pass
(`production-composition.ts:1114`). The exclusion mechanism exists
(`readPiOwnedCommands` honours it, :1981) and the hot-reload rediscover path
uses it (:1153), so a reload pass never self-collides. The `session_start`
pass predates supersession as a designed flow: at its design point an
extension instance received exactly one `session_start`, with no own
registrations to exclude. Now that a repeat delivery is a designed
supersession pass, the same read runs with the instance's own registrations
present and classifies each surviving name as a foreign collision
(`resolveSlashNames`, `discovery-walk.ts:922–931`) — dropping it from the new
registry and mis-describing the drop in the collision diagnostic ("Pi-owned
command '<name>' survives").

## Fix options and recommendation

1. **Thread the outgoing generation's own names into the supersession pass's
   collision read (recommended).** Mirror the hot-reload path's exclusion:
   pass the prior generation's registered slash names as `excludeOwnedNames`
   on a re-bind compose (the factory holds the outgoing `liveRegistry` at
   compose start; `runComposePass` already accepts the set). The surviving
   name then resolves in discovery and registers with a drain-gated handler
   over the NEW registry. Requires confirming the host's `registerCommand`
   overwrite semantics for an existing extension-owned name at the pin — the
   hot-reload path avoids re-registration because its registry object
   survives the swap; here the binding must move to the new generation's
   registry.
2. **Post-drop re-registration.** Keep the collision read as-is; after the
   supersession pass, re-register each self-collision-dropped name against
   the new registry. Same overwrite question, plus the pass must distinguish
   self-collisions from genuine foreign collisions. More moving parts;
   fallback only.

Option 1 reuses the exclusion mechanism `readPiOwnedCommands` already
implements and makes the supersession pass consistent with the hot-reload
pass's own-name posture.

## Provenance

- Origin: bug-0021 fix orchestration — stage-2 fixer analysis plus reviewer
  round 1, which accepted the fail-safe behaviour for 0.30.0 and required the
  residual filed.
- Recorded at the fix: bug 0021 §"Fix (0.30.0)" Residuals item (i); test 4 of
  `tests/double-session-start-supersession.test.ts` locks the drop as
  pre-existing behaviour (the `registeredNames` length-1 witness).
- Implementation evidence: `src/extension/production-composition.ts`
  (:1107–1116, :1146–1155, :1972–1990), `src/discovery/discovery-walk.ts`
  (:903, :922–931), all at the 0.30.0 tree.
- Spec:
  [registration-steps.md#repeat-start-supersession](../spec_topics/pi-integration-contract/registration-steps.md#repeat-start-supersession),
  [#superseded-entry-dispatch](../spec_topics/pi-integration-contract/registration-steps.md#superseded-entry-dispatch),
  [#structural-changes-no-unregister](../spec_topics/pi-integration-contract/registration-steps.md#structural-changes-no-unregister),
  the [`ThetaRegistry` drain-state contract](../spec_topics/pi-integration-contract/drain-state-contract.md#theta-registry-drain-state-contract).
