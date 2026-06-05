# Host interfaces services

<a id="pic-10"></a> **PIC-10. `Checkpoint` seam.** The runtime exposes a single internal hook the interpreter `await`s immediately before each cancellation checkpoint defined by the **Granularity** rule in [Cancellation](../cancellation.md). The hook exists so that the two race rules in [Cancellation — Race semantics](../cancellation.md) — no retroactive `Ok(v)` → `Err({kind:"cancelled"})` rewrite, and no top-level synthesis when no further checkpoint executes after the abort — are deterministically testable without depending on JS microtask scheduling. Production wiring resolves on the microtask queue (an already-resolved promise) for every checkpoint kind except `loop-iter`, which resolves on a macrotask turn so that a Pi-dispatched abort can land before a compute-bound loop's next signal-check (see the production-wiring rule below). Apart from that single per-iteration macrotask yield, the seam has no observable production effect beyond the cost of one resolved promise per checkpoint.

The interface shape below is a non-normative reference illustrating one conforming internal decomposition; per [GOV-18 arm (a)](../governance/corpus-direction-and-scope.md#gov-18-arm-a) this internal test-only seam's member set, `CheckpointKind` literal union, and `CheckpointSite` field shape are not themselves binding — the normative contract is the behavioural rules that follow. A conforming runtime MAY realise those behaviours through a differently-shaped seam:

```ts
type CheckpointKind =
  | "loop-iter"
  | "query"
  | "tool-call"
  | "invoke"
  | "binder-call";

interface CheckpointSite {
  file: string;
  line: number;
  column: number;
}

interface Checkpoint {
  before(kind: CheckpointKind, site: CheckpointSite): Promise<void>;
}
```

Rules:

- The interpreter `await`s `checkpoint.before(kind, site)` immediately *before* reading `loomAbort.signal.aborted` at every checkpoint enumerated in [Cancellation — Granularity](../cancellation.md): each `for`/`while` iteration boundary, each `@`-query, each tool call, each `invoke`, and the binder LLM call (the binder checkpoint fires even though the binder runs outside the loom body, so the cancelled-binder failure-mode in [Slash-Command Argument Binding](../binder.md) is observable through the same seam). The await happens unconditionally; production resolution is immediate (next microtask) for every kind except `loop-iter`, which resolves on a macrotask turn per the production-wiring rule below, and the always-`await` shape is what lets a test inject async work between an operation's resolution and the signal-check.
- The hook does **not** observe non-checkpoint synchronous work (AJV validation, schema lowering, default-merging) — the **Granularity** rule already excludes those, and the seam mirrors that exclusion exactly. Implementations MUST NOT add `before(...)` calls at any site not enumerated above.
- Production wiring constructs one `Checkpoint` per `loomAbort` (i.e., per loom invocation). For the `loop-iter` kind, `before(...)` releases the event loop for one macrotask turn before resolving, so that a Pi-dispatched abort (the macrotask that flips `loomAbort.signal.aborted`) can run before the interpreter reads the signal at the next loop-iteration checkpoint; a compute-bound loom body with no genuine `await` between iterations therefore stays cancellable rather than draining only the microtask queue. For every other checkpoint kind, `before(...)` resolves on the microtask queue (an already-resolved promise), because those checkpoints precede real async I/O that already yields the event loop. For `invoke`, parent and child each own their own `Checkpoint` instance constructed from the same factory, mirroring the per-invocation `loomAbort` rule from [Cancellation](../cancellation.md); a parent's `before(...)` is not observed by the child and vice versa.
- Test wiring is the only consumer that observes calls. A test that fires `loomAbort.abort()` from inside `before(...)` exercises the *abort observed at this checkpoint* path; a test that fires `loomAbort.abort()` from inside the *previous* checkpoint's `before(...)` (or from any code awaited inside that previous `before(...)`) exercises the *abort landed between checkpoints* path — i.e., the no-retroactive-rewrite rule. A test that fires `loomAbort.abort()` after the loom's final checkpoint and before its top-level resolution exercises the no-tail-synthesis rule. These three patterns are the canonical use of the seam.
- Test fakes MUST treat the seam as call-once-per-checkpoint and MUST NOT skip the await (the no-skip rule is what gives the test deterministic control over the post-resolution / pre-signal-check window).
- The seam is internal: it is not exposed through `ExtensionAPI` and not visible to loom authors, Pi extensions, or tools. The runtime wires it through the same constructor-injection skeleton that owns `FileSystem`, `DiagnosticsSink`, [`SchemaValidator`](#schemavalidator-interface), etc.

<a id="schemavalidator-interface"></a>

<a id="pic-11"></a> **PIC-11. `SchemaValidator` interface.** Schema validation is provided by a `SchemaValidator` service injected at construction time, modelled on the other DI seams in this section. The validator's behavioural contract — what any conforming implementation must satisfy:

- Validation MUST report every validation error in a single pass (no fast-fail) so [Diagnostics](../diagnostics.md) can present them all at once.
- Validation MUST NOT convert values and MUST NOT fill defaults — model output is taken as-is, and loom does no implicit type conversion in loom 1.0. The loom-level **respond-repair** mechanism that repairs schema-validation failures via follow-up turns — configured by `respond_repair:` frontmatter, see [Query — Schema-validation respond-repair](../query.md) — is a separate concept and is unaffected.
- `$ref` MUST resolve only within the lowered per-query schema document (the document produced by step 4 of the lowering algorithm in [Schema Subset — Lowering Algorithm](../schema-subset.md#lowering-algorithm)); external `$ref`s are not supported because lowered schemas never produce them.
- Validation MUST silently accept any JSON-Schema `format` keyword that may appear in a value's schema. Loom-emitted schemas never use `format`, but model output can carry one; an implementation that raises on unknown formats violates this contract.
- Validation results MUST be deterministic for a given (schema, value) pair.
- The order of entries within the returned `errors` array is implementation-defined; loom code and conformance tests MUST NOT rely on the positional index of a raw `errors` entry (e.g. `errors[0]`). The runtime imposes a canonical order when mapping these errors into the loom-observable `validation_errors` array (see [Errors and Results — `ValidationIssue` ordering](../errors-and-results/queryerror-variants.md#err-14)); positional access is meaningful only on that canonically-ordered array, not on the validator's raw output.

Architectural constraints carried by the DI seam itself: one `SchemaValidator` instance is constructed per runtime instance — never as a module-level global — and lives for the lifetime of that runtime. Two concurrent runtime instances (e.g. parallel tests) each get their own; sharing one across runtimes is disallowed. Cache invalidation on file change is a property of the validator service — the file watcher calls into the service's invalidate path; it does not reach into any module-scoped state.

The TypeScript declaration below is a non-normative reference illustrating one conforming decomposition; per [GOV-18 arm (a)](../governance/corpus-direction-and-scope.md#gov-18-arm-a) this internal DI seam's member set is not itself binding, and the normative contract is the behavioural list above. In the illustration, `LoweredSchema` is the lowered JSON-Schema document produced by step 4 of [Schema Subset — Lowering Algorithm](../schema-subset.md#lowering-algorithm), `schemaSlug` is the schema slug produced by the recipe in [Schema Subset — Canonical schema hash](../schema-subset.md#canonical-schema-hash), and `ValidationError` mirrors AJV's `ErrorObject` shape (the reference implementation hands AJV's array through unchanged):

```ts
interface ValidationError {
  instancePath: string;                           // RFC 6901 JSON Pointer to the failing value
  schemaPath: string;                             // pointer into the schema that triggered the failure
  keyword: string;                                // the JSON-Schema keyword that failed ("type", "required", "enum", …)
  message: string;                                // human-readable failure description
  params: Record<string, unknown>;                // keyword-specific failure context (AJV's `params`)
}

interface CompiledValidator {
  validate(value: unknown):
    | { ok: true }
    | { ok: false; errors: readonly ValidationError[] };
}

interface SchemaValidator {
  compile(schema: LoweredSchema): CompiledValidator;
  invalidate(schemaSlug: string): void;           // file-watcher entry point per the cache-invalidation rule above
}
```

<a id="clock--fakeclock-interface"></a>

<a id="pic-12"></a> **PIC-12. `Clock` / `FakeClock` interface.** The runtime reads wall-clock time and schedules deferred work exclusively through a `Clock` seam injected at construction time, modelled on the `FileSystem` seam. The interface members below are a non-normative reference; per [GOV-18 arm (a)](../governance/corpus-direction-and-scope.md#gov-18-arm-a) the exact member signatures of this internal DI seam are not themselves binding, while the usage constraints stated on each member and the timing-source ban below remain normative. The members called out as load-bearing by other spec sections are:

- `now(): number` — monotonic milliseconds. Used for deadline math by the `SHUTDOWN_AWAIT_CAP_MS` shutdown-await (per the **Extension entry point** `session_shutdown` step above) and by [Discovery — Package walk bound](../discovery/package-and-settings.md#disc-6) to read elapsed time for the `looms.scanPackagesTimeoutMs` cap. These deadline-math callers MUST stay on the monotonic `now()` and MUST NOT migrate to `wallNow()`.
- `wallNow(): number` — Unix epoch milliseconds (wall-clock time). Used by the **Runtime event channel** above to stamp `RuntimeEvent.occurred_at` at the originating emission site.
- `setTimeout(fn: () => void, ms: number): TimerHandle` and `clearTimeout(handle: TimerHandle): void` — the only timer surface the runtime uses. The watcher's 250 ms debounce (step 5 above) and the settings-watcher debounce (per [Discovery — Settings file reads](../discovery/package-and-settings.md#settings-file-reads)) both schedule through this seam. The debouncer holds the most recent timer handle and clears it on each new event.

Production wiring uses a `WallClock` adapter that delegates `now()` to `performance.now()`, `wallNow()` to `Date.now()`, and the timer methods to the global `setTimeout` / `clearTimeout`. Tests use a `FakeClock` whose `advance(ms: number)` synchronously fires every timer whose deadline has elapsed in deadline order; equal-deadline timers fire in registration order, `clearTimeout` is a no-op for already-fired handles, `now()` returns the fake's accumulated time and is *not* implicitly advanced, and `wallNow()` returns a constructor-injected epoch value that is likewise *not* implicitly advanced. `Clock.now()` is monotonic (forbids `Date.now()`-style NTP drift); the grep-test ban below already exempts the `WallClock` adapter, so its `wallNow()` delegation to `Date.now()` is permitted. One `Clock` instance is constructed per runtime instance — never as a module-level global — and lives for the lifetime of that runtime; parallel runtimes get independent clocks. The runtime MUST NOT call `Date.now`, `performance.now`, `Date.prototype.getTime`, or the global `setTimeout` / `clearTimeout` outside the `WallClock` adapter. *Non-normative implementation note.* The reference implementation enforces this ban with a build-time grep-test (parallel to the `process.env.HOME` ban for `homedir()`); the grep-test mechanism is an implementation choice, not an observable conformance point.

<a id="fakefilesystem--filesystem-interface"></a>

<a id="pic-13"></a> **PIC-13. `FakeFileSystem` / `FileSystem` interface.** The runtime reads the filesystem exclusively through a `FileSystem` seam injected at construction time; production wiring uses a `PiFileSystem` adapter that delegates to Node, and tests use an in-memory `FakeFileSystem` whose constructor takes the values it should report. The TypeScript declaration below is a non-normative reference illustrating one conforming decomposition; per [GOV-18 arm (a)](../governance/corpus-direction-and-scope.md#gov-18-arm-a) this internal DI seam's member set is not itself binding, and the normative contract is the per-member behaviour described in the bullets that follow:

```ts
interface FileStat {
  isDirectory(): boolean;
  isFile(): boolean;
  isSymbolicLink(): boolean;
}

interface FileSystem {
  readText(path: string): Promise<string>;          // rejects with a Node-style error whose `.code` is `"ENOENT"` for missing paths and `"EACCES"` / `"EPERM"` for permission failures; other I/O failures surface their underlying `.code` unchanged
  writeText(path: string, contents: string): Promise<void>;
  exists(path: string): Promise<boolean>;           // resolves `false` on `ENOENT`; rejects on any other error
  homedir(): string;                                // production never reads `process.env` directly
  cwd(): string;                                    // factory-time working directory; production captures it once at construction and never reads `process.cwd()` ad-hoc
  readdir(path: string): Promise<readonly string[]>;// entry names only (no full paths); rejects with the same Node-style `.code` shape as `readText`
  lstat(path: string): Promise<FileStat>;           // does NOT follow symlinks; rejects with the same Node-style `.code` shape as `readText`
  realpath(path: string): Promise<string>;          // resolves symlinks to a canonical absolute path (DOES follow symlinks, unlike `lstat`); rejects with `"ELOOP"` on a symlink cycle, `"ENOENT"` when a path component (including the final tail) is missing, and `"EACCES"` / `"EPERM"` on permission failures; other I/O failures surface their underlying `.code` unchanged
}
```

- `homedir()` is the single source of truth for the [Home-directory expansion](../discovery/discovery-sources.md#disc-1) rule; the production `PiFileSystem` implementation calls Node's `os.homedir()` (resolving to `$HOME` on POSIX and `%USERPROFILE%` on Windows), and the `FakeFileSystem` implementation returns a constructor-injected string. The runtime MUST NOT read `process.env.HOME` or `process.env.USERPROFILE` directly and MUST NOT use any platform-conditional branch.
- `cwd()` is the single source of truth for the factory-time project-local discovery root (`.pi/looms/`) and project `.pi/settings.json` resolution (see [Directory Convention — Settings file reads](../discovery/package-and-settings.md#settings-file-reads)); the production `PiFileSystem` implementation captures `process.cwd()` once at construction and returns that captured value, and the `FakeFileSystem` implementation returns a constructor-injected string. The runtime MUST NOT call `process.cwd()` directly. This seam value governs only the factory-time project-local read; the runtime still prefers `event.cwd` on every `resources_discover` event (see [Registration steps](./registration-steps.md) step 1).

  <a id="cwd-project-root-presupposition"></a>*Factory-time `cwd == project root` presupposition.* The factory-time project-local discovery scan above resolves `.pi/looms/` and the project `.pi/settings.json` against the value `cwd()` captures at extension-factory construction (`process.cwd()` in the production `PiFileSystem`, per the bullet above). loom 1.0 treats it as a **presupposition** — in the same sense as the [Host prerequisites for the degraded-state branch](./host-prerequisites.md#degraded-state-host-prerequisites) and the *No concurrent user sessions in the same host process* framing in [Future Considerations](../future-considerations/model-changes-and-non-goals.md#v1-non-goals) — that Pi launches the extension factory with `process.cwd()` set to the project root, so the captured value is the directory those project-local reads are meant to resolve against. No SDK surface pins this launch-time `cwd` contract. If Pi launches the factory with `cwd` set elsewhere, project-local looms and project settings resolve against the wrong directory until the first `resources_discover` event arrives (which the [Registration steps](./registration-steps.md) step 1 path corrects by preferring `event.cwd`), with no build-time or load-time signal; the contributor SHOULD re-confirm this launch-time contract by editorial review under [Pi version bump procedure](./version-bump-intro.md#pi-version-bump-procedure) below (checklist item (w)).
- `readText`, `writeText`, and `exists` are the load-bearing surface for [Directory Convention — Settings file reads](../discovery/package-and-settings.md#settings-file-reads) and for every other normative file read or write the runtime performs.
- `readdir` and `lstat` are the load-bearing surface for the *clean leaf-`ENOENT`* ancestor walk defined in [Directory Convention](../discovery.md) (the **Failure modes** paragraph and the bullet that defines *clean leaf-`ENOENT`*) and for the package-discovery walk in [Directory Convention — Package discovery](../discovery/package-and-settings.md#package-discovery). Rejected `.code` values map onto the discovery rules verbatim: an `ENOENT` chain that bottoms out cleanly is *missing*; an `EACCES` / `EPERM` / `ENOTDIR` (or any other code) anywhere on the chain is an unreadable-source failure.
- `realpath` is the load-bearing surface for the `realpath`-then-discovery-root-containment check in [Invocation — Resolution](../invocation.md) — both the load-time check and the invocation-time re-check — and for the single named function loom 1.0 factors that check behind per the [symlink-resolution-hardening seam](../invocation.md#loom-1-0-seam-symlink-resolution-hardening). The production `PiFileSystem` implementation delegates to Node's `fs.promises.realpath`; the `FakeFileSystem` implementation resolves the path against its constructor-injected in-memory symlink table, applying the same `.code` rejections (`ELOOP` on a cycle in that table, `ENOENT` on a missing component, `EACCES` / `EPERM` on an injected permission failure) so a symlink-farm fixture exercises the same rejection surface through the fake that production reaches through Node.

<a id="filewatcher-interface"></a>

<a id="pic-14"></a> **PIC-14. `FakeFileWatcher` / `FileWatcher` interface.** Watcher attachment is a *separate* seam from `FileSystem` — production wires a chokidar adapter, and tests use an in-memory `FakeFileWatcher` whose `emit(event)` synchronously invokes every attached handler. The TypeScript declaration below is a non-normative reference illustrating one conforming decomposition; per [GOV-18 arm (a)](../governance/corpus-direction-and-scope.md#gov-18-arm-a) this internal DI seam's member set is not itself binding, and the normative contract is the per-member behaviour described in the bullets that follow:

```ts
type FileWatchEventKind = "add" | "change" | "unlink";

interface FileWatchEvent {
  kind: FileWatchEventKind;                         // matches chokidar's three load-bearing event names
  path: string;                                     // absolute path of the affected file
}

type Unsubscribe = () => void;

interface FileWatcher {
  watch(roots: readonly string[], handler: (event: FileWatchEvent) => void): Unsubscribe;
}
```

- `watch` attaches one handler over the supplied root paths. The returned `Unsubscribe` tears down the underlying watcher (chokidar's `close()` in production); calling it twice is a no-op. The handler observes only the three event kinds above — chokidar's `addDir`, `unlinkDir`, `ready`, `error`, etc. are filtered out by the adapter and never reach the runtime; the chokidar-adapter's own `error` events route through the `ctx.ui.notify` toast surface defined in [Diagnostics](../diagnostics.md), not through this seam.
- The watcher's 250 ms debounce, the build-aside-then-publish swap, and the structural-vs-content event split (per **Extension entry point** step 5 above) are runtime responsibilities layered on top of this seam — they are *not* properties of the seam itself; the seam only delivers raw events.
- One `FileWatcher` instance is constructed per runtime instance — never as a module-level global — and lives for the lifetime of that runtime; parallel runtimes get independent watchers.

<a id="tokenestimator-interface"></a>

<a id="pic-16"></a> **PIC-16. `TokenEstimator` seam.** Per-message token estimation is provided by a `TokenEstimator` service injected at construction time, modelled on the other DI seams in this section. The seam exists so that the [Session-context truncation](../binder/binder-model-and-context.md#session-context-truncation-bind_context-session) bounds — the 8000-token budget, the 20-turn cap, and the whole-turn-exclusion rule — are deterministically testable at chosen per-message integer counts, rather than coupling a conformance test to Pi's version-nondeterministic estimation heuristic or computing the expected sums by calling the estimator under test. The TypeScript declaration below is a non-normative reference illustrating one conforming decomposition; per [GOV-18 arm (a)](../governance/corpus-direction-and-scope.md#gov-18-arm-a) this internal DI seam's member set is not itself binding, and the normative contract is the behaviour described in the bullets that follow. In the illustration, `AgentMessage` is the Pi-owned agent-state message type, referenced (not redefined) here and pinned at [`SessionContext` and the `.messages` element shape](./host-interfaces-core.md#sessioncontext-shape):

```ts
interface TokenEstimator {
  estimate(message: AgentMessage): number;          // per-message token count consumed by the session-context truncation walk
}
```

- Production wiring uses a `PiTokenEstimator` adapter whose `estimate(message)` delegates to the `estimateTokens` named import pinned at [`estimateTokens` (named export)](./host-interfaces-core.md#estimatetokens-named-export); the adapter forwards the message and returns the import's result unchanged, redefining none of Pi's estimation algorithm.
- Tests use a `FakeTokenEstimator` whose constructor takes the per-message counts it should report; `estimate(message)` returns the configured integer for each message rather than deriving one from message content, so a conformance test for the truncation bounds drives the running token total and turn count across the caps at known boundaries.
- One `TokenEstimator` instance is constructed per runtime instance — never as a module-level global — and lives for the lifetime of that runtime; parallel runtimes get independent estimators.

**Discovery API.** The extension owns enumeration; it subscribes to `resources_discover` solely as a re-discovery trigger and returns the empty result `{}` (`ResourcesDiscoverResult` has no `loomPaths` field — looms reach Pi through `pi.registerCommand`, not as a Pi-managed resource type). The five sources, their priority order, the package-root walk, and the failure-mode table are all in [Directory Convention](../discovery.md). Cross-format collision detection consults `pi.getCommands()` on `session_start` (per the **Extension entry point** numbered list above); the call would throw if invoked during the extension factory itself (per the pre-bind action-method rule in **Extension entry point** step 2), which is why discovery is split across the factory (parse + pending list) and the `session_start` handler (collision check + `pi.registerCommand`).

> **loom 1.0 seam — Pi-owned subagents collision source set.** <a id="loom-1-0-seam-pi-owned-subagents-collision-source-set"></a><a id="v1-seam-pi-owned-subagents-collision-source-set"></a> The set of `SlashCommandSource` values the `session_start` handler treats as collision candidates (`"prompt"`, `"extension"`, `"skill"` under `@earendil-works/pi-coding-agent` at the [loom 1.0 Pi-SDK pin](./host-prerequisites.md#pi-sdk-pin)) MUST be defined as a single named set inside the runtime, consulted by the collision check via membership test rather than open-coded as three separate string comparisons or a hard-coded `switch`. The deferred *Pi-owned subagents exposed as enumerable slash commands* extension in [Future Considerations](../future-considerations.md) lands by widening that set to four arms (adding a `"subagent"` entry) when a future Pi minor extends `SlashCommandSource` accordingly; widening the set is the only loom 1.0 surface that perturbs, and the asymmetric loser-drops collision rule defined in [Discovery](../discovery.md) is preserved by construction.

**No Pi-owned discovery path enumerates `.loom` or `.warp`.** Under the [loom 1.0 Pi-SDK pin range](./host-prerequisites.md#pi-sdk-pin), Pi exposes exactly three slash-command sources (`source: "prompt" | "extension" | "skill"`, per `@earendil-works/pi-coding-agent`'s `core/slash-commands.d.ts`); `prompt` and `skill` enumerate `*.md` files only, and `extension` requires programmatic `pi.registerCommand` calls. The `resources_discover` event carries `skillPaths` / `promptPaths` / `themePaths` only — there is no `loomPaths` slot — and the `pi` package-manifest namespace recognises only `extensions` / `skills` / `prompts` / `themes` / `video` / `image`. Therefore the only path by which a `.warp` file could become a slash command is through this extension's own discovery walk; that walk matches `*.loom` only (per [Directory Convention](../discovery.md) and [Discovery — File-extension namespace](../discovery/discovery-sources.md#file-extension-namespace)), so the `.warp`-cannot-be-slash-invoked guarantee in [`spec.md`](../../spec.md) Introduction holds by construction. A Pi minor that adds a fourth `SlashCommandSource` arm, a `loomPaths` field on `ResourcesDiscoverResult`, or a generic file-extension registry MUST trigger a re-validation of this paragraph as part of the [Pi version bump procedure](./version-bump-intro.md#pi-version-bump-procedure) below, in the same edit that widens `peerDependencies`.
