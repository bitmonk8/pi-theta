---
id: PTQ-1345
title: call-with-clause-static-checks.test.ts row-13d cell hand-rolls the workspace-plant + fake-host + discoverAndComposeFixtures sequence that tests/helpers/production-load-harness.ts's runProductionLoad already centralises, including within this same review scope
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/call-with-clause-static-checks.test.ts:137-179
  - tests/helpers/production-load-harness.ts:81-136
  - tests/call-with-clause-erratum-b.test.ts:51
sites: 1
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# call-with-clause-static-checks.test.ts row-13d cell hand-rolls the workspace-plant + fake-host + discoverAndComposeFixtures sequence that tests/helpers/production-load-harness.ts's runProductionLoad already centralises, including within this same review scope

## Observation
The row-13d cell in `tests/call-with-clause-static-checks.test.ts` hand-builds a temp workspace (`mkdtempSync`/`mkdirSync`/`writeFileSync` of `.pi/settings.json`), a hand-rolled `pi`/`ctx` fake host recording `ui.notify` calls into a local `notifications` array, and then calls `discoverAndComposeFixtures(pi, ctx)` directly. `tests/helpers/production-load-harness.ts` exports `runProductionLoad(cwd, opts)`, whose stated purpose (its own header comment) is exactly this: "a fake, no-UI `ExtensionAPI`/`ExtensionContext` pair sized to `discoverAndComposeFixtures`… reshape of the result into `{registered, notifications, diagnosticLines}`", plus the temp-workspace plant/dispose lifecycle. The sibling file in this same review scope, `tests/call-with-clause-erratum-b.test.ts`, imports and uses `runProductionLoad` for its own composition-level cell instead of reimplementing the host.

## Evidence
`tests/call-with-clause-static-checks.test.ts:137-179` (the row-13d cell, workspace + fake pi/ctx + direct call):
```ts
describe("RFC 0009 static checks — row 13d: unknown-identifier precedence over the classification loop (composition-level)", () => {
  let workspaceDir: string;
  ...
  it("`ghost(1) with { cwd: t }` ...", async () => {
    workspaceDir = mkdtempSync(join(tmpdir(), "rfc0009-13d-"));
    const thetaDir = join(workspaceDir, ".pi", "theta");
    mkdirSync(thetaDir, { recursive: true });
    writeFileSync(join(workspaceDir, ".pi", "settings.json"), "{}", "utf8");
    writeFileSync(
      join(thetaDir, "ghostcall.theta"),
      ["---", "mode: subagent", "---", 'let _ = ghost(1) with { cwd: "sub" }', "@`hi`"].join("\n"),
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
      cwd: workspaceDir,
      modelRegistry: { getAvailable: (): readonly unknown[] => [] },
      ui: {
        notify: (message: string): void => {
          notifications.push(message);
        },
      },
    } as unknown as ExtensionContext;
    const fixtures: readonly ThetaFixture[] = await discoverAndComposeFixtures(pi, ctx);
```

`tests/helpers/production-load-harness.ts:81-131` (the canonical helper providing the identical shape — `pi` with `getFlag`/`getCommands`/`sendMessage`/`sendUserMessage`/`getActiveTools`/`setActiveTools`, `ctx` with `cwd`/`modelRegistry.getAvailable`/`ui.notify` pushing to a `notifications` array, one `discoverAndComposeFixtures(pi, ctx)` call):
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
    sendMessage: opts.sendMessage ?? ((): void => {}),
    sendUserMessage: (): void => {},
    registerMessageRenderer: (): void => {},
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
    ...
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd,
    hasUI: opts.hasUI,
    modelRegistry: { getAvailable: (): readonly unknown[] => opts.availableModels ?? [] },
    ui: {
      notify: (message: string, _type: "error"): void => {
        notifications.push(message);
      },
    },
  } as unknown as ExtensionContext;
  ...
  const fixtures: readonly ThetaFixture[] = await discoverAndComposeFixtures(pi, ctx)...
  return {
    registered: fixtures.map((f) => f.slashName),
    notifications,
    ...
  };
}
```

`tests/call-with-clause-erratum-b.test.ts:51` (the sibling file in this same review scope, importing the canonical helper for its own composition-level cell rather than reimplementing the host):
```ts
import { runProductionLoad } from "./helpers/production-load-harness";
```

## Why this is a problem
`production-load-harness.ts`'s own header states its reason for existing: "Several test files independently redeclared the same `LoadOutcome` shape and the same `runProductionLoad` function… also independently redeclared the temp-workspace lifecycle." The row-13d cell in `call-with-clause-static-checks.test.ts` is exactly one more such redeclaration: the same `pi`/`ctx` member set, the same `mkdtempSync`/`mkdirSync`/settings-file-write sequence, and the same one-shot `discoverAndComposeFixtures(pi, ctx)` call, assembled by hand instead of through the helper — while the file immediately adjacent to it in this review's own scope (`call-with-clause-erratum-b.test.ts`) imports and uses that exact helper for the same composition-level shape.

## Suggested direction (non-binding, optional)
`runProductionLoad(cwd)` already returns `{registered, notifications, ...}`, which is what this cell reads (`fixtures.map(f => f.slashName)` and `notifications.some(...)`) — the natural home for this cell's setup is the same helper the sibling file already imports.

## False-positive check
Gate-pin check: not applicable — `call-with-clause-static-checks.test.ts` does not match `*gate*.test.ts` or the named gate kin; this is not a census/pin-count test. Recording-double check: the local `notifications` array here is a plain recording double, not a MUST-NOT witness — the finding is about the double's construction being reimplemented, not about the witness's legitimacy. docs/bugs/ signature search: `grep -rl "call-with-clause-static-checks" docs/` shows only `docs/plan_topics/V21a-T-call-with-clause-tests.md`, a plan doc, not a docs/bugs/ report pinning this cell's current shape as a documented correct-reason red — the cell is a green control (asserted true positive/negative pair), not a red. coverage-matrix/bug-doc citation search: `grep -rl "call-with-clause-static-checks"` across `quality/resolved/` turned up PTQ-0278, PTQ-0364, PTQ-0557, PTQ-0702, none of which reference the row-13d cell or `runProductionLoad`; no rename/merge/delete of a matrix-cited test is proposed here — the observation is about setup duplication, not the test's identity. This does not drift into coverage: the claim is that the code that exists reimplements an available helper's harness, not that a test is missing.

## Triage
verdict: confirmed — excerpts reproduce at tests/call-with-clause-static-checks.test.ts:137-179 and tests/helpers/production-load-harness.ts:81-136; the cell's `pi` (getFlag/getCommands/sendMessage/sendUserMessage/getActiveTools/setActiveTools) and `ctx` (cwd/modelRegistry.getAvailable/ui.notify→notifications) are a strict subset of runProductionLoad's doubles, the mkdtemp/mkdir `.pi/theta`/one-fixture-write/`settings.json` "{}" sequence is exactly plantThetaWorkspace(prefix, [{stem,text}], "{}") + disposeWorkspace, and the two things the cell reads (`fixtures.map(f=>f.slashName)`, `notifications`) are LoadOutcome.registered/notifications — no load-bearing need the helper misses; sibling tests/call-with-clause-erratum-b.test.ts:53,247 already imports runProductionLoad; not a gate/pin test, not a witness-double question, no coverage-matrix/bug-doc citation; no existing PTQ covers the 13d cell (PTQ-0557/0702 cover row 6 and the checkBody harness, PTQ-0551/0910 cover erratum-b) — D7 boilerplate-duplication class, fix is a mechanical migration (triage: claude-fable-5-1)
