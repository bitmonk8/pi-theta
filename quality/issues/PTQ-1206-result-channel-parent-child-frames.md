---
id: PTQ-1206
title: subagent-result-channel.ts bundles the frame protocol, the parent-side channel, and the child-side client in one 602-LOC module whose two halves have disjoint src consumers
lens: D9
status: open
verdict: confirmed
locations:
  - src/runtime/subagent-result-channel.ts:1-602
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/runtime/subagent-result-channel.ts
d9_band: zone
wave: qw20260920223212
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# subagent-result-channel.ts bundles the frame protocol, the parent-side channel, and the child-side client in one 602-LOC module whose two halves have disjoint src consumers

## Observation
`src/runtime/subagent-result-channel.ts` is 602 LOC — zone band (600-999). Its header states the module's role: "RFC-0012 §3 — the result channel: the wire off stdout for non-`pipe` placements", "pure over two injected seams (`ChannelServerSeam` parent-side, `ChannelClientSeam` child-side)". The file itself partitions its body with three section banners — `// Frames.`, `// Parent side.`, `// Child side.` — and the parent-side and child-side sections share nothing but the frame layer: no symbol in either half references a symbol in the other, and no src module imports from both halves.

## Evidence
Distinct-concern inventory (line ranges and LOC from the structural map):

| concern | members | line ranges | LOC |
|---|---|---|---|
| Frame protocol (constants, control-frame encode, LF line buffer, inbound classify) | `RESULT_CHANNEL_HEARTBEAT_MS`, `RESULT_CHANNEL_SILENCE_BUDGET_MS`, `RESULT_CHANNEL_PRE_HELLO_MAX_BYTES`, `RESULT_CHANNEL_STDERR_LINE_CAP`, `CHANNEL_CLOSED_SIGNAL`, `HEARTBEAT_SILENCE_SIGNAL`, `ResultChannelControlFrame`, `encodeControlFrame`, `createLfLineBuffer`, `InboundFrame`, `classifyInboundFrame` | 33-150 | 80 |
| Parent-side channel (listener seam, channel handle, open, child-process adapter) | `ChannelConnection`, `ChannelServerSeam`, `ResultChannel`, `OpenResultChannelDeps`, `openResultChannel`, `adaptChannelToChildProcess` | 157-471 | 275 |
| Child-side client (dialer seam, client handle, connect) | `ChannelClientSocket`, `ChannelClientSeam`, `ResultChannelClient`, `connectResultChannel` | 478-602 | 116 |

Section banners (verbatim, at the concern boundaries):

```
// ---------------------------------------------------------------------------
// Frames.
// ---------------------------------------------------------------------------
...
// Parent side.
...
// Child side.
```

Importer counts (structural map): `openResultChannel` 1 src / 3 tests, `adaptChannelToChildProcess` 1 src / 3 tests, `connectResultChannel` 1 src / 3 tests, `ResultChannelClient` 2 src / 2 tests, `createLfLineBuffer` 1 src / 0 tests. Consumer identity (search `grep -rn "connectResultChannel\|openResultChannel\|adaptChannelToChildProcess" src` plus the module-path grep, 7 hits): the parent-side symbols are imported only by `src/extension/production-result-channel.ts` (lines 31-32); the child-side symbols only by `src/extension/production-composition.ts` (line 76, call at 2243) and `src/extension/factory.ts` (line 94, type only); the frame-layer `createLfLineBuffer` also by `src/extension/production-subagent-host.ts` (line 48). No src module imports from both the parent and child halves. Cross-references inside the file: the child side reaches back only to the frame layer (`encodeControlFrame` at 3 write sites, `RESULT_CHANNEL_HEARTBEAT_MS`, `RESULT_CHANNEL_STDERR_LINE_CAP`); the parent side only to the frame layer (`createLfLineBuffer`, `classifyInboundFrame`, `RESULT_CHANNEL_PRE_HELLO_MAX_BYTES`, the two pseudo-signals); zero parent↔child references. The file holds no module-level mutable state — all state is closure-local to `openResultChannel` / `connectResultChannel`.

## Why this is a problem
Zone band (602 ≥ 600): a breakdown finding needs a distinct-concern inventory with ≥ 2 concerns, and the inventory above has three, drawn from the file's own section banners. Reasons considered and defeated: closed-enumeration dispatch — the file is not a dispatch (defeated); single algorithm with shared local state — holds inside `openResultChannel` (10 closure locals) but not across sections: zero locals or module state cross any section boundary (defeated at file scope); data-only module — type/constant declarations total ~91 LOC of 602, 15%, far under 80% (defeated); grammar production — n/a; generated code — none (no generator marker). Exemptions check: `quality/exemptions.json` has no entry for this path. The two process-role halves evolve against different consumers (the parent half against `production-result-channel.ts`'s placement wiring, the child half against `production-composition.ts`'s in-child wiring), yet every reader of either half pages through the other.

