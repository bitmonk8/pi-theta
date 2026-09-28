---
id: pending
title: a fn launch entry crosses a non-pipe placement by two mechanisms in one launch file — projected as the PI_THETA_SUBAGENT_ENTRY control-plane key AND as the structured entry field — while the launcher header, the launch-file header, the spec row and both test fixtures model a single carriage per placement
lens: D1
status: intake
verdict: pending
locations:
  - src/runtime/subagent-launcher.ts:118-127
  - src/runtime/subagent-launcher.ts:270-282
  - src/runtime/subagent-launcher.ts:465-481
  - src/runtime/subagent-launch-file.ts:24-25
  - src/runtime/subagent-launch-file.ts:98-107
  - src/runtime/subagent-launch-file.ts:353-375
  - src/extension/production-result-channel.ts:190-197
  - tests/subagent-launch-file.test.ts:258-271
  - tests/production-result-channel.test.ts:206-216
sites: 5
fix_scope: cross-module
d1_class: divergent-solutions
wave: qw20260928124659
reported_by: lens-d1-design (anthropic/claude-fable-5-1)
date: 2026-09-28
triaged_at: 7d0a52af49422fb4ce69fba3a62007fdfaf35a3e
---

# a fn launch entry crosses a non-pipe placement by two mechanisms in one launch file — projected as the PI_THETA_SUBAGENT_ENTRY control-plane key AND as the structured entry field — while the launcher header, the launch-file header, the spec row and both test fixtures model a single carriage per placement

## Observation
`prepareSubagentLaunch` writes `PI_THETA_SUBAGENT_ENTRY=<json>` into the composed child env for every fn entry, regardless of placement. `SUBAGENT_LAUNCH_ENTRY_ENV` is a member of `SUBAGENT_CONTROL_PLANE_ENV_KEYS`, and `projectLaunchFileControlPlane` lifts every member of that list out of `prepared.env` into the launch file's `controlPlane` record. `createProductionSubagentWire` then writes the same entry a second time as the document's structured `entry` field. On the child, `readChildControlPlane` re-projects `controlPlane` over the scrubbed env (so `env[PI_THETA_SUBAGENT_ENTRY]` is set again) and reads `entry` from `document.entry`; `readLaunchEntryFromEnv` runs only on the no-launch-file branch. The `SUBAGENT_LAUNCH_ENTRY_ENV` docstring says the entry "rides the launch file instead" under a non-`pipe` placement; the spec row says `PI_THETA_SUBAGENT_ENTRY` "under `pipe`" and "the launch file's `entry` under every other placement"; both test fixtures that build a launch-file document for a fn entry omit the env key from `controlPlane`. One in-body comment (`launcher.ts:469-470`) says the file "additionally" carries the entry.

## Evidence

### Mechanism 1 — the env key, written for every fn entry and projected into the file

src/runtime/subagent-launcher.ts:465-481
```ts
  const entry = request.entry ?? THETA_LAUNCH_ENTRY;
  // RFC-0012 §10: a fn entry rides the env control plane under `pipe` (the
  // one new key inside the scrubbed per-launch set); a theta entry writes
  // nothing, so a `.theta` callee's env is byte-identical to the pre-RFC form.
  // A non-`pipe` placement additionally carries the entry on the launch file
  // (the child's read prefers the file when argv names one).
  const entryEnv: Record<string, string | undefined> =
    entry.kind === "fn" ? { [SUBAGENT_LAUNCH_ENTRY_ENV]: JSON.stringify(entry) } : {};
  // PIC-58: the root-regime marker carries the callee slug, subsuming the old
  // child marker (watcher suppression + no-recursion + regime selection).
  const env = buildSubagentChildEnv(
    request.parentEnv,
    request.parentPid,
    request.invokeDepth,
    request.argv.slug,
    { ...(request.controlPlaneEnv ?? {}), ...entryEnv },
  );
```

src/runtime/subagent-launcher.ts:270-282 (the key is in the projected set)
```ts
export const SUBAGENT_CONTROL_PLANE_ENV_KEYS: readonly string[] = Object.freeze([
  SUBAGENT_EXTENSION_PIN_ENV,
  SUBAGENT_ROOT_ENV_MARKER,
  SUBAGENT_ROOT_WINNER_ENV,
  SUBAGENT_PARAMS_ENV,
  SUBAGENT_PARAMS_FILE_ENV,
  SUBAGENT_INVOKE_DEPTH_ENV,
  SUBAGENT_CALLABLE_HASHES_ENV,
  SUBAGENT_PARENT_PID_ENV,
  // RFC-0012 §10: the fn entry under `pipe` — per-launch, scrubbed and
  // authenticated like the params carriers it travels beside.
  SUBAGENT_LAUNCH_ENTRY_ENV,
]);
```

