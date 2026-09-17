---
id: PTQ-0448
title: b0422 and b0423 each redeclare the fakeThetaLibFs double that tests/helpers/thetalib-load-harness.ts already exports
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0422-imported-schema-field-invisibility-load-refusal.test.ts:163-197
  - tests/b0423-imported-schema-bare-render-wire-names.test.ts:142-176
  - tests/helpers/thetalib-load-harness.ts:85-119
sites: 2                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0422 and b0423 each redeclare the fakeThetaLibFs double that tests/helpers/thetalib-load-harness.ts already exports

## Observation
`tests/helpers/thetalib-load-harness.ts` exports `fakeThetaLibFs(files)`: an in-memory `FileSystem` double for `.thetalib` import tests, whose own doc comment states it exists precisely so that further files stop redeclaring it ("PTQ-0393 ... both now import the export below instead"). `tests/b0422-imported-schema-field-invisibility-load-refusal.test.ts` and `tests/b0423-imported-schema-bare-render-wire-names.test.ts` — both in this wave's review scope — each declare their own local, non-exported `fakeThetaLibFs(files)` with the identical parameter shape, identical directory-derivation loop, identical member set, and the identical `"filesystem member not exercised by this test"` reject message, and neither imports the helper module. Both files' own doc comments even name the pattern's origin (b0422's comment says "the b0303 `fakeThetaLibFs`"; b0423's says "the b0422 `fakeThetaLibFs`"), tracing a copy lineage rather than an independent coincidence — but the copy lands as a fresh local declaration each time, not an import.

## Evidence

`tests/helpers/thetalib-load-harness.ts:85-119` (the canonical, exported double):
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

`tests/b0422-imported-schema-field-invisibility-load-refusal.test.ts:163-197` (local copy, not imported):
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

`tests/b0423-imported-schema-bare-render-wire-names.test.ts:142-176` (same body, own comment naming b0422 as its copy source):
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

Both local bodies are byte-for-byte identical to the exported helper apart from the missing `export` keyword. Neither file imports `./helpers/thetalib-load-harness`: `grep -n "^import" tests/b0422-imported-schema-field-invisibility-load-refusal.test.ts tests/b0423-imported-schema-bare-render-wire-names.test.ts` shows both already import `parseDeps` from `./helpers/e2e-s1` (and b0422 also imports two more helpers from `./helpers/fake-json-child`) — the pattern of importing shared test plumbing from `tests/helpers/` is already in use in both files, just not for this double. `grep -n "^function fakeThetaLibFs" tests/*.ts | grep -v helpers` returns 18 files still carrying a local, non-exported copy of this exact double, of which b0422 and b0423 are two (both in this wave's review scope).

## Why this is a problem
`tests/helpers/thetalib-load-harness.ts`'s own header states its purpose is to end exactly this repeated declaration (tracing PTQ-0310 and PTQ-0393 as its motivating fixes), and two sibling gate files (`b0448`, `b0450`) already migrated to it with no behavioural change, proving it a drop-in replacement. b0422 and b0423 continue to declare their own copy — each one's own doc comment even names the immediately-prior file's `fakeThetaLibFs` as the pattern being mirrored — so the duplication is a traced copy lineage across in-scope files, not independent convergent design.

## Suggested direction (non-binding, optional)
Importing `fakeThetaLibFs` from `tests/helpers/thetalib-load-harness.ts` (as `b0448` and `b0450` already do) is the natural next step the helper's own existing adoption elsewhere demonstrates; the fix stage owns the actual migration.

## False-positive check
- Gate-pin check: neither `b0422-imported-schema-field-invisibility-load-refusal.test.ts` nor `b0423-imported-schema-bare-render-wire-names.test.ts` matches `*gate*.test.ts` or any other census/pin naming kin; neither file asserts a pinned count or inventory this finding would disturb — the claim is only about where the `fakeThetaLibFs` FUNCTION is defined.
- Recording-double check: `fakeThetaLibFs` reads/rejects filesystem calls from a fixed map; it records no calls and backs no "never called" witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rn "fakeThetaLibFs" docs/bugs/*.md` → 0 hits; neither `docs/bugs/0422-imported-schema-field-invisibility-renders-undefined.md` nor `docs/bugs/0423-imported-schema-bare-render-theta-side-names.md` documents a reason to keep the double local, and neither test file carries a "left red on purpose" status.
- coverage-matrix/bug-doc citation search: `grep -n "b0422-imported-schema-field-invisibility-load-refusal\|b0423-imported-schema-bare-render-wire-names" docs/reference/coverage-matrix.md` → 0 hits. Both file names ARE cited by name inside their own bug docs' "Gates: witness" lines (`docs/bugs/0422-...md:274`, `docs/bugs/0423-...md:213`) and `docs/bugs/0452-...md:58` cites a specific line inside b0422. This finding proposes no merge, rename, or deletion of either file and touches no `it()`/`describe()` name, count, or assertion — only where the internal `fakeThetaLibFs` helper is defined — so those citations are unaffected.
- Coverage check: the claim is entirely about a repeated harness DEFINITION persisting after its own motivating fix landed elsewhere as an exported helper; both copies are exercised by the tests in their own files, so this is not a coverage-gap claim.
- Duplicate check: distinct from PTQ-0310 (four other files) and PTQ-0393 (`b0448`/`b0450`, status: fixed) and from this same wave's already-filed `qw20260917154546-d7-01-b0388-fakethetalibfs-duplicated.md` and `qw20260917154546-d7-05-b0406-faketheatlibfs-copy-pasted.md` — all name different file sets. b0422 and b0423 are not cited as instances in any of those four filings.

## Triage
verdict: confirmed — independently re-verified: diffed the three bodies (helper :85-119 minus `export`, b0422 :163-197, b0423 :142-176) byte-identical; neither file imports ./helpers/thetalib-load-harness (both already import parseDeps from ./helpers/e2e-s1); `grep -l "^function fakeThetaLibFs" tests/*.ts | grep -v helpers` = 18 files; b0448/b0450 import the export at :11 proving drop-in; both copies live (2 call sites each); D7 copy-paste double class, in tests/, no gate/pin or recording-double carve-out, 0 coverage-matrix hits, the one docs/bugs hit (0304:280) records the duplication as debt; resolved PTQ-0310 (b0303-b0306) and PTQ-0393 (b0448/b0450) and same-wave b0388/b0406 filings name disjoint file sets, so not a duplicate (triage: claude-fable-5-1)
