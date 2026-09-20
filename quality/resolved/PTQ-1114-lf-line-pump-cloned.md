---
id: PTQ-1114
title: LF-delimited line pump cloned between child stdio and result channel
lens: D4
status: fixed
verdict: confirmed
locations:
  - src/extension/production-subagent-host.ts:347-360
  - src/runtime/subagent-result-channel.ts:264-278
sites: 2
fix_scope: cross-module
d4_class: clone
wave: qw20260920183643
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-20
---

# LF-delimited line pump cloned between child stdio and result channel

## Observation
Two production sites split incoming byte streams into LF-delimited lines using the same loop skeleton. `makeLinePump` in `production-subagent-host.ts` buffers a child process's `stdout`/`stderr` into JSONL lines for the drive. `openResultChannel` in `runtime/subagent-result-channel.ts` buffers a TCP channel connection into NDJSON frames. Both sites append the incoming chunk to a string buffer, scan for `\n`, slice out each line, drop empty lines with an identical `continue`, and forward the remainder. The result channel was designed to carry the same reserved-key lines that the `pipe` placement carries on stdout, so both feeds eventually reach the same downstream line classifier (`classifyChildStdoutLine` in `subagent-envelope.ts`).

## Evidence
`src/extension/production-subagent-host.ts:347-360` — `makeLinePump` definition and the start of its data handler:

```ts
function makeLinePump(
  source: { on(event: "data", listener: (chunk: unknown) => void): void } | null,
): (listener: (line: string) => void) => () => void {
  let buffer = "";
  const listeners = new Set<(line: string) => void>();
  source?.on("data", (chunk: unknown) => {
    buffer += String(chunk);
    let idx: number;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (line.length === 0) {
        continue;
      }
```

`src/runtime/subagent-result-channel.ts:264-278` — `openResultChannel`'s `connection.onData` callback and the same splitting core:

```ts
    connection.onData((chunk) => {
      if (dropped || settled !== undefined) {
        return;
      }
      buffer += chunk;
      if (!helloSeen && buffer.length > RESULT_CHANNEL_PRE_HELLO_MAX_BYTES) {
        drop();
        return;
      }
      let idx: number;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (line.length === 0) {
          continue;
```

Diff verdict: identical core (renamed/literal-adapted only: `String(chunk)` vs `chunk`, listener snapshot vs frame classification after the `continue`). No clone-map group covers these spans — the scanner likely missed the pair because one copy is a module-level helper and the other is inline inside a larger closure.

## Why this is a problem
The two transports are load-bearing alternatives for the same wire content. A `pipe` placement sends `theta_result`/`theta_progress` lines on the child's stdout; a channel placement sends the same reserved-key lines over TCP. Both must agree on what constitutes a line: LF delimiter, empty lines dropped, trailing CR left for the parser. If one copy changes — for example to strip `\r`, to keep empty lines, or to use a different buffering strategy — the same logical frame can be parsed differently depending on placement. Today the logic is identical only because it was copied; there is no shared helper enforcing the invariant.

## Suggested direction (non-binding, optional)
Extract the LF-only line-splitting loop into a shared helper, e.g. exported from `src/runtime/subagent-result-channel.ts` (which already owns channel framing) or from a new small utility under `src/seams/`/`src/runtime/`, and have both `makeLinePump` and `openResultChannel` consume it. The helper should own the buffer, the `\n` scan, the empty-line skip, and the chunk-to-string normalization.

## False-positive check
- Re-read both cited ranges immediately before filing; both copies are live production code.
- Verified the downstream consumer is the same `classifyChildStdoutLine` path for both stdout and channel reserved-key lines.
- Not tests/ and not generated code.
- `docs/rpc.md` is cited only in `production-subagent-host.ts` for the JSONL framing; the runtime copy cites RFC-0012 for NDJSON frames, so the two copies are not both spec-anchored to the same clause.
- The clone map reports no groups for the in-scope files; this pair was found by manual reading below the scanner's token-window floor.

## Triage
verdict: confirmed — both excerpts match verbatim at the cited lines, both copies live (makeLinePump at :429-430; channel adapted onto onStdoutLine at :415), no third `buffer.indexOf("\n")` pump in src/extensions/tools, clone-scan lists no group as stated, and the parity anchor is documented (result-channel header :8-14 "writes the SAME reserved-key lines it writes to fd 1 under pipe") with both feeds reaching classifyChildStdoutLine; fixer must preserve the channel copy's mid-loop drop()/settle() returns and pre-hello byte cap (triage: claude-fable-5-1)
