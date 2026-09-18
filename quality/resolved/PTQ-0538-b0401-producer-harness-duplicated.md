---
id: PTQ-0538
title: b0401 redeclares the parseDeps/rootDouble/BINDER_MODEL/producerWithCapture/ctxDouble producer harness tests/e2e-s5-binder-echo-emission.test.ts already carries
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0401-informational-notes-omit-details.test.ts:161-227
  - tests/e2e-s5-binder-echo-emission.test.ts:102-177
sites: 2
fix_scope: cross-module       # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# b0401 redeclares the parseDeps/rootDouble/BINDER_MODEL/producerWithCapture/ctxDouble producer harness tests/e2e-s5-binder-echo-emission.test.ts already carries

## Observation
`tests/b0401-informational-notes-omit-details.test.ts` declares, module-scope, its own `parseDeps`, `rootDouble`, `BINDER_MODEL`, `producerWithCapture`, and `ctxDouble` — the same five pieces `tests/e2e-s5-binder-echo-emission.test.ts` already declares to drive a production `runBinder()` pass. `rootDouble`, `BINDER_MODEL`, `producerWithCapture`, and `ctxDouble` are byte-identical between the two files; `parseDeps` is byte-identical; `parse`/`parseOnly` differ only in whether the path is a hard-coded literal or a parameter. b0401's own header comment states the harness "mirrors the existing house patterns: `tests/e2e-s5-binder-echo-emission.test.ts` (production `runBinder` capture)" — the mirroring is authored knowledge, not an independent coincidence.

## Evidence

`tests/b0401-informational-notes-omit-details.test.ts:161-227`:
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

function parse(path: string, src: string) {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  const doc = parseThetaDocument(source, parseDeps());
  const errors = doc.diagnostics
    .filter((d) => d.severity === "error")
    .map((d) => d.code);
  expect(errors, "the theta must parse cleanly before it is driven").toEqual([]);
  expect(doc.frontmatter, "the theta must carry parseable frontmatter").not.toBeNull();
  return doc;
}

function rootDouble(): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: {
      newInvocationId: (): string => "inv-1",
      newToolCallId: (): string => "tc-1",
    },
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

`tests/e2e-s5-binder-echo-emission.test.ts:102-177` (same five pieces; `rootDouble`, `BINDER_MODEL`, `producerWithCapture`, `ctxDouble` are byte-identical modulo whitespace/comments; `parseDeps` is byte-identical):
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

Exact search: `grep -n "^function rootDouble\|^function producerWithCapture\|^function ctxDouble\|^const BINDER_MODEL\|^function parseDeps"` over both files returns one match of each name per file (5 names × 2 files = 10 matches).

## Why this is a problem
b0401's own header comment ("Harnesses mirror the existing house patterns: `tests/e2e-s5-binder-echo-emission.test.ts` (production `runBinder` capture)") records that the author identified the source harness by name while writing a fresh copy rather than importing it. `rootDouble`, `BINDER_MODEL`, `producerWithCapture`, `ctxDouble`, and `parseDeps` are byte-identical between the two files; only `parse`'s hard-coded path vs. parameter differs.

## Suggested direction (non-binding, optional)
`tests/helpers/` already holds shared non-domain-specific harness modules (e.g. `e2e-s1.ts` exports a `parseDeps`); the five pieces named here mirroring `tests/e2e-s5-binder-echo-emission.test.ts` byte-for-byte are natural candidates for a similarly shared, parameterised binder-producer-capture module rather than a fresh copy per bug file.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named kin; this finding is about a harness-function definition site, not a pinned count.
- Recording-double check: `producerWithCapture`'s `notes` array is a positive-witness recorder (asserted `toHaveLength(1)` and then read), not a "never called" negative witness; the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "b0401-informational-notes-omit-details\|e2e-s5-binder-echo-emission" docs/bugs/` — docs/bugs/0401-*.md does not mark either file as a documented correct-reason red; `npx vitest run tests/b0401-informational-notes-omit-details.test.ts tests/e2e-s5-binder-echo-emission.test.ts` passes both files at HEAD.
- coverage-matrix/bug-doc citation search: `grep -n "b0401-informational-notes-omit-details\|e2e-s5-binder-echo-emission" docs/reference/coverage-matrix.md` → 0 hits. No merge, rename, or deletion of either file or any `it()`/`describe()` is proposed.
- Coverage check: the claim is entirely about a repeated harness DEFINITION; both files' own tests exercise their own copy, so this is not a coverage-gap claim.

## Triage
verdict: confirmed — independently re-verified: both excerpts reproduce at b0401:161-227 and e2e-s5:102-177; the stated 5-name grep yields exactly 10 hits (one per name per file); after stripping comments/whitespace the parseDeps/rootDouble/BINDER_MODEL/producerWithCapture/ctxDouble quintet diffs to a single trailing comma in rootDouble's idSource literal (formatting-only — "byte-identical" is a hair overstated, not refuted) and parse differs only by path literal vs parameter; b0401's header (line 37) really names e2e-s5 as the mirrored pattern and e2e-s5 (d23c22be 2026-07-13) predates b0401 (ca8da37c 2026-09-03) so the origin was importable; no tests/helpers module exports the clock+AJV-backed producerWithCapture set (tool-call-dispatch-harness rootDouble lacks clock, call-with-clause-harness lacks AJV; e2e-s1 exports an equivalent parseDeps the fixer should reuse); docs/bugs/0401 is Status fixed and both files pass at HEAD (14/14), coverage-matrix has 0 hits, no merge/rename/delete proposed, notes recorder is a positive witness — no carve-out applies; no open/resolved PTQ names either file (PTQ-0209/0384/0397/0214/0314/0386 are disjoint harnesses/files) and same-wave sibling d7-01-b0401 covers a different block (288-322); siblings d7-01-binder-post-merge, d7-02-b0381, d7-02-b0397-9, d7-08 cite the same e2e-s5 origin against other files — per-copy-site convention keeps this distinct, but the fix should be one shared binder-producer-capture helper (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
