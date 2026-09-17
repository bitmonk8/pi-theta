---
id: PTQ-0623
title: b0445 redeclares the fakeThetaLibFs double that tests/helpers/thetalib-load-harness.ts already exports
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0445-imported-renames-static-container-positions.test.ts:173-211
  - tests/helpers/thetalib-load-harness.ts:70-102
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0445 redeclares the fakeThetaLibFs double that tests/helpers/thetalib-load-harness.ts already exports

## Observation
`tests/helpers/thetalib-load-harness.ts` exports `fakeThetaLibFs(files)`: an
in-memory `FileSystem` double for `.thetalib` import tests, deriving a
directory listing from a flat path→content map, serving only `readdir` /
`readBytes`, and rejecting every other member with the fixed message
"filesystem member not exercised by this test". `tests/b0445-imported-renames-static-container-positions.test.ts`
declares its own module-scope `fakeThetaLibFs(files)` with the identical
parameter shape, identical directory-derivation loop, identical member set,
and the identical reject message, rather than importing the export. The file
already imports `parseDeps` from `./helpers/e2e-s1` in the same import block,
so importing a second `./helpers/*` module is not a new pattern for it.

## Evidence
tests/b0445-imported-renames-static-container-positions.test.ts:179-211:
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

tests/helpers/thetalib-load-harness.ts:74-102 (the canonical export, byte-for-byte the same body):
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
The two bodies are identical line-for-line (including the reject message and
the field order in the returned object literal).

## Why this is a problem
The two declarations are the same fixture, maintained in two places. The
helper module's own header (tests/helpers/thetalib-load-harness.ts:1-38)
documents that this exact double was previously redeclared in several files
(b0333/b0334/b0335, then b0448/b0450) and centralised for that reason
(PTQ-0232, PTQ-0393); b0445 is a further, unremediated instance of the same
double that the helper already exports and that other files in this same
bug-cluster (b0448, b0450) already import.

## Suggested direction (non-binding, optional)
tests/helpers/thetalib-load-harness.ts is the existing natural home for this
double; b0445 could import its `fakeThetaLibFs` export the same way
tests/b0448-imported-non-object-ctor.test.ts and
tests/b0450-imported-enum-system-param.test.ts already do.

## False-positive check
Gate-pin: not a `*gate*.test.ts` file; the pinned-count carve-out does not
apply. Recording-double: `fakeThetaLibFs` is a fail-closed resource stub, not
a call-recording MUST-NOT witness — the carve-out for negative witnesses
through recording doubles does not apply. docs/bugs/ search: grepped
"fakeThetaLibFs" across docs/bugs/ — no hit; this is not a documented
correct-reason red. coverage-matrix/bug-doc citation search: grepped
"b0445-imported-renames-static-container-positions.test.ts" (by file name and
by title fragments "array face", "nested face") across
docs/reference/coverage-matrix.md and docs/bugs/*.md — no hit; the test is
not cited by name elsewhere, so no merge/rename/delete disclosure is owed.
This finding does not propose a coverage change — it observes an existing
duplicate of a fixture a canonical helper already exports.

## Triage
verdict: confirmed — independently re-verified: b0445:179-211 extracted and diffed against tests/helpers/thetalib-load-harness.ts:85-117 (the export drifted 11 lines from the cited 74-102 as the header grew) with `export` stripped → empty diff, byte-identical including reject string and member order; b0445 imports only ./helpers/e2e-s1 (line 9) while b0448:11 and b0450:11 already import fakeThetaLibFs from ./helpers/thetalib-load-harness exactly as the direction proposes; suite passes 6/6 at HEAD and docs/bugs/0445 reads fixed (0.457.0); D7 copy-paste-double class, all locations under tests/, no carve-out applies (not a gate file, stateless fail-closed stub not a recording double, no open-bug red, import-only direction proposes no merge/rename/delete so the docs/bugs/0445:251 witness pin is untouched); dedupe clean — resolved PTQ-0232 (b0333-35), PTQ-0310 (b0303-06), PTQ-0393 (b0448/b0450) and the same-wave siblings (import-required pair, b0422live/b0445live/b0428live trio, b0333-35live trio) all cite disjoint file sets, so this is a distinct residual of the same thrice-confirmed class. Two non-blocking FP-check inaccuracies for the record: `fakeThetaLibFs` does hit docs/bugs/0304:280 (a residual note that itself flags this duplication and recommends the tests/helpers hoist), and "array face"/"nested face" hit docs/bugs/0442 and 0445 as prose, not as test citations — neither changes the outcome (triage: claude-fable-5-1)
