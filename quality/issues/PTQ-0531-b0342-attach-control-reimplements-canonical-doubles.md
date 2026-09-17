---
id: PTQ-0531
title: b0342-forwarded-enum-attach-control.test.ts re-derives e2e-s1's parseDeps/parseDoc and call-with-clause-harness's NOOP_CHECKPOINT/rootDouble instead of importing them
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0342-forwarded-enum-attach-control.test.ts:69-97
  - tests/helpers/e2e-s1.ts:27-42
  - tests/helpers/call-with-clause-harness.ts:152-165
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0342-forwarded-enum-attach-control.test.ts re-derives e2e-s1's parseDeps/parseDoc and call-with-clause-harness's NOOP_CHECKPOINT/rootDouble instead of importing them

## Observation
tests/b0342-forwarded-enum-attach-control.test.ts declares its own module-scope `parseDepsLocal()` (a `{ systemNote, modelMatcher }` pair with a no-op `sendMessage`/`notify`/`emitDiagnostic` channel and an always-`"resolved"` model matcher) and its own `NOOP_CHECKPOINT`/`rootDouble()` pair (a `Checkpoint` whose `before()` resolves immediately, wrapped into a `RuntimeRoot` carrying a fixed `idSource`). Both shapes already exist as exported functions under `tests/helpers/`: `parseDeps()` in `tests/helpers/e2e-s1.ts` builds the identical `{ systemNote, modelMatcher }` pair, and `NOOP_CHECKPOINT`/`rootDouble()` in `tests/helpers/call-with-clause-harness.ts` build the identical `Checkpoint`/`RuntimeRoot` pair. This is the same re-derivation pattern already found and filed in this same wave for a different file (`qw20260917154546-d7-01-b0314-reimplements-e2e-s1-and-call-with-clause-harness.md`, itself citing `quality/resolved/PTQ-0209` as the fix precedent for `NOOP_CHECKPOINT`/`rootDouble` specifically) — a second, independent instance of the identical pair of shapes being hand-rebuilt rather than imported.

## Evidence

tests/b0342-forwarded-enum-attach-control.test.ts:69-97 (re-read immediately before filing):
```ts
const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

function parseDepsLocal(): Parameters<typeof parseThetaDocument>[1] {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}

/** Parse a fixture and fail LOUDLY on any error-severity diagnostic (*No silent test skipping*). */
function parseTheta(path: string, src: string): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  const doc = parseThetaDocument(source, parseDepsLocal());
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

tests/b0342-forwarded-enum-attach-control.test.ts:110-116 (`rootDouble`, re-read immediately before filing):
```ts
function rootDouble(): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
    schemaValidator: realAjvValidator(),
  } as unknown as RuntimeRoot;
}
```

tests/helpers/e2e-s1.ts:27-42 — the canonical equivalent, already exported (re-read immediately before filing):
```ts
function inertSystemNote(): SystemNoteChannelDeps {
  const pi: SystemNoteSender = { sendMessage: (): void => {} };
  return { pi, ui: { notify: (): void => {} }, emitDiagnostic: (): void => {} };
}

/** A trivially-resolving `model:` matcher (the model hook is not under test). */
const resolvingMatcher: ModelReferenceMatcher = {
  resolve: (): "resolved" => "resolved",
};

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

