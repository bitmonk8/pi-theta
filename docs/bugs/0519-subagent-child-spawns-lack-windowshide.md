# Bug 0519 — on Windows every subagent child process pi-theta spawns opens its own console window: none of the three production `child_process.spawn` sites in `production-subagent-host.ts` passes `windowsHide: true`, so under a console-less parent (a pi itself spawned hidden, e.g. by a harness that sets `windowsHide`) each headless `pipe`-placement child `pi`, each `exec`-placement template command and each teardown `taskkill` gets a fresh visible conhost window

- **Status:** fixed (unreleased - commit/push only). No new package release is
  published; the existing package version does not contain this fix. The
  shipment commit will supply the resolving SHA; none is assigned here.
- **Filed:** 2026-10-03 from the LPS tooling build (model-test runs with
  `subagentPlacement: "pipe"` on Windows 11; observation under "Observed",
  repro under "Repro" below). The original report below is historical;
  the verified fix and its evidence limits are recorded under "Resolution".
- **Owning repo:** pi-theta
- **Sev/Diff estimate:** S3/D1 — S3: no wrong value, no refusal, no lost
  result — the child's stdio is fully piped/ignored and its contract is
  unchanged — but every subagent launch from a console-less parent puts a
  short-lived, focus-stealing console window titled `pi` on the operator's
  desktop (one per child, plus one per teardown `taskkill`), so a fan-out
  theta under an automated harness floods the desktop for the whole run and
  the harness cannot suppress it from outside (its own `windowsHide` is what
  makes the parent console-less in the first place). Masked in ordinary
  interactive use: a pi running in a terminal has a console and its children
  attach to it. D1: one option on three call sites in one file; the pinned
  host already applies the same option to its own spawns (pi-coding-agent
  0.80.10 `dist/core/tools/bash.js:59`,
  `dist/core/resolve-config-value.js:140` both pass `windowsHide: true`).
- **Where (pi-theta, main 7c5998d3, 0.496.0):**
  - `src/extension/production-subagent-host.ts:15` — `import { spawn as
    nodeSpawn } from "node:child_process"`: the ONLY `node:child_process`
    import in `src/` (`grep -rn child_process src/`); every OS process
    pi-theta creates goes through the three calls below.
  - `src/extension/production-subagent-host.ts:598-607` —
    `createProductionSpawnFn`: `nodeSpawn(execPath, [...args], { cwd, env,
    shell: false, stdio: ["ignore", "pipe", "pipe"] })` — the child `pi`
    launch itself (rung 1: `process.execPath` = `node.exe`, a
    console-subsystem binary, `production-subagent-host.ts:94`). No
    `windowsHide`.
  - `src/runtime/subagent-placement.ts:191-221` — `createPipePlacementBackend`:
    the built-in `pipe` placement's `place()` calls the injected `SpawnFn`
    (`:201`, `spawn(request.execPath, request.args, { cwd, env })`) — not a
    node spawn of its own; the injected function is the one above, wired at
    `src/extension/production-composition.ts:1368`
    (`createPipePlacementBackend(createProductionSpawnFn())`). The seam's
    `SpawnFn` options carry only `cwd`/`env`, so a backend cannot ask for
    the option either.
  - `src/extension/production-subagent-host.ts:536`, spawn at `:545-550` —
    `createProductionExecCommandRunner` (the `exec` placement's
    `spawn`/`kill` template runner, wired at
    `production-composition.ts:1376`): `nodeSpawn(command, args, { cwd, env,
    shell: false, stdio: ["ignore", "pipe", "pipe"] })`. No `windowsHide`.
  - `src/extension/production-subagent-host.ts:435-470` — `killChildTree`,
    win32 arm `:453-455`: `nodeSpawn("taskkill", ["/PID", String(pid),
    "/T", "/F"], { shell: false })` — the PIC-65/PIC-66 process-tree kill
    (default stdio, all piped). No `windowsHide`.
  - `grep -rn windowsHide src/` → no hits.
  - Window title: the child runs pi-coding-agent's `dist/cli.js`, whose line
    11 sets `process.title = APP_NAME` — on Windows that is the console
    title, hence windows titled `pi`.
- **Spec:** none violated in letter.
  `docs/spec_topics/pi-integration-contract/subagent.md:121-122`
  (*Child stdio*) pins `stdio: ["ignore","pipe","pipe"]` and `:43-44`
  (*Launch contract*) pins the inherited env and resolved cwd; neither
  promises nor needs a console window — the child has no terminal-facing
  surface under `pipe` (`capabilities: { visible: false, … }`,
  `subagent-placement.ts:195`). `windowsHide` changes no observable of the
  launch contract.

