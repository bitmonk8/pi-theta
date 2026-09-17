---
id: PTQ-0463
title: echo-array-per-element-descriptor.test.ts redeclares the group-G production-binder rig it names as echo-value-rule1-sanitisation.test.ts's own
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/echo-array-per-element-descriptor.test.ts:221-320
  - tests/echo-value-rule1-sanitisation.test.ts:446-533
  - tests/e2e-s5-binder-echo-emission.test.ts:89-176
sites: 3                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# echo-array-per-element-descriptor.test.ts redeclares the group-G production-binder rig it names as echo-value-rule1-sanitisation.test.ts's own

## Observation
`tests/echo-array-per-element-descriptor.test.ts` declares its own
`CapturedNote` interface, `scriptEnvelope`, `parseDeps`, `rootDouble`,
`BINDER_MODEL`, `producerWithCapture`, and `ctxDouble` — the scripted
off-session-`complete()` + real `ProductionThetaProducer.runBinder()` +
real `AjvSchemaValidator` rig that drives a binder pass and captures the
delivered `theta-system-note`. Its own file-header comment names this
verbatim as "the group-G rig of `tests/echo-value-rule1-sanitisation.test.ts`
(§'Emitter-level witness through the production producer')" rather than an
independently-invented harness. `tests/echo-value-rule1-sanitisation.test.ts`
declares the identical seven-piece rig under Group G, and its own header
states Group G itself "runs the same M2 harness
`tests/e2e-s5-binder-echo-emission.test.ts` uses" — a third file (out of this
review's scope) carrying the same `scriptEnvelope`/`parseDeps`/`rootDouble`/
`producerWithCapture`/`ctxDouble` set. None of the three files imports the
rig from a shared module; each redeclares it, differing only in whether
`rootDouble`/`producerWithCapture`/`bindAndReadNote` thread an extra `source`
parameter (echo-array's carriers need `#recoverDeclaredDefaults` to re-read
the fixture bytes, so its `rootDouble` also carries a `fileSystem` stub the
other two omit).

## Evidence
tests/echo-array-per-element-descriptor.test.ts:237-320 (re-read immediately
before filing; `scriptEnvelope` through `ctxDouble`):
```ts
function scriptEnvelope(envelope: unknown): void {
  scripted.replyFor = (context: unknown): unknown => {
    const tools = (context as { tools?: ReadonlyArray<{ name?: unknown }> }).tools;
    const name = typeof tools?.[0]?.name === "string" ? tools[0].name : "__theta_bind_none";
    return {
      role: "assistant",
      content: [{ type: "toolCall", id: "tc-1", name, arguments: { envelope } }],
      stopReason: "toolUse",
      timestamp: 0,
    };
  };
}

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

tests/echo-value-rule1-sanitisation.test.ts:462-476 (re-read immediately
before filing; the same two functions, byte-identical):
```ts
function scriptEnvelope(envelope: unknown): void {
  scripted.replyFor = (context: unknown): unknown => {
    const tools = (context as { tools?: ReadonlyArray<{ name?: unknown }> }).tools;
    const name = typeof tools?.[0]?.name === "string" ? tools[0].name : "__theta_bind_none";
    return {
      role: "assistant",
      content: [{ type: "toolCall", id: "tc-1", name, arguments: { envelope } }],
      stopReason: "toolUse",
      timestamp: 0,
    };
  };
}

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

tests/echo-array-per-element-descriptor.test.ts:292-320 (`BINDER_MODEL`,
`producerWithCapture`, `ctxDouble`):
```ts
const BINDER_MODEL = {
  id: "binder-model",
  provider: "anthropic-messages",
  api: "anthropic-messages",
  strictCapable: true,
};

function producerWithCapture(source: string): {
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
  const deps = createProductionProducerDeps({ pi, root: rootDouble(source), modelRegistry });
  return { deps, notes };
}

function ctxDouble(): ExtensionCommandContext {
  return {} as unknown as ExtensionCommandContext;
}
```

