---
id: PTQ-0926
title: binder-post-merge-ajv-enforcement.test.ts's thetaInput/driveBinder pair retypes the same builder+wrapper two sibling binder-dispatch files already declare
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/binder-post-merge-ajv-enforcement.test.ts:375-388
  - tests/binder-post-merge-ajv-enforcement.test.ts:424-431
  - tests/binder-forced-tool-dispatch.test.ts:361-370
  - tests/binder-forced-tool-dispatch.test.ts:495-500
  - tests/b0481-forced-tool-choice-model-rejection-degrades.test.ts:205-214
  - tests/b0481-forced-tool-choice-model-rejection-degrades.test.ts:229-240
sites: 3
fix_scope: cross-module
wave: qw20260918092852
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# binder-post-merge-ajv-enforcement.test.ts's thetaInput/driveBinder pair retypes the same builder+wrapper two sibling binder-dispatch files already declare

## Observation
`tests/binder-post-merge-ajv-enforcement.test.ts` declares, module scope, a
`thetaInput(source, sourcePath, slashName)` function that parses a fixture
source and returns a `ThetaCompositionInput` object literal
(`slashName`/`sourcePath`/`frontmatter: doc.frontmatter!`/`body: doc.body`/
`binderModel: "binder-model"`), plus a `driveBinder(deps, theta,
slashArguments)` wrapper whose body is exactly `return deps.runBinder({
theta, args: slashArguments, ctx: ctxDouble() });` and whose return type is
spelled out as the literal `Promise<{ readonly bound: boolean; readonly
args?: Readonly<Record<string, unknown>> }>`. `tests/binder-forced-tool-
dispatch.test.ts` and `tests/b0481-forced-tool-choice-model-rejection-
degrades.test.ts` each declare their own `thetaInput` and `driveBinder`
following the identical shape (parse → build the same five/four-field
composition input; wrap `deps.runBinder(...)` with the same spelled-out
return type), differing only in whether `slashName`/`sourcePath`/
`binderModel`/`args` are parameters or file-local literals. `grep -rln
"function driveBinder\b" tests --include="*.test.ts"` returns exactly these
three files.

## Evidence
tests/binder-post-merge-ajv-enforcement.test.ts:375-388:
```ts
function thetaInput(
  source: string,
  sourcePath: string,
  slashName: string,
): ThetaCompositionInput {
  const doc = parse(source);
  return {
    slashName,
    sourcePath,
    frontmatter: doc.frontmatter!,
    body: doc.body,
    binderModel: "binder-model",
  };
}
```

tests/binder-post-merge-ajv-enforcement.test.ts:424-431:
```ts
async function driveBinder(
  deps: ReturnType<typeof createProductionProducerDeps>,
  theta: ThetaCompositionInput,
  slashArguments: string,
): Promise<{ readonly bound: boolean; readonly args?: Readonly<Record<string, unknown>> }> {
  return deps.runBinder({ theta, args: slashArguments, ctx: ctxDouble() });
}
```

tests/binder-forced-tool-dispatch.test.ts:361-370 (same parse→object-literal shape, `slashName`/`binderModel` hardcoded instead of parameterised):
```ts
function thetaInput(source: string, sourcePath: string): ThetaCompositionInput {
  const doc = parse(source);
  return {
    slashName: "code-review",
    sourcePath,
    frontmatter: doc.frontmatter!,
    body: doc.body,
    binderModel: "binder-model",
  };
}
```

tests/binder-forced-tool-dispatch.test.ts:495-500 (same wrapper, same spelled-out return type, `args` a file constant instead of a parameter):
```ts
async function driveBinder(
  deps: ReturnType<typeof createProductionProducerDeps>,
  theta: ThetaCompositionInput,
): Promise<{ readonly bound: boolean; readonly args?: Readonly<Record<string, unknown>> }> {
  return deps.runBinder({ theta, args: BINDER_ARGS, ctx: ctxDouble() });
}
```

tests/b0481-forced-tool-choice-model-rejection-degrades.test.ts:205-214 (same shape, `slashName`/`sourcePath` hardcoded, `binderModel` optional):
```ts
function thetaInput(source: string, opts?: { binderModel?: string }): ThetaCompositionInput {
  const doc = parse(source);
  return {
    slashName: "probe",
    sourcePath: "/theta/probe.theta",
    frontmatter: doc.frontmatter!,
    body: doc.body,
    ...(opts?.binderModel !== undefined ? { binderModel: opts.binderModel } : {}),
  };
}
```

tests/b0481-forced-tool-choice-model-rejection-degrades.test.ts:229-240 (same return-type literal, `deps`/`theta` built inline instead of taken as parameters):
```ts
async function driveBinder(): Promise<{
  readonly bound: boolean;
  readonly args?: Readonly<Record<string, unknown>>;
}> {
  const theta = thetaInput(BINDER_THETA, { binderModel: "binder-model" });
  const deps = createProductionProducerDeps({
    pi: piDouble(),
    root: rootDouble(),
    modelRegistry: registryDouble([ANTHROPIC_BINDER_MODEL]),
  });
  return deps.runBinder({ theta, args: "the async module for the team", ctx: ctxDouble(undefined) });
}
```

Exact search: `grep -rln "function thetaInput" tests --include="*.test.ts"` returns four files (the fourth, `composition-producer.test.ts:349`, builds its `ThetaCompositionInput` from an AST-builder body rather than a parsed source and is a different shape, not counted here). `grep -rln "function driveBinder\b" tests --include="*.test.ts"` returns exactly the three files cited above.

