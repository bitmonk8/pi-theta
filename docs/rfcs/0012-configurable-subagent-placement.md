# RFC 0012 — Configurable subagent placement (multiplexer tabs and other launch surfaces)

- **Status:** accepted (implemented 2026-09-15, shipped in 0.475.0; see
  §Implementation record)
- **Scope:** Pi-integration contract and runtime architecture, plus one small
  theta 1.x language-surface widening that falls out of it (the call-site
  `with { cwd }` clause becomes admissible on `subagent fn` calls once those
  spawn a child process — an amendment to RFC 0009's Erratum A/A′ ground
  truth). `.theta` sources and their return values, diagnostic sequences and
  system notes are otherwise unchanged.
- **Affects:** `pi-integration-contract/subagent.md` (launch contract, control
  plane, return envelope, cancellation, teardown, host CLI dialect, PIC-64
  *Accepted cost*), `functions.md` (FN-6/FN-7/FN-9 — `subagent fn` bodies run
  in a child process), `invocation.md` INV-8 and the `theta/parse/*` registry
  (one Trigger edit), `capability-probe.md` (one optional capability),
  discovery settings keys, the execution-status child tap (RFC 0010), the
  load registry (two codes), docs
- **Depends on:** [RFC 0005](./0005-child-process-subagent-sessions.md) /
  [RFC 0006](./0006-child-process-theta-execution.md) (the child-process
  subagent architecture this RFC completes and makes relocatable);
  [RFC 0001](./0001-subagent-fn.md) (`subagent fn`, whose bodies move into
  that architecture here)
- **Origin:** operator request — pi-config's subagent extension spawns its
  children as Herdr tabs; theta children should be placeable the same way
  without hard-wiring pi-theta to Herdr, because other operators run other
  multiplexers (or none) and other hosts (Oh-My-Pi).

## Summary

Separate **where a subagent child runs** from **what it receives and returns**,
and make every subagent conversation a child so that the separation covers all
of them.

1. **Placement backend seam.** Today the child launch is one process-shaped
   seam — `SpawnFn(execPath, args, {cwd, env})` returning a
   `SubagentChildProcess` whose stdout carries the `theta_result` envelope
   (`launchSubagentChild`, `src/runtime/subagent-launcher.ts`). This RFC
   replaces the injectable with `place(request) → PlacedChild`: a backend puts
   the already-assembled child (executable, argv, cwd, env, label) somewhere
   — the parent's own process tree (`pipe`, today's behaviour, default), an
   operator-supplied command (`exec`), or a surface another extension drives
   (Herdr, WezTerm, tmux, Zellij, cmux, …) — and exposes only `handle`,
   `kill()`, and optional exit observation.
2. **Result channel off stdout** for non-`pipe` placements: the parent opens a
   per-launch loopback channel; the child writes the envelope, progress
   lines, heartbeat and a stderr mirror there. The stdout contract is
   unchanged under `pipe`.
3. **Control plane off inherited environment** for non-`pipe` placements: a
   parent-private **launch file** whose path travels on argv, because a pane
   spawned by a multiplexer is not the parent's child process and may not
   inherit its environment.
4. **Backends register over Pi's shared event bus** (`pi.events`, present on
   Pi and Oh-My-Pi) under a versioned discovery protocol. pi-theta ships
   `pipe` and `exec`; the Herdr backend ships as a companion package built
   from pi-config's existing transport (§Operator view, §Packaging).
5. **One operator selector** — `theta.subagentPlacement` in `settings.json`,
   `PI_THETA_SUBAGENT_PLACEMENT` for one run — with `auto` detection by
   multiplexer environment markers (the convention three independent Pi
   packages already use) and fail-closed refusal when an explicit choice is
   unavailable.
6. **`subagent fn` bodies become child processes.** The launch file gains a
   *fn entry*; the child's subagent-root regime runs the named top-level
   `subagent fn` with marshalled arguments instead of the theta body. The
   in-process `OffSessionQueryModel` path is retired. After this RFC the only
   in-process execution is a prompt-mode theta driving the user's own
   session — which is not a subagent — so *every* subagent conversation is
   placeable.

A child placed in a visible pane runs Pi's interactive TUI with the slash
command as its initial message, so a human can watch and take over; on
success it shuts itself down (the pane closes), on failure it lingers.
Everything else about a subagent invocation — typed params, `Result`
fidelity, the `--tools` allowlist, trust inference, closure hashes, depth
accounting, PIC-65 teardown budgets — is byte-identical across placements.

## Operator view — what a user does

Placement is configured at two layers: a **backend** is *provided* by an
installed package (mux-specific code has to live somewhere), and the
**selection** is a `settings.json` key or environment variable — optional,
because `auto` picks a detected backend. The settings file is the one
pi-theta already reads for `theta.binderModel` and `theta.progress`: the
host's global agent settings (`~/.pi/agent/settings.json` on Pi; the `.omp`
equivalent on Oh-My-Pi) and the project-local `<project>/.pi/settings.json`
(`src/discovery/settings.ts`).

**Herdr user.**

1. `pi install npm:@bitmonk8/pi-theta-herdr` (the companion package,
   §Packaging; an operator running pi-config gets it as a dependency).
2. Start `herdr`, open a pane, run `pi` in it.
3. Nothing else. Inside a Herdr pane the environment carries `HERDR_ENV=1`,
   `HERDR_SOCKET_PATH`, `HERDR_PANE_ID`, `HERDR_WORKSPACE_ID`; the backend's
   `detect()` sees them and `auto` selects it. Every subagent invocation — a
   `mode: subagent` slash command, an `invoke(...)`, a `.theta` callable, a
   `par for` iteration, a `subagent fn` call — opens a tab labelled with the
   callee's slug in the current workspace, closes itself on success, and
   stays open retitled on failure. Outside Herdr the same setup runs headless
   (`pipe`); no error, no configuration change.
4. Optional pinning, `~/.pi/agent/settings.json`:

   ```json
   { "theta": { "subagentPlacement": "herdr", "subagentPlacementMaxVisible": 8 } }
   ```

   With `"herdr"` pinned, starting `pi` outside Herdr refuses to register
   `mode: subagent` thetas with `theta/load/subagent-placement-unavailable`
   naming the fix. One-off override: `PI_THETA_SUBAGENT_PLACEMENT=pipe pi`.

**tmux / Zellij user with no backend package.** Global settings only:

```json
{
  "theta": {
    "subagentPlacement": "auto",
    "subagentPlacementExec": {
      "when":  { "env": "TMUX" },
      "spawn": ["tmux", "new-window", "-d", "-P", "-F", "#{pane_id}", "-c", "{cwd}", "-n", "{label}", "{argv}"],
      "kill":  ["tmux", "kill-pane", "-t", "{handle}"]
    }
  }
}
```

Start `pi` inside tmux; `auto` selects `exec` because `TMUX` is set. A
Zellij or WezTerm template differs only in the three arrays.

**Headless / CI / no multiplexer.** Nothing. `pipe`, as today.

**Oh-My-Pi.** Identical steps; the host dialect is selected as today, the
companion package registers over the same bus, `exec` covers any mux with a
CLI.

**Extension author.** A backend is ~100 lines: `detect()`, `place()`,
`kill()`, registered with one `pi.events` handshake (§5). It never sees
params, envelopes, or theta source.

## Motivation

1. **Observability of long fan-outs.** A `par for` over `.theta` callables
   spawns N headless `pi --mode json -p` children. The operator sees RFC
   0010's status line; they cannot look inside a child, interrupt one turn,
   or type into a wedged one. Every mature Pi subagent extension in the
   ecosystem (§Landscape) has converged on "a real session in a pane you can
   attach to" for exactly this reason.
2. **Placement is an operator concern, not a theta author's.** The same theta
   runs on a laptop with Herdr, on a server under tmux, on Windows under
   WezTerm, or headless in CI. Hard-wiring one multiplexer into pi-theta
   would be wrong for every other operator; leaving the seam closed forces
   each operator to fork the launcher.
3. **The Herdr work already exists next door.** pi-config's subagent
   extension (`extensions/subagent/index.ts`, `runInHerdr` /
   `selectTransport`) has a verified Herdr transport: `layout.apply` argv
   spawn into the parent's workspace, `pane.close`, state self-report,
   failure-lingers semantics, Windows named-pipe handling
   (`docs/reference/herdr-mux-transport.md`). What is missing is a place to
   plug it into pi-theta.
4. **The current contract is silently pipe-shaped.** Two load-bearing
   mechanisms assume the child is the parent's direct child process: the
   control plane is authenticated by `PI_THETA_SUBAGENT_PARENT_PID ==
   process.ppid` (`authenticateControlPlane`,
   `src/extension/production-subagent-host.ts`), and the result rides the
   child's stdout (PIC-59). Under any multiplexer both assumptions fail —
   the child's parent is the mux server and its stdout is a TTY. Making
   placement configurable requires naming those two assumptions and giving
   them transport-independent replacements.
