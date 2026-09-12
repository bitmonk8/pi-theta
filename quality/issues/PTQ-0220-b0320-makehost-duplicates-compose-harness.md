---
id: PTQ-0220
title: b0320 redeclares the makeHost/HostDouble/ComposeWorkspace composition-root harness that tests/helpers/compose-workspace-harness.ts already exports
lens: D7                     # D2 | D7 — the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0320-tools-entry-extension-rule-unenforced.test.ts:147-206
  - tests/b0320-tools-entry-extension-rule-unenforced.test.ts:210-241
  - tests/helpers/compose-workspace-harness.ts:21-77
  - tests/helpers/compose-workspace-harness.ts:79-105
sites: 4
fix_scope: localized          # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912091742
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# b0320 redeclares the makeHost/HostDouble/ComposeWorkspace composition-root harness that tests/helpers/compose-workspace-harness.ts already exports

## Observation
tests/b0320-tools-entry-extension-rule-unenforced.test.ts declares its own
module-scope `PiHandler` type, `RecordedNote`/`HostDouble` interfaces,
`makeHost` function, `ComposeWorkspace` interface, `normalisePath` function,
and a `plantWorkspace` function whose settings-file-planting tail matches
`finishWorkspace`. tests/helpers/compose-workspace-harness.ts already exports
`PiHandler`, `RecordedNote`, `HostDouble`, `makeHost`, `ComposeWorkspace`,
`normalisePath`, and `finishWorkspace` — its own header states it exists
because "several test files independently redeclared" exactly these pieces
(citing PTQ-0213). b0320's own header (lines 65-68) states its harness is
"modelled on, and DUPLICATED FROM rather than shared with"
`tests/callee-tools-missing-theta-path-un-registers-tools-caller.test.ts`, a
sibling test file, not this helper module — b0320 imports nothing from
tests/helpers/compose-workspace-harness.ts.

## Evidence
tests/b0320-tools-entry-extension-rule-unenforced.test.ts:147-160 (types):
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

tests/helpers/compose-workspace-harness.ts:21-34 (the canonical export, same
declarations, `export`-prefixed):
```ts
export type PiHandler = (event: unknown, ctx: ExtensionContext) => unknown;

export interface RecordedNote {
  readonly customType: string;
  readonly content: string;
  readonly details: unknown;
}

export interface HostDouble {
  readonly pi: ExtensionAPI;
  readonly ctx: ExtensionContext;
  readonly notes: RecordedNote[];
  readonly notified: Array<readonly [string, string]>;
}
```

tests/b0320-tools-entry-extension-rule-unenforced.test.ts:162-176 (`makeHost`,
opening):
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

tests/helpers/compose-workspace-harness.ts:37-51 (byte-identical apart from
the leading `export`):
```ts
export function makeHost(cwd: string): HostDouble {
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

tests/b0320-tools-entry-extension-rule-unenforced.test.ts:194-206 (the
double's `ctx` half and return):
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

tests/helpers/compose-workspace-harness.ts:65-77 (byte-identical):
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

tests/b0320-tools-entry-extension-rule-unenforced.test.ts:210-220
(`ComposeWorkspace` + `normalisePath`):
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

tests/helpers/compose-workspace-harness.ts:79-89 (byte-identical apart from
`export`):
```ts
export interface ComposeWorkspace {
  readonly cwd: string;
  /** Absolute, separator-normalised path of a file planted on the project source. */
  path: (name: string) => string;
  readonly dispose: () => void;
}

/** Separator-normalise a path so Win32 `\` and POSIX `/` spellings compare. */
export function normalisePath(path: string): string {
  return path.replace(/\\/g, "/");
}
```

tests/b0320-tools-entry-extension-rule-unenforced.test.ts:229-241
(`plantWorkspace`'s settings-plant-and-return tail):
```ts
function plantWorkspace(files: Readonly<Record<string, string>>): ComposeWorkspace {
  const cwd = mkdtempSync(join(tmpdir(), "theta-b0320-"));
  mkdirSync(join(cwd, ".pi", "theta"), { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(cwd, ".pi", "theta", name), body, "utf8");
  }
  writeFileSync(join(cwd, ".pi", "settings.json"), "{}", "utf8");
  return {
    cwd,
    path: (name: string): string => normalisePath(join(cwd, ".pi", "theta", name)),
    dispose: (): void => rmSync(cwd, { recursive: true, force: true }),
  };
}
```

tests/helpers/compose-workspace-harness.ts:91-105 (`finishWorkspace` — the
same settings-write-then-return tail `plantWorkspace` above reproduces
inline):
```ts
/**
 * Finish planting a temp compose workspace at `cwd`, once a caller has written
 * its own `.pi/theta/` (and optional `outside/`) fixture files there: write a
 * minimal valid settings file — an ABSENT settings file is silent
 * (package-and-settings.md §Failure modes), so the plant is hermeticity, not
 * noise suppression — and return the `ComposeWorkspace` handle.
 */
