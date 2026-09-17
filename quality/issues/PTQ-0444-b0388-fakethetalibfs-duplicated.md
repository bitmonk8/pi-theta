---
id: PTQ-0444
title: b0388 redeclares the fakeThetaLibFs double that tests/helpers/thetalib-load-harness.ts already exports
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0388-crossfile-fnbody-effect-undercount.test.ts:126-158
  - tests/helpers/thetalib-load-harness.ts:85-118
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0388 redeclares the fakeThetaLibFs double that tests/helpers/thetalib-load-harness.ts already exports

## Observation
tests/b0388-crossfile-fnbody-effect-undercount.test.ts declares, module scope,
its own `fakeThetaLibFs(files)`: an in-memory `FileSystem` double that derives
a directory listing from a flat path→content map and serves only
`readdir`/`readBytes`, every other member rejecting with the fixed message
"filesystem member not exercised by this test". tests/helpers/thetalib-load-harness.ts
already exports a `fakeThetaLibFs` solving the identical problem. The file
already imports three other helpers (`parseDeps` from `./helpers/e2e-s1`,
`fakeExecutableHost`/`makeFakeJsonChildLauncher` from `./helpers/fake-json-child`,
`childRegimeRootDouble`/`driveSubagentFnEntry` from
`./helpers/subagent-fn-child-regime`) but not `./helpers/thetalib-load-harness`.

## Evidence

tests/b0388-crossfile-fnbody-effect-undercount.test.ts:126-158 (the full
local declaration):
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

tests/helpers/thetalib-load-harness.ts:85-118 (the canonical export,
byte-identical apart from the `export` keyword):
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

Full-span diff (export keyword normalised, re-run immediately before filing):
`tests/b0388-crossfile-fnbody-effect-undercount.test.ts:126-158` against
`tests/helpers/thetalib-load-harness.ts:85-118` produces zero differences —
byte-identical apart from the `export` keyword.

Exact search: `grep -n "^function fakeThetaLibFs" tests/b0388-crossfile-fnbody-effect-undercount.test.ts`
→ exactly 1 hit (126); `grep -n "from \"\./helpers" tests/b0388-crossfile-fnbody-effect-undercount.test.ts`
→ imports `./helpers/e2e-s1`, `./helpers/fake-json-child`,
`./helpers/subagent-fn-child-regime`, never `./helpers/thetalib-load-harness`.

## Why this is a problem
This is the "Copy-paste fixtures/doubles" class. tests/helpers/thetalib-load-harness.ts's
own header states it centralises exactly this double because it recurred
byte-for-byte across sibling bug-witness test files (PTQ-0232, PTQ-0310,
PTQ-0393, all resolved). b0388 is a further, disjoint occurrence — not named
in any of those three findings' cited locations — carrying the identical
double independently redeclared rather than imported, even though the same
file already imports three other `./helpers/` modules for adjacent needs.

## Suggested direction (non-binding, optional)
tests/helpers/thetalib-load-harness.ts already exports a `fakeThetaLibFs`
matching this file's copy byte-for-byte; it is the existing home this file's
own copy could import instead of redeclaring.

## False-positive check
- Gate-pin check: tests/b0388-crossfile-fnbody-effect-undercount.test.ts does
  not match `*gate*.test.ts` or the named kin; not applicable.
- Recording-double check: `fakeThetaLibFs` is a stateless, read-only double
  (it answers `readdir`/`readBytes` from a fixed map); it records no calls
  and backs no "never called" witness, so the negative-witness carve-out does
  not apply.
- docs/bugs/ signature search: docs/bugs/0388-inv4-undercount-effects-from-crossfile-fn-bodies.md
  exists; the file's own header states every witness cell is offline/unit and
  none is a documented correct-reason red — no cell in this file is left
  intentionally red against an open bug report of its own name.
- coverage-matrix/bug-doc citation search: `grep -n "b0388-crossfile-fnbody-effect-undercount"
  docs/reference/coverage-matrix.md` → 0 hits; `grep -rl "b0388-crossfile-fnbody-effect-undercount"
  docs/bugs/*.md` (excluding its own bug document) → 0 hits. This finding
  proposes no merge, rename, or deletion of the file or any `it()`/`describe()`
  inside it — only that the double's definition could import an existing
  export instead of redeclaring it.
- Prior-finding overlap check: PTQ-0232 (resolved, b0333/b0334/b0335),
  PTQ-0310 (resolved, b0303/b0304/b0305/b0306), and PTQ-0393 (resolved,
  b0448/b0450) each cover this identical `fakeThetaLibFs` double but in
  disjoint file sets; none names b0388. This wave's own d7-01/d7-02 shards
  (already in quality/intake) cover different duplicated helpers in different
  files. This is a distinct, unremediated occurrence of the same
  already-recognised gap.
- Coverage check: the claim is about a repeated double DEFINITION, not a
  missing test path; every member of the local double is exercised by this
  file's own tests.

## Triage
verdict: confirmed — independently re-verified: `diff` of tests/b0388-crossfile-fnbody-effect-undercount.test.ts:126-159 against tests/helpers/thetalib-load-harness.ts:85-119 (export keyword normalised) is empty, i.e. the local double is byte-identical to the harness export (cited ranges each omit the final closing line — one-line tail drift only); the file imports three other `./helpers/*` modules but not thetalib-load-harness, calls its own copy at :250 and :596, is not a gate test, the double records nothing, and it is uncited by coverage-matrix or any foreign bug doc; PTQ-0232/0310/0393 cover disjoint file sets, PTQ-0239 names b0388 only for the unrelated `parse` wrapper, and REVIEW_LOG 2026-09-16 shard-02 recorded this exact b0388 copy as confirmed-but-routed-away, so no tracked row owns it (triage: claude-fable-5-1)