5. **One subagent execution model.** `subagent fn` bodies are the one
   subagent conversation that is not a child process. That exception costs
   more than uniformity: in a prompt-mode theta a body's code-side
   extension-tool call dispatches through the **user's live session**
   (fabricated turn, model thrash — FN-6, PIC-64 *Accepted cost*); the body's
   model-facing loop is a private `complete()` loop rather than a host
   session with natively registered tools; and the body cannot be placed,
   watched, or resumed. RFC 0001 designed the construct for relocation
   (by-value arguments, no lexical capture, marshallable configuration); the
   only missing piece was a child entry for a body without a slug.

## Landscape survey (research findings)

Verified against package READMEs / source on 2026-09 unless stated. Herdr
facts are from pi-config's verified design note
(`docs/reference/herdr-mux-transport.md`, Herdr v0.8.0 source).

### Session / subagent placement solutions around Pi and Oh-My-Pi

| Package | Placement | Result channel back to the parent | Mux detection / selection |
|---|---|---|---|
| Pi `examples/extensions/subagent` (upstream) | `pi --mode json -p --no-session` child, pipe | stdout JSON events | — |
| **pi-config `subagent`** (this operator) | `pipe`; **WezTerm** pane (`wezterm cli spawn`); **Herdr** tab (`layout.apply`, argv+cwd+env) | job file on argv → child dials a loopback TCP NDJSON socket (hello-token, `done`/`fatal`/`heartbeat` frames + `AgentSessionEvent`s); session-file classification as durable fallback | auto: `HERDR_ENV`+`HERDR_SOCKET_PATH`+`HERDR_PANE_ID`+`HERDR_WORKSPACE_ID` → herdr; `PI_SUBAGENT_PANE=1` → wezterm; else pipe. Override `PI_SUBAGENT_MUX=herdr\|wezterm\|pipe` |
| **pi-herdr** (`@andrewjacop/pi-herdr`) | Herdr panes via the `herdr` CLI (`agent start --kind pi … -- <args>`); heterogeneous agents (`claude`, `codex`, `omp`, …) | `agent prompt --wait` / `agent wait --until`, `pane.read` screen text; child self-reports state on lifecycle hooks; `herdr:blocked` event-bus channel shared with `pi-ask-user` | Herdr only; version-branched (0.7.3 / 0.7.5 / 0.8.2 / 0.9.0 quirks, Windows `.cmd` shim launch) |
| **pi-herdr-agents** (`giuseppecrj`) | Herdr exclusively (`HERDR_ENV=1` required); extension-owned `Agents` tabs, 4 panes per tab, managed worktrees | child-written activity snapshots + session JSONL + one `subagent_result` custom message; file wake-ups | Herdr only. Publishes a **versioned `pi.events` discovery protocol** (`pi-herdr-subagents:roles:discover:v1`, payload `{ apiVersion, register(path) }`) for third-party role packs |
| **pi-interactive-subagents** (`HazAT`, `@adamjen`) | **cmux / tmux / Zellij / WezTerm** panes; types the launch command into the pane's shell (`PI_SUBAGENT_SHELL_READY_DELAY_MS`) | session JSONL + child-written activity snapshot files; stall watchdog | env markers (`CMUX_SOCKET_PATH`, `TMUX`, `ZELLIJ`, `WEZTERM_UNIX_SOCKET`) + `PI_SUBAGENT_MUX` override (`getMuxBackend`, `pi-extension/subagents/cmux.ts`) |
| **pi-subagentura** (`lmn451`) | **tmux / Zellij / Herdr** panes; **falls back to in-process** when no mux | durable per-turn artifacts + delivery receipts; rehydrates across parent reload/resume | auto + fallback; workflows as `.mjs` scripts |
| pi-subagents, `@tintinweb/pi-subagents`, `@mjakl/pi-subagent`, pi-sub-agent | in-process or pipe child; no attachable pane (fleet views inside Pi) | in-process / pipe | — |
| **Oh-My-Pi `task`** (built in) | child `omp` processes, optional isolated worktrees; sibling messaging over an in-process IRC bus; `--mode rpc` / `rpc-ui` for embedding | schema-validated structured yield | no pane integration found |
| Herdr native (`herdr agent start --kind pi`, `herdr integration install pi`) | Herdr | — | pi is a first-class agent kind upstream |
| Claude Squad, Agent Deck, agent-session-manager | tmux window per agent (CLI-agnostic dashboards, built for Claude Code) | screen | tmux |

Multiplexers in play: **Herdr** (agent-aware, first-class `pi` kind, JSON
socket API — a named pipe on Windows, Windows support is an experimental beta),
**tmux** (Pi ships key-handling guidance in `docs/tmux.md`; `new-window -e`
passes env since 3.0), **WezTerm** (`wezterm cli spawn -- argv`; no `--env`),
**Zellij**, **cmux** (macOS). None of these is going to be "the" answer for
every operator; the pipe stays the only universally available placement.

### Convergent patterns worth adopting

- **Auto-detect by mux-injected env markers, with one override variable.**
  Three independent packages (pi-config, pi-interactive-subagents,
  pi-subagentura) do this; operators already know the shape.
- **Do not type commands into a shell.** pi-config's argv spawn (`layout.apply
  command: [...]`, `wezterm cli spawn -- …`) avoids shell quoting, fish
  incompatibilities and readiness delays that the type-into-shell approach
  needs workarounds for.
- **Job file on argv, not env.** Mux spawns do not reliably inherit the
  caller's environment (WezTerm never does); argv is "the only channel that
  reliably crosses" (pi-config's `subagent-pi.mjs` header).
- **A result channel that survives a TTY** — loopback socket (pi-config) or
  files (pi-interactive-subagents, pi-herdr-agents, pi-subagentura) — never
  screen scraping as the primary channel (pi-herdr's weak spot).
- **Success closes the pane; failure leaves it open, retitled**, for human
  takeover (pi-config D5, pi-herdr-agents).
- **Self-report state to the mux** where an API exists (Herdr
  `pane.report_agent`); herdr's own TUI detection misses `working → idle`.
- **Cap visible children.** pi-herdr-agents groups four panes per tab;
  pi-config caps concurrent async jobs. An unbounded fan-out must not open an
  unbounded number of tabs.

### What is different about pi-theta's child contract

The ecosystem packages launch a *task prompt*; pi-theta launches a *typed
invocation* and depends on more than "the child ran": marshalled params with
the binder bypassed (PIC-60), a `Result`-fidelity envelope (PIC-59), callable
closure hashes for tamper detection, a `--tools` allowlist and trust inference
(PIC-58, `inferChildTrust`), depth accounting (INV-4), the authenticated
control plane, cancellation by kill within PIC-65 budgets, and RFC 0010's
child activity tap. A placement seam must carry all of that unchanged; it is
therefore drawn *below* the contract (placement of an assembled launch), not
*around* it (a different way to run a theta).

## Raw material (verified pins)

- **Launch seam today.** `launchSubagentChild` (`src/runtime/subagent-launcher.ts`)
  resolves the executable through the two-rung `ExecutableHost` ladder,
  assembles argv per `HostCliDialect` (`PI_CLI_DIALECT` / `OMP_CLI_DIALECT`,
  selected by the loaded SDK's `CONFIG_DIR_NAME`), builds the child env
  (`buildSubagentChildEnv`: scrubs inherited `PI_THETA_*`, composes this
  launch's control plane), and calls the injected `SpawnFn(execPath, args,
  {cwd, env})`. The production `SpawnFn` (`createProductionSpawnFn`,
  `src/extension/production-subagent-host.ts`) is `node:child_process.spawn`
  with `stdio: ["ignore", "pipe", "pipe"]`, adapted to `SubagentChildProcess`
  (`onStdoutLine`, `onStderrLine`, `onExit`, `kill` — process-tree kill on
  win32, `SIGKILL` elsewhere, `closeStdin`).
- **Control plane.** `SUBAGENT_CONTROL_PLANE_ENV_KEYS`: the root-regime marker
  `PI_THETA_SUBAGENT_ROOT=<slug>`, params (`PI_THETA_PARAMS` /
  `PI_THETA_PARAMS_FILE`, a 0600 temp file above 8 KiB — PIC-60), callable
  hashes, the marked-root winner path, invoke depth, the parent pid, the
  opt-in extension pin. Authenticated child-side by `authenticateControlPlane`:
  accepted only when `PI_THETA_SUBAGENT_PARENT_PID === process.ppid`, because a
  host may populate the environment from `<cwd>/.env` (Oh-My-Pi) and the
  variables select the regime and name a file to load as an extension.
- **Child-side entry.** `driveSubagentRootRegime`
  (`src/extension/production-theta-producer.ts`) runs inside the child for the
  process-root theta: params intake (PIC-60), model confirmation (PIC-62),
  the drive against the child's own host session, the envelope on every exit
  path (PIC-59). Regime detection: `detectSubagentRootRegime` /
  `selectSubagentDriver` (`src/runtime/subagent-root-regime.ts`).
- **Result.** The child writes one `{"theta_result": …}` JSONL line to fd 1
  (`createProductionEnvelopeWriter`; `writeSync(1, …)` because pi's
  `takeOverStdout()` reroutes the extension-visible `process.stdout.write` to
  stderr in `-p`/`--mode json`). The parent's `driveSubagentChild`
  (`src/runtime/subagent-json-driver.ts`) scans stdout lines for the reserved
  key and ignores every other line; the `theta_progress` reserved-key line
  (PIC-74) and RFC 0010's child tap (`src/extension/execution-status/child-tap.ts`)
  are second consumers of the same stdout pump.
- **Cancellation / teardown.** PIC-66: kill the child (no in-band stop channel
  — stdin is spawned closed, bug 0002). PIC-65: the `finally` awaits exit up
  to `SUBAGENT_DISPOSE_BUDGET_MS = 30000`, then kills.
- **`subagent fn` today.** `#spawnSubagentFnSession`
  (`production-theta-producer.ts`) pushes an INV-4 `subagent-fn` frame, then
  drives the body in-process against an `OffSessionQueryModel` — a private
  `complete()` tool loop over the theta's callable set (`freePhaseTools:
  callableSetPresentedTools`, dispatch via `#resolvePiToolForTheta`), typed
  queries terminated by the shared off-session forced respond dispatch. Its
  code-side extension-tool calls route to the producer-wide `hostLoopDispatch`
  seam and land in the **process's backing session** (FN-6). FN-7's `with`
  values obey the like-named frontmatter field's literal shape (`WithValue`,
  `grammar.md`), and `with { tools }` resolves against the calling theta's
  callable set (FN-9). RFC 0009 Errata A/A′ reject a call-site `with { cwd }`
  on a `subagent fn` call *because* "no child process exists".
