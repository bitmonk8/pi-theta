---
id: pending
title: subagent-launcher.ts header and stdio docs still narrate the retired RFC-0005 RPC drive model (parent-held interpreter, conversation-drive seam, RPC stdio, long-lived multi-query child)
lens: D2
status: intake
verdict: pending
locations:
  - src/runtime/subagent-launcher.ts:1-11
  - src/runtime/subagent-launcher.ts:46-48
  - src/runtime/subagent-launcher.ts:533-537
sites: 3
fix_scope: localized
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# subagent-launcher.ts header and stdio docs still narrate the retired RFC-0005 RPC drive model (parent-held interpreter, conversation-drive seam, RPC stdio, long-lived multi-query child)

## Observation
The launcher survived the RFC-0005 → RFC-0006 driver switchover, but its module
header and two doc comments still describe the retired RPC drive: the header
titles the module "RFC-0005", claims "The theta interpreter stays in the
parent", and places the launch "behind the `conversation-drive.ts` drive seam";
the spawn-failure code's doc speaks of "the RPC stdio"; and the stdout-line
subscription doc describes "strict-JSONL RPC events" from "a long-lived child
driving many queries". Under RFC 0006 the child owns its whole interpreter, no
RPC channel exists (stdin is spawned closed and the result rides one stdout
envelope), each child serves exactly one invocation then self-exits, and
conversation-drive.ts contains no subagent code. The same file's own RFC-0006
argv doc contradicts the header.

## Evidence
src/runtime/subagent-launcher.ts:1-11 — the header:

```ts
// RFC-0005 — subagent child-process launcher seam.
//
// This module owns the child-process launch half of the RFC-0005 subagent
// drive (pi-integration-contract/subagent.md): the executable-resolution
// ladder (#subagent-executable-resolution), argv assembly (#subagent-launch-
// contract), the env marshalling (the live `PI_THETA_SUBAGENT_ROOT` regime
// marker — which subsumed RFC-0005's retired `PI_THETA_SUBAGENT_CHILD` per
// PIC-58 — the parent-PID carriage, and the per-chain invoke-depth carriage per
// invocation.md §INV-4), and the spawn seam. The theta interpreter stays in the
// parent; only the child-`pi` process launch lives here, behind the
// `conversation-drive.ts` drive seam.
```

Contradicted in the same file at :389-390 (`assembleSubagentArgv` doc): "The
child runs the WHOLE callee: interpreter, extension discovery, and its own host
agent loop", and by src/runtime/subagent-json-driver.ts:3-5: "Under RFC 0006
the child owns its whole interpreter". `grep -n "subagent" src/runtime/conversation-drive.ts`
→ 0 hits; the launch is driven from src/extension/production-theta-producer.ts:2578
(`launchSubagentChild(`), not through conversation-drive.ts.

src/runtime/subagent-launcher.ts:46-48 — "RPC stdio" on the spawn-failure code:

```ts
 * `theta/runtime/subagent-spawn-failed` — the child `pi` process spawn failed
 * at launch (ENOENT, EPERM, immediate nonzero exit before the RPC stdio was
 * usable).
```

src/runtime/subagent-launcher.ts:533-537 — RPC events and a multi-query child:

```ts
  /**
   * Subscribe to LF-split stdout lines (strict-JSONL RPC events). Returns an
   * unsubscribe handle so a per-query reader detaches its listener on settle —
   * a long-lived child driving many queries must not accumulate O(queries)
   * stdout listeners.
   */
```

Contradicted by src/runtime/subagent-isolation.ts:196-198 ("one invocation per
process: envelope → self-exit") and subagent-json-driver.ts:14-16 ("its stdin
is spawned closed (bug 0002 — there is no in-band stop channel)"). The RPC
driver module itself is gone: `ls src/runtime/ | grep rpc` → no file, and
subagent-json-driver.ts:21-23 records "The RFC-0005 RPC drive contract
(`subagent-rpc-driver.ts` …) is RETIRED by this driver, not kept as a
fallback."

## Why this is a problem
Historical narration comments describing a retired architecture. Each stale
sentence makes a currently-false claim about where the interpreter runs, which
seam drives the launch, what protocol the stdout lines carry, and how many
queries a child serves — the exact orientation facts a maintainer reads a
module header for. The file was partially updated for RFC 0006 (the marker and
argv docs say "RFC-0006"), so the remaining RFC-0005 sentences read as current
truth rather than history.

## Suggested direction (non-binding, optional)
Retitle the header to the RFC-0006 launch contract and rewrite the three
sentences to the current model (child-owned interpreter, launch driven from the
producer's subagent path, `--mode json` event lines, one invocation per
process), keeping the deliberate historical notes ("subsumed RFC-0005's retired
marker") that are already phrased as history.

## False-positive check
- Confirmed the contradictions are in-repo and current: same-file `assembleSubagentArgv` doc (:389-390), subagent-json-driver.ts header, subagent-isolation.ts teardown doc, and the absence of any `subagent-rpc-driver.ts`.
- Checked conversation-drive.ts for any subagent linkage: `grep -n "launchSubagentChild|subagent" src/runtime/conversation-drive.ts` → 0 hits; `launchSubagentChild` callers: src/extension/production-theta-producer.ts only (grep across src/).
- Checked this is not a deliberately retained spec quotation: subagent.md anchors cited in the header (#subagent-executable-resolution, #subagent-launch-contract) concern resolution/argv, which remain accurate; only the drive-model sentences are stale.
- Distinct root cause from the parent-PID comment finding (filed separately): that one is falsified by a later feature landing; this one by the RFC-0006 switchover.

## Triage
