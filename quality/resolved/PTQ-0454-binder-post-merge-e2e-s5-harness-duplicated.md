---
id: PTQ-0454
title: binder-post-merge-ajv-enforcement.test.ts retypes the e2e-s5-binder-echo-emission CapturedNote/parseDeps/parse/rootDouble/producerWithCapture/ctxDouble/noteChannelEntries sextet
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/binder-post-merge-ajv-enforcement.test.ts:187-192
  - tests/binder-post-merge-ajv-enforcement.test.ts:376-399
  - tests/binder-post-merge-ajv-enforcement.test.ts:406-436
  - tests/binder-post-merge-ajv-enforcement.test.ts:439-467
  - tests/binder-post-merge-ajv-enforcement.test.ts:485-487
  - tests/e2e-s5-binder-echo-emission.test.ts:76-80
  - tests/e2e-s5-binder-echo-emission.test.ts:102-122
  - tests/e2e-s5-binder-echo-emission.test.ts:130-143
  - tests/e2e-s5-binder-echo-emission.test.ts:157-177
  - tests/e2e-s5-binder-echo-emission.test.ts:209-211
sites: 2
fix_scope: cross-module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# binder-post-merge-ajv-enforcement.test.ts retypes the e2e-s5-binder-echo-emission CapturedNote/parseDeps/parse/rootDouble/producerWithCapture/ctxDouble/noteChannelEntries sextet

## Observation
`tests/binder-post-merge-ajv-enforcement.test.ts` declares, module-scope, its
own `CapturedNote` interface, `parseDeps()`, `parse(src)`, an AJV-backed
`RuntimeRoot` double (`realAjvValidator()` + `rootDouble()`),
`producerWithCapture()`, `ctxDouble()` and `noteChannelEntries()` — the same
seven pieces `tests/e2e-s5-binder-echo-emission.test.ts` already declares for
driving the identical seam (`ProductionThetaProducer.runBinder()` over a
mocked off-session `complete()`, with a captured `pi.sendMessage` sink read
back as the `theta-system-note` channel). Four of the seven are byte-identical
or byte-identical-plus-one-added-field; the other three differ only in a
hard-coded fixture path string or in cosmetic assertion phrasing.

## Evidence
`tests/binder-post-merge-ajv-enforcement.test.ts:187-192` (`CapturedNote`, one field added):
```ts
interface CapturedNote {
  readonly customType: string;
  readonly content: string;
  readonly display?: boolean;
  readonly details?: { readonly event?: Record<string, unknown> };
}
```
`tests/e2e-s5-binder-echo-emission.test.ts:76-80` (the same three fields, no `details`):
```ts
interface CapturedNote {
  readonly customType: string;
  readonly content: string;
  readonly display?: boolean;
}
```

`tests/binder-post-merge-ajv-enforcement.test.ts:376-399` (`parseDeps`/`parse`):
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

/** Parse `.theta` source through the production whole-file parser. */
function parse(src: string) {
  const source: ThetaSource = {
    path: "b66.theta",
    bytes: new TextEncoder().encode(src),
  };
  const doc = parseThetaDocument(source, parseDeps());
  expect(
    doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
    "the fixture must parse cleanly before it is driven — a refused parse would make every note assertion below unreachable",
  ).toEqual([]);
  expect(doc.frontmatter, "the fixture must carry parseable frontmatter").not.toBeNull();
  return doc;
}
```
`tests/e2e-s5-binder-echo-emission.test.ts:102-122` — the same `parseDeps` body verbatim, and `parse` with the same shape and control flow, differing only in the hard-coded `path` (`"code-review.theta"`) and the diagnostics-code-only assertion:
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

/** Parse `.theta` source through the production whole-file parser. */
function parse(src: string) {
  const source: ThetaSource = {
    path: "code-review.theta",
    bytes: new TextEncoder().encode(src),
  };
  const doc = parseThetaDocument(source, parseDeps());
  const errors = doc.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
  expect(errors, "the binder theta must parse cleanly before it is driven").toEqual([]);
  expect(doc.frontmatter, "the binder theta must carry parseable frontmatter").not.toBeNull();
  return doc;
}
```

