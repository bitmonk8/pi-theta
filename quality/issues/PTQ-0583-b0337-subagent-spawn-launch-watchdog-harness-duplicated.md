---
id: PTQ-0583
title: b0337 retypes the PI_CLI_ENTRY/EXTENSION_ENTRY/requirePath/launch/watchdog/cleanup subagent-spawn harness that 11 sibling files already carry, with no tests/helpers/ home
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0337-theta-enum-identity-invoke.test.ts:495-514
  - tests/b0337-theta-enum-identity-invoke.test.ts:590-757
  - tests/invoke-prompt-cell-enum-return.test.ts:99-125
  - tests/invoke-prompt-cell-enum-return.test.ts:295-345
sites: 12
fix_scope: cross-module       # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0337 retypes the PI_CLI_ENTRY/EXTENSION_ENTRY/requirePath/launch/watchdog/cleanup subagent-spawn harness that 11 sibling files already carry, with no tests/helpers/ home

## Observation
tests/b0337-theta-enum-identity-invoke.test.ts's Cell 4 (the real-spawned-child integration witness) declares, module scope, the same `PI_CLI_ENTRY`/`EXTENSION_ENTRY` path constants, the same `requirePath` precondition-check function, and the same `ExecutableHost`/`launchSubagentChild`/watchdog/`driveSubagentChild`/`finally`-cleanup sequence that tests/invoke-prompt-cell-enum-return.test.ts (which b0337's own comment cites as its model: "Modelled on invoke-prompt-cell-enum-return.test.ts") already carries, differing only in the fixture-specific literals (the bug-tag string in the `requirePath` error message, the `slug`/`thetaDirs` fixture names, the tmp-dir prefix). Neither the constants, the function, nor the launch/watchdog/cleanup sequence is exported from any `tests/helpers/` module; the same bundle is retyped in at least 12 files total.

## Evidence

tests/b0337-theta-enum-identity-invoke.test.ts:495-514:
```ts
/** The repo's pinned pi CLI entry — the SAME executable resolution rung 1 uses in production. */
const PI_CLI_ENTRY = fileURLToPath(
  new URL("../node_modules/@earendil-works/pi-coding-agent/dist/cli.js", import.meta.url),
);

/** This working tree's extension entry (the build under test). */
const EXTENSION_ENTRY = fileURLToPath(new URL("../extensions", import.meta.url));

/** The marshalled model reference riding the child argv (PIC-62). NEVER CONTACTED: no fixture issues a query. */
const CHILD_MODEL_PROVIDER = "anthropic";
const CHILD_MODEL_ID = "claude-fable-5";

/** Fail loudly on a missing precondition — never a silent skip (*No silent test skipping*). */
function requirePath(path: string, what: string): void {
  if (!existsSync(path)) {
    throw new Error(
      `precondition unmet: ${what} not found at ${path} — the bug-0337 mode-invariance ` +
        `witness needs the repo install (npm install); it never silently skips.`,
    );
  }
}
```

tests/invoke-prompt-cell-enum-return.test.ts:99-123 — the identical constants and function, differing only in the bug-tag text inside the `requirePath` throw message:
```ts
const PI_CLI_ENTRY = fileURLToPath(
  new URL("../node_modules/@earendil-works/pi-coding-agent/dist/cli.js", import.meta.url),
);

/** This working tree's extension entry (the build under test). */
const EXTENSION_ENTRY = fileURLToPath(new URL("../extensions", import.meta.url));

/**
 * The marshalled model reference riding the child argv (`--provider`/`--model`,
 * PIC-62). NEVER CONTACTED: no fixture below issues a query.
 */
const CHILD_MODEL_PROVIDER = "anthropic";
const CHILD_MODEL_ID = "claude-fable-5";

/** Fail loudly on a missing precondition — never a silent skip (*No silent test skipping*). */
function requirePath(path: string, what: string): void {
  if (!existsSync(path)) {
    throw new Error(
      `precondition unmet: ${what} not found at ${path} — the bug-0174 prompt-cell ` +
        `enum-return witness needs the repo install (npm install); it never silently skips.`,
    );
  }
}
```

