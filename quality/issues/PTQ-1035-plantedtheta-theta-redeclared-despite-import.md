---
id: PTQ-1035
title: production-tools-load-resolution.test.ts redeclares theta()/PlantedTheta byte-identically to the theta()/PlantedThetaFile it already imports the sibling harness from
lens: D7
status: open
verdict: confirmed
locations:
  - tests/production-tools-load-resolution.test.ts:132-138
  - tests/helpers/production-load-harness.ts:125-127
  - tests/helpers/production-load-harness.ts:140-145
sites: 1
fix_scope: localized
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# production-tools-load-resolution.test.ts redeclares theta()/PlantedTheta byte-identically to the theta()/PlantedThetaFile it already imports the sibling harness from

## Observation
`tests/production-tools-load-resolution.test.ts` imports
`disposeWorkspace`, `plantThetaWorkspace`, `runProductionLoad` and the
`LoadOutcome` type from `./helpers/production-load-harness` (its only test
helper import), but declares its own module-local `PlantedTheta` interface
and `theta(...lines)` line-joining function instead of importing the
`PlantedThetaFile` interface and `theta` function the same helper module
already exports. The local `theta()` function's body is byte-identical to
the exported one, and the local `PlantedTheta` interface is a structural
subset of the exported `PlantedThetaFile` (both declare `stem`/`text`;
`PlantedThetaFile` adds one optional `ext` field the file never needs).

## Evidence
`tests/production-tools-load-resolution.test.ts:132-138` (re-read
immediately before filing):
```ts
interface PlantedTheta {
  readonly stem: string;
  readonly text: string;
}

function theta(...lines: readonly string[]): string {
  return lines.join("\n") + "\n";
}
```

`tests/helpers/production-load-harness.ts:125-127` (the canonical `theta`
export, byte-identical body):
```ts
export function theta(...lines: readonly string[]): string {
  return lines.join("\n") + "\n";
}
```

`tests/helpers/production-load-harness.ts:140-145` (the canonical
`PlantedThetaFile` export the local `PlantedTheta` structurally subsets):
```ts
/** One fixture `plantThetaWorkspace` writes under a workspace's `.pi/theta/`. */
export interface PlantedThetaFile {
  readonly stem: string;
  readonly text: string;
  /** File extension, sans dot; default `"theta"`. */
  readonly ext?: string;
}
```

The file's own import block (`tests/production-tools-load-resolution.test.ts:1-7`):
```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  disposeWorkspace,
  plantThetaWorkspace,
  runProductionLoad,
  type LoadOutcome,
} from "./helpers/production-load-harness";
```
names neither `theta` nor `PlantedThetaFile`, though both are exported
members of the module already on this import line. `plantThetaWorkspace`'s
own signature (`tests/helpers/production-load-harness.ts:153-156`) accepts
`readonly PlantedThetaFile[]`, and the in-scope file already calls it with
its local `THETAS: readonly PlantedTheta[]` array
(`tests/production-tools-load-resolution.test.ts:147`, and the call site
`plantThetaWorkspace(workspaceDir Prefix, THETAS, "{}")` at
`tests/production-tools-load-resolution.test.ts` inside `beforeAll`), so the
structurally-compatible local type already passes through the canonical
function's parameter unchanged.

## Why this is a problem
The two declarations are not an independent convergent design: they sit
inside a file whose `beforeAll` already calls `plantThetaWorkspace` from the
exact module that also exports `theta` and `PlantedThetaFile`, so nothing
about a module boundary forces the local redeclaration. A prior fix
(PTQ-0600) migrated this same file's `LoadOutcome`/`runProductionLoad`/plant-
dispose lifecycle onto this helper but left the `theta()`/`PlantedTheta`
pair as local leftovers redeclaring pieces of the very module the migration
introduced an import from.

## Suggested direction (non-binding, optional)
The call site already accepts `PlantedThetaFile`-shaped fixtures without any
change to `THETAS`'s literal contents, so importing `theta` and
`PlantedThetaFile` from `./helpers/production-load-harness` in place of the
local declarations is the natural next step alongside the already-migrated
`plantThetaWorkspace`/`runProductionLoad`/`disposeWorkspace` imports.

