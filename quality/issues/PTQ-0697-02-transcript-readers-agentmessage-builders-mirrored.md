---
id: PTQ-0697
title: session-control-transcript-readers.test.ts's user/assistant/compactionSummary builders are a near-byte-identical, self-declared mirror of b0478's, not imported
lens: D7
status: open
verdict: confirmed
locations:
  - tests/session-control-transcript-readers.test.ts:56-82
  - tests/b0478-augmented-agentmessage-variants-excluded-before-walk.test.ts:104-130
sites: 2
fix_scope: module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# session-control-transcript-readers.test.ts's user/assistant/compactionSummary builders are a near-byte-identical, self-declared mirror of b0478's, not imported

## Observation
`tests/session-control-transcript-readers.test.ts` declares its own `user()`,
`assistant()`, and `compactionSummary()` message-builder functions. Its own
header comment states these constructors "mirror b0478's". The three
functions in `tests/b0478-augmented-agentmessage-variants-excluded-before-walk.test.ts`
build the identical `{ role, content/summary, ...fields, timestamp: 0 }`
shapes with the same field values (`api: "anthropic-messages"`,
`provider: "anthropic"`, `model: "test-model"`, the same zeroed `usage`
object, `stopReason: "stop"`, `tokensBefore: 1234`). Neither file imports
these builders from `tests/helpers/`; the second file re-derives the same
three shapes from scratch, differing only in the wrapping type annotations
(`Message & AgentMessage` casts vs. the first file's precise `UserMessage`/
`AssistantMessage` types).

## Evidence
tests/session-control-transcript-readers.test.ts:56-82 (re-read immediately
before filing):
```ts
function user(text: string): Message & AgentMessage {
  return { role: "user", content: text, timestamp: 0 } as Message & AgentMessage;
}

function assistant(text: string): Message & AgentMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "test-model",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: 0,
  } as unknown as Message & AgentMessage;
}

function compactionSummary(summary: string): AgentMessage {
  return { role: "compactionSummary", summary, tokensBefore: 1234, timestamp: 0 } as AgentMessage;
}
```

tests/b0478-augmented-agentmessage-variants-excluded-before-walk.test.ts:104-130
(the same three shapes, typed rather than cast):
```ts
function user(text: string): UserMessage {
  return { role: "user", content: text, timestamp: 0 };
}

function assistant(text: string): AssistantMessage {
  const content: TextContent[] = [{ type: "text", text }];
  return {
    role: "assistant",
    content,
    api: "anthropic-messages",
    provider: "anthropic",
    model: "test-model",
    usage: USAGE,
    stopReason: "stop",
    timestamp: 0,
  };
}
...
function compactionSummary(summary: string): AgentMessage {
  return { role: "compactionSummary", summary, tokensBefore: 1234, timestamp: 0 };
}
```

The file header of session-control-transcript-readers.test.ts states this
outright ("--- AgentMessage / Message constructors (mirrors b0478's) ---"),
naming the exact file whose shapes are re-derived rather than imported.

## Why this is a problem
Both files construct the same three fixed `AgentMessage`/`Message` role
shapes (`user`, `assistant` with the identical zeroed usage/cost block, and
`compactionSummary` with the identical `tokensBefore: 1234`), and the second
file's own comment acknowledges the shape is copied rather than shared. A
change to any of these fixed literals (e.g. what `usage`/`cost` a fixture
`assistant` message needs to carry to satisfy a stricter `AgentMessage` type)
must be hand-applied in both files.

## Suggested direction (non-binding, optional)
No `tests/helpers/` module currently exports this `user`/`assistant`/
`compactionSummary` trio; the credited "mirrors b0478's" comment already
names the natural source file such a shared export would be lifted from.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin; not applicable.
- Recording-double check: these are plain data builders (no spies, no
  call-count tracking); neither backs a MUST-NOT witness. Not applicable.
- docs/bugs/ signature search: b0478's file is the RED witness for bug 0478,
  already fixed (its header states "fixed 0.474.0"); this finding does not
  contest that file's redness or behaviour, and
  `tests/session-control-transcript-readers.test.ts` is itself explicitly
  documented as "GREEN AT BIRTH" (re-pinning already-shipped behaviour), so
  neither cited file is a disputed red.
- coverage-matrix/bug-doc citation search: `grep -n "session-control-transcript-readers\|b0478-augmented-agentmessage-variants-excluded-before-walk" docs/reference/coverage-matrix.md` returns no hits. This finding proposes no merge, rename, or deletion of either file or any `it()`/`describe()` inside them.
- Coverage check: this finding is about a repeated builder-triple DEFINITION that exists in both files today, not a missing test path.

## Triage
verdict: confirmed — re-verified independently: both excerpts reproduce verbatim at the cited lines (transcript-readers :56-82 cast-typed, b0478 :104-130 precisely typed, same `api`/`provider`/`model: "test-model"`/zeroed usage+cost/`stopReason`/`tokensBefore: 1234` literals) and the header comment "mirrors b0478's" is real; `grep -rln "compactionSummary\|function assistant\|function user(" tests/helpers/` = 0 hits (no shared export exists), the coverage-matrix grep = 0 hits, neither file is a gate/recording-double/red witness, no merge/rename/delete proposed, and no PTQ or same-wave sibling tracks this trio (d7-01 is the unrelated frontmatter-parse harness); D7 copy-paste-fixture class in tests/ only; the dedupe is mechanical since `UserMessage | AssistantMessage ⊂ Message ⊂ AgentMessage` (pi-ai types.d.ts:308, pi-agent-core types.d.ts:272) so b0478's typed builders serve every transcript-readers call site — fixer note: tests/bind-context-transcript.test.ts:62-79 and tests/session-context-truncation.test.ts:48-64 carry the same `USAGE`/`user`/`assistant` pair (minus `compactionSummary`) and are natural additional importers of the lifted helper (triage: claude-fable-5-1)
