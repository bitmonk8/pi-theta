---
id: pending
title: Each reserved result-channel line is JSON.parsed two to three times inside the channel layer because classifyInboundFrame discards the envelope/progress verdict it already computed and openResultChannel re-derives it
lens: D8
status: intake
verdict: pending
locations:
  - src/runtime/subagent-result-frames.ts:93-110
  - src/runtime/subagent-result-channel.ts:210-220
  - src/runtime/subagent-envelope.ts:304-320
  - src/runtime/subagent-result-frames.ts:19-25
sites: 3
fix_scope: module
d8_class: heavier-than-scale
d8_host: src/runtime/subagent-result-channel.ts#openResultChannel
wave: qw20260921183818
reported_by: lens-d8-simplification (anthropic/claude-fable-5)
date: 2026-09-21
---

# Each reserved result-channel line is JSON.parsed two to three times inside the channel layer because classifyInboundFrame discards the envelope/progress verdict it already computed and openResultChannel re-derives it

## Observation
`classifyInboundFrame` (subagent-result-frames.ts:93-133) classifies one inbound
channel line. For a `theta_result` line it calls `classifyChildStdoutLine` (which
JSON.parses the full line) and returns `{ kind: "reserved-line", line }`,
discarding the envelope verdict. For a `theta_progress` line the envelope test
fails, so the function JSON.parses the same line a second time to find the
`theta_progress` key — and again returns only `"reserved-line"`. The sole consumer,
`openResultChannel`'s per-line dispatch (subagent-result-channel.ts:210-220), then
calls `classifyChildStdoutLine(frame.line)` on every reserved line to re-derive
the envelope-or-not answer the classifier already computed and threw away. Net:
two full JSON.parse traversals per envelope line and three per progress line,
inside the channel layer alone, before the drive's own parser runs.

## Evidence
Parse #1 and the verdict discard, plus parse #2 for progress —
src/runtime/subagent-result-frames.ts:93-110:

```
export function classifyInboundFrame(line: string): InboundFrame {
  const classified = classifyChildStdoutLine(line);
  if (classified.kind === "envelope") {
    return { kind: "reserved-line", line };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch (parseError: unknown) { // allow-broad-catch: RFC-0012 result channel — a non-JSON frame is a tolerated stray line, pi-integration-contract/subagent.md
    void parseError;
    return { kind: "ignored" };
  }
  ...
  if (Object.hasOwn(record, "theta_progress")) {
    return { kind: "reserved-line", line };
  }
```

Parse #2 (envelope) / #3 (progress): the consumer re-derives the discarded
verdict — src/runtime/subagent-result-channel.ts:210-220:

```
          case "reserved-line":
            for (const listener of [...lineListeners]) {
              listener(frame.line);
            }
            if (classifyChildStdoutLine(frame.line).kind === "envelope") {
              // The result arrived: the invocation is settled whatever the
              // child does next (a visible child lingers on `Err` by design,
              // §8 — that is not a budget breach and it is not killed).
              settle({ code: 0, signal: null });
              return;
            }
            break;
```

`classifyChildStdoutLine` parses the whole line on every call, and its own doc
claims singleness — src/runtime/subagent-envelope.ts:304-305 and 313-317:

```
 * This is the sole `JSON.parse` + reserved-key test for a child stdout line;
```
```
export function classifyChildStdoutLine(line: string): ChildStdoutLineClass {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
```

