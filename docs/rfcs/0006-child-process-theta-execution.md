# RFC 0006 — Child-process theta execution (remote theta)

- **Status:** accepted
- **Depends on:** [RFC 0005 — Child-process subagent sessions](./0005-child-process-subagent-sessions.md)
  (process-launch, teardown, probe, and diagnostics machinery; this RFC
  reuses all of it and retires only the RPC drive contract — see
  *Relationship to RFC 0005 after adoption*).
- **Scope:** Pi-integration contract and runtime architecture; adds one new
  execution regime (*subagent-root*) to the contract. No theta
  language-surface change: `.theta` sources and their observable semantics are
  unchanged.
- **Affects:** `pi-integration-contract/subagent.md` (successor contract from
  RFC 0005, revised again), `conversation-drive.md`, `invocation.md`
  (return-value propagation, depth counter), typed-query mechanics
  (`implementation-notes.md` §Runtime), §Resolution snapshot, the diagnostics
  registry, `slash-invocation.md` interaction, and the binder (bypassed for
  marshalled invocations).
- **Origin:** spawned by [Bug 0001 — Extension-registered tools are
  unreachable from Theta](../bugs/0001-extension-tools-unreachable.md); this
  RFC is otherwise self-contained.

## Summary

Run each subagent-mode theta invocation as a child process that executes the
**whole callee**, not only its session:

```
pi --theta <dirs> --mode json -p "/<slug> …" --no-session [--tools …]
```

Where RFC 0005 keeps the interpreter in the parent and remotes only the
`AgentSession`, this RFC moves the callee's interpreter into the child. Inside
the child, Pi's startup discovery has natively registered every installed
extension's tools **and** the theta extension itself, and the callee runs
against the child's own host session — a context where the prompt-mode reach
mechanisms apply:

- **model-facing:** extension tools enter the child session's active tool
  set by name for the duration of each query window;
- **code-side:** the child's host agent loop can execute a deterministically
  authored tool call on theta code's behalf (*host-loop dispatch*, defined
  below) — the zero-token code channel RFC 0002 established, now reaching
  extension tools from subagent-mode thetas.

After RFC 0005, a subagent theta's *model* can call extension tools but its
*code* cannot — the parent holds no executable definition for them. That
code-side channel is what this RFC delivers. If Pi ever exposes
`getToolDefinition` on the extension API (requested upstream, so far
refused), the child gets clean code-side dispatch natively and the host-loop
dispatch machinery retires without changing this RFC's process architecture.

## Motivation

1. **Subagent code-side reach is not deliverable in the parent.** The parent
   holds no `execute` for extension tools (Pi's public extension API
   deliberately withholds it — `getAllTools()` strips `execute`, and upstream
   exposure was requested twice and refused), and RFC 0005's RPC protocol
   exposes no execute-tool-by-name command. The only no-upstream context in which theta
   *code* can drive an extension tool deterministically is a process where
   (a) the tool is natively registered and (b) a host agent loop exists to
   execute an authored call. A child `pi` process is exactly that context.
2. **One execution context instead of two reach regimes.** After RFC 0005, a
   subagent theta's model-facing and code-side capabilities diverge (model
   yes, code no). Moving the callee into the child restores parity: the same
   callable-set rules apply to both channels, as the `tools:` contract
   already promises.
3. **Isolation is preserved, not weakened.** The child's host session is not
   the user's session. Transcript privacy, no-ambient-inheritance, and
   return-value-only propagation carry over; the enforcing mechanisms change.

## Background: the mode-regress problem

A naive child launch is circular: the callee's frontmatter says
`mode: subagent`, so the theta runtime inside the child would spawn *another*
child. The child must instead execute the theta under a third regime:

**Subagent-root** — the invocation regime of a `mode: subagent` theta that is
itself the root theta of its own process. The runtime drives the theta against
the process's own host session (prompt-mode driver mechanics) while applying
the subagent-mode frontmatter contract:

- `system:` is installed as the child session's system prompt (delivered via
  `--system-prompt` at launch, mirroring RFC 0005);
- the callable set governs the session's active tools for query windows (the
  prompt-mode `setActiveTools` snapshot/restore protocol, degenerate here —
  there is no user state to restore for);
