---
id: pending
title: production-subagent-host.ts combines filesystem policies and child-process adaptation at 613 LOC
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/production-subagent-host.ts:1-613
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/extension/production-subagent-host.ts
d9_band: zone
wave: qw20261028153325
reported_by: lens-d9-placement (openai/gpt-6.1-sol)
date: 2026-10-28
triaged_at: e071eada0d46fdc4e5ebc1a9f3bb2a97f028d3a5
---

# production-subagent-host.ts combines filesystem policies and child-process adaptation at 613 LOC

## Observation
The supplied structural map measures `production-subagent-host.ts` at 613 LOC, zone band. Its header describes the production OS collaborators for executable resolution and spawning/adapting a child process. The module also owns parent-environment authentication, child session-log path policy, two temp-file adapters, child control-plane intake, and an envelope fd writer. These are separate exported collaborator factories, rather than phases sharing one invocation's local state.

## Evidence
The inventory uses declaration LOC from the supplied map, summed by concern. It does not assign header/import/comment gaps to executable declarations.

| concern | members | line ranges | LOC |
|---|---|---|---|
| executable and parent environment | isEmbeddedFsPath, createProductionExecutableHost, readParentEnv, authenticateControlPlane, readParentPid | 82-84; 93-130; 164-169; 176-188; 191-193 | 63 |
| session paths and file channels | createChildSessionPathPolicy, createProductionLaunchFileFs, readProductionChildControlPlane, createProductionParamsFs | 222-250; 261-285; 297-303; 313-339 | 88 |
| result-envelope fd output | createProductionEnvelopeWriter, defaultStdoutFdWrite | 363-367; 370-372 | 8 |
| child-process streams and lifecycle | isWindows, NodeChildLike, makeLinePump, killChildTree, adaptChild, createProductionExecCommandRunner, createProductionSpawnFn | 375-377; 384-402; 405-428; 437-473; 481-528; 539-582; 602-613 | 187 |

Session path policy (222-228):
```ts
export function createChildSessionPathPolicy(
  getParentSessionFile: () => string | undefined,
  wallNow: () => number,
): (label: string) => string | undefined {
  return (label: string): string | undefined => {
    const parent = getParentSessionFile();
    if (parent === undefined || parent === "") return undefined;
```
Launch-file adapter (261-268):
```ts
export function createProductionLaunchFileFs(): LaunchFileFs {
  return {
    mkdtemp: (prefix: string, mode: number): string => {
      const dir = mkdtempSync(join(tmpdir(), prefix)); // allow-sync: RFC-0012 one-shot launch-file directory creation, not event-loop I/O
      if (process.platform !== "win32") {
        chmodSync(dir, mode); // allow-sync: RFC-0012 one-shot launch-file directory mode pin
      }
      return dir;
```
Process stream adaptation (481-483):
```ts
export function adaptChild(child: NodeChildLike): SubagentChildProcess {
  const onStdoutLine = makeLinePump(child.stdout);
  const onStderrLine = makeLinePump(child.stderr);
```
Spawn adapter (602-613):
```ts
export function createProductionSpawnFn(): SpawnFn {
  return (execPath, args, options) => {
    const child = nodeSpawn(execPath, [...args], {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    return adaptChild(child as unknown as NodeChildLike);
  };
}
```

Map-quoted importer counts (src/tests): `createChildSessionPathPolicy` 1/1, `createProductionLaunchFileFs` 1/0, `readProductionChildControlPlane` 2/0, `createProductionParamsFs` 1/0; `adaptChild` 0/2, `createProductionExecCommandRunner` 1/3, `createProductionSpawnFn` 1/3. The process group calls its own `makeLinePump`/`killChildTree`/`adaptChild`; none of those process members calls a filesystem-factory or session-path-policy member.

## Why this is a problem
Zone has no presumption of breakdown; this candidate rests on the four-row concern inventory, not on crossing 600 alone. The 88-LOC session/file-channel group has four independently consumed exports, while the 187-LOC process group has three independently consumed exports and its own private stream/kill substrate. Reasons considered: single algorithm/shared local state fails because these are separately constructed factories and the two groups share no stack locals; their shared Node imports are OS primitives, not a six-local algorithm. Closed-enumeration dispatch fails because the exports implement different contracts, not short arms of a spec table. Data-only fails: the only listed interface is `NodeChildLike` at 19 LOC, while the remaining mapped groups are functions. Grammar-production and generated-code reasons do not apply. PIC-59 close/stdio ordering is implemented inside the process group; it does not connect session-file derivation to line pumping as one critical section.

## Suggested direction (non-binding, optional)
All hypotheses unproven; human ratification required. Seam A: session-path/file-channel group -> `production-subagent-file-host.ts` (hypothesis) - 88 mapped declaration LOC, 4 exported symbols moved (`createChildSessionPathPolicy`, `createProductionLaunchFileFs`, `readProductionChildControlPlane`, `createProductionParamsFs`), their external src/tests importers respectively 1/1, 1/0, 2/0, 1/0, cross-references back: `readProductionChildControlPlane` calls `readParentEnv`; the other three call no declarations in the remaining host. Seam B: child-process streams/lifecycle group -> `production-subagent-process-host.ts` (hypothesis) - 187 mapped declaration LOC, 3 exported symbols moved (`adaptChild`, `createProductionExecCommandRunner`, `createProductionSpawnFn`), external src/tests importers respectively 0/2, 1/3, 1/3, cross-references back into the remaining host: none; private stream/kill members are included in the group.

## False-positive check
Band: map-quoted 613 LOC / zone; no function in this file crosses its function threshold. Reasons-considered list above; the zone basis is the distinct-concern inventory, not a presumption. Exemptions check: `quality/exemptions.json` has no D9 ruling for this file. Generated-code check: no generator banner; implementations carry RFC/bug-specific policy. Spec-mirror check: executable resolution, PIC-60 file channels, PIC-59 stdio ordering, RFC-0012 command execution and bug-0489 session policy do not enumerate one dispatch set. Header/barrel check: this is an implementation module, not a re-export facade or husk. History check: `git log -3 --oneline --follow -- src/extension/production-subagent-host.ts` shows bug-0519, bug-0493 and bug-0489 changes; no keep-whole ruling is recorded in the exemption file. Duplicate check: no open/intake D9 host row for this file was found; PTQ-1549 concerns async spawn-error posture, not this structural inventory, and is not re-filed.

## Triage
verdict: questionable — accounting verified: size-scan reproduces 613 LOC / zone, all four declaration inventories (63/88/8/187 LOC), excerpts and quoted importer counts match; filesystem/session policies and process adaptation are distinct groups with no shared locals, and no exemption, applicable keep-whole invariant, reverted split or same-root duplicate was found (PTQ-0323 addressed adaptChild internally; PTQ-1549 concerns spawn-error posture); whether to break down this OS-adapter host and where requires a human design ruling (triage: claude-opus-5-5)
