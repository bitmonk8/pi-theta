---
id: PTQ-0559
title: invoke-return-enum-carrier-projection.test.ts re-derives e2e-s1's parseDeps and call-with-clause-harness's NOOP_CHECKPOINT/rootDouble instead of importing them
lens: D7
status: open
verdict: confirmed
locations:
  - tests/invoke-return-enum-carrier-projection.test.ts:153-181
  - tests/invoke-return-enum-carrier-projection.test.ts:183-187
  - tests/invoke-return-enum-carrier-projection.test.ts:245-251
  - tests/helpers/e2e-s1.ts:37-46
  - tests/helpers/call-with-clause-harness.ts:152-168
sites: 1
fix_scope: cross-module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 1
---

# invoke-return-enum-carrier-projection.test.ts re-derives e2e-s1's parseDeps and call-with-clause-harness's NOOP_CHECKPOINT/rootDouble instead of importing them

## Observation
tests/invoke-return-enum-carrier-projection.test.ts declares its own
module-scope `parseDeps()` (a `{ systemNote, modelMatcher }` pair with a
no-op `sendMessage`/`notify`/`emitDiagnostic` channel and an
always-`"resolved"` model matcher), its own `NOOP_CHECKPOINT` (a `Checkpoint`
whose `before()` resolves immediately), and its own `rootDouble()` (wrapping
`checkpoint`/`idSource`/an injected `schemaValidator` into a `RuntimeRoot`).
Two of these three shapes already exist as exported functions under
`tests/helpers/`: `parseDeps()` in `tests/helpers/e2e-s1.ts` builds the
field-for-field identical `{ systemNote, modelMatcher }` pair, and
`NOOP_CHECKPOINT`/`rootDouble()` in `tests/helpers/call-with-clause-harness.ts`
build the same `Checkpoint` and the same `checkpoint`/`idSource` `RuntimeRoot`
shape (that file's version additionally carries a `clock` field this file
does not need, and this file's version additionally carries the
`schemaValidator` field its own scenario needs).

## Evidence

tests/invoke-return-enum-carrier-projection.test.ts:153-181 (re-read
immediately before filing):
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

/**
 * Parse a fixture and fail LOUDLY on any error-severity diagnostic — a fixture
 * that stops parsing must never let a bug test pass, or red, for the wrong
 * reason (*No silent test skipping*).
 */
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

tests/invoke-return-enum-carrier-projection.test.ts:183-187 (`NOOP_CHECKPOINT`):
```ts
const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};
```

tests/invoke-return-enum-carrier-projection.test.ts:245-251 (`rootDouble`):
```ts
function rootDouble(schemaValidator: SchemaValidator): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
    schemaValidator,
  } as unknown as RuntimeRoot;
}
```

tests/helpers/e2e-s1.ts:37-46 — the canonical equivalent, already exported
(re-read immediately before filing):
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
(`inertSystemNote()` at e2e-s1.ts:27-30 builds the identical
`{ pi: { sendMessage }, ui: { notify }, emitDiagnostic }` triple as the
in-scope file's inline `systemNote`, and `resolvingMatcher` at e2e-s1.ts:33-35
is the identical always-`"resolved"` matcher.)

tests/helpers/call-with-clause-harness.ts:152-168 — the canonical equivalent,
already exported (re-read immediately before filing):
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

Both `NOOP_CHECKPOINT` declarations are byte-identical. Both `rootDouble()`
bodies are identical over the two fields they share (`checkpoint`, `idSource`,
with the same `"inv-1"`/`"tc-1"` literals); the in-scope file's copy swaps the
canonical `clock` field for a `schemaValidator` field its own AJV-return
scenario needs — a parameterisation difference, not a behavioural one over
the shared fields.

## Why this is a problem
This is the "Copy-paste fixtures/doubles" class: a `ParseThetaDocumentDeps`
builder and a `Checkpoint`/`RuntimeRoot` double are rebuilt from scratch in
this file even though both already exist as exported, reusable functions
under `tests/helpers/`. `quality/resolved/PTQ-0209` already established that
this exact `NOOP_CHECKPOINT`/`rootDouble` pair drifting across
independently-maintained copies is the named risk (a shape change landing in
one copy without being mirrored in the others), and
`tests/helpers/call-with-clause-harness.ts` is that fix's own designated
canonical home for the pair; this file was not among the files that migration
reached.

