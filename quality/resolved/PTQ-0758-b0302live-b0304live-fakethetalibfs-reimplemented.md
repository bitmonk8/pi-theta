---
id: PTQ-0758
title: b0302live and b0304live each redeclare fakeThetaLibFs and importCheckCodes byte-identically instead of importing tests/helpers/thetalib-load-harness.ts's already-exported fakeThetaLibFs
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/live/acceptance/b0302live-stem-twin-cycle.test.ts:194-258
  - tests/live/acceptance/b0304live-transitive-load-refusal.test.ts:159-223
  - tests/helpers/thetalib-load-harness.ts:70-93
sites: 2                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0302live and b0304live each redeclare fakeThetaLibFs and importCheckCodes byte-identically instead of importing tests/helpers/thetalib-load-harness.ts's already-exported fakeThetaLibFs

## Observation
tests/live/acceptance/b0302live-stem-twin-cycle.test.ts and
tests/live/acceptance/b0304live-transitive-load-refusal.test.ts each declare,
at module scope, a `fakeThetaLibFs(files)` in-memory `.thetalib` filesystem
double and an `importCheckCodes(thetaText, thetaPath, libs)` driver
(parse via `parseDoc`, assert the frontmatter parsed, build a
`ThetaCompositionInput`, run the real `checkThetaImports` over the double,
return the sorted error-severity codes) — both functions byte-identical
between the two files (`diff` of each function body returns no output).
Neither file imports `tests/helpers/thetalib-load-harness.ts`, which already
exports a `fakeThetaLibFs` function with the identical body, built for this
exact purpose.

## Evidence

tests/live/acceptance/b0302live-stem-twin-cycle.test.ts:194-228 —
`fakeThetaLibFs`:
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

tests/live/acceptance/b0304live-transitive-load-refusal.test.ts:159-193 — the
same function; `diff` of the two extracted bodies (re-run immediately before
filing: `sed -n '/function fakeThetaLibFs/,/^}/p'` on both files, piped to
`diff`) returns no output, confirming byte-identity.

tests/live/acceptance/b0302live-stem-twin-cycle.test.ts:234-258 —
`importCheckCodes`:
```ts
async function importCheckCodes(
  thetaText: string,
  thetaPath: string,
  libs: Record<string, string>,
): Promise<readonly string[]> {
  const app = parseDoc(thetaText, thetaPath);
  expect(
    app.frontmatter,
    `attribution: ${thetaPath} frontmatter must parse or the load pass reads nothing`,
  ).not.toBeNull();
  const input: ThetaCompositionInput = {
    slashName: "probe",
    sourcePath: thetaPath,
    frontmatter: app.frontmatter as ParsedFrontmatter,
    body: app.body,
  };
  const check = await checkThetaImports(input, {
    fs: fakeThetaLibFs(libs),
    parseDeps: parseDeps(),
  });
  return check.diagnostics
    .filter((d) => d.severity === "error")
    .map((d) => d.code)
    .sort();
}
```

tests/live/acceptance/b0304live-transitive-load-refusal.test.ts:199-223 — the
same function; `diff` of the two extracted bodies returns no output,
confirming byte-identity.

