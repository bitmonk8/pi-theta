---
id: PTQ-0327
title: arg-mismatch-diagnostic-count-by-surface.test.ts rebuilds the code-registry read tests/helpers/registry-oracle.ts already centralises
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/arg-mismatch-diagnostic-count-by-surface.test.ts:1-11
  - tests/arg-mismatch-diagnostic-count-by-surface.test.ts:110-122
  - tests/helpers/registry-oracle.ts:21-28
  - tests/helpers/registry-oracle.ts:31-45
sites: 4                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260914091051
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-14
---

# arg-mismatch-diagnostic-count-by-surface.test.ts rebuilds the code-registry read tests/helpers/registry-oracle.ts already centralises

## Observation
tests/arg-mismatch-diagnostic-count-by-surface.test.ts declares its own local
`RegistryRow` interface and its own `parseRegistry(readFileSync(...))` read of
a single diagnostics-registry page
(`docs/spec_topics/diagnostics/code-registry-parse.md`), instead of importing
the `RegistryRow`/`REGISTRY` pair `tests/helpers/registry-oracle.ts` already
exports for this exact purpose. The file imports nothing from `tests/helpers/`
except the unrelated `production-load-harness` trio
(`disposeWorkspace`/`plantThetaWorkspace`/`runProductionLoad`). Every one of
the seven diagnostic codes this file looks up
(`theta/parse/invoke-arg-type-mismatch`, `theta/parse/tool-arg-type-mismatch`,
`theta/parse/fn-arg-type-mismatch`, and the four `*-arity-too-few`/
`*-arity-too-many` rows) lives on `code-registry-parse.md`, one of the four
pages the canonical `REGISTRY` joins, so the canonical export already carries
every row this file's local read fetches.

## Evidence

tests/arg-mismatch-diagnostic-count-by-surface.test.ts:1-11 — the file's full
import list; no `tests/helpers/registry-oracle` import exists anywhere in the
file (confirmed by `grep -n "registry-oracle" tests/arg-mismatch-diagnostic-count-by-surface.test.ts`
→ 0 hits):
```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import {
  disposeWorkspace,
  plantThetaWorkspace,
  runProductionLoad,
  type LoadOutcome,
} from "./helpers/production-load-harness";
```

tests/arg-mismatch-diagnostic-count-by-surface.test.ts:110-122 — the local
single-page interface and read:
```ts
/** The registry page carrying all seven rows — the DIAG-4 oracle. */
const REGISTRY_PAGE = "docs/spec_topics/diagnostics/code-registry-parse.md";

interface RegistryRow {
  readonly code: string;
  readonly severity: string;
  readonly phase: string;
  readonly message: string;
}

const REGISTRY = parseRegistry(
  readFileSync(fileURLToPath(new URL(`../${REGISTRY_PAGE}`, import.meta.url)), "utf8"),
) as RegistryRow[];
```

tests/helpers/registry-oracle.ts:21-28 — the canonical `RegistryRow`, a
superset of the local shape above (adds `namespace`/`trigger`, neither of
which this file ever reads — confirmed by
`grep -n "\.namespace\|\.trigger" tests/arg-mismatch-diagnostic-count-by-surface.test.ts`
→ 0 hits):
```ts
/** A parsed row of the sharded code registry, as `parseRegistry` yields it. */
export interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}
```

tests/helpers/registry-oracle.ts:31-45 — the canonical four-page join, which
includes `code-registry-parse.md` (the one page the local read above also
targets) alongside `code-registry-{load,runtime,host}.md`:
```ts
export const REGISTRY: readonly RegistryRow[] = parseRegistry(
  [
    "code-registry-parse.md",
    "code-registry-load.md",
    "code-registry-runtime.md",
    "code-registry-host.md",
  ]
    .map((page) =>
      readFileSync(
        fileURLToPath(new URL(`../../docs/spec_topics/diagnostics/${page}`, import.meta.url)),
        "utf8",
      ),
    )
    .join("\n"),
) as RegistryRow[];
```

Codes-on-page check: `grep -n "theta/parse/invoke-arg-type-mismatch\|theta/parse/tool-arg-type-mismatch\|theta/parse/fn-arg-type-mismatch\|theta/parse/invoke-arity-too-few\|theta/parse/invoke-arity-too-many\|theta/parse/fn-arity-too-few\|theta/parse/fn-arity-too-many" docs/spec_topics/diagnostics/code-registry-parse.md`
→ one row per code (all seven present), confirming the canonical `REGISTRY`
already carries every row this file's local, single-page `REGISTRY` fetches.

Exact search across this wave's seven-file scope: `grep -n "registry-oracle\|^interface RegistryRow\|^const REGISTRY " <the 7 files>`
→ arg-mismatch-diagnostic-count-by-surface.test.ts is the only one of the
seven that still declares its own `RegistryRow`/`REGISTRY`; the other four
files that touch a registry (b0296-mode-nonscalar-value-collapse.test.ts,
b0297-bind-context-bind-model-nonscalar.test.ts,
b0298-system-nonscalar-silent-drop-and-prompt-mode-suppression.test.ts,
b0301-bind-echo-tool-loop-respond-repair-holes.test.ts) each already
`import { REGISTRY, type RegistryRow } from "./helpers/registry-oracle"`; the
remaining two (b0295, b0297-bind-model-nonscalar-production-load) read no
registry at all.

