# Independent adversarial recovery/replay investigation

> **Developer research, not end-user documentation or an accepted specification.**
> Relocated from `.pi/tmp/dual-host-research/pi-durable/recovery-analysis/REPORT.md`. Historical release/source pins and evidence limitations remain in force.
> Unless a link points to another tracked document, experiment paths and reproduction instructions refer to the original local evidence workspace, `.pi/tmp/dual-host-research/pi-durable/recovery-analysis/`; downloads, caches, scripts and raw logs remain gitignored and are not required to read this report.

## Bottom line

`@earendil-works/pi-durable@1.4.0` **really does recover persisted task state and tool intent after process death**. This is not merely saved chat history. Real SIGKILL/reopen probes below confirm phase checkpoints, unsafe-tool interruption, safe-tool re-execution, completed nested-call reuse, and commit-marker atomicity. But **it does not make an arbitrary running Theta interpreter durable**. A task's phase restarts at its top; ordinary JavaScript locals/stacks and the Theta interpreter's AST walk, lexical scopes, outstanding parallel lanes, and invocation budgets are not automatically checkpointed.

Important qualification: the release also ships a **genuinely deterministic, journal-replayed QuickJS `codemode`**, rather than an LLM pretending to execute code. That is a useful replay architecture precedent, not evidence that the existing Theta interpreter can plug into its VM or be recovered unchanged.

The strongest supportable effect guarantee is **atomic internal state commits + task identity/request-id dedup + policy-controlled replay**. It is **not exactly-once arbitrary external effects**. Our deliberately non-idempotent local counter declared `replay: "safe"` ran twice after one kill. The unsafe equivalent ran once but recovered as failed/interrupted, with no proof whether it completed its effect. Reissuing new work can still repeat that effect.

## Artifact and boundaries

- Published registry artifact: https://registry.npmjs.org/@earendil-works/pi-durable/-/pi-durable-1.4.0.tgz . Saved as `pi-durable-1.4.0.tgz`; registry metadata saved in `registry-latest.json`.
- SHA-512 registry integrity verified locally (`integrity.log`); SHA-256 saved in `artifact.sha256`. Runtime dependencies installed locally with a generated `install/package-lock.json` and `--ignore-scripts`; runtime Node **v22.23.3**.
- Source ref: `earendil-works/pi` tag `v1.4.0`, commit **4a080252f06caf63a525d7873c5d94d3c23887e0**, GitHub API response `git-tag.json`. Release source recovered verbatim from published JS sourcemaps under `source/`. `source/harness/tool.ts` matches raw GitHub commit file byte-for-byte (`ref-check/`). Source citations below refer to that local recovered tree; URL base: https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/durable/src/ . Published compiled files are also retained in `package/dist/`.
- Theta revision recorded in `theta-head.txt`; project root `/home/thomasa/Projects/pi-theta` remained read-only. All intentional writes, installs, data, logs, and config for this investigation are beneath this report directory. No credentials were read, no model calls were made, no external-service writes occurred.
- These are **offline released-package execution probes**, not live OpenAI/auth verification. Parent handles ordinary conversation/live-host checks.

## What recovery actually stores and runs

### Task/checkpoint state machine — facts

- A task persists `kind`, `version`, input, ownership, state/checkpoint, timestamps and restart count. The scheduler on open changes surviving `running` tasks to `pending` **with the same checkpoint**, increments restart counts, and does not dispatch until resumed (`source/harness/scheduler.ts:370–411`).
- Phase handlers must commit changed checkpoint or terminal state (`package/dist/types.d.ts:196–200,235–238`). No continuation snapshot is implied. The documentation explicitly says a phase reruns from its top; values needed by the next phase belong in checkpoint (`package/README.md:142–164`).
- `sleepUntil` records sleeping state/deadline; hosts can use wake scheduling/alarm callbacks. Sleep is between phases, not a suspended arbitrary JS continuation (`README.md:142–213`).
- Default restart limit is 5, configurable; crash-cutoff tasks park until explicit retry. Missing/outdated definitions and failed migrations block; phase exceptions fault the unit (`README.md:216–222,823–825`; `source/harness/scheduler.ts:1590–1618`). Graceful close does not count as a crash.
- Resolution is by task name/version and explicit migrations, **not an automatic code hash**. Same task version is accepted as-is (`source/harness/scheduler.ts:1607–1618`). Replacing implementation without bumping its version is therefore an author responsibility, not detected equivalence.