## Suggested direction (non-binding, optional)
Seam A (hypothesis, unproven): child side moves → `subagent-result-channel-client.ts` — 116 LOC, exported symbols moved: `ChannelClientSocket`, `ChannelClientSeam`, `ResultChannelClient`, `connectResultChannel`; external importers of those symbols: 2 src (`production-composition.ts`, `factory.ts`) / 3 tests; cross-references back into the host: 3 (`encodeControlFrame`, `RESULT_CHANNEL_HEARTBEAT_MS`, `RESULT_CHANNEL_STDERR_LINE_CAP`). Seam B (hypothesis, unproven): frame layer moves → `subagent-result-frames.ts` — 80 LOC, exported symbols moved: the 6 constants plus `ResultChannelControlFrame`, `encodeControlFrame`, `createLfLineBuffer`, `InboundFrame`, `classifyInboundFrame`; external importers: 1 src (`production-subagent-host.ts` for `createLfLineBuffer`) plus both halves; cross-references back into the host: 0. The human ratifies one.

## False-positive check
Band: zone (602 LOC per the authoritative map; not recounted). Reasons-considered list: closed-enumeration, shared-local-state, data-only, grammar-production, generated — each checked and defeated as recorded above. Exemptions check: grepped `quality/exemptions.json` for the path — no entry. Generated-code check: hand-written module with an RFC-citing prose header, no generator banner. Spec-mirror check: RFC-0012 §3 defines one protocol, but the module header itself names two distinct injected seams (parent-side `ChannelServerSeam`, child-side `ChannelClientSeam`) and notes the production adapters already live elsewhere (`src/extension/production-result-channel.ts`), so the spec does not pin one-file cohabitation. Prior-filing check: PTQ-0323 (adaptChild, `production-subagent-host.ts`) is a different host; qw20260920183643-d4-01-result-channel-control-frame-parallel is a D4 duplication claim, different root cause; no prior D9 filing names this file. Function-level items dispositioned separately (kept whole in review notes): `openResultChannel` (justify — 10 shared closure locals), `onConnection` and `connectResultChannel` (zone — shared connection-lifecycle state, no 2-concern split).

## Triage
verdict: questionable — accounting verified: size-scan map reproduces 602 LOC / band zone with no quality/exemptions.json entry; the three banner-delimited rows (frames 60-150, parent 153-471, child 474-602) are real distinct concerns sharing no closure locals or module state (all state lives inside openResultChannel / connectResultChannel; type+const LOC ≈ 95/602 ≈ 16 %, so data-only is correctly defeated; no dispatch, grammar, generator, reverted split or measured-cost reason applies); the stated grep reproduces (7 hits; openResultChannel/adaptChannelToChildProcess → production-result-channel.ts only, connectResultChannel → production-composition.ts:2243 only, createLfLineBuffer → production-subagent-host.ts:348); d4-01 sibling is a different root cause (encode/decode parallel) and PTQ-1114 is resolved. One overstatement for the human: "no src module imports from both halves" is not strictly true — production-result-channel.ts:34 imports the child-side `type ChannelClientSeam` alongside the parent-side symbols because it deliberately co-hosts both node:net adapters (server + client) in one module, so the title's "disjoint src consumers" is overstated and the same both-halves-together convention already exists in the sibling; whether to split A, B, or keep whole is a design ruling (triage: claude-fable-5-1)
verdict: questionable — re-verified independently: size-scan map on a one-line manifest reproduces 602 LOC / band zone with no quality/exemptions.json row (D9 list empty for this host); the three banner-delimited rows (Frames 60-151, Parent 152-472, Child 473-602) are real distinct concerns — grep of the child section for parent symbols and of the parent section for child symbols both return zero hits, no module-level let/var exists (all state is closure-local to openResultChannel/connectResultChannel), type+const LOC = 95/602 ≈ 16 % so data-only is defeated, no dispatch/grammar/generator applies, and git log shows the file born whole at rfc-0012 step 3 with no reverted split; stated importer grep reproduces (7 hits: openResultChannel/adaptChannelToChildProcess → production-result-channel.ts:31-32/183/213, connectResultChannel → production-composition.ts:76/2243, ResultChannelClient type → factory.ts:94, createLfLineBuffer → production-subagent-host.ts:48); dedupe clean (d4-01 sibling is the encode/classify parallel, PTQ-1114 the LF-pump clone — different root causes); one overstatement for the human: "no src module imports from both halves" is false — production-result-channel.ts:34 imports the child-side `type ChannelClientSeam` (used at :100 by createProductionChannelClient) alongside the parent-side symbols, so the sibling adapter module already co-hosts both halves and the title's "disjoint src consumers" is overstated; whether to split on seam A, seam B, or keep whole is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-21): accepted as confirmed - batch ruling, all D4/D9 intake items accepted.