src/runtime/subagent-launch-file.ts:98-107
```ts
export function projectLaunchFileControlPlane(
  env: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  const projected: Record<string, string> = {};
  for (const key of SUBAGENT_CONTROL_PLANE_ENV_KEYS) {
    const value = env[key];
    if (value !== undefined) {
      projected[key] = value;
    }
  }
```

### Mechanism 2 — the structured `entry` field, written beside the projection

src/extension/production-result-channel.ts:190-197
```ts
    const document: SubagentLaunchFileDocument = {
      v: LAUNCH_FILE_VERSION,
      nonce,
      controlPlane: projectLaunchFileControlPlane(prepared.env),
      channel: { port: channel.port, token },
      presentation: prepared.presentation,
      entry: prepared.entry,
    };
```

### The child reads mechanism 2 and re-projects mechanism 1 into its env view

src/runtime/subagent-launch-file.ts:353-375
```ts
  if (input.launchFilePath === undefined) {
    return {
      env: input.authenticatedEnv,
      entry: readLaunchEntryFromEnv(input.authenticatedEnv),
    };
  }
  const scrubbed: Record<string, string | undefined> = { ...input.authenticatedEnv };
  for (const key of SUBAGENT_CONTROL_PLANE_ENV_KEYS) {
    delete scrubbed[key];
  }
  const document = readLaunchFileOnce(input.launchFilePath, input.launchFs);
  if (document === undefined) {
    return { env: scrubbed, entry: THETA_LAUNCH_ENTRY };
  }
  return {
    env: { ...scrubbed, ...document.controlPlane },
    entry: document.entry,
```

### The single-carriage model stated at three sites

src/runtime/subagent-launcher.ts:118-127
```ts
/**
 * RFC-0012 §10: the env var carrying the launch ENTRY under `pipe` placement —
 * the JSON form of a `SubagentLaunchEntry` (`{"kind":"fn","name":"<fn>"}`).
 * Written ONLY for a fn entry (a theta entry is the absent default, so a
 * `.theta` callee's env is byte-identical to the pre-RFC launch); read by the
 * child's regime detection beside the root marker and authenticated by the
 * same ppid gate. Under a non-`pipe` placement the entry rides the launch file
 * instead (`subagent-launch-file.ts`).
 */
export const SUBAGENT_LAUNCH_ENTRY_ENV = "PI_THETA_SUBAGENT_ENTRY";
```

src/runtime/subagent-launch-file.ts:24-25
```ts
// Under `pipe` no launch file exists: a fn entry rides the env
// (`SUBAGENT_LAUNCH_ENTRY_ENV`) and everything else stays as it was.
```

docs/spec_topics/pi-integration-contract/subagent.md:64 (launch-contract table, entry row, verbatim prefix): "`PI_THETA_SUBAGENT_ENTRY=<json>` under `pipe` — parent-launcher only, on the authenticated control plane, written for a fn entry only, so a `.theta` callee's env is unchanged; the launch file's `entry` under every other placement".

### Both fixtures model a document whose `controlPlane` has no entry key

tests/production-result-channel.test.ts:206-216 (the `prepared` handed to the production wire — a fn entry with no `PI_THETA_SUBAGENT_ENTRY` in `env`, a shape `prepareSubagentLaunch` never produces)
```ts
    env: {
      PATH: "/usr/bin",
      ANTHROPIC_API_KEY: "never-in-the-file",
      [SUBAGENT_ROOT_ENV_MARKER]: "worker",
      [SUBAGENT_PARENT_PID_ENV]: "77",
      [SUBAGENT_INVOKE_DEPTH_ENV]: "1",
      [SUBAGENT_PARAMS_ENV]: '{"n":1}',
    },
    label: "worker",
    presentation: "visible",
    entry: { kind: "fn", name: "step" },
```