- `theta/parse/system-on-prompt-mode` does not fire (the theta is still
  `mode: subagent`; the regime, not the mode, selects the driver);
- a nested `mode: subagent` callee invoked *by* this theta spawns its own
  child in the normal way (regime applies only to the process root).

The regime is selected by an environment marker set by the parent's launcher
(e.g. `PI_THETA_SUBAGENT_ROOT=<slug>`), never by anything in the `.theta`
file. A theta author cannot request it; it is invisible to the language
surface.

## Proposal

### Launch contract

Reuses RFC 0005's launcher: executable resolution, ambient suppression
flags, `--no-session`, the trust rule (`--approve` by necessity-inference
from the callable set's `sourceInfo`), env inheritance, teardown, kill
semantics, orphan handling, and spawn-failure diagnostics. The subagent-root
regime marker subsumes RFC 0005's child marker and carries its duties
(watcher suppression, no-recursion guard) alongside regime selection.
Differences:

| Concern | RFC 0005 (remote session) | This RFC (remote theta) |
|---|---|---|
| Child mode | `--mode rpc`, long-lived, multi-turn | `--mode json -p "/<slug>"`, one invocation per process |
| Interpreter | parent | child |
| `--tools` | callable-set allowlist for the session | not required for correctness (the child theta enforces its own callable set); MAY be passed defence-in-depth |
| `--system-prompt` | resolved `system:` | same, consumed by the subagent-root regime |
| Params | n/a (parent interpolates into queries) | marshalled structurally (below) |
| Result | per-query `agent_end` payloads | one final-value envelope (below) |

### Parameter marshalling (binder bypass)

The parent has already-typed param values; routing them through the slash
string `-p "/<slug> …"` would re-enter the binder (a model turn) and lose
typing. The child accepts a structured channel instead, carrying
`{ name: value }` as canonical JSON per the theta's `params:` schema; the
child validates against the same schema and skips the binder entirely.
Binder inference remains exclusive to human slash invocation, unchanged.

The channel is dual, keyed on a pinned size threshold chosen conservatively
under the tightest platform environment-block cap with headroom for the
inherited environment (order of 8 KB payload; Windows caps the entire block
at ~32 KB): below the threshold, an environment variable
(`PI_THETA_PARAMS=<canonical JSON>`); at or above it, a 0600 temp file whose
path travels as `PI_THETA_PARAMS_FILE`, read and deleted by the child, with
a parent-`finally` delete as backstop. Env-only with a size guard is
rejected — it would silently narrow the language ("params that fit in an
env var") for an implementation reason no author should have to know about,
regressing a pattern (large string params) that works in-process today.
Stdin delivery is rejected — Pi's `-p` mode has its own stdin conventions,
and an extension consuming stdin inside a `pi` child is an unprobeable
host-behaviour dependency. The temp-file path is the same mechanism the
return-value envelope names as its escalation (see *Return-value
marshalling*), built and tested once for both directions; the brief on-disk
exposure of param values (0600, deleted on read or in the parent `finally`)
is documented alongside the envelope escalation's.

### Return-value marshalling

The child theta's final value must reach the parent with `Result` fidelity.
The child runtime emits a single machine-readable envelope as one JSONL line
with a reserved top-level key on stdout, alongside the `--mode json` event
stream; the parent matches the key and ignores every other line:

```json
{"theta_result": {"ok": …}}
{"theta_result": {"err": {"kind": "query", "variant": {…}}}}
```

Requirements:

- `Ok` values serialise per the runtime value model (JSON-representable by
  construction);
- every `Err` variant an in-process subagent invocation can surface today
  (`QueryError` variants, `CodeToolError`, `InvokeInfraError` causes, panics
  routed as `internal-error`) is representable; the envelope schema is pinned
  in the contract;
- a child that exits without emitting an envelope (crash, kill, timeout) maps
  to `Err(InvokeInfraError { cause: "internal_error", … })` with the exit
  detail — never a fabricated value (fail-closed);
- the envelope schema is versioned; parent and child assert compatibility
  (same installed theta extension serves both sides, so skew arises only from
  concurrent upgrades — detected, not tolerated).

Sharing stdout with the event stream is safe by construction: the envelope
writer (the theta runtime in the child) and Pi's event writer are the same
process, and Node serialises same-process stream writes, so the reserved-key
line cannot be split mid-write; stray lines from other extensions can appear
in the stream but cannot corrupt the envelope. A single shared channel also
keeps the entire child observable in one stream. A dedicated extra fd is
rejected — nonstandard, platform-sensitive on Windows spawn contexts, and no
atomicity gained over same-process serialisation. A temp-file handoff
(parent-supplied path, atomic write + rename, 0600, parent reads after exit)
is the recorded escalation on two named triggers: envelope payloads too large
for single-line handling, or observed stream corruption in practice; if
engaged it also serves the params channel symmetrically (see *Parameter
marshalling*), one mechanism for both directions.

### Code-side extension-tool dispatch (inside the child)

Within the child, the callee runs under subagent-root, i.e. with a real host
session and agent loop. Code-side calls resolve per the callable set:

- built-ins: direct `execute` dispatch, unchanged;
- `.theta` callables: unchanged;
- extension tools: **host-loop dispatch** — the runtime registers a
  theta-controlled provider whose stream function authors the `tool_use`
  itself, carrying the code-supplied arguments verbatim; the host agent loop
  (which holds every registered tool's `execute`) runs the call and appends
  the tool result; the runtime reads the result back and returns it to code.
  Deterministic arguments, zero model tokens, no executable definition ever
  obtained by theta code, documented Pi APIs only. Its costs — a fabricated
  turn in the transcript and a temporary session-model switch — are confined
  to the child's private, discarded session, not the user's.
- If Pi later exposes `getToolDefinition` on the extension API, that clean
  registry read replaces host-loop dispatch as the preferred rung; the
  ladder is probe-asserted and fail-closed (a theta whose code calls an
  extension tool refuses to register when no rung is available, with a
  precise diagnostic).

**Permission surface.** Code-side dispatch of extension tools introduces no
new permission gate, deliberately. The model-turn checkpoint it removes was
already removed by the language itself: since RFC 0002, theta code calls
`bash` with fully computed arguments, and `bash` is the maximal capability —
an extension tool cannot do to the machine anything `bash` cannot. Gating
extension tools while `bash` flows free would be a gate on the narrow door
beside an open barn. The effective gates are the existing ones: (1) the
author's `tools:` declaration — a theta calls only what its frontmatter
declares, readable by any operator; (2) the operator's extension-install and
trust decisions, inherited by the child via RFC 0005's necessity-inference
trust rule; (3) fail-closed registration. Per-tool capability annotations
are rejected (author burden encoding a distinction with no security
rationale); runtime approval prompts are rejected (they destroy the
channel's purpose — deterministic, unattended orchestration — and a
headless child has nobody to ask). One forward-compatibility property is
worth recording: because code-side dispatch travels through the host agent
loop, any tool-execution permission machinery Pi itself ever adds sits in
the path automatically — theta needs no gate of its own for a future Pi
gate to apply.

### Cancellation, depth, concurrency

- **Cancellation:** parent `thetaAbort` → child process-tree kill after a
  bounded grace (RFC 0005 machinery). No RPC abort exists on a `-p` child;
  the grace signal is stdin close / platform signal, then kill. The child's
  stdin is spawned as a pipe held open by the parent — unused for data — so
  RFC 0005's orphan-prevention layers transfer intact: OS-driven pipe close
  on parent death (with `pi`'s exit-on-stdin-EOF behaviour joining the same
  version-bump audit item RFC 0005 pins for the RPC child, extended to `-p`
  mode), and the child-side parent-PID watchdog as the recorded fallback —
  guaranteed available here, since the theta extension always loads in the
  child.
- **Depth counter:** carried as wire-level data (env var), continuing
  RFC 0005's reversal of the "not part of the wire-level data" sentence.
  Nested children inherit and increment it; `invoke-depth-exceeded` trips in
  whichever process hits the cap and surfaces to its invoke parent through
  the envelope. Because every nesting level is now a process, the existing
  per-chain depth cap is thereby also the **process-tree depth bound** — no
  second cap is introduced.
- **Concurrency and fan-out:** PIC-22's successor obligation — N parallel
  subagent tool calls initiate N child launches before any returns — carries
  over with "enter `sendUserMessage`" replaced by "spawn initiated". The
  existing no-admission-cap / no-scheduler disposition carries over with the
  unit changed from sessions to processes: width remains uncapped, and the
  resources a process tree consumes (child-process slots, file descriptors,
  memory — each child a full Node runtime with extension discovery loaded)
  remain owned by the OS layer, as the current disposition already
  enumerates. Spawn-time resource exhaustion (`EAGAIN`/`EMFILE`) routes
  through the spawn-failure diagnostic; per-process memory footprint is a
  documented operator consideration, not a governed quantity. A
  process-count cap or throttle is rejected — it would contradict both the
  no-additional-ceilings invariant and the parallel-initiation conformance
  obligation, and the right value is machine-dependent, which is precisely
  why the spec assigns it to the OS layer.

### Relationship to RFC 0005 after adoption

For a subagent-mode invocation, this RFC's driver **supersedes and retires**
RFC 0005's RPC session driver: the callee's queries run inside the child, so
the parent no longer drives a remote session for any invocation, and the RPC
driver is deleted rather than kept as a fallback. A fallback would presume a
failure mode that separates the two drivers, and none exists — both need the
same launcher, the same executable resolution, and the same child `pi`
running the same theta extension (required for `.theta` discovery and the
envelope); a failure that breaks one breaks both. Keeping it would
reintroduce the model-facing/code-side capability asymmetry as a
runtime-conditional behaviour — a theta silently behaving differently
depending on which driver it got — which the fail-closed posture forbids.
RFC 0005 is still the right first step:

1. it is the smaller change and delivers subagent model-facing reach alone;
2. every piece of its machinery — launcher, executable probe, teardown/kill,
   orphan handling, spawn diagnostics, Windows semantics, test harness —
   is consumed unchanged here;
3. its spec rewrite (in-process pins → process/CLI pins) is the same rewrite
   this RFC extends, not a throwaway — what this RFC retires is the RPC
   *drive contract* (the prompt/`agent_end`/abort mapping), not the
   machinery or the sequencing value of shipping RFC 0005 first (earlier
   model-facing reach; process infrastructure de-risked in production before
   the interpreter moves).

## Spec changes (beyond RFC 0005's)

1. **Subagent-root regime** defined in the Pi-integration contract: driver
   selection, `system:` delivery, active-set protocol, the
   env-marker selection rule, and the no-recursion guarantee.
2. `invocation.md`: return-value propagation for subagent callees restated
   over the envelope; the envelope schema and its versioning pinned; the
   depth-counter env carriage made normative.
3. Typed queries: the whole mechanism (free phase, forced-respond via pi-ai
   `complete()`, respond-repair) executes in the child; the parent-side
   contract reduces to envelope consumption. `implementation-notes.md`
   §Runtime and the provider-error mapping table follow the interpreter into
   the child.
4. §Resolution snapshot: for subagent-mode thetas the snapshot is taken by
   the child at child load — parent-side `tools:` admission becomes a
   name/schema check only. The parent-load/child-load skew window covered by
   RFC 0005's content-hash verification widens to the whole callee file; the
   hash rule extends accordingly (root `.theta` plus transitive `.thetalib`
   imports, verified by the child, refused on mismatch).
5. Params: a normative marshalled-params channel (dual env/temp-file, pinned
   threshold), its schema-validation rule, and its non-interaction with the
   binder.
6. Diagnostics: envelope-parse failure, envelope-schema skew, child exit
   without envelope, marshalled-params validation failure; plus the
   code-side dispatch ladder's fail-closed refusal code
   (e.g. `theta/load/extension-tool-unreachable`).
7. State-isolation matrix: middle column shrinks further — nothing of
   `ExtensionCommandContext` crosses except `cwd` and the marshalled model
   reference; the matrix gains an "explicitly marshalled" enumeration
   (params, model ref, depth, envelope).
8. SLSH-2: unchanged in substance (child session never reaches the user's
   UI); the enforcing mechanism is the child's `--no-session` +
   process-private stdout, restated.
9. The RPC drive contract introduced by RFC 0005 (the
   prompt/`agent_end`/abort mapping and its pinned wire surfaces) is retired;
   its launcher, teardown, probe, and diagnostic contracts are re-homed under
   this RFC's driver.
10. The permission disposition (no new gate; existing `tools:` / trust /
    fail-closed gates; host-loop routing as the seat for any future Pi-level
    gate) is recorded in the contract alongside the code-side dispatch
    ladder.

## Implementation changes (beyond RFC 0005's)

- Child-side: subagent-root regime in the runtime driver selection
  (`production-theta-producer.ts`); params-channel intake + schema
  validation; envelope emission at invocation exit (all exit paths,
  including panic routing).
- Parent-side: subagent invocation path becomes launch → await envelope →
  map to `Ok`/`Err`; the RFC 0005 RPC drive is retired (deleted, not kept as
  a fallback — see *Relationship to RFC 0005 after adoption*).
- Host-loop dispatch module (child-side): provider registration, encoded
  request turn, result read-back, model restore — behind the probe-asserted
  ladder with the upstream `getToolDefinition` read as the preferred rung
  when available.
- Tests: envelope round-trip (every `Err` variant), envelope stray-line
  tolerance, mode-regress guard (child never spawns a grandchild for its own
  root), depth propagation across two process levels,
  kill-during-free-phase, params-schema rejection, params env/temp-file
  threshold cutover, skew detection.

## Sequencing

1. **RFC 0005 ships first**: launcher machinery, spec rewrite of the
   in-process pins, subagent model-facing reach.
2. **Host-loop dispatch prototyped** in prompt mode (parent process), where
   the same mechanism is independently needed — the identical dispatch
   module this RFC embeds child-side. The prototype is an **acceptance
   criterion for this RFC's code-side scope**: its primitives were each
   verified against the installed Pi, but the mechanism has not been run
   end-to-end, and no other no-upstream path to code-side dispatch exists.
   On prototype failure the RFC re-scopes to its still-standing deliverables
   — subagent-root regime, params/envelope marshalling, and a single
   execution context for both reach channels — with the code-side rung
   fail-closed pending the upstream `getToolDefinition` exposure; the
   ladder architecture is unchanged either way, which is what makes the
   re-scope cheap.
3. **This RFC ships second**: subagent-root regime, params/envelope
   marshalling, driver switchover.
4. **Upstream `getToolDefinition` exposure** (pursued in parallel) slots in
   as the top ladder rung child-side whenever it lands; no architectural
   change.

## Provenance

- Origin: `docs/bugs/0001-extension-tools-unreachable.md` — the defect record
  whose investigation produced this design, including the feasibility study
  of host-loop dispatch against the installed Pi.
- Predecessor: `docs/rfcs/0005-child-process-subagent-sessions.md`.
- Spec pages measured: `docs/spec_topics/pi-integration-contract/subagent.md`,
  `conversation-drive.md` (prompt-mode driver, PIC-2),
  `tool-registration-lifetime.md` (PIC-17, snapshot/restore),
  `invocation.md` (cross-mode matrix, depth counter),
  `frontmatter/frontmatter-fields-a.md` (`tools`, `system`),
  `frontmatter/frontmatter-fields-b-and-templates.md` (§Resolution snapshot,
  system-on-prompt-mode carve-out precedent for regime-scoped rules),
  `slash-invocation.md` (SLSH-2), `errors-and-results/error-model.md`.
- Pi surfaces verified on the installed `@earendil-works/pi-coding-agent`
  v0.80.10: `pi --help` (`--mode json`, `-p`, `--no-session`,
  `--system-prompt`, `--tools`, extension-registered CLI flags),
  `docs/rpc.md` (protocol scope — no execute-tool-by-name command).
- Implementation sites: `src/extension/production-theta-producer.ts`
  (driver selection, binder, forced-respond `complete()` at `:3556`),
  `src/runtime/conversation-drive.ts`, `src/parser/callable-set.ts`.
