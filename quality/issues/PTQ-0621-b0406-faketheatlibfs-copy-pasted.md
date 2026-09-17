---
id: PTQ-0621
title: b0406's w7FakeFs is a byte-identical copy of the canonical fakeThetaLibFs exported by tests/helpers/thetalib-load-harness.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0406-object-typed-params-misclassified-string.test.ts:59-93
  - tests/helpers/thetalib-load-harness.ts:85-116
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0406's w7FakeFs is a byte-identical copy of the canonical fakeThetaLibFs exported by tests/helpers/thetalib-load-harness.ts

## Observation
`tests/helpers/thetalib-load-harness.ts` exports `fakeThetaLibFs(files)` — an in-memory `FileSystem` double for `.thetalib` import tests, whose own doc comment states its shape: `readdir`/`readBytes` answer from a flat path→content map with directory listings derived from the map's own keys, and every other member rejects with the fixed message `"filesystem member not exercised by this test"`. `tests/b0406-object-typed-params-misclassified-string.test.ts` declares a local `w7FakeFs(files)` with the identical parameter shape, identical directory-derivation loop, identical member set, and the identical reject message, and does not import the helper. This exact double (traced under this same reject-message string) is already the subject of two resolved findings (PTQ-0310, PTQ-0393) against four other files; b0406 is a further, unremediated instance not covered by either.

## Evidence

`tests/b0406-object-typed-params-misclassified-string.test.ts:59-93`:
```ts
function w7FakeFs(files: Record<string, string>): FileSystem {
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

`tests/helpers/thetalib-load-harness.ts:85-116` (the canonical export, byte-identical body apart from the function name):
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

The two functions are byte-for-byte identical apart from the function name (`w7FakeFs` vs. `fakeThetaLibFs`) and the `export` keyword. `grep -rl "filesystem member not exercised by this test" tests/*.ts` → 20 files still carry this fixed reject-message string, `b0406-object-typed-params-misclassified-string.test.ts` among them; `grep -n "fakeThetaLibFs\|thetalib-load-harness" tests/b0406-object-typed-params-misclassified-string.test.ts` → 0 hits, confirming no import.

## Why this is a problem
`fakeThetaLibFs` is an exported, adopted helper (PTQ-0310 and PTQ-0393, both status: fixed, each migrated a batch of files from their own local copy of this exact double onto this export). b0406 declares the same double under a different local name (`w7FakeFs`) with a body that is byte-for-byte identical to the export, rather than importing it — a copy-paste fixture the canonical helper already exists to replace.

## Suggested direction (non-binding, optional)
Importing `fakeThetaLibFs` from `tests/helpers/thetalib-load-harness.ts` in place of the local `w7FakeFs` definition is the same migration PTQ-0310 and PTQ-0393 already performed for eight other files; the fix stage owns the actual import/rename.

## False-positive check
- Gate-pin check: `tests/b0406-object-typed-params-misclassified-string.test.ts` does not match `*gate*.test.ts` or the named kin; `w7FakeFs` is a fixture double, not a pinned count or inventory assertion.
- Recording-double check: `w7FakeFs`'s `readdir`/`readBytes` answer from a static map and its other members reject; it records no calls and backs no "never called" witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `docs/bugs/0406-object-typed-params-misclassified-string.md` carries no "left red"/documented-correct-reason-red status; `npx vitest run tests/b0406-object-typed-params-misclassified-string.test.ts` passes at HEAD (W1-W7/G1-G2 all execute as scripted).
- coverage-matrix/bug-doc citation search: `grep -n "b0406-object-typed-params-misclassified-string" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of the file or any `it()`/`describe()` — only that the local `w7FakeFs` definition could import the existing `fakeThetaLibFs` export.
- Coverage check: the claim is about a repeated fixture DEFINITION; the file's own W1-W7/G1-G2 tests exercise it directly (confirmed passing above), so this is not a coverage-gap claim.
- Duplicate check: distinct from PTQ-0310 (b0303/b0304/b0305/b0306) and PTQ-0393 (b0448/b0450), both status: fixed and neither naming b0406; this is a further, unremediated instance of the same clone-map family, in this wave's own review scope.

## Triage
verdict: confirmed — independently re-verified: w7FakeFs (b0406 :59-93) diffed against the harness export (:85-119, candidate's :85-116 is a 3-line drift on an otherwise complete excerpt) is byte-identical after normalising the name and `export`; both stated greps reproduce (20 files carry the reject string incl. b0406; 0 hits for fakeThetaLibFs/thetalib-load-harness in b0406); both call sites (:119, :260) are live and b0448/b0450 prove the export is a drop-in; D7 copy-paste-double class confined to tests/, no gate/pin, non-recording double, green at HEAD, 0 coverage-matrix hits; resolved PTQ-0310 (b0303-b0306), PTQ-0393 (b0448/b0450) and PTQ-0256 (b0406's errorCodes helper, different root cause) plus every same-wave fakeThetaLibFs sibling filing name disjoint file sets/helpers, so not a duplicate (triage: claude-fable-5-1)
