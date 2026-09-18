---
id: PTQ-0626
title: b0435 re-derives compose-workspace-harness.ts's ExtensionAPI/ExtensionContext host double and settings-file plant instead of importing them
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0435-fallback-diagnostic-reentry.test.ts:87-95
  - tests/b0435-fallback-diagnostic-reentry.test.ts:116-127
  - tests/b0435-fallback-diagnostic-reentry.test.ts:151-163
  - tests/helpers/compose-workspace-harness.ts:68-80
  - tests/helpers/compose-workspace-harness.ts:91-99
  - tests/helpers/compose-workspace-harness.ts:130-136
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# b0435 re-derives compose-workspace-harness.ts's ExtensionAPI/ExtensionContext host double and settings-file plant instead of importing them

## Observation
`tests/helpers/compose-workspace-harness.ts` exports `makeHost` (an
`ExtensionAPI`/`ExtensionContext` recording-double pair for driving
`composeExtensionInstance`) and `finishWorkspace` (writes the hermetic `{}`
settings-file plant and returns the workspace handle), created — its own
header states — because "several test files independently redeclared" this
same shape. `tests/b0435-fallback-diagnostic-reentry.test.ts` — one of this
wave's nine reviewed files, and itself the file that names
`tests/b0268-load-note-path-spelling-single-convention.test.ts` as its own
model in a comment ("a b0268-style host double") — declares its own local
`plantBrokenWorkspace` (mkdir + fixture write + the identical `{}`
settings-file write `finishWorkspace` already performs) and its own local
`makeHost`, whose `pi`/`ctx` object literals reproduce ten of the helper's
twelve `pi` methods and all three non-`ui` `ctx` fields byte-for-byte,
diverging only in `pi.sendMessage`/`ctx.ui.notify` (which it extends with
throw-injection options the canonical `makeHost` does not need). Neither
function imports from `tests/helpers/compose-workspace-harness.ts`.

## Evidence