## Symptom

Run pi on Windows as a child of a process that itself spawned it with
`windowsHide: true` (any Node harness hiding its children — LPS's process
tooling does this for every spawn). Invoke a theta that launches subagent
children under the default `pipe` placement. One console window titled `pi`
opens per child and closes when the child exits; a fan-out (`par for` over
`mode: subagent` callees) opens several at once. A teardown that reaches the
tree-kill additionally flashes a `taskkill` console window.

## Observed (LPS tooling build, 2026-10-03, Windows 11)

- During LPS model-test runs with `subagentPlacement: "pipe"`, the operator
  saw many short-lived console windows titled `pi` open and close on the
  desktop.
- LPS then added `windowsHide: true` to every spawn in its own tooling
  (`LocalProjectService/tools/**`). The windows did not go away: the
  remaining ones were the subagent children pi-theta launched from the
  (now hidden) parent pi — consistent with the mechanism below, under which
  hiding the outer pi makes it console-less and moves the window down one
  level to each pi-theta child.
- No pi run or model turn was made for this filing; the code facts above
  were re-read at main 7c5998d3.

## Mechanism (Node / libuv semantics)

- Node `child_process.spawn` documents `windowsHide`: "Hide the subprocess
  console window that would normally be created on Windows systems.
  **Default:** `false`." (nodejs.org/api/child_process.html).
- Node maps the option to `UV_PROCESS_WINDOWS_HIDE` (`src/process_wrap.cc`,
  `kProcessFlagWindowsHide`); libuv (`src/win/process.c`, `uv_spawn`) then
  passes `CREATE_NO_WINDOW` to `CreateProcessW` when no stdio slot is
  `UV_INHERIT_FD`, and `SW_HIDE` in `STARTUPINFO`.
- Without `CREATE_NO_WINDOW`, Windows attaches a console-subsystem child to
  the parent's console if the parent has one, and **allocates a new console
  window** if it does not.
- Hence: a harness that spawns pi with `windowsHide: true` (and piped stdio)
  creates the pi process with `CREATE_NO_WINDOW` — no console. Every
  console-subsystem child that pi then spawns without the option
  (`node.exe` for the child pi, `taskkill.exe`) gets its own visible console.
  All three pi-theta sites pipe or ignore every stdio slot, so adding the
  option yields `CREATE_NO_WINDOW` at each of them; on POSIX the option is
  ignored.
- The same holds one level down: a child pi that launches nested subagent
  children is itself console-less once spawned hidden, so the option must be
  on the child launch for nesting to stay windowless.

## Expected

Every OS process pi-theta creates on Windows is created without a console
window: the headless child `pi`, the `exec` template commands and the
teardown `taskkill`. Nothing in the launch contract needs a console window,
and the pinned host already follows this rule for its own spawns.

## Actual

No pi-theta spawn site passes `windowsHide`
(`production-subagent-host.ts:453-455`, `:545-550`, `:600-605`). Under a
console-less parent each spawn allocates a new console window; under a
console parent the children attach to it and nothing shows, which is why
interactive terminal use never sees the defect.

## Fix direction

1. Add `windowsHide: true` to the three `nodeSpawn` option objects in
   `src/extension/production-subagent-host.ts` (`createProductionSpawnFn`,
   `createProductionExecCommandRunner`, the `killChildTree` win32
   `taskkill`). Unconditional is correct: the option is a no-op on POSIX, so
   no `isWindows()` branch is needed. Nothing else moves — stdio, `shell:
   false`, env and cwd stay as pinned.
