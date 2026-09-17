---
id: PTQ-0766
title: spawnWireProbe re-derives spawnPiPrint's spawn/capture/promise machinery instead of extending the exported helper
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/live/acceptance/rfc0010-l3-wire-json-mode.test.ts:96-150
  - tests/live/acceptance/harness.ts:458-537
sites: 2
fix_scope: localized
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# spawnWireProbe re-derives spawnPiPrint's spawn/capture/promise machinery instead of extending the exported helper

## Observation
`tests/live/acceptance/harness.ts` exports `spawnPiPrint`, which spawns the
`pi` CLI entry with a fixed argv/env/stdio shape, accumulates `stdout`/
`stderr` on `"data"`, and resolves `{ exitCode, stdout, stderr }` on
`"close"`. `tests/live/acceptance/rfc0010-l3-wire-json-mode.test.ts` declares
its own local `spawnWireProbe` function that reproduces the same
spawn-and-capture machinery — resolving `host` via `resolveAcceptanceHost()`,
the same `spawn(process.execPath, args, {...})` shape, the same
`env: { ...process.env, [SUBAGENT_EXTENSION_PIN_ENV]: ..., [SUBAGENT_PARENT_PID_ENV]: ... }`
carriage, the same `stdio: ["ignore", "pipe", "pipe"]`, the same
chunk-accumulation `"data"` handlers, and the same `"error"`/`"close"`
Promise-settling shape — rather than extending `spawnPiPrint`. The file's own
doc comment names the mirroring explicitly.

## Evidence

`tests/live/acceptance/rfc0010-l3-wire-json-mode.test.ts:96-150`:
```ts
 * Spawn the real `pi` binary marked as its OWN subagent-root regime (see the
 * file header): `-p "/<slug>"` against a scratch project workspace whose
 * `.pi/theta/<slug>.theta` IS the marked theta, with the two authenticated
 * control-plane env vars set on the child process itself. Mirrors
 * `./harness.ts`'s `spawnPiPrint` argv/env shape (extension pin, provider/model,
 * closed stdin) with the regime marker added and no `--theta` flag (project
 * discovery finds the workspace's own `.pi/theta/` root).
 */
async function spawnWireProbe(options: {
  readonly cwd: string;
  readonly slug: string;
}): Promise<WireProbeResult> {
  const host = await resolveAcceptanceHost();
  const args = [
    PI_CLI_ENTRY,
    "-ne",
    "-e",
    EXTENSION_ENTRY,
    "--mode",
    "json",
    "-p",
    `/${options.slug}`,
    "--no-session",
    "--provider",
    host.provider,
    "--model",
    host.model,
  ];
  return new Promise<WireProbeResult>((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        [SUBAGENT_EXTENSION_PIN_ENV]: EXTENSION_ENTRY,
        [SUBAGENT_PARENT_PID_ENV]: String(process.pid),
        // The regime marker: this spawned process treats ITSELF as the
        // subagent child (see file header) — no launcher, no grandchild.
        [SUBAGENT_ROOT_ENV_MARKER]: options.slug,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ exitCode: code, stdout, stderr });
    });
  });
}
```

`tests/live/acceptance/harness.ts:458-537` (the canonical `spawnPiPrint`,
same spawn/capture/promise shape):
```ts
export async function spawnPiPrint(options: SpawnPiPrintOptions): Promise<PiPrintResult> {
  const thetaDirs = [options.thetaDir, ...(options.extraThetaDirs ?? [])];
  const host = await resolveAcceptanceHost();
  const args = [
    PI_CLI_ENTRY,
    "-p",
    "-ne",
    "-e",
    EXTENSION_ENTRY,
    "--provider",
    host.provider,
    "--model",
    host.model,
    ...(thetaDirs.length > 0 ? ["--theta", thetaDirs.join(delimiter)] : []),
    options.slashInvocation,
  ];
  return new Promise<PiPrintResult>((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        [SUBAGENT_EXTENSION_PIN_ENV]: EXTENSION_ENTRY,
        [SUBAGENT_PARENT_PID_ENV]: String(process.pid),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    let timer: NodeJS.Timeout | undefined;
    if (options.abortAfterMs !== undefined) {
      timer = setTimeout(() => {
        child.kill("SIGTERM");
      }, options.abortAfterMs);
    }
    child.on("error", (err) => {
      if (timer !== undefined) { clearTimeout(timer); }
      reject(err);
    });
    child.on("close", (code) => {
      if (timer !== undefined) { clearTimeout(timer); }
      resolve({ exitCode: code, stdout, stderr });
    });
  });
}
```

