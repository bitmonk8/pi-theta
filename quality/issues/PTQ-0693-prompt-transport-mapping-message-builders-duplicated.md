---
id: PTQ-0693
title: prompt-transport-mapping.test.ts's userMessage/assistantMessage pi-ai builders are redeclared byte-for-byte in tests/b0413-pic51b-non-error-terminators-witness.test.ts, which names the mirrored file in its own comment
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/prompt-transport-mapping.test.ts:32-66
  - tests/b0413-pic51b-non-error-terminators-witness.test.ts:525-556
  - tests/composition-producer.test.ts:98-100
  - tests/conversation-drive.test.ts:112-114
sites: 4
fix_scope: cross-module       # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# prompt-transport-mapping.test.ts's userMessage/assistantMessage pi-ai builders are redeclared byte-for-byte in tests/b0413-pic51b-non-error-terminators-witness.test.ts, which names the mirrored file in its own comment

## Observation
`tests/prompt-transport-mapping.test.ts` declares module-scope `userMessage(content)` and `assistantMessage(opts)` builders for pi-ai `Message` fixtures. `tests/b0413-pic51b-non-error-terminators-witness.test.ts` declares the identical two functions, and its own comment directly above them states the borrowing: "mirroring tests/prompt-transport-mapping.test.ts's pi-ai `Message[]` builders." A narrower `userMessage(content)` (the 3-line body, byte-identical across all four) also recurs in `tests/composition-producer.test.ts` and `tests/conversation-drive.test.ts`, whose own `assistantMessage` bodies diverge (different parameter shapes) because those two files build different content-part combinations.

## Evidence

`tests/prompt-transport-mapping.test.ts:32-66`:
```ts
function userMessage(content: string): UserMessage {
  return { role: "user", content, timestamp: 0 };
}

/**
 * An assistant message carrying the given `text` and a chosen `stopReason` /
 * optional `errorMessage`. Used to build the driven turn's trailing `assistant`
 * message the post-`waitForIdle()` probe reads.
 */
function assistantMessage(opts: {
  text?: string;
  stopReason: AssistantMessage["stopReason"];
  errorMessage?: string;
}): AssistantMessage {
  const base: AssistantMessage = {
    role: "assistant",
    content: opts.text === undefined ? [] : [{ type: "text", text: opts.text }],
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
    stopReason: opts.stopReason,
    timestamp: 0,
  };
  return opts.errorMessage === undefined
    ? base
    : { ...base, errorMessage: opts.errorMessage };
}
```

`tests/b0413-pic51b-non-error-terminators-witness.test.ts:521-556` (the comment naming this file, then the byte-identical pair):
```ts
// ===========================================================================
// DIRECT unit cells over `extractPromptModeQueryResult` — pin the classifier
// arm itself, independent of the two consumer sites, mirroring
// tests/prompt-transport-mapping.test.ts's pi-ai `Message[]` builders. RED at
// the fork (the classifier returns Ok for every non-`"error"` terminator);
// the "toolUse" normal-boundary control stays Ok both before and after.
// ===========================================================================

function userMessage(content: string): UserMessage {
  return { role: "user", content, timestamp: 0 };
}

function assistantMessage(opts: {
  text?: string;
  stopReason: AssistantMessage["stopReason"];
  errorMessage?: string;
}): AssistantMessage {
  const base: AssistantMessage = {
    role: "assistant",
    content: opts.text === undefined ? [] : [{ type: "text", text: opts.text }],
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
    stopReason: opts.stopReason,
    timestamp: 0,
  };
  return opts.errorMessage === undefined ? base : { ...base, errorMessage: opts.errorMessage };
}
```

`tests/composition-producer.test.ts:98-100` and `tests/conversation-drive.test.ts:112-114` — the same 3-line `userMessage` body, byte-identical to both of the above:
```ts
function userMessage(content: string): UserMessage {
  return { role: "user", content, timestamp: 0 };
}
```

Verification performed during this review: `sed -n '32,66p' tests/prompt-transport-mapping.test.ts` diffed against `sed -n '529,556p' tests/b0413-pic51b-non-error-terminators-witness.test.ts` (the two functions only, comment excluded) reports zero content diff lines — every field, string and brace matches. `grep -n "^function userMessage" tests/*.test.ts` → 4 files (the two above plus `composition-producer.test.ts`, `conversation-drive.test.ts`); their `userMessage` bodies are identical across all four.

## Why this is a problem
`tests/prompt-transport-mapping.test.ts`'s `userMessage`/`assistantMessage` pair is retyped byte-for-byte in `tests/b0413-pic51b-non-error-terminators-witness.test.ts`, whose own comment states the mirroring is deliberate ("mirroring tests/prompt-transport-mapping.test.ts's pi-ai `Message[]` builders") rather than accidental convergence — an acknowledged copy that was not factored into an importable declaration. The narrower `userMessage` alone recurs in two further files, so the smallest common piece of this pi-ai fixture-builder shape is duplicated across four files in `tests/`, with no `tests/helpers/` module holding it.

## Suggested direction (non-binding, optional)
A shared `tests/helpers/` module exporting `userMessage` (the byte-identical 3-line builder all four files share) and the `assistantMessage(opts)` form `prompt-transport-mapping.test.ts` and `b0413` both use verbatim would be the natural home the b0413 comment already gestures at by naming its source.

## False-positive check
- Gate-pin check: none of the four files matches `*gate*.test.ts` or the named gate kin; the cited lines are pi-ai `Message` fixture-builder functions, not a pinned count or inventory assertion.
- Recording-double check: `userMessage`/`assistantMessage` are stimulus builders (construct a fixture value), not a recording double and not a "never called" witness; the carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "prompt-transport-mapping\|b0413-pic51b-non-error-terminators-witness" docs/bugs/` finds each file's own subject bug documents (the V9n-T seam / PIC-51b non-error terminators), none of which discusses this builder duplication as a documented correct-reason red; both files pass at HEAD.
- coverage-matrix/bug-doc citation search: `grep -n "prompt-transport-mapping\|b0413-pic51b-non-error-terminators-witness" docs/reference/coverage-matrix.md` → 0 hits pinning these specific builder functions by name. This finding proposes no merge, rename or deletion of any `it()`/`describe()`.
- Coverage check: the claim is about a duplicated fixture-builder DEFINITION, not a missing test path; every cell in all four files exercises its own copy successfully.

## Triage
verdict: confirmed — independently re-verified: all four excerpts reproduce (b0413's assistantMessage closes at :560 not :556, tolerated drift); `^function userMessage` greps to exactly the 4 cited files and no tests/helpers/ module exports a pi-ai Message builder; the prompt-transport-mapping:32-66 ↔ b0413:533-560 pair is token-identical after whitespace normalisation (the only raw diff is b0413 dropping the doc comment and joining the final ternary onto one line, so "byte-for-byte" is a slight overstatement, not a refutation), b0413's own header comment names the mirrored file, and the copy is live (5 call sites, :590-642) with both files green at HEAD (16/16); no gate/recording-double/bug-doc-red/coverage-matrix carve-out applies and no accepted PTQ tracks these builders (same-wave intake sibling d7-04 overlaps only on the 3-line userMessage in composition-producer/conversation-drive, a distinct primary root cause) — D7 copy-paste fixture, fix is a mechanical extract-and-import (triage: claude-fable-5-1)
