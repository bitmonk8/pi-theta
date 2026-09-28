---
id: PTQ-1612
title: readLaunchEntryFromEnv turns a present-but-malformed PI_THETA_SUBAGENT_ENTRY into the theta entry and keeps the control plane, while parseLaunchFileDocument refuses the same malformed entry and drops the whole control plane
lens: D6
status: open
verdict: confirmed
locations:
  - src/runtime/subagent-launch-file.ts:288-308
  - src/runtime/subagent-launch-file.ts:353-357
  - src/runtime/subagent-launch-file.ts:233-236
  - src/runtime/subagent-launch-file.ts:363-366
  - src/runtime/subagent-launcher.ts:466-472
sites: 5
fix_scope: module
d6_class: posture-divergence
d6_anchor: "docs/spec_topics/pi-integration-contract/subagent.md:116 — \"A path that does not exist, is not owned by the current user, or fails to parse is treated exactly as a failed ppid check — the control plane is dropped, the process runs as an ordinary top-level pi, and the parent observes exit-without-envelope; no new code is minted.\" (with :116 \"Authentication changes shape, not strength\")"
wave: qw20260928060032
reported_by: lens-d6-errorposture (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: a251f7ea964be26c0d5a904fcf27fa00016b2aa0
---

# readLaunchEntryFromEnv turns a present-but-malformed PI_THETA_SUBAGENT_ENTRY into the theta entry and keeps the control plane, while parseLaunchFileDocument refuses the same malformed entry and drops the whole control plane

## Observation
The RFC-0012 §10 launch entry (`SubagentLaunchEntry`) reaches a child on one of two carriers: the env key `PI_THETA_SUBAGENT_ENTRY` under `pipe`, or the launch file's `entry` field under every other placement. Both carriers decode the entry with the same `parseLaunchEntry`. On the launch-file carrier a malformed entry makes `parseLaunchFileDocument` return `undefined`, and `readChildControlPlane` then drops the control plane (env scrubbed, no root marker). The parent sees exit-without-envelope. On the env carrier, `readLaunchEntryFromEnv` maps a present value that is malformed JSON, or that `parseLaunchEntry` rejects (e.g. `{"kind":"fn","name":""}`), to `THETA_LAUNCH_ENTRY`. The authenticated control plane is kept as-is, so the child runs as the marked root with the theta entry instead of the fn the parent asked for.

## Evidence
Divergent side: env carrier, fail-open to a default (`src/runtime/subagent-launch-file.ts:288-308`):
```ts
 * The entry carried on the env control plane under `pipe`: the JSON on
 * `SUBAGENT_LAUNCH_ENTRY_ENV`, read from the AUTHENTICATED env view. Absent or
 * malformed ⇒ the theta entry (a `.theta` callee's launch writes no key).
 */
export function readLaunchEntryFromEnv(
  env: Readonly<Record<string, string | undefined>>,
): SubagentLaunchEntry {
  const raw = env[SUBAGENT_LAUNCH_ENTRY_ENV];
  if (raw === undefined) {
    return THETA_LAUNCH_ENTRY;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (parseError: unknown) { // allow-broad-catch: RFC-0012 fn-entry env intake — malformed JSON falls back to the theta entry, pi-integration-contract/subagent.md
    void parseError;
    return THETA_LAUNCH_ENTRY;
  }
  return parseLaunchEntry(parsed) ?? THETA_LAUNCH_ENTRY;
```
The env view is returned as-is next to that entry (`src/runtime/subagent-launch-file.ts:353-357`):
```ts
  if (input.launchFilePath === undefined) {
    return {
      env: input.authenticatedEnv,
      entry: readLaunchEntryFromEnv(input.authenticatedEnv),
    };
  }
```

Sibling side: launch-file carrier, fail-closed. Same decoder, same datum (`src/runtime/subagent-launch-file.ts:233-236`, inside `parseLaunchFileDocument`):
```ts
  const entry = parseLaunchEntry(record["entry"]);
  if (entry === undefined) {
    return undefined;
  }
```
and the resulting drop (`src/runtime/subagent-launch-file.ts:363-366`):
```ts
  const document = readLaunchFileOnce(input.launchFilePath, input.launchFs);
  if (document === undefined) {
    return { env: scrubbed, entry: THETA_LAUNCH_ENTRY };
  }
```
(`scrubbed` has every `SUBAGENT_CONTROL_PLANE_ENV_KEYS` member deleted at :359-362, the root marker included.)

The writer puts the env key on the wire only for a fn entry (`src/runtime/subagent-launcher.ts:466-472`):
```ts
  // RFC-0012 §10: a fn entry rides the env control plane under `pipe` (the
  // one new key inside the scrubbed per-launch set); a theta entry writes
  // nothing, so a `.theta` callee's env is byte-identical to the pre-RFC form.
  ...
  const entryEnv: Record<string, string | undefined> =
    entry.kind === "fn" ? { [SUBAGENT_LAUNCH_ENTRY_ENV]: JSON.stringify(entry) } : {};
```

Why these are siblings: both paths decode the same control-plane datum (the launch entry) into `SubagentLaunchEntry`, and both call the same `parseLaunchEntry`. `grep -rn "parseLaunchEntry(" src` gives 3 hits: the definition at :271 and the two call sites :233 (file carrier) and :307 (env carrier). The only difference between them is the carrier. On the file carrier a failed decode refuses the launch. On the env carrier it substitutes the default.

Downstream effect of the env-side default, from reading the child: `SubagentSpawnRegime` reads `subagentControlPlane.entry` (`src/extension/subagent-spawn-regime.ts:909`). It dispatches to `#driveSubagentFnEntry` only when `entry.kind === "fn"` (:915-918). Otherwise it goes on to `#bindMarshalledRootParams` and the root-theta drive (:923+). So a child whose parent requested fn `<name>` runs the root theta's body.

Anchor quoted verbatim, from `docs/spec_topics/pi-integration-contract/subagent.md:116`: "Authentication changes shape, not strength: `.env` cannot author argv, the file is parent-private, and the nonce is consumed on first read. A path that does not exist, is not owned by the current user, or fails to parse is treated exactly as a failed ppid check — the control plane is dropped, the process runs as an ordinary top-level pi, and the parent observes exit-without-envelope; no new code is minted." Also from `docs/spec_topics/invocation.md` INV-5: "never a fabricated `Ok`".

## Why this is a problem
The same undecodable entry gets opposite postures depending on the carrier. The file carrier fails closed, which is the spec-pinned verdict. The env carrier fails open: the child runs a different computation (the root theta body) under the parent's authenticated control plane. Its envelope then goes back as the result of the fn call the parent made. That is the fail-open-outlier shape against INV-5's "never a fabricated `Ok`". The stated rationale in the doc comment, "(a `.theta` callee's launch writes no key)", covers only the absent case (:297-299). The writer at `subagent-launcher.ts:471-472` writes the key only when `entry.kind === "fn"`. So a present key always means the parent asked for a fn, and the theta entry is never the right decode of a present value. The rationale is therefore false for the malformed half it is used to justify.

## Suggested direction (non-binding, optional)
Give a present-but-undecodable env entry the verdict the launch-file carrier gives the same datum, i.e. a refusal rather than the theta default. Keep the absent → theta-entry arm.

## False-positive check
- EXST-9 / PIC-73 class check: neither site is an execution-status sink or producer hook. Neither belongs to the degrade-silent optional-capability class: the launch entry is a mandatory control-plane datum for a fn launch, not an optional capability. Not exempt.
- allow-broad-catch token check: the catch at :303 carries `allow-broad-catch: RFC-0012 fn-entry env intake — malformed JSON falls back to the theta entry, pi-integration-contract/subagent.md`. The token names subagent.md. `grep -rn "PI_THETA_SUBAGENT_ENTRY" docs` gives 5 hits: subagent.md:64, subagent.md:116, and RFC 0012 lines 396, 1014 and 1107. None pins a malformed-env-entry fallback. subagent.md:64 says the key is "written for a fn entry only", and subagent.md:116 states the drop verdict for the file carrier. The token's cited clause does not pin the fallback it annotates. The `parseLaunchEntry(...) ?? THETA_LAUNCH_ENTRY` arm at :307 is not in a catch at all.
- Stated-rationale check: the doc comment at :288-292 gives "(a `.theta` callee's launch writes no key)". That holds for absence and is shown false for presence (see above). `grep -rln "readLaunchEntryFromEnv\|PI_THETA_SUBAGENT_ENTRY" docs/bugs` gives 0 hits, so no bug-doc ruling exists. `git log -S "readLaunchEntryFromEnv"` shows the function arrived in 4ae9b29c (rfc 0012 step 2), with no later ruling commit.
- Sibling-reality check: both call sites are live. `grep -rn "readLaunchEntryFromEnv" src` gives 2 hits (definition :293, caller :356 inside `readChildControlPlane`), and `readChildControlPlane` is called from `readProductionChildControlPlane` (`src/extension/production-subagent-host.ts:296`). The file-carrier drop is live on every non-`pipe` launch.
- Test pin (routing, not D7 scope): `tests/subagent-launch-file.test.ts:292-297` asserts the fallback (`"{bad"` and `'{"kind":"fn","name":""}'` both give `{ kind: "theta" }`). A fix would change that cell.

## Triage
verdict: questionable — divergence verified: subagent-launch-file.ts:233-236 has parseLaunchFileDocument return undefined on a bad entry, so readChildControlPlane drops to the scrubbed env (:363-366), while readLaunchEntryFromEnv maps a present-but-malformed value to THETA_LAUNCH_ENTRY (:296-307) and keeps the authenticated env (:353-357). The writer (subagent-launcher.ts:471-472) sets the key only for fn entries, and all stated searches reproduce (3 parseLaunchEntry( hits, 5 docs hits, 0 docs/bugs hits, 4ae9b29c origin, test pin at tests/subagent-launch-file.test.ts:292-297). The anchor does not pin the env side, though: subagent.md:116 gives the drop verdict only for a launch-file path that "does not exist, is not owned by the current user, or fails to parse", and it scopes ppid to env carriage without saying what a malformed PI_THETA_SUBAGENT_ENTRY does. subagent.md:64 and RFC 0012 :830-834/:1107 say nothing on it either. The filing gets from the file clause to the env carrier by analogy, and its own direction ("a refusal") leaves open whether that means dropping the control plane or sending an err envelope. Which posture is right needs a human ruling (triage: claude-opus-5-5)
verdict: confirmed — RATIFIED: a present-but-undecodable PI_THETA_SUBAGENT_ENTRY (malformed JSON or a parseLaunchEntry refusal) takes the failed-ppid-check verdict, matching the launch-file carrier: readLaunchEntryFromEnv signals refusal instead of defaulting, and readChildControlPlane's pipe arm then mirrors :363-366 - scrub every SUBAGENT_CONTROL_PLANE_ENV_KEYS member and return the theta entry, so the child runs as ordinary top-level pi and the parent observes exit-without-envelope. Absent key keeps the theta-entry arm (a .theta callee writes no key). Update the :288-292 doc comment and the :303 allow-broad-catch token to name the drop, and flip tests/subagent-launch-file.test.ts:292-297 to the new verdict.
