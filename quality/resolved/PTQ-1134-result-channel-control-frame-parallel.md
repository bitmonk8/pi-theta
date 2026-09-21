---
id: PTQ-1134
title: Result-channel control-frame encoder and decoder must stay in step
lens: D4
status: fixed
verdict: confirmed
locations:
  - src/runtime/subagent-result-channel.ts:63-73
  - src/runtime/subagent-result-channel.ts:89-126
sites: 2
fix_scope: localized
d4_class: parallel
wave: qw20260920183643
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-20
---

# Result-channel control-frame encoder and decoder must stay in step

## Observation
`src/runtime/subagent-result-channel.ts` defines the RFC-0012 result-channel wire format for non-`pipe` subagent placements. The module exposes `encodeControlFrame` to serialize child-to-parent control frames, and `classifyInboundFrame` to deserialize inbound NDJSON lines back into the same frame kinds. The two functions are the only places that know which control-frame types exist and how they are shaped.

## Evidence
`src/runtime/subagent-result-channel.ts:63-73` — the encoder input type and the encoder itself:

```ts
/** The child → parent control frames (reserved-key lines pass through as-is). */
export type ResultChannelControlFrame =
  | { readonly type: "hello"; readonly token: string; readonly nonce: string }
  | { readonly type: "heartbeat" }
  | { readonly type: "stderr"; readonly line: string };

/** Encode one control frame as an NDJSON line. */
export function encodeControlFrame(frame: ResultChannelControlFrame): string {
  return `${JSON.stringify(frame)}\n`;
}
```

`src/runtime/subagent-result-channel.ts:89-126` — the decoder/ classifier, which parses NDJSON and switches on `record["type"]`:

```ts
export function classifyInboundFrame(line: string): InboundFrame {
  const classified = classifyChildStdoutLine(line);
  if (classified.kind === "envelope") {
    return { kind: "reserved-line", line };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch (parseError: unknown) {
    void parseError;
    return { kind: "ignored" };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { kind: "ignored" };
  }
  const record = parsed as Record<string, unknown>;
  if (Object.hasOwn(record, "theta_progress")) {
    return { kind: "reserved-line", line };
  }
  switch (record["type"]) {
    case "hello":
      return typeof record["token"] === "string" && typeof record["nonce"] === "string"
        ? { kind: "hello", token: record["token"], nonce: record["nonce"] }
        : { kind: "ignored" };
    case "heartbeat":
      return { kind: "heartbeat" };
    case "stderr":
      return typeof record["line"] === "string" ? { kind: "stderr", line: record["line"] } : { kind: "ignored" };
    default:
      return { kind: "ignored" };
  }
}
```

Diff verdict: parallel, not identical. The encoder blindly JSON-stringifies any value matching `ResultChannelControlFrame`; the decoder manually inspects `type` and field types and maps to `InboundFrame`. The two sites enumerate the same three control-frame types (`hello`, `heartbeat`, `stderr`) but with no shared code.

## Why this is a problem
This is a load-bearing wire-protocol encoder/decoder pair. `encodeControlFrame` will happily emit a new control-frame type the instant it is added to the `ResultChannelControlFrame` union, but `classifyInboundFrame` will drop any `type` it does not recognise into `{ kind: "ignored" }`. A new frame kind would therefore be sent by the child and silently discarded by the parent, breaking any protocol semantics that frame carried (telemetry, flow control, authentication follow-up, etc.). Today the decoder covers 3 of the encoder's 3 cases; when the encoder gains a case, the decoder must too.

## Suggested direction (non-binding, optional)
Share a single source of truth for the control-frame discriminant and its field expectations inside `src/runtime/subagent-result-channel.ts`, e.g. a helper that both serialises and classifies, or a schema/map that `classifyInboundFrame` consults instead of a hand-written switch.

## False-positive check
- Re-read both cited spans immediately before filing; lines and shapes match the excerpts above.
- Searched `src/` for `encodeControlFrame` and `classifyInboundFrame`: both functions are defined only here and consumed only within this file (`openResultChannel` consumes `classifyInboundFrame`; child-side socket writes use `encodeControlFrame`).
- Checked `quality/intake/` for existing findings mentioning `subagent-result-channel`, `ResultChannelControlFrame`, `InboundFrame`, or "control frame": only `qw20260920183643-d4-01-lf-line-pump-cloned.md` references this file, and it concerns the LF-splitting loop, not the frame encoder/decoder.
- Both copies are live production code; neither is a test-only helper or generated file.
- The similarity is not spec-normative vector repetition; it is a wire-protocol pair that must stay in step.

## Triage
verdict: questionable — accounting verified: ResultChannelControlFrame (subagent-result-channel.ts:65-68) has 3 members (hello/heartbeat/stderr) and classifyInboundFrame's switch (:107-118) covers exactly those 3 with no compile-time tether (it switches on `unknown` record["type"], so a 4th union member is not a tsc error); both excerpts match at :64-73/:89-119 (small drift), both sides live (encoder at :540/:550/:568, decoder at :280), clone-scan lists no group (parallel, not clone), no PTQ covers this pair (PTQ-0292/PTQ-0415 are the progress-wire and child-tap pairs); note the FP-check overstates "consumed only within this file" — tests/helpers/result-channel-harness.ts:110-112 and tests/subagent-result-channel.test.ts:79-81 consume both and already round-trip all 3 kinds today; whether to add a compile-time ledger/exhaustiveness tether (the shape humans ratified for PTQ-0292/PTQ-0415) vs. a shared encode/classify helper is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — re-verified independently: accounting accurate — `ResultChannelControlFrame` (subagent-result-channel.ts:65-68) has 3 members and `classifyInboundFrame`'s switch (:138-149, excerpt drifted from cited :89-126 but content-matches) covers 3/3 on an `unknown` discriminant with no compile-time tether; encoder live at :564/:574/:592, decoder at :304; clone-scan map lists no group; no PTQ in issues/resolved names this pair (PTQ-0292/PTQ-0415 are the child-tap pairs; intake d9-01 on this host is a breakdown, different root cause); FP-check overstates isolation — tests/helpers/result-channel-harness.ts:110-112 and tests/subagent-result-channel.test.ts:79-87 consume both and round-trip all 3 kinds; the shared source of truth (exhaustiveness tether vs. encode/classify helper) is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified independently: `ResultChannelControlFrame` (subagent-result-channel.ts:65-68) has 3 members and `classifyInboundFrame`'s switch (:138-149) covers 3/3 on `record["type"]` typed `unknown`, so a 4th union member compiles without touching the decoder (no exhaustiveness tether); excerpts content-match at :64-73 and :119-149 (drift from cited :89-126); both sides live in src (decoder :304, encoder :564/:574/:592); `clone-scan map` on the host lists no group (parallel, not clone); grep across src/extensions/tools/tests finds no other definitions — but the FP-check's "consumed only within this file" is wrong: tests/helpers/result-channel-harness.ts:110-112 and tests/subagent-result-channel.test.ts:79-87 consume both and round-trip all 3 kinds plus a `type:"abort"` ignored-witness; dedupe clean (PTQ-0292/PTQ-0415 are child-tap.ts/progress-tool.ts pairs; intake qw20260920223212-d9-01 on this host is a module breakdown, different root cause); D4 parallel with accurate counts → the shared source of truth is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-21): accepted as confirmed - batch ruling, all D4/D9 intake items accepted.