- **Discovery of settings.** `src/discovery/settings.ts` reads `thetaPaths` and
  the `theta.*` scalars (`binderModel`, `progress`, `scanPackages*`) from the
  global and project `settings.json` with Pi's precedence; malformed values
  draw `theta/load/settings-invalid-entry` / `settings-value-out-of-range`.
- **Inter-extension bus.** `pi.events: EventBus` (`emit(channel, data)`,
  `on(channel, handler) → unsubscribe`) — Pi ≥ 0.34.0, documented in
  `docs/extensions.md`; Oh-My-Pi threads an `EventBus` into `loadExtensions`
  (its `legacy-pi-coding-agent-shim.ts`). Not in pi-theta's probed inventory
  today (`FACTORY_PROBED_SDK_MEMBERS`, `src/extension/capability-probe.ts`).
- **Interactive mode accepts an initial message.** `pi [options] [--]
  [@files...] [messages...]`; `--name <name>` sets the session display name;
  `pi install <source>` installs a package (`pi --help`, 0.85.1).
- **Spawn cost (rough proxies, this machine, not a benchmark).** `pi
  --version` ≈ 0.32–0.34 s (bundle load); `pi --list-models` ≈ 1.5 s (config
  load). A real child adds extension discovery and theta discovery/parse; 2–4
  s per child is the working assumption.

### Where subagent conversations run today

| Surface | Where it runs | Why |
|---|---|---|
| Prompt-mode theta (slash-dispatched) | in-process; drives the **user's** live session via `pi.sendUserMessage` | it *is* the user's session — not a subagent, cannot be relocated |
| `mode: subagent` `.theta` callee — slash-dispatched, `invoke(...)`, `tools:` `.theta` callable, `par for` body calls | **child `pi` process** (`--theta … --mode json -p "/<slug>" --no-session …`), RFC 0006 | needs a host session with an agent loop for extension-tool reach (PIC-64) |
| Inline `subagent fn` body (RFC 0001) | in-process, off-session (`OffSessionQueryModel`) | "an inline body with no `.theta` file / slug to launch as `-p "/<slug>"`" — the gap §10 closes |

## Proposal

### 1. The placement seam

Replace the injectable `SpawnFn` with a **placement backend** at the same
site (`launchSubagentChild`'s `deps.spawn` becomes `deps.placement`):

```ts
// src/runtime/subagent-placement.ts (sketch)
interface SubagentPlacementRequest {
  readonly execPath: string;          // resolved by the executable ladder, unchanged
  readonly args: readonly string[];   // assembled by assembleSubagentArgv, unchanged (+ --theta-launch, §2)
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>; // the composed child env (§2: control plane also in the launch file)
  readonly label: string;             // "<slug>" or "<slug>#<fn>" (+ short invocation id) for tab titles / --name
  readonly presentation: "headless" | "visible"; // §6; drives argv shape (§7)
  readonly launchFile: string;        // parent-private launch file path (§2)
  readonly context: { readonly invokeDepth: number; readonly parallel: boolean };
}
interface PlacedChild {
  readonly handle: string;            // opaque: pid, pane id, … — display and kill target only
  readonly capabilities: {
    readonly observesExit: boolean;   // false ⇒ exit is synthesised from the result channel (§3)
    readonly inheritsEnv: boolean;    // false ⇒ operator is told credentials must come from disk
    readonly visible: boolean;        // a human can see/attach to the child
    readonly persistSession?: boolean; // omit --no-session so the operator can /resume the child
  };
  onExit(listener: (info: ChildExitInfo) => void): void;   // no-op when !observesExit
  kill(): void;                       // pane.close / kill-pane / process-tree kill
}
interface SubagentPlacementBackend {
  readonly name: string;              // ^[a-z][a-z0-9-]{0,31}$ ; "pipe", "exec", "auto" reserved
  readonly priority: number;          // auto-selection order among detected backends (higher first)
  detect(): boolean;                  // cheap, synchronous, env-marker based; never spawns
  place(request: SubagentPlacementRequest): Promise<PlacedChild>;
}
```

`pipe` is the built-in backend that wraps today's `createProductionSpawnFn`
verbatim: `observesExit: true`, `inheritsEnv: true`, `visible: false`, result
on stdout, control plane in env, ppid authentication — **no behavioural
change** when it is selected, and it is selected by default.

Everything above the seam is untouched: executable resolution, argv assembly
per host dialect, `--tools`/`--no-tools`, trust inference, model marshalling,
params marshalling, closure hashes, depth carriage, the envelope schema, the
JSON driver's `Ok`/`Err` mapping, PIC-65 budgets.

### 2. Launch file — the control plane off inherited environment

For a non-`pipe` placement the parent writes a **launch file** before
`place()`: a JSON document in a parent-private `0700` temp directory, mode
`0600`, unpredictable name, containing every control-plane value the child
env would have carried (`SUBAGENT_CONTROL_PLANE_ENV_KEYS`, the params or
params-file path, the callable-hash map, the root-winner path, depth) plus the
result-channel coordinates (§3), the `presentation`, the **entry** (§10) and a
per-launch **nonce**. Its path travels on **argv** as a pi-theta-registered
flag, `--theta-launch <path>` (the `--theta` flag's sibling; `pi.registerFlag`
in the factory body, read child-side with `pi.getFlag`).

Child-side, `detectSubagentRootRegime` gains a second source: a launch file
named on argv is read **once and deleted**, and its contents replace the env
carriage for this process. Authentication changes shape, not strength: the
ppid check defeated a `.env`-planted environment because a file written ahead
of time cannot state a per-run pid; a launch file defeats it because `.env`
cannot author argv, the file is parent-private, and its nonce is consumed on
first read. An argv path that does not exist, is not owned by the current
user, or fails to parse is treated exactly as a failed ppid check is today:
the control plane is dropped, the process runs as an ordinary top-level pi,
and the parent observes exit-without-envelope. No new code is minted for it.

Under `pipe` no launch file exists: the env carriage stays as it is, and a fn
entry (§10) rides it as one more authenticated control-plane key,
`PI_THETA_SUBAGENT_ENTRY` (§Resolved questions, item 4).

### 3. Result channel — off stdout for non-`pipe` placements

Before `place()`, the parent opens a **loopback TCP listener** on an ephemeral
port bound to `127.0.0.1` and records `{ port, token }` in the launch file.
The child's envelope writer (`createProductionEnvelopeWriter`) and the
`theta_progress` child-regime emitter gain a second sink: when the launch file
names a channel, they connect once, send a `hello` frame carrying the token,
then write the **same reserved-key lines they write to fd 1 today** as NDJSON
frames, plus two frames that have no stdout equivalent:

- `heartbeat` every 10 s while the invocation is live (the parent's liveness
  source when the backend cannot observe exit);
- `stderr` — a bounded mirror of the child's stderr lines (crash detail that
  used to arrive on the pipe).

