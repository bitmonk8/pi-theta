---
id: PTQ-0910
title: call-with-clause-erratum-b's local compose() re-implements the canonical runProductionLoad harness
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/call-with-clause-erratum-b.test.ts:238-267
  - tests/helpers/production-load-harness.ts:52-97
sites: 1
fix_scope: localized
wave: qw20260918075903
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
fix_skips: 1
---

# call-with-clause-erratum-b's local compose() re-implements the canonical runProductionLoad harness

## Observation
`tests/call-with-clause-erratum-b.test.ts` declares a module-local
`compose(libBody)` function that plants a temp workspace, builds a fake
`ExtensionAPI` (`getFlag`, `getCommands`, `sendMessage`, `sendUserMessage`,
`getActiveTools`, `setActiveTools`) and a fake `ExtensionContext`
(`cwd`, `modelRegistry.getAvailable`, `ui.notify` pushing into a
`notifications` array), then calls the shipped `discoverAndComposeFixtures(pi,
ctx)` and returns `{ slugs, notifications }` from `fixtures.map(f =>
f.slashName)`. `tests/helpers/production-load-harness.ts` already exports
`runProductionLoad(cwd, opts)`, whose `pi`/`ctx` double and
`discoverAndComposeFixtures(pi, ctx)` call are the identical shape, differing
from the local copy only by an added `diagnosticLines` stderr capture the
local copy omits and option-driven `thetaFlag`/`piOwnedCommands`/
`availableModels` defaults the local copy hard-codes to their default values.

## Evidence

tests/call-with-clause-erratum-b.test.ts:238-267:
```ts
async function compose(libBody: string): Promise<{ readonly slugs: string[]; readonly notifications: string[] }> {
    const cwd = mkdtempSync(join(tmpdir(), "rfc0009-erratum-b-"));
    const thetaDir = join(cwd, ".pi", "theta");
    mkdirSync(thetaDir, { recursive: true });
    workspace = finishWorkspace(cwd);
    writeFileSync(join(thetaDir, "lib.thetalib"), libBody, "utf8");
    writeFileSync(
      join(thetaDir, "caller.theta"),
      ["---", "mode: subagent", "---", 'import { lib_fn } from "./lib.thetalib"', 'let r = lib_fn("a") with { cwd: "sub" }', "@`hi ${r}`", ""].join("\n"),
      "utf8",
    );
    const notifications: string[] = [];
    const pi = {
      getFlag: (): undefined => undefined,
      getCommands: (): readonly unknown[] => [],
      sendMessage: (): void => {},
      sendUserMessage: (): void => {},
      getActiveTools: (): readonly string[] => [],
      setActiveTools: (): void => {},
    } as unknown as ExtensionAPI;
    const ctx = {
      cwd: workspace.cwd,
      modelRegistry: { getAvailable: (): readonly unknown[] => [] },
      ui: {
        notify: (message: string): void => {
          notifications.push(message);
        },
      },
    } as unknown as ExtensionContext;
    const fixtures: readonly ThetaFixture[] = await discoverAndComposeFixtures(pi, ctx);
    return { slugs: fixtures.map((f) => f.slashName), notifications };
  }
```

tests/helpers/production-load-harness.ts:52-97 (the canonical helper this
duplicates the shape of):
```ts
export async function runProductionLoad(
  cwd: string,
  opts: ProductionLoadOptions = {},
): Promise<LoadOutcome> {
  const notifications: string[] = [];
  const chunks: string[] = [];
  const pi = {
    getFlag: (name: string): string | undefined => (name === "theta" ? opts.thetaFlag : undefined),
    getCommands: (): readonly { name: string; source: string }[] => opts.piOwnedCommands ?? [],
    sendMessage: (): void => {},
    sendUserMessage: (): void => {},
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd,
    modelRegistry: { getAvailable: (): readonly unknown[] => opts.availableModels ?? [] },
    ui: {
      notify: (message: string, _type: "error"): void => {
        notifications.push(message);
      },
    },
  } as unknown as ExtensionContext;
  ...
  const fixtures: readonly ThetaFixture[] = await discoverAndComposeFixtures(
    pi,
    ctx,
  ).finally(() => {
    process.stderr.write = write;
  });

  return {
    registered: fixtures.map((f) => f.slashName),
    notifications,
    diagnosticLines: chunks.join("").split(/\r?\n/).filter((line) => line.length > 0),
    fixtures,
  };
}
```
(full function at tests/helpers/production-load-harness.ts:52-97; the excerpt
elides only the stderr-interposition body between the `ctx` literal and the
`discoverAndComposeFixtures` call, which is orthogonal to the duplicated
`pi`/`ctx`/call/mapping shape.)

