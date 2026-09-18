---
id: PTQ-0661
title: Runtime-tier runBinder drive harness (rootDouble/producerWithCapture/driveIfRegistered) re-declared near-verbatim across two test files
lens: D7
status: open
verdict: confirmed
locations:
  - tests/params-default-trailing-residue-refusal.test.ts:856-1073
  - tests/params-default-unary-minus-non-numeric-refusal.test.ts:814-1030
sites: 2
fix_scope: module
d4_class: clone
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# Runtime-tier runBinder drive harness (rootDouble/producerWithCapture/driveIfRegistered) re-declared near-verbatim across two test files

## Observation
`tests/params-default-trailing-residue-refusal.test.ts` (lines 856-1073, group E) and `tests/params-default-unary-minus-non-numeric-refusal.test.ts` (lines 814-1030, group F) each independently declare the same ~220-line runtime-tier harness: a `CapturedNote` interface, `parseDepsForDrive()`, `realAjvValidator()`, `rootDouble()` (an in-memory `RuntimeRoot` double with a noop checkpoint, fixed `idSource`, zero clock, real AJV validator and a rejecting-on-miss `fileSystem.readBytes`), `producerWithCapture()` (wires `createProductionProducerDeps` with a capturing `pi.sendMessage` and a fixed one-model `modelRegistry`), `scriptOkEnvelopeOmittingDefault()` (scripts the mocked `complete()` reply to name whichever forced tool the captured call attached), a `DriveOutcome` interface, and `driveIfRegistered()` (parses a fixture, returns early when the frontmatter is null, otherwise drives one real `runBinder` pass and reports a `summary` string). The two copies are identical function-for-function; the only substantive difference found is one line rendering the bound value (`JSON.stringify` vs `String`) and the row data (`BOUND_ROWS`, `DRIVE_BODY`) each file supplies.

## Evidence