## False-positive check
- Gate-pin check: the file does not match `*gate*.test.ts` or a named gate
  kin; the cited lines are a fixture-line joiner and a fixture-shape
  interface, not a pinned count or inventory assertion.
- Recording-double check: `theta()` builds fixture text and `PlantedTheta`
  types a plain data literal; neither backs a "never called" MUST-NOT
  witness, so the recording-double carve-out does not apply.
- docs/bugs/ signature search: `grep -rn "PlantedTheta\b" docs/bugs/*.md` →
  0 hits; no documented correct-reason red cites this interface or the local
  `theta()` function.
- coverage-matrix/bug-doc citation search: `grep -n
  "production-tools-load-resolution" docs/reference/coverage-matrix.md` → 0
  hits. This finding proposes no merge, rename, or deletion of any
  `it()`/`describe()` block or of `THETAS`'s contents — only that the local
  `theta`/`PlantedTheta` declarations could be replaced by the sibling
  imports already open on the same import line.
- Coverage check: this is not a claim that a behaviour or path is untested;
  every `it()` in the file keeps reading `outcome.registered`/
  `outcome.notifications` exactly as today.
- Prior-finding overlap check: `grep -rl "production-tools-load-resolution"
  quality/issues/*.md quality/resolved/*.md` → PTQ-0600 (fixed, migrated
  `LoadOutcome`/`runProductionLoad`/plant-dispose in this same file, but its
  own evidence excerpt at :809-861 shows no `theta()`/`PlantedTheta`
  declaration in what it replaced, and its fix commit did not touch these two
  names); `grep -rl "PlantedTheta\b" quality/issues/*.md quality/resolved/*.md`
  → PTQ-0963 (open, cites `tests/tools-derived-name-shape.test.ts` and
  `tests/tools-entry-closed-grammar.test.ts`, not this file) and PTQ-0606/
  PTQ-0782/PTQ-0833 (resolved, cite disjoint file sets — `tests/live/*`,
  and other production-load test files, none naming
  `tests/production-tools-load-resolution.test.ts`). No prior filing names
  this file's own local `theta()`/`PlantedTheta` pair.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all three excerpts reproduce verbatim at the cited lines (test :132-138, harness :125-127 and :140-145), mktemp sed-extracted `theta` bodies diff empty modulo the `export` keyword, the local copy is live (~40 `theta(` calls building `THETAS`, which is passed as `readonly PlantedTheta[]` straight into `plantThetaWorkspace("theta-v20a-", THETAS, "{}")` at :813 whose parameter is `readonly PlantedThetaFile[]`, so the structural subset already flows through the canonical helper), the file imports from `./helpers/production-load-harness` at :2-7 without naming `theta`/`PlantedThetaFile`, no `ext` field is used, and no colliding `theta` identifier exists at module scope; docs/bugs `PlantedTheta\b` → 0 and coverage-matrix → 0 confirmed, not a gate kin, no recording-double/red-test carve-out, no it()/describe() merge/rename/delete — in-scope D7 copy-paste-fixture class; git explains the residue: the harness `theta` export (PTQ-0606 fix) and this file's LoadOutcome/plant-dispose migration (PTQ-0600 fix) landed in the same commit cec9ee56 (2026-09-18), so neither fixer swept the other's target and the local pair (last touched 2bc69157, 2026-07-19) was left behind; dedupe holds — PTQ-0600/0606/0782/0833 are all resolved and none touched this file's `theta`/`PlantedTheta`, PTQ-0963 (open) covers only tools-derived-name-shape/tools-entry-closed-grammar, PTQ-0669 cites theta-callable-call-arity, PTQ-0969 is a disjoint `plant()` writer; TRIAGE_LOG:112's fold-into-PTQ-0606 ruling no longer applies since that row closed without these sites; one immaterial inaccuracy: the candidate's `PlantedTheta\b` overlap grep returns 5 files (also PTQ-0669/0566/0615/0600), not 4, all disjoint; acceptance note: `grep -lF 'return lines.join("\n") + "\n";' tests/*.test.ts` → 16 files, of which b0297-bind-model-nonscalar-production-load, subagent-root-registration-refusal-envelope and tools-entry-containment also already import production-load-harness and carry the identical residue (the other two are PTQ-0963's) — fold those three into this row's location list rather than mint per-file rows (triage: claude-fable-5-1)
