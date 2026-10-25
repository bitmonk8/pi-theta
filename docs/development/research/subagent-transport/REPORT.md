# Why custom async subagents select pipe instead of Herdr

> **Developer research, not end-user documentation or an accepted specification.**
> Relocated from `.pi/tmp/herdr-subagent-investigation/REPORT.md`. Historical release/source pins and evidence limitations remain in force.
> Unless a link points to another tracked document, experiment paths and reproduction instructions refer to the original local evidence workspace, `.pi/tmp/herdr-subagent-investigation/`; downloads, caches, scripts and raw logs remain gitignored and are not required to read this report.

## Finding

**The installed managed-launch path exposes a symlink as `process.argv[1]`. The subagent extension computes the SDK entry relative to the symlink's directory, without resolving the symlink. It therefore looks for `node_modules/.bin/index.js`, which does not exist.** `resolvePiEntry()` returns `null`, `paneChildRunnable()` returns `false`, and automatic transport selection returns `pipe`, even with a valid Herdr environment and both helper files present.

This is an SDK-entry-resolution defect, **not a missing `dist/bundle/index.js`, missing Herdr environment, broken `import.meta.url`, or a demonstrated Herdr socket failure**. An isolated invocation through the actual managed launcher reproduces the failure with the installed loader and canonical extension source. Changing only the throwaway process's CLI pathname from the symlink to its real target makes the same functions select `herdr`.

No fix or live configuration change was applied.

## Scope and evidence discipline

Investigation artifacts are exclusively under:

`/home/thomasa/Projects/pi-theta/.pi/tmp/herdr-subagent-investigation/`

Abbreviations below:

- `CONFIG` = `/home/thomasa/.pi/agent/git/github.com/bitmonk8/pi-config`
- `PI` = `/home/thomasa/.pi/agent/install/releases/1.3.0/node_modules/@earendil-works/pi-coding-agent`
- `SESSION` = `/home/thomasa/.pi/agent/sessions/--home-thomasa-Projects-pi-theta--/2026-10-19T14-22-16-499Z_01a1548a-abb2-716d-8d9c-0c95ea2ec0cb.jsonl`

Only records with `customType: "subagent-child"` were decoded from `SESSION`; task text, unrelated messages, and reasoning were not displayed or copied. Environment inspection used an explicit nonsecret key allowlist. No credentials/auth files were read. No model calls or Herdr requests were made by the diagnostic probes.

## 1. What the active jobs actually did

`metadata.log` records these targeted launch entries:

| SESSION line | Timestamp (UTC) | Job | Agent | Transport |
|---:|---|---|---|---|
| 75 | 2026-10-19 14:31:00.800 | sub-1 | theta-port-research | pipe |
| 78 | 2026-10-19 14:31:16.516 | sub-2 | theta-port-research | pipe |
| 174 | 2026-10-19 14:59:04.952 | sub-3 | theta-host-investigator | pipe |
| 177 | 2026-10-19 14:59:17.248 | sub-4 | theta-host-investigator | pipe |
| 213 | 2026-10-19 15:04:02.052 | **sub-5 (this investigation)** | herdr-transport-investigator | **pipe** |

These are initial selection values, not a guessed classification from missing tabs: `CONFIG/extensions/subagent/index.ts:2359–2406` calls `selectTransport()`, writes that exact `mux` into the durable launch entry, and then dispatches to `runInHerdr`, `runInPane`, or `runOnStdout`. A failed Herdr connection after selecting Herdr would not explain an initial ledger value of `pipe`.

**This diagnostic agent also runs through pipe.** Its OS PID was verified as `317809`, direct child of parent PID `307088`. Its stdin is `/dev/null`; stdout and stderr are nonterminal socket endpoints used by Node child-process stdio. It has no separate terminal/pane. The `HERDR_PANE_ID=w3:p9` it inherits identifies the parent's pane, not a newly created diagnostic pane. Therefore inherited Herdr identity alone does not establish that a child has a visible Herdr tab. Durable ledger records, parent-side progress/results, and session files remain available; there is no independent child TUI to inspect. No additional investigative subagents were launched.

## 2. Parent identity and environment provenance

Verified parent PID `307088` still existed, had PPID `307063`, cwd `/home/thomasa/Projects/pi-theta`, and executable:

`/home/thomasa/.local/share/pi-node/node-v22.23.3-linux-x64/bin/node`

`process-identity.log` records its start as 2026-10-19 16:22:15 local time, consistent with the session start in UTC. Its stdio is `/dev/pts/6`; process title and first `/proc/.../cmdline` field are `pi`.

Allowlisted `/proc/307088/environ` inspection found:

