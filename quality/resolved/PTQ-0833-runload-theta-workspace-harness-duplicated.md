---
id: PTQ-0833
title: subagent-executable-refusal-e2e.test.ts's theta()/THETAS/LoadOutcome/runLoad/beforeAll/afterAll block is byte-identical to b0323-subagent-executable-probe-wrap.test.ts's
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/subagent-executable-refusal-e2e.test.ts:30-93
  - tests/b0323-subagent-executable-probe-wrap.test.ts:100-158
sites: 2
fix_scope: cross-module
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# subagent-executable-refusal-e2e.test.ts's theta()/THETAS/LoadOutcome/runLoad/beforeAll/afterAll block is byte-identical to b0323-subagent-executable-probe-wrap.test.ts's

## Observation
`tests/subagent-executable-refusal-e2e.test.ts` declares a module-scope
`theta(...lines)` string-joiner, a `THETAS` fixture array (one subagent-mode
and one prompt-mode theta source), a `LoadOutcome` interface, an
`async function runLoad(cwd, host): Promise<LoadOutcome>` that builds an
inline `ExtensionAPI`/`ExtensionContext` pair and drives
`composeExtensionInstance(pi, ctx, { subagentExecutableHost: host })`, and a
`beforeAll`/`afterAll` pair that mints a temp workspace, plants the `THETAS`
fixtures under `.pi/theta`, and removes the directory. Every one of these
pieces — same names, same field order, same object-literal shape, same
comments where present — is independently declared again in
`tests/b0323-subagent-executable-probe-wrap.test.ts`, differing only in the
`mkdtemp` prefix string and the two inline `THETAS` comments (present in the
reviewed file, absent in b0323).

## Evidence

`tests/subagent-executable-refusal-e2e.test.ts:30-93` (full block, re-read
immediately before filing):
```ts
function theta(...lines: string[]): string {
  return lines.join("\n") + "\n";
}

const THETAS: readonly { readonly stem: string; readonly text: string }[] = [
  // A subagent-mode theta: refused when the child `pi` executable is unresolvable.
  { stem: "subq", text: theta("---", "mode: subagent", "model: claude-test", "---", "@`hi`") },
  // A prompt-mode theta: never launches a child, so it MUST still register.
  { stem: "promptq", text: theta("---", "mode: prompt", "---", "@`hi`") },
];

interface LoadOutcome {
  readonly registered: readonly string[];
  readonly noteContent: readonly string[];
}

async function runLoad(cwd: string, host: ExecutableHost): Promise<LoadOutcome> {
  const noteContent: string[] = [];
  const pi = {
    getFlag: (): undefined => undefined,
    getCommands: (): readonly unknown[] => [],
    sendMessage: (message: { content?: unknown }): void => {
      if (typeof message.content === "string") {
        noteContent.push(message.content);
      }
    },
    sendUserMessage: (): void => {},
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
    getAllTools: (): readonly unknown[] => [],
    registerMessageRenderer: (): void => {},
  } as unknown as ExtensionAPI;
```
(continues through the identical `ctx` literal, `composeExtensionInstance`
call, `beforeAll`/`afterAll` mkdtemp/mkdir/write-loop/rmSync pair — see the
b0323 excerpt below for the byte-for-byte match of the remainder.)

`tests/b0323-subagent-executable-probe-wrap.test.ts:100-158` (re-read
immediately before filing):
```ts
function theta(...lines: string[]): string {
  return lines.join("\n") + "\n";
}

const THETAS: readonly { readonly stem: string; readonly text: string }[] = [
  { stem: "subq", text: theta("---", "mode: subagent", "model: claude-test", "---", "@`hi`") },
  { stem: "promptq", text: theta("---", "mode: prompt", "---", "@`hi`") },
];

interface LoadOutcome {
  readonly registered: readonly string[];
  readonly noteContent: readonly string[];
}

async function runLoad(cwd: string, host: ExecutableHost): Promise<LoadOutcome> {
  const noteContent: string[] = [];
  const pi = {
    getFlag: (): undefined => undefined,
    getCommands: (): readonly unknown[] => [],
    sendMessage: (message: { content?: unknown }): void => {
      if (typeof message.content === "string") {
        noteContent.push(message.content);
      }
    },
```

The remaining `sendUserMessage`/`getActiveTools`/`setActiveTools`/
`getAllTools`/`registerMessageRenderer` fields, the `ctx` literal (`cwd`,
`hasUI: true`, the `modelRegistry.getAvailable` single-model array, `ui:
{ notify }`), the `composeExtensionInstance(pi, ctx, {
subagentExecutableHost: host })` call, the `let workspaceDir: string;`
declaration, and the `beforeAll`/`afterAll` pair (`mkdtempSync(join(tmpdir(),
"theta-b0323-exec-wrap-"))` vs `"theta-rfc0005-exec-refusal-"`,
`mkdirSync(dir, { recursive: true })`, the `for (const l of THETAS)`
write-loop, `rmSync(workspaceDir, { recursive: true, force: true })`) are
identical character-for-character between the two files apart from that one
prefix string.

