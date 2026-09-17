---
id: PTQ-0535
title: b0381's AJV-backed rootDouble/producerWithCapture/parseDeps/BINDER_MODEL/ctxDouble quintet is byte-identical to tests/e2e-s5-binder-echo-emission.test.ts and tests/echo-value-rule1-sanitisation.test.ts
lens: D7
status: open
verdict: confirmed
locations:
  - tests/b0381-echo-object-first-field-declaration-order.test.ts:124-189
  - tests/e2e-s5-binder-echo-emission.test.ts:102-176
  - tests/echo-value-rule1-sanitisation.test.ts:475-529
sites: 3
fix_scope: cross-module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0381's AJV-backed rootDouble/producerWithCapture/parseDeps/BINDER_MODEL/ctxDouble quintet is byte-identical to tests/e2e-s5-binder-echo-emission.test.ts and tests/echo-value-rule1-sanitisation.test.ts

## Observation
tests/b0381-echo-object-first-field-declaration-order.test.ts declares five
module-scope pieces for driving `ProductionThetaProducer.runBinder()` through
a real `AjvSchemaValidator`: `parseDeps`, `rootDouble`, `const BINDER_MODEL`,
`producerWithCapture`, and `ctxDouble`. Its own header comment states the file
"drives the production `ProductionThetaProducer.runBinder()` through the
e2e-s5 rig". Byte-comparison (via `md5sum` over the sed-extracted function/
const bodies) confirms `rootDouble`, `producerWithCapture`, and `BINDER_MODEL`
are identical across three files: b0381, tests/e2e-s5-binder-echo-emission.test.ts
(the file b0381's own comment names as the rig's origin), and
tests/echo-value-rule1-sanitisation.test.ts. `parseDeps` and `ctxDouble` are
also byte-identical between the three. None of the three imports this
five-piece rig from `tests/helpers/`.

## Evidence
tests/b0381-echo-object-first-field-declaration-order.test.ts:124-189:
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
...
function rootDouble(): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    clock: { wallNow: (): number => 0 },
    schemaValidator: new AjvSchemaValidator({
      emit: (): void => {},
      slugOf: (schema: LoweredSchema): SchemaSlug => {
        const canonicalBytes = JSON.stringify(schema);
        return { slug: canonicalBytes, canonicalBytes };
      },
    }),
  } as unknown as RuntimeRoot;
}

const BINDER_MODEL = {
  id: "binder-model",
  provider: "anthropic-messages",
  api: "anthropic-messages",
  strictCapable: true,
};

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

function ctxDouble(): ExtensionCommandContext {
  return {} as unknown as ExtensionCommandContext;
}
```

tests/e2e-s5-binder-echo-emission.test.ts:130-176 (`rootDouble`,
`BINDER_MODEL`, `producerWithCapture` — byte-identical to the excerpt above):
```ts
function rootDouble(): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    clock: { wallNow: (): number => 0 },
    schemaValidator: new AjvSchemaValidator({
      emit: (): void => {},
      slugOf: (schema: LoweredSchema): SchemaSlug => {
        const canonicalBytes = JSON.stringify(schema);
        return { slug: canonicalBytes, canonicalBytes };
      },
    }),
  } as unknown as RuntimeRoot;
}

const BINDER_MODEL = {
  id: "binder-model",
  provider: "anthropic-messages",
  api: "anthropic-messages",
  strictCapable: true,
};

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

