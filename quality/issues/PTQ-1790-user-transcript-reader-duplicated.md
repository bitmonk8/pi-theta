---
id: PTQ-1790
title: Both live harnesses maintain the same collectUserTexts transcript reader.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/live/harness.ts:750-767
  - tests/live/hardening/probe-harness.ts:248-265
  - tests/live/harness.ts:721-727
  - tests/live/hardening/probe-harness.ts:385-388
  - tests/helpers/live-transcript.ts:1-5
sites: 2
fix_scope: cross-module
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# Both live harnesses maintain the same collectUserTexts transcript reader.

## Observation
The H8a harness and hardening probe harness each define a private `collectUserTexts` reader over settled session entries. The two function bodies are byte-identical; only their signature formatting differs, including a trailing parameter comma in the hardening version. Both select user-role message entries and emit string content or each string-bearing array part as a separate result. Each harness calls its local reader to populate the drive's `userTexts` observable, and the H8a reader's comment explicitly calls it a mirror of the hardening reader.

## Evidence
Occurrence 1 — `tests/live/harness.ts:753-767` (signature and body; closing function brace omitted from this excerpt):
```ts
function collectUserTexts(entries: readonly unknown[]): readonly string[] {
  const texts: string[] = [];
  for (const entry of entries) {
    const e = entry as { type?: string; message?: { role?: string; content?: unknown } };
    if (e.type !== "message" || e.message?.role !== "user") continue;
    const content = e.message.content;
    if (typeof content === "string") texts.push(content);
    else if (Array.isArray(content)) {
      for (const part of content) {
        const t = (part as { text?: string }).text;
        if (typeof t === "string") texts.push(t);
      }
    }
  }
  return texts;
```

Occurrence 2 — `tests/live/hardening/probe-harness.ts:248-262`:
```ts
function collectUserTexts(
  entries: readonly unknown[],
): readonly string[] {
  const texts: string[] = [];
  for (const entry of entries) {
    const e = entry as { type?: string; message?: { role?: string; content?: unknown } };
    if (e.type !== "message" || e.message?.role !== "user") continue;
    const content = e.message.content;
    if (typeof content === "string") texts.push(content);
    else if (Array.isArray(content)) {
      for (const part of content) {
        const t = (part as { text?: string }).text;
        if (typeof t === "string") texts.push(t);
      }
    }
```
Its continuation, `tests/live/hardening/probe-harness.ts:263-265`:
```ts
  }
  return texts;
}
```

The mirror acknowledgment, `tests/live/harness.ts:750-752`:
```ts
 * Mirrors the hardening probe harness's `collectUserTexts` (deterministic read
 * off the settled transcript after `await session.prompt(...)` resolves).
 */
```

Both definitions feed real drive observations. `tests/live/harness.ts:721-727`:
```ts
function capturedTurn(appended: readonly unknown[], reAskCount: number): DrivenTurn {
  return {
    text: collectAssistantTexts(appended).join(""),
    userTexts: collectUserTexts(appended),
    systemNotes: collectSystemNotes(appended),
    reAskCount,
  };
```
`tests/live/hardening/probe-harness.ts:385-388`:
```ts
    const appended = sessionManager.getEntries().slice(notesBefore);
    const userTexts = collectUserTexts(appended);
    const systemNotes = collectSystemNotes(appended);
    turns.push({ invocation, userTexts, assistantText, toolCalls, systemNotes, error });
```

The existing shared-observation home, `tests/helpers/live-transcript.ts:1-5`:
```ts
// Shared observations over live drives' settled transcripts and system notes.
import { expect } from "vitest";
import type { DrivenTurn, LiveExtensionHandle } from "../live/harness";

export { collectSystemNotes } from "./recording-system-note-channel";
```

Count check: `rg -n '^(export )?(async )?function collectUserTexts' tests/helpers tests/live/harness.ts tests/live/hardening/probe-harness.ts` returned exactly two hits, the two definitions above, and no canonical helper definition. Comparing the text between each function's opening and closing braces with Python returned byte equality, without normalizing the bodies.

## Why this is a problem
This is D7 boilerplate duplication inside existing test harnesses: both independently implement the same entry predicate, string/array branching, text-part extraction, and result ordering for the same observable. The local call sites bind to separate definitions rather than a shared reader. The mirror comment acknowledges the relationship, but maintaining that read contract still requires applying the same edit twice. This claim does not question the legitimacy of asserting on deterministic `userTexts`.

## Suggested direction (non-binding, optional)
`tests/helpers/live-transcript.ts` already identifies itself as the shared home for observations over settled live transcripts. That is a natural helper home for the duplicated reader; no change to test identities or the separate drive-settlement mechanisms is implied.

## False-positive check
- **Gate-pin:** neither harness is a gate test; no pinned inventory or corpus count is being challenged.
- **Recording-double:** these are stateless transcript readers, not recording doubles. Existing negative assertions over their output remain legitimate; the finding is only about duplicated reader bodies.
- **docs/bugs/ signature search:** `rg -l 'collectUserTexts' docs/bugs docs/reference/coverage-matrix.md` returned two bug documents: `docs/bugs/0287-driveslash-whole-drive-text-accumulator-drops-a-later-turns-stream.md` and `docs/bugs/0290-exact-rendered-query-counts-red-when-bug-0289s-bounded-re-ask-fires.md`. Reading their relevant passages showed the settled-reader contract and the different drive/re-ask mechanisms, not a requirement for independently maintained copies of this identical reader. No red or disabled test is alleged.
- **Coverage-matrix/bug-doc citation:** the preceding search includes both document locations; `rg -n 'tests/live/harness.ts|probe-harness.ts' docs/reference/coverage-matrix.md` returned no matches. Bug 0287 and bug 0290 cite the harness readers, as acknowledged above. This report proposes no merge, rename, or deletion of a named test, and does not alter the witness contracts they describe.
- **History/intent:** `git log -S 'function collectUserTexts'` over the two paths identified `b542dafe` and the hardening relocation `a6a5953e`; their commit messages concern a bug fix and suite relocation. The current H8a comment explicitly describes its reader as a mirror, and the current bodies agree byte-for-byte.
- **Prior-topic check:** the quality-store search for `collectUserTexts` found references in entry-fixture reports and in the same-wave `user-turn-normalization-duplicated` report, not a filing about these two reader definitions. That same-wave finding concerns per-entry concatenation in four other test files and explicitly distinguishes this private reader, which emits separate parts. PTQ-0697 concerns user/assistant/compaction message constructors; PTQ-1025 concerns system-note readers, not these user-message readers.
- **Scope/coverage:** the two reported implementations are both under `tests/`; the shared-helper file is supporting evidence. This is about duplication in existing code, not coverage, suite composition, a missing assertion, or a runtime-risk claim.

## Triage
verdict: confirmed — Both private collectUserTexts bodies are byte-identical (531 bytes), feed live harness observations, and reproduce all cited excerpts and search counts; this is tests/-only D7 boilerplate duplication, with no independent-copy requirement in bugs 0287/0290, applicable carve-out, existing duplicate, or resolved PTQ prescribing this shape. (triage: claude-opus-5-5)
