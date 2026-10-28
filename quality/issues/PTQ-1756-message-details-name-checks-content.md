---
id: PTQ-1756
title: The absent-entry-channel normalization test names diagnostic file fields but asserts message content.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/execution-status-entry-migration-witnesses.test.ts:360-367
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# The absent-entry-channel normalization test names diagnostic file fields but asserts message content.

## Observation
The absent-entry-channel test names `details.diagnostics[].file` as its observable and says those fields are all-POSIX. Its body asserts one sent message and the absence of a backslash in that message's `content`. It never reads `details` or a diagnostic's `file` field.

## Evidence
`tests/execution-status-entry-migration-witnesses.test.ts:360-367`:

```typescript
  it("absent entry channel: message realization's details.diagnostics[].file are the same all-POSIX fields", () => {
    const { deps, sentMessages } = recordingSystemNoteDeps(undefined);

    emitDiagnosticBatch(mixedSpellingDiagnosticBatch(), deps);

    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0]!.content).not.toContain("\\");
  });
```

## Why this is a problem
This is the D7 misleading-test-name class: a reader selecting this test by name would understand its result to verify the structured diagnostic file fields. Mechanically, the assertions depend only on the message count and `content`; changing only `details.diagnostics[].file` cannot change either assertion. The body verifies rendered text, not the structured fields named by the test. This is not a claim that the suite lacks a structured-field witness.

## False-positive check
- Gate-pin: this is an individual message-normalization test in a file whose name is not a gate; its count assertion is not challenged.
- Recording-double: `sentMessages` is a delivery recorder. Neither the recorder nor any MUST-NOT witness is challenged; the finding concerns only the test name's stated observable.
- docs/bugs/ signature search: `rg -n 'execution-status-entry-migration-witnesses|B45-normalization|absent entry channel: message realization' docs/bugs docs/reference/coverage-matrix.md` returned no matches. The referenced bug 0268 and bug 0469 documents were checked; this is not a documented intentional red or a missing-prerequisite skip.
- Coverage-matrix/bug-doc citation: the same search found no citation of this file or this test name. No cited test is proposed for merging, renaming, or deletion by this report.
- Existing-topic check: `rg -n 'B45-normalization|message realization.s details|message realization.*all-POSIX|absent entry channel: message realization' quality docs/bugs docs/reference/coverage-matrix.md` returned no matches before filing. PTQ-1499 concerns the recording-channel double's construction, not this name/body mismatch.
- Coverage boundary: this report judges an existing test's name against its existing assertions; it does not request another test, a new execution path, or a production behavior change.

## Triage
verdict: confirmed — the excerpt matches tests/execution-status-entry-migration-witnesses.test.ts:360-367 exactly: the title claims POSIX details.diagnostics[].file fields, but the body checks only message count and content, so changing the structured file fields alone cannot fail this test; the adjacent structured-field witnesses do not cure this individual D7 misleading name; documentation searches find no pinned citation, no carve-out applies, and resolved PTQ-1499 prescribes recorder reuse rather than this name/assertion mismatch, with no duplicate found (triage: claude-opus-5-5)
