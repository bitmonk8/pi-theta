---
id: PTQ-0493
title: reexport-chain-resolution.test.ts redeclares tests/helpers/thetalib-load-harness.ts's exported fakeThetaLibFs instead of importing it
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/reexport-chain-resolution.test.ts:264-298
  - tests/helpers/thetalib-load-harness.ts:79-107
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# reexport-chain-resolution.test.ts redeclares tests/helpers/thetalib-load-harness.ts's exported fakeThetaLibFs instead of importing it

## Observation
tests/reexport-chain-resolution.test.ts declares a module-scope
`fakeThetaLibFs` function whose own doc comment states its double's shape
("only `readdir` / `readBytes` exercised, every other member rejecting so an
unexpected call reds") "is the one tests/subagent-fn.test.ts:1581-1616 and
tests/import-export-from-clause-required.test.ts:246-281 use" — an explicit
acknowledgement that this exact double recurs elsewhere. It is, in fact,
also already exported as `fakeThetaLibFs` from tests/helpers/thetalib-load-harness.ts,
whose own header states it centralises exactly this in-memory `.thetalib`
filesystem double (PTQ-0393) precisely so files reimplementing it "instead
import it". reexport-chain-resolution.test.ts's local copy is byte-identical
to the exported one and is not one of the files that migrated onto it.

## Evidence

tests/reexport-chain-resolution.test.ts:264-298 (the local declaration):
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

tests/helpers/thetalib-load-harness.ts:79-107 (the exported equivalent,
identical apart from the leading `export` keyword):
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

## Why this is a problem
The two function bodies are identical statement-for-statement. Both take the
same `Record<string, string>` map and return the same `FileSystem`-shaped
double, exercising only `readdir`/`readBytes` and rejecting every other
member with the same message. reexport-chain-resolution.test.ts's own doc
comment already names two OTHER files that share this exact double
(tests/subagent-fn.test.ts and
tests/import-export-from-clause-required.test.ts) without noting that a
fourth, already-exported copy of the very same function exists in
tests/helpers/thetalib-load-harness.ts and is the canonical helper the repo
built specifically to stop this double from being retyped file by file
(the helper's own header cites PTQ-0393 as the reason two earlier files'
copies were centralised there).

## Suggested direction (non-binding, optional)
tests/helpers/thetalib-load-harness.ts already exports `fakeThetaLibFs` with
this exact signature and body; reexport-chain-resolution.test.ts's own
`measure` helper could obtain its `FileSystem` double from that import
instead of the local declaration, which is an observation about the existing
canonical helper's fit, not a design proposal.

## False-positive check
- Gate-pin check: reexport-chain-resolution.test.ts is not named
  `*gate*.test.ts` and is not one of the named gate kin; nothing cited here
  is a pinned count or inventory assertion.
- Recording-double check: `fakeThetaLibFs` records nothing and backs no
  MUST-NOT-be-called witness — it is a pure in-memory read/list double, so the
  negative-witness carve-out does not apply.
- docs/bugs/ signature search: this finding does not allege a red test or a
  skip in either file, so no docs/bugs/ correct-reason-red signature applies.
- coverage-matrix/bug-doc citation search: `grep -rn "reexport-chain-resolution"
  docs/reference/coverage-matrix.md docs/bugs/` returns no hits in either;
  this finding proposes no merge, rename, or deletion of the test, only the
  local re-declaration of an already-exported helper.
- Coverage-drift check: the claim is about a duplicated fixture DEFINITION
  that exists today in both places, not a missing test path.

## Triage
verdict: confirmed — independently re-verified: local declaration at tests/reexport-chain-resolution.test.ts:264-298 is live (called at :362) and diffs byte-identical (export keyword normalised, empty diff) against the canonical export, which has drifted to tests/helpers/thetalib-load-harness.ts:85-119 (the bug-0479 comment shifted it 6 lines); the file imports only ./helpers/e2e-s1, never ./helpers/thetalib-load-harness; not a duplicate — PTQ-0232 (b0333-b0335), PTQ-0310 (b0303-b0306) and PTQ-0393 (b0448/b0450) cover disjoint file sets and the store has twice ruled residual copies of this exact helper a distinct confirmable D7 copy-paste-double; one correction: the candidate's claimed zero docs/bugs/ hits is wrong (15 hits), but none pins the local declaration — bug 0101 names the file as a 22-cell witness (still 22/22 green at HEAD, no red/skip) and bug 0304 residual 3 explicitly names this file's fakeThetaLibFs copy as the duplication a tests/helpers hoist should absorb, so the citations support rather than guard against the import; no gate file, stateless non-recording double, no merge/rename/delete proposed (triage: claude-fable-5-1)
