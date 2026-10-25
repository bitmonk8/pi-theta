# Codex 0.163.0: shared-daemon / existing-TUI adversarial audit

> **Developer research, not end-user documentation or an accepted specification.**
> Relocated from `.pi/tmp/dual-host-research/codex/daemon-audit/report.md`. Historical release/source pins and evidence limitations remain in force.
> Unless a link points to another tracked document, experiment paths and reproduction instructions refer to the original local evidence workspace, `.pi/tmp/dual-host-research/codex/daemon-audit/`; downloads, caches, scripts and raw logs remain gitignored and are not required to read this report.

## Pin and method

Source-only audit of supplied release source `codex-rust-v0.163.0`, commit **83086188ae0614bd882818ff1aa23f3194962012**. No daemon, CLI, credential access, live model, installation, or configuration mutation performed. No downloads. All references below are relative to that source's `codex-rs/`; full source root is `/home/thomasa/Projects/pi-theta/.pi/tmp/dual-host-research/codex/api-audit/source/codex-rust-v0.163.0/`. Findings are static source facts unless explicitly called inference or unknown. This is not runtime certification of a particular operator TUI.

## Verdict

**An important counterexample to “Codex can only launch separate workers” exists:** when a stock TUI is connected to the shared daemon, a second ordinary app-server client can rejoin the **same loaded thread**, receive its correlated events, and submit actual turn input. That is materially stronger than an external launcher, and does not require an LLM to interpret Theta. A deterministic Theta interpreter could drive the API externally.

**It is not equivalent to a native current-session extension API.** The second client gets a shared thread, not ownership of the TUI, its composer, slash dispatcher, approval UI, or the user's next turn. No audited client lease/exclusive-turn protocol, custom deterministic slash registration, or running-thread dynamic-tool mutation API was found. A robust driver must be classified **same-thread sidecar orchestration**, with a cooperative-user limitation; a custom frontend/proxy owning input is a different and stronger deployment. Hooks provide a narrower but real native deterministic continuation mechanism; see the counterexample below rather than dismissing hooks as mere notifications.

| Requirement | Released-source result |
|---|---|
| Inject into same existing TUI conversation | **Yes, conditional:** same daemon + explicit target thread ID + ordinary rejoin/input permission. Not merely resume into a duplicate process. |
| Deterministic multi-query execution | **Feasible sidecar inference:** interpreter sends actual turn requests, waits for correlated completion, computes next request. Shared human input can break the one-query/one-turn mapping. |
| Real local custom deterministic `/theta` registration | **Not found in stock plugin/TUI interface.** Built-in dispatcher is static; hook interception is not registration. |
| Correlated events | **Yes:** thread and turn IDs; resume atomically joins stream with history. Not a private Theta-only event stream. |
| Seize/exclusively own a sequence of turns | **No audited mechanism.** `turn/start` can steer an existing turn, rather than acquiring or rejecting based on another client owner. |
| Add/change dynamic tools in already-running TUI thread | **No audited mutation API.** Experimental `dynamicTools` is a thread-start field; resume rejoins existing runtime. |
| Route approvals only to initiating sidecar | **No generally.** Ordinary requests fan out among subscribers; first response consumes shared callback. User verification is explicitly different and owner-bound. |
| Automatically follow TUI `/new`, fork, switch, disconnect | **Not automatic.** Thread identity and TUI display identity are distinct; reconnection and uncertain submissions need reconciliation. |

## 1. The control socket is a genuine app-server transport, not just status/shutdown

- `app-server-daemon/src/client.rs:63–75`: connects Unix stream and upgrades with WebSocket `client_async("ws://localhost/")`; `100–140` sends normal JSON-RPC `initialize`, with optional experimental capability. `145–173` sends/reads ordinary JSON-RPC text frames.
- `app-server-transport/src/transport/unix_socket.rs:133–215`: accepted streams upgrade to WebSocket; only `/daemon/shutdown` is special, otherwise they enter `run_websocket_connection`. Thus the word “control” does **not** imply a restricted daemon-management-only API.
- `cli/src/main.rs:1400–1409`: `codex app-server proxy [--sock …]` resolves this control socket and calls `codex_stdio_to_uds::run`. This is a transport bridge to the existing daemon, **not** a native extension or a new isolated SDK worker. It is a straightforward possible transport for a sidecar; no need to invent a daemon API.
- `tui/src/lib.rs:1029–1054`: target selection can reuse implicit local daemon; an explicit endpoint selects remote. `558–611`: failed implicit local-daemon connection can fall back to an **embedded** app-server when fallback is permitted. Therefore “running stock Codex TUI” alone is not proof that its current thread lives in the shared daemon. `--no-daemon` and embedded fallback are concrete counterexamples to unconditional socket attachment.
- `tui/src/lib.rs:458–495`: explicit `--remote` addresses accept WebSocket and Unix endpoints. A TUI attached to a different remote server cannot be controlled by attaching to the local default daemon.

