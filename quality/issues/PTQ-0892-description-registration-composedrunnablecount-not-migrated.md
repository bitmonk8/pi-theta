---
id: PTQ-0892
title: e2e-s6-description-registration.test.ts hand-rolls the discoverAndComposeFixtures fake-host + workspace-plant sequence tests/helpers/production-load-harness.ts already exports
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/e2e-s6-description-registration.test.ts:40-73
  - tests/helpers/production-load-harness.ts:156-176
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
fix_skips: 1
---

# e2e-s6-description-registration.test.ts hand-rolls the discoverAndComposeFixtures fake-host + workspace-plant sequence tests/helpers/production-load-harness.ts already exports

## Observation
The first `describe` block of `tests/e2e-s6-description-registration.test.ts`
mints a temp dir with `mkdtempSync`, writes a `.pi/theta/` fixture and a
`.pi/settings.json`, then inside its `it(...)` builds an inline fake
`pi`/`ctx` pair and calls `discoverAndComposeFixtures(pi, ctx)` directly.
The file does not import `tests/helpers/production-load-harness.ts` at all.
That module already exports `plantThetaWorkspace`/`disposeWorkspace` (the
identical mkdtemp→mkdir→write-fixture→optional-settings-write→dispose
lifecycle) and `composedRunnableCount`/`runProductionLoad`, drivers of the
same `discoverAndComposeFixtures` call over a byte-identical fake `pi`/`ctx`
pair.

## Evidence
tests/e2e-s6-description-registration.test.ts:40-73 (re-read immediately
before filing):
```ts
describe("S6 FIND-S6-1 — description drop on the discoverAndComposeFixtures path", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "theta-s6-desc-a-"));
    mkdirSync(join(workspace, ".pi", "theta"), { recursive: true });
    writeFileSync(
      join(workspace, ".pi", "theta", "hi.theta"),
      THETA_WITH_DESC,
      "utf8",
    );
    writeFileSync(join(workspace, ".pi", "settings.json"), "{}", "utf8");
  });
  afterEach(() => rmSync(workspace, { recursive: true, force: true }));

  it("parses description into frontmatter and threads it onto the composed runnable's top-level description", async () => {
    const pi = {
      getFlag: (): undefined => undefined,
      getCommands: (): unknown[] => [],
      sendMessage: (): void => {},
      registerCommand: (): void => {},
      registerMessageRenderer: (): void => {},
      registerFlag: (): void => {},
      on: (): void => {},
    } as unknown as ExtensionAPI;
    const ctx = {
      cwd: workspace,
      hasUI: false,
      modelRegistry: { getAvailable: (): readonly unknown[] => [] },
      ui: { notify: (): void => {} },
    } as unknown as ExtensionContext;

    const thetas = await discoverAndComposeFixtures(pi, ctx);
```

tests/helpers/production-load-harness.ts:156-176 (the exported
`composedRunnableCount`, whose plant sequence and `pi`/`ctx` object literals
are byte-identical to the excerpt above apart from the fixture filename and
the return value it reads off the same `discoverAndComposeFixtures` call):
```ts
export async function composedRunnableCount(fileName: string, src: string, dirPrefix: string): Promise<number> {
  const workspace = mkdtempSync(join(tmpdir(), dirPrefix));
  try {
    mkdirSync(join(workspace, ".pi", "theta"), { recursive: true });
    writeFileSync(join(workspace, ".pi", "theta", `${fileName}.theta`), src, "utf8");
    writeFileSync(join(workspace, ".pi", "settings.json"), "{}", "utf8");
    const pi = {
      getFlag: (): undefined => undefined,
      getCommands: (): unknown[] => [],
      sendMessage: (): void => {},
      registerCommand: (): void => {},
      registerMessageRenderer: (): void => {},
      registerFlag: (): void => {},
      on: (): void => {},
    } as unknown as ExtensionAPI;
    const ctx = {
      cwd: workspace,
      hasUI: false,
      modelRegistry: { getAvailable: (): readonly unknown[] => [] },
      ui: { notify: (): void => {} },
    } as unknown as ExtensionContext;
    return (await discoverAndComposeFixtures(pi, ctx)).length;
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}
```
The `pi` object literal (seven members, same keys, same order, same inert
bodies) and the `ctx` object literal (`cwd`/`hasUI`/`modelRegistry`/`ui`,
same shape) are byte-identical between the two excerpts; the workspace-plant
statements (`mkdtempSync` under `tmpdir()`, `mkdirSync` `.pi/theta`,
`writeFileSync` one fixture file, `writeFileSync` `.pi/settings.json` with
`"{}"`, teardown via `rmSync`) are the same sequence, only split across
`beforeEach`/`afterEach`/`it` here instead of one `try`/`finally` function.
The one difference in need — this test reads `thetas[0].description`/
`.frontmatter.description`, not just a count — is already served by the same
helper module's sibling export `runProductionLoad`, whose `LoadOutcome`
carries `fixtures: readonly ThetaFixture[]` (the same array
`discoverAndComposeFixtures` returns) over an equivalent fake host.

## Why this is a problem
This is the "Boilerplate duplication" class. `composedRunnableCount` was
itself extracted into `tests/helpers/production-load-harness.ts` (as the fix
for a prior finding covering `tests/b0357-doc-comment-field-variant-anchors.test.ts`
and `tests/b0358-doc-comment-descriptions-lower.test.ts`) specifically to
centralise this exact fake-`pi`/`ctx`-over-`discoverAndComposeFixtures`
double and its workspace-plant lifecycle. `tests/e2e-s6-description-registration.test.ts`
was not migrated onto it (or onto the richer `runProductionLoad`/
`plantThetaWorkspace` pair in the same module) and instead redeclares the
identical double and plant sequence a third time.

