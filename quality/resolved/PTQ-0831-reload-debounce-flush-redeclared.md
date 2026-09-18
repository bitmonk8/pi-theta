---
id: PTQ-0831
title: reload-debounce.test.ts redeclares fake-clock.ts's exported flush() instead of importing it
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/reload-debounce.test.ts:1-27
  - tests/helpers/fake-clock.ts:96-98
  - tests/reload-teardown-quiesce.test.ts:47
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# reload-debounce.test.ts redeclares fake-clock.ts's exported flush() instead of importing it

## Observation
tests/reload-debounce.test.ts imports `FakeClock` from `./helpers/fake-clock`
but declares its own module-scope `async function flush(times = 8)` instead
of also importing the `flush` function that same module already exports.
The local body is a byte-for-byte match of the exported one (only the doc
comment differs by one word). tests/reload-teardown-quiesce.test.ts — the
sibling file this file's own header comment says its "harness, fakes, and
assertion conventions mirror" — imports `flush` directly from
`./helpers/fake-clock` rather than redeclaring it, so the canonical import is
demonstrably usable from a file in this exact review scope.

## Evidence

tests/reload-debounce.test.ts:1-27 (re-read immediately before filing):
```ts
import { controllableRebuild } from "./helpers/controllable-rebuild";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ReloadDebouncer,
  RELOAD_DEBOUNCE_WINDOW_MS,
  type RebuildOutcome,
} from "../src/extension/reload-debounce";
import { FakeClock } from "./helpers/fake-clock";
import type { FileWatchEvent } from "../src/seams/file-watcher";

// V10d-T — reload debounce and cross-window rebuild serialization (tests).
// These tests are written against the seam the paired V10d implementation leaf
// fills in; they MUST fail red for the intended reason (the drop-and-reschedule
// debounce and the PIC-49 serialization guard are absent — `onWatcherEvent` is
// a no-op stub — so no reload ever fires and each assertion reds on its own
// primary expectation, not on a compile error or harness throw).
//
// Time is driven deterministically through the injected `Clock` seam via the
// `FakeClock` test double (V8d): `Clock.setTimeout` / `Clock.clearTimeout` back
// the debounce, and `FakeClock.advance(ms)` crosses the window boundary.

/** Flush the microtask queue so an in-flight rebuild's promise settles. */
async function flush(times = 8): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}
```

tests/helpers/fake-clock.ts:96-98 (the exported function this redeclares,
body identical statement-for-statement):
```ts
/** Flush the microtask queue so in-flight promises settle. */
export async function flush(times = 8): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}
```

tests/reload-teardown-quiesce.test.ts:47 (the sibling in-scope file, which
imports the same canonical helper rather than redeclaring it):
```ts
import { FakeClock, flush } from "./helpers/fake-clock";
```

The local `flush` in reload-debounce.test.ts is live: `grep -c "await flush()"
tests/reload-debounce.test.ts` → 22 call sites depend on the local
redeclaration rather than the exported helper.

## Why this is a problem
`tests/helpers/fake-clock.ts` already centralises this exact microtask-flush
loop and exports it for tests driving the `Clock` seam to import, and
reload-teardown-quiesce.test.ts — the file whose own doc comment
reload-debounce.test.ts is credited by name as the harness-and-conventions
source for — already imports it that way from the identical module path.
reload-debounce.test.ts instead retypes the identical function body under
its own local name, so the same seven-line definition exists twice in two
files that both import `FakeClock` from the same module and are read
together as one behavioural family (V10d-T / PIC-57).

## Suggested direction (non-binding, optional)
Importing `flush` alongside `FakeClock` from `./helpers/fake-clock` (as
reload-teardown-quiesce.test.ts already does) would remove the local
redeclaration; this is an observation about the existing canonical export's
fit, not a design proposal.

## False-positive check
- Gate-pin check: `reload-debounce.test.ts` does not match `*gate*.test.ts`
  or the named gate kin; nothing cited here is a pinned count or inventory
  assertion.
- Recording-double check: `flush` is a plain microtask-draining loop with no
  spy/recording behaviour and backs no "never called" witness, so the
  negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "async function flush" docs/bugs/`
  → 0 hits; this finding does not allege a red test or a skip in either
  file, so no documented-correct-reason-red signature applies.
- coverage-matrix/bug-doc citation search: `grep -n "reload-debounce.test.ts"
  docs/reference/coverage-matrix.md docs/bugs/*.md` → 0 hits in
  coverage-matrix.md; no bug doc names this file's `flush` definition. This
  finding proposes no merge, rename, or deletion of the test file or any
  `it()`/`describe()`.
- Coverage-drift check: the claim is about a duplicated helper DEFINITION
  that exists today in both places, not a missing test path; every existing
  `it()` in the file keeps running unchanged regardless of where `flush` is
  defined.
- Prior-filing overlap check: `grep -rl "reload-debounce.test.ts" quality/issues/*.md
  quality/resolved/*.md` → PTQ-0115 (unrelated: binder call-result callcount)
  and PTQ-0503 (the now-fixed `controllableRebuild` duplication between these
  same two files, resolved separately) — neither names `flush` or this
  redeclaration.

## Triage
verdict: confirmed — independently re-verified: tests/reload-debounce.test.ts:22-27 local `flush(times = 8)` sed-extracted and diffed against tests/helpers/fake-clock.ts:93-98 `export async function flush` (cited 96-98, minor drift) after stripping `export` → zero diff; the local copy is live (22 `await flush()` call sites, still the original 33c05c29 declaration) while the file already imports `FakeClock` from the same module; tests/reload-teardown-quiesce.test.ts:47 and b0376:32 import `{ FakeClock, flush }` from that path, so the canonical import is proven usable; both locations under tests/, D7 boilerplate/copy-paste-helper class, not a gate file, no recording-double or red-test carve-out, stated searches reproduce (docs/bugs `async function flush` → 0; coverage-matrix cite → 0; bug 0018 cites the file but not this helper; no merge/rename/delete proposed); not tracked — the export was minted by resolved PTQ-0443's fix (9c6f1b97), whose location list covered b0376/reload-teardown-quiesce/session-shutdown but never this file, and resolved PTQ-0503 covered only `controllableRebuild`; note for the fixer: the identical `flush(times = 8)` body also remains at tests/hot-reload-stale-quiesce-arms.test.ts:31 and tests/package-discovery.test.ts:130 (uncited here) and can be folded into the same import at fix time (triage: claude-fable-5-1)
