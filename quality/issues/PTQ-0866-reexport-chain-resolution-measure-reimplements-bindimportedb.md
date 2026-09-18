---
id: PTQ-0866
title: reexport-chain-resolution.test.ts's measure() reimplements tests/helpers/thetalib-load-harness.ts's bindImportedBodyOverFs instead of importing it
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/reexport-chain-resolution.test.ts:264-268
  - tests/reexport-chain-resolution.test.ts:310-360
  - tests/helpers/thetalib-load-harness.ts:159-260
  - tests/b0449-reexport-chain-enum-unknown-variant.test.ts:144-149
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: drift
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# reexport-chain-resolution.test.ts's measure() reimplements tests/helpers/thetalib-load-harness.ts's bindImportedBodyOverFs instead of importing it

## Observation
tests/reexport-chain-resolution.test.ts declares a module-scope
`NOOP_CHECKPOINT` and a `measure()` driver that parses `/proj/app.theta`,
runs `checkThetaImports`, then builds `createProductionProducerDeps(...)`
with that `NOOP_CHECKPOINT`, a fixed `"inv-1"`/`"tc-1"` id source, and an
inline `resolvePiTool` returning the `"AMBIENT"` sentinel, before calling
`deps.bindPromptConversation(...)`. `tests/helpers/thetalib-load-harness.ts`
already exports `bindImportedBodyOverFs` (and its `/proj/app.theta`
specialisation `bindImportedBody`), which performs the identical
parse→`checkThetaImports`→`createProductionProducerDeps(...)
.bindPromptConversation` sequence with the same `NOOP_CHECKPOINT`, the same
fixed id source, and the same `"AMBIENT"` sentinel (there named
`ambientResolvePiTool`). `tests/b0449-reexport-chain-enum-unknown-variant.test.ts`'s
own header comment states its own copy of this exact sequence is "the
`measure()` harness of tests/reexport-chain-resolution.test.ts, copied to the
helpers this file needs" — naming this reviewed file as the historical
origin of the pattern the helper module now centralises for other callers,
without this file itself having been migrated onto that helper.

## Evidence

tests/reexport-chain-resolution.test.ts:264-268 (re-read immediately before
filing):
```ts
const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};
```

tests/reexport-chain-resolution.test.ts:310-360 (`measure()`'s
parse→check→bind portion, before its own additional `executeBody` call and
result-shaping):
```ts
async function measure(appBody: string, libs: Record<string, string>): Promise<Measured> {
  const app = parseApp(appBody);
  expect(
    app.frontmatter,
    `the importing theta's frontmatter must parse or the load pass reads nothing; diagnostics: ${JSON.stringify(
      app.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
    )}`,
  ).not.toBeNull();
  const frontmatter = app.frontmatter as ParsedFrontmatter;
  const input: ThetaCompositionInput = {
    slashName: "app",
    sourcePath: "/proj/app.theta",
    frontmatter,
    body: app.body,
  };
  const check = await checkThetaImports(input, {
    fs: fakeThetaLibFs(libs),
    parseDeps: parseDeps(),
  });
  const imports: readonly MaterializedImport[] = check.imports;

  const deps = createProductionProducerDeps({
    pi: {} as unknown as ExtensionAPI,
    root: {
      checkpoint: NOOP_CHECKPOINT,
      idSource: {
        newInvocationId: (): string => "inv-1",
        newToolCallId: (): string => "tc-1",
      },
    } as unknown as RuntimeRoot,
    modelRegistry: {} as unknown as ModelRegistry,
    resolvePiTool: (name: string): PiToolDispatch => ({
      toolName: name,
      execute: (): Promise<AgentToolResultEnvelope> =>
        Promise.resolve({ content: [{ type: "text", text: "AMBIENT" }] }),
    }),
  });
  const theta: ThetaCompositionInput = {
    slashName: "app",
    sourcePath: "/proj/app.theta",
    frontmatter,
    body: app.body,
    callableSet: Object.freeze({ entries: new Map() }),
    ...(imports.length > 0 ? { imports } : {}),
  } as ThetaCompositionInput;
  const bindInput: ConversationBindInput = {
    theta,
    args: "",
    ctx: {} as unknown as ExtensionCommandContext,
  };
  const binding = deps.bindPromptConversation(bindInput);
```

