# AGENTS.md — working notes for coding agents in this repo

## Test suites

Two groups (see `package.json` scripts):

- **Default** — `npm test` (`vitest.config.ts`). Offline, provider-free,
  deterministic; excludes `tests/live/**`. This is the ordinary development
  gate. It includes one real-child-process spawn test
  (`tests/subagent-child-real-spawn.test.ts`) that is provider-free (zero
  tokens).
- **Live** — `npm run test:live` (`config/vitest/vitest.live.config.ts`).
  Drives a real provider/model. Three halves, all under `tests/live/`:
  - **H8a** (`tests/live/*.test.ts`) — programmatic SDK harness
    (`tests/live/harness.ts`) driving live turns through `createAgentSession`.
  - **H9a** (`tests/live/acceptance/**`) — non-interactive real-host
    acceptance: spawns the real `pi` binary in print mode (`pi -p …`).
  - **Hardening probes** (`tests/live/hardening/**`) — live-axis probes over
    the in-process probe harness (`probe-harness.ts`).

## Live-suite conventions

### Run it liberally

The live suite is excluded from `npm test` so the *default gate* stays
offline — that is an exclusion from CI-style gating, **not** a rule against
running it during development. Do not treat "burns tokens / needs credentials"
as a reason to skip verification:

- The suite is deliberately **token-bounded**: fixtures pin tiny deterministic
  turns; a whole H8a test file runs in ~15–20 s wall.
- Model selection prefers **`claude-sonnet-5`** (one shared rule across the
  H8a resolver, the H9a acceptance harness, and the probe harness: prefer
  `claude-sonnet-5`, else the first `sonnet` id, else the first available
  model) — cheap relative to the models typically driving the development
  session itself.
- Credentials come from the operator's configured pi install; if you are
  developing inside pi against a live model, they are already in effect.

**Run the relevant live tests whenever you touch a live-exercised surface** —
the subagent child-process path, the production drivers, the binder /
typed-query loop, discovery/registration, the live harnesses themselves — and
after fixing a bug that a live test witnesses. Targeted invocation:

```
# one file
npx vitest run --config config/vitest/vitest.live.config.ts tests/live/live-production-acceptance.test.ts

# one test
npx vitest run --config config/vitest/vitest.live.config.ts tests/live/live-production-acceptance.test.ts -t "subagent-mode"
```

### Expect documented correct-reason reds

Some live tests are intentionally left red while a filed bug is open (e.g. bug
0017 kept the H8a typed-query test and H9a area (c) red with a pinned failure
signature until its fix in 0.27.0). Before attributing a red to your change, check `docs/bugs/` for an
open report whose signature matches. Do not "fix" such a test by weakening it.

### No silent skipping

A missing live provider/model **fails loudly** naming the unmet precondition
(`failLoudly` in every live harness) — never an early return or skip. Preserve
this in any new live test or harness.

### In-process harnesses that spawn real subagent children need the child pins

Any test harness that is not itself a real `pi` process but reaches the
RFC-0006 subagent child-process launch (directly, or through the shipped
composition root's `createProductionSpawnFn`) must pin BOTH ambient inputs, or
children mis-resolve silently (`#subagent-child-pins`):

1. **Executable** — point `process.argv[1]` at the real pi CLI entry
   (`node_modules/@earendil-works/pi-coding-agent/dist/cli.js`). Under vitest,
   `argv[1]` is vitest's entry script; rung 1 of the executable ladder would
   spawn `node <vitest-entry> …` and the child dies instantly as a fail-closed
   infra error.
2. **Extension identity** — set `PI_THETA_SUBAGENT_EXTENSION_PIN` to this
   working tree's `extensions/` so the child loads exactly the build under
   test (`-ne -e <dir>` prefixed to the child argv) instead of whatever
   ambient discovery finds (bug 0002 defect 2: a stale globally-installed
   theta binds silently). Production default (var absent) is ambient
   discovery; the pin is opt-in and inherits down the process tree.

Compliant setters to mirror: `tests/live/harness.ts`,
`tests/live/hardening/probe-harness.ts` (module-scope; vitest's per-file
worker isolation scopes the mutations to importers),
`tests/live/acceptance/harness.ts` (env of the spawned outer `pi -p`),
`tests/subagent-child-real-spawn.test.ts` and
`tests/subagent-theta-roots-forwarding.test.ts` (explicit `parentEnv` +
`ExecutableHost`).

### Assert on real observables, not on `prompt()` resolving

A fail-closed theta drive still **resolves** — failures surface as values and
notes, not throws. `await expect(drive(...)).resolves.toBeDefined()` is
vacuous. Deterministic observables:

- **`theta-system-note` channel** (read off the settled in-memory
  `SessionManager`, not off racy events): every fail-closed ending of a
  top-level drive lands here — the SLSH-3 err note
  (`theta /<name> returned Err: …`), `theta /<name> cancelled`, or a panic
  framing (`theta /<name> aborted…`). A subagent-mode drive's transcript is
  private, so absence of these notes IS the success observable. Helpers:
  `driveSlashCaptureTurn` (`tests/live/harness.ts`), per-turn `systemNotes`
  (`probe-harness.ts`).
- Per-drive `userTexts` / `toolCalls` (deterministic) and `assistantText`
  (stochastic — only assert against a fixture-pinned sentinel). See the header
  of `tests/live/hardening/probe-harness.ts` for the full channel inventory.

### Verify both directions when adding or strengthening an assertion

A live assertion that cannot red is worthless. After strengthening, prove the
red path once (e.g. temporarily disable the child pins and confirm the test
fails with the expected fail-closed note), then restore and confirm green.
