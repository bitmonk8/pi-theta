---
id: PTQ-0672
title: qry4-refused-annotation-withhold.test.ts re-parses the four diagnostics-registry pages instead of importing tests/helpers/registry-oracle.ts's readRegistry/REGISTRY
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/qry4-refused-annotation-withhold.test.ts:98-119
  - tests/helpers/registry-oracle.ts:16-40
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# qry4-refused-annotation-withhold.test.ts re-parses the four diagnostics-registry pages instead of importing tests/helpers/registry-oracle.ts's readRegistry/REGISTRY

## Observation
`tests/helpers/registry-oracle.ts` (introduced for PTQ-0215) exports
`readRegistry(shards)` and a ready-built `REGISTRY` constant that reads the
same four sharded diagnostics-registry pages
(`code-registry-{parse,load,runtime,host}.md`), parses them with the real
`parseRegistry`, and joins the rows into one array — exactly the read this
helper's own header states was "redeclared byte-for-byte … in several test
files." `tests/qry4-refused-annotation-withhold.test.ts` declares its own
local `RegistryRow` interface and its own `REGISTRY` constant, performing the
identical four-page read, `parseRegistry` call and `"\n"` join inline, rather
than importing the shared module.

## Evidence
`tests/qry4-refused-annotation-withhold.test.ts:98-119`:
```ts
interface RegistryRow {
  readonly code: string;
  readonly severity: string;
  readonly message: string;
}

/** The live four-page sharded registry — the input tests/code-registry.test.ts reconciles. */
const REGISTRY = parseRegistry(
  [
    "code-registry-parse.md",
    "code-registry-load.md",
    "code-registry-runtime.md",
    "code-registry-host.md",
  ]
    .map((page) =>
      readFileSync(
        fileURLToPath(new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url)),
        "utf8",
      ),
    )
    .join("\n"),
) as RegistryRow[];
```

`tests/helpers/registry-oracle.ts:16-40` (the canonical, already-exported equivalent):
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

/** Read only the requested shards, preserving page-specific registry oracles. */
export function readRegistry(
  shards: readonly ("parse" | "load" | "runtime" | "host")[],
): readonly RegistryRow[] {
  return parseRegistry(
    shards
      .map((shard) =>
        readFileSync(
          fileURLToPath(
            new URL(`../../docs/spec_topics/diagnostics/code-registry-${shard}.md`, import.meta.url),
          ),
          "utf8",
        ),
      )
      .join("\n"),
  ) as RegistryRow[];
}

/** The live four-page sharded registry — the input tests/code-registry.test.ts reconciles. */
export const REGISTRY: readonly RegistryRow[] = readRegistry(["parse", "load", "runtime", "host"]);
```

Both files carry the identical doc comment "The live four-page sharded
registry — the input tests/code-registry.test.ts reconciles.", the same four
page names in the same order, and the same `parseRegistry(...).join("\n")`
construction — the reviewed file's `RegistryRow` differs only by omitting
`namespace`/`phase`/`trigger`, a narrower view over the same parsed rows, not
a different read.

Search: `grep -n "^const REGISTRY = parseRegistry\|^interface RegistryRow" tests/qry4-refused-annotation-withhold.test.ts` → the one declaration quoted above; `grep -n "readRegistry\|helpers/registry-oracle" tests/qry4-refused-annotation-withhold.test.ts` → 0 hits, confirming the file imports neither the helper's function nor its `REGISTRY` export.

## Why this is a problem
The four-page read, the `parseRegistry` call, and the join are mechanically
identical to the shared helper `tests/helpers/registry-oracle.ts` already
performs and exports as `REGISTRY`; the reviewed file re-derives that same
array under a narrower local type instead of importing it. A change to how
the four pages are located or joined (e.g. a fifth diagnostics page, or a
directory move) has this file's copy to update in addition to the shared
helper.

## Suggested direction (non-binding, optional)
Importing `REGISTRY` (or `readRegistry(["parse","load","runtime","host"])`)
from `tests/helpers/registry-oracle.ts` and keeping only this file's own
`templateOf`/`placeholdersOf` readers local — the same split the helper's own
header already describes for its other importers — would let this file drop
its local `RegistryRow`/`REGISTRY` pair.

## False-positive check
- Gate-pin carve-out: `tests/qry4-refused-annotation-withhold.test.ts` does
  not match `*gate*.test.ts` or the named gate kin; not applicable.
- Recording-double carve-out: `REGISTRY` is a static parsed array read once at
  module scope; it records no call and backs no "never called" witness; not
  applicable.
- docs/bugs/ signature search: `grep -n "RegistryRow\|readRegistry\|registry-oracle" docs/bugs/0222-qry4-let-mismatch-reads-refused-annotation.md` → 0 hits; the bug doc gives no rationale for re-deriving this read locally.
- coverage-matrix/bug-doc citation search: `grep -n "qry4-refused-annotation-withhold" docs/reference/coverage-matrix.md` → 0 hits; this finding proposes no change to any `it()`/`describe()` name, count, range or assertion, only to where the registry array is sourced.
- Coverage check: the claim is about a repeated fixture-read DEFINITION, not a missing test path; the local copy is exercised by every `templateOf`/`mismatch`/`refusal` call in the file that reads `REGISTRY` indirectly.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: tests/qry4-refused-annotation-withhold.test.ts:98-119 declares a local RegistryRow (strict subset of the helper's) and REGISTRY whose normalised body is byte-identical to tests/helpers/registry-oracle.ts readRegistry(["parse","load","runtime","host"]) (now lines 20-48; same four shards, same order, same parseRegistry+"\n" join, only the ../ vs ../../ depth differs); the file imports nothing from the helper (0 hits), REGISTRY's sole consumer is templateOf via the untyped JS registryMessage so the shared export drops in; the helper already has 30 test importers; not a gate test, 0 coverage-matrix hits, bug doc 0222 gives no local-read rationale; no prior PTQ cites this file's registry read — a new per-file instance of the D7 copy-paste-fixture class already confirmed for PTQ-0222/0237/0250/0260/0275/0311/0313/0327/0404/0411/0412 (triage: claude-fable-5-1)