### Atomic commits, dedup, and crash windows — facts and limits

- Session serializes commits, calls storage before publishing, and only publishes the committed write set after success (`source/session/session.ts:724–766`). A callback exception rolls back that internal write set. Filesystem/network side effects performed in a callback are outside this transaction; our rollback probe preserves its external counter.
- Submission lookup is **per conversation + requestId**, returning the prior record before new admission. Same requestId + different type throws; same requestId + changed same-type payload is silently treated as the old submission (`source/harness/submissions.ts:201–225`). There is no payload-hash equality guard here. Use stable IDs only for the same logical operation; add your own payload binding if required.
- A requestId solves retry-after-unknown-admission, including commit-before-client-ack. It does not dedup every future semantic operation or external action. A fork has a new conversation identity, so request IDs can be reused and admitted afresh there (executed probe).
- JSONL writes sidecar records first, then a single main commit marker; only then does memory adopt the prepared transaction (`source/storage/jsonl/storage.ts:278–307`). Recovery validates confirmed data, discards unconfirmed tails and truncates torn lines (`:539–545,719–733,789–804`). Kill before marker produced no entries; kill after marker but before append returned to Harness recovered both entries.
- `fsync` defaults **false** (`source/storage/jsonl/storage.ts:257`). `fsync: true` flushes sidecars before the main marker; main-file flush occurs before reclamation (`:295–303,507–515`). Do not turn our **process-kill** result into a power-loss durability claim. SQLite default WAL/synchronous NORMAL also explicitly permits newest-commit loss on host/power failure (`README.md:765–766`).
- **One process owns a store at a time; no cross-process locking** (`README.md:790`). Our processes are strictly sequential ownership, kill then reopen. Multiple worker processes concurrently opening the same store is not a supported coordination design.

### Model attempts — source facts, not live-verified

- Generation preparation checkpoints model reference/thinking/stream options/cutoff (`source/harness/generation.ts:195–206`). Request phase reconstructs context, re-runs `beforeRequest`, and calls the provider (`:209–234`). A process death before response classification/commit can mean another actual provider call on resume; this is not exactly-once provider billing.
- A committed partial is converted to an aborted assistant before retry (`:211–218`, `convertPartial` implementation), rather than an arbitrary partial-token continuation.
- Retry classification uses `isRetryableAssistantError`, enabled policy, maxRetries and persisted sleeping backoff (`:559–589`). Context overflow has its own compaction path, not blind retry. Deferred-response handle/poll is a separate checkpointed path (`:250–263,519–528`).
- Per-conversation provider session UUID is prompt-cache/session affinity, not a general effect idempotency token (`README.md:127`). No live model/subscription verification performed here.

### Tools: safe means replayable, not exactly once

- The actual public option is **`replay: "safe" | "unsafe"`**, not `replaySafe`; unsafe is default. Tool arguments are validated/repaired before intent; intent `{ phase: "execute", arguments, replay }` is committed **before** invoking `execute` (`source/harness/tool.ts:130–179`).
- Recovery calls `execute` again only when **both stored and current tool policies** are safe. Otherwise it settles failed with `interrupted`, because the tool may have partially run (`:180–204`; compiled `package/dist/harness/tool.js:104–123`).
- Therefore crash windows are explicit: (1) intent committed but external execution never began → unsafe may report interrupted despite zero effect; (2) effect occurred but terminal result did not commit → safe can repeat; unsafe reports uncertainty; (3) terminal result committed before caller sees it → stored result is authoritative. No atomic bridge between arbitrary external systems and durable storage exists.
- Before/after hooks and execute implementation are not pinned by a content hash. Work after restart uses installed code/current registry; safe replay intentionally does not redo initial `beforeTool` admission, using stored final arguments instead (`tool.ts:130–200`; `README.md:472`).
- A **new model-issued tool call** creates a new task, so unsafe interruption is not a global ban on the model/user reissuing equivalent arguments. That may duplicate effects. It is the caller/author's recovery policy to resolve ambiguity.