**Security boundary:** `app-server-transport/src/transport/unix_socket.rs:31,43–115,433–449` sets socket mode `0600` (Unix), uses private/protected path handling and startup publication guards. `133–215` does not do a per-app capability negotiation that makes one local subscriber a read-only observer. The ordinary local boundary is access to the user's private socket, not separation of mutually untrusted applications of that user. Network WebSocket authentication is separately enforced in `transport/websocket.rs:107–119,133–139`; do not transfer assumptions about a local socket to arbitrary remote endpoints. This audit makes no Windows ACL certification.

## 2. Same loaded conversation is supported, not inferred from SDK resume naming

`app-server/src/request_processors/thread_processor.rs:4500–4550` explicitly finds the already-loaded `CodexThread` through the daemon's shared `thread_manager`. It rejects supplying replacement `history` while the thread is already running (`4510–4518`). This is strong evidence for joining the same runtime, not silently loading a second independent agent against the same JSONL.

`thread_state.rs:64–67` documents `SendThreadResumeResponse` as sending running-thread history and **atomically subscribing for new updates**. `thread_processor.rs:4758–4783` enqueues this listener command and returns its completion receiver. General listener subscription is implemented in `request_processors/thread_lifecycle.rs:140–200`: it calls `try_ensure_connection_subscribed`, rejects threads closing, and ensures the shared listener runs. Cold resume separately auto-attaches at `thread_processor.rs:4284–4298`.

**Important limits:**

- A running-thread rejoin is not permission to rewrite runtime configuration. `thread_processor.rs:4565–4619` collects mismatch overrides. Only an idle, unsubscribed, non-running eligible cache entry may be shut down and cold-resumed; otherwise mismatches are warned/ignored to preserve rejoin semantics.
- Parent-owned multi-agent-v2 spawned children reject direct input: `request_processors/thread_input.rs:8–36`. `can_accept_direct_input` checks V2 + `SubAgent(ThreadSpawn)`, not a client lease. The `agents` overview / visibility of a child does not establish right to drive it.
- The sidecar must know which **thread** to join. No audited protocol field announces “the thread currently displayed by TUI client X.” Do not choose newest thread as a deterministic substitute. This is a negative search conclusion, not a claim that a source modification could not expose such information.

## 3. Multi-query sequence: real inputs and correlation, but no exclusive scheduler

`request_processors/turn_processor.rs:525–543` resolves the loaded thread by supplied `threadId` and validates direct-input eligibility. `645–700` submits `start_or_steer_turn` and returns either `Started` or `Steered`, both with actual turn IDs. `719–736` returns a `TurnStartResponse` with that ID. It is not an RPC that merely pastes a prompt into a UI.

`app-server-protocol/src/protocol/v2/turn.rs:567ff` defines completed notification with thread and turn; `app-server/src/bespoke_event_handling.rs:155–185` emits started notifications with thread/turn. `outgoing_message.rs:162–214` scopes thread outgoing notifications/requests to thread subscribers. A deterministic host adapter can correlate request response and terminal turn events, inspect history/items, and execute Theta control flow externally. **This is an implementation inference grounded in real API execution**, not a verified adapter.

**Adversarial counterexample to exclusive Theta drive:**

1. Sidecar observes idle/completed turn A.
2. User submits B through the unchanged TUI.
3. Sidecar calls `turn/start` for Theta query C.
4. `start_or_steer_turn` may return `Steered` with B's turn ID (`turn_processor.rs:684–692`). C is now additional input to an already active turn, not an isolated next Theta query. The API response still looks like a successful in-progress turn.

The reverse race is equally material: human input can steer a Theta-started turn. `turn/steer` has expected active-turn ID checking (`turn_processor.rs:1044–1182`, especially `1108–1115`), which prevents stale-target mistakes but does not grant exclusive ownership. `turn/interrupt` targets a turn ID (`1624–1658`), not an owner token; it can interrupt work rather than lock out human submissions.