Data size at the call site — the envelope line is uncapped by design,
src/runtime/subagent-result-frames.ts:22-24 (the module's own constant doc):

```
 * newline is dropped unread. After the hello there is no cap — the envelope
 * has none on the stdout pipe either (PIC-59), and the channel keeps parity.
```

Cost shape: per reserved line, `JSON.parse` is O(bytes of line) and allocates the
full parsed tree each call. The `theta_result` envelope line carries the whole
subagent return payload (uncapped, per the excerpt above) and is parsed twice in
this layer; a `theta_progress` line is parsed three times. The three cited parse
sites are frames.ts:94 (via classifyChildStdoutLine), frames.ts:100, and
channel.ts:214 (via classifyChildStdoutLine).

## Why this is a problem
The information is computed and then re-computed: `classifyInboundFrame` knows at
frames.ts:95-96 whether the reserved line is an envelope, and at frames.ts:109-110
whether it is a progress line, but its `InboundFrame` union (frames.ts:80-85)
collapses both to one `"reserved-line"` arm, forcing the sole consumer to run the
full parse again per line to recover one bit. This also contradicts the
classifier's own single-source claim (subagent-envelope.ts:304: "the sole
`JSON.parse` + reserved-key test for a child stdout line") — under a channel
placement that test runs twice per envelope line, and the same line is parsed up
to three times, each parse traversing an uncapped payload. The extra parses buy
nothing: no verdict can differ between the calls (same immutable string, same
pure function).

## Suggested direction (non-binding, optional)
Unproven hypothesis: let `classifyInboundFrame` carry the sub-verdict it already
holds — e.g. split `"reserved-line"` into `"envelope-line"` / `"progress-line"`
(or add a boolean) — so `openResultChannel`'s dispatch settles on the frame kind
without re-parsing, and the progress detection reuses the `parsed` value from the
one parse instead of a fresh one. The line is still forwarded verbatim to the
drive's own parser, so PIC-59 stray-line tolerance and the drive-judges-the-line
posture are unchanged.

## False-positive check
- Spec check: pi-integration-contract/subagent.md (PIC-59) governs what the
  parent does with lines (forward verbatim, tolerate strays); no clause pins the
  internal `InboundFrame` vocabulary or requires re-classification, and the
  forwarded bytes are untouched by the hypothesis. No `challenges_spec`.
- Spec-enumeration precedent: `InboundFrame`'s arms mirror no spec-named
  enumeration (the spec names hello/heartbeat/stderr control frames and the
  reserved-key pass-through; the envelope/progress distinction is already spec
  vocabulary, so widening the arm follows the spec rather than fighting it).
- Exemption check: subagent-result-channel.ts and subagent-result-frames.ts are
  band-exempt for D9 breakdown only; no D8 exemption exists for either host and
  no prior D8 filing names this mechanism.
- Duplicate check: PTQ-1206 (result-channel parent-child frames) is a D9
  placement/breakdown item and PTQ-1134 (result-channel control frame parallel)
  is a D4 parallel between the encoder/decoder unions; neither claims the
  redundant re-parse. PTQ-1114 (lf-line-pump cloned) concerns the line buffer,
  not classification.
- Liveness: `classifyInboundFrame` has exactly one production consumer
  (`openResultChannel`, verified by grep — subagent-result-channel.ts:214 is the
  only `classifyChildStdoutLine` call in the file besides the import), so the
  counted parse multiplicity holds at every live call site.

## Triage
verdict: questionable — accounting verified: excerpts byte-match (frames.ts:93-110, channel.ts:210-220, envelope.ts:304-317, frames.ts:22-24); parse multiplicity reproduces — envelope line parsed at frames.ts:94 (via classifyChildStdoutLine) + channel.ts:214 = 2, progress line at frames.ts:94 + frames.ts:100 + channel.ts:214 = 3; classifyInboundFrame has one src consumer (channel.ts:196) and channel.ts:214 is the file's only classifyChildStdoutLine call; envelope line uncapped per PIC-59 and the constant doc (progress lines are 4096-capped child-side per PIC-74, so "uncapped" over-reaches for that arm only); PIC-74 forbids widening classifyChildStdoutLine but the direction widens the channel-internal InboundFrame and forwards bytes verbatim, so no spec behaviour drops; neither file appears in quality/exemptions.json; PTQ-1134 (encoder/decoder parallel, resolved) and PTQ-1206 (D9 breakdown, resolved) name classifyInboundFrame but neither claims the re-parse; the "sole JSON.parse" doc describes a code site not a per-line call count so that contradiction is loose, but the mechanical redundancy stands; whether to widen the InboundFrame arm is a design decision for a human ruling (triage: claude-fable-5-1)