## Why this is a problem
The same `ThetaCompositionInput` builder (parse the source, assemble the same
five fields) and the same `runBinder(...)`-wrapping function, spelled with
the identical hand-typed return type `Promise<{ readonly bound: boolean;
readonly args?: Readonly<Record<string, unknown>> }>`, are typed three
separate times across three files that all drive the same production seam
(`ProductionThetaProducer.runBinder()` over a mocked `complete()`). The
divergences among the three copies are only which fields are parameters
versus file-local literals — the underlying assembly and the wrapper's
return-type annotation are the same code written three times. `tests/
helpers/scripted-live-session-harness.ts` already centralises the sibling
pieces of this same harness (`parse`, `parseDeps`, `rootDouble`,
`producerWithCapture`, `binderProducerWithCapture`) but exports neither
`thetaInput` nor a `driveBinder` wrapper, so each of the three files retyped
this piece independently rather than importing one shared version.

## Suggested direction (non-binding, optional)
`tests/helpers/scripted-live-session-harness.ts` is the module that already
centralises this exact harness's other pieces (`parse`/`rootDouble`/
`producerWithCapture`); it is the natural home a `thetaInput`/`driveBinder`
export parameterised over `slashName`/`sourcePath`/`binderModel`/`args`
would sit beside, observed from where the sibling pieces already live rather
than designed here.

## False-positive check
- Gate-pin check: none of the three files match `*gate*.test.ts` or the
  named gate kin; the cited code is harness/fixture declaration, not a
  pinned count or inventory assertion.
- Recording-double check: `thetaInput`/`driveBinder` build a composition
  input and drive one binder pass to a value; neither is a fake recording
  calls to back a "never called" witness, so the carve-out does not apply.
- docs/bugs/ signature search: `grep -rn "binder-post-merge-ajv-enforcement\|binder-forced-tool-dispatch\|b0481-forced-tool-choice-model-rejection-degrades" docs/bugs/*.md` finds multiple hits (bug 0011, 0064, 0066, 0099, 0165, 0166, 0174, 0181, …), every one naming the FILE as a whole ("tests/binder-post-merge-ajv-enforcement.test.ts pins it", "`tests/binder-forced-tool-dispatch.test.ts` (new — 13 …)") as a witness or regression surface — none cites the internal `thetaInput`/`driveBinder` declarations as a documented correct-reason red for this harness code.
- coverage-matrix/bug-doc citation search: `grep -n "binder-post-merge-ajv-enforcement\|binder-forced-tool-dispatch\|b0481-forced-tool-choice-model-rejection-degrades" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any file or `it()`/`describe()`, only that the shared builder/wrapper code could be imported rather than retyped.
- Prior-finding check: `grep -rn "driveBinder" quality/` (issues, resolved, intake) → 0 hits before this filing; PTQ-0542 (open) and PTQ-0454/PTQ-0628 (resolved) cover different pieces of this same harness lineage (`rootDouble`/AJV construction, and the `CapturedNote`/`parseDeps`/`parse`/`ctxDouble`/`noteChannelEntries`/`TWO_PARAM_THETA` sextet respectively) but none of their locations lists `thetaInput` or `driveBinder`, so this is a new, previously uncited root cause in the same family, not a re-file.
- Coverage check: the claim is entirely about a repeated harness-code DEFINITION; each file's own tests exercise its own copy of the seam, so this is not a coverage-gap claim.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all six excerpts reproduce byte-for-byte at the cited lines; mktemp diffs of the three `thetaInput` copies differ only in which of slashName/sourcePath/binderModel is a parameter vs literal (same parse→five-field `ThetaCompositionInput` literal) and the two parameterised `driveBinder` copies differ only in `slashArguments` param vs `BINDER_ARGS` const, while all three spell the same hand-typed `Promise<{ readonly bound: boolean; readonly args?: ... }>` that is a structural retype of the exported `BinderRunResult` (src/extension/theta-composition-producer.ts:152, already imported by six other tests) — extra evidence the filing did not claim; both stated greps reproduce (`function driveBinder\b` → exactly these 3 files; `function thetaInput` → 4, composition-producer's AST-builder shape correctly excluded); no tests/helpers module exports either helper (scripted-live-session-harness exports parse/parseDeps/rootDouble/producerWithCapture/binderProducerWithCapture only); all copies live (thetaInput 6/4/3 and driveBinder 7/26/6 call sites; 43/43 pass at HEAD, no skips); all locations under tests/, D7 boilerplate-duplication class, no gate/recording-double/documented-red/coverage-matrix carve-out (coverage-matrix → 0 hits, bug docs cite files as wholes); not a duplicate — PTQ-0454/0628 (resolved) name the parseDeps/parse/ctxDouble/CapturedNote sextet, PTQ-0542 the rootDouble/AJV RuntimeRoot, PTQ-0452 b0481's piDouble/rootDouble; PTQ-0454's stale :376-399/:406-436 ranges now overlap these lines only because that fix shifted content, and none names thetaInput or driveBinder; PTQ-0661's driveIfRegistered inlines a ThetaCompositionInput in two params-default-* files — sibling lineage, different files and root cause; form nit: `sites: 3` counts files against six cited excerpts (triage: claude-fable-5-1)