### Nested calls, children, abort, and forks

- Nested call key defaults to call position, or explicit `{ key }`. Replay-safe parent running from its top can reattach to stored child tasks/results. The reuse check requires same tool name and structurally equal arguments; changed arguments at the same key **throw**, not silently run or return old result (`source/harness/tool.ts:733–790`). This is concrete deterministic key-based orchestration, not source/AST replay.
- Nested-call task and parent's memo document are created together; terminal child settlement stores result on parent document. Nested results are retained only until parent settles; a task receipt is not a permanent globally queryable replay ledger (`README.md:328–330`).
- Unsafe parent tools do not rerun. Their nested calls and created task children default to `abandonOnRestart`, ensuring orphaned in-memory awaits do not leave autonomous recovery work (`README.md:351–353`; `tool.ts:305` onward).
- Durable child tasks can be created and parent moved to `waiting` **in the same commit**. Policies allSettled/failFast, completing join, bottom-up abort and background boundaries are real scheduler semantics (`README.md:683–706,674–676`). They do not reconstruct an arbitrary Promise.all dependency graph unless application code represented it as tasks/checkpoints.
- Abort handlers can perform application cleanup; they are not automatic rollback of external effects. Forks copy fork-aware history/document state according to declarations; a history fork is not a captured process stack, nor an external-effect undo (`README.md:99,740ff`; `package/dist/types.d.ts:357–375,850–854`).

## Codemode: an important positive capability, carefully scoped

The release's `codemode` extension does implement restartable deterministic execution. It uses a **QuickJS sandbox**, seeded randomness/virtual clock/UTC, journal-before-delivery result storage, nested-call keys, code-mode module version and VM fingerprint checks. It re-runs the script from its start and replays journaled delivery order, refusing divergence or changed fingerprint/module version/deadline (`README.md:355–368`; `source/codemode/codemode.ts:1–35,84–105,407–452,615–640`).

This is **not** JS heap/stack serialization, and not an LLM reading a Theta file. It is also **not general recovery for host JS** or proof that Theta's current interpreter can run in that sandbox. A future deterministic Theta adapter could adopt a similar event journal or lower to explicit task phases, but needs design/implementation/verification of code identity, language values and external inputs, nondeterminism, query/tool/invoke result replay, parallel completion order, timers, cancellation and budgets. I did **not** execute a QuickJS/codemode kill probe; this subsection is source-backed only.

## Theta contrast at the recorded checkout

Evidence paths in this section are absolute project-relative paths under `/home/thomasa/Projects/pi-theta` (read-only).