tests/subagent-launch-file.test.ts:258-271 (the child-side cell; its `document()` fixture at :92-107 likewise has no entry key in `controlPlane`)
```ts
    const path = writeLaunchFile(document(), fs);
    const view = readChildControlPlane({
      authenticatedEnv: { ...authenticated, [SUBAGENT_LAUNCH_ENTRY_ENV]: '{"kind":"theta"}' },
      launchFilePath: path,
      launchFs: fs,
    });
    …
    // The env's own entry key is scrubbed with the rest; the file's entry wins.
    expect(view.env[SUBAGENT_LAUNCH_ENTRY_ENV]).toBeUndefined();
    expect(view.entry).toEqual({ kind: "fn", name: "step" });
```

### Searches and the probe (run this session)

`grep -rn "SUBAGENT_LAUNCH_ENTRY_ENV\|PI_THETA_SUBAGENT_ENTRY" src --include=*.ts` → 10 hits:
```
src/runtime/subagent-launch-file.ts:25:// (`SUBAGENT_LAUNCH_ENTRY_ENV`) and everything else stays as it was.
src/runtime/subagent-launch-file.ts:31:  SUBAGENT_LAUNCH_ENTRY_ENV,
src/runtime/subagent-launch-file.ts:269: * on `SUBAGENT_LAUNCH_ENTRY_ENV`); `undefined` on any shape failure.
src/runtime/subagent-launch-file.ts:290: * `SUBAGENT_LAUNCH_ENTRY_ENV`, read from the AUTHENTICATED env view. Absent or
src/runtime/subagent-launch-file.ts:296:  const raw = env[SUBAGENT_LAUNCH_ENTRY_ENV];
src/runtime/subagent-launch-file.ts:340: *     from `SUBAGENT_LAUNCH_ENTRY_ENV`.
src/runtime/subagent-launcher.ts:127:export const SUBAGENT_LAUNCH_ENTRY_ENV = "PI_THETA_SUBAGENT_ENTRY";
src/runtime/subagent-launcher.ts:281:  SUBAGENT_LAUNCH_ENTRY_ENV,
src/runtime/subagent-launcher.ts:378:   * rides `SUBAGENT_LAUNCH_ENTRY_ENV` under `pipe` and the launch file under
src/runtime/subagent-launcher.ts:472:    entry.kind === "fn" ? { [SUBAGENT_LAUNCH_ENTRY_ENV]: JSON.stringify(entry) } : {};
```
The only value read of the key in `src/` is `subagent-launch-file.ts:296` (`readLaunchEntryFromEnv`), reached from `readChildControlPlane` only on the `launchFilePath === undefined` branch (:353-357). Under a launch file the projected key is written into `view.env` (:368) and read by nothing.

`grep -rn "readLaunchEntryFromEnv\|readChildControlPlane\|writeLaunchFile(\|projectLaunchFileControlPlane" src --include=*.ts | grep -v "^src/runtime/subagent-launch-file.ts"` → 4 hits:
```
src/extension/production-result-channel.ts:19:  projectLaunchFileControlPlane,
src/extension/production-result-channel.ts:193:      controlPlane: projectLaunchFileControlPlane(prepared.env),
src/extension/production-result-channel.ts:200:      launchFile = writeLaunchFile(document, deps.launchFs);
src/extension/production-subagent-host.ts:296:  return readChildControlPlane({
```

Probe (a vitest file under `$TEMP`, importing `prepareSubagentLaunch` with `entry: { kind: "fn", name: "step" }` on a minimal request and then `projectLaunchFileControlPlane(prepared.env)`), console output verbatim:
```
PROBE {"envEntry":"{\"kind\":\"fn\",\"name\":\"step\"}","projectedKeys":["PI_THETA_SUBAGENT_ROOT","PI_THETA_SUBAGENT_INVOKE_DEPTH","PI_THETA_SUBAGENT_PARENT_PID","PI_THETA_SUBAGENT_ENTRY"],"projectedEntry":"{\"kind\":\"fn\",\"name\":\"step\"}"}
```
So the production launch file for a fn entry carries `controlPlane.PI_THETA_SUBAGENT_ENTRY` and `entry` — the same fact twice, in two encodings. tests/subagent-placement-seam.test.ts:134 and :136 independently pin the two links of the chain (`prepared.env[SUBAGENT_LAUNCH_ENTRY_ENV]` is set for a fn entry; `SUBAGENT_CONTROL_PLANE_ENV_KEYS` contains the key).

