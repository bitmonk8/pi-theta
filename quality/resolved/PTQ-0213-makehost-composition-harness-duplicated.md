---
id: PTQ-0213
title: b0275 redefines, near-verbatim, the makeHost/ComposeWorkspace composition-root harness from tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts
lens: D7                     # D2 | D7 — the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts:102-110
  - tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts:223-292
  - tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts:326-333
  - tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts:285-354
  - tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts:379-386
sites: 5
fix_scope: cross-module       # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260911104855
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-11
---

# b0275 redefines, near-verbatim, the makeHost/ComposeWorkspace composition-root harness from tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts

## Observation
tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts's own header
comment states that its `makeHost` / `plantWorkspace` / `runLoadPass` harness
"is modelled on, and duplicated from rather than shared with,
`tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts`". Reading
both files confirms the admission mechanically: the `PiHandler` type, the
`RecordedNote` and `HostDouble` interfaces, the whole `makeHost` function body,
the `ComposeWorkspace` interface, the `normalisePath` function, and the
settings-file-planting tail of `plantWorkspace` (comment included) are
byte-identical between the two files. `plantWorkspace`'s parameter typing and
`LoadPass`'s field set differ narrowly (b0275 adds a `PlantedBody` union so one
cell can spell its escaping entry as an absolute path once the temp root
exists; the source file's `LoadPass` additionally times the pass, which b0275
does not need). The same `makeHost(cwd: string): HostDouble` signature recurs
verbatim in ten files under tests/.

## Evidence

tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts:102-110 — the
file's own admission:
```ts
// TIER: unit — offline, provider-free, deterministic. Host doubles only; no
// provider, no child process, no live model. The seam is one predicate and one
// relocation loop inside the shipped composition root, and
// `composeExtensionInstance` over planted files reaches both directly and
// exposes the registration decisions on `wiring.thetas`, so neither an
// integration nor a live tier is needed. The harness (`makeHost` /
// `plantWorkspace` / `runLoadPass`) is modelled on, and duplicated from rather
// than shared with, `tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts`,
// bug 0271's landed witness, which this file neither reads from nor mutates.
```

tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts:223-236 —
types:
```ts
type PiHandler = (event: unknown, ctx: ExtensionContext) => unknown;

interface RecordedNote {
  readonly customType: string;
  readonly content: string;
  readonly details: unknown;
}

interface HostDouble {
  readonly pi: ExtensionAPI;
  readonly ctx: ExtensionContext;
  readonly notes: RecordedNote[];
  readonly notified: Array<readonly [string, string]>;
}
```

tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts:285-298
(byte-identical):
```ts
type PiHandler = (event: unknown, ctx: ExtensionContext) => unknown;

interface RecordedNote {
  readonly customType: string;
  readonly content: string;
  readonly details: unknown;
}

interface HostDouble {
  readonly pi: ExtensionAPI;
  readonly ctx: ExtensionContext;
  readonly notes: RecordedNote[];
  readonly notified: Array<readonly [string, string]>;
}
```

tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts:238-252 — the
double's `pi` half:
```ts
function makeHost(cwd: string): HostDouble {
  const notes: RecordedNote[] = [];
  const notified: Array<readonly [string, string]> = [];
  const handlers = new Map<string, PiHandler>();

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
```

tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts:300-314
(byte-identical, including the arbitrary no-op ordering):
```ts
function makeHost(cwd: string): HostDouble {
  const notes: RecordedNote[] = [];
  const notified: Array<readonly [string, string]> = [];
  const handlers = new Map<string, PiHandler>();

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
```

tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts:266-278 — the
double's `ctx` half and return:
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

  return { pi, ctx, notes, notified };
}
```

tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts:328-340
(byte-identical):
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

  return { pi, ctx, notes, notified };
}
```

tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts:282-292 —
`ComposeWorkspace` and `normalisePath`:
```ts
interface ComposeWorkspace {
  readonly cwd: string;
  /** Absolute, separator-normalised path of a file planted on the project source. */
  path: (name: string) => string;
  readonly dispose: () => void;
}

/** Separator-normalise a path so Win32 `\` and POSIX `/` spellings compare. */
function normalisePath(path: string): string {
  return path.replace(/\\/g, "/");
}
```

tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts:344-354
(byte-identical, including the doc comment):
```ts
interface ComposeWorkspace {
  readonly cwd: string;
  /** Absolute, separator-normalised path of a file planted on the project source. */
  path: (name: string) => string;
  readonly dispose: () => void;
}

/** Separator-normalise a path so Win32 `\` and POSIX `/` spellings compare. */
function normalisePath(path: string): string {
  return path.replace(/\\/g, "/");
}
```

tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts:326-333 — the
settings-file plant, comment included:
```ts
  // A minimal valid settings file pins the fixture's settings read to a known
  // value. An ABSENT settings file is silent (package-and-settings.md §Failure
  // modes), so the plant is hermeticity, not noise suppression.
  writeFileSync(join(cwd, ".pi", "settings.json"), "{}", "utf8");
  return {
    cwd,
    path: (name: string): string => normalisePath(join(cwd, ".pi", "theta", name)),
    dispose: (): void => rmSync(cwd, { recursive: true, force: true }),
```

tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts:379-386
(byte-identical, word for word including the parenthetical doc citation):
```ts
  // A minimal valid settings file pins the fixture's settings read to a known
  // value. An ABSENT settings file is silent (package-and-settings.md §Failure
  // modes), so the plant is hermeticity, not noise suppression.
  writeFileSync(join(cwd, ".pi", "settings.json"), "{}", "utf8");
  return {
    cwd,
    path: (name: string): string => normalisePath(join(cwd, ".pi", "theta", name)),
    dispose: (): void => rmSync(cwd, { recursive: true, force: true }),
```

Pattern-wide search: `grep -rl "^function makeHost(cwd: string): HostDouble {"
tests --include="*.test.ts"` → exactly 10 files:
tests/b0268-load-note-path-spelling-single-convention.test.ts,
tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts,
tests/b0280-prompt-mode-declaration-below-immediate-callee.test.ts,
tests/b0320-tools-entry-extension-rule-unenforced.test.ts,
tests/callee-post-parse-errors-un-register-tools-caller.test.ts,
tests/callee-tools-missing-theta-path-un-registers-tools-caller.test.ts,
tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts,
tests/lex-drop-single-delivery.test.ts,
tests/shared-subtree-judged-once-per-pass-not-once-per-path.test.ts, and
tests/thetalib-reparse-walk-single-delivery.test.ts.

tests/helpers/ currently holds call-with-clause-harness.ts,
category1-clause-oracle.ts, e2e-s1.ts, fake-clock.ts, fake-file-system.ts,
fake-file-watcher.ts, fake-host-loop-host.ts, fake-id-source.ts,
fake-json-child.ts, fake-rpc-child.ts and fake-token-estimator.ts — no module
among them exports an `ExtensionAPI`/`ExtensionContext` recording double or a
temp-workspace planter for `composeExtensionInstance`.

## Why this is a problem
This is the "Boilerplate duplication" class, and the file under review names
its own instance of it: the header comment states the harness was "duplicated
from rather than shared with" a named sibling file, and the named sibling's
`PiHandler` type, `RecordedNote`/`HostDouble` interfaces, whole `makeHost`
function, `ComposeWorkspace` interface, `normalisePath` function, and the
settings-file-planting tail of `plantWorkspace` (including its explanatory
comment) all match byte for byte. `plantWorkspace` and `runLoadPass` diverge
only where this file's own cells need something the source file's cells did
not (an absolute-path fixture body, no elapsed-time measurement) — the rest of
the setup/teardown sequence for driving `composeExtensionInstance` over a
planted temp workspace is reproduced rather than imported. The same
`makeHost(cwd: string): HostDouble` signature recurs verbatim in ten files
total, and tests/helpers/ hosts no module of this shape for any of them to
import instead.

## Suggested direction (non-binding, optional)
tests/helpers/ already holds a `fake-*.ts` module per recording double
(`fake-clock`, `fake-file-system`, `fake-file-watcher`, `fake-host-loop-host`,
…); a comparable module for the `ExtensionAPI`/`ExtensionContext` host double
and the temp-workspace planter is the home that convention already points at —
this names where the duplicated code already points, not a design for the
extraction.

## False-positive check
- Gate-pin: none of the cited files
  (tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts,
  tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts) match
  `*gate*.test.ts` or the named kin; not applicable.
- Recording-double: `makeHost`'s `notes`/`notified` arrays ARE a recording
  double, but this finding does not claim any assertion built on them cannot
  fail — it claims the double's own DEFINITION is copy-pasted across files
  rather than shared, which is a distinct claim the negative-witness carve-out
  does not cover.
- docs/bugs/ signature search: docs/bugs/0275-escaping-tools-entry-below-immediate-callee-silent-at-caller.md
  Status "fixed (0.274.0)"; docs/bugs/0271-prompt-grandchild-callee-drop-invisible-at-depth-two.md
  (the source file's own bug) Status "fixed (0.270.0)". `npx vitest run
  tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts` passes (5/5)
  at HEAD, so this is not a documented correct-reason red. Neither bug
  document's text offers a rationale for keeping the harness un-shared; bug
  0275's own text (§Gates) cites "bug 0271 witness `10 passed (10)`" as an
  unmoved control, not as a reason the two files' setup code must stay
  separate.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0275-escaping-tools-entry-below-immediate-callee\|grandchild-callee-drop-un-registers-depth-two-caller"
  docs/reference/coverage-matrix.md` → 0 hits. This finding does not propose
  merging, renaming or deleting either file — only that the shared harness
  pieces could be imported rather than redefined — so no citation is affected.
- Coverage check: the claim is about a repeated harness DEFINITION, not a
  missing test path; every cited function is exercised by the tests in its own
  file.

## Triage
verdict: confirmed — every cited excerpt (header admission, PiHandler/RecordedNote/HostDouble, makeHost, ctx block, ComposeWorkspace/normalisePath, settings-plant tail) diffs byte-identical between the two files at the stated lines, the 10-file makeHost grep and tests/helpers/ inventory reproduce exactly, both docs/bugs entries are fixed with no stated rationale against sharing (a third tests/helpers/ module would satisfy the header's "neither reads from nor mutates" concern, not violate it), and "boilerplate duplication — name the tests/helpers/ home" is an explicitly sanctioned D7 finding shape with no carve-out for per-bug witness harnesses (triage: claude-opus-5)