## Suggested direction (non-binding, optional)
Importing `parseDeps` from `tests/helpers/e2e-s1.ts` and `NOOP_CHECKPOINT`
from `tests/helpers/call-with-clause-harness.ts`, then building the local
`rootDouble(schemaValidator)` by spreading the imported `rootDouble()`'s
`checkpoint`/`idSource` fields and adding the one extra `schemaValidator`
field this scenario needs, is the path PTQ-0209's own migration already
established for the rest of the suite.

## False-positive check
- Gate-pin check: tests/invoke-return-enum-carrier-projection.test.ts does not
  match `*gate*.test.ts` or its named kin; no pinned count or inventory is
  touched.
- Recording-double check: neither `rootDouble()` nor `parseTheta()` records
  calls to back a "never called" witness; both are inert doubles/wrappers
  that let the production parser and executor run for real (the file's
  actual recording double, `RecordingSchemaValidator`, is a separate,
  distinct piece not covered by this finding). The carve-out does not apply
  to the cited code.
- docs/bugs/ signature search: `grep -rln "invoke-return-enum-carrier-projection" docs/bugs/*.md` → only `docs/bugs/0174-typed-invoke-enum-return-validation-prompt-cell.md`, which names this file as its own reproduction/witness file for the RED cells, not as a documented correct-reason red for the HARNESS shape.
- coverage-matrix/bug-doc citation search: `grep -n "invoke-return-enum-carrier-projection" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of the file or any `it()`/`describe()` — only that its harness-setup functions could import existing helpers.
- Overlap check: `grep -rl "invoke-return-enum-carrier-projection" quality/intake/*.md` (excluding this file) → no hits; the sibling same-wave candidates `qw20260917154546-d7-01-b0314-reimplements-e2e-s1-and-call-with-clause-harness.md` and `qw20260917154546-d7-02-b0342-attach-control-reimplements-canonical-doubles.md` each name a different file (tests/b0314-compound-assign-non-numeric.test.ts and tests/b0342-forwarded-enum-attach-control.test.ts respectively); this finding is a third, independent instance of the same re-derivation pattern, not a re-file of either.
- Coverage-drift check: this finding is about test-support code that exists and runs; it makes no claim that any path or behaviour is untested.

## Triage
<!-- appended by triage -->
verdict: confirmed — all five excerpts verified verbatim at the cited lines (parseDeps :153-163, NOOP_CHECKPOINT :183-187, rootDouble :245-251; e2e-s1.ts :37-46 with inertSystemNote :27-30 / resolvingMatcher :33-35; call-with-clause-harness.ts :152-168); the local parseDeps is field-for-field identical to e2e-s1's export (helper 2026-07-13 predates the test 2026-08-16), the NOOP_CHECKPOINT is byte-identical and rootDouble matches over checkpoint/idSource, the file imports nothing from tests/helpers/, and call-with-clause-harness.ts is the ratified home — PTQ-0209's fix (2594cd44) migrated array-sink-unresolvable-deferral.test.ts to exactly the `rootDouble`/`parseDoc` imports proposed here; in-scope D7 copy-paste-fixture class confined to tests/, not a gate test, not a recording double, bug 0174 fixed with 16/16 green at HEAD, coverage-matrix 0 hits, and no dedupe (PTQ-0209/0214/0314/0386/0405 cite other files under the established per-file convention; same-wave siblings d7-01-b0314, d7-02-b0342 and d7-01-wire-form-metric target other files, the last citing this file only as context). Peripheral inaccuracies that do not touch the anchor: call-with-clause-harness.ts's NOOP_CHECKPOINT is module-private (tests/helpers/tool-call-dispatch-harness.ts:81 exports one, and its :93 rootDouble already carries a real-AJV schemaValidator); docs/bugs/ mentions this file in 12 docs not 1; the intake-overlap grep does hit the wire-form-metric sibling (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
