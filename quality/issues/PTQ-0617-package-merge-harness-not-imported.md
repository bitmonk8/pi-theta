---
id: PTQ-0617
title: e2e-s6-package-merge.test.ts and e2e-s6-description-registration.test.ts redeclare tests/helpers/package-merge-e2e-harness.ts's makeHarness instead of importing it
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/e2e-s6-package-merge.test.ts:45-107
  - tests/e2e-s6-description-registration.test.ts:109-152
  - tests/helpers/package-merge-e2e-harness.ts:49-121
sites: 2                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# e2e-s6-package-merge.test.ts and e2e-s6-description-registration.test.ts redeclare tests/helpers/package-merge-e2e-harness.ts's makeHarness instead of importing it

## Observation
`tests/helpers/package-merge-e2e-harness.ts` exports `makeHarness(cwd):
Harness` — a fake `ExtensionAPI`/`ExtensionContext` pair that drives the real
`createThetaExtension(deps)(pi)` over `composeExtensionInstance` with a
`FakeFileWatcher`/`FakeClock`, records every `registerCommand` call into
`commands`/`registrations`, and exposes `fireSessionStart()`. Its own header
states it centralises "the e2e-s6 harness shape" that several composition-
root package-merge test files independently redeclared (PTQ-0258).
`tests/e2e-s6-package-merge.test.ts` declares its own local `interface
Harness` (`commands`, `registrations`, `fireSessionStart`) and its own local
`makeHarness(cwd): Harness` whose `pi` object, `ctx` object, `deps`/
`createThetaExtension` wiring, and return tail are byte-identical to the
canonical helper's (differing only in that the canonical helper's `pi`
additionally captures `theta-system-note` diagnostics into an unused-here
`notes` array). `tests/e2e-s6-description-registration.test.ts`'s second
`describe` block inlines the equivalent `pi`/`ctx`/`deps`/`createThetaExtension`
sequence directly inside its `it(...)` body rather than in a named function,
but the object literals are the same byte-for-byte match against the
canonical helper (minus `registrations`/`notes` tracking, which that test
does not need). Neither file imports `tests/helpers/package-merge-e2e-harness.ts`.

## Evidence
tests/e2e-s6-package-merge.test.ts:45-107 (re-read immediately before
filing; `interface Harness` and `makeHarness`):
```ts
interface Harness {
  readonly commands: Map<string, { description?: string }>;
  readonly registrations: string[];
  fireSessionStart(): Promise<void>;
}

function makeHarness(cwd: string): Harness {
  const commands = new Map<string, { description?: string }>();
  const registrations: string[] = [];
  const subscriptions = new Map<
    string,
    ((event: unknown, ctx: ExtensionContext) => unknown)[]
  >();

  const pi = {
    registerFlag: (): void => {},
    registerMessageRenderer: (): void => {},
    registerCommand: (name: string, options: { description?: string }): void => {
      commands.set(name, options);
      registrations.push(name);
    },
```

tests/helpers/package-merge-e2e-harness.ts:49-73 (re-read immediately before
filing; the canonical exported `Harness`/`makeHarness`, the same member set
in the same order):
```ts
export interface Harness {
  readonly commands: Map<string, { description?: string }>;
  readonly registrations: string[];
  readonly notes: CapturedNote[];
  fireSessionStart(): Promise<void>;
}

/**
 * The e2e-s6 harness shape: factory + `composeExtensionInstance` over a real
 * temp workspace, recording every `registerCommand` call and every
 * `theta-system-note` diagnostic `pi.sendMessage` carries.
 */
export function makeHarness(cwd: string): Harness {
  const commands = new Map<string, { description?: string }>();
  const registrations: string[] = [];
  const notes: CapturedNote[] = [];
  const subscriptions = new Map<string, ((event: unknown, ctx: ExtensionContext) => unknown)[]>();

  const pi = {
    registerFlag: (): void => {},
    registerMessageRenderer: (): void => {},
    registerCommand: (name: string, options: { description?: string }): void => {
      commands.set(name, options);
      registrations.push(name);
    },
```

tests/e2e-s6-package-merge.test.ts:88-107 (the `deps`/`createThetaExtension`
wiring and return tail, byte-identical to
tests/helpers/package-merge-e2e-harness.ts:103-121 apart from the omitted
`notes` field):
```ts
  const deps: ThetaExtensionDeps = {
    fixtures: [],
    composeInstance: (composePi, composeCtx) =>
      composeExtensionInstance(composePi, composeCtx, {
        fileWatcher: new FakeFileWatcher(),
        clock: new FakeClock(),
      }),
  };
  createThetaExtension(deps)(pi);

  return {
    commands,
    registrations,
    fireSessionStart: async () => {
      for (const handler of subscriptions.get("session_start") ?? []) {
        await handler({ type: "session_start" }, ctx);
      }
    },
  };
}
```