## Suggested direction (non-binding, optional)
The first `describe` block could call `plantThetaWorkspace(prefix,
[{ stem: "hi", text: THETA_WITH_DESC }], "{}")` and
`runProductionLoad(workspace)` from `tests/helpers/production-load-harness.ts`,
reading `.fixtures[0].description`/`.frontmatter?.description` off the
returned `LoadOutcome` instead of driving `discoverAndComposeFixtures`
inline.

## False-positive check
- Gate-pin check: `tests/e2e-s6-description-registration.test.ts` does not
  match `*gate*.test.ts` or the named gate kin; no pinned count or inventory
  assertion is touched — only where the fake-host/plant sequence is defined.
- Recording-double check: the inline `pi`/`ctx` pair backs a genuine
  positive assertion (`expect(theta.description).toBe("HELLO-DESC")`), not a
  MUST-NOT witness; this finding targets the double's construction code,
  not the validity of the assertion built on it.
- docs/bugs/ signature search: `grep -rl "e2e-s6-description-registration"
  docs/bugs/*.md` → the file's own FIND-S6-1 fix is documented inline in its
  header comment (not a separate docs/bugs/ report); no doc names this
  specific harness block as a correct-reason red, and both `it()`s in this
  file pass at HEAD (confirmed by `npx vitest run
  tests/e2e-s6-description-registration.test.ts`, 2/2).
- coverage-matrix/bug-doc citation search: `grep -n
  "e2e-s6-description-registration.test.ts" docs/reference/coverage-matrix.md`
  → 0 hits. This finding proposes no merge, rename, or deletion of the file
  or any `it()`/`describe()` inside it — only that the fake-host/plant
  construction could be imported from the already-existing helper rather
  than redeclared.
- Coverage check: the claim is about a repeated harness DEFINITION, not a
  missing test path; the double is exercised by this file's own test.
- Prior-finding overlap check: `grep -rl "composedRunnableCount"
  quality/issues quality/resolved quality/intake` → only the resolved
  finding covering `tests/b0357-doc-comment-field-variant-anchors.test.ts`/
  `tests/b0358-doc-comment-descriptions-lower.test.ts`, whose fix created
  this exported helper — it does not cite
  `tests/e2e-s6-description-registration.test.ts`, and the resolved
  `PTQ-0617`/`PTQ-0258` findings for this same file cover only its SECOND
  `describe` block's `makeHarness`-shaped double (a different production
  entry point, `composeExtensionInstance` via the factory, not
  `discoverAndComposeFixtures` directly) — this finding is the first block's
  distinct, still-unmigrated gap.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/e2e-s6-description-registration.test.ts:40-73 and tests/helpers/production-load-harness.ts:156-176; the `pi`/`ctx` literals sed-extracted and diffed → byte-identical, the beforeEach/afterEach plant is the mkdtemp→mkdir .pi/theta→write fixture→write settings.json "{}"→rmSync sequence `composedRunnableCount`/`plantThetaWorkspace`+`disposeWorkspace` centralise; the file imports only `./helpers/package-merge-e2e-harness` and nothing from production-load-harness (grep → 0); the test reads only `thetas[0].description`/`.frontmatter.description`, which `runProductionLoad`'s `LoadOutcome.fixtures` supplies over an equivalent host (`ctx.hasUI` at production-composition.ts:349/2140 is advisory and undefined≡false), so the migration is a mechanical import-swap; both locations under tests/, D7 boilerplate-duplication class, not a *gate* file, positive `toBe` witness not a MUST-NOT recording double, 0 coverage-matrix hits, docs/bugs 0216/0357 mention the file only as a line-drift residual and a scratch-rig reference (no witness-list pin, and no merge/rename/delete proposed), 2/2 vitest green; NOT a duplicate: resolved PTQ-0440 minted the helper for b0357/b0358 without citing this file, resolved PTQ-0617/PTQ-0258 cover only the second describe's `makeHarness` block (:109-152, composeExtensionInstance path), and no open issue cites this file (grep quality/issues → 0) — matching the accepted per-file not-migrated pattern of PTQ-0517/0635/0722/0739 (triage: claude-fable-5-1)

## Fix attempts
- qw20260919162231: skipped — [PTQ-0914-bug0058-bug0100-local-parse-reimplements-parsedoc.md] PTQ-0914: Replaced both local parse wrappers with shared parseDoc; all tests and assertions retained. / PTQ-0916: Reused shared REGISTRY and RegistryRow; retained local message readers as triage permits. / PTQ-0917: Strengthened the assertion to require exactly one error note, retaining diagnostic and envelope checks. / PTQ-0918: Reused plantThetaWorkspace and disposeWorkspace in both files; fixture writes unchanged. No tests deleted. Required gate passed for all four issues: TypeScript clean, 689 test files and 11,586 tests passed. || [PTQ-0919-assertframestointernalerror-reimplements-assertinternalerror.md] PTQ-0919: Both framing helpers delegate to assertInternalError, preserving all four checks; no tests deleted or renamed. / PTQ-0921: Reused the canonical parse-registry reader and message lookup, retaining the non-empty-message guard; no tests deleted or renamed. / PTQ-0922: Replaced the inline pi/ctx double with makeHarness; discovery assertions remain unchanged; no tests deleted or renamed. / PTQ-0926: Shared thetaInput and driveBinder across all three files, preserving per-file parsing, contexts, and fixtures; no tests deleted or renamed. Required gate passed for all four fixes: tsc clean, 689 test files and 11,586 tests passed. ||
