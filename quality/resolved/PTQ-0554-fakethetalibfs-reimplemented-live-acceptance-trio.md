---
id: PTQ-0554
title: b0333live/b0334live/b0335live each re-implement fakeThetaLibFs byte-identically instead of importing tests/helpers/thetalib-load-harness.ts's export
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/live/acceptance/b0333live-transitive-reexport-load-refusal.test.ts:181-215
  - tests/live/acceptance/b0334live-multisource-collision-load-refusal.test.ts:200-234
  - tests/live/acceptance/b0335live-own-import-shadow-load-refusal.test.ts:164-198
  - tests/helpers/thetalib-load-harness.ts:85-119
sites: 3
fix_scope: cross-module       # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0333live/b0334live/b0335live each re-implement fakeThetaLibFs byte-identically instead of importing tests/helpers/thetalib-load-harness.ts's export

## Observation
tests/live/acceptance/b0333live-transitive-reexport-load-refusal.test.ts, tests/live/acceptance/b0334live-multisource-collision-load-refusal.test.ts and tests/live/acceptance/b0335live-own-import-shadow-load-refusal.test.ts each declare a module-scope `fakeThetaLibFs(files)` function — an in-memory `.thetalib` `FileSystem` double that derives a directory listing from a flat path→content map and serves only `readdir`/`readBytes`, rejecting every other member. `tests/helpers/thetalib-load-harness.ts` already exports a function of the same name whose body is byte-identical apart from the `export` keyword; that module's own header states it exists precisely because three OTHER sibling files (the offline `tests/b0333-transitive-lib-reexport-edge.test.ts`, `tests/b0334-reexport-multisource-collision.test.ts`, `tests/b0335-own-import-shadows-own-declaration.test.ts` — resolved as PTQ-0232) redeclared this same double, and two more files later (PTQ-0393) redeclared it again. None of the three live-acceptance files reviewed here imports it. Each live file also declares its own `importCheckCodes` driver that parses a theta and drives `checkThetaImports` over the double — a function performing the same job as the helper module's own `loadThetaLibDiags`, though with a different signature (arbitrary `thetaPath`/full-document `parseDoc` vs. the helper's fixed `/proj/app.theta` + shared prepended frontmatter), so only the `fakeThetaLibFs` piece is cited as an exact copy here.

## Evidence
tests/live/acceptance/b0333live-transitive-reexport-load-refusal.test.ts:181-215:
```ts
function fakeThetaLibFs(files: Record<string, string>): FileSystem {
  const dirs = new Map<string, string[]>();
  for (const path of Object.keys(files)) {
    const slash = path.lastIndexOf("/");
    const parent = path.slice(0, slash);
    const entries = dirs.get(parent) ?? [];
    entries.push(path.slice(slash + 1));
    dirs.set(parent, entries);
  }
  const reject = (): Promise<never> =>
    Promise.reject(new Error("filesystem member not exercised by this test"));
  return {
    readText: reject,
    writeText: reject,
    exists: reject,
    homedir: (): string => "/home",
    cwd: (): string => "/proj",
    configDirName: (): string => ".pi",
    globalAgentDir: (): string => "/home/.pi/agent",
    lstat: reject,
    realpath: reject,
    readdir: (path: string): Promise<readonly string[]> => {
      const entries = dirs.get(path);
      return entries === undefined
        ? Promise.reject(new Error(`ENOENT: ${path}`))
        : Promise.resolve(entries);
    },
    readBytes: (path: string): Promise<Uint8Array> => {
      const content = files[path];
      return content === undefined
        ? Promise.reject(new Error(`ENOENT: ${path}`))
        : Promise.resolve(new TextEncoder().encode(content));
    },
  } as FileSystem;
}
```

tests/helpers/thetalib-load-harness.ts:85-119 — the canonical, already-exported version:
```ts
export function fakeThetaLibFs(files: Record<string, string>): FileSystem {
  const dirs = new Map<string, string[]>();
  for (const path of Object.keys(files)) {
    const slash = path.lastIndexOf("/");
    const parent = path.slice(0, slash);
    const entries = dirs.get(parent) ?? [];
    entries.push(path.slice(slash + 1));
    dirs.set(parent, entries);
  }
  const reject = (): Promise<never> =>
    Promise.reject(new Error("filesystem member not exercised by this test"));
  return {
    readText: reject,
    writeText: reject,
    exists: reject,
    homedir: (): string => "/home",
    cwd: (): string => "/proj",
    configDirName: (): string => ".pi",
    globalAgentDir: (): string => "/home/.pi/agent",
    lstat: reject,
    realpath: reject,
    readdir: (path: string): Promise<readonly string[]> => {
      const entries = dirs.get(path);
      return entries === undefined
        ? Promise.reject(new Error(`ENOENT: ${path}`))
        : Promise.resolve(entries);
    },
    readBytes: (path: string): Promise<Uint8Array> => {
      const content = files[path];
      return content === undefined
        ? Promise.reject(new Error(`ENOENT: ${path}`))
        : Promise.resolve(new TextEncoder().encode(content));
    },
  } as FileSystem;
}
```
`diff` of the two 35-line spans above (with the `export` keyword stripped) is empty.

`diff` of the same span against tests/live/acceptance/b0334live-multisource-collision-load-refusal.test.ts:200-234 and tests/live/acceptance/b0335live-own-import-shadow-load-refusal.test.ts:164-198 is also empty — all three live files' copies, and the canonical helper's export, are byte-identical apart from the `export` keyword.

Exact search: `grep -rn "^function fakeThetaLibFs\|^export function fakeThetaLibFs" tests --include="*.test.ts" tests/helpers/*.ts` confirms the helper's single canonical export plus these three uncoupled local redeclarations in the reviewed scope (a wider, pre-existing family of `fakeThetaLibFs` redeclarations exists across the offline test suite under other, already-filed/resolved tickets — PTQ-0232, PTQ-0393 — this finding is scoped to the 3 live-acceptance sites named above, which neither of those tickets' locations lists).

