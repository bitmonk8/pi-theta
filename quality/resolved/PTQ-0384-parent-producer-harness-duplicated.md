---
id: PTQ-0384
title: b0328 and b0343 redeclare an identical seven-function spawnSubagentConversation producer harness
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0328-root-closure-hash-marshalled.test.ts:208-279
  - tests/b0343-proto-hash-carrier-row.test.ts:97-164
sites: 2                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260916144930
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-16
---

# b0328 and b0343 redeclare an identical seven-function spawnSubagentConversation producer harness

## Observation
tests/b0328-root-closure-hash-marshalled.test.ts and
tests/b0343-proto-hash-carrier-row.test.ts each declare the same seven
module-scope functions for driving the real `spawnSubagentConversation`
producer over a fake JSON child launcher: `rootDouble` (a `RuntimeRoot`
double wiring an inline no-op checkpoint, a fixed `idSource`, and a `clock`
whose `setTimeout`/`clearTimeout` forward to the ambient timers), `noopPi`,
`queryBody`, `makeParentDeps` (wraps `createProductionProducerDeps` around
the double plus a stub `parseCallee` and `makeFakeJsonChildLauncher()`),
`parentBindInput`, `carrierRaw`, and `marshalledHashes`. Every one of the
seven function bodies is byte-identical between the two files; the only
difference in the whole block is that b0343's copy omits two comment lines
b0328's carries. Neither file imports this harness from
`tests/helpers/`. A third, non-identical (differently parameterised) cousin
of the same lineage lives in tests/subagent-model-theta-tool.test.ts, which
b0328's own header comment names as this harness's origin ("Mirrors the (B)
harness in tests/subagent-model-theta-tool.test.ts").

## Evidence

tests/b0328-root-closure-hash-marshalled.test.ts:208-220 (`rootDouble`):
```ts
function rootDouble(): RuntimeRoot {
  return {
    checkpoint: { before: () => Promise.resolve() },
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
    // The model pre-flight + child teardown measure on the injected Clock; wire
    // the ambient timers so the seams resolve.
    clock: {
      wallNow: () => 0,
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    },
  } as unknown as RuntimeRoot;
}
```

tests/b0343-proto-hash-carrier-row.test.ts:97-107 (`rootDouble`, identical
apart from the two comment lines above):
```ts
function rootDouble(): RuntimeRoot {
  return {
    checkpoint: { before: () => Promise.resolve() },
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
    clock: {
      wallNow: () => 0,
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    },
  } as unknown as RuntimeRoot;
}
```

tests/b0328-root-closure-hash-marshalled.test.ts:238-248 (`makeParentDeps`
opening):
```ts
function makeParentDeps(): {
  readonly deps: ReturnType<typeof createProductionProducerDeps>;
  readonly launcher: ReturnType<typeof makeFakeJsonChildLauncher>;
} {
  const launcher = makeFakeJsonChildLauncher();
  const deps = createProductionProducerDeps({
    pi: noopPi(),
    root: rootDouble(),
    modelRegistry: {
      getApiKeyAndHeaders: () => Promise.resolve({ ok: false }),
    } as unknown as ModelRegistry,
```

tests/b0343-proto-hash-carrier-row.test.ts:125-135 (`makeParentDeps`
opening, byte-identical):
```ts
function makeParentDeps(): {
  readonly deps: ReturnType<typeof createProductionProducerDeps>;
  readonly launcher: ReturnType<typeof makeFakeJsonChildLauncher>;
} {
  const launcher = makeFakeJsonChildLauncher();
  const deps = createProductionProducerDeps({
    pi: noopPi(),
    root: rootDouble(),
    modelRegistry: {
      getApiKeyAndHeaders: () => Promise.resolve({ ok: false }),
    } as unknown as ModelRegistry,
```

tests/b0328-root-closure-hash-marshalled.test.ts:272-279 (`carrierRaw` +
`marshalledHashes`):
```ts
function carrierRaw(env: Record<string, string | undefined>): string | undefined {
  return env[SUBAGENT_CALLABLE_HASHES_ENV];
}

function marshalledHashes(env: Record<string, string | undefined>): Record<string, string> {
  const raw = carrierRaw(env);
  return raw === undefined ? {} : (JSON.parse(raw) as Record<string, string>);
}
```

tests/b0343-proto-hash-carrier-row.test.ts:157-164 (byte-identical):
```ts
function carrierRaw(env: Record<string, string | undefined>): string | undefined {
  return env[SUBAGENT_CALLABLE_HASHES_ENV];
}

function marshalledHashes(env: Record<string, string | undefined>): Record<string, string> {
  const raw = carrierRaw(env);
  return raw === undefined ? {} : (JSON.parse(raw) as Record<string, string>);
}
```

The remaining three functions are also byte-identical, confirmed by direct
read: `noopPi` (b0328:222-224 / b0343:109-111), `queryBody`
(b0328:226-236 / b0343:113-123), `parentBindInput` (b0328:263-270 /
b0343:148-155), and `makeParentDeps`'s own closing lines
(b0328:249-261 / b0343:136-146, differing only in the two comment lines
already noted).

Exact searches, `tests/**/*.test.ts`:
- `grep -rn "^function makeParentDeps" tests --include="*.test.ts"` → 3 hits:
  b0328:238, b0343:125, and subagent-model-theta-tool.test.ts:369 (this third
  copy takes a `parseCalleeSpy` and an `opts` bag `makeParentDeps` in b0328/
  b0343 does not — a diverged cousin, not a byte-identical third copy).
- `grep -rn "^function carrierRaw" tests --include="*.test.ts"` → exactly 2
  hits: b0328:272, b0343:157 (subagent-model-theta-tool.test.ts inlines the
  env read directly into its own `marshalledHashes` instead).
- `grep -rn "^function parentBindInput" tests --include="*.test.ts"` → 3 hits,
  the same three files; the b0328/b0343 bodies are byte-identical, the
  subagent-model-theta-tool.test.ts one carries an extra comment.

## Why this is a problem
The seven-function harness — a `RuntimeRoot` double with an inline clock, a
no-op `pi`, a stub query body, a `createProductionProducerDeps` wrapper
around a fake JSON child launcher, a bind-input builder, and the two
carrier-parsing helpers — is repeated as one unit rather than shared: every
line of it is identical between the two files bar two comments. b0328's own
header comment already names tests/subagent-model-theta-tool.test.ts as the
harness's origin ("Mirrors the (B) harness in …"), showing this shape was
carried forward by copying once already before b0343 copied it a second
time from b0328. `tests/helpers/fake-json-child.ts` already hosts the
`makeFakeJsonChildLauncher`/`fakeExecutableHost` pieces both files build on
top of, but no module holds the surrounding producer-wiring shape itself, so
each file re-derives it in place.

## Suggested direction (non-binding, optional)
A `tests/helpers/` module exporting this producer-harness shape — sitting
beside the launcher/executable-host fakes `fake-json-child.ts` already hosts,
which both files already import — is the home the two identical copies
already point toward.

## False-positive check
- Gate-pin check: neither tests/b0328-root-closure-hash-marshalled.test.ts
  nor tests/b0343-proto-hash-carrier-row.test.ts matches `*gate*.test.ts` or
  the named kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate); neither
  cited block is a pinned count or inventory assertion.
