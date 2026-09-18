---
id: PTQ-0632
title: load-warning-delivery.test.ts redeclares load-phase-pre-eval-routing.test.ts's RecordedNote/pi-double/ctx-double harness and GOOD_THETA/BAD_THETA fixtures
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/load-phase-pre-eval-routing.test.ts:34-47
  - tests/load-phase-pre-eval-routing.test.ts:50-56
  - tests/load-phase-pre-eval-routing.test.ts:66-141
  - tests/load-warning-delivery.test.ts:165-181
  - tests/load-warning-delivery.test.ts:285-291
  - tests/load-warning-delivery.test.ts:300-379
sites: 2                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# load-warning-delivery.test.ts redeclares load-phase-pre-eval-routing.test.ts's RecordedNote/pi-double/ctx-double harness and GOOD_THETA/BAD_THETA fixtures

## Observation
tests/load-warning-delivery.test.ts's `makeShippedHarness` (lines 300-379,
returning a `ShippedHarness`) and its `RecordedNote` interface (285-291) and
`GOOD_THETA`/`BAD_THETA` fixtures (165-181) are, apart from one added
parameter and two comment rewordings, the same declarations as
tests/load-phase-pre-eval-routing.test.ts's `makeHarness` (66-141, returning
a `Harness`), its `RecordedNote` interface (50-56), and its own
`GOOD_THETA`/`BAD_THETA` fixtures (34-47). load-warning-delivery.test.ts's
own header comment names load-phase-pre-eval-routing.test.ts as "the
tests/load-phase-pre-eval-routing.test.ts harness, extended with a
parameterisable model registry," and a fixture comment states `BAD_THETA` is
"reused from tests/load-phase-pre-eval-routing.test.ts" — the author
recognised the reuse and re-typed the block rather than importing it. No
module under tests/helpers/ exports this `pi`/`ctx` double pair or the
`RecordedNote` shape.

## Evidence

tests/load-phase-pre-eval-routing.test.ts:66-141 (the `makeHarness` body —
`pi` double, `ctx` double, `deps` wiring, `fireSessionStart` closure):
```ts
function makeHarness(cwd: string): Harness {
  const commands = new Map<string, unknown>();
  const notes: RecordedNote[] = [];
  const notifications: string[] = [];
  const subscriptions = new Map<
    string,
    ((event: unknown, ctx: ExtensionContext) => unknown)[]
  >();

  const pi = {
    registerFlag: (): void => {},
    registerMessageRenderer: (): void => {},
    registerCommand: (name: string, options: unknown): void => {
      commands.set(name, options);
    },
    on: (
      event: string,
      handler: (e: unknown, c: ExtensionContext) => unknown,
    ): void => {
```

tests/load-warning-delivery.test.ts:300-379 (the same body under a renamed
function and interface, with one added parameter, `[...availableModels]`
instead of `[]`, and two comment rewordings):
```ts
function makeShippedHarness(
  cwd: string,
  availableModels: readonly unknown[],
): ShippedHarness {
  const commands = new Map<string, unknown>();
  const notes: RecordedNote[] = [];
  const notifications: string[] = [];
  const subscriptions = new Map<
    string,
    ((event: unknown, ctx: ExtensionContext) => unknown)[]
  >();

  const pi = {
    registerFlag: (): void => {},
    registerMessageRenderer: (): void => {},
    registerCommand: (name: string, options: unknown): void => {
      commands.set(name, options);
    },
```

`RecordedNote` — tests/load-phase-pre-eval-routing.test.ts:50-56:
```ts
interface RecordedNote {
  readonly customType: string;
  readonly content: string;
  readonly display: boolean;
  readonly details: { readonly diagnostics?: readonly Diagnostic[] };
  readonly triggerTurn: unknown;
}
```
tests/load-warning-delivery.test.ts:285-291 (identical except the `details`
field is additionally widened to `| undefined`):
```ts
interface RecordedNote {
  readonly customType: string;
  readonly content: string;
  readonly display: boolean;
  readonly details: { readonly diagnostics?: readonly Diagnostic[] } | undefined;
  readonly triggerTurn: unknown;
}
```

`GOOD_THETA`/`BAD_THETA` — tests/load-phase-pre-eval-routing.test.ts:34-47:
```ts
const GOOD_THETA = ["---", "mode: prompt", "tools: read", "---", "@`hi`", ""].join(
  "\n",
);
// A load FAILURE: `tools:` names a Pi tool absent from the threaded registry →
// `theta/load/unknown-tool` (an error-severity ERR-6 pre-eval failure). The theta
// is dropped (un-registered); the failure MUST route onto the note channel.
const BAD_THETA = [
  "---",
  "mode: prompt",
  "tools: totally_unknown_xyz",
  "---",
  "@`hi`",
  "",
].join("\n");
```
tests/load-warning-delivery.test.ts:165-181 (byte-identical string values,
own comment: "reused from tests/load-phase-pre-eval-routing.test.ts"):
```ts
const GOOD_THETA = ["---", "mode: prompt", "tools: read", "---", "@`hi`", ""].join(
  "\n",
);

/**
 * The ERROR control (reused from tests/load-phase-pre-eval-routing.test.ts):
 * `tools:` names an unknown Pi tool → theta/load/unknown-tool (E), theta
 * dropped, failure note-routed. Error routing must be UNCHANGED by the fix.
 */
const BAD_THETA = [
  "---",
  "mode: prompt",
  "tools: totally_unknown_xyz",
  "---",
  "@`hi`",
  "",
].join("\n");
```

