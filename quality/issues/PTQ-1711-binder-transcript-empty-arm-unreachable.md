---
id: PTQ-1711
title: BinderRunner checks for an omitted rendered session context after excluding every input that produces one.
lens: D2
status: open
verdict: confirmed
locations:
  - src/extension/binder-run.ts:780-790
  - src/binder/compact-transcript.ts:349-356
  - src/binder/compact-transcript.ts:362-366
  - src/binder/turn-grouping.ts:26-38
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d2-cruft (openai/gpt-6.1-sol)
date: 2026-10-28
---

# BinderRunner checks for an omitted rendered session context after excluding every input that produces one.

## Observation
`BinderRunner.#buildBinderSessionContext` returns before rendering when `walk.includedMessages` is empty. It subsequently checks whether the successful renderer result has an undefined `sessionContext` and returns `none` again. The renderer produces that result only when turn grouping yields no turns, while grouping creates a turn for the first message of every nonempty input. Consequently the later `return { kind: "none" }` branch cannot be taken by this caller.

## Evidence
The caller's empty-input exclusion and later undefined-context branch, `src/extension/binder-run.ts:780-790`:

```ts
    if (walk.includedMessages.length === 0) {
      return { kind: "none" };
    }
    const rendered = renderCompactTranscript(walk.includedMessages);
    if (rendered.kind === "custom-type-unsafe") {
      return { kind: "unsafe", value: rendered.value };
    }
    if (rendered.sessionContext === undefined) {
      return { kind: "none" };
    }
    return { kind: "block", body: rendered.sessionContext.transcriptBody };
```

The renderer's undefined-context producer, `src/binder/compact-transcript.ts:349-356`:

```ts
  // Group into turns via the shared helper (same turn boundary the V11i walk
  // uses; see turn-grouping.ts for the boundary rule itself).
  const turns: TranscriptMessage[][] = groupMessagesIntoTurns(messages);

  // BNDR-7i void truncation: zero included turns ⇒ the whole Session-context
  // block is omitted (no header, no body, no terminating blank line).
  if (turns.length === 0) {
    return { kind: "ok", sessionContext: undefined };
```

The successful nonempty-turn return, `src/binder/compact-transcript.ts:362-366`:

```ts
  const blocks = turns.map((turn) =>
    turn.map((message) => renderMessage(message)).join(""),
  );
  const transcriptBody = blocks.join("\n");
  return { kind: "ok", sessionContext: { transcriptBody } };
```

Grouping never leaves a nonempty input without a turn, `src/binder/turn-grouping.ts:26-38`:

```ts
export function groupMessagesIntoTurns<T extends AgentMessage>(
  messages: readonly T[],
): T[][] {
  const turns: T[][] = [];
  for (const message of messages) {
    if (message.role === "user" || turns.length === 0) {
      turns.push([message]);
    } else {
      turns[turns.length - 1]?.push(message);
    }
  }
  return turns;
}
```

The exact reference search `rg -n 'renderCompactTranscript|groupMessagesIntoTurns|buildBinderSessionContext' src/ extensions/ tools/ tests/` returns 32 matching lines. The private method's call is `src/extension/binder-run.ts:210`; its renderer call and the renderer's grouping call are the ones quoted above. This finding concerns only the caller's branch at lines 787-789, not the renderer's empty-input outcome or its public result type.

## Why this is a problem
This is dead branch code proven by the producer and consumer together: reaching the renderer establishes a nonempty input, grouping establishes at least one turn, and the successful renderer return therefore always includes `sessionContext`. The second omission branch represents no additional runtime case after the first guard. The BNDR-7i omission behavior remains live at the first guard and in the renderer for other callers.

## Suggested direction (non-binding, optional)
Express the caller's established nonempty-input invariant without retaining a second omission path that cannot run.

## False-positive check
- Reference, string-key, dynamic-access, and re-export checks: ran `rg -n 'renderCompactTranscript|groupMessagesIntoTurns|buildBinderSessionContext' src/ extensions/ tools/ tests/` (32 matching lines), `rg -n 'compact-transcript|turn-grouping' src/ extensions/ tools/ tests/` (30 matching lines), and `rg -n 'rendered\.sessionContext === undefined|buildBinderSessionContext|groupMessagesIntoTurns' tests src extensions tools` (10 matching lines). Inspected the returned definitions/imports/calls. The method is a JavaScript private member, not a string-keyed property; the reference search exposes its call from `runBinder`, and the module-path search exposes the renderer/grouping imports rather than an alternate producer.
- Alternate test implementation check: ran `rg -n 'mock\(.{0,100}(compact-transcript|turn-grouping)|spyOn\(.{0,100}(renderCompactTranscript|groupMessagesIntoTurns)' tests src extensions tools` (0 matches). Also ran `rg -n 'mock|spyOn|stub' tests/bind-context-transcript.test.ts tests/b0478-augmented-agentmessage-variants-excluded-before-walk.test.ts tests/session-control-transcript-readers.test.ts tests/integration-acceptance.test.ts tests/b0398-custom-type-unsafe-note-details-diagnostics.test.ts` and inspected its hits: the mock replaces the provider completion module, not either transcript implementation. Renderer calls in tests are deliberate live callers; neither the renderer's undefined outcome nor its type arm is claimed dead.
- Producer check: ran `rg -n 'sessionContext|turns.length|return ' src/binder/compact-transcript.ts` and read the full renderer and grouping bodies. The only successful undefined-context return is the zero-turn branch quoted above; no input filtering happens between the caller's nonempty check and grouping that could empty this array.
- Spec/guard check: ran `rg -n 'BNDR-7i|zero included|zero turns|no turns|void truncation' docs/spec_topics/binder/`. BNDR-7i describes the zero-included-turn omission, already handled by the first guard and the renderer. The later caller branch is not an unsafe-custom-type refusal (that remains separately live at lines 784-785), nor an exhaustive union default. No rationale is stated at the later branch for a separate defensive omission path.
- Duplicate/rationale search: `rg -n 'rendered.sessionContext|sessionContext.*undefined.*branch|renderCompactTranscript.*non.empty|non.empty.*renderCompactTranscript' quality/issues/ quality/resolved/ docs/bugs/` returned no matches. Read resolved PTQ-0158: it addresses the earlier `!walk.applies` disjunct, not the renderer-result branch cited here.
- Git intent check: ran `git blame -L 780,790 -- src/extension/binder-run.ts`, `git log --oneline -S 'rendered.sessionContext === undefined' -- src/extension/binder-run.ts src/extension/production-theta-producer.ts`, `git log --oneline -S 'if (rendered.sessionContext === undefined)' -- src/extension/binder-run.ts src/extension/production-theta-producer.ts`, and `git show 2bc69157:src/extension/production-theta-producer.ts | grep -n -B5 -A5 'rendered.sessionContext === undefined'`. The branch was present in the predecessor producer and moved into `binder-run.ts` by `f1b77776`; it is not a newly introduced replacement for a different renderer contract.

## Triage
verdict: confirmed — Independently verified all excerpts and stated searches: binder-run.ts:780 excludes empty input, grouping always creates a turn for nonempty input, and the renderer returns undefined context only for zero turns, making :787-789 unreachable; BNDR-7i remains handled by the first guard, and resolved PTQ-0158 concerns a different disjunct. (triage: claude-opus-5-5)