2. Keep the rule for future spawn sites: one sentence in the file header
   (beside the existing "Windows-safe" note) and a source-level gate that
   fails when a `nodeSpawn(` call in `src/` lacks `windowsHide: true` (the
   repo's existing source-scan tests are the model).
3. Witness (offline, no model): spy on `node:child_process.spawn` (or inject
   the spawn primitive) and assert `windowsHide: true` in the options for
   each of the three sites — the `SpawnFn` launch, an `exec` runner call,
   and the win32 `taskkill` branch of `killChildTree` driven with a defined
   pid on a fake child. RED at 7c5998d3 (all three options objects lack the
   key), GREEN after the fix. The option assertion is the gate; a
   behavioural Windows-only real-spawn cell (console-less node parent
   spawning through `createProductionSpawnFn`, child reporting whether it
   was given a console) is optional extra evidence.
4. `pi-theta-herdr` and other registered placement backends own their own
   spawns and are out of scope; the `SpawnFn` seam needs no change.

## Repro

Windows, no model turn needed beyond a query-less subagent callee:

1. A root with `.pi/settings.json` → `{ "theta": { "subagentPlacement":
   "pipe" } }`, a `mode: subagent` theta `child.theta` whose body is
   `"ok"`, and a prompt-mode `parent.theta` that does
   `par for i in [1, 2, 3] { invoke("./child.theta") }`.
2. From a Node script, spawn pi hidden:
   `spawn(process.execPath, [<pi cli.js>, "-p", "/parent"], { cwd: <root>,
   stdio: ["ignore", "pipe", "pipe"], windowsHide: true })`.
3. Observed: three console windows titled `pi` appear (one per child) and
   close as the children exit. Spawn the same pi from a terminal without
   `windowsHide` (step 2 minus the option, or `pi -p "/parent"` directly):
   no windows — the children attach to the inherited console.
4. With the three `windowsHide: true` additions applied to the installed
   `production-subagent-host.ts`, step 2 opens no windows.

## Resolution — fixed, unreleased

The three production spawn boundaries omitted Node's `windowsHide` option.
Piped stdio and `shell: false` did not supply that policy. The fix adds literal,
unconditional `windowsHide: true` to `createProductionSpawnFn`,
`createProductionExecCommandRunner`, and the win32 `taskkill` call in
`killChildTree` (`src/extension/production-subagent-host.ts`). A header comment
records the policy; POSIX ignores the option.

No argv, cwd, env identity/copy behavior, shell/stdio, result protocol, placement
capability, cancellation budget, pipe cleanup or error handling changes. The
exec runner hides its incidental launcher console, not an intentional pane
created by an operator template. Third-party placement backends and processes
created by external commands retain responsibility for their own spawns.
No normative spec change is needed or made.

Three additive regression files cover the fix:

- `tests/b0519-real-spawn-windows-hide.test.ts` observes actual Node spawns
  without replacing execution. The real pi child must return its exact value
  and exit naturally with code 0/null signal, without a watchdog kill, before
  checking the option. The real exec command must preserve cwd/env/argv,
  receive stdin EOF, and return exact stdout/stderr and exit status first.
- `tests/b0519-spawn-windows-hide-unit.test.ts` isolates child/exec options on
  simulated win32 and Linux and the defined-pid win32 taskkill branch. Controls
  preserve tree-kill argv, direct SIGKILL paths, pipe destruction, synchronous
  spawn-throw fallback, async error containment and exec-abort rejection.
- `tests/b0519-spawn-windows-hide-source.test.ts` scans production TypeScript
  for every `nodeSpawn` call, requires at least the three established sites,
  and rejects missing/false/nonliteral options and later unknown overrides.
  Acceptance/rejection controls cover decoys, duplicate and escaped keys,
  spreads, computed keys and neighboring calls. This is a `nodeSpawn`
  convention guard, not an audit of arbitrary aliases or dynamic imports.

### Preserved red / verified green evidence

Pre-fix verification targets HEAD
`9bd9f080b8875e71a3b0c2488e4f6a468657d010`, not only the filing's older HEAD.
Each frozen command below exits **1** before the fix and **0** after it.
The failures specifically report `expected undefined to be true` for the named
`windowsHide=true` assertion after the functional controls pass; no provider
error, timeout or missing executable is counted as a bug witness. Both original
witness files, all argv/signatures, and accepted red captures remain unchanged.

All artifact names below are relative to the durable run directory:

```text
/home/thomasa/Projects/pi-theta/.pi/tmp/fix-bug-0519-c62148ca-19b3-4ddf-9979-1b1efc1bebe2
```

| Exact command | Pre-fix capture (exit 1) | Post-fix capture (exit 0) |
| --- | --- | --- |
| `npx vitest run tests/b0519-real-spawn-windows-hide.test.ts -t 'real subagent child requires windowsHide'` | `red-0.json` | `green-1-0.json` |
| `npx vitest run tests/b0519-real-spawn-windows-hide.test.ts -t 'exec template command requires windowsHide'` | `red-1.json` | `green-1-1.json` |
| `npx vitest run tests/b0519-spawn-windows-hide-unit.test.ts -t 'SpawnFn requires windowsHide'` | `red-2.json` | `green-1-2.json` |
| `npx vitest run tests/b0519-spawn-windows-hide-unit.test.ts -t 'exec runner requires windowsHide'` | `red-3.json` | `green-1-3.json` |
| `npx vitest run tests/b0519-spawn-windows-hide-unit.test.ts -t 'taskkill requires windowsHide'` | `red-4.json` | `green-1-4.json` |

The supplemental source guard also ran red before production edits, naming
exactly the three omissions (`implement-01-source-red.log`, exit 1). Final
combined regressions and healthy controls pass all 41 cells
(`implement-01-all-regressions-final.log`, exit 0). Independent pre-fix review
repeats the seven policy failures with eleven healthy controls; post-fix review
passes all 83 regression and existing-control cells, with no skipped cells.

### Gates and independent review

These are captured completed commands, not proposed verification:

| Exact command | Artifact | Exit / result |
| --- | --- | --- |
| `npm run typecheck` | `gate-1-initial-0.json`; `review-fix-independent-typecheck.log` | 0 each |
| `npm test` | `gate-1-initial-1.json`; `implement-01-default-suite-final.log` | 0 each; 779 files / 13,318 tests pass |
| `npm run lint` | `implement-01-lint-final.log`; `review-fix-independent-lint.log` | 0 each |
| `npx vitest run --config config/vitest/vitest.live.config.ts tests/live/live-production-acceptance.test.ts -t 'drives a subagent-mode theta'` | `gate-1-initial-2.json`; `review-fix-independent-live.log` | 0 each; real-provider/real-child selected test passes |
| `npx vitest run tests/b0519-real-spawn-windows-hide.test.ts tests/b0519-spawn-windows-hide-unit.test.ts tests/b0519-spawn-windows-hide-source.test.ts` | `implement-01-all-regressions-final.log` | 0; 41 tests pass |

The live test checks registration and the settled `theta-system-note` channel
for fail-closed endings; its green is not inferred from `prompt()` resolving.
Targeted `-t` commands leave unrelated cells unselected; full regression and
default-suite runs have no skipped cells. External bootstrap-provided temporary
directories keep transient fixtures outside repository/run ancestry.

Independent evidence review (`evidence-review.md`) and fix review (`reviews.md`)
are **CLEAN**, with no actionable in-scope must-fix findings. The fix reviewer
also records a real production launch through the operator's pi 1.4.0 bundled
CLI and this worktree's extension: exact result, natural code-0/null-signal exit
and no watchdog (`review-fix-actual-host-final.log`). The ordinary real-child
regressions use the repo-pinned pi 1.3.0. These host versions are verification
inputs, not pi-theta release versions.

### Limits and separate residual

Verification runs on Linux. Native Windows console visibility, focus/title,
native taskkill execution and nested Windows fan-out are **not measured**.
The original report makes that Windows behavioral probe optional; the required
real-process option assertions and isolated win32 branch coverage are green.
No full live-suite pass is claimed.

The existing asynchronous taskkill-error handler swallows the error and returns
without the direct-kill fallback implied by its comment. The unit control proves
containment and pipe cleanup, not successful OS reaping after that error. This
pre-existing lifecycle residual is outside 0519 and remains unchanged; no new
numbered residual report or lifecycle repair is included in this closure.

No package/dependency version changes, staging, commit, push, tag or publication
occur in this run. **No new package release is published.** This is an unreleased
worktree fix; the existing package version is not credited with it.

## Provenance

- The filing's Observed/Mechanism/Repro sections preserve the original Windows
  report and Node/libuv rationale; they are not new Windows observations.
- `createProductionSpawnFn`, `createProductionExecCommandRunner` and
  `killChildTree` (`src/extension/production-subagent-host.ts`) establish the
  three-site fix and unchanged lifecycle behavior. The three tests named above
  establish regression and healthy-control coverage.
- `docs/spec_topics/pi-integration-contract/subagent.md`, Launch contract,
  Placement, Child stdio, PIC-65 and PIC-66, supply the preserved env/cwd,
  visible-placement, stdio and teardown/cancellation contracts.
- Run-local `reproduce.md`, `diagnose.md`, `plan.md`, `spec-proposal.md`,
  `implement.md`, `evidence-review.md`, `reviews.md`, `witnesses.json` and the
  captures listed above supply the red/green, scope and review record.
  `close.md` records the documentation-only closure and integrity checks.