## Why this is a problem
`spawnWireProbe` reproduces `spawnPiPrint`'s entire spawn/accumulate/settle
skeleton — the `resolveAcceptanceHost()` call, the `spawn(process.execPath,
args, {...})` call shape, the `SUBAGENT_EXTENSION_PIN_ENV`/
`SUBAGENT_PARENT_PID_ENV` env carriage, the closed-stdin `stdio` array, the
`"data"` chunk accumulation, and the `"error"`/`"close"` Promise-settling
handlers — locally, rather than through the exported `spawnPiPrint`. The
divergence this test needs (`--mode json`, `--no-session`, no `--theta` flag,
and one extra env var, `SUBAGENT_ROOT_ENV_MARKER`) is not something
`spawnPiPrint`'s current `SpawnPiPrintOptions` shape accepts, so the entire
surrounding machinery — none of which differs — was re-declared alongside the
few lines that do. The file's own doc comment states the mirroring
("Mirrors `./harness.ts`'s `spawnPiPrint` argv/env shape … with the regime
marker added and no `--theta` flag"), naming the duplication rather than it
being a coincidence.

## Suggested direction (non-binding, optional)
Widening `SpawnPiPrintOptions` to accept the small number of fields
`spawnWireProbe` varies (extra argv flags/mode, an extra env entry) is the
option this file's own "mirrors … with X added" comment already points at,
without altering any existing `spawnPiPrint` caller's behaviour.

## False-positive check
- Gate-pin check: `rfc0010-l3-wire-json-mode.test.ts` does not match
  `*gate*.test.ts` or the named gate-kin patterns; not applicable.
- Recording-double check: neither function is a recording double for a
  MUST-NOT witness; both spawn a real child process and capture its real
  stdout/stderr; not applicable.
- docs/bugs/ signature search: `grep -rl "spawnWireProbe" docs/bugs/*.md`
  returns no hits; this is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "rfc0010-l3-wire-json-mode"
  docs/reference/coverage-matrix.md` — the file is referenced by name as an
  RFC 0010 Phase 7d/H9a/L3 live witness; this finding proposes no merge,
  rename, or deletion of the test or its two `it()` cells — only that its
  local spawn helper duplicates the canonical one's machinery.
- Overlap check: `grep -ril "spawnWireProbe" quality/intake quality/resolved`
  before filing returned no hits.

## Triage
<!-- pending -->
verdict: confirmed — independently re-verified: both excerpts match verbatim at the cited lines (probe 96-150, spawnPiPrint 458-537); `spawn(process.execPath` under tests/ occurs only in these two files and spawnWireProbe has just its declaration plus two call sites (lines 224/269), so the ~25-line resolveAcceptanceHost/spawn/two-pin-env/stdio/data-accumulate/error-close skeleton is a real local re-declaration of the exported helper, self-declared by the probe's own "Mirrors `spawnPiPrint`" docblock with no stated reason to bypass it, and the only deltas are argv flags (--mode json, --no-session, no --theta), one extra env key and the dropped abort timer; D7 boilerplate-duplication class, both locations under tests/, not a gate/recording-double/bug-doc red, no overlapping intake (d7-03/69/71 concern different helpers) or resolved PTQ mentions spawnPiPrint; one immaterial FP-check inaccuracy noted — grep of docs/ finds NO reference to rfc0010-l3-wire-json-mode in coverage-matrix.md, but the finding proposes no merge/rename/delete so the carve-out does not apply (triage: claude-fable-5-1)
