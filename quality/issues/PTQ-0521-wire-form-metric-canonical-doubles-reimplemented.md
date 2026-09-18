---
id: PTQ-0521
title: invoke-depth-wire-form-metric.test.ts re-derives parseDeps/parseTheta/NOOP_CHECKPOINT/realAjvValidator/rootDouble/ctxDouble instead of importing the canonical helpers
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/invoke-depth-wire-form-metric.test.ts:209-273
  - tests/helpers/e2e-s1.ts:27-42
  - tests/helpers/call-with-clause-harness.ts:152-165
sites: 1                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# invoke-depth-wire-form-metric.test.ts re-derives parseDeps/parseTheta/NOOP_CHECKPOINT/realAjvValidator/rootDouble/ctxDouble instead of importing the canonical helpers

## Observation
tests/invoke-depth-wire-form-metric.test.ts declares its own module-scope `parseDeps()` (a `{ systemNote, modelMatcher }` pair with a no-op `sendMessage`/`notify`/`emitDiagnostic` channel and an always-`"resolved"` model matcher), `parseTheta()` (a `parseThetaDocument`-wrapping loud-fail-on-parse-error harness), `NOOP_CHECKPOINT`, `realAjvValidator()` (an `AjvSchemaValidator` wired with a `JSON.stringify`-keyed `slugOf`), `rootDouble()` (a `RuntimeRoot` carrying that checkpoint, a fixed `idSource`, and the AJV validator), and `ctxDouble()`. Every one of these six items is field-for-field identical (bar cosmetic doc-comment wording) to the same six items already declared in `tests/invoke-return-enum-carrier-projection.test.ts` — a file this test's own header comment names as the harness it "Mirrors" — and `parseDeps`/`parseTheta` are themselves a re-derivation of `tests/helpers/e2e-s1.ts`'s exported `parseDeps`/`parseDoc`, while `NOOP_CHECKPOINT`/`rootDouble` re-derive `tests/helpers/call-with-clause-harness.ts`'s exported pair (the same canonical-helper pair `quality/resolved/PTQ-0209` established as the fix precedent for this exact shape).

## Evidence

tests/invoke-depth-wire-form-metric.test.ts:209-219 (`parseDeps`, re-read immediately before filing):
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

tests/invoke-depth-wire-form-metric.test.ts:228-239 (`parseTheta`, re-read immediately before filing):
```ts
function parseTheta(path: string, src: string): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  const doc = parseThetaDocument(source, parseDeps());
  const errors = doc.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `precondition unmet: fixture ${path} failed to parse — ` +
        `${errors.map((d) => `${d.code}: ${d.message}`).join("; ")}`,
    );
  }
  return doc;
}
```

tests/invoke-depth-wire-form-metric.test.ts:241-273 (`NOOP_CHECKPOINT`/`realAjvValidator`/`rootDouble`/`ctxDouble`, re-read immediately before filing):
```ts
const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

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
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
    schemaValidator: realAjvValidator(),
  } as unknown as RuntimeRoot;
}

function ctxDouble(): ExtensionCommandContext {
  return {} as unknown as ExtensionCommandContext;
}
```

tests/invoke-return-enum-carrier-projection.test.ts:153-249 (pattern context, outside this wave's scope; re-read immediately before filing — the byte-identical `parseDeps`/`parseTheta`/`NOOP_CHECKPOINT`/`realAjvValidator`/`rootDouble`/`ctxDouble` sextet, the file the in-scope test's own header names as what it "Mirrors"):
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

tests/helpers/e2e-s1.ts:35-42 — the canonical equivalent, already exported (re-read immediately before filing):
```ts
/** Parse-theta-document deps whose seams are inert offline no-ops. */
export function parseDeps(): ParseThetaDocumentDeps {
  return { systemNote: inertSystemNote(), modelMatcher: resolvingMatcher };
}

/** Parse a UTF-8 `.theta` source string through the whole-document pipeline. */
export function parseDoc(src: string, path = "test.theta"): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, parseDeps());
}
```

tests/helpers/call-with-clause-harness.ts:152-165 — the canonical equivalent, already exported (re-read immediately before filing):
```ts
const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

export function rootDouble(): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
    clock: {
      wallNow: () => 0,
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    },
  } as unknown as RuntimeRoot;
}
```

Exact search: `grep -rl "^function parseDeps(): ParseThetaDocumentDeps" tests/*.test.ts` → 2 files: tests/invoke-depth-wire-form-metric.test.ts (in scope) and tests/invoke-return-enum-carrier-projection.test.ts. `grep -rln "^const NOOP_CHECKPOINT: Checkpoint" tests/*.test.ts tests/helpers/*.ts` → 3 files: the same two test files plus tests/helpers/call-with-clause-harness.ts. Both `NOOP_CHECKPOINT` declarations in the two test files are byte-identical; `rootDouble()`'s body is identical over the fields all three sites share (`checkpoint`, `idSource`, the same `"inv-1"`/`"tc-1"` literals), with the two test files additionally carrying a `schemaValidator` field the canonical helper lacks (a parameterisation gap the canonical helper's `clock` field mirrors in the other direction) rather than a behavioural difference in the shared fields. `parseDeps`'s `{ systemNote, modelMatcher }` construction is field-for-field identical between the two test files and to `e2e-s1.ts`'s exported `parseDeps`; `parseTheta`'s `ThetaSource`-building wrapper is the same wrapper `parseDoc()` already is, plus an inlined error-diagnostic loud-fail check `parseDoc()` does not itself perform.

