---
id: PTQ-0551
title: call-with-clause-erratum-b.test.ts hand-rolls the temp-workspace-plus-settings.json plant that tests/helpers/compose-workspace-harness.ts's finishWorkspace already provides
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/call-with-clause-erratum-b.test.ts:230-270
  - tests/helpers/compose-workspace-harness.ts:99-121
  - tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts:230-242
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# call-with-clause-erratum-b.test.ts hand-rolls the temp-workspace-plus-settings.json plant that tests/helpers/compose-workspace-harness.ts's finishWorkspace already provides

## Observation
`tests/helpers/compose-workspace-harness.ts` exports `finishWorkspace(cwd)`, documented as the tail every temp compose workspace needs: write a minimal valid `.pi/settings.json` and return a `ComposeWorkspace` handle carrying `dispose()`. Its established call shape — `mkdtempSync` a directory, `mkdirSync(join(cwd, ".pi", "theta"), { recursive: true })`, then hand the result to `finishWorkspace` — is used verbatim by other composition-root test files (e.g. `tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts`). `tests/call-with-clause-erratum-b.test.ts`'s own `compose()` helper instead re-derives every one of those steps inline — `mkdtempSync`, the `.pi/theta` `mkdirSync`, and a direct `writeFileSync(".pi/settings.json", "{}")` — and its `afterEach` re-derives the matching `rmSync(workspaceDir, { recursive: true, force: true })` teardown that `finishWorkspace`'s returned `dispose()` already wraps.

## Evidence
`tests/helpers/compose-workspace-harness.ts:99-121` (the canonical plant + teardown):
```ts
export interface ComposeWorkspace {
  readonly cwd: string;
  /** Absolute, separator-normalised path of a file planted on the project source. */
  path: (name: string) => string;
  readonly dispose: () => void;
}

/**
 * Finish planting a temp compose workspace at `cwd`, once a caller has written
 * its own `.pi/theta/` (and optional `outside/`) fixture files there: write a
 * minimal valid settings file — an ABSENT settings file is silent
 * (package-and-settings.md §Failure modes), so the plant is hermeticity, not
 * noise suppression — and return the `ComposeWorkspace` handle.
 */
export function finishWorkspace(cwd: string): ComposeWorkspace {
  writeFileSync(join(cwd, ".pi", "settings.json"), "{}", "utf8");
  return {
    cwd,
    path: (name: string): string => normalisePath(join(cwd, ".pi", "theta", name)),
    dispose: (): void => rmSync(cwd, { recursive: true, force: true }),
  };
}
```

`tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts:230-242` (the established call shape):
```ts
const cwd = mkdtempSync(join(tmpdir(), "theta-b0275-"));
mkdirSync(join(cwd, ".pi", "theta"), { recursive: true });
...
mkdirSync(join(cwd, "outside"), { recursive: true });
...
return finishWorkspace(cwd);
```

`tests/call-with-clause-erratum-b.test.ts:230-270` (the same three steps re-derived inline, plus a hand-written `afterEach` teardown instead of `dispose()`):
```ts
describe("Erratum B — composition level: the deferred imported-callee check gates registration", () => {
  let workspaceDir: string;

  afterEach(() => {
    if (workspaceDir !== undefined) {
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  });

  async function compose(libBody: string): Promise<{ readonly slugs: string[]; readonly notifications: string[] }> {
    workspaceDir = mkdtempSync(join(tmpdir(), "rfc0009-erratum-b-"));
    const thetaDir = join(workspaceDir, ".pi", "theta");
    mkdirSync(thetaDir, { recursive: true });
    writeFileSync(join(workspaceDir, ".pi", "settings.json"), "{}", "utf8");
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
```

## Why this is a problem
This is setup/teardown harness — planting a temp directory with a `.pi/theta` subdirectory and a minimal valid `.pi/settings.json`, then removing it — not domain logic specific to this test's own `subagent fn`/`with`-clause subject. `tests/helpers/compose-workspace-harness.ts` was built exactly to centralise this "several test files independently redeclared" plant (its own header), and is already imported by other composition-root test files using the identical `mkdtempSync` + `mkdirSync(".pi/theta")` + hand to `finishWorkspace` shape. `tests/call-with-clause-erratum-b.test.ts` reproduces every one of those steps by hand instead, including re-deriving the `rmSync` teardown `finishWorkspace`'s `dispose()` already returns.

## Suggested direction (non-binding, optional)
`finishWorkspace` already accepts a planted `cwd` and returns the `dispose()` this file's own `afterEach` re-derives; the file's own `pi`/`ctx` double differs from `compose-workspace-harness.ts`'s `makeHost` (it drives `discoverAndComposeFixtures` rather than `composeExtensionInstance`, and its own `notifications` capture is a plain string array rather than `makeHost`'s typed tuples), so only the workspace-plant half is the same shape as the canonical helper.

## False-positive check
- Gate-pin: `tests/call-with-clause-erratum-b.test.ts` does not match `*gate*.test.ts` or the named kin; this is not a pinned-count assertion.
- Recording-double: `finishWorkspace`/`dispose()` plant and remove a directory; they record no calls and back no "never called" assertion, so the negative-witness carve-out does not apply. (The file's own `pi.sendMessage`/`ui.notify` doubles are recording doubles for the composition root's own notifications, which this finding does not touch — only the workspace-plant half is cited.)
- docs/bugs/ signature search: `grep -rl "finishWorkspace" docs/bugs/` → 0 files naming this duplication as a documented correct-reason design.
- coverage-matrix/bug-doc citation search: `grep -n "call-with-clause-erratum-b" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no change to any `it()`/`describe()` name, count, or assertion, only to how the temp workspace is planted and torn down inside the existing `compose()` helper.
- Prior-finding search: `grep -rl "call-with-clause-erratum-b" quality/intake quality/resolved` → only `quality/resolved/PTQ-0372-invoke-static-checks-header-default-reject-claim-stale.md`, which cites this file as evidence of a live/tested code path in an unrelated D2-shaped finding about a header comment, not this workspace-plant duplication.
- Coverage check: the claim is entirely about a repeated setup/teardown DEFINITION, not a missing test path; the existing `compose()` function is exercised by both `it()`s in its own `describe` block.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all three excerpts reproduce verbatim at the cited lines (erratum-b:230-270 mkdtemp/mkdir(.pi/theta)/writeFileSync(settings.json,"{}")/rmSync afterEach; compose-workspace-harness.ts:99-121 finishWorkspace writes the identical settings.json and returns the identical rmSync dispose; b0275:230-242 is the canonical mkdtemp→mkdir→finishWorkspace shape), the file imports nothing from compose-workspace-harness (grep: only discoverAndComposeFixtures from production-composition), finishWorkspace has 8 test importers and 0 docs/bugs hits, coverage-matrix has 0 hits for this file, 12/12 tests green at HEAD, and the only prior finding naming the file (PTQ-0372) is an unrelated header-comment D2; not a duplicate — PTQ-0299/0361/0385 cover b0280/b0328+b0329/b0343 respectively and never cite this file, but they are the human-confirmed precedent for exactly this settings-write+dispose hand-roll (triage: claude-fable-5-1)