Exact search: `awk '/^function makeHarness\(cwd: string\): Harness \{/,/^}/' tests/load-phase-pre-eval-routing.test.ts` versus
`awk '/^function makeShippedHarness\(/,/^}/' tests/load-warning-delivery.test.ts`,
diffed line-by-line: 76 vs 79 lines, differing only in the function
signature (one added `availableModels` parameter), the `modelRegistry`
line (`[]` vs `[...availableModels]`), one two-line comment reworded, the
omission of a `pi` field from the returned object, and the inlining of the
`fireSessionStart` loop identically in both. `md5sum` over the `at`-free
literal `pi` double block (lines 75-110 of the routing file vs 312-347 of
the warning-delivery file) shows no byte difference.

## Why this is a problem
This is the "Boilerplate duplication" class: one recording `pi`/`ctx` double
pair, one `RecordedNote` interface, one `deps`/`createThetaExtension` wiring
block, one `fireSessionStart` closure, and two fixture constants are
declared twice rather than once, with the second file's own comments both
naming the first file as the origin of the shape it re-derives. No helper
under tests/helpers/ hosts this `pi`/`ctx` double pair or the `RecordedNote`
shape (verified against `ls tests/helpers/`: the closest neighbour,
`compose-workspace-harness.ts`, exports a structurally different
`HostDouble`/`makeHost` pair per PTQ-0213, with no `fireSessionStart` and a
no-op `registerCommand` that does not record command names).

## Suggested direction (non-binding, optional)
A shared module analogous to the already-extracted
`tests/helpers/compose-workspace-harness.ts` (PTQ-0213 precedent) for this
`RecordedNote`/`pi`-double/`ctx`-double shape — parameterised over the
`availableModels` list load-warning-delivery.test.ts already needs — is the
home this pair currently has no counterpart in.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin; not applicable.
- Recording-double check: both files' `notes`/`commands`/`notifications`
  back genuine assertions elsewhere in each file (e.g.
  `expect(harness.commands.has("goodtool")).toBe(true)`,
  `expect(errorHits.length).toBeGreaterThanOrEqual(1)`); this finding does
  not dispute any assertion built on the double, only that the double's
  definition is redeclared.
- docs/bugs/ signature search: `grep -rn "load-warning-delivery\|load-phase-pre-eval-routing" docs/bugs/` finds each file cited only in its own subject bug doc (0013 and V4e's originating work respectively); neither bug doc argues for keeping the harness unshared.
- coverage-matrix/bug-doc citation search: `grep -n "load-warning-delivery\|load-phase-pre-eval-routing" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any `it()`/`describe()`, only that the harness pieces could be imported rather than redeclared.
- Prior-finding search: resolved PTQ-0258 examined a differently-shaped
  four-file `CapturedNote`/`Harness`/`makeHarness` quad (b0458, b0462 x2,
  b0463) and explicitly listed load-phase-pre-eval-routing.test.ts and
  load-warning-delivery.test.ts among "the other eight" it found
  differently-shaped from THAT quad — it did not compare these two files to
  each other. Intake candidate qw20260917154546-d7-01-discovery-load-registry-oracle-duplicated.md
  covers a different duplication in load-warning-delivery.test.ts (the
  `RegistryRow`/`REGISTRY`/`loadRowMessage`/`interpolate` DIAG-4 reader
  block, shared with five discovery files) — a disjoint root cause from the
  `pi`/`ctx` recording-double harness cited here. No other located finding
  in quality/intake or quality/resolved names this
  `makeHarness`/`makeShippedHarness` pair.

## Triage
verdict: confirmed — independently re-verified: all six excerpts match at the cited lines; awk-extracted makeHarness vs makeShippedHarness bodies diff only in the signature (added availableModels param), the modelRegistry line ([] vs [...availableModels]), one reworded comment and the omitted `pi` return field, and md5 over the literal `pi` double (routing:75-110 vs warning-delivery:312-347) is identical; GOOD_THETA/BAD_THETA string values are byte-identical and RecordedNote differs only by `| undefined` on details; both harnesses are live (2 and 6 call sites) and back display/triggerTurn/notifications assertions; no tests/helpers/ module is a substitute — compose-workspace-harness makeHost has no fireSessionStart, a no-op registerCommand and no display/triggerTurn capture, package-merge-e2e-harness makeHarness flattens notes to {code,message,severity} and has a no-op ui.notify, watch-arming-harness records no notes and no toasts; not a duplicate — PTQ-0258's triage explicitly ruled load-phase-pre-eval-routing's shape distinct from its CapturedNote quad without comparing these two files to each other, and sibling intake d7-01 covers the disjoint RegistryRow/REGISTRY reader; coverage-matrix has 0 hits and the four docs/bugs/ citations (0013/0076/0113/0475 — the filing's "only its own subject bug doc" undercounted) are cell witnesses, none contesting a harness import; D7 boilerplate-duplication class, tests/ only (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
