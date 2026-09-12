---
id: PTQ-0251
title: The b0459 cell-4 production-seam harness (FakeCommandInfo, makeHarness, and its closing assertion block) is redefined near-verbatim in b0460
lens: D7                     # D2 | D7 — the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0459-cross-format-collision-message-form.test.ts:242-300
  - tests/b0459-cross-format-collision-message-form.test.ts:340-353
  - tests/b0460-skill-arm-vacuous-at-pin.test.ts:56-136
  - tests/b0460-skill-arm-vacuous-at-pin.test.ts:227-241
sites: 2                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912112713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# The b0459 cell-4 production-seam harness (FakeCommandInfo, makeHarness, and its closing assertion block) is redefined near-verbatim in b0460

## Observation
`tests/b0459-cross-format-collision-message-form.test.ts`'s "cell 4" describe
block (its only test driving the real `createThetaExtension` +
`composeExtensionInstance` production seam) and
`tests/b0460-skill-arm-vacuous-at-pin.test.ts`'s top-level harness each declare
an identical `FakeCommandInfo` interface (same fields, same 3-line doc
comment) and an identical `pi`/`ctx`/`fire` object-literal harness — named
`makeCell4Harness` in one file and `makeHarness` in the other — wiring
`createThetaExtension` + `composeExtensionInstance` with a `FakeClock` and a
`FakeFileWatcher`. The one test in each file that drives this seam (b0459's
sole cell-4 `it`; b0460's cell (iii)) also closes with an 11-line assertion
block reading the collision note that is byte-identical between the two
files. b0460's own doc comment (lines 72-73) states it is "mirroring b0459
cell 4".

## Evidence
`tests/b0459-cross-format-collision-message-form.test.ts:242-256` (interface +
harness signature):
```ts
/** One `pi.getCommands()` entry — the fake's `SlashCommandInfo` shape, extended
 *  (per bug 0024's harness) with the optional host-populated `sourceInfo` whose
 *  `path` the pinned host carries for every prompt template. */
interface FakeCommandInfo {
  readonly name: string;
  readonly source: string;
  readonly sourceInfo?: { readonly path: string; readonly source: string; readonly scope: string; readonly origin: string };
}

interface Cell4Harness {
  readonly pi: ExtensionAPI;
  readonly notes: string[];
  fireSessionStart(): Promise<void>;
}

function makeCell4Harness(cwd: string, extra: readonly FakeCommandInfo[]): Cell4Harness {
  const commands = new Map<string, unknown>();
```

`tests/b0460-skill-arm-vacuous-at-pin.test.ts:56-76` — the same interface,
byte-identical, and the same harness signature under a shorter name (the doc
comment above the function names the source: "mirroring b0459 cell 4"):
```ts
/** One `pi.getCommands()` entry — the fake's `SlashCommandInfo` shape, extended
 *  (per bug 0024's harness) with the optional host-populated `sourceInfo` whose
 *  `path` the pinned host carries for every prompt template. */
interface FakeCommandInfo {
  readonly name: string;
  readonly source: string;
  readonly sourceInfo?: { readonly path: string; readonly source: string; readonly scope: string; readonly origin: string };
}

interface Harness {
  readonly pi: ExtensionAPI;
  readonly notes: string[];
  readonly registeredNames: () => string[];
  fireSessionStart(): Promise<void>;
}

/** Factory + composeExtensionInstance seam over a real mkdtemp workspace,
 *  mirroring b0459 cell 4. `extra` plants the genuine Pi-owned entry under test;
```

`tests/b0459-cross-format-collision-message-form.test.ts:262-284` (the `pi`
object-literal core):
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
    getFlag: (): undefined => undefined,
    // Faithful to the host: an extension's own registrations come back as
    // `source: "extension"`; `extra` plants the genuine Pi-owned prompt entry.
    getCommands: (): readonly FakeCommandInfo[] => [
      ...[...commands.keys()].map((name) => ({ name, source: "extension" })),
      ...extra,
    ],
    sendMessage: (message: { content: string }): void => {
      notes.push(message.content);
    },
    sendUserMessage: (): void => {},
  } as unknown as ExtensionAPI;
```

`tests/b0460-skill-arm-vacuous-at-pin.test.ts:81-101` — the same object
literal, byte-identical apart from the two-line comment above `getCommands`
(moved into the function's own doc comment, quoted above):
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
    getFlag: (): undefined => undefined,
    getCommands: (): readonly FakeCommandInfo[] => [
      ...[...commands.keys()].map((name) => ({ name, source: "extension" })),
      ...extra,
    ],
    sendMessage: (message: { content: string }): void => {
      notes.push(message.content);
    },
    sendUserMessage: (): void => {},
  } as unknown as ExtensionAPI;
```

`tests/b0459-cross-format-collision-message-form.test.ts:343-353` (the cell-4
assertion tail):
```ts
    expect(
      collision,
      `expected exactly one collision note; got ${JSON.stringify(collision)}`,
    ).toHaveLength(1);
    const note = collision[0]!;
    // (a) the `.md` sibling is named, forward-slash spelled.
    expect(note).toContain(forwardMd);
    // (b) no off-template survives-suffix.
    expect(note).not.toContain("survives)");
    // (c) forward-slash spelling: no backslash anywhere in the rendered paths.
    expect(note).not.toMatch(/\\/);
```

`tests/b0460-skill-arm-vacuous-at-pin.test.ts:231-241` — byte-identical:
```ts
    expect(
      collision,
      `expected exactly one collision note; got ${JSON.stringify(collision)}`,
    ).toHaveLength(1);
    const note = collision[0]!;
    // (a) the `.md` sibling is named, forward-slash spelled.
    expect(note).toContain(forwardMd);
    // (b) no off-template survives-suffix.
    expect(note).not.toContain("survives)");
    // (c) forward-slash spelling: no backslash anywhere in the rendered paths.
    expect(note).not.toMatch(/\\/);
```

