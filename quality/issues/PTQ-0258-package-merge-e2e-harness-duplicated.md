---
id: PTQ-0258
title: b0462 (x2) and b0463 each redeclare the same CapturedNote/Harness/makeHarness composition-root e2e double and env-redirection scaffolding
lens: D7                     # D2 | D7 — the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0462-package-identity-dedup.test.ts:56-183
  - tests/b0462-package-merge-priority-adjudication.test.ts:57-190
  - tests/b0463-package-source-disc3-validation.test.ts:68-185
  - tests/b0458-package-theta-pi-owned-collision.test.ts:54-194
sites: 4                     # count of occurrences cited in Evidence
fix_scope: cross-module       # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912112713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# b0462 (x2) and b0463 each redeclare the same CapturedNote/Harness/makeHarness composition-root e2e double and env-redirection scaffolding

## Observation
tests/b0462-package-identity-dedup.test.ts, tests/b0462-package-merge-priority-adjudication.test.ts,
and tests/b0463-package-source-disc3-validation.test.ts each declare their own
module-scope `CapturedNote` interface, `Harness` interface, and `makeHarness(cwd)`
function — a recording `ExtensionAPI`/`ExtensionContext` pair that drives the
real `createThetaExtension(deps)(pi)` over `composeExtensionInstance` and
exposes `commands`/`notes`/`fireSessionStart()` — plus an identical
`beforeEach`/`afterEach` pair that redirects `HOME`/`USERPROFILE`/
`PI_CODING_AGENT_DIR` to a minted temp workspace and restores them. Two of the
three files' own comments name this "the e2e-s6 harness shape" explicitly. A
fourth file outside this review's scope, tests/b0458-package-theta-pi-owned-collision.test.ts,
carries the identical block (also self-labelled "the e2e-s6 harness shape") with
one added parameter. No module under tests/helpers/ exports this double or this
env-redirection pair; each of the four files re-derives it from scratch.

## Evidence

tests/b0462-package-identity-dedup.test.ts:56-70 (interfaces + signature):
```ts
interface CapturedNote {
  readonly code: string;
  readonly message: string;
  readonly severity: string;
}

interface Harness {
  readonly commands: Map<string, { description?: string }>;
  readonly notes: CapturedNote[];
  fireSessionStart(): Promise<void>;
}

function makeHarness(cwd: string): Harness {
  const commands = new Map<string, { description?: string }>();
  const notes: CapturedNote[] = [];
  const subscriptions = new Map<
```

