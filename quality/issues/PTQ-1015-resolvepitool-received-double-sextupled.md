---
id: PTQ-1015
title: The `resolvePiTool` "record params into `received`, resolve a fixed text" PiToolDispatch double is redeclared six times across five files, one of them in scope
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/nested-control-in-pure-position.test.ts:92-98
  - tests/production-core-exec.test.ts:97-103
  - tests/pure-async-unification.test.ts:211-217
  - tests/ctor-declaration-order.test.ts:757-763
  - tests/ctor-proto-named-field.test.ts:964-970
  - tests/ctor-proto-named-field.test.ts:1050-1056
sites: 6
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918155535
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# The `resolvePiTool` "record params into `received`, resolve a fixed text" PiToolDispatch double is redeclared six times across five files, one of them in scope

## Observation
`tests/nested-control-in-pure-position.test.ts` declares, inside its local
`okGrep()` factory, a `resolvePiTool` closure whose returned `PiToolDispatch`
has an `execute(_id, params)` body that assigns `params` into an outer
`received` variable and resolves `{ content: [{ type: "text", text: "..." }] }`.
The identical seven-line body (line-for-line identical apart from the
resolved text string) is independently redeclared in four other files —
`tests/production-core-exec.test.ts`, `tests/pure-async-unification.test.ts`,
`tests/ctor-declaration-order.test.ts` and twice in
`tests/ctor-proto-named-field.test.ts` — none of which import it from a
shared module; no `tests/helpers/*.ts` file exports this shape.

## Evidence

`tests/nested-control-in-pure-position.test.ts:92-98` (re-read immediately before filing):
```ts
    resolvePiTool: (name: string): PiToolDispatch => ({
      toolName: name,
      execute: (_id, params): Promise<AgentToolResultEnvelope> => {
        received = params;
        return Promise.resolve({ content: [{ type: "text", text: "42 matches" }] });
      },
    }),
```

`tests/production-core-exec.test.ts:97-103`:
```ts
    const resolvePiTool = (name: string): PiToolDispatch => ({
      toolName: name,
      execute: (_id, params): Promise<AgentToolResultEnvelope> => {
        received = params;
        return Promise.resolve({ content: [{ type: "text", text: "42 matches" }] });
      },
    });
```

`tests/pure-async-unification.test.ts:211-217` (identical to the above):
```ts
    const resolvePiTool = (name: string): PiToolDispatch => ({
      toolName: name,
      execute: (_id, params): Promise<AgentToolResultEnvelope> => {
        received = params;
        return Promise.resolve({ content: [{ type: "text", text: "42 matches" }] });
      },
    });
```

`tests/ctor-declaration-order.test.ts:757-763` (same body, resolved text `"done"`):
```ts
    const resolvePiTool = (name: string): PiToolDispatch => ({
      toolName: name,
      execute: (_id, params): Promise<AgentToolResultEnvelope> => {
        received = params;
        return Promise.resolve({ content: [{ type: "text", text: "done" }] });
      },
    });
```

`tests/ctor-proto-named-field.test.ts:964-970` (same body, resolved text `"done"`):
```ts
    const resolvePiTool = (name: string): PiToolDispatch => ({
      toolName: name,
      execute: (_id, params): Promise<AgentToolResultEnvelope> => {
        received = params;
        return Promise.resolve({ content: [{ type: "text", text: "done" }] });
      },
    });
```

`tests/ctor-proto-named-field.test.ts:1050-1056` (a third, separate site in the same file, same body, resolved text `"done"`):
```ts
    const resolvePiTool = (name: string): PiToolDispatch => ({
      toolName: name,
      execute: (_id, params): Promise<AgentToolResultEnvelope> => {
        received = params;
        return Promise.resolve({ content: [{ type: "text", text: "done" }] });
      },
    });
```

