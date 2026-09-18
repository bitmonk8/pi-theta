---
id: PTQ-0537
title: b0397, b0398 and b0399 each hand-roll the CapturedNote/parseDeps/rootDouble/producerWithCapture/noteChannelEntries bundle already mirrored from tests/e2e-s5-binder-echo-emission.test.ts and tests/b0383-slsh4-note-details-event.test.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0397-binder-failure-note-runtime-event.test.ts:115-196
  - tests/b0397-binder-failure-note-runtime-event.test.ts:371-373
  - tests/b0398-custom-type-unsafe-note-details-diagnostics.test.ts:91-96
  - tests/b0398-custom-type-unsafe-note-details-diagnostics.test.ts:121-197
  - tests/b0398-custom-type-unsafe-note-details-diagnostics.test.ts:262-264
  - tests/b0399-boundary-event-attempts-tokens-masked.test.ts:124-171
sites: 3
fix_scope: cross-module       # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0397, b0398 and b0399 each hand-roll the CapturedNote/parseDeps/rootDouble/producerWithCapture/noteChannelEntries bundle already mirrored from tests/e2e-s5-binder-echo-emission.test.ts and tests/b0383-slsh4-note-details-event.test.ts

## Observation
tests/b0397-binder-failure-note-runtime-event.test.ts, tests/b0398-custom-type-unsafe-note-details-diagnostics.test.ts and tests/b0399-boundary-event-attempts-tokens-masked.test.ts each declare, module-scope, the same `CapturedNote` interface, `parseDeps`/`parse` pair (b0397/b0398), a `rootDouble()` shaped for the production `RuntimeRoot`, a `producerWithCapture()` (b0398/b0399) building `createProductionProducerDeps` with a capturing `pi.sendMessage`, and a `noteChannelEntries`/`channelNotes` filter over the `theta-system-note` channel. Each file's own header comment names the file it copied the shape from rather than a shared helper: b0397 labels its block "the e2e-s5 / bug-0066 production pattern," b0398 says its `rootDouble` "members mirror e2e-s5's rootDouble," and b0399 says its `rootDouble` "mirrors the b0383 rig." No `tests/helpers/*` module exports any of `CapturedNote`, `producerWithCapture`, or `noteChannelEntries`.

## Evidence

tests/b0397-binder-failure-note-runtime-event.test.ts:115-120 (`CapturedNote`) and :371-373 (`channelNotes`):
```ts
interface CapturedNote {
  readonly customType: string;
  readonly content: string;
  readonly display?: boolean;
  readonly details?: { readonly event?: Record<string, unknown> };
}
```
```ts
function channelNotes(notes: readonly CapturedNote[]): CapturedNote[] {
  return notes.filter((n) => n.customType === SYSTEM_NOTE_CHANNEL);
}
```
tests/b0397-binder-failure-note-runtime-event.test.ts:137-148 (own comment naming the copied-from pattern, and the identical `parseDeps`):
```ts
// --- parse + root scaffolding (the e2e-s5 / bug-0066 production pattern) -----

function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}
```

tests/b0398-custom-type-unsafe-note-details-diagnostics.test.ts:91-96 (`CapturedNote`, identical to b0399's below) and :121-129 (`parseDeps`, byte-identical to b0397's above):
```ts
interface CapturedNote {
  readonly customType: string;
  readonly content: string;
  readonly display?: boolean;
  readonly details?: unknown;
}
```
```ts
function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}
```

tests/b0398-custom-type-unsafe-note-details-diagnostics.test.ts:181-197 (`producerWithCapture`) is structurally identical to tests/b0399-boundary-event-attempts-tokens-masked.test.ts:152-167 apart from the `modelRegistry.getAvailable()` payload:
```ts
function producerWithCapture(): {
  readonly deps: ReturnType<typeof createProductionProducerDeps>;
  readonly notes: CapturedNote[];
} {
  const notes: CapturedNote[] = [];
  const pi = {
    sendMessage: (message: CapturedNote): void => {
      notes.push(message);
    },
  } as unknown as ExtensionAPI;
  const modelRegistry = {
    getAvailable: (): readonly unknown[] => [BINDER_MODEL],
    getApiKeyAndHeaders: async (): Promise<{ ok: boolean }> => ({ ok: true }),
  } as unknown as ModelRegistry;
  const deps = createProductionProducerDeps({ pi, root: rootDouble(), modelRegistry });
  return { deps, notes };
}
```

