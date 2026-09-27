# Bug 0493 — a visible child's lifetime is tied to nothing once its envelope is delivered: Err/refusal children linger unbounded after the parent exits (one orphan re-kicked real model turns for ~50 minutes), and a `pi -p` parent whose drive ends non-Ok before any assistant turn exits 0 with empty stdout and no session file

- **Status:** Open.
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