tests/helpers/thetalib-load-harness.ts:159-260 (`NOOP_CHECKPOINT`,
`ambientResolvePiTool`, and `bindImportedBodyOverFs` — the canonical export
performing the identical sequence):
```ts
/** A no-op `Checkpoint`: `bindImportedBody`'s cells checkpoint nothing observable. */
const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

/** `resolvePiTool` resolves any name to an "AMBIENT" sentinel — no caller here consults it. */
function ambientResolvePiTool(name: string): PiToolDispatch {
  return {
    toolName: name,
    execute: (): Promise<AgentToolResultEnvelope> =>
      Promise.resolve({ content: [{ type: "text", text: "AMBIENT" }] }),
  };
}
...
export async function bindImportedBodyOverFs(
  appBody: string,
  sourcePath: string,
  fs: FileSystem,
  modelRegistry: ModelRegistry,
): Promise<ImportedBodyBinding> {
  const app = parseThetaDocument(
    { path: sourcePath, bytes: new TextEncoder().encode(`${APP_FRONTMATTER}\n${appBody}`) },
    parseDeps(),
  );
  ...
  const check = await checkThetaImports(input, {
    fs,
    parseDeps: parseDeps(),
  });
  const imports: readonly MaterializedImport[] = check.imports;

  const deps = createProductionProducerDeps({
    pi: {} as unknown as ExtensionAPI,
    root: {
      checkpoint: NOOP_CHECKPOINT,
      idSource: {
        newInvocationId: (): string => "inv-1",
        newToolCallId: (): string => "tc-1",
      },
    } as unknown as RuntimeRoot,
    modelRegistry,
    resolvePiTool: ambientResolvePiTool,
  });
```

tests/b0449-reexport-chain-enum-unknown-variant.test.ts:144-149 (the sibling
file's own header, naming this reviewed file as the pattern's origin):
```ts
// ===========================================================================
// Parse driver, the in-memory `.thetalib` filesystem double, and the runtime
// measurement — the `measure()` harness of
// tests/reexport-chain-resolution.test.ts, copied to the helpers this file
// needs. It parses `/proj/app.theta`, runs the real `checkThetaImports` over an
// in-memory `FileSystem`, then runs the real `executeBody` through the
```

## Why this is a problem
`bindImportedBodyOverFs`/`bindImportedBody` in `tests/helpers/thetalib-load-harness.ts`
were built specifically to centralise this exact "parse → checkThetaImports →
createProductionProducerDeps(...).bindPromptConversation" sequence — the
module's own header names three other files (b0303, b0305, b0306) whose
independent copies it replaced (PTQ-0315), and a fourth (b0361, PTQ-0347) it
was generalised for. A fifth file (b0449) is on record as having copied the
sequence directly from THIS reviewed file rather than from the helper, and
this reviewed file's own copy — the one credited as the origin — was never
itself migrated onto the helper that now exists. The two blocks build the
identical `Checkpoint`, the identical fixed id source, and the identical
`"AMBIENT"`-sentinel `resolvePiTool`, differing only in the hardcoded
`sourcePath`/`modelRegistry` values that `bindImportedBody`'s
`/proj/app.theta` specialisation already supplies as parameters.