tests/e2e-s6-description-registration.test.ts:109-152 (re-read immediately
before filing; the equivalent sequence inlined in the `it(...)` body — same
`pi` member set, same `ctx` shape, same `deps`/`createThetaExtension`/
session_start-firing loop as the canonical helper, minus `registrations`/
`notes` tracking):
```ts
    const commands = new Map<string, { description?: string }>();
    const subscriptions = new Map<
      string,
      ((event: unknown, ctx: ExtensionContext) => unknown)[]
    >();
    const pi = {
      registerFlag: (): void => {},
      registerMessageRenderer: (): void => {},
      registerCommand: (name: string, options: { description?: string }): void => {
        commands.set(name, options);
      },
      on: (
        event: string,
        handler: (e: unknown, c: ExtensionContext) => unknown,
      ): void => {
        const list = subscriptions.get(event) ?? [];
        list.push(handler);
        subscriptions.set(event, list);
      },
      getFlag: (): undefined => undefined,
      getCommands: (): { name: string; source: string }[] =>
        [...commands.keys()].map((name) => ({ name, source: "extension" })),
      sendMessage: (): void => {},
      sendUserMessage: (): void => {},
    } as unknown as ExtensionAPI;
```

## Why this is a problem
`tests/helpers/package-merge-e2e-harness.ts` exists specifically to
centralise this "e2e-s6 harness shape" (per its own header, resolving
PTQ-0258 for three sibling files), yet two further files in the same
`e2e-s6`/package-merge family redeclare the identical `pi`/`ctx`/`deps`/
`createThetaExtension(deps)(pi)`/session_start-firing sequence rather than
calling the exported `makeHarness(cwd)`. `e2e-s6-package-merge.test.ts`'s
own local `Harness` type is a strict subset of the canonical helper's
exported `Harness` (`commands`/`registrations`/`fireSessionStart`, omitting
only `notes`, which it never reads), so the canonical helper's return value
already satisfies every field this file consumes. A change to the fake `pi`
member set the real `createThetaExtension`/`composeExtensionInstance` reads
must be hand-applied in the canonical helper AND in each of these two
independent copies.

## Suggested direction (non-binding, optional)
Both files could call `makeHarness(cwd)` from
`tests/helpers/package-merge-e2e-harness.ts` and read the subset of fields
each needs (`commands`, `registrations`, `fireSessionStart` for the package-
merge file; `commands`, `fireSessionStart` for the description-registration
file), which is the same substitution the helper's own header already
frames as its purpose.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin; not applicable.
- Recording-double check: `commands`/`registrations` back genuine positive
  assertions in both files (e.g. `expect(harness.commands.has("uniquepkg")).toBe(true)`,
  `expect(commands.get("hi")).toHaveProperty("description", "HELLO-DESC")`),
  not MUST-NOT witnesses — this finding targets the redeclared harness
  definition, not the validity of those assertions.
- docs/bugs/ signature search: `grep -n "e2e-s6-package-merge.test.ts"
  docs/bugs/0458-package-theta-bypasses-pi-owned-collision-guard.md
  docs/bugs/0462-package-merge-bypasses-priority-adjudication.md` — both name
  this file as a witness/gate but neither discusses or sanctions the local
  `makeHarness` redeclaration; `grep -n
  "e2e-s6-description-registration.test.ts" docs/bugs/0216*.md docs/bugs/0357*.md`
  — both cite this file as a witness for unrelated findings (shutdown-reason
  classification; doc-comment field-variant anchors), again with no
  discussion of the harness shape.
- coverage-matrix/bug-doc citation search: `grep -n
  "e2e-s6-package-merge.test.ts\|e2e-s6-description-registration.test.ts"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of either file or any `it()`/`describe()` block
  inside them — only that the harness-construction code could be imported
  from the already-existing helper rather than redeclared.
- Coverage check: the claim is about a repeated harness DEFINITION, not a
  missing test path; every member of each file's double is exercised by that
  file's own tests.

## Triage
verdict: confirmed — independently re-verified: all three excerpts reproduce at the cited lines; `diff -w` of tests/e2e-s6-package-merge.test.ts:52-107 and tests/e2e-s6-description-registration.test.ts:110-148 against tests/helpers/package-merge-e2e-harness.ts:61-121 shows only prettier line-wrapping, the canonical's extra `notes`-capturing `sendMessage`/return field (a strict superset neither file reads), and the desc-registration copy omitting `registrations` — "byte-identical" is slightly overstated but the copy-paste-fixture class holds; `grep package-merge-e2e-harness tests/` hits only the three PTQ-0258 files, so neither cited file imports it; not a duplicate — resolved PTQ-0258 explicitly scoped these two files OUT as "differently-shaped" and the same-wave sibling qw20260917154546-d7-01-b0458-* covers only b0458; not a gate file, coverage-matrix.md 0 hits, both cells pass at HEAD (3/3) so no correct-reason red, and no bug doc sanctions the local redeclaration (triage: claude-fable-5-1)