## Why this is a problem
This is the "Copy-paste fixtures/doubles" class: a `ParseThetaDocumentDeps` builder, a loud-fail parse wrapper, a `Checkpoint`/`RuntimeRoot` double, an AJV-validator builder, and an `ExtensionCommandContext` double are all rebuilt from scratch in this file even though every one of them already exists as an exported, reusable function under `tests/helpers/` (`parseDeps`/`parseDoc` in `e2e-s1.ts`; `NOOP_CHECKPOINT`/`rootDouble` in `call-with-clause-harness.ts`), and even though a second test file in the same suite (`tests/invoke-return-enum-carrier-projection.test.ts`) already declares the identical six-item block under the identical names — the in-scope file's own header comment states it "Mirrors" that file, so the duplication is acknowledged in prose but not resolved in code. `quality/resolved/PTQ-0209` already established that this exact `NOOP_CHECKPOINT`/`rootDouble` pair drifting across independently-maintained copies is the named risk (a shape change landing in one copy without being mirrored in the others), and `call-with-clause-harness.ts` is that fix's own designated canonical home; this file was not among the files that migration reached.

## Suggested direction (non-binding, optional)
Importing `parseDeps`/`parseDoc` from `tests/helpers/e2e-s1.ts` and `NOOP_CHECKPOINT`/`rootDouble` from `tests/helpers/call-with-clause-harness.ts` — supplementing the imported `rootDouble()`'s return with the one extra `schemaValidator` field this file's scenario needs — is the path PTQ-0209's own migration already established for the rest of the suite; `ctxDouble` and `realAjvValidator` could travel the same way once a shared home exists for them.

## False-positive check
- Gate-pin check: tests/invoke-depth-wire-form-metric.test.ts does not match `*gate*.test.ts` or its named kin; the cited lines are constant/function declarations, not a pinned count or inventory assertion.
- Recording-double check: `rootDouble()`, `ctxDouble()`, and `parseTheta()` are inert doubles/wrappers that let the production parser, executor, and a real `AjvSchemaValidator` run for real; none records calls to back a MUST-NOT-called witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0202-parent-depth-walk-counts-carrier-not-wire-depth.md is the bug this file's header cites; its status and reproduction shape were read in full above and do not bear on this finding, which is a static duplication claim over the harness-setup functions, independent of the file's red/green cell state.
- coverage-matrix/bug-doc citation search: `grep -n "invoke-depth-wire-form-metric" docs/reference/coverage-matrix.md` → 0 hits; `grep -rl "invoke-depth-wire-form-metric" docs/bugs/*.md` → only its own bug document (0202). This finding proposes no merge, rename, or deletion of the file or any `it()` cell — only that its harness-setup functions could import existing helpers.
- Overlap check against already-filed/resolved topics: re-read `quality/resolved/PTQ-0209-rootdouble-producer-harness-duplicated.md` in full — its cited sites are other files, none of which is `tests/invoke-depth-wire-form-metric.test.ts` or `tests/invoke-return-enum-carrier-projection.test.ts`, and it is `status: fixed`. Also re-read the same-wave sibling `quality/intake/qw20260917154546-d7-02-b0342-attach-control-reimplements-canonical-doubles.md`, which targets a different file (`tests/b0342-forwarded-enum-attach-control.test.ts`) citing the same two canonical helpers — this finding is an independent instance of the same pattern in a file that wave's shard did not cover, not a re-file of it. `grep -rl "invoke-depth-wire-form-metric\|invoke-return-enum-carrier-projection" quality/intake/*.md quality/resolved/*.md` → 0 hits before this filing.
- Coverage-drift check: this finding is about test-support code that exists and runs; it makes no claim that any path or behaviour is untested.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — all three excerpts reproduce verbatim at the cited lines (parseDeps :209-219, parseTheta :228-239, sextet :241-273; e2e-s1.ts:38-46; call-with-clause-harness.ts:152-168); the local parseDeps is value-for-value identical to e2e-s1.ts's exported parseDeps (same three no-ops + always-"resolved" matcher), parseTheta is parseDoc plus a loud-fail over what e2e-s1 already exports as errors()/diagLines(), NOOP_CHECKPOINT is byte-identical to call-with-clause-harness.ts's and to the exported one at tool-call-dispatch-harness.ts:81, rootDouble matches the exported call-with-clause-harness.ts:158 on every shared field; the file imports nothing from tests/helpers/ although e2e-s1.ts (2026-07-13) and call-with-clause-harness.ts (2026-08-19) both predate it (2026-09-09); bug 0202 is Status fixed and the file is 22/22 green at HEAD, not a *gate* file, coverage-matrix 0 hits, and no PTQ or intake sibling covers this file (d7-02-invoke-return-enum-projection targets the other file — the established per-file convention of PTQ-0214/0239/0314/0386/0405). Three peripheral evidentiary claims are wrong but do not touch the anchor: the stated searches return 68 test files for `^function parseDeps(): ParseThetaDocumentDeps` and ~85 for `^const NOOP_CHECKPOINT: Checkpoint` (not 2 and 3 — the counts were shard-scoped); NOOP_CHECKPOINT is NOT exported from call-with-clause-harness.ts (only rootDouble is; the exported const lives in tool-call-dispatch-harness.ts); and the sibling's rootDouble takes a `schemaValidator` parameter where this file's hardwires realAjvValidator(), so five of the six items are byte-identical, not six (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
