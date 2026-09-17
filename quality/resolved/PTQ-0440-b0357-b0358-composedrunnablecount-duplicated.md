---
id: PTQ-0440
title: b0357 and b0358 each independently redeclare the same composedRunnableCount workspace-plant/compose/dispose function, byte-identical apart from the temp-dir slug
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0357-doc-comment-field-variant-anchors.test.ts:59-83
  - tests/b0358-doc-comment-descriptions-lower.test.ts:125-149
  - tests/helpers/production-load-harness.ts:104-138
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0357 and b0358 each independently redeclare the same composedRunnableCount workspace-plant/compose/dispose function, byte-identical apart from the temp-dir slug

## Observation
tests/b0357-doc-comment-field-variant-anchors.test.ts and
tests/b0358-doc-comment-descriptions-lower.test.ts each declare their own
local `composedRunnableCount(fileName, src)` async function: `mkdtempSync` a
workspace, `mkdirSync` its `.pi/theta`, `writeFileSync` one `.theta` file and
an empty `.pi/settings.json`, build an inert `pi`/`ctx` fake host, call
`discoverAndComposeFixtures(pi, ctx)` and return its `.length`, then `rmSync`
the workspace in a `finally`. The two copies are identical except for the
`mkdtempSync` prefix string (`"b0357-reg-"` vs `"b0358-reg-"`). b0358's own
doc comment on this function states "Mirrors
tests/b0357-doc-comment-field-variant-anchors.test.ts's rig; the inert
`pi`/`ctx` doubles and empty-settings plant are the same," naming the
duplication at the point it was introduced rather than importing the sibling.
`tests/helpers/production-load-harness.ts` already exports
`plantThetaWorkspace`/`disposeWorkspace` (the identical
mkdtemp→mkdir→per-fixture-write→optional-settings-write→dispose lifecycle)
alongside `runProductionLoad` (a `discoverAndComposeFixtures` driver over the
same shape of fake host), centralising exactly this sequence for other
callers.

## Evidence

tests/b0357-doc-comment-field-variant-anchors.test.ts:59-83:
```ts
async function composedRunnableCount(fileName: string, src: string): Promise<number> {
  const workspace = mkdtempSync(join(tmpdir(), "b0357-reg-"));
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

tests/b0358-doc-comment-descriptions-lower.test.ts:120-149 (the comment
naming the duplication, plus the byte-identical body apart from the slug):
```ts
/**
 * Plant one `.theta` under a fresh temp `.pi/theta/` workspace and return the
 * count of runnables `discoverAndComposeFixtures` composes (the registration
 * outcome). Mirrors tests/b0357-doc-comment-field-variant-anchors.test.ts's rig; the
 * inert `pi`/`ctx` doubles and empty-settings plant are the same. `finally`
 * (never `catch`) guarantees teardown.
 */
async function composedRunnableCount(fileName: string, src: string): Promise<number> {
  const workspace = mkdtempSync(join(tmpdir(), "b0358-reg-"));
  try {
    mkdirSync(join(workspace, ".pi", "theta"), { recursive: true });
    writeFileSync(join(workspace, ".pi", "theta", `${fileName}.theta`), src, "utf8");
    writeFileSync(join(workspace, ".pi", "settings.json"), "{}", "utf8");
```

tests/helpers/production-load-harness.ts:104-138 — the canonical
plant/dispose lifecycle the two copies re-derive by hand:
```ts
export function plantThetaWorkspace(
  dirPrefix: string,
  fixtures: readonly PlantedThetaFile[],
  settingsJson?: string,
): string {
  const workspaceDir = mkdtempSync(join(tmpdir(), dirPrefix));
  const projectThetaDir = join(workspaceDir, ".pi", "theta");
  mkdirSync(projectThetaDir, { recursive: true });
  for (const fixture of fixtures) {
    writeFileSync(
      join(projectThetaDir, `${fixture.stem}.${fixture.ext ?? "theta"}`),
      fixture.text,
      "utf8",
    );
  }
  if (settingsJson !== undefined) {
    writeFileSync(join(workspaceDir, ".pi", "settings.json"), settingsJson, "utf8");
  }
  return workspaceDir;
}
```
`grep -n "composedRunnableCount" tests/*.test.ts` → exactly 2 declaration
sites (b0357:59, b0358:125), each called 2 and 1 times respectively (b0357:
lines 178, 187, 304, 311; b0358: line 572).

## Why this is a problem
This is the "Boilerplate duplication" class: two sibling bug-fixture test
files, committed one after the other, each hand-type the identical five-step
temp-workspace-plant → fake-host → `discoverAndComposeFixtures` →
teardown sequence rather than sharing one function; b0358's own doc comment
names b0357 as the source it mirrors, so the duplication is acknowledged in
the code itself, not merely observed here. `tests/helpers/production-load-harness.ts`
already exports the identical plant/dispose halves
(`plantThetaWorkspace`/`disposeWorkspace`) this pair re-derives, plus a
`discoverAndComposeFixtures`-driving `runProductionLoad` whose returned
`LoadOutcome.registered`/`.fixtures` already carries the runnable count
`composedRunnableCount` recomputes locally.

## Suggested direction (non-binding, optional)
`tests/helpers/production-load-harness.ts`, which already exports
`plantThetaWorkspace`/`disposeWorkspace` and a `discoverAndComposeFixtures`-driving
load call, is the existing home a shared `composedRunnableCount`-shaped helper
would sit alongside.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin; nothing cited is a pinned count/inventory assertion in the gate sense
  (the "1 runnable" values are per-cell registration outcomes, not a census).
- Recording-double check: `composedRunnableCount` drives the real
  `discoverAndComposeFixtures` over real on-disk fixtures; it is not a
  recording double backing a "never called" witness, so the negative-witness
  carve-out does not apply.
- docs/bugs/ signature search: `grep -n "b0357\|b0358" docs/bugs/*.md` finds
  docs/bugs/0357-doc-comment-field-variant-anchors-refused.md and
  docs/bugs/0358-doc-comment-descriptions-never-lower.md; neither pins the
  `composedRunnableCount` function body or names it as an intentionally
  separate local helper — both cite only the registration/lowering behaviour
  under test.
- coverage-matrix/bug-doc citation search: `grep -n
  "composedRunnableCount\|b0357-doc-comment-field-variant-anchors\|b0358-doc-comment-descriptions-lower"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of any `it()` or fixture — only that the
  repeated plant/compose/dispose function could be shared — so no
  witness-list citation is disturbed.
- Coverage check: the claim is about a repeated helper-function DEFINITION,
  not a missing test path; every cell that calls `composedRunnableCount` in
  both files continues to run and assert as before.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: `diff` of b0357:59-83 vs b0358:125-149 yields exactly one differing line (the mkdtemp slug "b0357-reg-" vs "b0358-reg-"), grep of composedRunnableCount across src/extensions/tools/tests finds only these 2 declarations (both live: called at b0357:178,187,304,311 and b0358:572), b0358's doc comment names b0357 as the mirrored rig, tests/helpers/production-load-harness.ts:104-138 exports plantThetaWorkspace/disposeWorkspace covering the plant/teardown half, coverage-matrix grep is 0 hits and neither docs/bugs/0357/0358 pins the helper body; no PTQ issue/resolved file cites b0357/b0358 (PTQ-0210/0240/0312/0358/0385 cite disjoint files), so this is an untracked D7 boilerplate-duplication clone with no carve-out applying (triage: claude-fable-5-1)