The parent's drive loop is unchanged in shape: `driveSubagentChild` consumes a
line source; today that source is `onStdoutLine`, under a channel it is the
socket's frame stream filtered to reserved-key lines. Exit is synthesised when
`observesExit` is false: the invocation settles on the envelope frame (success
or `Err`) or on socket close / heartbeat silence past the existing dispose
budget (mapped through `mapExitWithoutEnvelope`, no new code). The token
proves the connection belongs to this launch (pi-config's hello-token
pattern); a second connection is dropped.

The channel is also the seat for a future **inbound** `abort` frame — an
in-band stop the pipe contract lacks (PIC-66) — but v1 keeps kill as the sole
cancellation mechanism (§Open questions, item 3).

Why TCP rather than a file: the frames are line-oriented and real-time
(progress lines are rate-clamped to 200 ms), Windows file tailing and cross-
process locking are the fragile half of every file-based design in the
survey, and pi-config's socket has run in production since 2026-08. Why not
only TCP (retiring the stdout envelope): §Resolved questions, item 5.

### 4. Built-in backends: `pipe` and `exec`

**`pipe`** — §1. Default. Always available.

**`exec`** — an operator-supplied command template that places the child; the
generic adapter for multiplexers with a CLI but no JavaScript API (the tmux
example is under §Operator view):

- `when` (optional): `{ "env": "<VAR>" }` — `auto` considers `exec` only while
  that variable is set (so a tmux template is inert outside tmux). An
  explicit `"exec"` selection ignores `when`.
- `spawn`: argv template. Substitutions `{cwd}`, `{label}`, `{argv}` (expands
  in place to `execPath` followed by every argv element — never joined into
  one string; `shell: false`). The command's first stdout line is the
  `handle`; a non-zero exit or empty handle is a spawn failure
  (`theta/runtime/subagent-spawn-failed`, existing code).
- `kill`: argv template with `{handle}`.
- `env` (optional): `"inherit"` asserts the launcher passes the parent
  environment through (tmux `-e`, `zellij run` inheriting the server env);
  default `"none"`.

`exec` declares `observesExit: false`, `inheritsEnv` per the template,
`visible: true`.

**Trust.** `subagentPlacementExec` is honoured from the **global**
`settings.json` only. A project-local value is ignored with
`theta/load/settings-invalid-entry` (existing code, message names the key):
a checked-out repository must not be able to make a theta run an arbitrary
command on the first subagent launch. The selector `theta.subagentPlacement`
may come from either scope.

### 5. Registered backends over `pi.events`

A backend shipped by another extension registers through Pi's shared event
bus under a versioned protocol — the shape pi-herdr-agents already uses for
role packs (`pi-herdr-subagents:roles:discover:v1`):

- **Discover (pi-theta → backends).** At `session_start` and after each
  reload pi-theta emits `pi-theta:subagent-placement:discover:v1` with payload
  `{ apiVersion: 1, register(backend: SubagentPlacementBackend): void }`.
  Listeners call `register` synchronously.
- **Offer (backend → pi-theta).** A backend that loads after pi-theta emits
  `pi-theta:subagent-placement:offer:v1` with `{ apiVersion: 1, backend }`;
  pi-theta subscribes in its factory body. Both directions make registration
  order-independent.
- Every subscription is released on `session_shutdown` (the bus is per
  process; a stale handler from a removed package must not survive `/reload`).
- pi-theta validates the object structurally (name pattern, `priority` a
  finite number, `detect`/`place` functions); a malformed or duplicate
  registration is dropped with `theta/load/subagent-placement-invalid` (W)
  and the remaining backends stand.
- Types are published from the package (`@bitmonk8/pi-theta` ships `src/`);
  the `apiVersion` gates shape changes.

`pi.events` joins the capability inventory as an **optional** member (the
same class as the RFC 0010 UI sinks): absent, the discover/offer channels do
not exist and only `pipe`/`exec` are selectable; nothing refuses to load.

**The Herdr backend** (non-normative sketch; §Packaging for where it lives):
`detect()` = the four `HERDR_*` variables present (pi-config's `herdrEnv`);
`place()` = `herdrRequest("layout.apply", { workspace_id, tab_label: label,
focus: false, root: { type: "pane", command: [execPath, ...args], cwd, env }
})`, handle = `firstPaneId(result.layout.root)`; `kill()` = `pane.close`;
optionally `pane.report_metadata { display_agent: label }` and, on `Err`,
`pane.rename "FAILED <label>"`. Capabilities `{ observesExit: false,
inheritsEnv: true, visible: true }`. The result channel and launch file are
pi-theta's; pi-config's own TCP scaffolding and embedded child are not
involved.

### 6. Selection and policy

`theta.subagentPlacement` (settings, either scope) ∈ `"auto"` (default) |
`"pipe"` | `"exec"` | `<registered name>`; `PI_THETA_SUBAGENT_PLACEMENT` in the
parent's environment overrides settings for one run. This is an operator
knob, deliberately **not** a control-plane variable: it is read by the parent
that launches, not authenticated in the child, and it is inherited so nested
launches follow the operator's choice.

- `auto`: the highest-`priority` registered backend whose `detect()` is
  true; else `exec` if a template is configured and its `when` holds; else
  `pipe`. Ties break by name.
- An explicit choice that is not registered, whose `detect()` is false, or
  (`exec`) has no global template refuses **fail-closed**: every `mode:
  subagent` theta and every theta declaring a `subagent fn` refuses to
  register with `theta/load/subagent-placement-unavailable` (E) naming the
  choice and the fix. No silent degradation to `pipe` — pi-config warns and
  falls through; theta's posture is the loud refusal (RFC 0007's motivation:
  a silently headless child *looks* like it worked).
- **Visible cap.** `theta.subagentPlacementMaxVisible` (default `8`): while
  that many placed children are live, further launches use `pipe`
  regardless of selection. A `par for` over 200 items opens at most 8 tabs.
- **Presentation.** `request.presentation` is `"visible"` when the selected
  backend declares `visible: true`, else `"headless"`. A per-theta or
  per-call author knob is deferred (§Open questions, item 1).
- **Credential guard** (Decision log, D6). A child placed by a backend with
  `inheritsEnv: false` runs with the mux server's environment, so a provider
  credential that exists only in the parent's environment never reaches it
  and the child fails its first model call seconds later with an indirect
  provider error. Before `place()`, the launcher reads
  `ctx.modelRegistry.getProviderAuthStatus(<resolved model's provider>)`
  (`AuthStatus.source`, one of `stored | runtime | environment | fallback |
  models_json_key | models_json_command` at the pin); when `source ===
  "environment"` and the selected backend declares `inheritsEnv: false`, the
  launch **uses `pipe` for that child** and emits one `theta-system-note`:
  `theta: placement '<name>' does not carry environment credentials for
  <provider>; running /<callee> headless`. Fail-safe, not fail-closed: the
  theta runs, the operator learns why no tab appeared. Disk-sourced
  credentials (`stored`, OAuth) place normally. If the build pin's
  `AuthStatus` lacks `source`, the guard degrades to the documented caveat
  and the field is recorded as an upstream ask.

### 7. Child-side visible regime

A `"visible"` launch changes the child argv from headless print mode to the
interactive TUI with the slash command as the initial message:

```
headless:  … --mode json -p "/<slug>" --no-session …
visible:   … --name "<label>" [--no-session] "/<slug>"
```

The slug is a bare trailing positional, not preceded by `--`: at the build
pin (`@earendil-works/pi-coding-agent` 0.80.10) `parseArgs` has no `--`
separator arm — `--` is read as an unknown flag and swallows the next
argument as its value — while a positional that starts with neither `-` nor
`@` lands in `parsed.messages` on every version (0.85.1 adds the separator
but does not need it). A slug always starts with `/`, so the bare form is
unambiguous.

The child runtime, on the visible presentation from the launch file:

- writes the envelope to the channel as usual, then on `Ok` calls
  `ctx.shutdown()` (documented: interactive mode defers shutdown until idle),
  so the process exits and the pane closes;
- on `Err` writes the envelope and **does not** shut down — the pane lingers
  with the live session for a human to read or continue (the backend may
  retitle it);
- keeps `--no-session` unless the backend declares `persistSession: true`,
  which omits it and gives the operator a resumable session file. The parent
  never reads the child's session, so theta semantics are unchanged either
  way.

Verification (done at implementation time, against the pin): an
initial-message slash command IS dispatched as an extension command in
interactive mode. `InteractiveMode.run` (`dist/modes/interactive/interactive-mode.js`)
delivers `initialMessage` through `this.session.prompt(...)`, the same
`AgentSession.prompt` the print path uses, whose first branch is
`_tryExecuteExtensionCommand(text)` for `/`-prefixed text. `ctx.shutdown()`
sets `shutdownRequested` and shuts down once the session is idle
(`checkShutdownRequested`). The fallback recorded before verification —
running visible children under `--mode json -p` inside the pane — is not
needed and is not implemented.

The RFC 0010 child tap loses its `--mode json` stream under a visible
placement (stdout is the TTY). It degrades to the heartbeat frames plus a
`placement` field on the execution-status entry — `live in <backend>
<handle>` — the compact-reference rendering pi-config adopted rather than
re-streaming a transcript the operator can already see.

