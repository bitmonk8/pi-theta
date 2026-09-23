---
id: PTQ-1460
title: b0428-unreadable-thetalib-refused.test.ts redeclares tests/helpers/thetalib-load-harness.ts's canonical fakeThetaLibFs member-for-member
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0428-unreadable-thetalib-refused.test.ts:62-107
  - tests/helpers/thetalib-load-harness.ts:81-135
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260923145222
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# b0428-unreadable-thetalib-refused.test.ts redeclares tests/helpers/thetalib-load-harness.ts's canonical fakeThetaLibFs member-for-member

## Observation
`tests/b0428-unreadable-thetalib-refused.test.ts` declares its own local
`fakeThetaLibFs` function (lines 62-107) that builds an in-memory `FileSystem`
double: a `readdir`/`readBytes`-only double derived from a flat path→content
map, plus an `unreadable` list of paths that are listed but whose `readBytes`
rejects EACCES. `tests/helpers/thetalib-load-harness.ts` exports a function of
the identical name, identical signature, and identical member-for-member body
(lines 81-135), including the same nine `FileSystem` member stubs, the same
`reject` rejection message, and the same `unreadableSet`/EACCES-with-`code`
shape. The local copy's own doc comment (lines 68-73) describes it as
mirroring "b0306's `fakeThetaLibFs`" rather than importing it.

## Evidence
`tests/b0428-unreadable-thetalib-refused.test.ts:62-107`:
```ts
function fakeThetaLibFs(
  files: Record<string, string>,
  unreadable: readonly string[] = [],
): FileSystem {
  const dirs = new Map<string, string[]>();
  const list = (path: string): void => {
    const slash = path.lastIndexOf("/");
    const parent = path.slice(0, slash);
    const entries = dirs.get(parent) ?? [];
    entries.push(path.slice(slash + 1));
    dirs.set(parent, entries);
  };
  for (const path of Object.keys(files)) list(path);
  for (const path of unreadable) list(path);
  const unreadableSet = new Set(unreadable);
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
      if (unreadableSet.has(path)) {
        return Promise.reject(
          Object.assign(new Error(`EACCES: permission denied, open '${path}'`), {
            code: "EACCES",
          }),
        );
      }
      const content = files[path];
      return content === undefined
        ? Promise.reject(new Error(`ENOENT: ${path}`))
        : Promise.resolve(new TextEncoder().encode(content));
    },
  } as FileSystem;
}
```

`tests/helpers/thetalib-load-harness.ts:81-135` (the exported canonical
version, same file also imported by dozens of other test files per its own
header, lines 1-41):
```ts
export function fakeThetaLibFs(
  files: Record<string, string>,
  unreadable: readonly string[] = [],
): FileSystem {
  const dirs = new Map<string, string[]>();
  const list = (path: string): void => {
    const slash = path.lastIndexOf("/");
    const parent = path.slice(0, slash);
    const entries = dirs.get(parent) ?? [];
    entries.push(path.slice(slash + 1));
    dirs.set(parent, entries);
  };
  for (const path of Object.keys(files)) list(path);
  for (const path of unreadable) list(path);
  const unreadableSet = new Set(unreadable);
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
      if (unreadableSet.has(path)) {
        return Promise.reject(
          Object.assign(new Error(`EACCES: permission denied, open '${path}'`), {
            code: "EACCES",
          }),
        );
      }
      const content = Object.prototype.hasOwnProperty.call(files, path)
        ? files[path]
        : undefined;
      return content === undefined
        ? Promise.reject(new Error(`ENOENT: ${path}`))
        : Promise.resolve(new TextEncoder().encode(content));
    },
  } as FileSystem;
}
```

The only textual difference is line 111 of the test file (`const content =
files[path]`) versus the helper's `Object.prototype.hasOwnProperty.call`
guard — a difference with no observable effect for any key present in `files`
(a `Record<string, string>` literal has no inherited enumerable string keys
that would collide with a real path).

## Why this is a problem
`tests/helpers/thetalib-load-harness.ts:1-41` documents itself as the
centralisation point precisely for this double: it names three prior
redeclaration incidents (PTQ-0232, PTQ-0310, PTQ-0393) and states that
"both now import the export below instead" for the files it fixed. The
`b0428-unreadable-thetalib-refused.test.ts` copy — including the `unreadable`
EACCES extension the PTQ-0393 fix already carries in the canonical export —
is a fourth instance of the same redeclaration, this time of the exact
capability (the `unreadable`-path EACCES branch) the helper already ships,
not a variant needing a new capability.

## Suggested direction (non-binding, optional)
`tests/helpers/thetalib-load-harness.ts`'s exported `fakeThetaLibFs` is the
natural home; the test file's own doc comment already gestures at "b0306's
fakeThetaLibFs" as the shape it mirrors.

## False-positive check
- Gate-pin check: the file is not named `*gate*.test.ts` and carries no pinned
  inventory count; the census/pin carve-out does not apply.
- Recording-double check: `fakeThetaLibFs` is a stateless in-memory
  `FileSystem` stub, not a call-recording double asserting a negative witness;
  the recording-double carve-out does not apply.
- docs/bugs/ signature search: `docs/bugs/0428-listed-but-unreadable-thetalib-silently-accepted.md` cites this test file only in its own "Gates" witness line (line 219), not as a documented correct-reason red; the file is not left red on purpose.
- coverage-matrix/bug-doc citation search: `grep -rn "b0428-unreadable-thetalib-refused" docs/reference/coverage-matrix.md docs/bugs/*.md` hits only the bug doc's witness-count line quoted above; this finding does not propose merging, renaming, or deleting the test file, only its local double.
- Distinct from the already-filed `PTQ-0553`/`PTQ-0554`/`PTQ-0623` fakeThetaLibFs findings: those cover `tests/live/acceptance/b0422live-*.test.ts`, `b0445live-*.test.ts`, `b0428live-*.test.ts` (the live-tier siblings) and other unrelated files; `tests/b0428-unreadable-thetalib-refused.test.ts` (this file, no `live` in its name) is not among their cited locations.
- Coverage drift check: this finding does not claim any behaviour is untested; both copies exercise the identical shape.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — both excerpts reproduce (local `fakeThetaLibFs` at tests/b0428-unreadable-thetalib-refused.test.ts:68-115, exported canonical at tests/helpers/thetalib-load-harness.ts:89-135; same signature, same nine member stubs, same `unreadable`/EACCES branch, only diff is the helper's `hasOwnProperty` guard with no observable effect for a plain `Record` literal); the test already imports from tests/helpers (e2e-s1) so the migration is a mechanical import swap; dedupe grep of quality/{issues,resolved,intake} for the test file hits only this candidate (the 13 prior fakeThetaLibFs filings cite other files); not a gate/pin test, not a recording double, no merge/rename/delete proposed against the bug doc's witness line (triage: claude-fable-5-1)