tests/b0399-boundary-event-attempts-tokens-masked.test.ts:124-129 (`CapturedNote`, byte-identical to b0398's above) and :152-167 (`producerWithCapture`) and :169-171 (`noteChannelEntries`):
```ts
interface CapturedNote {
  readonly customType: string;
  readonly content: string;
  readonly display?: boolean;
  readonly details?: unknown;
}
```
```ts
function producerWithCapture(): {
  readonly deps: ReturnType<typeof createProductionProducerDeps>;
  readonly notes: CapturedNote[];
} {
  const notes: CapturedNote[] = [];
  const pi = {
    sendMessage: (message: CapturedNote): void => {
      notes.push(message);
    },
  } as unknown as ExtensionAPI;
  const modelRegistry = {
    getAvailable: (): readonly unknown[] => [],
  } as unknown as ModelRegistry;
  const deps = createProductionProducerDeps({ pi, root: rootDouble(), modelRegistry });
  return { deps, notes };
}
```
```ts
function noteChannelEntries(notes: readonly CapturedNote[]): CapturedNote[] {
  return notes.filter((n) => n.customType === SYSTEM_NOTE_CHANNEL);
}
```

Pattern-wide search: `grep -n "interface CapturedNote\|function noteChannelEntries\|function producerWithCapture\|function parseDeps" tests/b0383-slsh4-note-details-event.test.ts tests/e2e-s5-binder-echo-emission.test.ts` confirms both external files declare the same `CapturedNote`/`producerWithCapture`/`noteChannelEntries` trio (e2e-s5 additionally declares its own `parseDeps`, byte-identical to b0397's/b0398's above), so the same bundle recurs in 5 files total (e2e-s5, b0383, b0397, b0398, b0399); this finding is scoped to the three files inside this wave's reviewed set (b0397, b0398, b0399), with e2e-s5 and b0383 named only as the pattern's origin and size, not as a claim against them.

## Why this is a problem
Three files in this wave's scope each redeclare the identical `CapturedNote` shape, the identical `parseDeps` scaffolding, and a `producerWithCapture`/`noteChannelEntries` pair that differ from each other only in a hardcoded model list, and each file's own header comment names a *different sibling test file* as the thing it mirrored (b0397 → "e2e-s5 / bug-0066," b0398 → "e2e-s5's rootDouble," b0399 → "the b0383 rig") rather than a shared module — the copy source keeps shifting file-to-file rather than converging on one definition, which is the shape a `tests/helpers/` extraction (as already happened for the belt-probe family in `runtime-belt-probe-harness.ts`) exists to end.

## Suggested direction (non-binding, optional)
The `CapturedNote` interface, `noteChannelEntries` filter, and a `producerWithCapture`-shaped factory parameterised by the model-registry payload and the `RuntimeRoot` double are the parts identical or near-identical across all five files; a `tests/helpers/` module analogous to `runtime-belt-probe-harness.ts` is the natural home other production-note-capture tests already gesture at by name.

## False-positive check
- Gate-pin: none of the three files matches `*gate*.test.ts` or the named kin; the cited functions are harness plumbing, not a pinned count or inventory assertion.
- Recording-double: `producerWithCapture`'s `notes` sink and `noteChannelEntries`/`channelNotes` are used as positive read-back mechanisms (the tests inspect what WAS captured), not a "never called" negative witness; the negative-witness carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0397-binder-failure-notes-empty-event-payload.md, docs/bugs/0398-custom-type-unsafe-diagnostic-never-materialised.md, docs/bugs/0399-boundary-event-omits-attempts-tokens-masked.md all exist and describe settled fix contracts these tests pin; none is a documented correct-reason red, and this finding does not touch the RED/CONTROL assertion rows, only the harness declarations around them.
- coverage-matrix/bug-doc citation search: `grep -n "b0397-binder-failure-note-runtime-event\|b0398-custom-type-unsafe-note-details-diagnostics\|b0399-boundary-event-attempts-tokens-masked" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any file or `it()`/`describe()` — only that the local harness pieces could be imported from a shared module — so no citation is affected.
- Coverage check: the claim is about a repeated harness DEFINITION, not a missing test path; every piece cited is exercised by the tests in its own file.

## Triage
verdict: confirmed — independently re-verified: parseDeps is byte-identical b0397:139-147 vs b0398:121-129 (diff exit 0) and value-equivalent to the already-exported tests/helpers/e2e-s1.ts:38 parseDeps that none of the three files imports (no `./helpers` import in any of them — the same class confirmed in PTQ-0214/0314/0386 for other files); CapturedNote is byte-identical b0398:91-96 vs b0399:124-129 (b0397's narrows `details` only); producerWithCapture b0398:181-197 vs b0399:152-167 differs solely in the modelRegistry literal (getAvailable payload + one extra getApiKeyAndHeaders member); channelNotes/noteChannelEntries bodies are identical at b0397:371-373, b0398:262-264, b0399:169-171; the e2e-s5/b0383 origin grep reproduces (5-file recurrence) and the copied-from comments are real; the one helper exporting a `CapturedNote` (package-merge-e2e-harness.ts:43) is a different code/message/severity row shape, so the "no shared helper" anchor stands; all three docs/bugs are Status fixed, 16/16 green at HEAD, 0 coverage-matrix hits, no merge/rename/delete proposed so the bug-doc witness citations are undisturbed; no existing PTQ covers these three files (PTQ-0209/0384/0397 are other harness families) — in-scope D7 boilerplate/copy-paste-fixture duplication confined to tests/ (triage: claude-fable-5-1)