| Existing Theta property | Why durable task support alone does not preserve it |
|---|---|
| Lexical locals, parameter/function/module scopes in runtime Maps (`src/runtime/lexical-environment.ts:297–347`) | They are process memory, not pi-durable documents/checkpoints. Need an explicit serializable environment representation, or deterministic language-level replay. |
| AST/block/program-counter walk in async interpreter (`src/runtime/statement-executor.ts:286–351,818–852`, loops thereafter) | Return into a suspended JS call stack is not a durable task checkpoint. Wrapping `executeBody()` in one phase means rerun body from the beginning, not continue its statement. |
| `par for` snapshot, indexed results/diagnostics, nextIndex and worker pool (`src/runtime/par-for-executor.ts:261–336`) | These are in-memory arrays/Promise workers. Need persisted per-lane identity/outcome and ordering/cancellation decisions. Exactly-once synchronous index claiming within one live invocation is **not** exactly-once across crash/replay. |
| `fn` stack and `invoke`/subagent child whole-callee execution (`statement-executor.ts:286–351`; `docs/spec_topics/invocation.md:49`; `docs/spec_topics/functions.md:60`) | Child `pi` session log is operator history, explicitly never read for recovery; kill without `theta_result` returns fail-closed infra error. Durable task-owned conversations are a new host execution arrangement, not native resumption of existing Theta subprocesses. |
| Depth, tool-round, binder retry, validation ceilings (`src/runtime/ceiling-arbitration.ts:21–26,44–52`) | Current per-invocation accounting needs explicit durability if a resumed task is to preserve remaining budgets. Restarting the theta anew resets the invocation, not a transparent resume. |
| Cancellation checkpoints (`src/runtime/checkpoint-granularity.ts:1–25,66–107`) | These yield/check AbortSignal at semantic boundaries. The shared word “checkpoint” does **not** mean disk durability or save-point rollback. |
| No rollback on `?`, panic or cancellation (`src/runtime/no-rollback.ts:1–26`; `docs/reference/errors-and-results.md:59–75`) | Prior completed effects stay final; author owns idempotency/compensation. Wrapping in durable task does not change that. |
| Content-hash verified Theta/subagent closure (`docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md:27`) | Code skew admission protection, not completed-effect replay ledger. Different from pi-durable task name/version and codemode VM fingerprint. |

**Inference/recommendation:** For an initial new pi-durable host, retain Theta's current **invocation-level reissue contract**, rather than promise mid-Theta resumption. A whole-theta tool should not be labeled replay-safe merely because queries/tools inside use pi-durable; the Theta body can have effects/locals/control flow not represented in child call keys. Unsafe-by-default gives honest interruption but loses continued interpreter progress. True durable Theta requires a dedicated state-machine or deterministic interpreter journal design. An isolated worker launcher can use a durable task as a durable *job receipt*, but must not call that a durable Theta continuation.

## Executed bounded offline probes

All use the published package, real JSONL storage, zero providers, local files only. Model-issued ToolTask inputs are constructed directly as a deterministic offline fixture, **not generated by a model**. This isolates tool scheduler/recovery from model variance. `results/*/effects.jsonl` are append-only external-effect counters outside durable storage transactions.

| Probe | Observed result | Artifacts |
|---|---|---|
| Custom two-phase task; first commits second/checkpoint local=41; kill in second after effect | Exit 137, reopen `pending` at second with restarts=1; first once, second twice; terminal result 42 | `results/phase/{crash,recover}.log`, `effects.jsonl` |
| Safe tool killed after external counter, before result commit | Exit 137; same task/execute intent resumes; tool counter **2**, success | `results/safe/` |
| Default unsafe tool, identical kill boundary | Exit 137; tool counter **1**; terminal **failed**, `interrupted` diagnostic in committed pi.tool-result | `results/unsafe/` |
| Safe parent completes nested child then dies before parent result | Parent counter **2**, nested counter **1**; same child task ID/result returned on replay | `results/nested/` |
| Same nested key on replay but changed arguments | No second nested effect; parent fails, tool error says nested call already made with other arguments | `results/nested-diverge/` |
| Submission reopen/id dedup + changed payload | Same ID 8; original value=1 retained rather than new 999; cross-type input rejected | `storage-probe.log`, `storage-results/store/` |
| Commit callback appends entry then external effect then throws | No rollback entry persisted, but `storage-results/outside-counter` contains effect | same |
| Fork reuses same request ID | New submission ID admitted in fork; inherited original entry plus fresh entry | `storage-probe.log` |
| Kill after first sidecar append before main marker | Exit 137; reopened entries **none** | `commit-results/before-marker/` |
| Kill after marker append before append returns/transaction ack | Exit 137; reopened entries **both a and b** | `commit-results/after-marker/` |

