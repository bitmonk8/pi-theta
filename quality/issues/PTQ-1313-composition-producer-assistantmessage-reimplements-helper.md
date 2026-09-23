---
id: PTQ-1313
title: composition-producer.test.ts hand-rolls a text-only AssistantMessage fixture already exported as `assistant()` by the sibling helper it imports from in the same statement
lens: D7
status: open
verdict: confirmed
locations:
  - tests/composition-producer.test.ts:1-1
  - tests/composition-producer.test.ts:92-109
  - tests/composition-producer.test.ts:158-158
  - tests/helpers/agent-message-fixtures.ts:19-30
sites: 1
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# composition-producer.test.ts hand-rolls a text-only AssistantMessage fixture already exported as `assistant()` by the sibling helper it imports from in the same statement

## Observation
tests/composition-producer.test.ts imports `user as userMessage` from `./helpers/agent-message-fixtures` (line 1), but does not import that same module's sibling export `assistant`, which builds a text-only `AssistantMessage` with the same shape (single `text` content part, `anthropic-messages`/`anthropic`, zero usage, `stopReason: "stop"`, `timestamp: 0`). Instead the file declares its own local `assistantMessage(text: string)` function (lines 92-109) that builds the identical shape by hand, differing only in the immaterial `model` field value ("claude-test" vs. the helper's "test-model") and a trailing `as AssistantMessage` cast the helper does not need. The local function has exactly one call site (line 158), passing only a plain string — the same single-argument text-only usage the canonical `assistant(text)` helper already covers.

## Evidence
tests/composition-producer.test.ts:1:
```ts
import { user as userMessage } from "./helpers/agent-message-fixtures";
```

tests/composition-producer.test.ts:92-109:
```ts
function assistantMessage(text: string): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "claude-test",
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
  } as AssistantMessage;
}
```

tests/composition-producer.test.ts:158 (the only call site):
```ts
      this.messages.push(assistantMessage(this.finalText));
```

tests/helpers/agent-message-fixtures.ts:19-30 (the canonical sibling export, same module already imported at line 1):
```ts
/** A text-only assistant reply with the fixed model and zero usage. */
export function assistant(text: string): AssistantMessage {
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
```

Search: `grep -n "assistantMessage(" tests/composition-producer.test.ts` returns exactly two lines — the local declaration (92) and its single call site (158); `grep -n "assistantMessage\|agent-message-fixtures" tests/conformance/production-conformance.test.ts tests/ctor-declaration-order.test.ts` returns no hits, so the reimplementation is confined to this one file in the briefed scope.

## Why this is a problem
The file already imports a named export from `tests/helpers/agent-message-fixtures.ts` in its very first line, and that same module exports `assistant(text)` producing the byte-for-byte-equivalent structure (modulo the immaterial `model` string) that the file's own `assistantMessage` reconstructs by hand 90 lines later, used at exactly one call site with the exact single-argument text-only shape the helper covers. This is a copy-paste fixture: a fixture reimplemented in the test body where a canonical helper already exists under `tests/helpers/` and is even partially imported in the same file.

## Suggested direction (non-binding, optional)
`tests/helpers/agent-message-fixtures.ts`'s `assistant` export is the natural existing home for this shape; the local `assistantMessage` function's one call site takes only a string, matching that export's signature.

## False-positive check
Gate-pin check: not applicable — file name does not match `*gate*.test.ts` or kin. Recording-double check: not applicable — this is a plain value-fixture builder, not a call-recording double, so the "negative witness" carve-out does not apply. docs/bugs/ signature search: `grep -rn "assistantMessage" docs/bugs/` found no reference tying this local function to a documented correct-reason red. coverage-matrix/bug-doc citation search: `grep -rn "composition-producer.test.ts" docs/reference/coverage-matrix.md docs/bugs/*.md` returned no hits naming this test file or this fixture by name, so no citation pins this specific function. This finding proposes no merge/rename/delete of a cited test — it is entirely within the D7 copy-paste-fixture class, not coverage (both the canonical helper and the local duplicate already exist and are exercised; nothing about untested paths is claimed).

## Triage
verdict: confirmed — independently re-verified: all four excerpts reproduce at the cited lines (local `assistantMessage(text)` :92-109, sole call site :158, `user as userMessage` import :1, helper `assistant(text)` at tests/helpers/agent-message-fixtures.ts:19-30); `grep -n "assistantMessage("` on the file yields exactly the declaration + one call site, the in-scope sibling files have no hits, no docs/bugs or coverage-matrix citation names this file/fixture, and nothing in the file reads `.model` or `usage` so the only field delta ("claude-test" vs "test-model") is immaterial — the same helper module also exports `assistantMessage({text, stopReason})` whose output is byte-identical including `model: "claude-test"`; not a duplicate: resolved PTQ-0693 covered only the 3-line `userMessage` builder (its fix produced the line-1 import) and expressly excluded this file's `assistantMessage` as a diverging body, and same-wave sibling d7-01-usage-literal targets the helper's internal USAGE reuse, a different root cause; no gate/recording-double/bug-red carve-out applies; D7 copy-paste fixture, fix is a mechanical add-to-import + delete (triage: claude-fable-5-1)