## Suggested direction (non-binding, optional)
`bindImportedBody(appBody, libs, modelRegistry)` already assembles
`{ app, check, binding }` from the same inputs `measure()` starts from;
`measure()`'s own contribution — driving `executeBody(app.body,
binding.executeDeps)` and shaping the settled value into `RuntimeOutcome` —
could sit on top of that call instead of rebuilding the parse/check/bind
portion locally.

## False-positive check
- Gate-pin check: `reexport-chain-resolution.test.ts` does not match
  `*gate*.test.ts` or the named gate kin; nothing cited here is a pinned
  count or inventory assertion.
- Recording-double check: `NOOP_CHECKPOINT` and the inline `resolvePiTool`
  are inert stand-ins consulted by no assertion in this file (the file's own
  comment states "no row consults it"), not call-recording MUST-NOT
  witnesses, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "bindImportedBodyOverFs\|measure() harness" docs/bugs/*.md`
  → 0 hits; this finding does not allege a red test or a skip in either
  file — bug 0101's own §Reproduction rows in this file are green at HEAD
  per the file's own header, and this finding contests neither redness nor
  behaviour, only the duplicated harness sequence.
- coverage-matrix/bug-doc citation search: `grep -n "reexport-chain-resolution.test.ts"
  docs/reference/coverage-matrix.md` → 0 hits. Bug 0101's doc names this
  file as a witness for its behavioural rows, never for `measure()`'s
  internal construction; this finding proposes no merge, rename, or deletion
  of any `it()`/`describe()`.
- Coverage-drift check: the claim is about a duplicated harness-construction
  SEQUENCE that exists today in both places, not a missing test path; every
  existing assertion in the file keeps running unchanged regardless of which
  helper builds the binding.
- Prior-filing overlap check: `grep -rl "reexport-chain-resolution" quality/issues/*.md
  quality/resolved/*.md` → PTQ-0222, PTQ-0232, PTQ-0239, PTQ-0434, PTQ-0493,
  PTQ-0554, PTQ-0625, PTQ-0758; none of these cite `NOOP_CHECKPOINT`,
  `measure()`, or `bindImportedBodyOverFs` against this file (PTQ-0493,
  already fixed, covered only this file's separate `fakeThetaLibFs` copy;
  PTQ-0625 covers the same root-cause class but against a different file,
  `tests/b0449-reexport-chain-enum-unknown-variant.test.ts`, and its own text
  identifies this reviewed file as PTQ-0625's un-remediated upstream origin
  rather than a location it already lists).

## Triage
verdict: confirmed — independently re-verified: excerpts reproduce at tests/reexport-chain-resolution.test.ts:264-268/:310-360 and tests/helpers/thetalib-load-harness.ts:159-260; sed-extracted diff of measure()'s parse→checkThetaImports→bindPromptConversation portion against bindImportedBodyOverFs differs only in the hardcoded /proj/app.theta path, fakeThetaLibFs(libs), `{}` modelRegistry and inlined AMBIENT resolvePiTool — exactly what bindImportedBody's specialisation supplies; the file imports only fakeThetaLibFs from the harness (PTQ-0493's fix), never bindImportedBody (importers: b0303/b0305/b0306/b0361 only); measure() is live (~30 call sites), 22/22 green; the one unaccounted divergence (APP_FRONTMATTER `model: "sonnet"` vs harness `anthropic/claude-sonnet-5`) is not load-bearing since frontmatter.model is consulted only on subagent/query/respond paths (production-theta-producer.ts:2440/3903/4076) and no cell here drives one; stated searches reproduce (docs/bugs bindImportedBodyOverFs|measure() harness → 0; coverage-matrix → 0; bug 0101 et al. cite the file as witness but no merge/rename/delete is proposed); all locations under tests/, D7 boilerplate-duplication, no gate/recording-double/red-test carve-out; not a duplicate — PTQ-0625 (b0449), PTQ-0347 (b0361), PTQ-0315 (b0303/5/6) cover disjoint sites and the store rules residual copies at distinct files separately confirmable; one correction: the file (2026-08-20) predates bindImportedBody (2026-09-14), so this is an un-migrated pre-existing copy, not a post-helper reimplementation (triage: claude-fable-5-1)
