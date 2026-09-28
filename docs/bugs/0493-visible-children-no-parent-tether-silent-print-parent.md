# Bug 0493 — a visible child's lifetime is tied to nothing once its envelope is delivered: Err/refusal children linger unbounded after the parent exits (one orphan re-kicked real model turns for ~50 minutes), and a `pi -p` parent whose drive ends non-Ok before any assistant turn exits 0 with empty stdout and no session file

- **Status:** fixed (0.493.0) — all four §Fix elements landed (D1 (a)
  refusal exit + outcome event, D1 (b) PIC-65 layer-2 parent-liveness
  watchdog, D1 (c) `PI_SUBAGENT_CHILD=1`, D2 print-mode stderr + exit-code
  surface) with the subagent.md amendments; record in `## Fix (0.493.0)`.
- **Sev/Diff estimate:** D1: S2/D2 — three live interactive `pi` processes
  survived their parent by ~50 minutes each until killed by hand, one of
  them actively burning provider tokens the whole time (an unbounded
  re-kick loop against a stalling provider) and later spamming ENOENT in
  its pane; every `pi -p` parent (quality-loop lanes, probes, benches)
  turns every Err/refusal child into such an orphan by construction. The
  parent-pid wire for the fix already exists (subagent.md PIC-65 layer 2:
  carriage written, reader absent). D2: S3/D2 — no result corruption (the
  envelope had been delivered), but the parent run's ENTIRE evidence trail
  is discarded and the process boundary reports success: exit 0, empty
  stdout, no session file, for a run whose drive ended in a propagated
  Err. Diagnosing D1 required reconstructing the parent's ending from the
  child's session because the parent left none — D2 is why this doc's Run A
  root-causing is a hypothesis ranking rather than a transcript quote.