tests/b0463-package-source-disc3-validation.test.ts:68-82 (byte-identical
interfaces; the file's own comment names the shape):
```ts
interface CapturedNote {
  readonly code: string;
  readonly message: string;
  readonly severity: string;
}

interface Harness {
  readonly commands: Map<string, { description?: string }>;
  readonly notes: CapturedNote[];
  fireSessionStart(): Promise<void>;
}

// The e2e-s6 harness shape, extended to capture the `theta-system-note`
// channel's `pi.sendMessage` payloads (the e2e-s6 harness stubs it no-op).
function makeHarness(cwd: string): Harness {
```

tests/b0462-package-merge-priority-adjudication.test.ts:57-71 (the same shape,
one added field `registrations`, same self-citation):
```ts
interface CapturedNote {
  readonly code: string;
  readonly message: string;
  readonly severity: string;
}

interface Harness {
  readonly commands: Map<string, { description?: string }>;
  readonly registrations: string[];
  readonly notes: CapturedNote[];
  fireSessionStart(): Promise<void>;
}

// The e2e-s6 harness shape, extended to capture the `theta-system-note`
// channel's `pi.sendMessage` payloads (the e2e-s6 harness stubs it no-op).
```

tests/b0458-package-theta-pi-owned-collision.test.ts:54-68 (outside this
review's scope; the same `CapturedNote`/`Harness` shape, same self-citation,
cited here only as pattern context — a fourth independent copy, not itself a
location this finding asks to change):
```ts
interface CapturedNote {
  readonly code: string;
  readonly message: string;
  readonly severity: string;
}

interface Harness {
  readonly commands: Map<string, { description?: string }>;
  readonly registrations: string[];
  readonly notes: CapturedNote[];
  fireSessionStart(): Promise<void>;
}

/**
 * The e2e-s6 harness shape (factory + `composeExtensionInstance` over a real
```

tests/b0462-package-identity-dedup.test.ts:76-90 (the `pi` double's opening
members — byte-identical across all four files):
```ts
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
```

tests/b0462-package-identity-dedup.test.ts:114-127 (the `deps`/`createThetaExtension`
wiring and return-tail — byte-identical in all four files apart from the
`registrations` field b0462-merge-priority-adjudication and b0458 add to the
return object):
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
    notes,
    fireSessionStart: async () => {
```

tests/b0462-package-identity-dedup.test.ts:175-183 (the `afterEach` env
restore, byte-identical to tests/b0462-package-merge-priority-adjudication.test.ts:182-190
and tests/b0463-package-source-disc3-validation.test.ts:177-185 — `diff` of the
three ranges returns no differences):
```ts
  afterEach(() => {
    if (savedHome === undefined) delete process.env.HOME;
    else process.env.HOME = savedHome;
    if (savedUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = savedUserProfile;
    if (savedAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = savedAgentDir;
    rmSync(workspace, { recursive: true, force: true });
  });
```

Pattern-wide search: `grep -rn "^function makeHarness(cwd: string): Harness {\|^interface CapturedNote {" tests --include="*.test.ts"` restricted to files that also call
`createThetaExtension(deps)(pi)` returns exactly these four files
(tests/b0458-package-theta-pi-owned-collision.test.ts,
tests/b0462-package-identity-dedup.test.ts,
tests/b0462-package-merge-priority-adjudication.test.ts,
tests/b0463-package-source-disc3-validation.test.ts); a broader search for
`createThetaExtension(deps)(pi)` alone returns 12 files total, but the other
eight (e2e-s6-description-registration, e2e-s6-package-merge,
execution-status-entry-migration-witnesses, extension-factory-harness,
load-phase-pre-eval-routing, load-warning-delivery,
discovery-glob-universe-enumeration-failure, b0460-skill-arm-vacuous-at-pin)
each drive a differently-shaped harness (no `CapturedNote`, or a
`registrations`-only harness with no note capture, or a differently-named
capture type), so this finding is scoped to the four that share this exact
shape. `grep -rl "savedAgentDir = process.env.PI_CODING_AGENT_DIR" tests
--include="*.test.ts"` returns exactly these same four files, confirming the
env-redirection scaffolding recurs at the same four-file boundary as the
double. `ls tests/helpers/` (ambient-control-plane-scrub.ts,
call-with-clause-harness.ts, category1-clause-oracle.ts,
compose-workspace-harness.ts, corpus-reader.ts, e2e-s1.ts, fake-clock.ts,
fake-file-system.ts, fake-file-watcher.ts, fake-host-loop-host.ts,
fake-id-source.ts, fake-json-child.ts, fake-rpc-child.ts,
fake-token-estimator.ts, fixture-dispatch-harness.ts, load-row-harness.ts,
production-load-harness.ts, registry-oracle.ts, spec-prose-proximity.ts,
theta-corpus.ts) — no module exports a `CapturedNote`/`Harness`/`makeHarness`
triple or the env-redirection pair; `tests/helpers/compose-workspace-harness.ts`
exports an adjacent but functionally different double (`HostDouble`/`makeHost`,
built for a different composition-root test family per PTQ-0213) whose
`registerCommand` is a no-op that does not record names and whose returned
object exposes no `fireSessionStart`, so it is not a substitute for this shape.

## Why this is a problem
This is the "Boilerplate duplication" class. The `CapturedNote` interface, the
`Harness` interface, the `makeHarness` function's `pi` double (all members in
the same order), its `ctx` double, its `deps`/`createThetaExtension` wiring, and
its `fireSessionStart` closure are byte-identical across four files (three
under this review, one sibling), differing only where one bug's cells need an
extra `registrations` array or an extra constructor parameter. The
`beforeEach`/`afterEach` env-redirection pair (`savedHome`/`savedUserProfile`/
`savedAgentDir`, saved and restored around a minted temp workspace) is
byte-identical across the same four files. Two of the three reviewed files, and
the fourth sibling, each carry a comment naming this "the e2e-s6 harness
shape," so each author already recognised the block as a repeated shape at the
time of writing, yet re-typed it rather than importing a shared definition; no
module under tests/helpers/ hosts it.

## Suggested direction (non-binding, optional)
tests/helpers/compose-workspace-harness.ts already exists as the precedent for
extracting exactly this kind of composition-root recording double into
tests/helpers/ (per PTQ-0213); a sibling module for the
`CapturedNote`/`Harness`/`makeHarness`/env-redirection shape used by these four
files is the analogous, already-demonstrated home this block currently has no
counterpart in.

## False-positive check
- Gate-pin check: none of the four files match `*gate*.test.ts` or the named
  gate kin; not applicable.
- Recording-double check: `notes`/`commands` back genuine assertions elsewhere
  in each file (e.g. `expect(harness.commands.get("lint")?.description).toBe(...)`,
  `expect(byFragment(harness.notes, SHADOW_FRAGMENT)).toHaveLength(0)`), which
  this finding does not dispute. The claim here is narrower: the double's own
  DEFINITION, and the surrounding env-redirection scaffolding, are redeclared
  rather than shared — not that any assertion built on them is vacuous.
- docs/bugs/ signature search: docs/bugs/0462-package-merge-bypasses-priority-adjudication.md
  — Status "fixed (0.447.0)"; docs/bugs/0463-package-source-bypasses-disc3-validation.md
  — Status "fixed (0.448.0)". `npx vitest run
  tests/b0462-package-identity-dedup.test.ts
  tests/b0462-package-merge-priority-adjudication.test.ts
  tests/b0463-package-source-disc3-validation.test.ts` passes 8/8 at HEAD, so
  none of these is a documented correct-reason red, and neither bug document
  offers a rationale for keeping the harness un-shared.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0462-package-identity-dedup\|b0462-package-merge-priority-adjudication\|b0463-package-source-disc3-validation"
  docs/reference/coverage-matrix.md` → 0 hits; `grep -rl` for the same three
  names under docs/ → only each bug's own document (self-citation). This
  finding proposes no merge, rename, or deletion of any file or `it()`/
  `describe()` — only that the harness pieces could be imported rather than
  redeclared — so no citation is affected.
- Coverage check: the claim is about a repeated harness DEFINITION, not a
  missing test path; every member of each file's double is exercised by that
  file's own tests (8/8 passing, confirmed above).
- Convention-breadth check: a broader grep for `createThetaExtension(deps)(pi)`
  alone hits 12 files, and for the more generic `const subscriptions = new
  Map<` idiom hits 31 files — both far more files than share the specific
  `CapturedNote`/`Harness`/`makeHarness` triple this finding cites. Narrowing to
  files that declare exactly that triple (or, independently, that restore
  `PI_CODING_AGENT_DIR` via `savedAgentDir`) returns exactly the same four
  files each time, so this is a bounded four-file recurrence, not the
  suite's pervasive, already-established convention that the wider
  `subscriptions`/`fireSessionStart` idiom is (the shape multiple recent
  triage rejections in this store name as out of scope at 79-186-file scale).

## Triage
verdict: confirmed — independently re-verified: the cited CapturedNote/Harness/makeHarness triple and afterEach env-restore are byte-identical (diff-clean) or near-identical (one added field/param) at the cited lines in all four files; the candidate's own greps reproduce exactly (12 files call createThetaExtension(deps)(pi), of which only these four declare interface CapturedNote or the makeHarness(cwd):Harness signature, and only these four restore PI_CODING_AGENT_DIR via savedAgentDir); manual inspection of the other eight createThetaExtension callers (e.g. load-phase-pre-eval-routing.test.ts, b0460-skill-arm-vacuous-at-pin.test.ts) confirms genuinely different capture shapes, not a renamed clone of the same double; tests/helpers/compose-workspace-harness.ts exports a distinct, already-extracted HostDouble/makeHost (PTQ-0213) with no fireSessionStart and a no-op registerCommand, not a substitute; both bug docs are Status fixed and all 8 cells pass at HEAD; coverage-matrix.md has 0 citations of any of the three in-scope files, so no proposed change is contested; not a duplicate of resolved PTQ-0213 (makeHost/composeExtensionInstance family) or PTQ-0225 (discoverAndComposeFixtures/hostPi family), which are structurally distinct harnesses (triage: claude-opus-5)