`tests/binder-post-merge-ajv-enforcement.test.ts:406-436` (`realAjvValidator` + `rootDouble`, `fileSystem` added for this file's multi-fixture lookup):
```ts
function realAjvValidator(): AjvSchemaValidator {
  return new AjvSchemaValidator({
    emit: (): void => {},
    slugOf: (schema: LoweredSchema): SchemaSlug => {
      const canonicalBytes = JSON.stringify(schema);
      return { slug: canonicalBytes, canonicalBytes };
    },
  });
}

function rootDouble(): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    clock: { wallNow: (): number => 0 },
    schemaValidator: realAjvValidator(),
    fileSystem: {
      readBytes: (path: string): Promise<Uint8Array> => {
        const src = FIXTURE_SOURCES.get(path);
        return src !== undefined
          ? Promise.resolve(new TextEncoder().encode(src))
          : Promise.reject(new Error(`fixture fs: no source registered for ${path}`));
      },
    },
  } as unknown as RuntimeRoot;
}
```
`tests/e2e-s5-binder-echo-emission.test.ts:130-143` — the identical `checkpoint`/`idSource`/`clock`/`schemaValidator` fields, the identical inline AJV construction (same `slugOf` body, same `JSON.stringify` content-addressing), only `fileSystem` absent:
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
```

`tests/binder-post-merge-ajv-enforcement.test.ts:439-467` (`producerWithCapture` + `ctxDouble`):
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
    getAvailable: (): readonly unknown[] => [
      {
        id: "binder-model",
        provider: "anthropic-messages",
        api: "anthropic-messages",
        strictCapable: true,
      },
    ],
    getApiKeyAndHeaders: async (): Promise<{ ok: boolean }> => ({ ok: true }),
  } as unknown as ModelRegistry;
  const deps = createProductionProducerDeps({ pi, root: rootDouble(), modelRegistry });
  return { deps, notes };
}

function ctxDouble(): ExtensionCommandContext {
  return {} as unknown as ExtensionCommandContext;
}
```
`tests/e2e-s5-binder-echo-emission.test.ts:157-177` — the same body verbatim, the model object hoisted to a shared `BINDER_MODEL` const rather than inlined, and the byte-identical `ctxDouble`:
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

function ctxDouble(): ExtensionCommandContext {
  return {} as unknown as ExtensionCommandContext;
}
```

`tests/binder-post-merge-ajv-enforcement.test.ts:485-487` and `tests/e2e-s5-binder-echo-emission.test.ts:209-211` — byte-identical:
```ts
function noteChannelEntries(notes: readonly CapturedNote[]): CapturedNote[] {
  return notes.filter((n) => n.customType === SYSTEM_NOTE_CHANNEL);
}
```

Search performed: `grep -n "^function parseDeps\|^function parse(\|^function rootDouble\|^function producerWithCapture\|^function ctxDouble\|^function noteChannelEntries\|interface CapturedNote" tests/binder-post-merge-ajv-enforcement.test.ts tests/e2e-s5-binder-echo-emission.test.ts` — 7 names, one declaration each, in both files (14 hits total), confirming two independent declarations of the same seven-piece harness rather than one shared import.

## Why this is a problem
Seven module-scope pieces of one production-binder-driving harness — an
interface, a parse scaffold, an AJV-backed `RuntimeRoot` double, a
producer-with-capture factory, a context double, and a channel filter — are
typed a second time in `binder-post-merge-ajv-enforcement.test.ts` rather than
imported from the file that already carries them
(`tests/e2e-s5-binder-echo-emission.test.ts`). `tests/helpers/` holds no
module exporting any of the seven; a change to the shape either
`RuntimeRoot`, `CapturedNote`, or `createProductionProducerDeps` expects has
to be made by hand in both files or the two copies silently diverge (as they
already have on the `CapturedNote.details` field and the `parse()` fixture
path).

## Suggested direction (non-binding, optional)
A shared `tests/helpers/` module exporting this production-binder-driving
harness (the `CapturedNote`/`parseDeps`/`parse`/`rootDouble`/
`producerWithCapture`/`ctxDouble`/`noteChannelEntries` septet, with the AJV
validator and `fileSystem` wiring left as caller-supplied options) would sit
beside the repository's existing convention of consolidating a per-file
`rootDouble()` into `tests/helpers/` after it recurs (e.g.
`tests/helpers/parent-producer-harness.ts`'s own header, and
`tests/helpers/fixture-dispatch-harness.ts`'s `rootWith`).

## False-positive check
Gate-pin check: neither file matches `*gate*.test.ts` or the named gate kin;
the cited code is harness/fixture declaration, not a pinned count or
inventory assertion. Recording-double check: `noteChannelEntries`/the `notes`
sink in both files is a positive read-back mechanism (tests assert what WAS
captured), not a "never called" negative witness; the carve-out does not
apply. docs/bugs/ signature search: `grep -rn "binder-post-merge-ajv-enforcement\|e2e-s5-binder-echo-emission" docs/bugs/` shows
`docs/bugs/0066-ajv-verdict-discarded-unreachable-enforcement.md` naming
`tests/binder-post-merge-ajv-enforcement.test.ts` as its runtime witness (a
correct-reason citation, not a documented red — the file passes at HEAD for
every RED-labelled cell, each of which states its own reason). No doc marks
this harness-code shape itself as a documented correct-reason red.
Coverage-matrix/bug-doc citation search: `grep -n "binder-post-merge-ajv-enforcement" docs/reference/coverage-matrix.md`
returned no hit; the bug doc's own witness-list citation is noted above. This
finding proposes no merge, rename, or deletion of either file or any
`it()`/`describe()` — only that the harness code inside
`binder-post-merge-ajv-enforcement.test.ts` be imported rather than retyped —
so the citation carve-out does not block filing. This is not a coverage
claim: both files already exist, already pass, and already exercise their own
copy of the harness; the observation is about the harness declaration being
repeated.

## Triage
verdict: confirmed — independently re-verified: all ten excerpts match byte-for-byte at the cited lines; the stated grep reproduces (14 hits, one declaration per name per file); e2e-s5 is the origin (added d23c22be 2026-07-13, binder-post-merge copy 94e81974 2026-08-08) and the host's own section header names it ("Harness (the bug-0011 / e2e-s5 production-producer pattern)"); parseDeps/ctxDouble/noteChannelEntries byte-identical, rootDouble/producerWithCapture/CapturedNote identical-plus-one-field, parse differs only in path literal/assertion phrasing; no tests/helpers module exports the AJV+clock-backed producerWithCapture/CapturedNote/noteChannelEntries set (same-named e2e-s1 parseDeps and tool-call-dispatch rootDouble/ctxDouble exist with different bodies — strengthens, not refutes); both files pass at HEAD (10/10); no gate/recording-double/witness-list carve-out applies (no merge/rename/delete proposed); no open/resolved PTQ tracks this lineage (PTQ-0209/0384/0397 are different harness families) — note same-wave intake siblings d7-02 b0381/b0397-9/b0401, d7-08 binder-forced-tool-dispatch and d7-116-03 cite the same e2e-s5 origin against other files and should be consolidated into one helper at fix time (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