No audited ownership field in turn admission binds a sequence to one connection. The “ownership policy” comment in `thread_input.rs` refers to parent-owned V2 subagents, **not** user-vs-sidecar arbitration. Thread input serialization and queueing are not exclusivity.

`codex queue` is real shared-session input, but not a substitute for query scheduling: `cli/src/queue_cmd.rs:12–20,29–62` requires explicit UUID/exact session name and message and calls `run_session_queue_command`. It offers no expression/result binding, current-composer interception, or exclusive sequence. Queue-specific parent-owned-child input restrictions appear in `request_processors/thread_queue_processor.rs:296–310`.

**Minimum truthful sidecar contract:** explicit thread selection; subscribe/rejoin before input; correlate returned ID; detect `Steered`/unexpected input and fail or reconcile rather than falsely report an isolated query; user agreement not to type; implement cancellation and disconnect recovery. This remains same-thread orchestration, not native extension parity.

## 4. Hooks are more powerful than notification-only, but do not solve native slash/ownership

Stock plugin resources are enumerated in `plugin/src/manifest.rs:18–25`: skills, onboarding skill, MCP servers, apps, hooks. There is no executable slash-command registrar in that manifest. `tui/src/slash_command.rs:12–88` is a statically defined enum; `tui/src/chatwidget/slash_dispatch.rs:158–170` dispatches it. A skill or prompt that asks an LLM to execute Theta is expressly **not** deterministic Theta execution.

However, a blanket “hooks cannot make the model continue” is **false**:

- `hooks/src/events/stop.rs:28–39` supplies `session_id`, **turn_id**, transcript path, `stop_hook_active`, last assistant message, etc., to a local hook.
- `hooks/src/schema.rs:455–464` accepts deterministic Stop `{decision:"block",reason:…}` output. `events/stop.rs:99–115` represents continuation fragments/block outcomes.
- Crucially, `core/src/session/turn.rs:718–758` runs Stop hooks, records the hook prompt, sets `stop_hook_active = true`, and `continue`s the model sampling loop. This is actual host-executed continuation in the same turn, not an LLM choosing to invoke a next external tool.
- `hooks/src/schema.rs:430–450` supports UserPromptSubmit blocking and additional context, but not a replacement custom slash command/action object. The output uses `deny_unknown_fields`.

**Inference:** a deterministic external interpreter in a Stop hook could maintain state, inspect the last message/transcript, and deterministically request subsequent model continuations. It can realize a restricted same-turn iterative Theta-like workflow without an app-server sidecar. Do not erase this feasibility. But it is not separate API query admission with isolated results/options, and hooks do not provide a TUI command registry or connection ownership lease. A hook can also launch/connect to a sidecar; that is still a hook-triggered external orchestrator, not evidence of native session API control.

An interception convention such as typing a normal message `theta …` and having UserPromptSubmit block/start an interpreter could be built. Calling that a registered `/theta` command would be inaccurate: built-in slash handling happens in the frontend, ahead of ordinary prompt handling. Hook-specific configuration/enablement and trust also apply; no installed native Theta plugin was verified.

## 5. Dynamic tools: distinguish registration from execution and from mutation

`app-server-protocol/src/protocol/v2/thread.rs:145–151`: **experimental** `thread/start.dynamicTools`; callers must opt into experimental API. `thread_processor.rs:1464–1466,1522` validates and passes the definitions when starting a thread. No `dynamicTools` counterpart was found on `ThreadResumeParams`, `TurnStartParams`, or an audited set/update-tools method. Joining the current loaded TUI runtime therefore does not by itself let a sidecar add Theta's tool definitions.

A custom frontend can create a thread with dynamic tool specs and host their deterministic implementation. Tool calls become server requests at `bespoke_event_handling.rs:1089–1117` and responses feed core via `dynamic_tools.rs:37–55`. That is genuine frontend-hosted deterministic execution, but **model-selected invocation** is not deterministic orchestration unless an independent interpreter drives the sequence.

Counterexample to another overly broad claim: stock TUI already handles some dynamic tooling. `tui/src/app/app_server_events.rs:607–644` recognizes its own namespace, ignores foreign namespaces on external servers, and gates its own task/delegation tools through active external task / approval-gated MCP requirements. `645–694` executes built-in implementations. This is not a generic plugin registration API, but means a foreign-namespace dynamic-tool sidecar need not automatically collide with a TUI answering every unknown call. Do not use TUI's own namespace for arbitrary extensions.

## 6. Multi-client approvals are shared, not reliably initiating-client routed

The decisive code is `app-server/src/outgoing_message.rs`:

