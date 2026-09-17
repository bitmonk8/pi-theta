---
id: PTQ-0625
title: b0449's measure() reimplements bindImportedBodyOverFs/bindImportedBody (and their fakeThetaLibFs) instead of importing them
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0449-reexport-chain-enum-unknown-variant.test.ts:165-199
  - tests/b0449-reexport-chain-enum-unknown-variant.test.ts:201-205
  - tests/b0449-reexport-chain-enum-unknown-variant.test.ts:223-260
  - tests/helpers/thetalib-load-harness.ts:74-102
  - tests/helpers/thetalib-load-harness.ts:169-178
  - tests/helpers/thetalib-load-harness.ts:217-269
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0449's measure() reimplements bindImportedBodyOverFs/bindImportedBody (and their fakeThetaLibFs) instead of importing them

## Observation
`tests/helpers/thetalib-load-harness.ts` exports `bindImportedBody(appBody,
libs, modelRegistry)` (a `fakeThetaLibFs`-at-`/proj/app.theta` specialisation
of `bindImportedBodyOverFs`): it parses the importing theta, drives the real
`checkThetaImports` over an in-memory `.thetalib` filesystem, builds
`createProductionProducerDeps(...)` with a no-op `Checkpoint` and an
"AMBIENT"-sentinel `resolvePiTool`, and calls
`deps.bindPromptConversation(bindInput)`, returning `{ app, check, binding }`
for the caller to drive `executeBody(app.body, binding.executeDeps)` itself.
`tests/b0449-reexport-chain-enum-unknown-variant.test.ts`'s `measure()`
reimplements this entire sequence locally — including its own copy of
`fakeThetaLibFs`, its own `NOOP_CHECKPOINT`, and its own inline
`resolvePiTool` returning the identical `"AMBIENT"` sentinel text — instead of
calling `bindImportedBody` and then driving `executeBody` on the result. The
file's own header comment states this was a deliberate copy: "the `measure()`
harness of tests/reexport-chain-resolution.test.ts, copied to the helpers
this file needs."

## Evidence
tests/b0449-reexport-chain-enum-unknown-variant.test.ts:201-205 (NOOP_CHECKPOINT):
```ts
const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};
```
identical to tests/helpers/thetalib-load-harness.ts's own `NOOP_CHECKPOINT`
(same shape and body, module scope, above `bindImportedBodyOverFs`).

tests/b0449-reexport-chain-enum-unknown-variant.test.ts:223-260 (measure(),
the reimplemented driver):
```ts
async function measure(appBody: string, libs: Record<string, string>): Promise<Measured> {
  const app = parseApp(appBody);
  expect(
    app.frontmatter,
    `PRECONDITION: the importing theta's frontmatter must parse or the load pass reads nothing; diagnostics: ${JSON.stringify(
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
```

tests/helpers/thetalib-load-harness.ts:217-256 (bindImportedBodyOverFs, the
canonical export doing the identical sequence):
```ts
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
  expect(
    app.frontmatter,
    `the importing theta's frontmatter must parse or the load pass reads nothing; diagnostics: ${JSON.stringify(
      app.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
    )}`,
  ).not.toBeNull();
  const frontmatter = app.frontmatter as ParsedFrontmatter;
  const input: ThetaCompositionInput = {
    slashName: "app",
    sourcePath,
    frontmatter,
    body: app.body,
  };
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
The two blocks build the same `createProductionProducerDeps` call (same
`NOOP_CHECKPOINT`, same fixed `"inv-1"`/`"tc-1"` id source, same `"AMBIENT"`
sentinel), the same `ThetaCompositionInput`/`ConversationBindInput` shape, and
end by calling `deps.bindPromptConversation(bindInput)`. b0449 additionally
inlines the module-scope `fakeThetaLibFs` (cited in the companion finding
against b0445, tests/helpers/thetalib-load-harness.ts:74-102) that
`bindImportedBodyOverFs`'s specialisation `bindImportedBody` already supplies.

## Why this is a problem
The helper module's own header documents that this exact "parse the
importer, run checkThetaImports, bind through
createProductionProducerDeps(...).bindPromptConversation" sequence
independently recurred across tests/b0303-imported-fn-body-declaring-scope.test.ts,
tests/b0305-enum-alias-identity.test.ts and
tests/b0306-imported-enum-wire-values.test.ts (PTQ-0315) and was centralised
for exactly that reason. b0449 grows a fourth, unremediated copy of the same
sequence (plus its own copy of the `fakeThetaLibFs` fixture), maintained
independently of the helper the sibling bug files in this same cluster
(b0448, b0450) already import.

## Suggested direction (non-binding, optional)
`bindImportedBody`/`bindImportedBodyOverFs` in tests/helpers/thetalib-load-harness.ts
already assemble everything `measure()` builds up to `binding`; the natural
home for the "parse → checkThetaImports → bindPromptConversation" portion of
`measure()` is that existing export, leaving `measure()` to add only its own
`executeBody` call and settlement-shaping.

## False-positive check
Gate-pin: not a `*gate*.test.ts` file. Recording-double: `fakeThetaLibFs` is a
fail-closed resource stub, not a call-recording MUST-NOT witness — the
recording-double carve-out does not apply. docs/bugs/ search: grepped
"bindImportedBody" and "measure()" scoped to docs/bugs/ — no hit; not a
documented correct-reason red. coverage-matrix/bug-doc citation search:
grepped "b0449-reexport-chain-enum-unknown-variant.test.ts" across
docs/reference/coverage-matrix.md and docs/bugs/*.md — no hit; no
merge/rename/delete disclosure is owed. This finding does not propose a
coverage change — it observes an existing helper the file could call instead
of reimplementing.

## Triage
verdict: confirmed — independently re-diffed every cited range (b0449:165-199 fakeThetaLibFs vs harness:85-113 differ only in a hasOwnProperty guard on readBytes; NOOP_CHECKPOINT byte-identical; measure():223-260 vs bindImportedBodyOverFs:217-256 differ only in the hardcoded /proj/app.theta path, inlined `{}` modelRegistry and inlined AMBIENT resolvePiTool, all of which bindImportedBody's specialisation already supplies), confirmed the frontmatter `model:` divergence is not load-bearing (frontmatter.model is read at bind time only in spawnSubagentConversation :2413, no b0449 cell spawns; b0305/b0306 drive the helper with the same `{}` registry/ctx), vitest 4/4 green, b0449 absent from the harness's 11 importers, same class/helper as human-confirmed PTQ-0347 (b0361) at a different site so not a duplicate; two corrections on record: bindImportedBody landed 2026-09-14 after b0449 (2026-09-05) so the copy predates the helper rather than "grows" past it, and docs/bugs/0449:257 DOES cite this file as its witness (the FP-check's "no hit" is wrong) — but no merge/rename/delete is proposed so no disclosure is owed (triage: claude-fable-5-1)
