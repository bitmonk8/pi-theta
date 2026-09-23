---
id: PTQ-1369
title: production-cancellation-wiring.test.ts reimplements the recordingPi/RecordedMessage double as local sentNotes()/SentNote
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/production-cancellation-wiring.test.ts:68-80
  - tests/helpers/fixture-dispatch-harness.ts:40-45
  - tests/helpers/fixture-dispatch-harness.ts:221-227
sites: 1
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# production-cancellation-wiring.test.ts reimplements the recordingPi/RecordedMessage double as local sentNotes()/SentNote

## Observation
tests/production-cancellation-wiring.test.ts declares a local `SentNote` interface and a local `sentNotes()` factory that builds an `ExtensionAPI` double whose `sendMessage` pushes each call onto an array — used at four call sites in the file (lines 93, 121, 189, 241). tests/helpers/fixture-dispatch-harness.ts already exports the identical double under the names `RecordedMessage` and `recordingPi(log)`, and this same test file already imports a different export (`rootWith`) from that exact module.

## Evidence

tests/production-cancellation-wiring.test.ts:68-80:
```ts
interface SentNote {
  readonly customType: string;
  readonly content: string;
}

function sentNotes(): { readonly notes: SentNote[]; readonly pi: ExtensionAPI } {
  const notes: SentNote[] = [];
  const pi = {
    sendMessage: (message: { customType: string; content: string }): void => {
      notes.push({ customType: message.customType, content: message.content });
    },
  } as unknown as ExtensionAPI;
  return { notes, pi };
}
```

tests/helpers/fixture-dispatch-harness.ts:40-45 and 221-227 (the canonical equivalent):
```ts
export interface RecordedMessage {
  readonly customType?: string;
  readonly content?: string;
  readonly display?: boolean;
  readonly details?: Record<string, unknown>;
}
```
```ts
export function recordingPi(log: RecordedMessage[]): ExtensionAPI {
  return {
    sendMessage: (message: RecordedMessage): void => {
      log.push(message);
    },
  } as unknown as ExtensionAPI;
}
```

tests/production-cancellation-wiring.test.ts:51 already imports from the same module:
```ts
import { rootWith } from "./helpers/fixture-dispatch-harness";
```

Call sites of the local double: `grep -n "sentNotes()" tests/production-cancellation-wiring.test.ts` → lines 93, 121, 189, 241 (4 hits).

## Why this is a problem
Both doubles do the same one thing — an `ExtensionAPI` stub whose `sendMessage` appends into an array the test later reads — and both are used for the identical purpose (asserting on `customType`/`content` of a sent system note) in the same wave of production-wiring tests. The local `sentNotes()` is a narrower re-typing of `recordingPi`/`RecordedMessage` (it drops the `display`/`details` fields the canonical double already carries), reproduced by hand in a file that already imports a sibling export from the very module the canonical double lives in.

## Suggested direction (non-binding, optional)
tests/helpers/fixture-dispatch-harness.ts is the observed home already used for this recording-pi double elsewhere in the tree.

## False-positive check
- Gate-pin check: filename does not match `*gate*` or named gate patterns; not applicable.
- Recording-double check: this IS a recording double, but the finding is not that it witnesses a MUST-NOT-be-called assertion — it is filed as a copy-paste-fixture duplication (a canonical equivalent double already exists and is already imported from in this file), which is a distinct D7 class from the negative-witness carve-out.
- docs/bugs/ signature search: `grep -rln "production-cancellation-wiring" docs/bugs/` returned no hits.
- coverage-matrix.md citation search: `grep -rn "production-cancellation-wiring" docs/reference/coverage-matrix.md` returned no hits.
- This finding does not propose removing any test or assertion, only points at fixture duplication; no coverage claim is made.

## Triage
verdict: confirmed — excerpts reproduce at the cited lines (sentNotes()/SentNote at tests/production-cancellation-wiring.test.ts:68-80; RecordedMessage at fixture-dispatch-harness.ts:40-45, recordingPi at 221-227; rootWith import at line 51; 4 call sites at 93/121/189/241) and the local double is a strict narrowing of the exported one whose sole reader (`notes.map((n) => n.content)` at line 225, toContain) type-checks unchanged against RecordedMessage, so the copy-paste-fixture class holds and the fix is a mechanical import swap; no existing PTQ tracks sentNotes (PTQ-0670 is the same file's AST-builder duplication, a distinct root cause); one correction to the filing's FP-check — docs/bugs/0012:470 and 0319:219,321 DO cite this test file, but the finding proposes no test merge/rename/delete so the witness-list carve-out is not engaged; no gate pattern, no negative-witness claim (triage: claude-fable-5-1)
