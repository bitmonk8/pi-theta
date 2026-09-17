---
id: PTQ-0704
title: subagent-fn.test.ts redeclares fakeThetaLibFs byte-for-byte instead of importing tests/helpers/thetalib-load-harness.ts's canonical export
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/subagent-fn.test.ts:1625-1664
  - tests/helpers/thetalib-load-harness.ts:81-108
sites: 2
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# subagent-fn.test.ts redeclares fakeThetaLibFs byte-for-byte instead of importing tests/helpers/thetalib-load-harness.ts's canonical export

## Observation
`tests/subagent-fn.test.ts` declares a module-local `fakeThetaLibFs(files: Record<string, string>): FileSystem` double, used by its final two `describe` blocks to drive `checkThetaImports` over an in-memory `.thetalib` tree. `tests/helpers/thetalib-load-harness.ts` already exports a `fakeThetaLibFs` of the identical shape, and its own header states it was created specifically because this double had already been "independently redeclared" across several files (naming PTQ-0232, PTQ-0315, PTQ-0347, PTQ-0393) before being centralised. `subagent-fn.test.ts` does not import that module.

## Evidence

`tests/subagent-fn.test.ts:1625-1664`:
```ts
/**
 * A minimal in-memory `FileSystem` exposing only the `readdir` / `readBytes`
 * members `checkThetaImports` reads; every other member rejects (unexercised).
 */
function fakeThetaLibFs(files: Record<string, string>): FileSystem {
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
      const content = files[path];
      return content === undefined
        ? Promise.reject(new Error(`ENOENT: ${path}`))
        : Promise.resolve(new TextEncoder().encode(content));
    },
  };
}
```

`tests/helpers/thetalib-load-harness.ts:81-108` — the pre-existing canonical export, same map-derived directory listing, same `readdir`/`readBytes` serving pair, same "every other member rejects loudly" shape:
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

The two declarations are functionally identical (the only textual difference is an unused local `name` binding vs. an inline `path.slice(...)` in the loop body, and a trailing `as FileSystem` cast in the helper).

## Why this is a problem
`tests/helpers/thetalib-load-harness.ts`'s own header documents that this exact double was independently redeclared across multiple files before the module was created to hold it, and lists the prior redeclaration sites by their PTQ number. `tests/subagent-fn.test.ts` is a further instance of the same redeclaration that the helper module's own stated purpose was to eliminate — it is not one of the four files whose redeclaration the header enumerates, and it does not import the module.

## Suggested direction (non-binding, optional)
`tests/helpers/thetalib-load-harness.ts`'s exported `fakeThetaLibFs` already covers this shape; importing it in place of the local declaration is the direction the module's own stated purpose points toward. This finding does not propose merging, renaming, or deleting `tests/subagent-fn.test.ts` or any of its `describe`/`it` blocks — only relocating the one duplicated function declaration.

## False-positive check
- Gate-pin check: `tests/subagent-fn.test.ts` does not match `*gate*.test.ts` or any named kin; not applicable.
- Recording-double check: `fakeThetaLibFs` is a stub double (canned `readdir`/`readBytes` answers over a fixed map), not a recording double backing a "never called" MUST-NOT assertion; the carve-out does not apply.
- docs/bugs/ signature search: `grep -rn "subagent-fn.test.ts:1581" docs/bugs/*.md` returns hits in docs/bugs/0058, 0100, and 0101, each citing `tests/subagent-fn.test.ts:1581–1614` (an earlier line range, since drifted as the file grew) as "the in-memory `FileSystem` shape this report's probes reuse" — i.e. this double is cited BY NAME in three bug docs' witness lists, pinning the test. This finding proposes no merge, rename, or deletion of `tests/subagent-fn.test.ts` or the `fakeThetaLibFs` symbol itself (only its relocation to an existing helper module, preserving the name and shape those bug docs point at) — stated explicitly here per the citation carve-out.
- coverage-matrix citation search: `grep -n "subagent-fn.test.ts" docs/reference/coverage-matrix.md` → 0 hits.
- Coverage drift check: this finding does not claim a missing test or an untested path; it identifies a duplicated helper function definition, leaving the file's tests and assertions untouched.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: tests/subagent-fn.test.ts:1629-1664 declares a module-local fakeThetaLibFs that my diff against tests/helpers/thetalib-load-harness.ts:85-113's export differs only by the `export` keyword, an unused `name` local vs inline `path.slice(...)`, and the trailing `as FileSystem` cast; the file's import block (lines 1-89) never imports thetalib-load-harness and the local copy is live (called at 1678 and 1705); in-scope D7 copy-paste double under tests/, not a gate or recording double; the bug-doc citations (docs/bugs/0058, 0100, 0101 → `subagent-fn.test.ts:1581–1614` shape reference) reproduce and the filing proposes no merge/rename/delete of the pinned test; not a duplicate — resolved PTQ-0232/0310/0393 cover b0333-35, b0303-06 and b0448/b0450 respectively, none lists subagent-fn.test.ts, no open issue mentions it, and the two same-wave sibling fakeThetaLibFs candidates cite other files (triage: claude-fable-5-1)
