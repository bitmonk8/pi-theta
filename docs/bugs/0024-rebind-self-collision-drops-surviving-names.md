# Bug 0024 — After a re-bind, a surviving slash name is collision-dropped against the extension instance's own prior registration: its handler stays bound to the superseded drained registry and dispatch yields the shutting-down note until `/reload`

- **Status:** fixed (0.36.0). `registration-steps.md` gains **PIC-69**: the
  cross-format collision source set excludes every entry that carries
  `source: "extension"` and bears a name this extension instance itself passed
  to `pi.registerCommand`, on every pass — first start, hot-reload,
  supersession, and start-after-shutdown rebind. The runtime threads a
  factory-scoped own-registration ledger into every compose pass and applies
  the exclusion after the source filter, so a surviving slash name re-owns
  (registers again against the new generation's registry) instead of
  self-colliding, while a same-named `"prompt"` or `"skill"` entry still drops
  the theta.
- **Kind:** defect **plus spec gap**.
  - *Defect* — the supersession flow's `session_start` compose pass treats the
    instance's OWN prior `pi.registerCommand` registrations as foreign
    collisions. A pre-existing code path, newly load-bearing now that a repeat
    `session_start` is a designed supersession pass per
    [registration-steps.md#repeat-start-supersession](../spec_topics/pi-integration-contract/registration-steps.md#repeat-start-supersession)
    (the bug-0021 fix).
  - *Spec gap* — the intended-behaviour argument rests on enumerations:
    [DISC-4 arm 2](../spec_topics/discovery/discovery-sources.md#disc-4)
    (`discovery-sources.md:79`) says "another extension's command" and
    [superseded-entry dispatch](../spec_topics/pi-integration-contract/registration-steps.md#superseded-entry-dispatch)
    says "sibling-extension command". Step 3's own normative text
    (`registration-steps.md:10`) keys the drop on `source` membership in
    `{"prompt","extension","skill"}`, and theta's own entries carry
    `source: "extension"`, so a literal reading mandates the self-drop. No
    spec text pins the own-name exclusion on either the hot-reload path or the
    supersession path: a `docs/spec_topics/**` and `docs/reference/**` search
    for own-name / self-collision language returns nothing, and the existing
    hot-reload carve-out is justified only by a code comment
    (`production-composition.ts:364–370`, `:1978–1980`).
- **Affected** (citations at HEAD `4d645f4f`, 0.32.0 —
  `production-composition.ts` and `discovery-walk.ts` are byte-identical to
  the bug-0021 fix commit `7fa76517`):
  - `src/extension/production-composition.ts:1107–1116` — the `session_start`
    compose path's `runComposePass` call passes
    `excludeOwnedNames = undefined` (:1114). The own-name exclusion exists
    only on the hot-reload rediscover path (:1146–1155, exclusion
    `new Set(registry.snapshot().keys())` at :1153). A third call site,
    `discoverAndComposeFixtures` (:333–353), also omits the argument; it is
    single-pass by construction and reached only from tests
    (`extensions/index.ts` re-exports only `src/extension/factory.ts`'s
    default export, which routes through `composeInstance` →
    `composeExtensionInstance`).
  - `readPiOwnedCommands` (`production-composition.ts:1972–1993`, exclusion
    filter :1981) — with `excludeOwnedNames` absent, every
    `source: "extension"` entry, including the instance's own, lands in the
    collision source set. The exclusion test at :1981 runs BEFORE the source
    filter at :1984–1988, so the existing exclusion is name-keyed and
    source-blind.
  - `resolveSlashNames` (`src/discovery/discovery-walk.ts:903`;
    theta-vs-Pi-owned drop arm :922–931) — drops the re-discovered theta and
    emits an error-severity `theta/load/cross-format-collision` diagnostic
    (:923–929) whose message claims "Pi-owned command '<name>' survives"
    (:928).
  - Pi reports theta's own registered commands as `source: "extension"`,
    indistinguishable from a sibling extension's:
    `dist/core/agent-session.js:1826–1833` maps
    `runner.getRegisteredCommands()` to
    `{ name: invocationName, source: "extension", … }`, and
    `dist/core/extensions/runner.js:371–398` sets `invocationName` to the bare
    name when the name occurs once across all extensions (no `:2` suffix).
  - Pi exposes no `pi.unregisterCommand`
    ([registration-steps.md, *Structural changes*](../spec_topics/pi-integration-contract/registration-steps.md#structural-changes-no-unregister)) —
    confirmed absent from the SDK at the pin — so the name's registered
    handler survives, bound to the superseded generation's drained registry.
- **Observed at:** `0.30.0` (fix commit for bug 0021); reproduces unchanged at
  `0.32.0` (`4d645f4f`). Offline, deterministic — locked as pre-existing
  behaviour by test 4 of `tests/double-session-start-supersession.test.ts`
  (`:687`, the `registeredNames` length-1 witness at :718–720 and its inline
  comment at :709–716). Reachability is class (b), inherited from bug 0021 for
  both triggers: **not** reachable through the shipped CLI hosts at the host
  pin (`~0.80.10`), reachable in-product through the public host SDK —
  `AgentSession.bindExtensions()` carries no once-guard and re-emits the
  stored `_sessionStartEvent` to the same runner and the same factory closure
  (`dist/core/agent-session.js:1744–1765`, emit at :1764).

## Fix (0.36.0)

Both §Fix steps, one commit; line anchors at the fix commit.

**Step 1 — spec amendment (landed first, D1).**
`docs/spec_topics/pi-integration-contract/registration-steps.md` gains
**PIC-69** (`:16`, *Own-registration exclusion from the cross-format collision
source set*): on every pass that consults `pi.getCommands()` for the collision
check — the first `session_start`, each hot-reload, each repeat-`session_start`
supersession, and each start-after-shutdown rebind — the instance MUST exclude
every entry that both carries `source: "extension"` and bears a name it itself
passed to `pi.registerCommand`. The excluded set is pinned as the instance's
own registration LEDGER, not its current `ThetaRegistry` keys, and the
exclusion is pinned source-conditioned, never name-only. Sibling
indistinguishability is recorded in the pin as a known limitation (D2), with
Pi's numeric-suffix invocation-name derivation named as the terminal state for
that case. A companion clause `#surviving-name-re-ownership` (`:18`) pins the
consequence: a name whose `.theta` still resolves re-registers and emits no
collision diagnostic, while a name whose `.theta` does not keeps the
arm-(b) `"theta /<name>: extension shutting down"` note (D4). Step 3's own text
(`:10`) carries the exclusion clause and now scopes its
previously-registered-theta drop to a newly-appeared `.md` prompt template or
skill — a *foreign* extension command under a ledger-held name cannot reach
that drop, which the same sentence states. `#superseded-entry-dispatch`
(`:12`), DISC-4 arm 2 and its `session_start` paragraph
(`docs/spec_topics/discovery/discovery-sources.md:79`, `:85`), the
`pi.getCommands()` completeness presupposition
(`docs/spec_topics/pi-integration-contract/host-prerequisites.md:66`) and
`docs/reference/discovery-cli.md:82` carry the parallel qualification;
`docs/plan_topics/coverage-matrix.md:91` gains the PIC-69 row. The amendment
also retroactively anchors the pre-existing hot-reload carve-out, which rested
only on a code comment.

**Step 2 — the ledger, threaded into every compose pass (D3).**
`src/extension/factory.ts` declares `ownRegisteredNames` (`:384`) in the
factory closure beside the PIC-67/PIC-68 counters — one per extension
instance, no globals or statics — and `registerFixtures` stamps every slash
name into it immediately before the `pi.registerCommand` call (`:499`),
including when that call throws: excluding a name Pi does not hold is
harmless, failing to exclude one it does re-opens this bug.
`ThetaExtensionDeps.composeInstance` widens to carry the ledger, the compose
call forwards it (`:668`), and the production default export's arrow threads it
to the composition root (`:975`). `src/extension/production-composition.ts`
takes it as a trailing optional parameter on `composeExtensionInstance`
(`:1060`) — a live alias, not a snapshot, so each pass reads the names
registered as of that pass — forwards it to the initial `runComposePass`
(`:1162`) where `undefined` was hard-coded, and prefers it over the
registry-snapshot carve-out on the hot-reload rediscover pass (`:1209`). A
caller that supplies no ledger (the direct `composeExtensionInstance` test
callers, which construct no factory) gets no own-name exclusion on the initial
pass: PIC-69 keys the exclusion on ledger membership, so no substitute set
derived from `pi.getCommands()` is admissible — it would exclude a foreign
extension's command and disable theta-vs-foreign detection.
`discoverAndComposeFixtures` keeps its signature.

**The exclusion became source-conditioned (D2).** `readPiOwnedCommands`
(`:2029`) applies the source-membership filter first and the exclusion after
it, gated on `command.source === "extension"` (`:2050`). The pre-fix ordering
was name-keyed and source-blind, so it also hid a genuine `"prompt"` /
`"skill"` entry of an excluded name — a hole on the hot-reload path that
extending name-keyed exclusion to the rebind path would have widened.

**Unchanged by decision.** The registry drain stays (D4): a *removed* name
keeps the spec-pinned arm-(b) note. The `theta/load/cross-format-collision`
message wording is untouched — a re-owned name now emits no diagnostic at all.
No new diagnostic code; `tests/fixtures/h7a/permitted-codes.json` unchanged.
Bug 0029's files are untouched (D5).

**Verification.** Default suite 226 files / 2656 tests green; typecheck clean;
lint clean. Offline lock — `tests/rebind-self-collision-reownership.test.ts`
(new, six tests over the real `createThetaExtension` +
`composeExtensionInstance` on a temp workspace, `FakeClock`,
`FakeFileWatcher`): Trigger A start-after-shutdown rebind (`:449`) and
Trigger B shutdown-less repeat start (`:503`) each assert a second
`registerCommand`, zero collision notes, and no shutting-down note at
dispatch; the source-conditioning control (`:560`) proves a genuine
`source: "prompt"` entry still drops the theta; the ledger discriminator
(`:614`) registers a name in generation 1, drops it from the live registry
through a hot-reload collision, and re-owns it across a re-bind — red if the
own-name set were `liveRegistry.snapshot().keys()`; the removed-name control
(`:686`) proves a deleted `.theta` still answers the arm-(b) note; the
ledger-membership control (`:734`) proves a FOREIGN `source: "extension"`
entry the instance never registered still drops the theta and still reports.
`tests/double-session-start-supersession.test.ts:732` flips its length-1
witness to `2` with the comment rewritten to PIC-69. Both directions proven:
with the two `src/` files reverted to `1d516897`, tests 1, 2, 4 and arm (c) of
6 red — verbatim `expected [ 'greet' ] to have a length of 2 but got 1`, the
`theta/load/cross-format-collision: … (Pi-owned command 'greet' survives)`
note, and `theta /greet: extension shutting down` at dispatch, matching
§Reproduction exactly — while controls 3 and 5 stay green; restored, all
green. Live — `tests/live/double-session-start-live.test.ts` (H8a, bug 0021's
witness, strengthened to carry this bug's too) drives a real
`AgentSession.bindExtensions()` re-bind and asserts, off the settled
`SessionManager`, that the second bind emits no `theta/load/cross-format-collision`
for the surviving name and that dispatching it answers no shutting-down note,
with the rendered outbound `@`-query text as the non-vacuity witness; green
against a live model (1/1) and red on all three arms with the two `src/` files
reverted, with bug 0021's own quiesce assertion unweakened and still green in
both directions. H9a acceptance 10/10 green — no new stderr line, no new code
slug (bug 0030's empty-capture gate).

**Residuals.** (i) Sibling-extension indistinguishability is a known
limitation of the fix, not an open residual: an entry a different extension
registered under a ledger-held name carries the same `source: "extension"` and
is excluded too, so that one collision goes undetected and both registrations
survive under Pi's suffixed invocation names. Closing it would require reading
`SlashCommandInfo.sourceInfo`, outside the spec's source-keyed contract and
requiring an `SDK_SURFACE_INVENTORY` entry. (ii) The start-after-shutdown
rebind's wording for a *removed* name is still unprescribed — a live session
answering "extension shutting down" — unchanged by this fix and still a
spec-amendment proposal against `#repeat-start-supersession` if it is judged
worth fixing. (iii) Bug 0029's recorded evidence signature changes: its leaked
superseded-generation reload pass now carries the instance-wide ledger, so it
emits no `theta/load/cross-format-collision` against generation 2's live
command and instead re-registers those names against the drained generation-1
registry. 0029's root cause and its "fixing 0024 does not fix 0029" statement
both stand, but its repro must be re-derived on the surviving observables.

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
until the operator runs `/reload` (fresh extension instance). Each re-bind
also emits an error-severity `theta/load/cross-format-collision` note on the
`theta-system-note` channel that misdescribes the cause.

This is fail-safe and materially better than the pre-fix behaviour (silent
dispatch against a stale stranded registry). For the shutdown-less variant
the arm-(b) note is what
[#repeat-start-supersession](../spec_topics/pi-integration-contract/registration-steps.md#repeat-start-supersession)
prescribes for a handler still bound to the superseded registry. The defect
is that the supersession pass does not re-own surviving names at all, so a
name whose `.theta` is still on disk never reaches the new generation's
registry; on the start-after-shutdown rebind the surviving name additionally
answers "shutting down" on a session that is live, a state no spec text
contemplates.

## Reproduction

Offline, deterministic — no live provider needed. Both triggers reproduce
against the shipped composition root (`createThetaExtension` +
`composeExtensionInstance`) with a fake `pi`/`ctx`, `FakeClock` and
`FakeFileWatcher`, over a temp workspace holding `greet.theta`.

**Trigger A — start-after-shutdown rebind.** The mechanism of test 4 of
`tests/double-session-start-supersession.test.ts` (`:687`) with `greet.theta`
KEPT on disk: `session_start` (registers `/greet`), completed
`session_shutdown`, `session_start` again. Observables:

- `registeredNames === ["greet"]` — no second `registerCommand` call. Test 4
  locks exactly this at :718–720 and marks it in the inline comment (:709–716)
  as pre-existing behaviour, not part of the bug-0021 fix.
- An error-severity note on `theta-system-note`:
  `theta/load/cross-format-collision: slash name 'greet' collides at the same
  priority: '<…>/greet.theta' (Pi-owned command 'greet' survives)`.
- Dispatching `/greet` after the rebind returns
  `theta /greet: extension shutting down`.

**Trigger B — shutdown-less repeat start.** Identical, with the
`session_shutdown` omitted (the bug-0021 supersession drains the outgoing
registry instead). Same three observables, plus the pinned repeat-start note
`theta: repeat session_start without session_shutdown; superseding prior
hot-reload generation`.

**Control — single start.** `/greet` registers; no collision note.

## Expected behaviour

Per
[registration-steps.md#repeat-start-supersession](../spec_topics/pi-integration-contract/registration-steps.md#repeat-start-supersession)
a repeat `session_start` is a supersession pass — step 3's supersession-pass
language treats it as a contemplated re-registration input — so a surviving
name is re-owned: its dispatch re-bound to the new generation's registry,
where the re-discovered theta lives, and no collision diagnostic emitted for
it.

A name that does NOT survive (its `.theta` deleted before the re-bind) stays
bound to the superseded drained registry and keeps answering
`theta /<name>: extension shutting down`. That is the outcome
`#repeat-start-supersession` prescribes: the supersession pass drains the
outgoing registry so any name whose handler is still bound to it fails safe
on arm (b) with that exact note.
[#superseded-entry-dispatch](../spec_topics/pi-integration-contract/registration-steps.md#superseded-entry-dispatch)
does not apply here — it governs an entry-table MISS on a live, undrained
registry (arm (a)), a state the drained-registry path never reaches, so the
`theta /<name>: superseded; /reload to refresh` note is not the spec-derived
expectation for either trigger. The start-after-shutdown rebind's wording is
unprescribed rather than wrong: no spec text contemplates a live, freshly
rebound session answering "extension shutting down". Changing it is a
spec-amendment proposal against `#repeat-start-supersession`, out of scope
here; see `## Fix` for why it is not folded in.

## Actual behaviour / root cause

`excludeOwnedNames` is `undefined` on the `session_start` compose pass
(`production-composition.ts:1114`). The exclusion mechanism exists
(`readPiOwnedCommands` honours it, :1981) and the hot-reload rediscover path
uses it (:1153), so a reload pass never self-collides. The `session_start`
pass predates supersession as a designed flow: at its design point an
extension instance received exactly one `session_start`, with no own
registrations to exclude — the code comment at :369–370 states that
assumption directly. Now that a repeat delivery is a designed supersession
pass, the same read runs with the instance's own registrations present and
classifies each surviving name as a foreign collision (`resolveSlashNames`,
`discovery-walk.ts:922–931`) — dropping it from the new registry and
mis-describing the drop in the collision diagnostic ("Pi-owned command
'<name>' survives").

Re-registering a surviving name is safe at the pin
(`@earendil-works/pi-coding-agent` `~0.80.10`): `dist/core/extensions/loader.js:198–205`
does `extension.commands.set(name, {…})` — last-write-wins on the one
instance's `Map` — and `runner.js:371–398` then counts a single occurrence, so
no `:2` invocation-name suffix is minted. The handler rebinds in place.

## Why it matters

Every slash name the operator was using goes dead on a live session after any
re-bind, and stays dead until `/reload`. The failure is silent in the sense
that matters: the session answers `theta /<name>: extension shutting down`
while it is running normally, and the one operator-visible diagnostic
(`theta/load/cross-format-collision`, error severity) names a cause that does
not exist — it reports a foreign Pi-owned command winning a collision, when
the winner is the extension's own prior registration of the same theta. An
operator reading that note looks for a colliding prompt template or sibling
extension and finds none.

The blast radius is every registered theta, not one: the drop is per name, and
each surviving name takes it. Bug 0029's leaked superseded-generation reload
pass trips this same mechanism from the other direction — it emits
`theta/load/cross-format-collision` against generation 2's live command (see
[bug 0029](./0029-throwing-supersession-detach-swallowed-watcher-rearmed.md)).

## Fix

**Step 1 — spec amendment, landing first.** Amend
`docs/spec_topics/pi-integration-contract/registration-steps.md` step 3
(`:10`) and/or
[DISC-4 arm 2](../spec_topics/discovery/discovery-sources.md#disc-4)
(`docs/spec_topics/discovery/discovery-sources.md:79`) to pin normatively that
the collision source set excludes entries the extension instance itself
registered, on **both** the hot-reload pass and the supersession pass. Without
this the code change ships behaviour no spec text authorises, and the spec's
literal source-keyed rule keeps mandating the self-drop. The amendment also
retroactively anchors the pre-existing hot-reload carve-out, which today rests
only on the code comment at `production-composition.ts:364–370`.

**Step 2 — thread the own-name set into the supersession pass's collision
read.** Pass the instance's own registered slash names as `excludeOwnedNames`
on every compose, not only the hot-reload rediscover pass. The surviving name
then resolves in discovery and registers with a drain-gated handler over the
NEW registry.

The own-name set is a **factory-scoped accumulation of every name ever passed
to `pi.registerCommand`** — the factory owns `registerFixtures`
(`factory.ts:432–469`), so the accumulator is closure-scoped alongside the
existing `composeStartsObserved` / `shutdownEventsObserved` counters
(`factory.ts:316–317`); no globals or statics. It is not
`liveRegistry.snapshot().keys()`: that misses a name registered in generation 1
and later dropped from the registry by a hot-reload collision, which Pi still
holds (Pi has no unregister) and which would therefore still self-collide.

The exclusion is **source-aware**: skip an entry only when
`command.source === "extension"` AND its name is in the own-set. The exclusion
test currently runs before the source filter
(`production-composition.ts:1981`, filter at :1984–1988), so it must move
after the filter and gain the source condition. A newly-appeared prompt
template or skill of the same name then still drops the theta, as
`registration-steps.md:10` requires. A *sibling extension* registering the same
name remains indistinguishable from self — `source` alone cannot separate them,
and this is a known limitation of the fix, not a residual to close.

Surviving names emit no collision diagnostic after the fix, so the diagnostic
wording needs no change.

The registry drain stays as it is. A *removed* name keeps the spec-pinned
arm-(b) shutting-down note. Making it answer `superseded; /reload to refresh`
instead would require the supersession step to clear the outgoing registry's
entry table rather than drain it, so dispatch takes arm (a) and misses the
lookup — but `#repeat-start-supersession` requires the drain, and clearing
loses the drained fail-safe (a stale handler would then dispatch anything
still in the table).

**Fix surface.** Two signature boundaries move: `composeExtensionInstance`
(`production-composition.ts:1012–1016`) takes only
`(pi, ctx, overrides?: ComposeSeamOverrides)` and `ComposeSeamOverrides`
(`:154–164`) has no such field; the dep type `ThetaExtensionDeps.composeInstance`
(`factory.ts:241–244`) is `(pi, ctx) => Promise<…>`. Both widen, along with the
call at `factory.ts:628` and the production default export's arrow at
`factory.ts:900–901`. `runComposePass` already accepts the set but is
module-private. `discoverAndComposeFixtures` (`production-composition.ts:333`)
keeps its current signature — non-production, single-pass by construction.

**Verification.** Unit/integration only; no live test is required, since both
triggers and the dispatch note are deterministic observables of the offline
composition root. `tests/double-session-start-supersession.test.ts:707–720`
currently PINS the defect — the comment at :709–716 and
`expect(registeredNames.filter(n => n === "greet")).toHaveLength(1)` at
:718–720 — and must flip to `2` with a rewritten comment, or a correct fix
reads as a red. Add: (i) both triggers asserting a second `registerCommand`
and that a post-re-bind `/greet` dispatch produces no
`theta /greet: extension shutting down` note; (ii) a negative control proving
the pass still drops a theta colliding with a genuine `source: "prompt"` entry
of the same name; (iii) a name registered in generation 1, dropped by a
hot-reload collision, then re-owned across a re-bind.

**Ordering.** Independent of every other open bug. It ships as its own commit,
separate from [bug 0029](./0029-throwing-supersession-detach-swallowed-watcher-rearmed.md):
the code sets are disjoint (0029 touches `hot-reload.ts` / `pi-file-watcher.ts`
ordering and the swallowed detach evidence; 0024 touches the compose/collision
path), each has its own witness test, and the two `factory.ts` edits land
~50 lines apart, so the only coupling is a merge conflict in whichever lands
second.

## Provenance

- Origin: bug-0021 fix orchestration — stage-2 fixer analysis plus reviewer
  round 1, which accepted the fail-safe behaviour for 0.30.0 and required the
  residual filed.
- Recorded at the fix: bug 0021 §"Fix (0.30.0)" Residuals item (i)
  ([0021](./0021-double-session-start-leaks-armed-watcher.md)); test 4 of
  `tests/double-session-start-supersession.test.ts` (`:687`) locks the drop as
  pre-existing behaviour (the `registeredNames` length-1 witness, :718–720).
- Implementation evidence: `src/extension/production-composition.ts`
  (:333–353, :364–370, :1107–1116, :1146–1155, :1972–1993),
  `src/discovery/discovery-walk.ts` (:903, :922–931),
  `src/extension/factory.ts` (:241–244, :316–317, :432–469, :628, :900–901) —
  all at HEAD `4d645f4f`, 0.32.0.
- Host evidence at the `~0.80.10` pin:
  `dist/core/agent-session.js:1744–1765` (`bindExtensions` re-emit),
  `:1826–1833` (`source: "extension"` for the extension's own commands),
  `dist/core/extensions/runner.js:371–398` (bare `invocationName` at one
  occurrence), `dist/core/extensions/loader.js:198–205`
  (`registerCommand` last-write-wins; no `unregisterCommand` counterpart
  anywhere in `dist/`).
- Related: [bug 0029](./0029-throwing-supersession-detach-swallowed-watcher-rearmed.md)
  — adjacent, not duplicate; same bug-0021 supersede-before-publish flow, a
  different root cause and a disjoint line set, and its leaked
  superseded-generation reload pass trips this bug's mechanism.
- Spec:
  [registration-steps.md#repeat-start-supersession](../spec_topics/pi-integration-contract/registration-steps.md#repeat-start-supersession),
  [step 3](../spec_topics/pi-integration-contract/registration-steps.md) (`:10`,
  the source-keyed collision rule the amendment targets),
  [#superseded-entry-dispatch](../spec_topics/pi-integration-contract/registration-steps.md#superseded-entry-dispatch),
  [#structural-changes-no-unregister](../spec_topics/pi-integration-contract/registration-steps.md#structural-changes-no-unregister),
  [DISC-4](../spec_topics/discovery/discovery-sources.md#disc-4)
  (`discovery-sources.md:79`, arm 2),
  the [`ThetaRegistry` drain-state contract](../spec_topics/pi-integration-contract/drain-state-contract.md#theta-registry-drain-state-contract).