```text
HERDR_ENV=1
HERDR_SOCKET_PATH=/home/thomasa/.config/herdr/herdr.sock
HERDR_PANE_ID=w3:p9
HERDR_WORKSPACE_ID=w3
HERDR_TAB_ID=w3:t9
TERM_PROGRAM=herdr
PI_MANAGED_INSTALL_ROOT=/home/thomasa/.pi/agent/install
_=/home/thomasa/.pi/agent/bin/pi
```

`PI_SUBAGENT_MUX`, `PI_SUBAGENT_PI_ENTRY`, `PI_SUBAGENT_PANE`, `PI_CODING_AGENT_DIR`, and `NODE_OPTIONS` were absent. The relevant Herdr values and absence of the three transport overrides were also present in this diagnostic child's initial environment, corroborating what the parent actually passed when spawning it, not merely shell startup exports. The parent shell's initial Herdr identity agreed as well. `/proc/environ` alone is an initial-environment observation, not a general readout of later JavaScript `process.env` changes.

`CONFIG/node_modules/@bitmonk8/pi-theta-herdr/src/herdr-client.ts:30–35` requires precisely `HERDR_ENV === "1"` plus nonempty socket, pane, and workspace fields. `HERDR_TAB_ID` and `TERM_PROGRAM` are not gates. The observed environment passes this check, including in the executable probe.

## 3. Effective extension and loader identity

This was investigated against the installed runtime rather than assuming the repository's development loader was active:

- Personal resource settings select `git:git@github.com:bitmonk8/pi-config`; project settings add no extension/package override. `CONFIG/package.json` declares `./extensions` among its extension roots. The project's `.pi/extensions` directory does not exist; the personal loose-extension directory contains `herdr-agent-state.ts`, not another subagent implementation.
- Installed package versions: Pi **1.3.0**, jiti **2.7.0** (`source-evidence.log`). Canonical pi-config HEAD observed: `6e50b1be998198732270cf96cd6f74e858186d5c`.
- The `.bin/pi` symlink targets `PI/dist/bundle/cli.js`. Its entry runs `cli-runtime.js`; the bundled loader uses embedded virtual modules and jiti. The actual bundled loader is in `PI/dist/bundle/chunks/chunk-66G7ITPS.js:706`; its jiti wrapper is `jiti-static-loader-E6ANQD5T.js:2`, and its virtual module map is `virtual-modules-A7JIGWCY.js:2` in that same chunks directory.
- The readable installed counterpart `PI/dist/core/extensions/loader.js:461–483` shows the same load sequence: embedded `virtualModules`, `tryNative: false`, `moduleCache: false`, then `jiti.import(extensionPath)`.
- A pre-existing jiti cache artifact, `/tmp/jiti/subagent-index.b52c54ab.mjs`, identifies the extension as the canonical `CONFIG/extensions/subagent/index.ts`. At lines **1204–1229**, `import.meta.url` in `extensionDir()` is compiled into the literal URL `file:///home/thomasa/.pi/agent/git/github.com/bitmonk8/pi-config/extensions/subagent/index.ts`, and the resolver retains the uncanonicalized `process.argv[1]` logic.
- Re-transforming the current canonical source with the installed bundled jiti and its actual virtual-module map produced a **byte-identical cache body**. The only additional bytes in the existing disk artifact are jiti's trailing ` /* v9-0db15bcfc0d2d36a */\n` cache marker. This rules out stale/different resolver logic in that artifact.
- In the executable probe, `extensionDir()` returns the canonical extension directory and both `subagent-pi.mjs` and `resilience.mjs` exist there. Thus jiti's `import.meta` handling is correct for this extension and is not the failing prerequisite.

Canonical source SHA-256:

`b354b3bb542412327ef0cca5ce980d182a452bd5da3cbddfcbee5b408947a5b8`

Transformed body SHA-256:

`aa1c6e329abe3a00795a16998817c4033349ec8f6d32f46355b90bf8d107d324`

**Observation limit:** I did not attach a debugger, read the parent's heap, or execute new code in its live extension runtime. Configuration/discovery provenance and the installed cache artifact identify the applicable implementation; the process-title-overwritten parent does not directly reveal its historical JavaScript `argv[1]`. The launch-path/runtime facts below are measured in an isolated invocation of the same installed launcher, not falsely presented as a live-parent heap snapshot.

## 4. Exact failing prerequisite, reproduced without inference tokens

### Installed launch chain

`/home/thomasa/.pi/agent/bin/pi:25–26,35–42` selects the release `.bin/pi`, puts the managed Node on PATH, and executes:

```sh
exec "$pi_release_bin" "$@"
```

