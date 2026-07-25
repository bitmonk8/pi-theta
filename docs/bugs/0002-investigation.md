# Bug 0002 — Investigation

- **Status:** investigation complete — root cause confirmed empirically. No fix implemented (per mission).
- **Investigator context:** Windows, branch `main`, HEAD `e5c4ddf9`, clean tree. pi in repo `node_modules`: 0.80.10 (global install 0.82.0 has identical stdin handling).
- **Bug report:** `0002-subagent-child-hangs-under-acceptance-pi-p.md`

## TL;DR

The leading hypothesis is **confirmed, with a sharpening**: the child does not merely *fail to
exit* while its stdin pipe is open — it never **starts**. Pi's `main()` awaits
`readPipedStdin()` (stdin read to EOF) for every non-TTY stdin in every mode except `rpc`,
**before** the initial `-p` message is even assembled. The subagent child is spawned
`--mode json -p "/<slug>"` with `stdio: ["pipe","pipe","pipe"]` and nothing closes the
parent-held stdin pipe on the normal path (only cancellation and teardown close it, and
teardown runs only *after* the drive promise settles). So: parent awaits envelope-or-exit ⇄
child awaits stdin EOF — a deadlock. Everything downstream (theta run, envelope on fd 1,
self-exit) is fully functional and fires within ~30 ms of stdin EOF.

- **Root cause:** child spawn leaves stdin open on the normal path while pi's `-p`/json mode
  blocks on stdin EOF before processing the prompt. Purely mechanical; **no model involvement**
  (reproduced with a provider-free theta; the block precedes any provider contact).