- Recording-double check: `makeFakeJsonChildLauncher()`'s `launcher.spawns`
  is a genuine recording double both files' own tests assert against
  (`toHaveLength(1)`, reading `.env`), but this finding does not challenge
  any assertion built on it — it targets the harness code that WRAPS and
  constructs the double (`rootDouble`/`noopPi`/`queryBody`/`makeParentDeps`/
  `parentBindInput`/`carrierRaw`/`marshalledHashes`), not the double itself
  or any "never called" witness.
- docs/bugs/ signature search: docs/bugs/0328-root-callee-closure-hash-never-marshalled.md
  Status "fixed (0.306.0)"; docs/bugs/0343-proto-theta-root-name-silent-no-op-hash-carrier-write.md
  Status "fixed (0.320.0)". `npx vitest run
  tests/b0328-root-closure-hash-marshalled.test.ts
  tests/b0343-proto-hash-carrier-row.test.ts` → 2 files, 13 tests, all
  passing at HEAD (verified 2026-09-16), so neither file is a documented
  correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0328-root-closure-hash-marshalled\|b0343-proto-hash-carrier-row"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of either file or any `it()`/`describe()` —
  only that the harness could be imported rather than re-declared — so no
  witness-list citation is affected.
- Overlap check against already-filed/resolved topics: PTQ-0209
  (rootdouble-producer-harness-duplicated, fixed) covers a structurally
  different, simpler `rootDouble`/`NOOP_CHECKPOINT`/`producer()` trio (no
  `clock` field, no JSON-child launcher, no `carrierRaw`/`marshalledHashes`)
  across four different files, none of which is b0328, b0343, or
  subagent-model-theta-tool.test.ts. PTQ-0343 (savedEnv/env-sandbox),
  PTQ-0344 (invoke-seam-scaffold), and PTQ-0361 (workspace
  mkdtemp/mkdir/settings-write beforeEach) are all fixed and, on direct
  re-read, cover entirely disjoint lines of these same two files (the env
  sandbox and workspace-plant halves, not the producer-harness functions
  cited here). No filed or resolved item names `rootDouble`'s `clock` field,
  `makeParentDeps`, `parentBindInput`, `carrierRaw`, or `marshalledHashes`.
- Coverage-drift check: the claim is about a repeated harness DEFINITION,
  not a missing test path; every function cited is exercised by both files'
  own currently-passing tests (13/13 confirmed above).

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — all 7 functions (rootDouble, noopPi, queryBody, makeParentDeps, parentBindInput, carrierRaw, marshalledHashes) reproduce byte-identical at the cited lines in both files, every grep count and the docs/bugs/coverage-matrix/13-of-13-green checks reproduce exactly, and the dedupe re-read against PTQ-0209/PTQ-0343/PTQ-0344/PTQ-0361 (and the same-wave d7-02 sibling) confirms each covers disjoint lines or files, leaving this harness unfiled. (triage: claude-opus-5)