### 8. Cancellation, exit, teardown

- **Cancellation** (PIC-66): `PlacedChild.kill()` replaces the process-tree
  kill; the semantics ("abort → child kill", one-shot listener, synchronous
  throw trapped to `theta/runtime/internal-error`) are unchanged.
- **Teardown** (PIC-65): the `finally` awaits settlement — observed exit when
  `observesExit`, else envelope-or-socket-close — up to
  `SUBAGENT_DISPOSE_BUDGET_MS`, then `kill()`. A visible child that lingers on
  `Err` by design is *settled* (its envelope arrived); lingering is not a
  budget breach and the parent does not kill it.
- **Orphans**: a pane child outlives a crashed parent by construction (the
  mux owns it). This is the same class as PIC-65's recorded-but-unimplemented
  child-side parent-pid watchdog; a visible child is at least *visible* to the
  operator, which the headless orphan never was.

### 9. What does not change

The theta language apart from §10's one widening; frontmatter; the callable
set; PIC-58's `--tools` allowlist and trust inference; PIC-59's envelope
schema and `Result` fidelity; PIC-60 params marshalling; closure hashes; INV-4
depth carriage; the host CLI dialect table; the executable ladder; the JSON
driver's `Ok`/`Err` mapping; every existing diagnostic code; `pipe` behaviour
for `.theta` callees.

### 10. `subagent fn` bodies become child processes

**Entry.** The launch file (§2) carries an `entry`: `{ kind: "theta" }` (the
callee's body, today's behaviour) or `{ kind: "fn", name: "<presented name>"
}`. A `subagent fn` call spawns a child exactly as a `.theta` callable call
does — same executable ladder, same argv (`-p "/<slug>"` names the **calling
theta**, whose file the child re-discovers and re-parses; closure hashes
verify the same bytes), same params channel (the fn's arguments, marshalled
positionally against its declared parameter types), same model marshalling
(`--provider`/`--model` from the enclosing theta's resolved or inherited
model, or the `with { model }` override), same trust inference. Under `pipe`
the entry rides the env control plane beside the root marker — the only
launch-file use `pipe` acquires (§2).