- **Introducing commit:** `4866d4d2` (RFC 0006, v0.9.0) — switched the child from `--mode rpc`
  (exempt from pi's stdin gate; stdin actively used as the RPC channel) to `--mode json -p`
  (subject to the gate) while keeping the open-pipe spawn and close-only-on-cancel/teardown.
  No commit has ever closed child stdin on the normal path.
- **Bonus finding:** PIC-63's premise is inverted in practice — closing stdin is not a graceful
  *stop* signal to a `-p` child; it is the **"go"** signal (EOF is what lets the child begin).
- **Second latent defect (this machine, likely the reporter's too):** with the exact production
  argv the child loads whatever theta extension **ambient discovery** finds — here a stale
  user-scope pi-theta **0.7.1** (pre-envelope) — not the working tree's extension the acceptance
  harness pins for the outer process. Even with stdin fixed, cases (e)/(g) would fail
  fail-closed (exit-without-envelope) on such a machine.
- **Recommended fix direction:** close the child's stdin at/immediately after spawn (or spawn it
  `"ignore"`), and rewrite PIC-63 to base cancellation on the bounded process-tree kill (the
  stdin-close "grace signal" never gracefully stopped anything).

## Static analysis (code read, pre-experiment)

Parent-side flow on the **normal** (uncancelled) path, from a read of
`src/extension/production-subagent-host.ts`, `src/runtime/subagent-launcher.ts`,
`src/runtime/subagent-json-driver.ts`, `src/runtime/subagent-isolation.ts`:

1. `createProductionSpawnFn` spawns the child with `stdio: ["pipe","pipe","pipe"]`
   (`production-subagent-host.ts:298-306`). The parent-held stdin pipe stays **open**.
2. `driveSubagentChild` (`subagent-json-driver.ts:88-…`) returns a promise that settles
   only on (a) a `theta_result` envelope line on child stdout, or (b) child exit.
   It never writes to or closes child stdin.
3. `closeStdin()` is reachable from exactly two sites, both *after the fact*:
   - `attachSubagentStdinCancellation` (`subagent-json-driver.ts`) — **cancellation** path only (PIC-63);
   - `runSubagentChildTeardown` (`subagent-isolation.ts`) — **teardown**: stdin close → bounded await
     (`SHUTDOWN_AWAIT_CAP_MS`) → process-tree kill.
4. Consequence: if the child does not make progress until its stdin reaches EOF, and teardown runs
   only after the drive promise settles, the normal path is a **deadlock**: parent waits for
   envelope/exit; child waits for stdin EOF; the only stdin close is in a teardown that runs after
   the parent's wait resolves.

Load-bearing detail from the bug report to discriminate: the child produced **no envelope** at all.
If the child merely hung *at exit* (after emitting the envelope), the parent would settle on the
envelope line and teardown would then close stdin — no hang. The observed no-envelope hang implies
the child blocks **before** emitting the envelope (i.e. before/without running the theta turn), or
the envelope is emitted but never delivered/recognised. The stdin open-vs-closed experiment below
discriminates.

### Pi-side static evidence: `-p` gates on stdin EOF *before* running the prompt

Installed pi (`@earendil-works/pi-coding-agent`, checked in both the global install and this
repo's `node_modules`) — `dist/main.js`:

```js
async function readPipedStdin() {
    // If stdin is a TTY, we're running interactively - don't read stdin
    if (process.stdin.isTTY) {
        return undefined;
    }
    return new Promise((resolve) => {
        let data = "";
        process.stdin.setEncoding("utf8");
        process.stdin.on("data", (chunk) => { data += chunk; });
        process.stdin.on("end", () => { resolve(data.trim() || undefined); });
        process.stdin.resume();
    });
}
```

and in `main()` (after extension load + flag parsing, **before** the initial message is built,
before any session/prompt processing):

```js
// Read piped stdin content (if any) - skip for RPC mode which uses stdin for JSON-RPC
let stdinContent;
if (appMode !== "rpc") {
    stdinContent = await readPipedStdin();
    ...
}
const { initialMessage, initialImages } = await prepareInitialMessage(parsed, ..., stdinContent);
```

`resolveAppMode` maps `--mode json` → `"json"`, not `"rpc"` — so the stdin-EOF gate **does**
apply to the subagent child (`--mode json -p "/<slug>"`). A child spawned with
`stdio: ["pipe", …]` whose parent never writes and never closes the pipe blocks inside
`readPipedStdin()` **at startup**: no `theta_result` envelope, no theta execution, no model
call, no exit. This is exactly the deadlock shape in the static analysis above, and it answers
open question #1 statically (blocks *before* writing the envelope — before the prompt is even
assembled). Empirical confirmation below.

## Experiment log

All scratch files live OUTSIDE the repo under `%TEMP%\bug0002\` (`run-child.mjs` driver,
`thetas\min-child.theta` fixture). Every pi-spawning run was under a hard timeout.

**Fixture** (`min-child.theta`) — deliberately provider-free (no `@` query; a pure tail
expression is the final value), so the experiment burns no tokens and any model dependence
would be exposed:

```theta
---
mode: subagent
---
"MIN OK"
```

**Child argv** — the exact `assembleSubagentArgv` output (`src/runtime/subagent-launcher.ts:206-232`)
for slug `min-child`, empty callable set, executed via resolution rung 1
(`node <repo>/node_modules/@earendil-works/pi-coding-agent/dist/cli.js`, pi 0.80.10), with the exact
`buildSubagentChildEnv` markers (`PI_THETA_SUBAGENT_ROOT=min-child`, `PI_THETA_SUBAGENT_PARENT_PID`,
`PI_THETA_SUBAGENT_INVOKE_DEPTH=0`), `cwd` = scratch dir, `shell:false`:

```
[-ne -e <repo>/extensions]  # pinned working-tree extension, exactly as the acceptance harness pins the OUTER process; omitted in the "ambient" variant
--theta %TEMP%\bug0002\thetas --mode json -p /min-child --no-session
--system-prompt "" --no-tools --provider anthropic --model claude-fable-5
--no-skills --no-prompt-templates --no-themes --no-context-files --no-approve
```

| # | Variant | stdin | Result |
|---|---------|-------|--------|
| A | `pipe-open` | `["pipe","pipe","pipe"]`, parent holds the pipe open, writes nothing (= production normal path) | **HANG.** 60 s, **zero bytes** on stdout AND stderr (not even the `--mode json` `session` event), no exit. Killed by the driver's `taskkill /T /F` → `close: code=1 signal=null`, `sawEnvelope=false`. |
| B | `ignore` | `["ignore","pipe","pipe"]` (= the harness workaround for the outer process) | Runs immediately: `session` event at ≈885 ms, envelope `{"theta_result":{"v":1,"ok":"MIN OK"}}` at ≈897 ms, EOF, **exit 0** at ≈912 ms. |
| C | `pipe-close5s` | `pipe`, parent closes stdin after 5 s | Child emits **nothing for exactly the 5 s the pipe is open**; within ≈30 ms of EOF: `session` event (5017 ms), envelope (5029 ms), **exit 0** (5044 ms). |
| D | `pipe-open-ambient` | as A but the **exact** production argv (no `-ne -e`; ambient extension discovery) | **Identical hang**: 20 s, zero output, killed. (The stdin gate is upstream of prompt processing, so extension identity is irrelevant to the hang.) |

Raw observations (variant C, the discriminating one):

```
[  5012ms][driver] closing child stdin now (EOF)
[  5017ms][out] {"type":"session","version":3,...}
[  5029ms][out] {"theta_result":{"v":1,"ok":"MIN OK"}} <<< THETA_RESULT ENVELOPE
[  5044ms][driver] child close: code=0 signal=null sawEnvelope=true
```

**Verdict: the stdin hypothesis is CONFIRMED.** The child is fully functional — theta discovery,
the subagent-root regime, envelope emission on fd 1, and self-exit all work — but it does not
*start* until its stdin reaches EOF. With the production spawn config nothing ever closes that
pipe on the normal path, so child start and parent settle deadlock. And it settles the
before-or-after question: the child blocks **before** theta execution begins (zero output over
the whole hang — the block is in pi's `readPipedStdin()` before the initial message is built,
upstream of the session, the extension command dispatch, and any provider contact).

### Outer-process experiment (open question #4) — through the REAL production spawn path

`%TEMP%\bug0002\run-outer.mjs`: spawn the OUTER `pi -p "/min-child"` exactly the way the
acceptance harness does (`stdio: ["ignore","pipe","pipe"]`, `-ne -e <repo>/extensions`,
`--provider anthropic --model claude-fable-5`, `--theta <scratch>`). The theta is
`mode: subagent`, so the outer pi's **own extension** (the code under test, not my driver)
spawns the inner child via `createProductionSpawnFn`. After 15 s, kill ONLY the inner child
(`taskkill /PID <inner> /F`, no `/T`) — simulating the reviewer's externally-killed-child
observation — and watch the outer.

```
[driver] outer pid=34448; will kill INNER child after 15000ms
[ 15493ms][driver] inner --mode json children of outer: [41152]   <- deadlock reproduced through production code
[ 15493ms][driver] taskkill /PID 41152 /F  (inner only, no /T)
[ 15688ms][out] <EOF>
[ 15690ms][driver] OUTER close: code=0 signal=null
```

Observations:

1. The deadlock reproduces end-to-end through the real extension (outer silent for 15 s, inner
   `--mode json` child present and stuck).
2. Once the inner dies, the **outer exits on its own within ~200 ms** (drive settles → teardown
   → exit). In this minimal repro there is **no second, independent outer hang**: the outer's
   180 s acceptance hang is fully explained by the primary deadlock (its slash-command promise
   never settles while the inner lives).
3. Side observation: the outer exited **0** with **empty stdout/stderr** — the fail-closed
   `Err` and the `subagent-child-crashed` / `subagent-exit-without-envelope` diagnostics were
   not visible on the plain `-p` text surface. Diagnostic visibility on that surface (and the
   exit code of a failed run) may deserve its own look, but is out of scope here.

### Ambient-discovery experiment — what extension does the EXACT production child argv load?

Variant D (`pipe-open-ambient`, exact argv, no `-ne -e`) re-run with stdin closed after 5 s:

```
[  5011ms][driver] closing stdin
[  5014ms][out] {"type":"session",...}
[  5073ms][out] <EOF>
[  5076ms][driver] close code=0 signal=null      <- NO theta_result envelope
```

The child unblocked, started a session, exited 0 — and emitted **no envelope**. Cause: the
assembled child argv carries no `-e`/`-ne`, so the child loads extensions by ambient discovery.
On this machine user-scope `pi-config` exposes `@bitmonk8/pi-theta` **0.7.1**
(`pi.extensions: ["node_modules/@bitmonk8/pi-theta/extensions"]`) — a pre-RFC-0006 build with no
subagent-root regime and no envelope writer. (That an extension consuming `--theta` was loaded
is proven by the argv parse succeeding; only the 0.7.1 ambient build was available to this
child.) The acceptance harness pins the OUTER process to the working tree (`-ne -e`), but the
INNER child it ultimately causes to spawn is not pinned to anything — see Defect 2.

## Root cause (confirmed)

Two facts, each independently verified, whose conjunction is the deadlock:

1. **Pi gates `-p`/json-mode startup on stdin EOF.** `dist/main.js` (`readPipedStdin`, and the
   `if (appMode !== "rpc")` call site before `prepareInitialMessage`): any non-TTY stdin is read
   to EOF before the prompt is processed; only `--mode rpc` is exempt. Verified in pi 0.80.10
   (what the child runs here) and 0.82.0.
2. **The subagent child's stdin is never closed on the normal path.** Spawn config
   `stdio: ["pipe","pipe","pipe"]` (`production-subagent-host.ts` `createProductionSpawnFn`);
   `closeStdin()` reachable only from the PIC-63 cancellation listener
   (`subagent-json-driver.ts` `attachSubagentStdinCancellation`) and PIC-9 teardown
   (`subagent-isolation.ts` `runSubagentChildTeardown`). Both drive call sites
   (`theta-composition-producer.ts:410-443` top-level slash; `production-theta-producer.ts:2702-2727`
   `invoke`) run `await binding.drive()` inside `try` and `await binding.teardown?.()` in
   `finally` — teardown strictly follows drive settlement, and drive settles only on
   envelope-or-exit.

Parent waits on the child's first output; child waits on the parent's stdin close; the only
stdin close is scheduled after the parent's wait resolves. Deadlock. The 180 s acceptance
timeouts, the killed-not-self-terminated child (exit 143 in the reviewer's wrapper; code 1 under
`taskkill`), the absent envelope, the `subagent-child-crashed` + `subagent-exit-without-envelope`
diagnostics, and the fail-closed `Err` are all downstream of external kills of a deadlocked pair.

## Introducing commit

**`4866d4d2` — "feat: child-process theta execution (RFC 0006) — v0.9.0"** (2026-07-24).

- Predecessor `fda23a4b` (RFC 0005, v0.8.0) spawned the child `--mode rpc --no-session …` with
  the same `stdio: ["pipe","pipe","pipe"]`. That was **not** subject to the stdin gate: pi skips
  `readPipedStdin()` for `appMode === "rpc"` (stdin *is* the JSON-RPC command channel), and the
  RFC-0005 driver actively wrote commands to it (`subagent-rpc-driver.ts` `writeStdin` sites).
  An open stdin pipe was correct there.
- `4866d4d2` switched the assembled argv from `--mode rpc` to `--mode json -p "/<slug>"`
  (diff hunk in `subagent-launcher.ts`: `-"rpc"` / `+"json"`, `+ -p "/<slug>"`), which moved the
  child into the gated startup path, while keeping the open-pipe spawn and introducing
  stdin-close only as the PIC-63 cancellation grace signal and the PIC-9 teardown step.
- v0.10.0 (`22306e5d`, the fd-1 envelope fix) and v0.11.0 (`b8d4fd2c`) did not touch stdin
  handling. **No commit in the history ever closed child stdin on the normal path.**
- Aggravating context: the identical failure mode had already been found and worked around for
  the OUTER process in `fed12acd` (acceptance harness, 2026-07-03, `stdio: ["ignore",…]` with an
  explanatory comment) — three weeks **before** `4866d4d2` re-created it one level down.

## Model dependence

**None — the hang is purely mechanical** (process/pipe plumbing):

- Reproduced with a theta whose body is a pure tail expression (`"MIN OK"`), no `@` query, no
  binder — zero provider/model interaction, zero tokens.
- The block sits in pi's startup path *before* session creation, model resolution, extension
  command dispatch, or any network activity (variant A/D: zero output of any kind for the whole
  hang, including the `--mode json` `session` event that otherwise appears in <1 s).
- Deterministic in both directions: open pipe → hangs every time; EOF → full run + envelope +
  exit 0 in ~30 ms, every time. Which LLM is configured (or whether one is ever queried) is
  irrelevant.

## Answers to the bug report's 6 open questions

1. **Does the child block before or after writing its envelope?** Before — before *everything*.
   It blocks in pi's `readPipedStdin()` at startup, upstream of the initial message, the
   session, and the extension. Zero bytes appear on either stream during the hang (variant A);
   the envelope appears ~12 ms after the session event once stdin EOFs (variants B/C). The
   alternative ("envelope written but the parent's scan misses it") is refuted: with EOF the
   envelope is written, correctly newline-terminated (`serializeOkEnvelope` appends `\n`), and
   the parent-side pump logic would see it.
2. **Is the stdin hypothesis correct?** Yes — confirmed by direct manipulation (open pipe vs.
   `ignore` vs. delayed close), through both a synthetic spawn of the exact argv/env and the
   real production spawn path (outer-process experiment). One sharpening: the child doesn't
   block "waiting to exit"; it blocks waiting to *begin*.
3. **How is a fix reconciled with PIC-63?** The tension is illusory. Empirically, stdin close is
   not a graceful-shutdown channel for a `--mode json -p` child — it is the *start* signal
   (variant C: close → child runs the whole theta → exits 0). Under the current design a PIC-63
   cancellation actually *unblocks* the child, which then begins real work and is process-tree
   killed ≤ 2 s later (`SHUTDOWN_AWAIT_CAP_MS`) mid-run. There is no graceful stop to preserve;
   the effective terminator is, and always was, the kill. See fix directions.
4. **Why does the outer `pi -p` never exit either?** In the acceptance flow it is the *same*
   deadlock, not a second hang: the outer's slash-command promise never settles (drive is
   waiting on the inner child), so its `-p` run never completes; vitest kills the test at 180 s
   and the outer lingers/hangs until externally killed. When only the inner child is killed, the
   outer settles fail-closed and **exits on its own in ~200 ms** (outer-process experiment) — no
   unclosed-pipe/timer keep-alive was observed after settlement. The reviewer's "outer never
   exited" post-kill observation did not reproduce; most plausibly their kill left the pair only
   partially dead or their runner held the outer's stdin. If it recurs after the stdin fix, look
   again; nothing in the current evidence supports a second keep-alive.
5. **Is it platform-specific?** No (high confidence, static): the gate is pure Node stream
   semantics (`process.stdin.isTTY` is false for a pipe on all OSes; `'end'` fires only at EOF),
   and the spawn config is platform-independent. Only the eventual kill mechanics differ
   (taskkill vs. SIGKILL). Not empirically tested on Linux/macOS (this machine is Windows), but
   nothing in the mechanism is Windows-specific.
6. **Why did no in-repo test catch it?** Three compounding gaps. (a) The default suite's
   child coverage (`tests/production-host-loop-dispatch.test.ts`,
   `tests/subagent-root-drive-wiring.test.ts`, `tests/subagent-child-launch.test.ts`) drives
   fakes that respond regardless of stdin state — no fake models "no progress until stdin EOF".
   (b) The only real-spawn suite (acceptance) is opt-in, needs credentials, and its two
   child-spawning cases are exactly the failing ones. (c) The stdin-EOF knowledge existed
   in-repo (harness comment, `fed12acd`) but lived one level up. The bug doc's suggestion of a
   cheap real-spawn regression test is validated by this investigation: a provider-free
   `mode: subagent` theta with a pure tail expression completes (envelope + exit 0) in ~1 s of
   wall time with zero tokens — exactly the shape of experiment B.

## Distinct defects found

1. **[Primary — the reported bug] Child stdin left open on the normal path** while pi's
   json/`-p` startup gates on stdin EOF → parent↔child deadlock; every real subagent-mode
   invocation on the `-p` surface hangs until externally killed, then resolves fail-closed.
   Owner: `createProductionSpawnFn` spawn config + the drive/teardown ordering (stdin close
   scheduled only after the wait it would release). Introduced by `4866d4d2`.
2. **Child extension identity is unpinned (acceptance-fidelity + version-skew hazard).** The
   assembled child argv carries no `-ne`/`-e`; the child loads whatever theta extension ambient
   discovery finds. On this machine that is a stale user-scope pi-theta 0.7.1, which emits no
   envelope — so even with defect 1 fixed, acceptance (e)/(g) would fail fail-closed here
   (`subagent-exit-without-envelope`, fast instead of hung). For an operator whose only install
   is current, ambient discovery is the *designed* mechanism (the launch contract deliberately
   relies on re-discovery); the defect is that the harness pins the outer process to the working
   tree while the inner child can silently bind to a different build/version. At minimum an
   acceptance-infrastructure gap; at worst a real parent/child version-skew hazard.
3. **[Spec-level] PIC-9's class-2 orphan-prevention premise is inverted.** The spec asserts the
   child "exits when its parent-held stdin pipe reaches EOF" (subagent.md line ~133, ~164). In
   reality EOF causes the child to **start (or continue) and run the entire theta** — including
   real model turns — and only then exit. An orphaned child would burn tokens doing the whole
   run after parent death. The recorded fallback (child-side parent-PID watchdog) is
   unimplemented: `PI_THETA_SUBAGENT_PARENT_PID` is written by the launcher and read by nothing
   in `src/`.
4. **[Spec-level, same root as 3] PIC-63's "grace signal" is not graceful.** Cancellation's
   stdin close *starts* a blocked child; the bounded kill is what actually cancels. The
   documented cancellation semantics ("grace → kill") are in practice "go → kill ≤ 2 s later".
   Not separately observable today only because the child is always still blocked at cancel
   time.

Observations recorded but not counted as defects here: the outer `pi -p` run that resolves a
top-level `Err` exited 0 with empty stdout (no visible fail-closed diagnostics on the text
surface) — possibly correct rendering policy, possibly a visibility gap; not investigated
further.

## Candidate fix directions (with PIC-63 implications) — not implemented

**Direction 1 (recommended): close the child's stdin at spawn; re-base PIC-63 cancellation on
the bounded process-tree kill.**
Either spawn with `stdio: ["ignore","pipe","pipe"]` (mirroring the harness's proven workaround
one level up) or keep `"pipe"` and `child.stdin.end()` immediately after `adaptChild` — the
latter preserves the `SubagentChildProcess.closeStdin()` surface and keeps teardown idempotent
(double `end()` is a no-op). Spec changes required: PIC-63 loses the stdin-close grace step
(cancellation = abort → process-tree kill, optionally keeping a bounded grace before the kill
for symmetry, though nothing listens); PIC-9's class-2 orphan mechanism must stop citing
stdin-EOF-exit (with stdin closed at spawn there is no parent-death EOF signal at all) and
should promote the already-specified fallback — the child-side parent-PID watchdog (env carriage
already exists; the reader is missing). The `#subagent-cli-wire-pins` audit item ("stdin-EOF
exit behaviour") must be rewritten to match reality (EOF = input-complete/start, not exit).
Pros: one-line mechanical fix at the spawn site; removes the deadlock class entirely; matches
how the harness treats the outer process; variant B empirically validates the child's full
happy path under exactly this config. Cons: PIC-9/PIC-63 spec surgery; orphan prevention needs
the watchdog actually implemented (or accepts the kill-ladder-only story).

**Direction 2: keep the pipe open but close it the moment the drive begins awaiting the
envelope** (i.e. treat stdin as "deliver nothing, then EOF" — close right after the PIC-63
listener attaches, on the normal path too). This is behaviourally identical to Direction 1 for
the child (EOF at ~spawn time) while leaving PIC-63's text nominally intact (the cancel
listener's `closeStdin()` becomes a no-op on an already-ended pipe). Pros: smallest textual
delta; no stdio-config change. Cons: preserves a fiction — PIC-63's grace signal remains dead
code in effect, PIC-9's EOF premise remains wrong, and a future reader will re-derive the
contradiction; the parent-death orphan story still silently degrades to "child runs to
completion then exits".

**Direction 3: child-side/upstream — make the child not gate on stdin** (a pi CLI change: skip
`readPipedStdin()` when `-p` has an argv prompt, or a new `--no-stdin` flag pi-theta could pass).
Pros: fixes the class for every pi extension that spawns `pi -p` children; keeps the stdin pipe
available as a genuine future control channel. Cons: not in pi-theta's hands (pi's
piped-stdin-as-prompt-input is a designed, documented behaviour — `echo x | pi -p "y"` — so
upstream would need a flag, a version bump, and a capability probe/pin per the version-bump
procedure); leaves current pi versions broken; the launch contract would grow a
version-conditional argv. Could complement Direction 1 later, not replace it now.

**Recommendation: Direction 1**, with the spec edits done in the same change (PIC-63 rewrite,
PIC-9 class-2 rewrite + watchdog decision, `#subagent-cli-wire-pins` audit-item correction), and
a provider-free real-spawn regression test in the default suite (shape of experiment B: spawn
the real `pi --theta … --mode json -p "/<slug>" …` child with the production spawn fn against a
pure-expression subagent theta pinned to this working tree via `-ne -e`; assert envelope + exit
0 within a few seconds — no provider, no tokens). Defect 2 (child extension pinning under the
acceptance harness) needs its own decision: either the harness exports a knob the child argv
assembly can honour under test, or the acceptance environment must guarantee no stale ambient
theta build — without it, the two acceptance cases will still fail on machines like this one.

## Scratch artefacts (outside the repo)

`%TEMP%\bug0002\`: `run-child.mjs` (variants A–D), `run-outer.mjs` (outer/inner kill experiment),
`thetas\min-child.theta` (provider-free fixture). Left in place for re-running; not part of the
repo.