tests/echo-value-rule1-sanitisation.test.ts:490-524 (same trio, byte-identical
again):
```ts
function rootDouble(): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    clock: { wallNow: (): number => 0 },
    schemaValidator: new AjvSchemaValidator({
      emit: (): void => {},
      slugOf: (schema: LoweredSchema): SchemaSlug => {
        const canonicalBytes = JSON.stringify(schema);
        return { slug: canonicalBytes, canonicalBytes };
      },
    }),
  } as unknown as RuntimeRoot;
}

const BINDER_MODEL = {
  id: "binder-model",
  provider: "anthropic-messages",
  api: "anthropic-messages",
  strictCapable: true,
};

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

Verification performed during this review: `md5sum` over the sed-extracted
`rootDouble` bodies (`^function rootDouble`..closing `}`) for every file
declaring both `^function rootDouble` and `^function producerWithCapture`
(7 files: b0381, tests/b0398-custom-type-unsafe-note-details-diagnostics.test.ts,
tests/b0401-informational-notes-omit-details.test.ts,
tests/b0478-augmented-agentmessage-variants-excluded-before-walk.test.ts,
tests/e2e-s5-binder-echo-emission.test.ts,
tests/echo-array-per-element-descriptor.test.ts,
tests/echo-value-rule1-sanitisation.test.ts) shows one identical-hash cluster
of exactly three (b0381, e2e-s5-binder-echo-emission, echo-value-rule1-
sanitisation — cited here) and a second, disjoint identical-hash cluster of
two (b0398 and b0478, which add an extra `tokenEstimator` field neither b0381
nor its two exact matches carry).

## Why this is a problem
This is the "Boilerplate duplication" class: a five-piece producer-driving
rig — the AJV-backed `RuntimeRoot` double, the fixed `BINDER_MODEL` fixture,
the note-capturing producer wrapper, the parse-deps builder, and the inert
command-context double — is redeclared as one unit rather than imported, and
b0381's own header comment names the file ("the e2e-s5 rig") it mirrors. The
hash-identical match across three files (not just two) shows this is the same
code retyped a third time rather than a one-off local copy. `tests/helpers/`
holds no module exporting this rig; the closest existing helpers
(`fake-clock.ts`, `fake-file-system.ts`, etc.) answer different questions.

## Suggested direction (non-binding, optional)
A shared `tests/helpers/` module exporting this five-piece AJV-backed
producer rig would sit beside the suite's existing `fake-*.ts` convention and
is the home all three files' identical copies already point at.

## False-positive check
- Gate-pin check: none of the three cited files match `*gate*.test.ts` or the
  named gate kin; none of the cited code is a pinned count or inventory
  assertion.
- Recording-double check: `producerWithCapture`'s `notes` array IS a
  recording double each file's own tests assert positive membership against
  (`toHaveLength(1)`, content equality), not a "never called" MUST-NOT
  witness; this finding targets the rig's construction code, not any such
  assertion, so the carve-out does not shield the claim and is not contested.
- docs/bugs/ signature search: docs/bugs/0381-echo-object-first-field-model-key-order.md
  exists and is the open bug b0381 is the RED/GREEN witness for; this finding
  does not contest b0381's redness or behaviour, only the duplicated rig code
  every cell depends on regardless of which way the bug resolves.
  tests/e2e-s5-binder-echo-emission.test.ts and
  tests/echo-value-rule1-sanitisation.test.ts are unrelated to bug 0381 and
  pass at HEAD.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0381-echo-object-first-field-declaration-order\|e2e-s5-binder-echo-emission\|echo-value-rule1-sanitisation"
  docs/reference/coverage-matrix.md` returns no hits. This finding proposes no
  merge, rename, or deletion of any cited file.
- Coverage-drift check: the claim is about a repeated harness DEFINITION that
  exists today, not a missing test path.

## Triage
verdict: confirmed — independently re-verified: parseDeps/rootDouble/BINDER_MODEL/producerWithCapture/ctxDouble hash byte-identical (md5 over awk-extracted bodies) across b0381:124-189, e2e-s5:102-177 and echo-value:475-532 exactly at the cited lines, none imports from tests/helpers, b0381's header names the e2e-s5 rig, all three files green at HEAD (35/35), coverage-matrix.md 0 hits, no gate/recording-double/witness-list carve-out applies, and no open/resolved PTQ tracks this AJV+clock producerWithCapture family (PTQ-0209/0384/0397 are different harness shapes) — three evidentiary slips, none refuting: the "7 files" census is actually 13 files declaring both rootDouble and producerWithCapture (the exact-three cluster and the disjoint b0398/b0478 pair still reproduce; params-default and binder-forced/post-merge pairs are further clusters), tests/helpers/e2e-s1.ts already exports an equivalent parseDeps and tool-call-dispatch-harness.ts an AJV-backed rootDouble/ctxDouble (strengthens the case), and docs/bugs/0381 is Status fixed (0.369.0), not open; same-wave siblings d7-01 echo-group-g and d7-01 binder-post-merge (both confirmed) cite the same e2e-s5 origin against other hosts — per-host-file convention keeps this distinct, but the fix should land one shared helper (triage: claude-fable-5-1)