**Child side.** `driveSubagentRootRegime` branches on the entry: for a fn
entry it resolves the named top-level `subagent fn` in the parsed root theta
(a name imported from a `.thetalib` resolves through the theta's own import
machinery, re-export chains included — FN-9), re-derives the FN-7 session
configuration deterministically from the same source (`with` values are
literal-shaped, so parent and child compute identical results; `with { tools
}` resolves against the calling theta's callable set as today), binds the
marshalled arguments, runs the body as the process-root invocation against
the child's own host session, and emits the envelope with the body's `Result`
— the same `Ok`/`Err`/internal-error arms as a theta callee. A fn name the
child cannot resolve is a parent/child parse divergence that the closure hash
already rules out; it routes as the envelope's internal-error arm, minting
no code.

**Parent side.** `#spawnSubagentFnSession`'s in-process drive is replaced by
the child launch: the countable INV-4 `subagent-fn` frame is pushed as today
and carried in the depth env, the `ActiveInvocationRegistry` entry, the
execution-status `mode: "subagent-fn"` binding and the cancellation
forwarding are unchanged, and the returned `SubagentFnSession` deps route the
call through `runInvokeChild` exactly as a `.theta` callable call does.
`OffSessionQueryModel` and its forced-respond sibling code paths that exist
only for the in-process body are **removed**, not kept as a fallback
(§Alternatives).

**Semantics preserved (FN-6).** Isolation (a private, discarded conversation
— now a child's `--no-session` session), arguments by value, typed `Result`
return, queries targeting the body's own conversation, the depth-32 ceiling,
`prompt → subagent` callability (FN-8). Two consequences are improvements
the spec text must absorb:

- FN-6's clause that a body's code-side extension-tool dispatch "lands in the
  process's backing host session … the user's live session in the parent" is
  retired: it lands in the child's private session. PIC-64's *Accepted cost*
  paragraph loses its prompt-mode `subagent fn` arm.
- The body's model-facing loop runs in a host session with natively
  registered extension tools and the `--tools` allowlist (PIC-58), instead of
  the off-session `complete()` loop.

**Language-surface consequence (RFC 0009 Erratum B).** Errata A/A′ rejected
a call-site `with { cwd }` on a `subagent fn` call on the ground truth that
the body "runs in-process … no child process exists". That ground truth
changes here, so the clause is **admitted** on `subagent fn` calls: the
legal surfaces become the three child-spawning surfaces (`.theta` callable,
`invoke(...)`, `subagent fn` call), `theta/parse/with-clause-in-process-callee`'s
Trigger drops the `subagent fn` arm (plain and imported non-`subagent` `fn`
calls keep it), and INV-8's classification consults `fn` kind for this one
case — the `subagent` modifier is a declaration-site fact the static pass
already has. The `cwd` semantics are RFC 0009's unchanged; `step(objective)
with { cwd: tree }` gives inline workers per-iteration worktrees. Widening a
rejection is GOV-15-safe (the rejected programs were not clean loads).

**Cost, stated.** Each `subagent fn` call now pays a process spawn — order of
seconds (§Raw material) — and holds one Node process with a full Pi runtime
while the body runs. `ralph-inline`'s 20-round loop adds roughly 40–80 s of
startup to a run whose model time is minutes; a `par for` of many short
bodies pays it per iteration, bounded by `max parallel` and the visible cap.
This is the price of one execution model and of the pollution fix above; a
warm child pool is the mitigation if it ever matters (§Open questions, item
7). Live tests that exercise `subagent fn` become real spawns.

## Packaging — where the Herdr backend lives

*Decision (D5):* a **companion package**, `@bitmonk8/pi-theta-herdr`, that
owns the Herdr client factored out of pi-config's verified transport code
(`herdrEnv`, `herdrRequest`, `firstPaneId`, the `layout.apply` /
`pane.close` / `pane.rename` calls), depends on nothing but `node:net`, and
registers the theta placement backend over §5. pi-config **imports that
client back** for its own model-facing subagent tool, so one Herdr client
serves both consumers and the version quirks are fixed in one place. The
package versions independently against the registration protocol's
`apiVersion`.

Why not inside pi-theta: (a) Herdr is a moving target with version-specific
quirks (pi-herdr branches on four Herdr versions; Windows is an upstream
beta), and pi-theta's Pi-bump discipline should not acquire a second host to
track; (b) a live Herdr test cannot live in pi-theta's `test:live` suite —
`AGENTS.md` forbids silent skipping, and failing loudly on every machine
without Herdr is not acceptable either — so the Herdr suite must own its own
prerequisite; (c) every operator who is not on Herdr pays nothing. Why not
inside pi-config only: other Herdr users (the operator population that
motivated this RFC) need a `pi install`-able artefact, and pi-config is one
person's configuration. The same reasoning applies to a future
`pi-theta-wezterm` or `pi-theta-zellij`; `exec` is the no-package path.

*Import path for a companion.* The seam's types are exported from
`@bitmonk8/pi-theta/src/runtime/subagent-placement` — `SubagentPlacementBackend`,
`PlacedChild`, `SubagentPlacementRequest`, `PlacedChildCapabilities`,
`SubagentPlacementPresentation`, `SubagentLaunchEntry`, plus the
`validatePlacementBackend` structural check and the `PLACEMENT_NAME_PATTERN` /
`RESERVED_PLACEMENT_NAMES` constants a backend can pre-validate against. The
registration protocol's constants live in
`@bitmonk8/pi-theta/src/runtime/subagent-placement-registry` —
`PLACEMENT_DISCOVER_CHANNEL` (`pi-theta:subagent-placement:discover:v1`),
`PLACEMENT_OFFER_CHANNEL` (`pi-theta:subagent-placement:offer:v1`),
`PLACEMENT_REGISTRATION_API_VERSION` (`1`). A companion subscribes to the
discover channel in its own factory body and answers each discover event with
one `{ apiVersion, backend }` offer (§5).

## Alternatives considered

- **Ship Herdr (and tmux, WezTerm, …) backends inside pi-theta.** Rejected
  (§Packaging). pi-theta ships the seam and two host-agnostic backends.
- **Extension-provided backend via a well-known global** (`globalThis[Symbol.for(...)]`).
  Rejected: contradicts the repository's no-globals posture (EXST-2) and Pi
  offers a documented bus for exactly this.
- **Settings-named module path pi-theta `import()`s** (`theta.subagentPlacement:
  "./herdr-placement.ts"`). Viable but a second plugin mechanism beside Pi's
  extension system, with its own loading/TS-transpile and trust questions.
  Kept as a possible later addition; the event-bus protocol covers the
  known consumers.
- **Type the command into a pane's shell** (pi-interactive-subagents). Rejected:
  shell quoting, fish/PowerShell differences, readiness delays; argv spawn is
  available on every target mux (`layout.apply`, `wezterm cli spawn --`,
  `tmux new-window cmd…`, `zellij run --`).
- **Keep env carriage and widen ppid authentication to any ancestor.**
  Rejected: the mux server is the parent and process-tree walks are
  expensive and unreliable on Windows; the launch file on argv is simpler and
  stronger.
- **Result channel as a spool file** instead of TCP. Set aside for v1 (§3);
  file durability across a parent restart is the one property it wins, and
  pi-theta does not reconcile children across parent restarts (pi-config's
  ledger does; that is a different feature).
- **Keep `subagent fn` in-process as a fallback** when no child can be
  spawned (pi-subagentura's pattern). Rejected: two semantics for one
  construct, and "no child can be spawned" is already a fail-closed load
  refusal for `.theta` callees (`theta/load/subagent-executable-unresolved`);
  fn bodies join that rule.
- **Keep `subagent fn` in-process, defer the move to a follow-on RFC.**
  Rejected by the operator: with the fn body left in-process the RFC's
  placement claim would hold for every subagent conversation but one, and
  the prompt-mode pollution fix would be deferred with it.
- **Per-call `with { placement: … }`.** Deferred (§Open questions, item 1):
  placement is an operator concern; author intent about visibility is a
  distinct, smaller knob that should not name a mux.
- **Make the theta model choose** (a `theta_place` tool). Rejected outright:
  placement is not a model decision.

## Resolved questions

1. **Placement below the contract, not around it.** *Decision:* the backend
   receives an assembled launch (executable, argv, cwd, env, label) and
   returns a handle; it never sees params, the envelope, or the theta. This
   is what keeps §9's list true and lets a backend be ~100 lines.
2. **Where mux-specific code lives.** *Decision:* companion packages
   (§Packaging), registered over `pi.events`. pi-theta ships `pipe` and
   `exec` only.
3. **Selection is fail-closed.** *Decision:* an explicit unavailable choice
   refuses at load (E). `auto` never refuses.
4. **Launch file only for non-`pipe` (plus the fn entry).** *Decision for
   v1:* `pipe` keeps env carriage + ppid authentication byte-for-byte for
   `.theta` callees (bugs 0002, 0474 and their tests stay load-bearing); a
   fn entry rides the env control plane under `pipe`. Converging `pipe` onto
   the launch file is a possible v2 simplification (§Open questions, item 4).
5. **Stdout envelope retained under `pipe`.** *Decision:* the channel is
   additive; a `pipe` child writes stdout exactly as today. One code path for
   both would be cleaner, but the stdout contract is pinned by PIC-59, PIC-74,
   the child tap and the live acceptance suite; changing it is not this RFC's
   payoff.
6. **`exec` templates are global-settings-only.** *Decision:* §4 Trust.
7. **Visible cap default 8.** *Decision:* matches pi-config's async cap;
   configurable.
8. **`subagent fn` moves into the child architecture in this RFC, and the
   in-process path is removed — not kept as a fallback.** *Decision (D4):*
   §10. One execution model per construct; a fallback would reintroduce the
   prompt-mode pollution path the move closes.
9. **`with { cwd }` admitted on `subagent fn` calls.** *Decision (D3):* §10
   — the rejection's stated reason no longer holds, and inline workers are
   the worktree fan-out's natural unit. Recorded against RFC 0009 as Erratum
   B.
10. **Companion package, with pi-config importing its Herdr client.**
    *Decision (D5):* §Packaging; name `@bitmonk8/pi-theta-herdr` confirmed.
11. **Credentials under `inheritsEnv: false`.** *Decision (D6):* fall back to
    `pipe` for the affected child with one system note, keyed on
    `getProviderAuthStatus(...).source === "environment"` (§6 *Credential
    guard*); document-only if the pin cannot report the source.
12. **Sequencing with RFC 0011.** *Decision (D2, recorded there):* this RFC
    lands first; RFC 0011 then admits its session-control tools inside
    `subagent fn` bodies, because §10 gives each body its own child session.

## Open questions

1. **Author-facing visibility intent.** Should a theta (frontmatter
   `placement: visible | headless`) or a call site (`with { visible: true }`)
   be able to ask for a visible child — e.g. an interactive planner — or to
   force headless for a tight fan-out? If so, it must be a *hint* the
   operator's selection can ignore, never a mux name.
2. **`exec` handle semantics for launchers that exit immediately** (tmux
   `new-window -d` returns at once). v1 relies on the result channel for
   settlement; should `exec` also accept an optional `alive` template
   (`["tmux","has-session"…]`) for liveness probing?
3. **Inbound abort frame.** The channel could carry `{"type":"abort"}` so a
   visible child cancels gracefully (restores its active set, runs
   `finally`s) before the backstop kill. Needs PIC-66 amendment; deferred.
4. **Converge `pipe` onto the launch file** and retire env carriage + ppid
   authentication (one control-plane mechanism). Simplification with a
   migration cost across the bug-0002/0474 test corpus.
5. **Herdr self-report from the theta child.** Should the child, when
   `HERDR_PANE_ID` is present, `pane.report_agent` its own lifecycle
   (pi-config found herdr's TUI detection misses `working → idle`)? That
   puts Herdr-specific code inside pi-theta, contra Resolved question 2 —
   the alternative is the companion backend polling the channel's heartbeat
   and reporting on the child's behalf.
6. **Warm child pool.** If per-call spawn latency for `subagent fn` bodies
   proves material, a pre-spawned idle child that waits for a launch file
   would amortise startup. Not proposed; recorded as the mitigation.

Items 1–5 are open in the sense that implementation proceeds on the stated
default (no author knob; no `alive` template; kill as the sole cancellation;
env carriage under `pipe`; backend-side Herdr reporting) and the question is
revisited on evidence. None needs a decision before implementation starts.

## Decision log

Operator decisions taken 2026-09-15 on the questions this draft left open or
had resolved provisionally; each is folded into the section it names.

- **D2 — Sequencing: this RFC first.** RFC 0011 follows and admits its tools
  inside `subagent fn` bodies (Resolved question 12).
- **D3 — Erratum B confirmed.** `with { cwd }` admitted on `subagent fn`
  calls (Resolved question 9).
- **D4 — Remove the in-process `subagent fn` path; no fallback** (Resolved
  question 8).
- **D5 — Packaging: companion `@bitmonk8/pi-theta-herdr`; pi-config imports
  its Herdr client** (Resolved question 10, §Packaging).
- **D6 — Credential guard: fall back to `pipe` with a system note** when the
  backend does not inherit env and the provider's credential is env-sourced
  (Resolved question 11, §6; the former Open question 6).

## New diagnostics

Two new `theta/load/*` codes; **zero** new runtime codes (DIAG-2): spawn
failures reuse `theta/runtime/subagent-spawn-failed`, settlement failures
reuse the envelope-failure mappings (`mapExitWithoutEnvelope` and siblings),
settings-shape failures reuse `theta/load/settings-invalid-entry` /
`settings-value-out-of-range`, fn-entry resolution failures reuse the
envelope's internal-error arm. One existing parse row's Trigger is edited
(§10).

| Code | Sev | Phase | Trigger | Spec rule | Hint | Message |
|---|---|---|---|---|---|---|
| `theta/load/subagent-placement-unavailable` | E | load | `theta.subagentPlacement` (or `PI_THETA_SUBAGENT_PLACEMENT`) names a placement that is not selectable: not a registered backend name, a registered backend whose `detect()` is false, or `exec` with no global `subagentPlacementExec` template. Every `mode: subagent` theta and every theta declaring a `subagent fn` refuses to register; other prompt-mode thetas are unaffected. `auto` never fires this. | [Subagent — launch contract](../spec_topics/pi-integration-contract/subagent.md#subagent-launch-contract) (placement paragraph) | Set `theta.subagentPlacement` to `auto`, `pipe`, or a backend that is loaded and detected; for `exec`, add the template to the global settings file. | `subagent placement '<name>' is unavailable: <reason>` |
| `theta/load/subagent-placement-invalid` | W | load | A backend offered over `pi.events` fails structural validation (name outside `^[a-z][a-z0-9-]{0,31}$` or reserved, non-finite `priority`, `detect`/`place` not functions) or duplicates a registered name. The registration is dropped; other backends stand. | same | Fix the registering extension; the offer payload shape is `{ apiVersion: 1, backend }`. | `ignoring subagent placement registration '<name>': <reason>` |

Edited row: `theta/parse/with-clause-in-process-callee` — Trigger now names
the three legal clause-bearing surfaces (a `.theta`-callable call through
`tools:`, `invoke(...)` / `invoke<T>(...)`, a `subagent fn` call) and keeps the
plain / imported non-`subagent` `fn` and the `.thetalib`-body arms; message
unchanged.

## Specification impact

| Surface | Anchor | Change |
|---|---|---|
| `docs/spec_topics/pi-integration-contract/subagent.md` | [`#subagent-launch-contract`](../spec_topics/pi-integration-contract/subagent.md#subagent-launch-contract) | New *Placement* paragraph: the backend seam, `pipe` as the authored default, `exec`, registered backends, selection, the visible cap; the argv shape gains `--theta-launch <path>` and the visible-presentation form; the launch contract admits a fn entry. |
| same | [`#subagent-control-plane-authentication`](../spec_topics/pi-integration-contract/subagent.md#subagent-control-plane-authentication) | Second carriage: the launch file on argv (read-once, parent-private, nonce); the ppid rule is scoped to env carriage. |
| same | [PIC-58](../spec_topics/pi-integration-contract/subagent.md#pic-58), [PIC-60](../spec_topics/pi-integration-contract/subagent.md#pic-60) | The subagent-root regime runs either the root theta body or a named `subagent fn`; params marshalling covers fn arguments. |
| same | [PIC-59](../spec_topics/pi-integration-contract/subagent.md#pic-59), [PIC-74](../spec_topics/pi-integration-contract/subagent.md#pic-74) | The reserved-key lines gain a second sink (the loopback channel) under non-`pipe` placement; `heartbeat` and `stderr` frames exist only on the channel; the stdout contract is unchanged under `pipe`. |
| same | [PIC-64](../spec_topics/pi-integration-contract/subagent.md#pic-64) | *Accepted cost* loses its prompt-mode `subagent fn` arm; the inline-body context paragraph is rewritten (bodies run in their own child). |
| same | [PIC-65](../spec_topics/pi-integration-contract/subagent.md#pic-65), [PIC-66](../spec_topics/pi-integration-contract/subagent.md#pic-66) | Settlement = observed exit or channel settlement; `kill()` through the backend; a lingering `Err` child is settled, not overdue. |
| same | [`#subagent-host-cli-dialect`](../spec_topics/pi-integration-contract/subagent.md#subagent-host-cli-dialect) | The visible-presentation argv (`--name`, initial message) per dialect; `ctx.shutdown()` on `Ok`. |
| `docs/spec_topics/functions.md` | [FN-6](../spec_topics/functions.md#fn-6), [FN-7](../spec_topics/functions.md#fn-7), [FN-9](../spec_topics/functions.md#fn-9) | Body runs in a spawned child `pi` process; the extension-tool-dispatch clause retired; `with` re-derived child-side; library helpers resolve in the child through the importing theta. |
| `docs/spec_topics/invocation.md` | [Options surface / INV-8](../spec_topics/invocation.md#options-surface) | `subagent fn` calls join the clause-bearing surfaces (Erratum B). |
| `docs/spec_topics/grammar.md` | [Call-site `with` clause](../spec_topics/grammar.md#call-site-with-clause) | The "two clause-bearing surfaces" sentence becomes three. |
| `docs/spec_topics/diagnostics/code-registry-parse.md` | `theta/parse/with-clause-in-process-callee` | Trigger edit (§New diagnostics). |
| `docs/spec_topics/pi-integration-contract/capability-probe.md`, `capability-inventory-items.md` | optional-capability class | `pi.events` as an optional member; `pi.registerFlag("theta-launch")` beside `--theta`. |
| `docs/spec_topics/discovery/package-and-settings.md` | settings keys | `theta.subagentPlacement`, `theta.subagentPlacementExec` (global-only), `theta.subagentPlacementMaxVisible`; validation rows. |
| `docs/spec_topics/execution-status.md` | EXST-5 child tap | Degradation under visible placement; `placement` field; heartbeat as the liveness source; the `subagent-fn` binding is now a child. |
| `docs/spec_topics/implementation-notes.md` | Runtime | `OffSessionQueryModel` removed from the typed-query mechanics description. |
| `docs/spec_topics/diagnostics/code-registry-load.md` | table | Two new rows. |
| `docs/reference/discovery-cli.md`, `docs/reference/frontmatter.md`, `docs/reference/grammar.md` | settings; CLI flags; `with` clause | Mirror the keys, the `--theta-launch` flag (marked internal: written by the parent, never by an operator), and the widened clause surface. |
| `docs/how-to/place-subagents-in-a-multiplexer.md` (+ `README.md`) | new page | The §Operator view recipes, the visible cap, the credentials caveat. |
| `docs/examples/ralph-inline.theta` and its how-to | — | Comment update: each round is a child process; latency note. |
| `docs/spec_topics/pi-integration-contract/runtime-event-channel.md` | system-note templates | One new `theta-system-note` template for the credential-guard fallback (§6); existing channel, no new diagnostic code. |
| `docs/spec_topics/pi-integration-contract/host-interfaces-core.md` | [model-registry surface](../spec_topics/pi-integration-contract/host-interfaces-core.md#model-registry-pin) | `getProviderAuthStatus(provider): AuthStatus` joins the consumed `ModelRegistry` members; `AuthStatus.source` pinned as a consumption posture (re-audited per Pi bump). |
| `docs/rfcs/0001-subagent-fn.md`, `0009-per-call-subagent-cwd.md` (Erratum B), `0006-…`, `0010-…`, `0011-session-control-tools.md` (sequencing, D2) | — | Cross-notes. |
| pi-config `docs/reference/herdr-mux-transport.md`, `extensions/subagent/` | Phase 2 | The Herdr client moves to `@bitmonk8/pi-theta-herdr` and pi-config imports it (D5; outside this repository). |

## Testing strategy

Offline (default gate, provider-free):

- **Seam:** `launchSubagentChild` with a fake backend — request carries the
  unchanged argv/env/cwd plus label, presentation, launch file, entry; `pipe`
  backend output byte-identical to today's `SpawnFn` path for a theta entry
  (the existing `tests/subagent-child-launch.test.ts` fake-launcher suite
  stays green unmodified).
- **Launch file:** written `0600` in a `0700` dir for non-`pipe`; never for
  `pipe` (a fn entry rides `PI_THETA_SUBAGENT_ENTRY` on the env control plane
  there); child-side read-once-and-delete;
  missing/unowned/unparseable → control plane dropped (same verdict shape as
  a failed ppid check); nonce reuse refused.
- **Channel:** hello-token gate (wrong token → dropped), second connection
  dropped, envelope frame settles the invocation, heartbeat silence past the
  dispose budget → `mapExitWithoutEnvelope`, stderr mirror bounded, `Ok` →
  shutdown request recorded, `Err` → no shutdown.
- **Selection:** `auto` ordering by priority then name; `exec` `when` gate;
  explicit unavailable → `theta/load/subagent-placement-unavailable` on
  `mode: subagent` thetas and `subagent fn`-declaring thetas only;
  project-local `exec` template ignored with the settings code; visible cap →
  the 9th concurrent launch uses `pipe`.
- **Registration:** discover/offer both directions, order-independent;
  malformed offer → `theta/load/subagent-placement-invalid` and dropped;
  unsubscribe on `session_shutdown`; `pi.events` absent → built-ins only,
  no diagnostic.
- **`exec`:** argv substitution (`{argv}` expands to elements, never a joined
  string), handle from first stdout line, non-zero exit → spawn-failed,
  `kill` template invoked with the handle.
- **fn entry:** parser/checker — `with { cwd }` on a `subagent fn` call
  admitted, on a plain/imported `fn` still rejected; launcher — a `subagent
  fn` call produces a launch request with `entry.kind = "fn"`, the calling
  theta's slug, marshalled positional args, and the `with`-overridden model;
  child regime — a fake root resolves the fn, re-derives `with`, runs the
  body, emits the envelope; imported `.thetalib` `subagent fn` resolves;
  unknown fn name → internal-error envelope arm; INV-4 frame and depth
  carriage unchanged; the `OffSessionQueryModel` suites are retired with the
  path.
- **Credential guard (D6):** with a fake registry — `source: "environment"`
  + backend `inheritsEnv: false` → the child is placed by `pipe` and exactly
  one `theta-system-note` with the pinned template is emitted; `source:
  "stored"` → placed by the selected backend, no note; `inheritsEnv: true` →
  placed regardless of `source`; `AuthStatus` without `source` → placed, no
  note (the documented-caveat degradation).
- **SDK inventory:** `pi.events`, `pi.registerFlag`, `pi.getFlag`,
  `ctx.modelRegistry.getProviderAuthStatus` rows.

Live (`npm run test:live`; the launch path is live-exercised, so mandatory):

- **`pipe` regression:** the existing H8a subagent cells unchanged.
- **`subagent fn` as child:** the existing `subagent fn` live cells now spawn;
  assert identical typed return values and a child pid distinct from the
  parent; a prompt-mode theta whose body code-calls an extension tool leaves
  the user session's transcript free of the fabricated turn (the PIC-64
  pollution fix, witnessed on the settled `SessionManager`).
- **Channel end-to-end:** a fake backend that spawns the real child with
  `stdio: "ignore"` for stdout (simulating a TTY) and relies on the channel —
  typed return round-trips, progress line arrives on the channel, cancellation
  kills through the backend. Child pins per `AGENTS.md#subagent-child-pins`.
- **Visible regime:** a real child in interactive mode with an initial slash
  message under a pseudo-TTY (node-pty or the harness's ConPTY path): the
  envelope arrives, the child exits on `Ok`, lingers on `Err`. If the
  initial-message dispatch verification (§7) fails, this cell pins the
  fallback instead.
- **Negative proof:** disable the token check once; confirm the wrong-token
  test reds; restore.

Herdr itself is exercised in the companion package's suite, not here.

## Compatibility and versioning

- **Default behaviour for `.theta` callees unchanged.** `theta.subagentPlacement`
  absent ⇒ `auto` ⇒ no backend registered, no template ⇒ `pipe` ⇒ today's
  launch, byte for byte.
- **`subagent fn` observable semantics unchanged; execution moves.** Return
  values, diagnostic sequences and system notes are preserved (GOV-15's
  observables); wall-clock per call rises by the spawn cost, which is not an
  observable the spec pins. The one language change is a widening (Erratum
  B), GOV-15-safe.
- **Additive contract.** New argv flag only on non-`pipe` launches and fn
  entries; one new env key under `pipe` (the fn entry) inside the scrubbed
  control-plane set; new frames only on the channel.
- **Pi SDK pin unchanged.** `pi.events` ≥ 0.34.0, `registerFlag`/`getFlag`
  already consumed.
- **Oh-My-Pi.** Host-agnostic: dialect selection is unchanged; OMP carries an
  extension `EventBus`; Herdr lists `omp` as an agent kind; `exec` covers
  tmux/Zellij for operators without a JavaScript backend.
- **Windows.** `pipe` keeps the process-tree kill; Herdr is an experimental
  beta upstream (named-pipe socket, ConPTY); WezTerm passes no env
  (`inheritsEnv: false`, §Open questions 6).
- theta's own bump: `package.json` + `CHANGELOG.md`, middle digit. The
  companion package versions independently against the `apiVersion` of the
  registration protocol.

## Implementation record

Landed as steps 0–10 (`951fe7be`…, one commit per step; 0.475.0). Where the
implementation settled a point the text above left open or worded
differently, the spec pages named under §Specification impact are
authoritative and this list records the delta:

1. **No launch file under `pipe`.** A fn entry rides `PI_THETA_SUBAGENT_ENTRY`
   on the authenticated env control plane (`subagent-launcher.ts`
   `SUBAGENT_LAUNCH_ENTRY_ENV`; `subagent-launch-file.ts`
   `readLaunchEntryFromEnv`); the launch file exists for non-`pipe`
   placements only. §2 and §Testing above are corrected to match.
2. **Envelope under a channel goes to the channel only.** When the launch file
   names a channel the child's envelope replaces fd 1 rather than mirroring it
   (PIC-59 / PIC-74, `subagent.md`).
3. **Credential guard note once per `(backend, provider)` per compose pass**
   (`subagent-placement-selection.ts` `createPlacementPolicy`), informational,
   `display: true`, no `details`.
4. **Load-gate reach.** The fail-closed refusal covers `mode: subagent` thetas
   and thetas declaring a top-level `subagent fn`
   (`subagent-placement-selection.ts` `thetaLaunchesChildren`); an imported
   `subagent fn` helper or an `invoke()` callee reached from a prompt-mode
   theta fails at launch as `theta/runtime/subagent-spawn-failed`.
5. **`exec` priority is not load-bearing**; the built-in `auto` order is
   positional (`orderForAuto`).
6. **`theta/load/settings-invalid-entry` for a project-local `exec` template**
   carries its position-specific message in the row's Trigger prose (DIAG-4),
   not a new row.
7. **Backends subscribe to the discover channel in their factory body**
   (`subagent-placement-registry.ts` `bindPlacementRegistration` emits once per
   compose pass).
8. **`fn_tail` envelope sidecar.** An additive, skew-tolerant `fn_tail:
   "ok" | "err"` on the return envelope preserves FN-6's in-process call values
   (`Ok(x)` / `Err(e)` tails versus bare values) across the wire
   (`subagent-envelope.ts` `FnTail`; PIC-59 `#subagent-fn-tail-sidecar`).
9. **Boundary validation of a `subagent fn`.** Arguments are AJV-checked per
   typed parameter at child intake (`production-theta-producer.ts`
   `#driveSubagentFnEntry`); the return is validated and decoded against
   `): T` or the FN-3-inferred type (`#resolveSubagentFnReturnSite`,
   `#validateInvokeReturn`) — a fail-closed arm the in-process drive had no
   need of.
10. **FN-7 `system` is honoured** and rendered against the calling
    invocation's params (`systemParams` on the launch).
11. **Executor hook shape.** `StatementEvalHost.runSubagentFnChild` /
    `EffectfulStatementHostDeps.resolveSubagentFnChild` drive a
    `SubagentFnInvokeChild` through `runInvokeChild` — the pre-spawn invoke
    checkpoint applies at the call site — rather than swapping a
    `SubagentFnSession` dependency.
12. **Lib-side `with { cwd }` on an imported name stays refused** at the
    `.thetalib` parse (`theta-document.ts` `checkThetaLibCallWithClauses`); the
    importing theta's call sites are judged after materialisation
    (`invoke-static-checks.ts` `checkImportedWithClauseCallees`).
13. **PIC-64 e2e dispatch legs for `subagent fn` bodies retired offline**
    (live-exercised now); the two load obligations of
    `tests/subagent-fn-extension-tool-dispatch-e2e.test.ts` stay.
14. **Explicit-selection refusal** also covers an invalid name arriving on
    `PI_THETA_SUBAGENT_PLACEMENT` (the env override is not shape-validated by
    the settings reader) and a registered backend whose `detect()` throws
    (`selectPlacement`).
15. **`OPTIONAL_UI_CAPABILITIES` stays five members**; `pi.events`,
    `ctx.modelRegistry.getProviderAuthStatus` and `ctx.shutdown` are presence
    rows with the same degrade-silent semantics outside the constant
    (`sdk-inventory.ts`; PIC-73).
16. **Untyped in-body query failures classify on-session.** A `subagent fn`
    body's untyped `@`-query is the child's on-session turn, so a
    `stopReason: "error"` is PIC-51's `transport`; the former in-process
    drive's `classifyOffSessionReply` classification of that arm (bug 0182's
    untyped seat) is gone with D4. The forced respond dispatch keeps it, and
    bug 0182's live witness rides that seat
    (`tests/live/off-session-overflow-classification.test.ts`).

## Prior art in this repository

- RFC 0001 — `subagent fn`: by-value arguments, no lexical capture, FN-7
  configuration; the properties that make §10 a relocation rather than a
  redesign.
- RFC 0005 / RFC 0006 — the child-process architecture; this RFC relocates
  its launch without changing its contract and completes its coverage.
- RFC 0007 — the `pi -p` exit-0-on-failure hazard, the reason selection is
  fail-closed rather than degrade-with-warning.
- RFC 0009 — the call-site `with` clause and Errata A/A′, amended here.
- RFC 0010 — execution-status sinks and the child tap that degrade under a
  visible placement.
- Bug 0002 (stdin EOF deadlock; extension pin), bug 0474 (control-plane
  scrubbing), bug 0218 (`--tools` names) — the launch invariants the `pipe`
  backend preserves verbatim.
- `authenticateControlPlane` (`src/extension/production-subagent-host.ts`) —
  the threat model the launch file must meet.
- PIC-60's 0600 temp-file params channel — the precedent for a parent-private
  file the child reads and deletes.

## Sources

- pi-config: `extensions/subagent/index.ts` (`selectTransport`, `runOnStdout`,
  `runInPane`, `runInHerdr`, `herdrRequest`, `herdrEnv`, `firstPaneId`,
  `ChildTransport`), `extensions/subagent/subagent-pi.mjs`,
  `docs/reference/herdr-mux-transport.md`.
- Pi 0.85.1: `dist/core/agent-session.js` (`_bindExtensionCore`),
  `dist/core/event-bus.d.ts`, `docs/extensions.md` (`pi.events`),
  `docs/rpc.md`, `docs/tmux.md`, `examples/extensions/subagent/index.ts`,
  `examples/extensions/event-bus.ts`, `pi --help`.
- `@andrewjacop/pi-herdr` README (pi.dev); `pi-herdr-agents` README (pi.dev;
  `pi-herdr-subagents:roles:discover:v1`); `HazAT/pi-interactive-subagents`
  (`pi-extension/subagents/cmux.ts`, `getMuxBackend`); `pi-subagentura`
  README (pi.dev); `can1357/oh-my-pi` README and
  `packages/coding-agent/src/extensibility/legacy-pi-coding-agent-shim.ts`.
- Herdr: `herdr.dev/docs/agents`, pi-config's verified API cheat sheet
  (`layout.apply`, `pane.close`, `pane.report_agent`, injected `HERDR_*` env).