`tests/b0435-fallback-diagnostic-reentry.test.ts:87-95` (`plantBrokenWorkspace`
— the trailing settings-file write is byte-identical to `finishWorkspace`'s):
```ts
function plantBrokenWorkspace(): Workspace {
  const cwd = mkdtempSync(join(tmpdir(), "theta-b0435-"));
  const planted = join(cwd, ".pi", "theta", "broken.theta");
  mkdirSync(dirname(planted), { recursive: true });
  writeFileSync(planted, BROKEN_THETA, "utf8");
  // An absent settings file is silent; the `{}` plant is hermeticity.
  writeFileSync(join(cwd, ".pi", "settings.json"), "{}", "utf8");
  return { cwd, dispose: () => rmSync(cwd, { recursive: true, force: true }) };
}
```

`tests/b0435-fallback-diagnostic-reentry.test.ts:116-127` (`makeHost`'s `pi`
object — every method but `on`/`sendMessage` is a byte-identical no-op copy
of the canonical `makeHost`'s `pi`):
```ts
  const pi = {
    registerFlag: (): void => {},
    getFlag: (): undefined => undefined,
    getCommands: (): readonly unknown[] => [],
    on: (): void => {},
    registerCommand: (): void => {},
    sendUserMessage: (): void => {},
    registerTool: (): void => {},
    setActiveTools: (): void => {},
    getActiveTools: (): readonly unknown[] => [],
    getAllTools: (): readonly unknown[] => [],
    registerMessageRenderer: (): void => {},
    sendMessage: (message: {
```

`tests/b0435-fallback-diagnostic-reentry.test.ts:151-163` (`makeHost`'s `ctx`
object — `cwd`/`hasUI`/`modelRegistry` fields byte-identical to the
canonical `makeHost`'s `ctx`, `ui.notify` extended only with the
`notifyThrows` branch):
```ts
  const ctx = {
    cwd,
    hasUI: false,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: {
      notify: (message: string, _type: "error"): void => {
        notified.push(message);
        if (opts.notifyThrows) {
          throw new Error("b0435: no UI attached");
        }
      },
    },
  } as unknown as ExtensionContext;
```

`tests/helpers/compose-workspace-harness.ts:68-80` (canonical `makeHost`'s
`pi` — the same eleven no-op-shaped methods as b0435's, `on` recording into a
handler map instead of b0435's bare no-op):
```ts
  const pi = {
    registerFlag: (): void => {},
    getFlag: (): undefined => undefined,
    getCommands: (): readonly { name: string; source: string }[] => [],
    on: (event: string, handler: PiHandler): void => {
      handlers.set(event, handler);
    },
    registerCommand: (): void => {},
    sendUserMessage: (): void => {},
    registerTool: (): void => {},
    setActiveTools: (): void => {},
    getActiveTools: (): readonly unknown[] => [],
    getAllTools: (): readonly unknown[] => [],
    registerMessageRenderer: (): void => {},
```

`tests/helpers/compose-workspace-harness.ts:91-99` (canonical `makeHost`'s
`ctx` — `cwd`/`hasUI`/`modelRegistry` byte-identical to b0435's, `ui.notify`
recording instead of conditionally throwing):
```ts
  const ctx = {
    cwd,
    hasUI: false,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: {
      notify: (message: string, type: "error"): void => {
        notified.push([message, type]);
      },
    },
  } as unknown as ExtensionContext;
```

`tests/helpers/compose-workspace-harness.ts:130-136` (`finishWorkspace` — the
same `{}` settings-file plant `plantBrokenWorkspace` re-derives inline):
```ts
export function finishWorkspace(cwd: string): ComposeWorkspace {
  writeFileSync(join(cwd, ".pi", "settings.json"), "{}", "utf8");
  return {
    cwd,
    path: (name: string): string => normalisePath(join(cwd, ".pi", "theta", name)),
    dispose: (): void => rmSync(cwd, { recursive: true, force: true }),
  };
}
```

## Why this is a problem
`tests/helpers/compose-workspace-harness.ts`'s own header states its purpose
is to end exactly the pattern it describes: "Several test files
independently redeclared the same `PiHandler` type, `RecordedNote` /
`HostDouble` interfaces, `makeHost` function ... and the adjacent ...
settings-file-planting tail every temp workspace needs." b0435's own comment
at the `makeHost` declaration calls it "a b0268-style host double" — naming
its lineage from the exact file
(`tests/b0268-load-note-path-spelling-single-convention.test.ts`) that this
wave's own `qw20260917154546-d7-01-b0268-load-note-makehost-duplicated.md`
finding already documents as having re-derived this same helper instead of
importing it. b0435 continues that lineage: ten of `makeHost`'s twelve `pi`
methods and three of `ctx`'s four fields are byte-identical no-ops to the
canonical `makeHost`, and `plantBrokenWorkspace`'s settings-file write is
byte-identical to `finishWorkspace`'s. The only genuine divergence —
`sendMessage` counting and conditionally throwing on the Nth
`theta-system-note` send, and `ui.notify` conditionally throwing — is not
something the canonical `makeHost` currently supports, but every other field
is reproduced unchanged.

## Suggested direction (non-binding, optional)
The natural home for the divergence is an options-parameter extension of the
existing `tests/helpers/compose-workspace-harness.ts` `makeHost` (or a second
exported factory built on the same `pi`/`ctx` skeleton) so the throw-injection
behaviour b0435 needs is added once, and the settings-file plant reuses
`finishWorkspace` after the caller writes its own `broken.theta` fixture, the
same division of labour the header comment already documents for its other
callers.

## False-positive check
- Gate-pin check: `tests/b0435-fallback-diagnostic-reentry.test.ts` does not
  match `*gate*.test.ts` or the named kin.
- Recording-double check: `sends`/`notified` are positive recorders read by
  the test's own assertions (e.g. the re-entry witness reads `host.sends`
  directly); this is not a "never called" negative witness being
  second-guessed, so the carve-out does not apply.
- docs/bugs/ signature search: the test file's own header states "No silent
  skipping: an unmet precondition ... throws naming itself, never an early
  return", consistent with a currently-exercised witness suite, not a
  documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0435-fallback-diagnostic-reentry" docs/reference/coverage-matrix.md` → 0
  hits. This finding proposes no merge, rename, or deletion of any `it()`/
  `describe()` — only that the local `makeHost`/`plantBrokenWorkspace`
  skeleton could be drawn from the existing helper.
- Coverage check: the claim is about a repeated harness DEFINITION, not a
  missing test path; every cited function is exercised by the tests in its
  own file.
- Duplicate check: distinct from
  `qw20260917154546-d7-01-b0268-load-note-makehost-duplicated.md`, which
  names `tests/b0268-load-note-path-spelling-single-convention.test.ts` as
  its site; b0435 is a different file in this shard's own review scope, not
  in that finding's site list, and reproduces the helper with an added
  throw-injection divergence b0268's copy does not have.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — all six excerpts reproduce verbatim at the cited lines; b0435 (single commit 70106e13, never imported tests/helpers/compose-workspace-harness.ts — grep 0 hits) redeclares 9 byte-identical no-op `pi` methods (+ `getCommands` differing only in return-type annotation, so "ten byte-identical" is off by one, non-disturbing), the identical `cwd`/`hasUI`/`modelRegistry` ctx fields and the byte-identical `{}` settings write of `finishWorkspace`, diverging only in the throw-injecting `sendMessage`/`ui.notify` the fix stage can add as an option; the helper's own header names ending this redeclaration as its purpose and docs/bugs/0435 line 108 prescribes the "b0268-style host double" as a build step, not a rationale against sharing; test green 2/2, bug fixed (0.419.0), coverage-matrix 0 hits, not a gate/negative-witness carve-out; resolved PTQ-0220 names b0435 only in its pattern-wide grep with a site list of b0320 alone, and no wave sibling (b0268, lex-drop, shared-subtree, 152-01) lists b0435, so per the store's per-occurrence convention this is a distinct unremediated occurrence, not a duplicate (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
