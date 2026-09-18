---
id: PTQ-0636
title: missing-object-key-rendering.test.ts's parseDeps/parseTheta/NOOP_CHECKPOINT/rootDouble/producer harness is a verbatim, self-acknowledged copy of non-object-receiver-gate.test.ts's block
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/missing-object-key-rendering.test.ts:165-225
  - tests/non-object-receiver-gate.test.ts:185-246
sites: 2
fix_scope: module             # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# missing-object-key-rendering.test.ts's parseDeps/parseTheta/NOOP_CHECKPOINT/rootDouble/producer harness is a verbatim, self-acknowledged copy of non-object-receiver-gate.test.ts's block

## Observation
`tests/missing-object-key-rendering.test.ts` declares five module-scope
pieces — `parseDeps()`, `parseTheta(path, src)`, a `NOOP_CHECKPOINT` constant,
`rootDouble()`, and `producer()` — under a section comment reading "Shared
parse + production-executor harness (the
tests/non-object-receiver-gate.test.ts pattern)". `tests/non-object-receiver-gate.test.ts`
declares the identical five pieces under its own section comment, "Shared
parse + production-executor harness (the group-(e) pattern)". `parseDeps`,
`NOOP_CHECKPOINT`, `rootDouble`, and `producer` are byte-identical between
the two files; `parseTheta` is functionally identical, differing only in
that the reviewed file inlines the one line the other file factors into a
separate `parseOnly` helper. Neither file imports the other, and no
`tests/helpers/` module exports this trio/quintet.

## Evidence