tests/b0337-theta-enum-identity-invoke.test.ts:602-630 (the `host`/`launch` construction):
```ts
      const host: ExecutableHost = {
        argv1: PI_CLI_ENTRY,
        execPath: process.execPath,
        fileExists: (p: string): boolean => existsSync(p),
        isGenericRuntime: (): boolean => false,
      };

      const diagnostics: Diagnostic[] = [];
      const emitDiagnostic = (d: Diagnostic): void => {
        diagnostics.push(d);
      };

      const launch = launchSubagentChild(
        {
          argv: {
            slug: "top",
            thetaDirs: [thetaDir],
            systemPrompt: "",
            hostTools: [],
            noHostTools: true,
            provider: CHILD_MODEL_PROVIDER,
            model: CHILD_MODEL_ID,
            projectTrust: false,
          },
          cwd: scratchDir,
          parentEnv: { ...process.env, [SUBAGENT_EXTENSION_PIN_ENV]: EXTENSION_ENTRY },
          parentPid: process.pid,
          invokeDepth: 0,
          host,
```

tests/invoke-prompt-cell-enum-return.test.ts:304-333 — the same construction (only `slug`/`thetaDirs` fixture-array name differ):
```ts
      const host: ExecutableHost = {
        argv1: PI_CLI_ENTRY,
        execPath: process.execPath,
        fileExists: (p: string): boolean => existsSync(p),
        isGenericRuntime: (): boolean => false,
      };

      const diagnostics: Diagnostic[] = [];
      const emitDiagnostic = (d: Diagnostic): void => {
        diagnostics.push(d);
      };

      const launch = launchSubagentChild(
        {
          argv: {
            slug: "top-typed",
            thetaDirs: [thetaDir],
            systemPrompt: "",
            hostTools: [],
            noHostTools: true,
            provider: CHILD_MODEL_PROVIDER,
            model: CHILD_MODEL_ID,
            projectTrust: false,
          },
          cwd: scratchDir,
          parentEnv: { ...process.env, [SUBAGENT_EXTENSION_PIN_ENV]: EXTENSION_ENTRY },
          parentPid: process.pid,
          invokeDepth: 0,
          host,
```

Both files continue with the same `expect(launch.ok, ...).toBe(true); if (!launch.ok) { return; }`, the same `exitPromise`/watchdog pattern (`let killedByWatchdog = false; const watchdog = setTimeout(() => { killedByWatchdog = true; child.kill(); }, 90_000);`), the same `driveSubagentChild({ child, thetaAbort: new AbortController(), calleePath: ..., emitDiagnostic })` call, the same `expect(killedByWatchdog, ...).toBe(false)` / `expect(result.ok, ...)` precondition pair, and the same `finally` teardown (`child.kill()` + a race between `exitPromise` and a 5s `reapTimer`, then a best-effort `rmSync` in its own `try`/`catch`) — verified by direct read of both files' Cell-4/integration sections in full.

Pattern-wide search: `grep -rl "^const PI_CLI_ENTRY = fileURLToPath" tests --include="*.test.ts"` → 12 files (tests/b0337-theta-enum-identity-invoke.test.ts, tests/b0342-forwarded-enum-subagent-chain.test.ts, tests/inbound-boundary-theta-callable.test.ts, tests/inbound-union-arm-dispatch.test.ts, tests/invoke-prompt-cell-enum-return.test.ts, tests/subagent-child-real-spawn.test.ts, tests/subagent-envelope-result-carriage.test.ts, tests/subagent-invoke-inbound-enum-tag.test.ts, tests/subagent-invoke-nonfinite-return-refusal.test.ts, tests/subagent-return-depth-refusal.test.ts, tests/subagent-root-binder-model-exempt.test.ts, tests/subagent-theta-roots-forwarding.test.ts). `grep -rl "^function requirePath(path: string, what: string): void {" tests --include="*.test.ts"` → the same 12 files. `grep -rn "PI_CLI_ENTRY\|requirePath\|launchSubagentChild" tests/helpers/*.ts` → 0 hits — no `tests/helpers/` module hosts any piece of this bundle (the nearest adjacent helper, `tests/helpers/subagent-fn-child-regime.ts`, drives the CHILD-side in-process `fn`-entry regime and does not spawn a real process or construct an `ExecutableHost`).