## Why this is a problem
The `pi` object's six methods (`getFlag`, `getCommands`, `sendMessage`,
`sendUserMessage`, `getActiveTools`, `setActiveTools`) and the `ctx` object's
three members (`cwd`, `modelRegistry.getAvailable`, `ui.notify` pushing a
message string into an array) are, method-for-method, the same fake host
`runProductionLoad` already builds and exports for exactly this call
(`discoverAndComposeFixtures(pi, ctx)` followed by
`fixtures.map(f => f.slashName)`). The one behavioural difference — no
`opts.thetaFlag`/`opts.piOwnedCommands`/`opts.availableModels`
parameterisation and no stderr `diagnosticLines` capture — is exactly the
default-and-a-subset the canonical helper's own optional `opts` argument and
`LoadOutcome.registered`/`.notifications` fields already cover; calling
`runProductionLoad(workspace.cwd)` and reading `.registered`/`.notifications`
would produce the same observable this local copy computes.

## Suggested direction (non-binding, optional)
Building this test's `compose()` on top of the already-imported-elsewhere
`runProductionLoad` (reading `.registered` where this file reads `.slugs`) is
the direct path; the file already imports `finishWorkspace` from the sibling
canonical `tests/helpers/compose-workspace-harness.ts`, so importing a second
`tests/helpers/` module is an established pattern in this file.

## False-positive check
Gate-pin check: the file is not `*gate*.test.ts` or a kin pattern, so the
census/pin-gate carve-out does not apply. Recording-double check: `notes`/
`notifications` here are values read for positive assertions
(`outcome.slugs`/`outcome.notifications.some(...)`), not a never-called MUST-NOT
witness, so the recording-double carve-out does not apply. docs/bugs/ search:
`grep -rn "call-with-clause-erratum-b" docs/bugs/*.md
docs/reference/coverage-matrix.md` returns no hits, so this test is not pinned
by name in a bug doc's witness list or the coverage matrix; no merge/rename/
delete is proposed regardless. Coverage check: no claim is made that any
behaviour is untested; this is a claim about a helper already existing and
already imported by call sites elsewhere in tests/ for the same call.

## Triage
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim (erratum-b:238-267 `compose()`, production-load-harness.ts:52-97 `runProductionLoad`), a scratch diff of the two `const pi = {`…`ExtensionContext;` blocks differs ONLY by the three option-driven defaults (`getFlag`→`opts.thetaFlag`, `getCommands`→`opts.piOwnedCommands ?? []`, `getAvailable`→`opts.availableModels ?? []`) that collapse to the local copy's hard-coded `undefined`/`[]`/`[]` when `opts` is omitted, the `cwd` binding name, and the canonical's ignored `_type` param — so `runProductionLoad(workspace.cwd)` reading `.registered`/`.notifications` is observably identical and the added stderr interposition drops no need; the local copy is live (called by both `it()`s at :272/:278, 12/12 green at HEAD), the file imports three tests/helpers modules but not production-load-harness (grep → 0), the helper has 10 test importers / 50 `runProductionLoad(` call sites, the stated `docs/bugs` + coverage-matrix search → 0 reproduces, both locations under tests/, D7 copy-paste-double class, no gate/recording-double/red-test carve-out applies; not a duplicate — the only prior finding on this helper in this file, resolved PTQ-0551, scoped itself to the finishWorkspace plant half and explicitly excluded the `pi`/`ctx` double, and no open runProductionLoad issue (0210/0240/0517/0593/0600/0635/0669/0717/0722/0723/0739/0820/0850) cites this file (triage: claude-fable-5-1)

## Fix attempts
- qw20260919162231: skipped — [PTQ-0914-bug0058-bug0100-local-parse-reimplements-parsedoc.md] PTQ-0914: Replaced both local parse wrappers with shared parseDoc; all tests and assertions retained. / PTQ-0916: Reused shared REGISTRY and RegistryRow; retained local message readers as triage permits. / PTQ-0917: Strengthened the assertion to require exactly one error note, retaining diagnostic and envelope checks. / PTQ-0918: Reused plantThetaWorkspace and disposeWorkspace in both files; fixture writes unchanged. No tests deleted. Required gate passed for all four issues: TypeScript clean, 689 test files and 11,586 tests passed. || [PTQ-0919-assertframestointernalerror-reimplements-assertinternalerror.md] PTQ-0919: Both framing helpers delegate to assertInternalError, preserving all four checks; no tests deleted or renamed. / PTQ-0921: Reused the canonical parse-registry reader and message lookup, retaining the non-empty-message guard; no tests deleted or renamed. / PTQ-0922: Replaced the inline pi/ctx double with makeHarness; discovery assertions remain unchanged; no tests deleted or renamed. / PTQ-0926: Shared thetaInput and driveBinder across all three files, preserving per-file parsing, contexts, and fixtures; no tests deleted or renamed. Required gate passed for all four fixes: tsc clean, 689 test files and 11,586 tests passed. ||