`tests/missing-object-key-rendering.test.ts:165-225`:
```ts
// ===========================================================================
// Shared parse + production-executor harness (the tests/non-object-receiver-gate.test.ts
// pattern).
// ===========================================================================

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
 * Parse a fixture and fail LOUDLY on any error-severity diagnostic. Every probe
 * here is parse-clean by construction — the static object-index check
 * (`checkObjectIndex`, src/runtime/stdlib-object.ts) requires only that the
 * index be a `string`, so a non-identifier-shaped key reaches the runtime
 * (bug 0036 §Reproduction). A parse rejection is therefore a harness defect,
 * and must never let a probe pass or fail for the wrong reason.
 */
function parseTheta(path: string, src: string): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  const doc = parseThetaDocument(source, parseDeps());
  const errors = doc.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `fixture ${path} failed to parse: ${errors.map((d) => `${d.code}: ${d.message}`).join("; ")}`,
    );
  }
  return doc;
}

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

function producer() {
  return createProductionProducerDeps({
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

`tests/non-object-receiver-gate.test.ts:185-246` — the same five pieces;
`parseDeps` (188-198), `NOOP_CHECKPOINT` (223-227), `rootDouble` (229-234),
and `producer` (236-246) are byte-identical to the excerpt above (confirmed
by direct comparison, no differing character); `parseTheta` (212-221)
differs only in factoring the `parseThetaDocument(source, parseDeps())` call
out to a one-line `parseOnly` helper (200-203) that this file calls instead
of inlining it:
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

function parseOnly(path: string, src: string): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, parseDeps());
}

function parseTheta(path: string, src: string): ThetaDocument {
  const doc = parseOnly(path, src);
  const errors = doc.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `fixture ${path} failed to parse: ${errors.map((d) => `${d.code}: ${d.message}`).join("; ")}`,
    );
  }
  return doc;
}

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

function producer() {
  return createProductionProducerDeps({
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

Exact check: `grep -n "function parseDeps\|function parseTheta\|NOOP_CHECKPOINT\|function rootDouble\|function producer" tests/missing-object-key-rendering.test.ts tests/non-object-receiver-gate.test.ts` returns exactly these definitions in each file, once each; neither file's import block (`tests/missing-object-key-rendering.test.ts:1-30`, `tests/non-object-receiver-gate.test.ts` header) imports from the other or from any `tests/helpers/` module for this block.

## Why this is a problem
The reviewed file's own section comment names the source it copied this
five-piece harness from — "the tests/non-object-receiver-gate.test.ts
pattern" — rather than stating that the block is imported from it, and the
comparison confirms the copy is verbatim (four of five pieces byte-identical,
the fifth functionally identical with one line inlined). Neither file's
`parseTheta`/`parseDeps`/`NOOP_CHECKPOINT`/`rootDouble`/`producer` block is
exported for the other to import, so a change to any shared piece — the
model-matcher stub's resolution mode, the parse-failure error message shape,
the checkpoint's no-op contract, or the fake `pi`/`root` objects
`createProductionProducerDeps` is called with — made in one file has to be
independently re-typed in the other to stay in sync, with the section
comment as the only thing tying the two copies together.

## Suggested direction (non-binding, optional)
`tests/helpers/` already holds this suite's shared per-domain harness modules
(e.g. `e2e-s1.ts`, `call-with-clause-harness.ts`); a module exporting this
`parseDeps`/`parseTheta`/`NOOP_CHECKPOINT`/`rootDouble`/`producer` quintet is
the home both files' own section comments already point toward, one calling
the other "the pattern" and the other naming itself "the group-(e) pattern"
from which the first was drawn.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate, committed-fixture-parse-gate, registry-closed-set-corpus-gate) — `non-object-receiver-gate.test.ts`'s filename contains "gate" but the term names the bug's own subject (a receiver-kind gate in production code, `checkObjectIndex`'s prior art), not a census/pin-count test shape; the cited lines assert no pinned count or inventory.
- Recording-double check: `rootDouble()`/`producer()` return an inert double consumed so the production executor can run; neither records calls to back a MUST-NOT-called witness.
- docs/bugs/ signature search: `grep -rl "parseDeps\|rootDouble" docs/bugs/*.md` → 0 hits; `docs/bugs/0036-missing-object-key-bare-key-rendering.md` (the reviewed file's own bug doc) discusses the rendering defect and this file's scope/harness rationale at length but states no reason to keep the harness un-shared. `npx vitest run tests/missing-object-key-rendering.test.ts tests/non-object-receiver-gate.test.ts` passes both files in full at HEAD.
- coverage-matrix/bug-doc citation search: `grep -n "missing-object-key-rendering\|non-object-receiver-gate" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of either file or any `it()`/`describe()` name — only that the shared five-piece harness block could be imported rather than copied — so no citation is disturbed.
- Coverage check: the claim is entirely about a repeated harness DEFINITION, not a missing test path; every function cited is exercised by both files' own passing tests.
- Prior-finding overlap check: `grep -rl "missing-object-key-rendering" quality/intake quality/resolved` → 0 hits before this filing, so this file pair is not already cited by name in this wave or a prior one. The resolved PTQ-0209 established the `NOOP_CHECKPOINT`/`rootDouble`/`producer` trio as recurring across roughly 89 files repo-wide but cited four different files as its own evidence (none of them either file in this pair); this finding additionally covers the `parseDeps`/`parseTheta` pair, which PTQ-0209 does not mention, and is the first filing to cite this specific two-file pair by name.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: parseDeps (:170-180 vs :188-198) and the NOOP_CHECKPOINT/rootDouble/producer block (:201-225 vs :222-246) diff byte-identical, parseTheta differs only by the inlined parseOnly call, the stated definition grep reproduces exactly once per piece in each file, neither file imports from the other or from tests/helpers/, bugs 0036/0027 are both fixed with 44/44 green at HEAD, coverage-matrix has 0 hits, and non-object-receiver-gate.test.ts's `gate` filename names bug 0027's receiver gate (no pinned count on the cited lines; same-wave d7-01/d7-02 against that file already confirmed) so no carve-out binds; not a duplicate — PTQ-0209 (fixed) cites four other files, and same-wave d7-01 (:229-246 → runtime-belt-probe-harness) / d7-02 (:188-198 → scripted-live-session-harness) cover only the non-object-receiver-gate side, never missing-object-key-rendering.test.ts, and the ledger treats per-file instances as distinct (PTQ-0314/0386/0384/0397); two evidentiary claims are false and should be corrected at ticketing — tests/helpers/e2e-s1.ts:38 (and scripted-live-session-harness.ts:92) already exports a value-for-value identical parseDeps and tool-call-dispatch-harness.ts:81-93 exports NOOP_CHECKPOINT/rootDouble, contradicting "no tests/helpers/ module exports this", and `grep -rl "parseDeps\|rootDouble" docs/bugs/*.md` returns 22 hits, not 0 (none in 0036/0027, none mandating a local harness) — both strengthen rather than defeat the import-instead-of-copy case; fixer note: docs/bugs/0037 cites missing-object-key-rendering.test.ts:322/:334-348/:418 by line, so the dedupe shifts cited lines (harmless, as in prior PTQ-0209 fixes) (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
