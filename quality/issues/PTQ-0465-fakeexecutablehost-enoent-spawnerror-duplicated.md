---
id: PTQ-0465
title: fakeExecutableHost / SpawnRecord / enoentSpawnError declared byte-for-byte in both fake-rpc-child.ts and fake-json-child.ts, the latter now the sole live consumer
lens: D7
status: open
verdict: confirmed
locations:
  - tests/helpers/fake-rpc-child.ts:36-42
  - tests/helpers/fake-rpc-child.ts:58-64
  - tests/helpers/fake-rpc-child.ts:347-352
  - tests/helpers/fake-json-child.ts:38-44
  - tests/helpers/fake-json-child.ts:89-95
  - tests/helpers/fake-json-child.ts:295-300
sites: 2
fix_scope: localized
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# fakeExecutableHost / SpawnRecord / enoentSpawnError declared byte-for-byte in both fake-rpc-child.ts and fake-json-child.ts, the latter now the sole live consumer

## Observation
`tests/helpers/fake-json-child.ts`'s own header states it is "the successor of
`fake-rpc-child.ts`" (line 2). Both files nonetheless separately declare the
identical `fakeExecutableHost()` function, an identical-shape `SpawnRecord`
interface, and an identical `enoentSpawnError()` function. Every test file
that currently imports any of these three names imports them from
`fake-json-child.ts`; no test file in the repository imports
`fakeExecutableHost`, `SpawnRecord`, or `enoentSpawnError` from
`fake-rpc-child.ts` — only the unrelated `FakeRpcChild` class is still drawn
from that file.

## Evidence
tests/helpers/fake-rpc-child.ts:36-42:
```ts
export function fakeExecutableHost(): ExecutableHost {
  return {
    argv1: "/theta/entry.js",
    execPath: "/usr/bin/node",
    fileExists: (): boolean => true,
    isGenericRuntime: (): boolean => false,
  };
}
```

tests/helpers/fake-json-child.ts:38-44:
```ts
export function fakeExecutableHost(): ExecutableHost {
  return {
    argv1: "/theta/entry.js",
    execPath: "/usr/bin/node",
    fileExists: (): boolean => true,
    isGenericRuntime: (): boolean => false,
  };
}
```
Both bodies are byte-for-byte identical.

tests/helpers/fake-rpc-child.ts:58-64:
```ts
export interface SpawnRecord {
  readonly execPath: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: Record<string, string | undefined>;
  readonly child: FakeRpcChild;
}
```

tests/helpers/fake-json-child.ts:89-95:
```ts
export interface SpawnRecord {
  readonly execPath: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: Record<string, string | undefined>;
  readonly child: FakeJsonChild;
}
```
Identical apart from the final field's own-file child-class type.

tests/helpers/fake-rpc-child.ts:347-352 / tests/helpers/fake-json-child.ts:295-300 (`enoentSpawnError`):
```ts
export function enoentSpawnError(execPath: string): Error {
  const err = new Error(`spawn ${execPath} ENOENT`) as Error & { code?: string };
  err.code = "ENOENT";
  return err;
}
```
Byte-for-byte identical in both files.

