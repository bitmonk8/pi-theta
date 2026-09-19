---
id: PTQ-0795
title: capturedCall/optionsOf complete()-capture accessors are byte-identical between b0481 and binder-forced-tool-dispatch
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0481-forced-tool-choice-model-rejection-degrades.test.ts:244-256
  - tests/binder-forced-tool-dispatch.test.ts:402-418
sites: 2
fix_scope: cross-module       # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# capturedCall/optionsOf complete()-capture accessors are byte-identical between b0481 and binder-forced-tool-dispatch

## Observation
Both `tests/b0481-forced-tool-choice-model-rejection-degrades.test.ts` and
`tests/binder-forced-tool-dispatch.test.ts` mock the off-session `complete()`
free function and push every `{ model, context, options }` triple onto a
`scripted.calls` array. Each file then declares its own module-scope
`capturedCall(index)` accessor (an identical index-bounds-checked lookup with
an identical thrown-Error message) and its own `optionsOf(index)` accessor
(an identical one-line cast of `capturedCall(index).options`). The two
functions are byte-for-byte identical in both files.

## Evidence
`tests/b0481-forced-tool-choice-model-rejection-degrades.test.ts:244-256`:
```ts
function capturedCall(index: number): { model: unknown; context: unknown; options: unknown } {
  const call = scripted.calls[index];
  if (call === undefined) {
    throw new Error(
      `no complete() call captured at index ${index} (captured: ${scripted.calls.length})`,
    );
  }
  return call;
}

function optionsOf(index: number): Record<string, unknown> {
  return capturedCall(index).options as Record<string, unknown>;
}
```

`tests/binder-forced-tool-dispatch.test.ts:402-418` — same bodies, same thrown
message, same cast:
```ts
function capturedCall(index: number): { model: unknown; context: unknown; options: unknown } {
  const call = scripted.calls[index];
  if (call === undefined) {
    throw new Error(
      `no complete() call captured at index ${index} (captured: ${scripted.calls.length})`,
    );
  }
  return call;
}

function contextOf(index: number): CapturedContextView {
  return capturedCall(index).context as CapturedContextView;
}

function optionsOf(index: number): Record<string, unknown> {
  return capturedCall(index).options as Record<string, unknown>;
}
```

Search: `grep -n "function capturedCall" tests/*.test.ts` → exactly these two
files (2 hits); `grep -n "function capturedCall\|function optionsOf" tests/helpers/*.ts` →
0 hits, confirming no `tests/helpers/` module exports either accessor today.

## Why this is a problem
The `capturedCall`/`optionsOf` pair — an index-bounds check, a specific thrown
message naming the captured-call count, and a same-shaped options cast — is
authored twice rather than imported once. Both files build the identical
`scripted.calls: Array<{ model; context; options }>` shape the accessors read
from (both mock the same `@earendil-works/pi-ai/compat` `complete()` seam and
push the same three-field record on every call), so the two copies are reading
an identical wire shape and could share one accessor pair.

## Suggested direction (non-binding, optional)
A shared `tests/helpers/` module parameterised over a `{ calls: Array<{model,
context, options}> }` holder could export `capturedCall`/`optionsOf` (and
`contextOf`, present only in the second file) once, alongside the existing
convention of other captured-call helpers in this same binder-dispatch
lineage (`tests/helpers/scripted-live-session-harness.ts`).

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin; `capturedCall`/`optionsOf` are plain accessor helpers, not pinned
  counts or inventories.
- Recording-double check: `capturedCall`/`optionsOf` read back a POSITIVE
  capture (what a specific call's options WERE) rather than proving something
  was never called; the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "capturedCall\|optionsOf" docs/bugs/`
  → 0 hits; no documented correct-reason red cites this accessor pair.
- coverage-matrix/bug-doc citation search: `grep -n "b0481\|binder-forced-tool-dispatch" docs/reference/coverage-matrix.md`
  → 0 hits. This finding proposes no merge, rename, or deletion of any test.
- Coverage check: the claim is about a repeated accessor DEFINITION; both
  files' own tests already exercise their own copy — not a coverage-gap
  claim.
- Prior-finding check: `quality/issues/PTQ-0628-binder-forced-tool-dispatch-harness-duplicated.md`
  (open) already tracks a different sextet (`CapturedNote`/`parseDeps`/`parse`/
  `ctxDouble`/`noteChannelEntries`/`TWO_PARAM_THETA`) shared between
  `binder-forced-tool-dispatch.test.ts` and `e2e-s5-binder-echo-emission.test.ts`;
  its location list does not cite `capturedCall`/`optionsOf` or
  `b0481-forced-tool-choice-model-rejection-degrades.test.ts`, so this is a
  distinct pairing and a distinct piece of the harness, not a re-file.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified D7 copy-paste double: `capturedCall`/`optionsOf` sed-extracted from tests/b0481-forced-tool-choice-model-rejection-degrades.test.ts:244-256 and tests/binder-forced-tool-dispatch.test.ts:402-410+416-418 diff to zero bytes; both read the same `vi.hoisted` holder shape (`calls: [] as Array<{ model; context; options }>` at :63 / :112, pushed by each file's `vi.mock("@earendil-works/pi-ai/compat")` `complete` stub); both copies are live (24 and 18 accessor call sites); `grep -rn "function capturedCall\|function optionsOf" tests/` → exactly these two files and 0 hits under tests/helpers/; docs/bugs and coverage-matrix greps → 0 hits, neither file is a gate, and the accessors are positive-capture readers so no carve-out applies; not a re-file — PTQ-0736 tracks the eight-file `queue`-based scaffold/assistantReply/contextToolsOf inventory (these two files use a distinct `replyFor` holder and are absent from its list), PTQ-0628 tracks the parseDeps/ctxDouble/CapturedNote sextet, and sibling intake d7-02 tracks CapturedNote/producerWithCapture; no existing PTQ names either accessor (triage: claude-fable-5-1)