It does not resolve that executable symlink before invocation. Node resolves the main module for loading, but **retains the invocation pathname in `process.argv[1]`**. The isolated managed-launch probe measured:

```text
process.execPath = /home/thomasa/.local/share/pi-node/node-v22.23.3-linux-x64/bin/node
process.argv[1]  = /home/thomasa/.pi/agent/install/releases/1.3.0/node_modules/.bin/pi
realpath(argv1)  = /home/thomasa/.pi/agent/install/releases/1.3.0/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js
```

The original resolver, `CONFIG/extensions/subagent/index.ts:1219–1230`, uses:

```ts
const cliScript = process.argv[1];
const candidate = path.join(path.dirname(cliScript), "index.js");
return fs.existsSync(candidate) ? candidate : null;
```

Therefore its actual candidate is:

```text
/home/thomasa/.pi/agent/install/releases/1.3.0/node_modules/.bin/index.js
exists = false
```

The correct sibling after resolving the CLI symlink is:

```text
/home/thomasa/.pi/agent/install/releases/1.3.0/node_modules/@earendil-works/pi-coding-agent/dist/bundle/index.js
exists = true
```

`PI/dist/index.js` also exists. Neither real SDK entry is missing.

### Actual selector results in an isolated managed invocation

`managed-runtime-probe.log:2` captures the **unmodified ambient argv/environment** in a new invocation through the installed managed launcher, evaluating the canonical extension using the installed bundled loader's jiti configuration:

```text
importMetaUrl       = file:///home/thomasa/.pi/agent/git/github.com/bitmonk8/pi-config/extensions/subagent/index.ts
extensionDir        = /home/thomasa/.pi/agent/git/github.com/bitmonk8/pi-config/extensions/subagent
herdrEnv()          = {socketPath: ..., paneId: "w3:p9", workspaceId: "w3"}
resolvePiEntry()    = null
paneChildRunnable() = false
selectTransport()   = "pipe"
```

`paneChildRunnable()` (`index.ts:1430–1436`) short-circuits on its first condition, `resolvePiEntry() !== null`. Both helper files exist, but that cannot make this expression true. `selectTransport()` (`index.ts:1460–1478`) then has no explicit override, gets `herdrReady === false`, has no WezTerm opt-in, and returns `pipe`. Automatic failure is silent: its warning branch only runs for an explicit `PI_SUBAGENT_MUX=herdr`.

`getPiInvocation()` (`index.ts:669–671`) preserves the current CLI pathname for ordinary pipe children. Thus children launched as `node .../node_modules/.bin/pi ...` repeat the same resolver failure for their own nested calls. That also explains why this diagnostic job's inherited valid Herdr fields do not repair its own prerequisites.

### Controlled behavior matrix

The same probe then changes only its own disposable process's argv/env, restoring them afterward. Nine assertions passed:

| Case | SDK entry | Selected transport |
|---|---|---|
| Managed `.bin/pi`, valid Herdr env | null | pipe |
| Resolved `dist/bundle/cli.js`, same env | `dist/bundle/index.js` | herdr |
| Direct `dist/cli.js`, same env | `dist/index.js` | herdr |
| `.bin/pi` plus valid published SDK entry | published entry | herdr |
| `.bin/pi`, force `PI_SUBAGENT_MUX=herdr` | null | pipe, with warning |
| `.bin/pi`, force WezTerm | null | pipe |
| Resolved CLI, explicit pipe | valid | pipe |
| Resolved CLI, invalid Herdr env flag | valid | pipe |
| `.bin/pi`, `PI_SUBAGENT_PANE=1` | null | pipe |

These are assertions of **current behavior**, not a claim that the symlink bug is fixed. They prove the specific differential and reject the tempting but ineffective override-only workarounds.

### Reproduction commands

From the research workspace:

```sh
NODE_OPTIONS="--import=$PWD/preload-argv.mjs" \
  /home/thomasa/.pi/agent/bin/pi > managed-launch-argv.log

NODE_OPTIONS="--import=$PWD/managed-transport-preload.mjs" \
  /home/thomasa/.pi/agent/bin/pi > managed-runtime-probe.log 2>&1
```

Both probes exit in the new process's preload, before the CLI's main entry executes. The second imports SDK library modules and evaluates the original extension source with diagnostic named exports added only in memory; it **never calls the extension's default factory**, starts a session, contacts a model, or connects to Herdr. jiti filesystem caching is explicitly disabled for the probes. The original source is never rewritten. `canonical-transformed.mjs` is a diagnostic copy in this workspace.

## 5. Facts versus attribution

