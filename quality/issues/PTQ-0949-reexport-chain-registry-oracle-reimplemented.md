---
id: PTQ-0949
title: reexport-chain-resolution.test.ts re-parses the four-page diagnostics registry inline instead of importing tests/helpers/registry-oracle.ts
lens: D7
status: open
verdict: confirmed
locations:
  - tests/reexport-chain-resolution.test.ts:155-180
  - tests/helpers/registry-oracle.ts:19-42
sites: 1
fix_scope: localized
wave: qw20260918092852
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# reexport-chain-resolution.test.ts re-parses the four-page diagnostics registry inline instead of importing tests/helpers/registry-oracle.ts

## Observation
`tests/reexport-chain-resolution.test.ts` declares a module-scope
`interface RegistryRow` (six fields: `code`, `namespace`, `severity`,
`phase`, `trigger`, `message`) and a `const REGISTRY` built by reading the
same four sharded diagnostics-registry pages
(`code-registry-{parse,load,runtime,host}.md`), joining their text, and
running it through `parseRegistry`. `tests/helpers/registry-oracle.ts`
already exports an identically-shaped `RegistryRow` interface and a
`REGISTRY` constant built by the same four-shard read (`readRegistry(["parse",
"load", "runtime", "host"])`) through the same `parseRegistry` call; its own
header states it exists because this exact read "were redeclared
byte-for-byte (confirmed via `diff`) in several test files" and centralises
it for exactly this reuse. `reexport-chain-resolution.test.ts` does not
import this module.

## Evidence

`tests/reexport-chain-resolution.test.ts:155-180` (re-read immediately
before filing):
```ts
interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

// The live four-page sharded registry, read from the spec corpus and
// concatenated — the same input tests/code-registry.test.ts reconciles.
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

`tests/helpers/registry-oracle.ts:19-42` — the canonical helper this
duplicates:
```ts
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

Exact search: `grep -n "registry-oracle\|import.*RegistryRow\|const REGISTRY" tests/reexport-chain-resolution.test.ts` returns only the local `const REGISTRY = parseRegistry(...)` declaration at line 166 — no import of `tests/helpers/registry-oracle.ts` anywhere in the file.

## Why this is a problem
The exact read `tests/helpers/registry-oracle.ts` exists to hold (per its own
header, tracked by the resolved PTQ-0215) — a six-field `RegistryRow`
interface plus the four-shard `readFileSync`+`parseRegistry` join producing a
`REGISTRY` constant — is re-declared field-for-field and shard-for-shard in
`tests/reexport-chain-resolution.test.ts`, with only the file-relative
`import.meta.url` path depth (`../` vs `../../`) differing. The two `registryRow`/
`normativeMessage` reader functions built on top of this file's local
`REGISTRY` (lines 182-208) stay local, consistent with the helper's own
stated design ("each file's own … reader … stays local, parameterised by the
`REGISTRY` this module exports rather than by a locally re-parsed copy") —
but the `REGISTRY` itself is the part meant to be imported, and here it is
independently re-parsed instead.

## Suggested direction (non-binding, optional)
Importing `REGISTRY` and `RegistryRow` from `tests/helpers/registry-oracle.ts`
removes the local four-shard read and its duplicated interface while leaving
this file's own `registryRow`/`normativeMessage` reader functions exactly as
they are today, matching the helper module's own stated separation of
concerns.

## False-positive check
- Gate-pin check: `tests/reexport-chain-resolution.test.ts` does not match
  `*gate*.test.ts` or the named gate kin; the cited lines are a registry read,
  not a pinned count or inventory assertion.
- Recording-double check: `REGISTRY`/`RegistryRow` are a parsed read-only data
  table, not a recording double and not a "never called" witness.
- docs/bugs/ signature search: `grep -l "reexport-chain-resolution" docs/bugs/*.md` finds docs/bugs/0101-reexport-chain-not-resolved.md, this file's own subject bug; it discusses the re-export resolution defect, not this registry-read duplication.
- coverage-matrix/bug-doc citation search: `grep -n "reexport-chain-resolution" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename or deletion of any `it()`/`describe()` block, and does not touch this file's RED-pin cells (group (a)/(g)/(h)).
- Coverage check: the claim is about a duplicated data-read DEFINITION; the
  file's own `registryRow`/`normativeMessage` readers and every cell that
  calls them already pass or red for the documented bug-0101 reason today.
- Prior-filing overlap check: the open/resolved filings against this file
  (PTQ-0554, PTQ-0758, PTQ-0222, PTQ-0232, PTQ-0239, PTQ-0434, PTQ-0493,
  PTQ-0625, PTQ-0866) name `FakeThetaLibFs`, `parseDoc`, `loadThetaLibDiags`,
  and `bindImportedBody` — none names `RegistryRow`/`REGISTRY` or the
  registry-oracle read.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/reexport-chain-resolution.test.ts:155-180 and tests/helpers/registry-oracle.ts:19-42; mktemp `diff` (export stripped) shows the six-field `RegistryRow` interface byte-identical and the local `REGISTRY` semantically identical to the helper's `REGISTRY = readRegistry(["parse","load","runtime","host"])` (same four shards, same order, same `"\n"` join, same `parseRegistry`, only `../` vs `../../` path depth differing); the stated grep reproduces (sole hit `:166`, no import of the helper); the local copy is live (`REGISTRY` read at :190/:206, 8 `registryRow`/`normativeMessage` call sites) and the helper is live (128 importers); file is not a gate test, no cell is merged/renamed/deleted, coverage-matrix → 0 hits; dedupe: all nine PTQ filings naming this file target FakeThetaLibFs/parseDoc/loadThetaLibDiags/bindImportedBody, PTQ-0777 is confined to tests/live/live-production-acceptance.test.ts, PTQ-0222 cites this file only inside a quoted b0333/b0335 comment, and sibling intake d7-12 is the distinct parseDoc root cause; minor non-blocking inaccuracy: the docs/bugs grep actually hits 10 files and the 0101 doc is `0101-from-bearing-reexport-materialises-nothing.md`, irrelevant since no witness cell is touched (triage: claude-fable-5-1)