Exact search run: `grep -n "received = params;" tests/*.test.ts` returns
exactly these six lines (plus the five lines' respective `const resolvePiTool =
(name: string): PiToolDispatch => ({` preamble immediately above each); `grep
-rn "export function.*PiToolDispatch\|resolvePiTool.*received" tests/helpers/*.ts`
finds no exported equivalent — `tests/helpers/tool-call-dispatch-harness.ts`
(which `tests/nested-control-in-pure-position.test.ts` already imports many
other builders from) exports no `resolvePiTool`-returning factory at all.

## Why this is a problem
All six declarations implement the same fixture: a `PiToolDispatch` whose
`execute` records the call's `params` for a later assertion and resolves a
scripted text payload, with the only difference between sites being which
literal string is resolved (`"42 matches"` at three sites, `"done"` at
three sites). None of the five files imports this shape from another; each
independently retypes the same `toolName`/`execute`/`Promise.resolve({
content: [{ type: "text", text: ... }] })` structure. A change to the
`PiToolDispatch`/`AgentToolResultEnvelope` contract this double satisfies —
for example an added required field on the envelope, or a change to how
`execute`'s second parameter is typed — has six hand-synchronised call sites
to update instead of one shared factory.

## Suggested direction (non-binding, optional)
A small factory such as `recordingPiTool(text: string): { resolvePiTool,
received }` — the shape `tests/nested-control-in-pure-position.test.ts`'s own
`okGrep()` already wraps around this exact body — parameterised by the
resolved text, would let all six sites construct the same double from one
declaration; `tests/helpers/tool-call-dispatch-harness.ts`, which several of
these files already import other builders from, is the kind of module this
repository already uses for exactly this class of shared double.

## False-positive check
- Gate-pin check: none of the five files matches `*gate*.test.ts` or the
  named gate kin; the cited lines are a `PiToolDispatch` double declaration,
  not a pinned count or inventory assertion.
- Recording-double check: the AGENTS.md carve-out protects a recording
  double's own MUST-NOT-called assertion, not the double's construction
  code. This finding cites where the double's `execute` body is redeclared,
  not any test that asserts a tool was never called; the double records a
  positive call for later value assertions (`received`), which is the
  documented, legitimate use the carve-out anticipates — the finding is
  about the six independent redeclarations of that construction, not about
  the assertions built on it.
- docs/bugs/ signature search: `grep -rln "resolvePiTool.*received\|42 matches\|received = params" docs/bugs/*.md`
  → 0 hits; no open bug document pins this double's construction as a
  documented correct-reason shape that must stay local per file.
- coverage-matrix/bug-doc citation search: `grep -n
  "nested-control-in-pure-position\|production-core-exec\|pure-async-unification\|ctor-declaration-order\|ctor-proto-named-field"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of any `it()`/`describe()` cell in any of the
  five files — only that the shared `PiToolDispatch` double construction
  could be declared once; every cell that builds and uses this double keeps
  its own assertions and its own resolved-text fixture value.
- Prior-finding overlap check: `grep -rl "resolvePiTool = (name: string): PiToolDispatch\|received = params;" quality/issues/*.md quality/resolved/*.md quality/intake/*.md`
  found no prior filing citing this construction; resolved PTQ-0848 covers a
  disjoint cluster in the same two `ctor-*.test.ts` files (the
  `livePi`/`rootLive`/`registryDouble`/`ctxLive`/`finalValue`/`renderedTurn`/
  `ownKeys` production-composition drive harness, lines 188-380 and 248-491)
  and resolved PTQ-0797 covers a further disjoint cluster in
  `ctor-proto-named-field.test.ts` (`ANTHROPIC_MODEL`/`SessionEntryDouble`/
  `parseDeps`/`LiveSessionDouble`, lines 188-310); neither cites the
  `resolvePiTool`/`received`/`execute` double at any of the line ranges cited
  here, and resolved PTQ-0639 (this file's own `NOOP_CHECKPOINT`/AST-builder
  mirror of `production-core-exec.test.ts`) also cites a disjoint range
  (lines 1-197 of the harness declared before this file's `okGrep`) and does
  not mention `okGrep`, `resolvePiTool`, or `received`.
- Coverage check: the claim is about a repeated double DEFINITION, not a
  missing test path; every cited site's double is live and exercised by its
  own file's passing cells at HEAD.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — all six excerpts reproduce verbatim at the cited lines (nested-control:92-98 inside `okGrep()`, production-core-exec:97-103, pure-async-unification:211-217, ctor-declaration-order:757-763, ctor-proto-named-field:964-970 and :1050-1056), every copy is live (each cell asserts or harness-guards `received` after the drive), the bodies are identical modulo the resolved string, `tests/helpers/*.ts` exports no recording `PiToolDispatch` factory (only thetalib-load-harness's private `ambientResolvePiTool` sentinel and tool-call-dispatch-harness's `resolvePiTool?` passthrough option), docs/bugs (0) and coverage-matrix (0) searches reproduce, no cited file is a gate, and no tracked PTQ covers this construction (PTQ-0696's `recordingPiTool` in shadowed-callable-call/tool-arg-shape-enforcement is an array-recording `${toolName}-out` cousin, not this body) — in-scope D7 copy-paste double whose fix is mechanical (nested-control's own `okGrep()` is already the proposed `{ resolvePiTool, received() }` factory); ONE evidentiary claim is false and must be corrected at ticketing: the `received = params;` search over `tests/*.test.ts` returns SEVEN lines, not six (production-core-exec.test.ts:266-272 is an uncited copy resolving "contents"), and widening to tests/** adds an eighth at tests/conformance/production-conformance.test.ts:498-504 resolving "42 matches" — the root cause is 8 sites across 6 files, so `sites` and `locations` are understated by two (triage: claude-fable-5-1)