---
id: PTQ-0680
title: The parseDeps/ctxDouble/producer/bindAndExecute prompt-mode drive harness in tests/question-operand-defect.test.ts duplicates tests/result-value-privacy.test.ts's Shared harness
lens: D7
status: open
verdict: confirmed
locations:
  - tests/question-operand-defect.test.ts:94-103
  - tests/question-operand-defect.test.ts:182-211
  - tests/result-value-privacy.test.ts:121-130
  - tests/result-value-privacy.test.ts:150-224
sites: 2
fix_scope: module
d4_class: clone
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# The parseDeps/ctxDouble/producer/bindAndExecute prompt-mode drive harness in tests/question-operand-defect.test.ts duplicates tests/result-value-privacy.test.ts's Shared harness

## Observation
`tests/question-operand-defect.test.ts` declares a "Shared harness" block (its own header comment: "The exact tests/result-value-privacy.test.ts §'Shared harness' pattern") that parses a source through `parseThetaDocument` under an inert `ParseThetaDocumentDeps`, then drives it through `createProductionProducerDeps` → `bindPromptConversation` → `executeBody`. Two of its component functions, `parseDeps` and `ctxDouble`, are byte-identical to the same-named functions in `tests/result-value-privacy.test.ts`; `rootDouble`/`producer`/`bindAndExecute` reproduce the same shape with only the `RuntimeRoot` double's extra `schemaValidator` field and the `producer` function's optional-`opts` parameter differing. Neither file imports the other's harness, and no `tests/helpers/` module exports it.

## Evidence

tests/question-operand-defect.test.ts:94-103 (`parseDeps`):
```ts
function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = {
    resolve: (): "resolved" => "resolved",
  };
  return { systemNote, modelMatcher };
}
```

tests/result-value-privacy.test.ts:121-130 (`parseDeps`) — byte-identical to the excerpt above:
```ts
function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = {
    resolve: (): "resolved" => "resolved",
  };
  return { systemNote, modelMatcher };
}
```

tests/question-operand-defect.test.ts:182-211 (`NOOP_CHECKPOINT` / `rootDouble` / `ctxDouble` / `producer`):
```ts
const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

function rootDouble(): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
  } as unknown as RuntimeRoot;
}

function ctxDouble(): ExtensionCommandContext {
  return {} as unknown as ExtensionCommandContext;
}

function producer() {
  return createProductionProducerDeps({
    // `getActiveTools`/`setActiveTools` satisfy the PIC-17 window;
    // `sendMessage` satisfies the theta-system-note channel.
    pi: {
      sendMessage: () => {},
      getActiveTools: () => [],
      setActiveTools: () => {},
    } as unknown as ExtensionAPI,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
  });
}
```

tests/result-value-privacy.test.ts:150-224 (the same `NOOP_CHECKPOINT` — byte-identical — plus `rootDouble` / `ctxDouble` / `producer`; `ctxDouble` at :186-188 is byte-identical to the excerpt above, and `producer` at :199 carries the same `pi`/`root`/`modelRegistry` shape widened by one optional `opts.parseCallee` spread and `rootDouble`'s return widened by one extra `schemaValidator: realAjvValidator()` field):
```ts
function ctxDouble(): ExtensionCommandContext {
  return {} as unknown as ExtensionCommandContext;
}

interface ProducerOpts {
  readonly parseCallee?: (
    callerPath: string | undefined,
    calleePath: string,
  ) => Promise<CalleeParseOutcome | undefined>;
}

function producer(opts: ProducerOpts = {}) {
  return createProductionProducerDeps({
    pi: {
      sendMessage: () => {},
      getActiveTools: () => [],
      setActiveTools: () => {},
    } as unknown as ExtensionAPI,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
    ...(opts.parseCallee !== undefined ? { parseCallee: opts.parseCallee } : {}),
  });
}
```

Exact search: `grep -n "^function parseDeps\|^function rootDouble\|^function ctxDouble\|^function producer\|^function bindAndExecute\|^function runSource\|^const NOOP_CHECKPOINT" tests/question-operand-defect.test.ts tests/result-value-privacy.test.ts` returns exactly one match per name per file (both files carry this whole six/seven-function harness set once each); no third file in the review's scope declares any of these names.

## Why this is a problem
`tests/question-operand-defect.test.ts`'s own header comment names `tests/result-value-privacy.test.ts` as the source of this exact harness pattern ("mirrors the … §'Shared harness' pattern"), and two of the six shared functions (`parseDeps`, `ctxDouble`) are copied byte-for-byte while the rest (`NOOP_CHECKPOINT`, `rootDouble`, `producer`, `bindAndExecute`) reproduce the same construction with only a small per-file delta. `tests/helpers/` holds no module exporting this "parse a prompt-mode source, bind it through the production producer, execute the body" sequence, so each of the two files that need it re-derives its own copy rather than importing one.

## Suggested direction (non-binding, optional)
A `tests/helpers/` module exporting the common core (`parseDeps`, `NOOP_CHECKPOINT`, `ctxDouble`, and a `rootDouble`/`producer` parameterised by the per-file extras such as `schemaValidator` or `parseCallee`) is the home the existing `fake-*.ts` / harness-module convention under `tests/helpers/` already points at; the fix stage owns the actual extraction.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or any named gate kin; not applicable.
- Recording-double check: none of the cited functions is a recording double backing a MUST-NOT-called assertion; `rootDouble`/`ctxDouble`/`NOOP_CHECKPOINT` are inert stand-ins with no call log, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rln "question-operand-defect\|result-value-privacy" docs/bugs/*.md` → `docs/bugs/0019-question-operand-bypasses-result-normalisation.md` cites `tests/question-operand-defect.test.ts` as its own witness file and `docs/bugs/0017-...md`-style reports are referenced by `result-value-privacy.test.ts`'s header, but neither document states a rationale for keeping the harness un-shared; this finding proposes no change to either file's test bodies or names.
- coverage-matrix/bug-doc citation search: `grep -n "question-operand-defect\|result-value-privacy" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any `it()`/`describe()`, only that the harness functions could be imported from one place.
- Prior-filing search: `grep -rl "result-value-privacy" quality/intake quality/resolved` → 0 hits before this filing.
- Coverage-drift check: the claim is about a repeated harness-function set that exists in both files today, not about any untested behaviour path.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: parseDeps (94-103 vs 121-130), NOOP_CHECKPOINT (182-186 vs 150-154), ctxDouble (195-197 vs 186-188) and bindAndExecute (226-234 vs 215-223) diff byte-identical between the two files, rootDouble/producer differ only by the stated schemaValidator field and ProducerOpts.parseCallee spread, the seven-name grep yields exactly one hit per name per file, neither file imports anything from tests/helpers/, docs/bugs/0017 and 0019 are both fixed with the files green (35/35) so no documented-red carve-out applies, coverage-matrix.md has 0 hits, and no tracked PTQ cites either file (PTQ-0209/0214/0314/0386/0397 are the same per-file-pair convention on other files; the same-wave d7-96-02 sibling cites tests/live/hardening/question-operand-defect-abort.test.ts, a different file); one evidentiary claim is false and should be corrected at ticketing — tests/helpers/e2e-s1.ts:38 already exports an equivalent parseDeps and tests/helpers/tool-call-dispatch-harness.ts:81-136 exports NOOP_CHECKPOINT/rootDouble(AJV-backed)/ctxDouble/producer (its producer uses `pi: {}` and different opts, so it does not yet cover the PIC-17 pi stub or parseCallee), which as in PTQ-0209 strengthens rather than defeats the consolidation case (triage: claude-fable-5-1)