## Why this is a problem
`tests/helpers/thetalib-load-harness.ts`'s own header names its purpose as ending exactly this redeclaration, and two prior tickets (PTQ-0232, PTQ-0393) already record that the same double was independently rewritten in five other files before this helper (and its later extension) centralised it. The three live-acceptance files reviewed here are a further, uncoupled repetition of the identical double the helper already exports under the same name — confirmed byte-identical apart from the `export` keyword — in files the two prior fixes did not reach (all three PTQ-0232/PTQ-0393 location lists are confined to `tests/b03*`/`tests/b04*` offline files; none names a `tests/live/acceptance/*` path). A change to the double's double-rejection behaviour or its derived-directory-listing logic landing in the canonical helper would leave these three live-acceptance copies silently checking a different filesystem double than every other caller of `checkThetaImports` in the test suite exercises.

## Suggested direction (non-binding, optional)
`tests/helpers/thetalib-load-harness.ts` already exports `fakeThetaLibFs` under the identical name and signature these three files use locally; importing it is the path the module's own header and its five prior migrated callers already establish.

## False-positive check
- Gate-pin check: none of the three files matches `*gate*.test.ts` or its named kin; `fakeThetaLibFs` is a filesystem double, not a pinned count or inventory.
- Recording-double check: `fakeThetaLibFs` is a stateless read-only double answering from a fixed map; it records no calls and backs no "never called" witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0333-transitive-lib-reexport-edge-fault-silent.md, docs/bugs/0334-reexport-closure-multi-source-name-collision-silent.md and docs/bugs/0335-thetalib-own-import-shadows-own-declaration-undiagnosed.md report Status "fixed" (0.302.0 / 0.303.0 / 0.304.0 respectively); none of the three reviewed files is a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "b0333live\|b0334live\|b0335live" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any file or `it()`/`describe()` cell — only that the three local `fakeThetaLibFs` copies could import the existing canonical export — so no citation is affected.
- Prior-finding overlap check: PTQ-0232 (resolved, fixed) and PTQ-0393 (intake candidate) both name `fakeThetaLibFs` redeclarations, but their location lists are confined to offline `tests/b033*`/`tests/b044*`/`tests/b045*` files; neither cites any `tests/live/acceptance/*` path, so this is a fresh, unmigrated instance of the pattern those tickets already diagnosed and (in PTQ-0232's case) fixed elsewhere, not a re-file of either.
- Coverage-drift check: this finding is about a repeated double DEFINITION that exists and runs identically in three files; it makes no claim that any path or behaviour is untested.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: extracted b0333live:181-215, b0334live:200-234, b0335live:164-198 each diff empty against tests/helpers/thetalib-load-harness.ts:85-119 with `export` stripped; none of the three imports the helper (each imports only ../../helpers/e2e-s1, so a tests/helpers import is already the established path in this tier) and each copy's own doc-comment attributes it to tests/reexport-chain-resolution.test.ts's local redeclaration, not to the canonical export — a documented-nowhere copy-paste double, the same class human-confirmed and fixed for other site clusters in PTQ-0232/0310/0393, whose location lists (and the same-wave siblings for b0302live/b0304live and b0422live/b0428live/b0445live) do not cover these three files; coverage-matrix grep → 0 hits, bug docs 0333/0334/0335 are Status fixed and cite the live files only as witnesses, and the direction (import, no merge/rename/delete) leaves every citation intact (triage: claude-fable-5-1)