## Why this is a problem
This is the "Copy-paste fixtures/doubles" class: `tests/helpers/registry-oracle.ts`'s
own header states its purpose is to centralise exactly this read ("`RegistryRow`
and the `REGISTRY` load it backs … were redeclared byte-for-byte … in several
test files. This module centralises that read only"), and four of this file's
six siblings in this exact review scope have already migrated to import it —
this file has not. The local read is not a different problem solved a
different way; it is the identical `parseRegistry(readFileSync(fileURLToPath(...)))`
call chain over a page the canonical four-page union already includes, using a
`RegistryRow` shape that is a strict subset of the canonical one and touches no
field the canonical shape lacks.

## Suggested direction (non-binding, optional)
`tests/helpers/registry-oracle.ts` already exports a `REGISTRY` covering
`code-registry-parse.md` (and the other three pages) plus a `RegistryRow` that
is a superset of the local interface; it is the existing home this file's own
`REGISTRY_PAGE`/`RegistryRow`/`REGISTRY` declarations could import instead of
rebuilding, the same substitution already made in this file's four in-scope
siblings.

## False-positive check
- Gate-pin check: tests/arg-mismatch-diagnostic-count-by-surface.test.ts does
  not match `*gate*.test.ts` or the named kin; the cited lines are a data
  read (parsing a markdown table into rows), not a pinned-count or inventory
  assertion.
- Recording-double check: the local `REGISTRY` is a static, parsed-once array
  read at module load; it records no call and backs no "never called"
  assertion, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0147-arg-mismatch-diagnostic-count-diverges-by-surface.md
  reads "Status: fixed (0.246.0)". `npx vitest run tests/arg-mismatch-diagnostic-count-by-surface.test.ts`
  → 98 passed (98) at HEAD, so this is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "arg-mismatch-diagnostic-count-by-surface" docs/reference/coverage-matrix.md`
  → 0 hits. `grep -rl "arg-mismatch-diagnostic-count-by-surface" docs/bugs/*.md`
  → its own bug doc (0147) plus five others (0260, 0264, 0267, 0270, 0276,
  0429) that each cite this file only for a same-commit line-number-citation
  re-derivation inside its comments (a different, unrelated production-code
  line shift each time) — none of the six pins the `REGISTRY_PAGE`/
  `RegistryRow`/`REGISTRY` declaration itself or requires it to stay local.
  This finding proposes no merge, rename or deletion of the file or any
  `it()`/`describe()` — only that the local registry read could be replaced
  by the existing import — so no citation is affected.
- Coverage check: the claim is about a repeated read/parse DEFINITION, not a
  missing test path; the registry read is exercised by every test in the file
  (98/98 passing, confirmed above).
- Wide-convention check: the same `interface RegistryRow`/`const REGISTRY =
  parseRegistry(...)` shape recurs far beyond this wave's scope (a repo-wide
  grep for the same two declaration lines returns well over 100 files). This
  finding does not claim that whole-repo pattern as one root cause — it cites
  only the one file inside this wave's seven-file assigned scope that still
  carries the local copy while four of its six in-scope siblings
  (b0296/b0297-bind-context/b0298/b0301) already import the canonical
  `REGISTRY` for the identical purpose, the same scoping precedent already
  ratified for this exact duplication class (PTQ-0222, PTQ-0237, PTQ-0250,
  PTQ-0260, PTQ-0272, PTQ-0275, PTQ-0311, PTQ-0313) — each confined to the
  specific files its own wave's scope contained rather than the repo-wide
  count.
- Overlap check against already-filed/resolved topics: PTQ-0311 ("b0296,
  b0297-bind-context and b0298 …") and PTQ-0313 ("b0301 and b0304 …") are the
  closest prior findings, both resolved; both are confined by their own text
  to the specific files their wave's shard contained, and neither cites
  tests/arg-mismatch-diagnostic-count-by-surface.test.ts as a location, an
  overlap, or a sibling left out of scope. No open or resolved PTQ in the
  provided list names this file.

## Triage
verdict: confirmed — every excerpt reproduces exactly (test:1-11 import list, 0 hits for `registry-oracle` and for `.namespace|.trigger`; test:110-122 local REGISTRY_PAGE/RegistryRow/REGISTRY vs registry-oracle.ts:21-28/31-45 canonical four-page superset), all seven codes verified present on code-registry-parse.md, bug 0147 is Status fixed (0.246.0) with `npx vitest run` reproducing 98/98 green (not a documented-red), coverage-matrix.md has 0 citations, and the seven-file scope grep reproduces exactly — this file is the only one of its six in-scope siblings still declaring a local RegistryRow/REGISTRY while b0296/b0297-bind-context/b0298/b0301 already `import { REGISTRY, type RegistryRow } from "./helpers/registry-oracle"` (confirmed) and b0295/b0297-production-load touch no registry; neither PTQ-0311 nor PTQ-0313 (re-read in full) cites this file — same confirmed D7 copy-paste-fixture/double class as PTQ-0311/PTQ-0313/PTQ-0222/PTQ-0237/PTQ-0250 (triage: claude-opus-5)