- `336–439`: outgoing server request has one generated request ID and one oneshot callback. Ordinary requests are sent to all supplied thread connection IDs (or broadcast).
- `453–469`: pending requests may replay to a joining connection for the thread.
- `474–526`: a response/error resolves by calling `take_connection_callback`.
- `567–587`: connection ownership validation is conditional on `verification_owner`. **For normal requests, the callback is simply removed by request ID, regardless of the supplied connection ID.** First accepted response consumes it; later responses cannot find it.
- `595ff`: pending request replay excludes the special verification-owned request, not ordinary approvals.

Thus do not promise “the sidecar's turns ask approvals only in its UI” or “TUI and sidecar can independently approve their own tool calls.” Ordinary thread subscribers participate in shared approval. Even routing a request to a set of connections is not the same as checking the response's connection against that set in the generic callback function. This is an in-trust-domain design observation, not a demonstrated cross-user vulnerability.

**Explicit exception:** `outgoing_message.rs:345–400` special-cases MCP user verification: selects one eligible verification owner, snapshots authentication identity/revision, and does not inherit another account. `567–584` rejects the wrong owner or changed auth. Reconnect/other subscribers cannot answer that ceremony. A sidecar cannot assume it can take over all approval-like interactions, and must not flatten user-verification into ordinary approve/deny handling.

Sidecar safety policy should normally leave ordinary human approvals to the TUI rather than race it. If a custom frontend owns approval UI, avoid concurrent clients or define an operator-level coordination arrangement; stock callback semantics do not implement a per-Theta approval authority.

## 7. Transitions: same thread is not current display; retry is not replay

- `/new`, `/fork`, `/resume`, `/clear`, and `/agents` are native TUI state transitions (`slash_command.rs:96–108,142–143`); a sidecar with thread T keeps targeting T, not whichever conversation the user now sees. A daemon thread list/started event is not a display-focus event.
- `thread_lifecycle.rs:31–65,80–124`: idle threads without subscribers become candidates for delayed unload. A sidecar subscription can itself keep an otherwise-unused thread loaded, affecting lifecycle compared with unmodified TUI use.
- `thread_lifecycle.rs:164–170`: subscription can fail while closing; retry after closed rather than assuming continued control.
- `tui/src/app/reconnect.rs:1–3,31–130` explicitly reconnects a fresh client and rejoins threads using ordinary resume/history semantics. It refuses to retry an initial thread creation whose ID was not received (`45–49`). Its header explicitly quarantines uncertain submissions and old async completions. A sidecar needs similarly careful admission reconciliation; blindly retrying a lost `turn/start` can duplicate or steer work.
- Running thread resume preserves already-admitted runtime rather than adopting arbitrary overrides (`thread_processor.rs:4565–4619`). Reconnection is not a runtime tool/config hot-swap.

**Unknowns requiring later isolated/runtime work:** exact observability of all user-input interleavings through the frontend adapter; event ordering and failure signatures during actual daemon upgrade/recovery; an end-to-end Theta interpreter binding over proxy; operator UX for explicit current-thread selection; whether a restricted hook driver satisfies the project's complete Theta query semantics. None should be advertised as verified here.

## Categorization / decision guidance

1. **Stock native plugin/hooks:** actual deterministic local hook execution and Stop continuation exist; full current-session Theta command/runtime parity is not established. No registered executable slash extension, exclusive admission, or arbitrary current-thread dynamic-tool mutation was found.
2. **Same-thread daemon sidecar:** real and promising, and should be assessed separately from isolated workers. It can deterministically drive actual existing-thread queries, conditional on reachability, identity, and a cooperative concurrency contract. It cannot truthfully claim exclusive current-TUI ownership or private approval routing.
3. **Custom frontend or controlling proxy:** can own composer input, deterministic slash dispatcher, query admission, dynamic tool hosting at thread creation, and approval presentation. These guarantees come from that frontend/proxy architecture, not the unchanged stock TUI. A proxy must be on the TUI's transport path from launch; an extra socket subscriber is not such a proxy.
4. **Isolated worker/external launcher:** separate process/session/thread orchestration remains available but is not evidence of same existing TUI integration. Conversely, its limitations must not be used to dismiss the real same-daemon rejoin path.

**Bottom line:** released 0.163.0 materially improves same-thread host feasibility via its shared daemon. The blocking distinction is not simply “can an external program send prompts?” (yes), but “can an unchanged existing TUI grant a deterministic interpreter a scoped exclusive execution and approval authority?” (not in the audited stock interfaces).