## Why this is a problem
The same value is marshalled by two mechanisms in one document with no cross-check: `parseLaunchFileDocument` validates `controlPlane` values only as strings under closed keys and validates `entry` separately, so a file whose two carriages disagree parses cleanly and the child honours `entry` while its env view says otherwise. Both test fixtures were written to the single-carriage model the headers and the spec row state — the production-wire cell (`tests/production-result-channel.test.ts:221-247`) asserts a `controlPlane` with four keys against a `prepared.env` that omits the entry key, and the child-side cell (`tests/subagent-launch-file.test.ts:269-270`) asserts `view.env[SUBAGENT_LAUNCH_ENTRY_ENV]` is `undefined` after a launch file "replaces env carriage"; run against the document production actually writes for a fn entry, that second assertion is false (the projection re-sets the key). That is the concrete misread already in the tree: a maintainer reading either header or either fixture concludes the file carries the entry once, and a change to one carriage (a new `SubagentLaunchEntry` field, a renamed key, a scrub rule) is made to one mechanism and not the other. The in-body comment at `launcher.ts:469-470` ("additionally") and the docstring at `:124-125` ("instead") already disagree inside one file.

## Suggested direction (non-binding, optional)
Unproven hypothesis: the entry could travel by exactly one mechanism per placement as the spec row states — either the key leaves `SUBAGENT_CONTROL_PLANE_ENV_KEYS`' projected subset for the file path, or the document drops its `entry` field and the child reads the entry from the projected env view on both branches — and the fixtures would then model the shipped shape.

## False-positive check
- Injected clone map: "(no clone groups)" for every in-scope file; no group covers this. Mechanism-shaped (an env-key projection vs a typed document field), not a token copy.
- D9-affinity check: not a wrong-home claim — the key list, the projection and the document writer each sit with their owners; the claim is that two mechanisms carry one fact.
- D2-deadness check: both mechanisms are live — the env key is read on the `pipe` branch (`readLaunchEntryFromEnv`) and `entry` is read on the launch-file branch; the projected copy inside the file is written by production and lands in `view.env`. Not filed as dead code.
- Wide-surface / export-style: not claimed; both fields have producers.
- Prior filings: PTQ-1612 (open, D6) covers the malformed-entry posture divergence between the two carriers and itself restates the single-carriage model ("one of two carriers"); PTQ-1097 (resolved) fixed a key count in a comment; PTQ-1093 (resolved) covered an unread wire parameter. None addresses the double carriage inside one launch file. `grep -rln "SUBAGENT_LAUNCH_ENTRY_ENV\|PI_THETA_SUBAGENT_ENTRY\|projectLaunchFileControlPlane" quality/ docs/bugs` → quality/issues/PTQ-1612-…, quality/resolved/PTQ-1093-…, quality/resolved/PTQ-1097-…, quality/resolved/PTQ-1202-…, docs/bugs/0493-….
- History: `git log -S'SUBAGENT_LAUNCH_ENTRY_ENV,' -- src/runtime/subagent-launcher.ts` → `c7a47d17 2026-09-15 rfc 0012 step 1 …`; `git log -S'projectLaunchFileControlPlane' -- src/runtime/subagent-launch-file.ts` → `4ae9b29c 2026-09-15 rfc 0012 step 2 …`. The key was added to the control-plane set in step 1 (pipe-only world) and the projection arrived in step 2 without carving it out.
- Self-inconsistency statement: the spec row states one carriage per placement, but no written rule governs the key set's projection; the anchor is self-inconsistency (two mechanisms for one fact, headers and fixtures modelling one, one body comment modelling two) plus the cost cited above.

## Triage
verdict: questionable — accounting verified; whether to unify (and to what) is a design decision for a human ruling. Every excerpt matches at its cited lines. Both stated searches reproduce line for line (10 hits; 4 hits outside launch-file.ts). clone-scan on subagent-launcher.ts → (no clone groups). The production chain is real: subagent-place.ts:90/106 passes prepareSubagentLaunch's env, which carries the fn entry key (:472), to openWire, and projectLaunchFileControlPlane then copies SUBAGENT_LAUNCH_ENTRY_ENV (it is in SUBAGENT_CONTROL_PLANE_ENV_KEYS :281) next to `entry` (production-result-channel.ts:193,196). The cost is concrete, not symmetry: both fixtures (production-result-channel.test.ts:206-247, subagent-launch-file.test.ts:92-107/269) build a fn-entry document with no entry key in controlPlane, a shape production never writes. The docstring at launcher.ts:124-125 says "instead" while the comment at :469-470 says "additionally". Not a duplicate: PTQ-1612 covers the malformed-entry posture, not the double carriage (triage: claude-opus-5-5)
