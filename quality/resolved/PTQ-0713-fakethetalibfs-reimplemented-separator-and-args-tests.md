---
id: PTQ-0713
title: fakeThetaLibFs is reimplemented in both import-specifier-separator-production-required.test.ts and imported-thetalib-fn-call-args-checked.test.ts instead of importing the exported helper in tests/helpers/thetalib-load-harness.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/import-specifier-separator-production-required.test.ts:313-347
  - tests/imported-thetalib-fn-call-args-checked.test.ts:285-325
  - tests/helpers/thetalib-load-harness.ts:85-119
sites: 2                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# fakeThetaLibFs is reimplemented in both import-specifier-separator-production-required.test.ts and imported-thetalib-fn-call-args-checked.test.ts instead of importing the exported helper in tests/helpers/thetalib-load-harness.ts

## Observation
Both files in this review's scope declare their own module-scope
`fakeThetaLibFs(files: Record<string, string>): FileSystem` — an in-memory
`.thetalib` filesystem double that derives a directory listing from a flat
path→content map, serves only `readdir` / `readBytes`, and rejects every
other `FileSystem` member. `tests/helpers/thetalib-load-harness.ts` already
exports a function of the same name doing the same thing, and its header
comment records that this exact double was independently redeclared across
several other test files before being centralised there (PTQ-0232, PTQ-0393).
Neither of the two in-scope files imports anything from
`tests/helpers/thetalib-load-harness.ts`; both import only `parseDeps`
(one also `parseDoc`) from `tests/helpers/e2e-s1`.

## Evidence
tests/import-specifier-separator-production-required.test.ts:313-347:
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
  };
}
```

tests/imported-thetalib-fn-call-args-checked.test.ts:285-325 — the same
double, with a `Object.prototype.hasOwnProperty.call` read in `readBytes` and
a doc-comment explaining that variance, and no `Map`-vs-null-prototype
behavioural change:
```ts
function fakeThetaLibFs(files: Record<string, string>): FileSystem {
  // Null-prototype for the parent→entries map's key space is unnecessary here
  // (a `Map` is used), but the `files` record is author-keyed and read below
  // with an explicit `=== undefined` test rather than a truthiness test.
  const dirs = new Map<string, string[]>();
  for (const path of Object.keys(files)) {
    const slash = path.lastIndexOf("/");
    const parent = path.slice(0, slash);
    const name = path.slice(slash + 1);
    const entries = dirs.get(parent) ?? [];
    entries.push(name);
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
      const content = Object.prototype.hasOwnProperty.call(files, path)
        ? files[path]
        : undefined;
      return content === undefined
        ? Promise.reject(new Error(`ENOENT: ${path}`))
        : Promise.resolve(new TextEncoder().encode(content));
    },
  };
}
```

The canonical, already-exported helper, tests/helpers/thetalib-load-harness.ts:85-119:
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

Import check: `grep -n "helpers/" tests/import-specifier-separator-production-required.test.ts` → only line 12,
`import { parseDeps } from "./helpers/e2e-s1";`. `grep -n "helpers/"
tests/imported-thetalib-fn-call-args-checked.test.ts` → only line 12,
`import { parseDeps, parseDoc } from "./helpers/e2e-s1";`, plus a prose
comment at line 126. Neither file imports from
`tests/helpers/thetalib-load-harness.ts`.

## Why this is a problem
`tests/helpers/thetalib-load-harness.ts`'s own header names this exact
"in-memory `.thetalib` FileSystem double" as centralised specifically because
it had been independently redeclared across multiple test files (citing
PTQ-0232 and PTQ-0393 as the prior migrations), and it is exported for reuse.
The two files in this review's scope each pay the identical directory-listing
derivation, the identical `reject` sentinel, and the identical ten-member
`FileSystem` stub a second and third time rather than importing the one
already in scope for every other file that drives `checkThetaImports` over an
in-memory `.thetalib` tree. The only textual difference between the two
in-scope copies (an `Object.prototype.hasOwnProperty.call` guard versus a bare
index read in `readBytes`, both behaviourally equivalent for a `files` object
literal with no inherited enumerable keys) is not a variation either file's
own tests rely on.

## Suggested direction (non-binding, optional)
`tests/helpers/thetalib-load-harness.ts` already exports `fakeThetaLibFs` for
exactly this use; importing it is the path already taken by
`tests/b0448-imported-non-object-ctor.test.ts` and
`tests/b0450-imported-enum-system-param.test.ts` per that helper's own header
note.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate kin
  (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate); this is not
  a pinned-count/inventory gate.
- Recording-double check: `fakeThetaLibFs` is a stub `FileSystem` that
  rejects on every unused member; it records no calls and backs no
  "never called" MUST-NOT witness, so the negative-witness carve-out does not
  apply.
- docs/bugs/ signature search: `grep -rl "fakeThetaLibFs" docs/bugs/` → one
  hit, `docs/bugs/0304-transitive-lib-diagnostics-discarded.md`, which calls
  the duplication (as of that 2026-era fix record, before
  `tests/helpers/thetalib-load-harness.ts` existed) "repo-tolerated
  duplication" and recommends "a `tests/helpers` hoist would prevent drift" —
  that hoist is exactly `tests/helpers/thetalib-load-harness.ts`, created
  later per PTQ-0232/PTQ-0393; neither of docs/bugs/0211 or docs/bugs/0138
  (the bug docs for the two in-scope files) mentions `fakeThetaLibFs` as a
  documented correct-reason for keeping a local copy.
- coverage-matrix/bug-doc citation search: `grep -n
  "import-specifier-separator-production-required\|imported-thetalib-fn-call-args-checked"
  docs/bugs/0211-separator-degenerate-specifier-lists-parse-clean.md
  docs/bugs/0138-imported-thetalib-fn-arg-route-deferred.md` → both files are
  named in their own bug docs' witness lists (0211 line 813/839, 0138 line
  912/925); this finding proposes no rename, merge, or deletion of any
  `it()`/`describe()` in either file, only relocating the shared
  `fakeThetaLibFs` double to the already-exported helper, so the citation is
  unaffected. `grep -n` for either filename in
  `docs/reference/coverage-matrix.md` → 0 hits.
- Coverage check: the claim is about a repeated double DEFINITION, not a
  missing test path; every call site in both files is already exercised by
  that file's own tests.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — all three excerpts reproduce at the cited lines (sep:313-347, args:285-325, harness:85-119); independent re-diff shows the separator copy byte-identical to the harness export apart from `export`/`as FileSystem`, and the args copy diverging only by a comment, a `name` local and the `hasOwnProperty` guard (behaviourally equivalent — `checkThetaImports` requests only `/proj/...` paths); both call sites (:366, :368) feed the double straight into `checkThetaImports` exactly as the harness does; `grep -n "helpers/"` reproduces (only `./helpers/e2e-s1` at line 12 in each), docs/bugs grep → only 0304 (which itself asks for the hoist), coverage-matrix 0 hits, bug-doc witness lists cite the files but no it()/describe() is renamed/merged/deleted; no D7 carve-out applies (not a gate, stateless non-recording double, not tests/live); dedupe verified — PTQ-0310 (b0303–b0306) and PTQ-0393 (b0448/b0450) are this same double in disjoint file sets, PTQ-0239 / same-wave d7-16 are the disjoint `parse` wrapper root cause, and the same-wave d7-01 "import-required pair" covers the two other `import-*-required` files — so this is a distinct residual of the already-thrice-confirmed copy-paste-double class (triage: claude-fable-5-1)