Both `NOOP_CHECKPOINT` declarations are byte-identical. `rootDouble()`'s body is identical over the fields both files need (`checkpoint`, `idSource`, with the same `"inv-1"`/`"tc-1"` literals); b0342's copy additionally carries a `schemaValidator` field the canonical version lacks (this file's own `invoke<T>` return gate needs a real AJV validator), and the canonical version carries a `clock` field b0342's copy omits — a parameterisation gap, not a behavioural difference in the fields both share. `parseDepsLocal`'s `{ systemNote, modelMatcher }` construction is field-for-field identical to `parseDeps()`'s; `parseTheta`'s `ThetaSource`-building wrapper around `parseThetaDocument` is the same wrapper `parseDoc()` already is, plus an inlined error-diagnostic check `parseDoc()` does not itself perform.

## Why this is a problem
This is the "Copy-paste fixtures/doubles" class: a `Checkpoint`/`RuntimeRoot` double and a `parseThetaDocument`-wrapping parse harness are rebuilt from scratch in this file even though both already exist as exported, reusable functions under `tests/helpers/`. `quality/resolved/PTQ-0209` already established that this exact `NOOP_CHECKPOINT`/`rootDouble` pair drifting across independently-maintained copies is the named risk (a shape change landing in one copy without being mirrored in the others), and `tests/helpers/call-with-clause-harness.ts` is the fix's own designated canonical home; this file was not among the files that migration reached and reproduces the pre-fix pattern.

## Suggested direction (non-binding, optional)
Importing `parseDeps` from `tests/helpers/e2e-s1.ts` and `NOOP_CHECKPOINT`/`rootDouble` from `tests/helpers/call-with-clause-harness.ts` — supplementing the imported `rootDouble()`'s return with the one extra `schemaValidator` field this file's scenario needs — is the path PTQ-0209's own migration already established for the rest of the suite.

## False-positive check
- Gate-pin check: tests/b0342-forwarded-enum-attach-control.test.ts does not match `*gate*.test.ts` or its named kin; no pinned count or inventory is touched.
- Recording-double check: neither `rootDouble()` nor `parseTheta()` records calls to back a "never called" witness; both are inert doubles/wrappers that let the production parser and executor run for real, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0342-multi-hop-subagent-chain-attributes-forwarded-enum-to-immediate-callee.md Status "fixed (0.318.0)". `npx vitest run tests/b0342-forwarded-enum-attach-control.test.ts` → 2/2 passing at HEAD, so this is not a documented correct-reason red; the finding is a static duplication claim, independent of the file's pass/fail state.
- coverage-matrix/bug-doc citation search: `grep -n "b0342-forwarded-enum-attach-control" docs/reference/coverage-matrix.md` → 0 hits; `grep -rl "b0342-forwarded-enum-attach-control" docs/bugs/*.md` → only its own bug document. This finding proposes no merge, rename, or deletion of the file or any `it()` cell, only that its harness-setup functions could import existing helpers.
- Overlap check against already-filed/resolved topics: re-read `quality/resolved/PTQ-0209-rootdouble-producer-harness-duplicated.md` in full — its cited sites are four other files, none of which is `tests/b0342-forwarded-enum-attach-control.test.ts`, and it is `status: fixed`. Also re-read the sibling same-wave candidate `quality/intake/qw20260917154546-d7-01-b0314-reimplements-e2e-s1-and-call-with-clause-harness.md` — it targets `tests/b0314-compound-assign-non-numeric.test.ts` only, a different file; this finding is a second, independent instance of the same pattern, not a re-file of either.
- Coverage-drift check: this finding is about test-support code that exists and runs; it makes no claim that any path or behaviour is untested.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — all excerpts reproduce verbatim at the cited lines (NOOP_CHECKPOINT :69-73, parseDepsLocal :75-83, parseTheta :86-97, rootDouble :110-116; e2e-s1.ts:27-46; call-with-clause-harness.ts:152-168); parseDepsLocal is value-for-value identical to e2e-s1's exported parseDeps, parseTheta is parseDoc plus a loud-fail, NOOP_CHECKPOINT is byte-identical and rootDouble matches the exported call-with-clause-harness.ts:158 on every shared field (schemaValidator is an additive spread); the file imports nothing from tests/helpers/ while PTQ-0209's four cited files now all import rootDouble/noopPi from call-with-clause-harness and parseDoc from e2e-s1 with zero local copies, so the migration precedent is real and skipped this file; bug 0342 is Status fixed, 2/2 green at HEAD, not a *gate* file, coverage-matrix 0 hits, no PTQ or intake sibling targets this file (per-file convention of PTQ-0214/0239/0314/0386/0405). Two peripheral evidentiary claims are wrong but do not touch the anchor: NOOP_CHECKPOINT is NOT exported from call-with-clause-harness.ts (only rootDouble is; the exported const is tool-call-dispatch-harness.ts:81), and call-with-clause-harness.ts (2026-09-09, 96303cc3) postdates this file (2026-08-31, bc5eb11d), so this is a not-migrated case rather than an authored bypass — e2e-s1's parseDeps (2026-07-13) did predate it (triage: claude-fable-5-1)