Full-span comparison (`diff -u` over `b0459:242-300` against `b0460:56-136`,
re-run immediately before filing): across that ~59-line span the only
differences are the interface name (`Cell4Harness` vs `Harness`, plus
`Harness`'s added `registeredNames` field), the two-line `getCommands` comment
moving into the function's own doc comment, and the `return` statement —
b0459 returns `{ pi, notes, fireSessionStart }` and lets its `it` block
construct the `FakeClock` / `ThetaExtensionDeps` / `createThetaExtension`
wiring inline (lines 326-338), while b0460 performs that byte-identical
`composeInstance` wiring inside `makeHarness` itself before returning.

## Why this is a problem
Two separate describe blocks — b0459's "cell 4" and b0460's cell (iii) — each
carry the same ~70 combined lines of harness-plus-assertion code (the
`FakeCommandInfo` interface, the `pi`/`ctx`/`fire` object literal, and the
closing 11-line note-shape assertion) rather than sharing one definition.
b0460's own doc comment states this is "mirroring b0459 cell 4" (lines
72-73), so the duplication is a traced, conscious copy rather than convergent
coincidence. A search for the exact `sourceInfo` field signature this
`FakeCommandInfo` carries
(`readonly sourceInfo?: { readonly path: string; readonly source: string; readonly scope: string; readonly origin: string }`)
across all of `tests/` returns exactly these two files — this specific
duplicated shape is not an instance of the repository's much broader,
separately-established "recording `pi`/`ctx` double" idiom (the bare
`getFlag: (): undefined => undefined` stub alone matches 79 other test files)
and is not the same shape as bug 0024's own richer harness in
`tests/rebind-self-collision-reownership.test.ts` (whose `FakeCommandInfo`
lacks `sourceInfo` and carries a materially different feature set: a
registration-order ledger, `fireSessionShutdown`, a counting file watcher) —
it is scoped to exactly this pair.

## Suggested direction (non-binding, optional)
`tests/helpers/compose-workspace-harness.ts` already centralises a
similarly-purposed "recording `pi`/`ctx` double wired to
`composeExtensionInstance` over a temp workspace" (`makeHost`) for three other
composition-root test files, but its `getCommands()` always returns `[]` and
its `sendMessage` capture records a structured `{customType, content,
details}` note rather than a bare content string — as it stands it does not
cover the pre-seeded-`extra`-entries / bare-content-string shape these two
files need. A home for that shape sitting alongside it is the natural
observation, not a design.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kinds (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate); the
  census/pin carve-out does not apply.
- Recording-double check: the `notes`/`pi.sendMessage` capture IS a recording
  double that backs legitimate MUST-NOT witnesses elsewhere in both files
  (e.g. b0460 cell (i)'s `expect(collisionNotes(harness.notes)).toHaveLength(0)`);
  this finding does not contest that role, or any assertion built on it — only
  that the harness CONSTRUCTING the double, and the one assertion tail that
  reads it in the shared production-seam cell, are duplicated code.
- docs/bugs/ signature search:
  `docs/bugs/0459-cross-format-collision-message-suffix-sibling-order-and-spelling.md`
  and `docs/bugs/0460-skill-arm-of-cross-format-collision-vacuous-at-pinned-host.md`
  both exist, both `Status: fixed` (0.458.0 / 0.459.0). This finding does not
  contest either test's redness/greenness — `npx vitest run
  tests/b0459-cross-format-collision-message-form.test.ts
  tests/b0460-skill-arm-vacuous-at-pin.test.ts` passes all 8 tests (5 + 3) at
  HEAD — only the shared harness/assertion code that precedes/closes the
  seam-driving cell in each file.
- coverage-matrix/bug-doc citation search: `grep -n "b0459\|b0460"
  docs/reference/coverage-matrix.md` → 0 hits. Each bug doc's own witness line
  (`docs/bugs/0459-...md:289`, `docs/bugs/0460-...md:194`) names only its own
  test file — the expected self-citation, not a cross-file pin. This finding
  proposes no merge, rename, or deletion of either test.
- Extent search: `grep -rl "FakeCommandInfo" tests/` → exactly 3 files
  (`b0459`, `b0460`, and `rebind-self-collision-reownership.test.ts`, bug
  0024's own harness, which has a different `FakeCommandInfo` shape — see
  above); `grep -rl "readonly sourceInfo?: { readonly path: string; readonly
  source: string; readonly scope: string; readonly origin: string }" tests/`
  → exactly `b0459` and `b0460`, confirming the specific duplicated shape does
  not recur beyond this pair (unlike the separately-verified 79-file generic
  recording-double idiom, which this finding does not rely on as evidence).
- Coverage check: this observation is about code duplicated between two
  existing, currently-passing test files; it does not claim any behaviour is
  untested.

## Triage
verdict: confirmed — independently re-verified: the full-span diff (b0459:242-300 vs b0460:56-136) reproduces exactly the claimed differences (Cell4Harness/Harness naming plus registeredNames, comment relocation, inline-vs-in-function composeInstance wiring), the 11-line assertion tail is byte-identical at both cited spans, and the sourceInfo-carrying FakeCommandInfo+harness shape is confirmed unique to exactly these two files (grep) versus 79 other files sharing only the generic getFlag stub and a differently-shaped rebind-self-collision-reownership.test.ts harness; docs/bugs status, coverage-matrix citation search, and gate-pin/recording-double carve-outs all reproduce as stated, and this matches the repo's own prior confirmed copy-paste-harness precedents (PTQ-0219, PTQ-0225) with no tracked duplicate (triage: claude-opus-5)
