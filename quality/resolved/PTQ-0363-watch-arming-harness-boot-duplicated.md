---
id: PTQ-0363
title: b0339's Harness/makeHarness/boot session_start-firing trio redeclares b0310's, a piece PTQ-0236's shared-helper extraction left unshared
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0339-package-source-watch-arming.test.ts:83-130
  - tests/b0339-package-source-watch-arming.test.ts:153-171
  - tests/b0310-watch-roots-root-union.test.ts:41-91
  - tests/b0310-watch-roots-root-union.test.ts:102-120
sites: 2                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260915044704
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-15
---

# b0339's Harness/makeHarness/boot session_start-firing trio redeclares b0310's, a piece PTQ-0236's shared-helper extraction left unshared

## Observation
tests/b0339-package-source-watch-arming.test.ts declares a module-scope
`Harness` interface, a `makeHarness(cwd)` function (a fake `ExtensionAPI` that
records `registerCommand`/`on`-subscribed handlers and can `fire` a
`session_start` event), and a `boot()` function that wires `makeHarness`'s
`pi` through `createThetaExtension`/`composeExtensionInstance` with a
`RootsRecordingFileWatcher`/`FakeClock` pair. Its own doc comment states
`makeHarness` "Mirrors b0310's `makeHarness`". tests/b0310-watch-roots-root-union.test.ts
declares the same three pieces under the same names, and — apart from one
`flags` parameter b0310's own `--theta`-flag scenario needs — the bodies are
byte-identical. A prior finding on this same file pair (PTQ-0236, fixed) only
extracted the OTHER shared quartet these two files also redeclared
(`RootsRecordingFileWatcher`/`norm`/`waitFor`/`armedRoots`) into
tests/helpers/fake-file-watcher.ts, which both files now import; the
`Harness`/`makeHarness`/`boot` trio was not part of that extraction's cited
Evidence and remains locally declared, un-shared, in both files today.

## Evidence