tests/helpers/thetalib-load-harness.ts:70-93 — the canonical, already-exported
`fakeThetaLibFs`, verbatim same body:
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
```
(the module's own header states it was centralised — PTQ-0232/PTQ-0393 — for
exactly this recurring `fakeThetaLibFs` double, and lists four prior files
that redeclared it before importing this export instead).

Both in-scope files' own comments attribute the double to a third file
rather than to this canonical module —
tests/live/acceptance/b0302live-stem-twin-cycle.test.ts:193 and
tests/live/acceptance/b0304live-transitive-load-refusal.test.ts:158:
```ts
/** The in-memory `.thetalib` filesystem double from tests/reexport-chain-resolution.test.ts. */
```

## Why this is a problem
This is the "Copy-paste fixtures" class: `tests/helpers/thetalib-load-harness.ts`
exports `fakeThetaLibFs` specifically because — per its own header — the
identical double was independently redeclared across a lineage of sibling bug
files (b0333/b0334/b0335, then b0448/b0450), and each redeclaration was
migrated to import the shared export instead. b0302live and b0304live add two
more byte-identical redeclarations of the same double, plus a second function
(`importCheckCodes`) that is itself byte-identical between the two files and
built directly on top of the redeclared double, neither imported from the
module whose whole purpose (by its own documented history) is serving this
exact double to files exactly like these two.

## Suggested direction (non-binding, optional)
`tests/helpers/thetalib-load-harness.ts` already exports `fakeThetaLibFs`
with the identical body these two files retype; that module is the existing
home this pair's own in-file comment ("the double from
tests/reexport-chain-resolution.test.ts") already gestures toward, one hop
short of the canonical one.

## False-positive check
- Gate-pin check: neither b0302live-stem-twin-cycle.test.ts nor
  b0304live-transitive-load-refusal.test.ts matches `*gate*.test.ts` or the
  named kin; nothing cited here is a pinned count or inventory assertion.
- Recording-double check: `fakeThetaLibFs` serves only `readdir`/`readBytes`
  reads from a static map and rejects every other member; it is not a
  recording double backing a "never called" witness, so the negative-witness
  carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0302-stem-keyed-cycle-graph.md
  (Status: fixed 0.292.0) and docs/bugs/0304-transitive-lib-diagnostics-discarded.md
  (Status: fixed 0.288.0) — neither is a documented correct-reason red; both
  files' attribution-guard assertions pass at HEAD.
- coverage-matrix/bug-doc citation search: `grep -n "b0302live\|b0304live"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of either test or its `it()` — only that the
  local `fakeThetaLibFs`/`importCheckCodes` pair could import/compose from the
  existing canonical helper — so no witness-list citation is disturbed.
- Live-suite convention check: both files' `requireLiveHost`/`failLoudly`
  live-host precondition gating is the correct fail-loudly posture per
  AGENTS.md "Live-suite conventions" and is unrelated to this finding, which
  concerns only the pre-live, offline attribution-guard helper functions.
- Coverage check: the claim is entirely about repeated helper-function
  DEFINITIONS, not a missing test path; both cited files exercise and pass
  their `importCheckCodes`/`fakeThetaLibFs` calls in the attribution-guard
  section at HEAD.
- Prior-finding overlap check: `grep -rl "b0302live\|b0304live" quality/intake
  quality/resolved` → 0 hits before this filing. The closest related tickets
  (PTQ-0232, PTQ-0393, and this wave's own
  qw20260917154546-d7-01-b0302-loadthetalibdiags-reimplemented.md) each name a
  disjoint set of files — the non-live tests/b0333/b0334/b0335,
  tests/b0448/b0450, and tests/b0302-stem-keyed-cycle-graph.test.ts
  respectively — none of which is b0302live-stem-twin-cycle.test.ts or
  b0304live-transitive-load-refusal.test.ts; this pair of live-acceptance
  files has not been previously filed.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: `fakeThetaLibFs` extracted from b0302live:194-228 and b0304live:159-193 diffs empty against each other and against tests/helpers/thetalib-load-harness.ts:85-119 with `export` stripped (35 lines each), and `importCheckCodes` at b0302live:234-258 / b0304live:199-223 diffs empty (25 lines); neither file imports the harness (each imports only ../../helpers/e2e-s1, and tests/live/harness.ts already imports production-theta-producer, so the direction has no tier obstacle) and both doc-comments attribute the double to tests/reexport-chain-resolution.test.ts's local copy rather than the canonical export — the same copy-paste-double class human-confirmed in PTQ-0232/0310/0393 and this wave's confirmed d7-02 (b0333live/b0334live/b0335live), none of whose location lists names these two files; coverage-matrix grep → 0 hits, bug docs 0302/0304 are Status fixed, and the import-only direction disturbs no `it()` or citation (triage: claude-fable-5-1)