Consumer search — every test-file import of these three names:
```
$ grep -rn "makeFakeChildLauncher" tests/ --include="*.ts"
tests/helpers/fake-rpc-child.ts   (declaration + self-use only)

$ grep -rln "fakeExecutableHost\|enoentSpawnError\|SpawnRecord" tests/ --include="*.ts" \
    | grep -v "helpers/fake-json-child.ts\|helpers/fake-rpc-child.ts"
tests/b0388-crossfile-fnbody-effect-undercount.test.ts
tests/b0409-omitted-defaulted-binds-default.test.ts
tests/b0422-imported-schema-field-invisibility-load-refusal.test.ts
tests/call-with-clause-failure-arms.test.ts
tests/call-with-clause-hash-stability.test.ts
tests/call-with-clause-threading.test.ts
tests/production-subagent-query-model.test.ts
tests/quality-loop-empty-tail-return-validation.test.ts
tests/session-control-callable-set.test.ts
tests/subagent-child-env-scrub.test.ts
tests/subagent-child-launch.test.ts
tests/subagent-fn-child-launch.test.ts
tests/subagent-model-theta-tool.test.ts
```
Every one of the above imports the name from `"./helpers/fake-json-child"`.
The five test files that still import from `"./helpers/fake-rpc-child"`
(`subagent-json-driver.test.ts`, `execution-status-child-tap.test.ts`,
`execution-status-progress-wire.test.ts`,
`b0294-callee-propagated-invoke-infra-wrapped-unit.test.ts`,
`b0347-subagent-leg-propagated-mintable-wrapped-unit.test.ts`) each import
only `FakeRpcChild` (verified per-file: none names
`fakeExecutableHost`/`SpawnRecord`/`enoentSpawnError`/`makeFakeChildLauncher`
in its import list).

## Why this is a problem
Both files are still live (`FakeRpcChild` itself is imported by five test
files exercising the retired RFC-0005 wire shape), so this is not a
delete-the-whole-file situation — but the three small doubles/fixtures
(`fakeExecutableHost`, `SpawnRecord`, `enoentSpawnError`) are declared
identically in both, and `fake-json-child.ts`'s own header names itself the
successor, i.e. the canonical location once RFC 0006 landed. A reader of
`fake-rpc-child.ts` who reaches these three declarations has no signal that
an identical, actively-imported copy already exists next door in the file
that superseded this one — the file that would naturally be reached for any
of the three names is `fake-json-child.ts`, since that is where every current
importer resolves them.

## Suggested direction (non-binding, optional)
`fake-rpc-child.ts` importing these three from `fake-json-child.ts` (or a
smaller shared module) instead of re-declaring them would leave one body of
each to keep in sync; that is an observation about the natural home, not a
design.

## False-positive check
- Gate-pin carve-out: neither file matches `*gate*.test.ts` or the named gate
  kin; not applicable.
- Recording-double carve-out: `fakeExecutableHost`/`enoentSpawnError` are
  plain value/error builders, not negative-witness recording doubles;
  `SpawnRecord` is a passive data shape. The carve-out does not apply.
- docs/bugs/ signature search: `grep -rn "fakeExecutableHost\|enoentSpawnError" docs/bugs/` —
  no hits; this is not a documented correct-reason red.
- coverage-matrix / bug-doc citation search: `grep -rn "fake-rpc-child.ts\|fake-json-child.ts" docs/reference/coverage-matrix.md docs/bugs/*.md` —
  no hits naming either helper file by path; no test named by this finding is
  proposed for merge, rename, or deletion (the finding is about the three
  duplicated declarations only, not the files or the test suites that import
  them).
- Confirmed this is not a coverage claim: no assertion is made that any
  behaviour is untested; both duplicate declarations are exercised by their
  respective consumers today.

## Triage
verdict: confirmed — independently re-verified: all six excerpts match byte-for-byte at the cited lines (SpawnRecord differing only in the own-file child type); every external consumer of fakeExecutableHost/SpawnRecord/enoentSpawnError (the 13 listed test files plus tests/helpers/call-with-clause-harness.ts and parent-producer-harness.ts, which the candidate omits) imports from fake-json-child, the 5 fake-rpc-child importers pull only FakeRpcChild, and makeFakeChildLauncher/FakeChildLauncher have zero callers outside their own file, so the rpc-side copies are wholly unconsumed (the FP-check's "exercised by their respective consumers" is wrong for that side, which only strengthens the copy-paste-fixture class); both locations under tests/, no carve-out applies, and PTQ-0273/0384/0172 reference these helpers for unrelated reasons, not this duplication (triage: claude-fable-5-1)