tests/params-default-trailing-residue-refusal.test.ts:930-948
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
```

tests/params-default-unary-minus-non-numeric-refusal.test.ts:889-907 — byte-identical to the excerpt above (confirmed by direct comparison of the two `realAjvValidator` / `rootDouble` bodies).

tests/params-default-trailing-residue-refusal.test.ts:996-1020 (`scriptOkEnvelopeOmittingDefault`):
```ts
function scriptOkEnvelopeOmittingDefault(): void {
  scripted.replyFor = (context) => {
    const tools = (context as { readonly tools?: ReadonlyArray<{ readonly name?: unknown }> })
      .tools;
    const toolName = tools?.[0]?.name;
    if (typeof toolName !== "string") {
      throw new Error(
        "the binder call attached no forced tool, so no ToolCall reply can name it — the harness cannot script an envelope",
      );
    }
    return {
      role: "assistant",
      content: [
        {
          type: "toolCall",
          id: "tc-1",
          name: toolName,
          arguments: { envelope: { kind: "ok", args: { topic: "hello" } } },
        },
      ],
      stopReason: "toolUse",
      timestamp: 0,
    };
  };
}
```
tests/params-default-unary-minus-non-numeric-refusal.test.ts:955-979 — byte-identical to the excerpt above.

tests/params-default-trailing-residue-refusal.test.ts:1039-1073 (`driveIfRegistered`):
```ts
async function driveIfRegistered(name: string, source: string): Promise<DriveOutcome> {
  scripted.calls = [];
  scriptOkEnvelopeOmittingDefault();
  const thetaSource: ThetaSource = {
    path: `${name}.theta`,
    bytes: new TextEncoder().encode(source),
  };
  const doc = parseThetaDocument(thetaSource, parseDepsForDrive());
  const diagnostics = doc.diagnostics.map((d) => `${d.severity} ${d.code}`);
  if (doc.frontmatter === null) {
    return { summary: "refused at load", diagnostics, binderCalls: 0, notes: [] };
  }
  const { deps, notes } = producerWithCapture();
  const theta: ThetaCompositionInput = {
    slashName: name,
    sourcePath: `/theta/${name}.theta`,
    frontmatter: doc.frontmatter,
    body: doc.body,
    binderModel: "binder-model",
  };
  const result = await deps.runBinder({
    theta,
    args: "hello",
    ctx: {} as unknown as ExtensionCommandContext,
  });
  const channel = notes.filter((n) => n.customType === SYSTEM_NOTE_CHANNEL).map((n) => n.content);
  return {
    summary: `registered and driven; bound=${String(result.bound)}; p=${JSON.stringify(
      result.args?.["p"],
    )}; binder calls=${scripted.calls.length}`,
    diagnostics,
    binderCalls: scripted.calls.length,
    notes: channel,
  };
}
```
tests/params-default-unary-minus-non-numeric-refusal.test.ts:998-1029 differs only in the render call inside the returned `summary` template (`String(result.args?.["p"])` in place of `JSON.stringify(result.args?.["p"], ...)`); every other line is identical, including the parse/route/runBinder sequence and the `channel`/return shape.

The enclosing `describe` blocks that drive this harness are also structurally identical: both files loop `BOUND_ROWS` asserting `outcome.summary === "refused at load"`, the same diagnostics/binderCalls/notes shape, then run one `NUMERIC_FENCE` control asserting the identical `"registered and driven; bound=true; p=-1; binder calls=1"` string and the identical `Running /${name}: topic=hello, p=-1 (default)` echo (tests/params-default-trailing-residue-refusal.test.ts:1083-1141; tests/params-default-unary-minus-non-numeric-refusal.test.ts:1043-1101).

## Why this is a problem
Two files each carry their own ~220-line copy of the same runtime-tier "parse, then conditionally drive one real `runBinder` pass" harness — the `RuntimeRoot` double, the AJV wiring, the scripted forced-tool reply and the outcome-summarising drive function — rather than sharing one. A change to any part of this sequence (the AJV `slugOf` construction, the scripted reply shape, the outcome's `summary` rendering) needs the identical edit made twice inside this file set alone.

## Suggested direction (non-binding, optional)
A shared helper (e.g. alongside `tests/helpers/production-load-harness.ts`, which already centralises a sibling "run the shipped composition root over a fake host" harness) could hold `CapturedNote`, `parseDepsForDrive`, `realAjvValidator`, `rootDouble`, `producerWithCapture`, `scriptOkEnvelopeOmittingDefault`, `DriveOutcome` and `driveIfRegistered` once, parameterised by the fixture-source map and the scripted `complete()` mock each caller already supplies.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate kin; not applicable.
- Recording-double check: `producerWithCapture`'s `notes` array records `pi.sendMessage` calls for a positive assertion (the success echo), and `scripted.calls` records binder-call count for a positive `binderCalls: 0` / `binderCalls: 1` assertion — these are recording doubles used for real observables, not vacuous MUST-NOT witnesses being second-guessed here; the finding is about the harness declaration being copy-pasted, not about the assertion style.
- docs/bugs/ signature search: this is a structural duplication fact about passing test scaffolding, not a documented correct-reason-red posture; no docs/bugs/ citation changes that.
- coverage-matrix / bug-doc citation search: `grep -rn "params-default-trailing-residue-refusal\|params-default-unary-minus-non-numeric-refusal" docs/reference/coverage-matrix.md docs/bugs/` hits docs/bugs/0165 and 0166, which cite specific cells (e.g. "cell e3 of tests/params-default-unary-minus-non-numeric-refusal.test.ts") by file and cell label. This finding does not propose to merge, rename or delete either file or any cited cell; it proposes only that the shared harness functions move to a common helper module, leaving every cited row's label, RHS and assertion untouched.
- Confirmed this is not a coverage claim: the finding is about code that exists (the duplicated harness), not about anything untested.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: a line-range diff of tests/params-default-trailing-residue-refusal.test.ts:856-1073 (218 lines) against tests/params-default-unary-minus-non-numeric-refusal.test.ts:814-1030 (217 lines) shows every harness function (parseDepsForDrive, realAjvValidator, rootDouble, producerWithCapture, scriptOkEnvelopeOmittingDefault, driveIfRegistered, CapturedNote/DriveOutcome) byte-identical except the per-file DRIVE_BODY/BOUND_ROWS/NUMERIC_FENCE data, four comment lines and the one `JSON.stringify` vs `String` render call; `function driveIfRegistered` / `scriptOkEnvelopeOmittingDefault` grep to exactly these two files and no tests/helpers/ module exports them; both files pass at HEAD (174/174) so no correct-reason-red carve-out, neither is a gate test, the recording doubles are used for positive assertions and are not what is challenged, and docs/bugs/0066·0165·0166·0175·0239 cite these files by cell label only (no merge/rename/delete proposed); in-scope D7 boilerplate-duplication, distinct root cause from resolved PTQ-0209 (minimal NOOP_CHECKPOINT/rootDouble/producer trio), PTQ-0384 and PTQ-0397 (other file pairs) — the stray `d4_class: clone` field is harmless template noise (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