## Why this is a problem
tests/b0337-theta-enum-identity-invoke.test.ts's own comment names tests/invoke-prompt-cell-enum-return.test.ts as the model its Cell-4 witness is built on ("Modelled on invoke-prompt-cell-enum-return.test.ts"), and the two files' `PI_CLI_ENTRY`/`EXTENSION_ENTRY` constants, `requirePath` function, `host`/`launch` construction, watchdog loop, and `finally` teardown are confirmed identical apart from fixture-specific literals — a direct, acknowledged lineage rather than independent convergence. The same twelve-file pattern search shows this is not confined to the two files compared here: every one of the twelve retypes the same constants and function rather than importing them from a shared module, and no `tests/helpers/` module currently hosts any piece of the bundle.

## Suggested direction (non-binding, optional)
A `tests/helpers/`-hosted module exporting the `PI_CLI_ENTRY`/`EXTENSION_ENTRY` constants, `requirePath`, and the `host`+`launch`+watchdog+`driveSubagentChild`+teardown sequence (parameterised by the fixture directory, slug and callee path each of the twelve files' own scenarios already supply) is the natural next home the files' own shared "modelled on"/child-pin lineage already points toward, alongside the project's existing per-shape `tests/helpers/subagent-*` extractions.

## False-positive check
- Gate-pin: neither cited file matches `*gate*.test.ts` or the named kin; the cited lines are integration-spawn harness plumbing, not a pinned count or inventory assertion.
- Recording-double: `emitDiagnostic`/the `diagnostics` array is a recording double used to report a launch failure loudly, not a "never called" negative witness backing a MUST-NOT assertion; the carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0337-theta-enum-identity-collides-across-in-process-invoke.md Status "fixed (0.305.0)"; the file's own header states "THE FIX IS ALREADY IN THE TREE (uncommitted, §Fix)... So every cell below runs GREEN as written — that is expected." `npx vitest run tests/b0337-theta-enum-identity-invoke.test.ts` confirms a passing suite at HEAD, so this is not a documented correct-reason red; docs/bugs/0174 (the enum-return prompt-cell bug invoke-prompt-cell-enum-return.test.ts witnesses) is also fixed and its suite passes.
- coverage-matrix/bug-doc citation search: `grep -n "b0337-theta-enum-identity-invoke\|invoke-prompt-cell-enum-return" docs/reference/coverage-matrix.md` → 0 hits for the b0337 file (the coverage matrix does not name it). This finding proposes no merge, rename or deletion of any file or `it()`/`describe()` — only that the shared constants/function/sequence could be imported from a new or existing helper — so no citation is affected.
- Coverage check: the claim is about a repeated harness DEFINITION, not a missing test path; the cited sequence is exercised by b0337's own Cell-4 test, which passes at HEAD.

## Triage
verdict: confirmed — independently reproduced: b0337:495-514 and invoke-prompt-cell-enum-return:99-123 diff identical apart from the bug-tag literal in requirePath's message and one JSDoc wrap; the host/launch blocks (602-630 vs 304-333), the 90s killedByWatchdog watchdog, the driveSubagentChild call and the finally teardown (child.kill → 5s reapTimer race → guarded rmSync) match in both files; greps for `^const PI_CLI_ENTRY`, `^function requirePath`, `killedByWatchdog` and `reapTimer` each hit the same 12 test files; tests/helpers/ exports only FAKE ExecutableHost builders (fake-json-child.ts, fake-rpc-child.ts) and a unit driveDeps scaffold, none hosting the real-spawn PI_CLI_ENTRY/requirePath/createProductionSpawnFn bundle (the filing's "0 hits" slightly over-claims — `launchSubagentChild` appears in two helper comments — but no helper hosts any piece); docs/bugs 0337 fixed (0.305.0) and 0174 fixed (0.98.0), coverage-matrix 0 hits, no gate file, no merge/rename/delete proposed; no existing PTQ covers this bundle (PTQ-0273 is a different file pair's fake-host builder; same-wave d7-131-01 explicitly scopes this out as a different root cause and d7-74 is the tests/live spawnPiPrint harness) — the same boilerplate-duplication shape PTQ-0273/0301/0344/0360/0361 were ratified on (triage: claude-fable-5-1)
