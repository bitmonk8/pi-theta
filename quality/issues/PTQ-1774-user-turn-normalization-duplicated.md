---
id: PTQ-1774
title: Four live regression files repeat user-turn transcript normalization at five sites.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/live/b0501-prior-history-edit-live.test.ts:56-60
  - tests/live/b0502-pre-prompt-compaction-live.test.ts:54-58
  - tests/live/b0503-foreign-turn-live.test.ts:26-30
  - tests/live/b0503-foreign-turn-live.test.ts:67-70
  - tests/live/b0503-typed-interleaving-live.test.ts:41-45
  - tests/live/b0503-typed-interleaving-live.test.ts:86-90
  - tests/helpers/live-transcript.ts:1-5
sites: 5
fix_scope: cross-module
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# Four live regression files repeat user-turn transcript normalization at five sites.

## Observation
Five sites across four live test files implement the same settled-transcript normalization: select user message entries, preserve string content, otherwise filter text parts and concatenate them with an empty separator. Four sites inline that operation inside `flatMap`; the foreign-turn test defines a local `userText` function and wraps its result with the entry index. The index wrapper is specific to that test, but the user-entry predicate and content normalization are repeated. `tests/helpers/live-transcript.ts` already houses shared observations over settled live transcripts.

## Evidence
Occurrence 1 — `tests/live/b0501-prior-history-edit-live.test.ts:56-60`:
```ts
        const users = entries.flatMap((entry) => {
          if (entry.type !== "message" || entry.message.role !== "user") return [];
          const content = entry.message.content;
          return [typeof content === "string" ? content : content.filter((part) => part.type === "text").map((part) => part.text).join("")];
        });
```

Occurrence 2 — `tests/live/b0502-pre-prompt-compaction-live.test.ts:54-58`:
```ts
          const users = entries.flatMap((e) => {
            if (e.type !== "message" || e.message.role !== "user") return [];
            const c = e.message.content;
            return [typeof c === "string" ? c : c.filter((p) => p.type === "text").map((p) => p.text).join("")];
          });
```

Occurrence 3 — `tests/live/b0503-foreign-turn-live.test.ts:26-30`:
```ts
function userText(entry: SessionEntry): string | undefined {
  if (entry.type !== "message" || entry.message.role !== "user") return undefined;
  const content = entry.message.content;
  return typeof content === "string" ? content : content.filter((p) => p.type === "text").map((p) => p.text).join("");
}
```

Its index-preserving caller — `tests/live/b0503-foreign-turn-live.test.ts:67-70` (context for occurrence 3, not a sixth normalization):
```ts
      const users = entries.flatMap((entry, index) => {
        const text = userText(entry);
        return text === undefined ? [] : [{ index, text }];
      });
```

Occurrence 4 — `tests/live/b0503-typed-interleaving-live.test.ts:41-45`:
```ts
        const users = entries.flatMap((entry) => {
          if (entry.type !== "message" || entry.message.role !== "user") return [];
          const content = entry.message.content;
          return [typeof content === "string" ? content : content.filter((part) => part.type === "text").map((part) => part.text).join("")];
        });
```

Occurrence 5 — `tests/live/b0503-typed-interleaving-live.test.ts:86-90`:
```ts
        const users = entries.flatMap((entry) => {
          if (entry.type !== "message" || entry.message.role !== "user") return [];
          const content = entry.message.content;
          return [typeof content === "string" ? content : content.filter((part) => part.type === "text").map((part) => part.text).join("")];
        });
```

Existing shared-observation home — `tests/helpers/live-transcript.ts:1-5` (context, not a counted copy):
```ts
// Shared observations over live drives' settled transcripts and system notes.
import { expect } from "vitest";
import type { DrivenTurn, LiveExtensionHandle } from "../live/harness";

export { collectSystemNotes } from "./recording-system-note-channel";
```

Occurrences 1, 4 and 5 are identical apart from indentation. Occurrence 2 renames the callback/content/part variables. Occurrence 3 keeps the same predicate and normalization but returns a scalar or `undefined` for its index-preserving caller. All five counted sites are enumerated above; this is not a repository-wide occurrence count.

## Why this is a problem
This is D7 boilerplate duplication in the test observation harness. The five implementations independently spell out the same entry selection, string-versus-array handling, text-part filtering and joining rule. Maintaining that observation rule currently requires editing five definitions across four files, even though the differences between the regression scenarios do not change those operations. The finding concerns existing repeated test code, not whether another behavior needs a test or whether any live assertion currently reports the wrong result.

## False-positive check
- **Gate-pin check:** the four files are live regression witnesses, not census/pin gates. The cited expressions normalize transcripts; none pins an inventory count.
- **Recording-double check:** the cited code reads persisted session entries. It is not a recording double or a MUST-NOT call witness; no absence assertion is challenged.
- **docs/bugs/ signature search:** searched the bug 0501, 0502 and 0503 reports for transcript, fixture, interleaving and live-control evidence, and read their fix/resolution and live-verification passages. Bug 0501 records the projection-drift witness, bug 0502 explicitly retains the minimum-host compatibility control, and bug 0503 records the untyped and typed live witnesses. This finding does not characterize their recorded reds as skips or challenge their approved observables.
- **Coverage-matrix/bug-doc citation search:** searched `docs/reference/coverage-matrix.md` and `docs/bugs/` for all four file basenames and the relevant test-name phrases. The matrix had no matches; bug 0501 cites its live file at line 212, bug 0502 cites its compatibility control at line 20, and bug 0503 cites its live files in the verification table at lines 255 and 260. Those citations are acknowledged: no merger, rename or deletion of any test is proposed.
- **Helper/semantic check:** inspected `tests/helpers/live-transcript.ts`, searched `tests/helpers/` for user-text collectors, and read `tests/live/harness.ts`'s private `collectUserTexts`. The private collector emits individual text parts rather than concatenating them per entry, so this report does not claim it is an interchangeable canonical helper. The existing shared-observation module is named only as the natural helper home; the five counted copies agree on per-entry concatenation.
- **History/duplicate check:** inspected the file history and the normalizers in commits `8b26ca9c`, `22d1e095` and `62260736`; the same normalization is present in those introductions. Searched existing intake/issues/resolved reports for these live file basenames and user-turn normalization duplication. Also read PTQ-0697: that report concerns user/assistant/compactionSummary message builders in two offline tests, not these transcript readers.
- **Scope check:** all five occurrences are existing code under `tests/live/`. This filing requests neither additional coverage nor a suite-composition or runtime-behavior change, and makes no claim about stochastic assistant-output assertions.

## Triage
verdict: confirmed — All five normalizers reproduce at the cited lines and duplicate the same user-entry selection and per-entry text concatenation across four live test files; the foreign-turn index wrapper does not change that shared logic. This is D7 boilerplate duplication, distinct from the private part-emitting readers and PTQ-0697's message builders; no duplicate or resolved prescription for this shape was found, and the documented witness identities and observables need not change. (triage: claude-opus-5-5)
