---
id: PTQ-0915
title: production-load-harness.ts's composedRunnableCount() re-implements the file's own plantThetaWorkspace()/disposeWorkspace() lifecycle inline instead of calling them
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/helpers/production-load-harness.ts:159-184
  - tests/helpers/production-load-harness.ts:127-146
  - tests/helpers/production-load-harness.ts:152-156
sites: 1
fix_scope: localized
d4_class: clone
wave: qw20260918075903
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# production-load-harness.ts's composedRunnableCount() re-implements the file's own plantThetaWorkspace()/disposeWorkspace() lifecycle inline instead of calling them

## Observation
`tests/helpers/production-load-harness.ts`'s own header comment (lines 1-18)
states that the temp discovery-workspace plant/dispose lifecycle — `mkdtemp`
a project root, `mkdir` its `.pi/theta`, a per-fixture write loop, an
optional `.pi/settings.json` write, and a recursive removal — was extracted
into `plantThetaWorkspace()` / `disposeWorkspace()` specifically because
several callers had independently redeclared it (PTQ-0312). Later in the
same file, `composedRunnableCount()` re-implements that exact plant/dispose
sequence inline — its own `mkdtempSync`, `mkdirSync(.pi/theta)`,
`writeFileSync` of one fixture, `writeFileSync` of a settings file, and
`rmSync` cleanup — instead of calling `plantThetaWorkspace()` /
`disposeWorkspace()`, which sit earlier in the very file whose header
explains why they exist.

## Evidence
`tests/helpers/production-load-harness.ts:127-146` (`plantThetaWorkspace`,
the canonical helper this same file already exports):
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
`tests/helpers/production-load-harness.ts:152-156` (`disposeWorkspace`):
```ts
export function disposeWorkspace(workspaceDir: string | undefined): void {
  if (workspaceDir !== undefined) {
    rmSync(workspaceDir, { recursive: true, force: true });
  }
}
```
`tests/helpers/production-load-harness.ts:159-184`
(`composedRunnableCount` — the re-implementation, in the same file):
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
`composedRunnableCount`'s `mkdtempSync(join(tmpdir(), dirPrefix))` +
`mkdirSync(join(workspace, ".pi", "theta"), { recursive: true })` +
per-fixture `writeFileSync` + optional-settings `writeFileSync` sequence is
the same operation `plantThetaWorkspace` performs (specialised to exactly
one fixture named `fileName` and a fixed `"{}"` settings body, which
`plantThetaWorkspace(dirPrefix, [{ stem: fileName, text: src }], "{}")`
already expresses), and its `finally { rmSync(workspace, { recursive: true,
force: true }) }` is the same operation `disposeWorkspace(workspace)`
performs. `grep -n "mkdtempSync(join(tmpdir()" tests/helpers/production-load-harness.ts`
finds exactly two call sites in the file: inside `plantThetaWorkspace`
(line 132) and inside `composedRunnableCount` (line 160).

## Why this is a problem
The header comment of this very file states the plant/dispose lifecycle was
centralised into `plantThetaWorkspace()` / `disposeWorkspace()` precisely
because it recurred across callers; `composedRunnableCount`, added to the
same module, is a fresh recurrence of that lifecycle that never reaches the
two functions sitting directly above it. A reader who trusts the file's own
"WHY THIS FILE EXISTS" header to mean the plant/dispose sequence is written
once would find a second, independent copy of it 13 lines below
`disposeWorkspace`'s closing brace.

## Suggested direction (non-binding, optional)
`composedRunnableCount` could call `plantThetaWorkspace(dirPrefix, [{ stem:
fileName, text: src }], "{}")` and `disposeWorkspace(workspace)` in place of
its own inline `mkdtempSync`/`mkdirSync`/`writeFileSync`/`rmSync` sequence,
as an observation of the helpers already sitting in the same file.

## False-positive check
- Gate-pin check: `tests/helpers/production-load-harness.ts` is not a
  `*gate*.test.ts` file or named gate kin; not applicable.
- Recording-double check: neither the plant/dispose sequence nor
  `composedRunnableCount`'s inline copy records a call for a "never called"
  witness; both are filesystem-setup/teardown scaffolding, not negative
  witnesses — the carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "composedRunnableCount\|plantThetaWorkspace"
  docs/bugs/*.md` → 0 hits; no documented correct-reason red cites either
  function.
- coverage-matrix/bug-doc citation search: `grep -n
  "production-load-harness.ts" docs/reference/coverage-matrix.md` → 0 hits.
  This finding proposes no merge, rename, or deletion of any `it()`/
  `describe()` block, and none of the three cited functions is itself a
  test — only that one call-site sequence could reuse two functions already
  exported by the same file — so no pinned citation is disturbed.
- Coverage check: the claim is entirely about a repeated
  plant/discover/dispose SEQUENCE; `composedRunnableCount` is live (called
  by its own consumers) and no behaviour path is claimed untested.
- Overlap check: `grep -rl "composedRunnableCount" quality/intake
  quality/issues quality/resolved` → 0 hits before this filing; no existing
  finding names this function.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: all three excerpts reproduce verbatim at tests/helpers/production-load-harness.ts:127-146, :152-156 and :159-184; `grep "mkdtempSync(join(tmpdir()"` → exactly :132 and :160; the inline sequence (mkdtemp → mkdir .pi/theta → write `<fileName>.theta` → write settings.json "{}" → rmSync recursive/force) produces byte-for-byte the filesystem state `plantThetaWorkspace(dirPrefix, [{stem, text}], "{}")` + `disposeWorkspace()` produce; `composedRunnableCount` is live (imported by b0357/b0358); git blame shows `plantThetaWorkspace` landed 4c0cd0dc1 (2026-09-14) and `composedRunnableCount` was copied into the file by cc0a8fe7 (2026-09-18, the PTQ-0440 hoist) without migrating its body — a post-hoc residual, not a design choice; all locations under tests/, D7 boilerplate-duplication class, not a gate file, no recording-double/red-test carve-out, coverage-matrix → 0; the filing's docs/bugs "0 hits" undercounts (0048/0351 mention `plantThetaWorkspace` as line-drift residuals/rig references, 3 hits) but no witness-list pin and no merge/rename/delete is proposed, so immaterial; stray `d4_class: clone` field on a D7 filing is a form nit that does not block evaluation; NOT a duplicate: resolved PTQ-0440 minted the helper without citing its internal plant/dispose, open PTQ-0892 cites :156-176 only as the canonical for e2e-s6's hand-roll, PTQ-0890 covers `disposeWorkspace` duplicated across two helper files, PTQ-0312/0703 cite consumer tests — no finding names the harness's own re-implementation (triage: claude-fable-5-1)