export function finishWorkspace(cwd: string): ComposeWorkspace {
  writeFileSync(join(cwd, ".pi", "settings.json"), "{}", "utf8");
  return {
    cwd,
    path: (name: string): string => normalisePath(join(cwd, ".pi", "theta", name)),
    dispose: (): void => rmSync(cwd, { recursive: true, force: true }),
  };
}
```

Pattern-wide search: `grep -rl "function makeHost(cwd: string): HostDouble {"
tests --include="*.test.ts"` (the same search PTQ-0213 ran) now returns 12
files carrying a local copy — b0268-load-note-path-spelling-single-convention,
b0280-prompt-mode-declaration-below-immediate-callee, b0320 (this file),
b0435-fallback-diagnostic-reentry, callee-post-parse-errors-un-register-tools-caller,
callee-tools-missing-theta-path-un-registers-tools-caller, expression-evaluator,
extension-bootstrap-sink-liveness, grandchild-callee-drop-un-registers-depth-two-caller,
lex-drop-single-delivery, shared-subtree-judged-once-per-pass-not-once-per-path,
and thetalib-reparse-walk-single-delivery — of which only
tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts imports
`makeHost` from tests/helpers/compose-workspace-harness.ts instead of
redeclaring it.

## Why this is a problem
PTQ-0213 (status: fixed) confirmed this exact duplication for
tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts against a
different sibling file and named tests/helpers/ as the natural home; its
landed fix created tests/helpers/compose-workspace-harness.ts (the module's
own header cites "PTQ-0213") and migrated the one file that finding examined.
b0320 was already present, by name, in that finding's own pattern-wide search
(one of the 10 pre-existing files carrying a local `makeHost`) but was never
one of its cited locations or a file its remediation touched, so it still
carries the exact `PiHandler`/`RecordedNote`/`HostDouble`/`makeHost`/
`ComposeWorkspace`/`normalisePath` shape the now-existing helper exports,
plus a `plantWorkspace` whose settings-file tail duplicates `finishWorkspace`.
The canonical helper this class of finding asks to cite is not hypothetical
here — it exists on disk, under this exact name and shape, and b0320 does not
import it.

## Suggested direction (non-binding, optional)
tests/helpers/compose-workspace-harness.ts already exports `makeHost`,
`HostDouble`, `RecordedNote`, `PiHandler`, `ComposeWorkspace`, `normalisePath`,
and `finishWorkspace`; b0320's own `plantWorkspace` already separates the part
that varies (writing its own per-cell fixture files) from the settings-plant-
and-return tail that does not, which is the shape `finishWorkspace` was built
to close over.

## False-positive check
- Gate-pin: tests/b0320-tools-entry-extension-rule-unenforced.test.ts does not
  match `*gate*.test.ts` or the named kin; not applicable.
- Recording-double: `makeHost`'s `notes`/`notified` arrays back a legitimate
  recording double the tests read from, but this finding does not claim any
  assertion built on them cannot fail — it claims the double's own
  DEFINITION is copy-pasted rather than imported, the same distinct claim
  PTQ-0213 filed and that was confirmed for a different file pair.
- docs/bugs/ signature search: docs/bugs/0320-tools-entry-extension-rule-unenforced.md
  — Status "fixed (0.327.0)"; `npx vitest run
  tests/b0320-tools-entry-extension-rule-unenforced.test.ts` passes (10/10) at
  HEAD, so this is not a documented correct-reason red, and the bug document
  states no rationale for keeping this harness un-shared (its own §Gates line
  merely names the file as its witness).
- coverage-matrix/bug-doc citation search: `grep -n
  "b0320-tools-entry-extension-rule-unenforced" docs/reference/coverage-matrix.md`
  → 0 hits. This finding proposes no merge, rename, or deletion of the file or
  any `it()`/`describe()` inside it — only that the harness pieces already
  exported by tests/helpers/compose-workspace-harness.ts could be imported
  rather than redeclared — so no citation is affected.
- Coverage check: the claim is about a repeated harness DEFINITION, not a
  missing test path; every duplicated function is exercised by the tests in
  its own file (10/10 passing, confirmed above).
- Overlap check: distinct from PTQ-0213 (fixed) — that finding's cited
  `locations` are tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts
  and tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts; b0320
  appears there only inside a pattern-wide grep count, never as a cited
  location or a file its remediation touched, and its own comparison sibling
  (tests/callee-tools-missing-theta-path-un-registers-tools-caller.test.ts,
  bug 0270's witness) is a third file neither PTQ-0213 nor this finding treats
  as the citation target — the target here is the now-existing helper module
  itself.

## Triage
verdict: confirmed — direct diff confirms tests/b0320-tools-entry-extension-rule-unenforced.test.ts:147-241 reproduces the PiHandler/RecordedNote/HostDouble/makeHost/ComposeWorkspace/normalisePath/plantWorkspace-tail shape byte-for-byte (only cosmetic reformatting) against tests/helpers/compose-workspace-harness.ts:21-105, whose own header cites PTQ-0213; b0320's header (lines 65-68) admits duplication from a sibling test file rather than this helper and greps show zero import; PTQ-0213 (fixed) enumerated b0320 among its 10-file pattern search but its landed fix migrated only b0275, leaving b0320 — and even PTQ-0213's own second cited location, grandchild-callee-drop-un-registers-depth-two-caller.test.ts — still undeclared-vs-imported, so this is a distinct, unremediated occurrence rather than a duplicate of PTQ-0213's narrower closed scope, consistent with this store's per-occurrence filing convention (cf. PTQ-0206/PTQ-0207); the Evidence section's "now returns 12 files" recount is inflated (the stated exact-signature grep actually returns 9; expression-evaluator.test.ts's unrelated EvalHost-shaped makeHost was miscounted in) but this does not disturb the independently-verified core claim (triage: claude-opus-5)