Search: `grep -rln "async function runLoad(cwd: string, host: ExecutableHost)"
tests/*.test.ts` returns exactly these two files.

## Why this is a problem
The full harness a file needs to drive a fake `ExecutableHost` through the
real `composeExtensionInstance` over a two-theta (subagent + prompt) planted
workspace — the `theta()` joiner, the `THETAS` fixture, the `LoadOutcome`
shape, the `runLoad` function (inline `pi`/`ctx` doubles included), and the
`beforeAll`/`afterAll` plant/dispose pair — is authored twice rather than
once. `tests/helpers/compose-workspace-harness.ts` exists and is imported by
several sibling composition-root test files for an adjacent but differently-
shaped `makeHost`/`finishWorkspace`/`runLoadPass` harness; neither of these
two files draws on it, and no `tests/helpers/` module holds this specific
`runLoad`-over-`subagentExecutableHost`-override shape either, so the two
files reconstruct the entire sequence independently.

## Suggested direction (non-binding, optional)
A shared `tests/helpers/` module naming this `theta()`/`THETAS`-style
fixture-plant / `runLoad` pair once would let both files import a single
declaration instead of two independently authored ones; this is an
observation about the existing duplication, not a design for the shared
module's shape.

## False-positive check
- Gate-pin carve-out: neither file matches `*gate*.test.ts` or the named gate
  kin; `THETAS` is a two-entry fixture array feeding a load pass, not a
  pinned count/inventory assertion this finding touches.
- Recording-double carve-out: the inline `pi`/`ctx` doubles and
  `noteContent` capture are scaffolding to observe the real
  `composeExtensionInstance`'s output, not a MUST-NOT-called negative
  witness; the carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "subagent-executable-refusal-e2e\|
  b0323-subagent-executable-probe-wrap" docs/bugs/*.md` — both files are
  named, but only as witness-test citations for bugs 0183 and 0207 (a stale
  composition-root comment) and bug 0323 (the probe-wrap fix's own gate);
  none of those citations pins or excuses the duplicated `runLoad`/`THETAS`
  block itself, and no bug document states a rationale for keeping the
  sequence local to each file.
- coverage-matrix/bug-doc citation search: `grep -n
  "subagent-executable-refusal-e2e\|b0323-subagent-executable-probe-wrap"
  docs/reference/coverage-matrix.md` — 0 hits. This finding proposes no
  merge, rename, or deletion of either file or any `it()`/`describe()` in
  them — only that the shared setup could live in one place instead of two.
- Coverage-drift check: the claim is about a repeated harness DEFINITION
  (`theta`/`THETAS`/`LoadOutcome`/`runLoad`/`beforeAll`/`afterAll`), not a
  missing test path; both files' own tests are unaffected by this claim.
- Overlap check: PTQ-0570 and PTQ-0685 (both `status: fixed`) previously
  covered this same file pair's `resolvingHost()`/`bothRungsFailHost()`
  double declarations specifically — those two functions are now imported
  from `./helpers/fake-json-child` in both files (confirmed by re-read) and
  are excluded from this claim; PTQ-0361 covers a disjoint file pair
  (b0328/b0329) and a differently-shaped `finishWorkspace`-adjacent
  sequence. No existing filed or resolved item names this `runLoad`/`THETAS`
  block for either file.

## Triage
<!-- triage appends its note here -->
verdict: confirmed — independently re-verified: both blocks reproduce at the cited lines (refusal-e2e:30-93, b0323:100-158) and sed-extracted copies diff to nothing but the two THETAS comments, a 3-line sendMessage comment the filing omitted, and the mkdtemp prefix — code byte-identical; stated search `async function runLoad(cwd: string, host: ExecutableHost)` → exactly these two files, docs/bugs cite them only as witnesses (0183/0207/0323), coverage-matrix 0 hits; no tests/helpers home covers this shape (compose-workspace-harness.runLoadPass passes `undefined` overrides; production-load-harness.runProductionLoad drives discoverAndComposeFixtures with no subagentExecutableHost slot or sendMessage capture) and the two other `runLoad` declarations (extension-tool-unreachable, subagent-root-registration) are diverged option-bag variants, so sites: 2 stands; both copies live (3 and 2+ runLoad calls), both under tests/, D7 boilerplate-duplication class, not a gate file, no merge/rename/delete proposed; dedupe holds — resolved PTQ-0570/0685 covered only resolvingHost/bothRungsFailHost in this pair (now imported), PTQ-0703 covers slsh5/hash-refusal plant-dispose and never names these files, PTQ-0782/0606 cover the theta() joiner in other file families (fixer note: the beforeAll/afterAll tail is the plantThetaWorkspace/disposeWorkspace lifecycle PTQ-0703 already targets) (triage: claude-fable-5-1)