**Directly observed:** all five durable launch choices; parent/child process relationships and executable; relevant initial environments and child's inherited runtime env; configured extension roots; installed loader implementation; exact canonical-source/cache-body match; correct jiti `import.meta.url`; helper existence; actual managed-launch argv; actual original selector returning pipe; selector returning Herdr when only the scratch process's CLI pathname is canonicalized.

**Attribution to the active parent's historical launches:** high-confidence inference from that exact installed launch-path reproduction, the parent's launcher/environment provenance, and matching durable outcomes. Its historical JavaScript `argv[1]` is not independently recovered from the live heap. There is no evidence of another override or different extension implementation. If absolute per-launch attestation were required, the smallest additional observation would be a read-only in-process snapshot of `process.argv[1]`, `extensionDir()`, `resolvePiEntry()`, and the three prerequisite booleans at selection time; no restart or model call is intrinsically necessary, but no existing diagnostic hook was used to inject that observation into the live session.

**Not established/tested:** Herdr socket liveness, successful `layout.apply`, actual pane startup after fixing selection, or every later SDK compatibility prerequisite. None is consulted by this failed selector path, so none explains the observed initial `pipe` decision. Selecting Herdr in the scratch process is not an end-to-end pane-launch success claim.

## 6. Minimal proposed remedy/workaround — not applied

### Preferred source remedy

In `resolvePiEntry()`, preserve the existing valid `PI_SUBAGENT_PI_ENTRY` precedence, but resolve the CLI pathname with `fs.realpathSync(cliScript)` **before** taking its directory and looking for `index.js`. Handle a missing/unresolvable CLI path with the existing fail-closed `null` result rather than an uncaught exception. No change to Herdr detection or transport preference is needed.

This is a local resolver correction: it finds the already installed `dist/bundle/index.js`; it does not require adding an SDK file beside `.bin/pi` or changing jiti's metadata handling.

### Operational workaround for a future invocation

If the operator elects to start a separate future session, invoking the **real CLI file with the managed Node** avoids the symlink-directory mistake. Do not restart or disturb the existing session to apply this investigation:

```sh
/home/thomasa/.local/share/pi-node/node-v22.23.3-linux-x64/bin/node \
  /home/thomasa/.pi/agent/install/releases/1.3.0/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js
```

`PI_SUBAGENT_MUX=herdr` or `PI_SUBAGENT_PANE=1` alone does **not** bypass the runnable-child gate. A valid `PI_SUBAGENT_PI_ENTRY` also passes the selector, but is a less clean top-level workaround: `index.ts:4013–4016` additionally treats its presence as evidence of an embedded/headless child for async lifecycle guidance. Prefer correcting path resolution or using the real CLI over casually publishing a child marker in an interactive root.

## 7. Minimal regression tests to verify a future fix

1. **Primary red/green test:** create a scratch `.bin/pi` symlink to a fixture `dist/bundle/cli.js`, with adjacent `dist/bundle/index.js`, valid Herdr env, and helpers present. Call the real resolver/selector with `argv[1]` equal to the symlink. Assert the resolved SDK entry is the real bundle sibling and the transport is `herdr`. Current source returns `null`/`pipe` (the observed red); a fix must turn this green. Include a two-hop symlink case if inexpensive.
2. **Installed-loader/path identity test:** run a provider-free child through an npm-style executable symlink, using the installed bundled jiti/virtual-module path. Assert `extensionDir()` still identifies the actual extension and both helpers resolve there. This protects against falsely fixing the CLI problem by rewriting `import.meta` or using a stale development loader.
3. **Precedence and failures:** preserve valid published-entry precedence for nested pane children; direct bundled and unbundled CLI paths still work; absent/broken CLI or missing helper returns pipe without throwing; explicit pipe still wins; missing Herdr fields do not select Herdr. Inject/mock helper existence rather than renaming live files.
4. **Observability assertion:** when auto-detection has valid Herdr env but cannot find a prerequisite, an optional diagnostic should identify the exact failed path, not merely say “pi entry/subagent-pi.mjs not found.” Any added logging must not dump environment contents or credentials. This is an improvement, not required for the minimal resolver fix.

A future end-to-end pane smoke test would be separate and operator-authorized; provider inference is unnecessary to prove or regress this prerequisite failure.

## Safety/result

No project source/tests/docs/configuration, personal configuration, installed extension, or Herdr state was changed. No commit/reset/pull/update/reload/restart/termination/resume was performed. Existing parent jobs, including sub-3 and sub-4, were not controlled or modified. Only disposable offline diagnostic processes were launched; they exited themselves normally. All intentionally written scripts, copied source, logs, and this report are in the gitignored research workspace. No further async children were delegated, so there are no investigative children awaiting collection.