tests/b0339-package-source-watch-arming.test.ts:83-91 (the self-admitted
mirror, `Harness` and `makeHarness`'s opening):
```ts
interface Harness {
  readonly pi: ExtensionAPI;
  fireSessionStart(): Promise<void>;
}

/** Mirrors b0310's `makeHarness`: a minimal `ExtensionAPI` recording commands
 *  and event subscriptions; no `--theta` flag is needed here (package roots reach
 *  discovery through `fs.cwd()`, not a flag), so `getFlag` answers `undefined`. */
function makeHarness(cwd: string): Harness {
```

tests/b0339-package-source-watch-arming.test.ts:98-108 (the fake `pi` body,
part 1):
```ts
  const pi = {
    registerFlag: (): void => {},
    registerMessageRenderer: (): void => {},
    registerCommand: (name: string, options: unknown): void => {
      commands.set(name, options);
    },
    on: (event: string, handler: (e: unknown, c: ExtensionContext) => unknown): void => {
      const list = subscriptions.get(event) ?? [];
      list.push(handler);
      subscriptions.set(event, list);
    },
```

tests/b0339-package-source-watch-arming.test.ts:109-114 (the fake `pi` body,
part 2):
```ts
    getFlag: (): string | undefined => undefined,
    getCommands: (): { name: string; source: string }[] =>
      [...commands.keys()].map((name) => ({ name, source: "extension" })),
    sendMessage: (): void => {},
    sendUserMessage: (): void => {},
  } as unknown as ExtensionAPI;
```

tests/b0339-package-source-watch-arming.test.ts:116-130 (`ctx`, `fire`, and
the return):
```ts
  const ctx = {
    cwd,
    hasUI: false,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: { notify: (): void => {} },
  } as unknown as ExtensionContext;

  const fire = async (event: string): Promise<void> => {
    for (const handler of subscriptions.get(event) ?? []) {
      await handler({ type: event }, ctx);
    }
  };

  return { pi, fireSessionStart: () => fire("session_start") };
}
```

tests/b0339-package-source-watch-arming.test.ts:153-163 (`boot`, part 1):
```ts
  /** Boot the shipped composition with the roots-recording watcher + fake clock. */
  async function boot(): Promise<void> {
    fakeWatcher = new RootsRecordingFileWatcher();
    wiring = undefined;
    const harness = makeHarness(workspace);
    const deps: ThetaExtensionDeps = {
      fixtures: [],
      composeInstance: async (pi, ctx) => {
        wiring = await composeExtensionInstance(pi, ctx, {
          fileWatcher: fakeWatcher,
          clock: new FakeClock(),
```

tests/b0339-package-source-watch-arming.test.ts:164-171 (`boot`, part 2):
```ts
        });
        return wiring;
      },
    };
    createThetaExtension(deps)(harness.pi);
    await harness.fireSessionStart();
    await waitFor(() => fakeWatcher.watchCalls.length > 0, "watcher to arm");
  }
```

tests/b0310-watch-roots-root-union.test.ts:41-52 (pattern context, outside
this wave's scope; re-read immediately before filing — the same `Harness`
and `makeHarness` opening, differing only by the added `flags` parameter):
```ts
interface Harness {
  readonly pi: ExtensionAPI;
  fireSessionStart(): Promise<void>;
}

/**
 * `flags` parameterises `pi.getFlag`: the `--theta` root reaches discovery only
 * through `getFlag('theta')` (`readThetaFlagPaths`, production-composition.ts),
 * so Case A must return its contributed directory here — the existing
 * integration-test helper hardcodes `undefined` and cannot express it.
 */
function makeHarness(cwd: string, flags: Readonly<Record<string, string>>): Harness {
```

tests/b0310-watch-roots-root-union.test.ts:59-69 (pattern context; the fake
`pi` body, part 1 — identical to b0339's above):
```ts
  const pi = {
    registerFlag: (): void => {},
    registerMessageRenderer: (): void => {},
    registerCommand: (name: string, options: unknown): void => {
      commands.set(name, options);
    },
    on: (event: string, handler: (e: unknown, c: ExtensionContext) => unknown): void => {
      const list = subscriptions.get(event) ?? [];
      list.push(handler);
      subscriptions.set(event, list);
    },
```

tests/b0310-watch-roots-root-union.test.ts:70-75 (pattern context; the fake
`pi` body, part 2 — identical to b0339's above except `getFlag` reads
`flags[name]` instead of always returning `undefined`):
```ts
    getFlag: (name: string): string | undefined => flags[name],
    getCommands: (): { name: string; source: string }[] =>
      [...commands.keys()].map((name) => ({ name, source: "extension" })),
    sendMessage: (): void => {},
    sendUserMessage: (): void => {},
  } as unknown as ExtensionAPI;
```

tests/b0310-watch-roots-root-union.test.ts:77-91 (pattern context; `ctx`,
`fire`, and the return — byte-identical to b0339's):
```ts
  const ctx = {
    cwd,
    hasUI: false,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: { notify: (): void => {} },
  } as unknown as ExtensionContext;

  const fire = async (event: string): Promise<void> => {
    for (const handler of subscriptions.get(event) ?? []) {
      await handler({ type: event }, ctx);
    }
  };

  return { pi, fireSessionStart: () => fire("session_start") };
}
```

tests/b0310-watch-roots-root-union.test.ts:102-113 (pattern context; `boot`,
part 1 — byte-identical to b0339's apart from the added `flags` parameter and
its one call-site use):
```ts
  /** Boot the shipped composition with the roots-recording watcher and the given flags. */
  async function boot(flags: Readonly<Record<string, string>>): Promise<void> {
    fakeWatcher = new RootsRecordingFileWatcher();
    wiring = undefined;
    const harness = makeHarness(workspace, flags);
    const deps: ThetaExtensionDeps = {
      fixtures: [],
      composeInstance: async (pi, ctx) => {
        wiring = await composeExtensionInstance(pi, ctx, {
          fileWatcher: fakeWatcher,
          clock: new FakeClock(),
        });
```

tests/b0310-watch-roots-root-union.test.ts:114-120 (pattern context; `boot`,
part 2 — byte-identical to b0339's):
```ts
        return wiring;
      },
    };
    createThetaExtension(deps)(harness.pi);
    await harness.fireSessionStart();
    await waitFor(() => fakeWatcher.watchCalls.length > 0, "watcher to arm");
  }
```

Search: `grep -rl "function makeHarness\b" tests --include="*.test.ts"` → 26
files carry a function of this name (a wider family this finding does not
claim). Narrowing: `grep -rl 'fireSessionStart: () => fire("session_start")'
tests --include="*.test.ts"` → 11 of those 26 share that one-line
`fireSessionStart` return idiom, but reading each of the 11 files' own
`Harness` interface (`awk '/^interface Harness/,/^}/'` over each) shows only
tests/b0310-watch-roots-root-union.test.ts and
tests/b0339-package-source-watch-arming.test.ts declare the minimal two-member
body quoted above (`readonly pi: ExtensionAPI; fireSessionStart(): Promise<void>;`,
nothing else); the other nine each add further members their own scenarios
need (`ctx`, `commands`, `notes`, `subscriptions`, and/or `registrationCount`),
so their `makeHarness`/`boot` bodies are not byte-identical to this pair's.
`grep -n "RecursiveRootFileWatcher\|RootsRecordingFileWatcher\|^function norm\|^async function waitFor\|^function armedRoots"
tests/b0339-package-source-watch-arming.test.ts` shows all five of those
names are now *imported* (from `./helpers/fake-file-watcher`) rather than
locally declared, confirming PTQ-0236's and PTQ-0346's fixes landed; `Harness`,
`makeHarness`, and `boot` are the only members of the file's own "mirrors
b0310" family that are not.

## Why this is a problem
b0339's own doc comment states outright that `makeHarness` "Mirrors b0310's
`makeHarness`", and the excerpts above confirm the `Harness` interface, the
fake `pi`'s eight methods (in the same order, same bodies bar the one
parameterised `getFlag`), the `ctx` object, the `fire` helper, the return
shape, and the entire `boot` function are byte-identical (or, for `boot` and
`makeHarness`'s signature, identical apart from the one `flags` parameter
b0310's own scenario needs) between the two files. This is the residual
half of the SAME mirrored harness PTQ-0236 already confirmed and fixed for
this exact file pair: that finding's own Evidence was confined to
`RootsRecordingFileWatcher`/`norm`/`waitFor`/`armedRoots`, all four of which
are now shared through tests/helpers/fake-file-watcher.ts, while the
`Harness`/`makeHarness`/`boot` trio — the piece that actually drives
`session_start` through the real `createThetaExtension`/
`composeExtensionInstance` composition root — was left in place, unshared, in
both files.

## Suggested direction (non-binding, optional)
tests/helpers/fake-file-watcher.ts is not the natural home for this piece
(it holds `FileWatcher`-seam doubles, not an `ExtensionAPI`/session-firing
harness), but the convention that same module's extraction already
established for this exact file pair — one shared module holding the pieces
`b0339`'s own comments say are mirrored from `b0310` — is the observation
this residual trio points at.

## False-positive check
- Gate-pin check: neither tests/b0339-package-source-watch-arming.test.ts nor
  tests/b0310-watch-roots-root-union.test.ts matches `*gate*.test.ts` or the
  named kin; none of the cited lines is a pinned count or inventory
  assertion.
- Recording-double check: `commands`/`subscriptions` back ordinary recording
  behaviour (a fake command/event registry), not a MUST-NOT-called witness;
  this finding claims the harness's own DEFINITION is duplicated across two
  files, the same class of claim PTQ-0236 already confirmed for this pair's
  other four pieces.
- docs/bugs/ signature search: docs/bugs/0339-package-source-present-but-empty-contributing-dir-not-watched.md
  Status "fixed (0.321.0)"; docs/bugs/0310-watch-roots-derived-from-discovered-files-not-root-union.md
  Status "fixed (0.301.0)" (cited only as pattern context). `npx vitest run
  tests/b0339-package-source-watch-arming.test.ts
  tests/b0310-watch-roots-root-union.test.ts` → 2 files, 10 tests, all
  passing at HEAD, so neither is a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0339-package-source-watch-arming\|b0310-watch-roots-root-union"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of either file or any `it()`/`describe()` —
  only that the `Harness`/`makeHarness`/`boot` trio could be imported rather
  than redeclared — so no witness-list citation is affected.
- Overlap check against already-filed/resolved topics: re-read PTQ-0236's
  and PTQ-0346's own Evidence sections in full during this review. PTQ-0236's
  cited excerpts are `RootsRecordingFileWatcher`, `norm`, `waitFor`, and
  `armedRoots` only (its own text notes "`makeHarness`/`boot` differ only by
  b0310's extra `flags` parameter... every other line... is identical
  between the two" but does not cite either as a formal, separately-fixed
  location). PTQ-0346's cited excerpts are `RecursiveRootFileWatcher`'s
  `emit`/`#underArmedRoot` pair only. Both are `status: fixed`, and the
  current file state (confirmed via direct re-read and the import-line grep
  above) shows their four+one cited pieces are now imported from
  tests/helpers/fake-file-watcher.ts, while `Harness`/`makeHarness`/`boot`
  remain locally declared in both files — the same "residual the prior
  fix's own stated scope did not reach" shape already accepted for this
  family at PTQ-0312.
- Scope note: tests/b0310-watch-roots-root-union.test.ts is outside this
  wave's assigned five-file scope; it is cited only as pattern context
  (confirming the byte-identity of the duplicated trio), not claimed as an
  additional reviewed file — the same in-scope/pattern-context boundary
  PTQ-0236 and PTQ-0346 already used for this identical file pair.
- Coverage-drift check: the claim is about a repeated harness DEFINITION,
  not a missing test path; every line of both copies is exercised by each
  file's own passing tests (10/10 confirmed above).

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — Harness/makeHarness/boot excerpts reproduce byte-identical (bar b0310's one `flags` param/getFlag line) at the cited lines in both files, the 26/11/2-of-11 search funnel reproduces exactly, tests/helpers/fake-file-watcher.ts (read in full) exports no Harness/makeHarness/boot confirming PTQ-0236's and PTQ-0346's fixes on this same pair stopped short of this trio, both docs/bugs entries are fixed with 10/10 tests green at HEAD and 0 coverage-matrix hits, and no tracked PTQ covers this residual (triage: claude-opus-5)