tests/echo-value-rule1-sanitisation.test.ts:505-533 (the same three
declarations, differing only by the `source` parameter `rootDouble` and
`producerWithCapture` do not carry here):
```ts
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

Both files' `CapturedNote` interface (echo-array:224-229; echo-value:449-453)
is also byte-identical:
```ts
interface CapturedNote {
  readonly customType: string;
  readonly content: string;
  readonly display?: boolean;
}
```

Pattern-wide search: `grep -n "^function scriptEnvelope\|^function rootDouble\|^function producerWithCapture\|^function ctxDouble" tests/echo-array-per-element-descriptor.test.ts tests/echo-value-rule1-sanitisation.test.ts tests/e2e-s5-binder-echo-emission.test.ts` returns all four function names in all three files, confirming three sites of the same rig (the third, `tests/e2e-s5-binder-echo-emission.test.ts`, is outside this review's scope and is cited here only as pattern context — echo-value-rule1-sanitisation.test.ts's own header names it as the harness Group G "runs the same M2 harness" as).

## Why this is a problem
Both in-scope files' own header comments name the OTHER file's rig as the
thing being run again ("the group-G rig of …"; "runs the same M2 harness
`tests/e2e-s5-binder-echo-emission.test.ts` uses"), so each author already
recognised the sequence as a repeated shape at the time of writing. The
`scriptEnvelope`, `parseDeps`, `CapturedNote`, `BINDER_MODEL`,
`producerWithCapture`, and `ctxDouble` declarations are byte-for-byte
identical across the two in-scope files (the only divergence is the `source`
parameter `rootDouble`/`producerWithCapture` thread through in
echo-array-per-element-descriptor.test.ts, needed because its carriers
exercise `#recoverDeclaredDefaults`'s re-read of fixture bytes). A change to
the scripted-reply shape, the AJV validator wiring, or the captured-note
filter must be hand-applied in at least three places today.

## Suggested direction (non-binding, optional)
No `tests/helpers/` module currently hosts this "scripted off-session
binder + real `ProductionThetaProducer` + captured `theta-system-note`" rig;
the three files' own comments naming each other as the shape's origin are
the observation that a shared base is missing, not a design for one.

## False-positive check
- Gate-pin check: none of the three files match `*gate*.test.ts` or the
  named gate kin; not applicable.
- Recording-double check: `notes`/`CapturedNote` back genuine positive
  delivery assertions in both in-scope files (e.g. `channelNotes[0]!.content`
  asserted by whole-string equality in `bindAndReadNote`), not MUST-NOT
  witnesses — this finding targets the redeclared rig, not the validity of
  the capture.
- docs/bugs/ signature search: docs/bugs/0087-echo-note-newline-unsanitised.md
  — Status "fixed (0.56.0)"; docs/bugs/0092-renderobject-first-field-unguarded-cast.md
  — Status "fixed (0.211.0)". Bug 0092's own §Provenance names "two throwaway
  offline vitest probes … over the group-G harness shape of
  `tests/echo-value-rule1-sanitisation.test.ts`, deleted after the runs" as
  the precedent for reusing that shape, but that entry describes deleted
  scratch probes, not a rationale for the shipped
  `echo-array-per-element-descriptor.test.ts` permanently re-declaring the
  same rig instead of importing it. Neither bug doc offers a reason the rig
  must be redeclared rather than shared.
- coverage-matrix/bug-doc citation search: `grep -n
  "echo-array-per-element-descriptor.test.ts\|echo-value-rule1-sanitisation.test.ts"
  docs/reference/coverage-matrix.md` → 0 hits. Both files are named in
  docs/bugs/0092-renderobject-first-field-unguarded-cast.md's own witness
  list (`tests/echo-array-per-element-descriptor.test.ts` "(new) — the
  regression …"; `tests/echo-value-rule1-sanitisation.test.ts` at several
  points). This finding proposes no merge, rename, or deletion of either
  file or its `it()`/`describe()` blocks — only that the rig's declarations
  could be imported rather than redeclared — so the citations are
  unaffected.
- Coverage check: the claim is about a repeated harness DEFINITION, not a
  missing test path; every cited declaration backs assertions already
  exercised in its own file.

## Triage
verdict: confirmed — independently re-verified: `CapturedNote`/`scriptEnvelope`/`parseDeps`/`BINDER_MODEL`/`ctxDouble` diff byte-identical (diff exit 0) between echo-array:224-319 and echo-value:449-532, `producerWithCapture` differs only by the `source` param + `rootDouble(source)` (2 lines), the 7-declaration grep reproduces in all three files at the cited lines, both header cross-references are real (echo-array:110,218 "group-G rig of …"; echo-value:85-86 "same M2 harness e2e-s5 … uses"), no file imports from ./helpers, docs/bugs/0087 and 0092 are Status fixed with both files green (37/37), coverage-matrix.md has 0 hits, and no accepted PTQ names any of the three files (PTQ-0209/0384/0397/0214/0314/0386 cover disjoint files) — in-scope D7 boilerplate/copy-paste-fixture, no carve-out applies; two notes for the fixer: tests/helpers/e2e-s1.ts already exports an equivalent `parseDeps()` (the direction paragraph's "no helpers module hosts this rig" is true only of the rig as a whole), and the rig is wider than three sites (14 tests/ files declare `producerWithCapture`/`scriptEnvelope`), with same-wave sibling qw20260917154546-d7-02-b0381-ajv-producer-harness-duplicated citing echo-value:475-529 + e2e-s5 against b0381 — the store's per-file-pair convention keeps this pair distinct, but the fix should land one shared helper (triage: claude-fable-5-1)