- **Where:**
  - `src/extension/subagent-spawn-regime.ts:1071` — `#requestVisibleChildShutdown`
    is called from `#emitOkEnvelopeGuarded` ONLY; its docblock (`:1340–1358`)
    states the Err linger ("an `Err` child lingers by design so a human can
    read or continue the live session").
  - `src/extension/production-composition.ts:1212` — the marked-root
    registration refusal (message minted at
    `src/runtime/subagent-root-regime.ts:216`, "no load diagnostic names
    it") emits the PIC-59 Err envelope and NOTHING else: no shutdown
    request, no `subagent-child-outcome` event (that event is emitted only
    inside the spawn regime's drive), so the child never exits and the
    herdr 0.3.0 `FAILED <label>` retitle never fires either.
  - `src/runtime/subagent-result-channel.ts:215–216, 313` — an envelope
    settlement (`{code: 0, signal: null}`, Ok AND Err) never kills the
    placed child; only the bug-0484 no-envelope synthesised settlements do.
  - `src/runtime/subagent-result-channel.ts` `connectResultChannel` /
    `src/extension/production-composition.ts:2788` — child-side channel
    death aborts the IN-FLIGHT invocation only (CNCL-4); after the envelope
    (or a refusal minted before any invocation ran) the sweep is a no-op.
    Nothing ends the process.
  - `src/runtime/subagent-launcher.ts:340` — `PI_THETA_SUBAGENT_PARENT_PID`
    is "the reserved, unimplemented PIC-65 watchdog input";
    `docs/spec_topics/pi-integration-contract/subagent.md:264` records
    layer 2 (uncontrolled parent death) as **explicitly unimplemented**:
    "the carriage is written by the launcher and read by nothing".
  - `docs/spec_topics/pi-integration-contract/subagent.md:109`
    (`#subagent-visible-presentation`) — after an `Err` envelope the child
    "does **not** shut down, and the pane lingers with the live session for
    a human to read or continue": the linger is spec'd, with no bound and
    no tie to the parent's existence.
  - `docs/spec_topics/pi-integration-contract/subagent.md:265` — the
    residual-exposure claim this bug falsifies on the visible path: "the
    orphan window is bounded by one invocation, not unbounded lingering
    … the child self-exits after emitting its envelope" — the self-exit is
    the visible Ok arm only, and a foreign re-kicker can keep an
    envelope-settled child DRIVING (below).
  - Aggravator (pi-config repo): the pi-retry fork's stall re-kicker —
    `extensions/pi-retry/index.ts:75` (`DEFAULT_STALL_REKICK_MAX =
    Number.POSITIVE_INFINITY`), `:191` (opt-out gate is
    `PI_SUBAGENT_CHILD === "1"` — set by pi-config's own
    `subagent-pi.mjs:111`, set by NOTHING on pi-theta's launch path:
    `buildSubagentChildEnv`, `src/runtime/subagent-launcher.ts:319`, writes
    only `PI_THETA_*` carriers), `:248` (the re-kick
    `pi.sendUserMessage("The previous attempt was aborted by the stall
    watchdog and pi did not auto-retry it. Continue the task from where it
    left off.")` — verbatim the user message found in the orphan's session).
  - D2 (pi host, pinned 0.87.1): `dist/modes/print-mode.js:104–127` — text
    mode prints/exit-codes ONLY from a trailing ASSISTANT message; a
    top-level theta Err ending is a `theta-system-note` CUSTOM message, so
    stdout stays empty and exit stays 0. `dist/core/session-manager.js`
    `_persist` (`hasAssistant` gate) — nothing is flushed to the session
    file until the session holds an assistant message, so a parent whose
    drive dies before its first `@` turn persists NOTHING (its `sess/…`
    child NEST directory exists anyway — the bug-0489 derivation
    `mkdirSync`s it at launch — which is exactly the observed artefact set:
    a child log with no parent log beside it).
  - Placement backend (pi-theta-herdr repo, for completeness):
    `src/herdr-placement-backend.ts:99–107` — `observesExit: false`,
    `kill()` = advisory `pane.close`. Correct per the seam; the pane
    process's OS parent is the herdr server (`herdr.exe server` — observed
    PID 33888 as parent of every orphan), so OS-level parent-death signals
    from the pi parent were never a possibility on this path.

## Observed (2026-09-27, Windows, pi 0.87.1, @bitmonk8/pi-theta 0.492.0 via pi-config, herdr placement)

Probe project `%TEMP%\fabletheta`: `.pi/theta/fable-probe.theta` (mode
prompt, `tools: ./workers/fable-child.theta`, body `let r = fable_child()?`
then `@\`Tell the user: child returned ${r}\``) and
`.pi/theta/workers/fable-child.theta` (mode subagent,
`model: anthropic/claude-fable-5-1`, `thinking: high`, body one `@`
arithmetic query).

- **Run A (17:29, NO `thetaPaths` settings entry yet the child registered —
  the parent resolved the callee by relative path; the child re-discovers
  via `--theta <proj>/.pi/theta` and the workers/ root rode the marshalled
  roots):** parent `pi -p --session-dir sess "/fable-probe"` exited 0
  within seconds-to-minutes, EMPTY stdout, NO parent session `.jsonl`
  (`sess/` held only the child nest dir
  `sess/<parent-ts>_<uuid>/<ts>_theta-fable-child#f0fe281c.jsonl`). The
  child (created 17:29:02) HAD registered and made its model call; the
  provider stream stalled; its session shows `stopReason: error`,
  `errorMessage: "This operation was aborted\n\n[stall-watchdog-retry]
  provider returned error; treating stalled provider stream as
  retryable."`, then the pi-retry re-kick user message. The orphan kept
  running and re-kicking for ~50 minutes after the parent exited; after
  its session dir was deleted it spammed `Extension "<runtime>" error:
  ENOENT … theta-fable-child#f0fe281c.jsonl` in its herdr pane (the live
  session appending to its deleted `--session` file). Killed by hand 18:20.
- **Runs B/C (17:31:40, 17:31:55; C with `--mode json`):** same command in
  a temp project lacking `.pi/settings.json`
  `{"thetaPaths":["theta/workers"]}`. Parent exited 0 in ~4 s; the json
  output carried `"subagent child refused to register its root theta
  '/fable-child': no load diagnostic names it"`. The refusing children did
  NOT exit — idle interactive `pi` panes for ~50 min until killed.
- **Run D (17:32, with the settings file):** child returned 777 in 15 s and
  exited cleanly (the visible Ok arm: outcome event, `ctx.shutdown()`,
  pane closed).

## Defect 1 — nothing bounds or tethers a visible child once its envelope is delivered (owning repo: pi-theta; one aggravator owned by pi-config)

**Expected.** A child process that has delivered its envelope to a parent
that then EXITS has no supervisor, no reader, and no prospect of one on a
headless (`pi -p`) parent. Child lifetime should be tied to something: the
parent's process lifetime (the PIC-65 layer-2 parent-pid watchdog whose env
carriage already ships), a linger bound, or at minimum the refusal path
ending the process it just declared useless.

**Actual.** Three independent gaps compose into unbounded orphans:

1. **The visible Err/refusal linger is unconditional and unbounded.**
   `#requestVisibleChildShutdown` is Ok-only (spec'd:
   subagent.md:109). The registration-refusal path
   (production-composition.ts:1212) is worse than the Err arm: it emits the
   envelope from the load pass and requests nothing — no shutdown, no
   outcome event (no herdr `FAILED` retitle) — leaving a fully idle
   interactive `pi` whose pane title still looks live. The linger contract
   was written for an attended, interactive parent session ("for a human to
   read or continue"); under a `pi -p` parent there is never a human on the
   other end, so every non-Ok child is an instant permanent orphan.
2. **No parent-death detection exists at the process level.** The
   parent-pid carriage is authenticated control-plane input only
   (subagent-launcher.ts:340); subagent.md:264 records the watchdog reader
   as explicitly unimplemented. The bug-0484 machinery does not cover this
   shape in either direction: parent-side kill fires only on NO-envelope
   synthesised settlements (an envelope settlement "is not killed",
   subagent-result-channel.ts:215–216), and child-side channel death (the
   parent's post-settlement socket release, or the parent's exit) aborts
   only an IN-FLIGHT invocation — for an envelope-settled or refused child
   the CNCL-4 sweep is a no-op and the process idles on.
3. **Aggravator (pi-config): the orphan is not even idle.** With ambient
   extension discovery (production default: no extension pin), the child
   loads the operator's full pi-config extension suite, including the
   pi-retry fork whose stall re-kicker (commits 7ec79bf, a0e1419, f448618;
   filed there as the pi ≥ 0.87 upstream-retry-contract break) re-kicks a
   stall-aborted session with a continue prompt, default budget INFINITY
   (index.ts:75). Its only opt-out gate is `PI_SUBAGENT_CHILD === "1"`
   (index.ts:191) — the marker pi-config's OWN children set
   (subagent-pi.mjs:111) and pi-theta's children do not (their markers are
   `PI_THETA_SUBAGENT_ROOT` etc., which pi-retry does not read). Run A's
   child: the stall-watchdog abort cancelled the theta drive (bug 0483's
   open shape), the drive delivered its Err/cancel envelope (every non-Ok
   exit of `driveSubagentRootRegime` emits one), the parent settled and
   exited — and pi-retry then re-kicked the abandoned HOST session
   ("Continue the task from where it left off") against a stalling
   provider, forever. This falsifies subagent.md:265's "bounded by one
   invocation" residual-exposure claim on the visible path: the theta
   invocation was over, the process lived, and a foreign extension kept it
   making real model calls with tool access.

**Fix surface.**

- **pi-theta** owns the tether and the refusal exit: implement the PIC-65
  layer-2 parent-pid watchdog (the spec names it the designed mechanism and
  the wire is in place — poll-based existence check; the reader is the only
  missing piece), and/or bound the linger / make it conditional on an
  interactive parent; make the registration-refusal path request shutdown
  (there is no session worth reading — the theta never ran) and emit the
  outcome event so retitle consumers fire.
- **pi-config** owns the re-kick gate: the pi-retry fork should treat a
  pi-theta subagent child (`PI_THETA_SUBAGENT_ROOT` present) like its own
  (`PI_SUBAGENT_CHILD`) — a child whose supervisor speaks PIC-59 envelopes
  must not be independently re-kicked by a session-level babysitter, and
  `DEFAULT_STALL_REKICK_MAX = Infinity` multiplies any such miss.
- **pi-theta-herdr** needs no change for D1 (its `kill()`/capabilities are
  per-seam; the 0.3.0 outcome consumer, commits 538bc10/4eb5fa6, already
  retitles Err children it is told about — the refusal path just never
  tells it).

## Defect 2 — a `pi -p` parent whose drive ends non-Ok before any assistant turn reports success and leaves no evidence (owning repo: pi host for the gates; pi-theta for the silent Err surface)

**Expected.** A print-mode parent whose theta drive ends in a top-level Err
should be distinguishable from success at the process boundary (non-zero
exit and/or a stderr line), and a `--session-dir` run should leave a
session file recording what happened.

**Actual.** The parent DID wait for the drive correctly (runs B/C prove the
await: `session.prompt` resolves only when the command handler returns, and
C's json stream carried the refusal message). But a drive that ends Err
before any assistant turn produces only a `theta-system-note` CUSTOM
message (SLSH-3, `theta-composition-producer.ts:369` region), and on the
pinned pi 0.87.1:

- text mode prints and exit-codes ONLY from a trailing assistant message
  (`print-mode.js:104–127`) → stdout empty, exit 0;
- `SessionManager._persist` flushes nothing until an assistant message
  exists (`session-manager.js`, `hasAssistant` gate) → NO parent `.jsonl`
  at all, even though the note and user entries were appended in memory.
  The system-note fallback chain never fires because `pi.sendMessage`
  SUCCEEDED — into a session that is never written.

So Run A's parent ending is reconstructed, not read: the child's
stall-watchdog abort (~60–120 s window, matching the observed
seconds-to-minutes parent lifetime) cancelled the child drive → Err/cancel
envelope → parent's `fable_child()?` propagated → drive ended Err → note-only
ending → exit 0, silence. Ranked alternatives, none of which change D1:
(a) as stated (most consistent: an envelope settlement is the only
settlement that leaves the child alive — a no-envelope settlement would
have `paneClose`d it, and the pane survived); (b) the child's channel
client `die()`d pre-envelope and the advisory `paneClose` kill silently
failed — possible but requires two coincidences; (c) a parent-side crash —
excluded by exit 0. Determining which arm the envelope carried requires the
parent transcript that this very defect discarded.

**Fix surface.** The two gates (assistant-only print output/exit-code,
assistant-gated session flush) are pi host behaviour; upstreaming a
`--session-dir`-honouring eager flush and/or a custom-message-aware print
ending belongs there. pi-theta's share is real regardless: a top-level
drive that ends Err/cancelled in a UI-less print-mode parent currently
surfaces NOWHERE observable (the note lands in an unflushed in-memory
session) — the SLSH-3/cancel/panic endings should additionally reach
stderr (the fallback chain's terminal arm) or set a non-zero disposition
when the host exposes one, so a lane runner can tell a failed probe from a
green one without forensics.

## Fix (settled 2026-09-27, operator-approved direction)

D1 is closed by three pi-theta changes (refusal exit, parent-liveness
watchdog, re-kick opt-out marker); D2's pi-theta share is a print-mode
failure surface at the terminal-note seam. The pi host gates and the
pi-retry budget are explicitly NOT part of this fix (out-of-scope list at
the end). Verified host/code facts each element rests on are cited inline —
the implementer should not need to re-derive them.

### D1 (a) — the registration-refusal path ends the child it declared useless

After `emitResultEnvelope(serializeErrEnvelope(registrationRefusal,
"mint"))` (`production-composition.ts:1206–1215`), in order:

1. **Emit the child outcome event** — `{ apiVersion: 1, outcome: "err",
   slug: <regime.slug> }` on `SUBAGENT_CHILD_OUTCOME_CHANNEL`
   (`subagent-placement-registry.ts:52`) through the existing emit-only
   producer seam (`subagentOutcomeEvents`,
   `production-producer-deps.ts:246–255`; presence-probed, advisory —
   `pi.events` absent ⇒ structural no-op). This is what lets the herdr
   0.3.0 outcome consumer retitle the pane `FAILED <label>`; the parent
   still never emits on this channel.
2. **Request shutdown under visible presentation** — the same
   presentation gate + `typeof` presence-probe as
   `#requestVisibleChildShutdown` (`subagent-spawn-regime.ts:1352`);
   extract that helper (or an equivalent shared function) rather than
   forking the probe, and thread the pass's
   `SubagentChildControlPlane.launch.presentation` to the refusal site.
   Ordering is envelope → event → shutdown, mirroring RFC 0012 §7's Ok
   arm. A headless (`pipe`) child requests nothing — its `-p` run
   self-ends, as today.

Accepted residual: the host may still run ONE model turn on the
never-registered `"/<slug>"` initial message (the host demotes an
unregistered slash command to prompt text) before `ctx.shutdown()`'s
defer-until-idle fires. Bounded by construction, and by element (b) once
the parent exits. No attempt to suppress that turn is in scope.

Spec amendment — `subagent.md#subagent-child-outcome-event` (:79): replace
"the marked-root registration-refusal envelope (a load-pass write, PIC-59)
carries no event" with: the refusal write emits the same event with
`outcome: "err"` and, under visible presentation, then requests
`ctx.shutdown()`; the one-event-per-process invariant is preserved (a
refused process never enters a drive, so the load pass is that process's
only emitter).

### D1 (b) — the PIC-65 layer-2 parent-liveness watchdog (the missing reader)

New module `src/runtime/subagent-parent-watchdog.ts` (pure logic over
injected seams: liveness probe, interval scheduler/clock, stderr writer,
`endProcess`), wired in `production-composition.ts` when
`subagentRootRegime.active`:

- **Input** — the parent pid from the unified control-plane view
  `controlPlane.env[SUBAGENT_PARENT_PID_ENV]`. Verified present on BOTH
  carriages: env carriage (ppid-authenticated) and the launch file —
  `SUBAGENT_PARENT_PID_ENV` is a `SUBAGENT_CONTROL_PLANE_ENV_KEYS` member
  (`subagent-launcher.ts:277`), so `projectLaunchFileControlPlane`
  (`subagent-launch-file.ts:98`) copies it into the file and
  `readChildControlPlane` projects it back over the scrubbed env. The
  logical parent (the pi process), never the OS parent (a herdr pane's
  ppid is the herdr server).
- **Arming guards** — arm only for a parseable integer pid > 0 that is not
  the child's own pid; absent/garbage carriage ⇒ not armed (fail toward
  pre-fix behaviour, never toward a kill on a bad read). Armed once per
  process — a repeat compose pass (`/reload`) reuses the armed handle,
  the `passResultChannel` pattern. Never armed outside the regime (the
  parent, harnesses). Cleared on `session_shutdown` (hygiene; the
  interval is unref'd so it never holds the process open by itself).
- **Poll** — unref'd interval, `SUBAGENT_PARENT_LIVENESS_POLL_MS =
  10_000` (the heartbeat cadence; ends an orphan within ~10 s against the
  observed ~50 min). Liveness probe: `process.kill(pid, 0)` — alive on
  success AND on `EPERM` (process exists, no permission — on win32 Node
  routes signal 0 through libuv's OpenProcess existence check, per the
  Node docs "signal 0 can be used to test for the existence of a
  process", so the same call is the Windows-safe check); gone ONLY on
  `ESRCH`. PID-reuse false-alives (aggressive on Windows) fail toward a
  longer linger — the pre-fix behaviour — never toward killing a child
  whose parent lives; false-dead is structurally impossible under the
  `ESRCH`-only rule.
- **Action on parent-gone** (single-fire): write one stderr line —
  `pi-theta: subagent child exiting — parent process <pid> gone` — for
  pane/log forensics, then `endProcess` (production wiring:
  `process.exit(1)`). No grace step, per the PIC-66 doctrine: the parent
  would have killed this process had it been able to; nothing is owed to
  it. In-flight side effects are already covered for channel-placed
  children (parent death closes the socket → the bug-0484 CNCL-4 sweep
  aborts the invocation before the poll even fires); for a `pipe` child
  the exit itself is the stop.
- **Linger policy (settled)** — the visible `Err` linger is KEPT while the
  parent lives (the interactive-parent inspection affordance is real) and
  is now bounded by parent lifetime: a `pi -p` parent exits at settlement,
  so its Err/refusal children end within one poll interval — no
  parent-mode detection needed, the parent's lifetime IS the policy. The
  Ok arm (`#emitOkEnvelopeGuarded` → shutdown) is unchanged.

Spec amendments (`docs/spec_topics/pi-integration-contract/subagent.md`):

- `#subagent-orphan-prevention` layer 2 (:264): from "explicitly
  unimplemented … read by nothing" to implemented, naming the reader
  (child-side watchdog armed under the subagent-root regime), the input
  (both carriages, as above), the poll interval constant, the
  `process.kill(pid, 0)` / `EPERM`-alive / `ESRCH`-gone semantics, the
  single-fire stderr-line + `process.exit(1)` action, and the pid-reuse
  false-alive residual (fails toward linger).
- Layer 3 residual exposure (:265): the orphan window is now
  min(one invocation, one poll interval past parent death) for every
  placement; delete the falsified unconditional "the child self-exits
  after emitting its envelope" reading and fold in the closed re-kick
  aggravator (element (c)). OS-level tethering (Job Objects /
  `PR_SET_PDEATHSIG`) stays rejected.
- `#subagent-visible-presentation` (:109): "does **not** shut down, and
  the pane lingers with the live session for a human to read or continue"
  gains the bound: …lingers **while the launching parent process lives**;
  once the parent is gone the PIC-65 layer-2 watchdog ends the child — a
  linger without a possible reader is an orphan, not an affordance.

### D1 (c) — `PI_SUBAGENT_CHILD=1` on the launch env (re-kick opt-out marker)

`buildSubagentChildEnv` (`subagent-launcher.ts:319`) writes
`PI_SUBAGENT_CHILD: "1"` beside its own markers (in the final spread, so a
stale inherited value is overwritten). Deliberately NOT a
`SUBAGENT_CONTROL_PLANE_ENV_KEYS` member (the bug-0474 handling decision,
made consciously): it is a foreign-convention ADVISORY marker —
pi-config's own children set the identical value (`subagent-pi.mjs:111`)
and pi-retry reads raw `process.env` with no authentication — so it is
never scrubbed, never ppid-gated, and heritable down the process tree
(idempotent: every launcher along a chain rewrites `"1"`).

Reach, verified: a `pipe` child inherits the composed env directly; the
herdr backend declares `inheritsEnv: true` and forwards `request.env` into
the pane process (`pi-theta-herdr/src/herdr-placement-backend.ts:40,
60, 74, 99` — `paneEnvOverlay(request.env)`), so the marker lands in the
observed orphan shape's real environment where pi-retry's factory-time
read (`index.ts:191`) sees it.

Justification for a FULL re-kick opt-out (the verify-and-choose the
direction asked for): `PI_SUBAGENT_CHILD` gates exactly one behaviour in
the pi-retry fork — `scheduleStallRekick` returns early (`index.ts:224`;
the only other read is a telemetry field at :265). The stall WATCHDOG
itself (abort + retryable tag) still arms in children — desired, since a
pre-0.87 pi core retries the turn inside the live drive. What the marker
disables is only the session-level "continue" user message, and in a
theta child that message can NEVER be useful, bounded or not: it does not
re-enter the theta drive (the slash dispatch has settled; the PIC-59
envelope is one-shot and has usually already been written), so all it
produces is unsupervised freestyle model turns with tool access, invisible
to the parent — Run A's 50-minute burn. Retrying a stalled turn INSIDE a
still-live drive is bug 0483's territory (the host-recovery abort must
ride the retry instead of cancelling the theta) and is unaffected by this
marker.

Residual: a hypothetical `inheritsEnv: false` backend passes no
environment, so the marker would not reach such a child — element (b)'s
watchdog still bounds it (the launch file carries the pid). No shipped
backend has that shape.

Spec amendment — `#subagent-launch-contract` env-carriage prose (:43
region): one added sentence documenting `PI_SUBAGENT_CHILD=1` as a
non-control-plane advisory marker written for sibling-extension
interop (session-level babysitters must treat a theta child as a
supervised child), never scrubbed, never authenticated.

### D2 — print-mode parents surface a pre-assistant non-Ok ending

All three terminal non-Ok framings of a top-level drive already funnel
through exactly two producer methods: `emitTopLevelErrNote`
(`production-theta-producer.ts:384` — SLSH-3 `Err` AND the `cancelled`
rendering, `err-note-render.ts:147–149`) and `emitPanicNote` (:455 region
— both panic framings). Fix: the production composition hands the producer
a **print-mode failure surface** — `{ mirrorLine(text), markFailed() }` —
defined iff `ctx.mode === "print" || ctx.mode === "json"` (the
`ExtensionMode` print pair; `"tui"` keeps its transcript rendering,
`"rpc"` is a long-lived server where a process exit code is meaningless)
AND `!subagentRootRegime.active` (a child's failure surface is the PIC-59
envelope; a `pipe` child runs `--mode json` and must not double-report —
its stderr is the parent's crash-detail hint). Both methods call it after
their `sendSystemNote`:

- `mirrorLine` — write the rendered note text (the same `content` string)
  plus `\n` to `process.stderr`. Safe on both print surfaces: stderr is
  already the host's own extension-error channel, and the json event
  stream rides stdout untouched.
- `markFailed` — `process.exitCode = 1` (assign only; never call
  `process.exit`, never overwrite a larger code the host later sets).

Host-survival fact this rests on, verified on BOTH the repo devDependency
0.80.10 and the operator host 0.87.1 (`dist/main.js` — 0.80.10 :684–695,
0.87.1 :795–806): the print path ends `if (exitCode !== 0)
{ process.exitCode = exitCode; } return;` — it never calls
`process.exit()` and never resets an extension-set non-zero
`process.exitCode`, so Node exits with the extension's 1 when the host's
own text-mode gate saw no trailing assistant message. Result for the
observed shapes: runs A/B/C-style parents exit 1 with one stderr line
(`theta /<slug> returned Err: …` / `theta /<slug> cancelled` /
`theta /<slug> aborted…`) instead of exit 0 and silence.

Explicitly HOST-OWNED and not fixable from pi-theta (out of scope, to be
filed/upstreamed against pi): the assistant-gated session flush
(`SessionManager._persist` `hasAssistant` gate — a `--session-dir` run
whose drive dies pre-assistant still persists NOTHING, even with this
fix), and the assistant-only print output/exit-code gate itself
(`print-mode.js:104–127`). pi-theta's stderr + exit-code surface makes the
failure observable without the session file; it does not recreate the
transcript.

### Witnesses (red before / green after)

1. **Refusal exit cells** (extend the existing marked-root refusal tests,
   bug-0178/0347 area): the refusal emission also (i) emits
   `pi-theta:subagent-child:outcome:v1` with `outcome: "err"` and the
   regime slug on a fake bus, (ii) calls a `ctx.shutdown` spy under
   visible presentation, (iii) does NOT call it under `pipe`, (iv) orders
   envelope → event → shutdown. Red before: no event, no shutdown call.
2. **Watchdog unit cells** (new `tests/subagent-parent-watchdog.test.ts`):
   alive probe ⇒ no fire; `ESRCH` ⇒ single fire (stderr line +
   `endProcess(1)`, exactly once); `EPERM` ⇒ alive; pid `0` / negative /
   NaN / own pid ⇒ never arms; interval unref'd and cleared on dispose.
   Composition cells: armed iff regime active ∧ valid pid carriage; never
   armed on the parent/harness path. Red before: no module, no arming.
3. **Env-marker cells** (`buildSubagentChildEnv` tests):
   `PI_SUBAGENT_CHILD === "1"` on every launch; a stale inherited value
   overwritten; the key NOT in `SUBAGENT_CONTROL_PLANE_ENV_KEYS` (never
   scrubbed by `readChildControlPlane`, never projected as control
   plane). Red before: key absent from the composed env.
4. **D2 producer/composition cells**: fake stderr writer + exit-code seam
   across `ctx.mode` ∈ {print, json, tui, rpc} × ending ∈ {Err,
   cancelled, panic, Ok}: surface fires only for non-Ok × {print, json};
   regime-active process inert even under json; Ok always inert. Red
   before: no stderr write, exit code untouched.
5. **End-to-end acceptance** (H9a, runs-B/C shape, near-zero tokens): real
   `pi -p` (text and `--mode json`) parent whose subagent callee refuses
   registration ⇒ parent exits non-zero, stderr carries
   `refused to register its root theta`, stdout empty in text mode, and
   the refusing child PROCESS exits (witnesses (a) and D2 together). Red
   before: exit 0, empty stdout/stderr, lingering child.
6. **Live-suite guard**: existing live tests are unaffected by
   construction — the harness pins write the live vitest process's pid,
   which stays alive for the test's duration, so armed watchdogs in real
   children never fire; assert nothing new red per AGENTS.md's
   both-directions rule (prove one red by pointing a watchdog cell at a
   dead pid, then green).

### Version / CHANGELOG

One minor bump at landing (house pattern: bug 0493 → `0.493.0`) with a
`### Fixed` entry covering both defects: D1 (refusal exit + outcome event,
PIC-65 layer-2 watchdog implemented, `PI_SUBAGENT_CHILD` marker) and D2
(print-mode stderr + exit-code surface for pre-assistant non-Ok endings).

### Out of scope (owned elsewhere, tracked, not blocking)

- **pi host**: the assistant-gated session flush and the assistant-only
  print ending (D2's evidence-trail half) — upstream report against pi;
  this fix only makes the failure observable at the process boundary.
- **pi-config (follow-up, separate change owned there)**: a finite
  `DEFAULT_STALL_REKICK_MAX` in the pi-retry fork (today
  `Number.POSITIVE_INFINITY`, `index.ts:75–77`), plus optionally reading
  the opt-out marker at schedule time (not factory time) and/or honouring
  `PI_THETA_SUBAGENT_ROOT` directly. Defence in depth only — the
  pi-theta env change alone covers every shipped backend, so this fix
  does NOT depend on it.
- **pi-theta-herdr**: no change (the 0.3.0 outcome consumer already
  retitles Err children it is told about; element (a) now tells it).
- **Bug 0483** (host-recovery abort cancels the theta instead of riding
  the retry) and **bug 0485** (Err-linger core spin) stay open on their
  own records; neither is masked by this fix.
- The one prompt-text model turn a refusal child may still run before its
  shutdown request lands (accepted residual, bounded — see (a)).

## Fix (0.493.0)

- What shipped:
  - `src/extension/production-composition.ts` — D1 (a): after the refusal
    envelope, the load pass emits `{apiVersion:1, outcome:"err", slug}` on
    the child outcome channel and, under visible presentation, requests
    `ctx.shutdown()` (envelope → event → shutdown). D1 (b): arms the
    watchdog in `composeExtensionInstance` iff the subagent-root regime is
    active, from `controlPlane.env[SUBAGENT_PARENT_PID_ENV]`; new overrides
    `subagentParentWatchdogSeams` / `subagentParentWatchdog`, wiring field
    `parentWatchdog`. D2: builds the `{mirrorLine, markFailed}` surface iff
    `ctx.mode` ∈ {print, json} ∧ regime inactive (override
    `printModeFailureProcess`; production `process.stderr` /
    `process.exitCode`, assign-only, never lowers a larger code).
  - `src/extension/subagent-spawn-regime.ts` — shared
    `requestVisibleChildShutdown` (presentation gate + `typeof` probe) and
    shared `emitSubagentChildOutcomeContained` (subscriber-throw
    containment), both used by the drive and the refusal site.
  - `src/runtime/subagent-parent-watchdog.ts` (new) — D1 (b): pure module
    over injected seams; `SUBAGENT_PARENT_LIVENESS_POLL_MS = 10_000`;
    arms for a digits-only pid in 1..2147483647 that is not the own pid;
    `process.kill(pid, 0)` success/`EPERM` ⇒ alive, `ESRCH` ⇒ gone, any
    other error propagates; single-fire stderr line
    `pi-theta: subagent child exiting — parent process <pid> gone` then
    `process.exit(1)`; unref'd interval.
  - `src/extension/factory.ts`, `factory-deps.ts`,
    `extension-instance-shutdown.ts` — the factory latches the armed handle,
    hands it back into a repeat compose of the same instance (10th
    `composeInstance` parameter, forwarded by the shipped default export),
    and disposes it at every `session_shutdown`.
  - `src/runtime/subagent-launcher.ts` — D1 (c): `buildSubagentChildEnv`
    writes `PI_SUBAGENT_CHILD: "1"` last; not a
    `SUBAGENT_CONTROL_PLANE_ENV_KEYS` member.
  - `src/extension/production-theta-producer.ts`,
    `production-producer-deps.ts` — D2: `emitTopLevelErrNote` (Err,
    cancelled, including its stamp-failure fallback arm) and `emitPanicNote`
    call `mirrorLine(<same content>)` then `markFailed()` after the note.
  - `docs/spec_topics/pi-integration-contract/subagent.md` — the five
    amendments (:43 advisory marker, :79 refusal event + shutdown, :109
    linger bounded by parent lifetime, :264 layer 2 implemented, :265
    residual exposure).
  - `docs/how-to/place-subagents-in-a-multiplexer.md` — the Err-linger
    paragraph states the parent-lifetime bound and the refusal shutdown
    (self-authorized documentation scope, see Pinned dispositions).
  - `src/extension/production-subagent-host.ts`,
    `tests/subagent-child-launch.test.ts` — comment corrections only.
- Gates:
  - Witnesses: `tests/subagent-root-registration-refusal-envelope.test.ts`
    13/13, `tests/subagent-parent-watchdog.test.ts` 28/28,
    `tests/subagent-parent-watchdog-real-process.test.ts` 1/1,
    `tests/subagent-parent-watchdog-composition.test.ts` 14/14,
    `tests/subagent-child-env-scrub.test.ts` 13/13,
    `tests/print-mode-failure-surface.test.ts` 25/25; each red with its
    element reverted (verifier, hashes restored byte-exact).
  - `npm test`: `Test Files 712 passed (712)`, `Tests 11969 passed
    (11969)`.
  - `npm run typecheck`: exit 0. `npm run lint`: exit 0.
    `tests/committed-fixture-parse-gate.test.ts`: 58/58.
  - Live: `tests/live/acceptance/b0493live-refused-subagent-callee-print-parent.test.ts`
    2/2 green (red with D2 reverted: `exitCode 0`, `stderr ""`);
    `tests/live/acceptance/**` 44/45 files, 57/58 tests (the one red is
    Residual 1); `tests/live/live-production-acceptance.test.ts -t
    "subagent"` 9/9; `tests/live/b0271live-grandchild-callee-drop-depth-two-live-cell.test.ts`
    1/1.
- Review: 2 rounds.
  - Round 1 (deep): findings F1 shipped `composeInstance` did not forward
    the watchdog handle; F3 refusal emit lacked subscriber-throw
    containment; F4 false `/reload` reuse prose; F5 pid > 2³¹−1 armed and
    crashed the child through a `TypeError`; stamp-failure arm skipped D2;
    F8/F9/F10 prose and docblock placement; R1/R3–R6 test and house-rule
    items. All fixed in one fixer round. F2, F6, F7 (binder family), R2
    recorded as residuals below.
  - Round 2 (fast): clean; one non-blocking duplicate-helper note
    (Residual 6).
- Verification: SOLID. Witnesses red-before/green-after per element; full
  suite green; live witness green and red with D2 reverted; typecheck,
  lint, parse gate green; no leftover processes.
- Residuals:
  1. `tests/live/acceptance/noninteractive-acceptance.test.ts` area (f)
     (code-tool loop) is RED under this fix, correct reason: the fixture
     `acc-code-tool-loop.theta` reads `acc-code-tool-loop.theta` relative to
     an empty `mkdtempSync` scratch cwd, so its drive always ended in
     `theta /acc-code-tool-loop returned Err: tool read call failed
     (execution) — ENOENT …`. Before this fix that Err exited 0 with empty
     stderr, so the cell passed vacuously; D2 now surfaces it. Signature:
     `(f) code-tool-loop: expected a no-error exit (0), got 1. stderr: theta
     /acc-code-tool-loop returned Err: tool read call failed (execution) —
     ENOENT`. Not fixed here (a test file the §Fix does not name); to be
     filed as its own bug.
  2. The refusal-time outcome event reaches no shipped consumer: it fires
     inside pi-theta's `session_start`, and pi-theta-herdr's reporter
     (`src/herdr-child-reporter.ts` `onOutcome` returns while `active` is
     false; `active` is set in its own `session_start`, loaded after
     pi-theta) drops it, so no `FAILED` retitle. The shutdown still closes
     the pane. Owned by pi-theta-herdr (latch an early outcome) or a later
     pi-theta deferral; the §Fix's "pi-theta-herdr needs no change" is
     wrong on this point.
  3. D2 covers only `emitTopLevelErrNote` / `emitPanicNote` as the §Fix
     scopes it. Binder short-circuit endings (`binder-run.ts`
     `#emitBinderFailureNote`: "argument binder unavailable", "argument
     binding cancelled") still end a `pi -p` parent with exit 0 and silent
     stderr.
  4. D2 has no normative sentence outside this document (SLSH-3 in
     `slash-invocation.md` names only the note); the §Fix named only
     subagent.md amendments.
  5. In-process SDK embeddings (`createAgentSession` + `bindExtensions`,
     e.g. the H8a / probe harnesses) report `ctx.mode === "print"`, so a
     non-Ok drive there writes the note to the host process's stderr and
     sets its `process.exitCode = 1`. No test fails from it.
  6. `tests/production-result-channel.test.ts` and
     `tests/subagent-result-channel-factory.test.ts` keep private copies of
     `inertWatchdogSeams()` beside the shared
     `tests/helpers/inert-parent-watchdog.ts`.
  7. A launch-file (visible) child that runs a host `/reload` loses its
     watchdog: `session_shutdown` disposes it and the fresh instance finds
     the launch file consumed, so the regime is not re-entered. Stated in
     subagent.md layer 2.
  8. The last pre-commit `npm test` run had one red,
     `tests/subagent-return-depth-refusal.test.ts`. The spawned child
     reported `subagent model pre-flight mismatch: expected
     'anthropic/claude-fable-5', child resolved '(unresolved: no matching
     model)'`. Rerunning that file alone gave 2 passes out of 3. Three earlier
     full runs over the same source were green (712/712). The failing path
     is the child's `modelRegistry.getAvailable()`, which filters on
     readable auth; the operator's shared `~/.pi/agent/auth.json` was being
     rewritten by concurrent sessions during the run. No reader or writer
     of that path is in this diff. This is attributed to the environment and
     was not proven at HEAD.
  9. `tests/subagent-parent-watchdog-real-process.test.ts` uses the pid of
     an exited process; Windows pid reuse within the ~10 s poll window
     would red it (not observed; 60 spawns showed no reuse).
  10. The visible-refusal shutdown and the watchdog's pane-child path are
      witnessed in-process and by a provider-free real-process test; no live
      suite runs a visible placement backend.
- Discharge notes appended: none.
- Pinned dispositions / non-goals:
  - Witness 5's text ("stderr carries `refused to register its root
    theta`") conflicts with D2's own mechanics (mirror "the same `content`
    string"; result line `theta /<slug> returned Err: …`) — the SNK-i row
    (`src/runtime/err-note-render.ts:174`) renders `callee_path` and
    `cause` only. D2 shipped literally; the live witness asserts the
    rendered note on stderr and the refusal text on the `--mode json`
    stdout stream.
  - The refusing child's process exit is green before and after in the live
    witness: acceptance children use `pipe`, whose `-p` run self-ends.
  - The pre-fix cell M15 in
    `tests/subagent-root-registration-refusal-envelope.test.ts` ("refusal
    carries no outcome event") was inverted to the amended contract.
  - Self-authorized documentation scope: the how-to paragraph
    (`docs/how-to/place-subagents-in-a-multiplexer.md`, one paragraph plus
    one Provenance bullet) restated the pre-fix unconditional linger.
    Evidence: §Fix :109 amendment wording; round-1 review grep for the
    old contract; the how-to text itself. Bound: that paragraph only, no
    assertion or executable line.
  - Version bump and CHANGELOG entry are owned by the separate release
    step.

## Relation to prior bugs

- **0483 (open)** — the child-side trigger of Run A: the host-recovery
  (stall-watchdog) abort cancels the whole theta instead of riding the
  retry. Had 0483 been fixed, Run A's child would have ridden pi-retry's
  re-kick INSIDE the still-live drive and delivered a real envelope later —
  D1's tether gap and D2's silent parent would both still exist.
- **0484 (fixed 0.482.0)** — closed the no-envelope abandonment shapes
  (parent kills on synthesised settlement; child aborts on channel death).
  This bug is the shape 0484 deliberately left open: envelope DELIVERED,
  child sanctioned to linger — plus the refusal path, which 0484 never
  touched. Its "an invocation that settles without an envelope leaves no
  live child" invariant holds; the delivered-envelope complement ("a
  settled visible child outlives everything") is what breaks here.
- **0485 (open)** — the same sanctioned Err linger, costing a core; this
  bug shows it also costs unbounded tokens (re-kick) and operator sweeps
  (orphans), and that the linger fires for parents that can never have a
  reader. 0485's headless-lanes recommendation is a partial mitigation for
  D1 (a `pipe` child's `-p` process self-ends).
- **0489 (fixed 0.489.0)** — why the child log exists and is nested under a
  parent basename that has no file: the derivation `mkdirSync`s the nest at
  launch from the parent's session PATH; D2 is why the parent file itself
  never appears. Also the source of the herdr backend's `persistSession`.
- **0474 (fixed)** — the control-plane env scrub; context for why
  `buildSubagentChildEnv` is deliberate and minimal about what it writes —
  any D1 fix adding a marker must join `SUBAGENT_CONTROL_PLANE_ENV_KEYS`
  handling consciously.
- **0002** — the origin of PIC-65's honest layer-2 gap (stdin-EOF exit
  falsified); this bug is that recorded gap graduating from "residual
  exposure, bounded" to observed unbounded orphans.

## Notes

- pi-config commits for the aggravator context: 7ec79bf (pi-retry fork:
  self re-kick stalled turns pi ≥ 0.87 no longer retries), a0e1419
  (subagent: self-heal stall-watchdog settles — documents the pi 0.87
  `ctx.abort()`→`session.abort()` regression that made the re-kicker
  necessary), f448618 (never finalize a retryable error; 60 s escalating
  stall window). pi-config's own children carry a full private lifecycle
  (PI_SUBAGENT_CHILD opt-out, bounded net-retry ladder, session lease
  heartbeats, parent-side idle watchdog, autoClose policy) — the
  conventions D1's pi-theta fix should mirror where the seams allow.
- The ENOENT pane spam after the operator deleted the orphan's session dir
  is downstream evidence, not a separate defect: the lingering LIVE session
  kept appending to its bug-0489 `--session` path.
- The herdr placement backend working tree's uncommitted
  `persistSession: true` change (pi-theta-herdr) is unrelated and untouched.