The commit-window probes proxy the *released* Node filesystem adapter only to pause at exact successful append boundaries; all encoding/recovery is released JsonlStorage. They are not hand-implemented storage simulators. We did not test power loss, arbitrary disk corruption, every write boundary, SQLite, simultaneous owners, live provider retries, or all child-abort permutations.

### Reproduction

From this directory (use a fresh directory copy or rename existing results first; scripts intentionally do not delete stores):

```sh
# Node 22.23.3; local npm binary was not initially on PATH.
export PATH=/home/thomasa/.local/share/pi-node/node-v22.23.3-linux-x64/bin:$PATH
npm install --prefix ./install --cache ./npm-cache --ignore-scripts --no-audit --no-fund @earendil-works/pi-durable@1.4.0 > install.log 2>&1
bash run-probes.sh > probes.log 2>&1
node storage-probe.mjs > storage-probe.log 2>&1
bash run-commit-windows.sh > commit-windows.log 2>&1
```

`MODES='nested nested-diverge' bash run-probes.sh` was used for the additional nested tests. Every kill runner waits for a readiness file written at the effect/append boundary and waits for the killed process before reopen; each recovery is timeout-bounded to 20 seconds. Full task/result/entry logs are retained.

### Failed assumptions / harness corrections retained as evidence

1. `npm` was not on shell PATH; discovered co-located executable under the already-installed Node tree and used explicit PATH. No global install.
2. Importing `{Type}` from TypeBox's **deep type namespace** entry fails; switched to namespace import. Failure `trial.log` retained.
3. AgentChange extensions take definition objects, not stored string names; supplying `['probe']` produced strict-JSON undefined error. Logs `failed-agent-options/` retained.
4. IDs are numbers, not strings; direct `writeFileSync(id)` failed before task run. Corrected JSON encode/decode; logs `failed-numeric-ids/` retained.
5. An unresolved Promise alone does not hold Node's event loop; first crash fixtures exited code 13 before SIGKILL. These **do not count as actual kill evidence** (`early-exit-results/`, `early-exit.log`). Added a local keepalive interval, reran into fresh `results/`, and verified exit **137** for every counted probe.
6. Fork creation requires explicit ownership (`{kind:'ownerless'}`); corrected failed fixture and reran fresh. `failed-fork-options.log` retained.
7. Commit main filename is `main.jsonl`, and plain transcript entries live in main marker; commit-window fixture adds a session document to ensure a real sidecar-before-marker boundary. No failed conclusions promoted to evidence.

## Host feasibility classification (this investigation only)

- **Existing-session native integration:** not established by these offline probes; parent owns host API/conversation investigation. Storage APIs/skills/MCP alone are not evidence of loop control.
- **Isolated worker orchestration:** strongly supported as a durable task/owned-conversation architecture, with app-specific stable keys and idempotency. Existing Theta worker processes still need explicit interrupted-job policy.
- **Custom frontend/embedding:** concrete Harness/Registry/task APIs and storage recovery exist; genuine durable orchestration foundation, but Theta interpreter-state integration remains work.
- **Mere external launcher:** launching existing `pi` with Theta and saving process IDs/session paths is weaker than the tested checkpoint scheduler and does not acquire its recovery guarantees.

## Decision guardrails

1. Advertise “durable conversation/task orchestration” separately from “durable Theta execution.”
2. Do not translate safe replay to exactly-once effects. Require external idempotency keys or reconciliation for repeatable actions.
3. Persist parent/child admissions and parent wait checkpoint atomically; key nested operations to stable language-level identity, not incidental runtime order where parallelism can reorder it.
4. Bind request IDs to intended operation payloads at the adapter boundary; the underlying admission dedup does not enforce that for you.
5. Preserve source identity, budgets, cancellation outcomes, per-lane outcomes, and return envelopes if designing actual Theta durability. Do not infer these from transcript persistence.
6. Use one owner per store; host-level ownership/locking/fencing is outside this package's stated guarantees.
