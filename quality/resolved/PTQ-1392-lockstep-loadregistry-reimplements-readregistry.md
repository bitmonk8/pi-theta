---
id: PTQ-1392
title: tools-entry-grammar-derivations-lockstep.test.ts re-derives readRegistry's sharded-registry read as a local loadRegistry, despite already importing registry-oracle.ts for registryHintOf
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/tools-entry-grammar-derivations-lockstep.test.ts:112-123
  - tests/tools-entry-grammar-derivations-lockstep.test.ts:1108-1116
  - tests/helpers/registry-oracle.ts:29-40
sites: 2
fix_scope: module
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# tools-entry-grammar-derivations-lockstep.test.ts re-derives readRegistry's sharded-registry read as a local loadRegistry, despite already importing registry-oracle.ts for registryHintOf

## Observation
`tests/tools-entry-grammar-derivations-lockstep.test.ts` reads the `load` and
`parse` registry shards through a locally-declared `loadRegistry(relative)`
function that resolves the file via `fileURLToPath(new URL(relative,
import.meta.url))`, `readFileSync`s it, and feeds it to a directly-imported
`parseRegistry`. `tests/helpers/registry-oracle.ts` already exports
`readRegistry(shards)`, performing the same shard-read-and-parse over the
identical `docs/spec_topics/diagnostics/code-registry-<shard>.md` paths
(resolved through its own `repoFile` helper instead of `fileURLToPath`), and
this same test file already imports a different export
(`registryHintOf`) from that exact module — the import line for
`./helpers/registry-oracle` is already open in the file.
Independently, the same file later re-reads the load-registry page's raw text
a second time via its own `readFileSync`/`fileURLToPath` pair
(`LOAD_REGISTRY_TEXT`) to feed `registryHintOf`, rather than reusing a shared
raw-text read.

## Evidence
`tests/tools-entry-grammar-derivations-lockstep.test.ts:112-123`:
```ts
function loadRegistry(relative: string): { code: string; message: string }[] {
  return parseRegistry(
    readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8"),
  ) as { code: string; message: string }[];
}

const LOAD_REGISTRY = loadRegistry(
  "../docs/spec_topics/diagnostics/code-registry-load.md",
);
const PARSE_REGISTRY = loadRegistry(
  "../docs/spec_topics/diagnostics/code-registry-parse.md",
);
```

`tests/tools-entry-grammar-derivations-lockstep.test.ts:1108-1116` — the same
load-registry page read a second time, this time kept as raw text rather than
parsed rows, for `registryHintOf`:
```ts
const LOAD_REGISTRY_TEXT = readFileSync(
  fileURLToPath(
    new URL(
      "../docs/spec_topics/diagnostics/code-registry-load.md",
      import.meta.url,
    ),
  ),
  "utf8",
);
```

`tests/helpers/registry-oracle.ts:29-40` — the canonical, already-exported
equivalent, reachable through the import this same test file already opens
for `registryHintOf` (`import { registryHintOf } from
"./helpers/registry-oracle";`, line 1):
```ts
export function readRegistry(
  shards: readonly ("parse" | "load" | "runtime" | "host")[],
): readonly RegistryRow[] {
  return parseRegistry(
    shards
      .map((shard) =>
        readFileSync(
          repoFile(`docs/spec_topics/diagnostics/code-registry-${shard}.md`),
          "utf8",
        ),
      )
      .join("\n"),
  ) as RegistryRow[];
}
```

Search: `grep -n "^function loadRegistry\|helpers/registry-oracle" tests/tools-entry-grammar-derivations-lockstep.test.ts` → one `loadRegistry` declaration (line 112) and one `registry-oracle` import (line 1, `registryHintOf` only — no `readRegistry` named).

## Why this is a problem
`tests/helpers/registry-oracle.ts`'s own header states its `readRegistry` centralises "the shared four-page diagnostics-registry read" because "`RegistryRow` and the `REGISTRY` load it backs … were redeclared byte-for-byte … in several test files." This file both imports that exact module and still redeclares the read it centralises, once as a parsed-rows function (`loadRegistry`/`LOAD_REGISTRY`/`PARSE_REGISTRY`) and a second time as a raw-text read of the same page (`LOAD_REGISTRY_TEXT`) for a different consumer (`registryHintOf`). A change to how the shard files are located or read (e.g. `readRegistry`'s `repoFile`-based resolution versus this file's `import.meta.url`-based resolution) must be applied by hand here in addition to the centralising helper, and the two in-file reads of the same `code-registry-load.md` page can drift from each other without either failing loudly.

## Suggested direction (non-binding, optional)
`readRegistry(["load", "parse"])` from `tests/helpers/registry-oracle.ts` already returns parsed rows over the same two shards this file needs for `LOAD_REGISTRY`/`PARSE_REGISTRY`; the raw-text `LOAD_REGISTRY_TEXT` read for `registryHintOf` is the one consumer this file's own registry-oracle import does not yet have a raw-text counterpart for.

## False-positive check
- Gate-pin check: neither cited range matches `*gate*.test.ts` or its named kin; the cited lines are a registry-read helper declaration, not a pinned count or inventory.
- Recording-double check: `loadRegistry`/`readRegistry` read a static markdown file and parse it into rows; neither records a call or backs a "never called" witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "loadRegistry\|LOAD_REGISTRY_TEXT" docs/bugs/*.md` → 0 hits; no documented correct-reason red names this function or requires the local re-derivation.
- coverage-matrix/bug-doc citation search: `grep -n "tools-entry-grammar-derivations-lockstep" docs/reference/coverage-matrix.md` → 0 hits (the file is named by docs/bugs/0106 and docs/bugs/0248 as a witness, but neither pins the registry-read scaffolding itself); this finding proposes no merge, rename or deletion of the file or any `it()`/`describe()` cell.
- Prior-finding overlap check: `grep -rl "tools-entry-grammar-derivations-lockstep" quality/intake quality/resolved` before filing found PTQ-0722 (fixed — the plant/dispose/`runProductionLoad` harness duplication, a different pair of functions, already migrated in current code) and PTQ-0829 (registryHintOf's own cell-parser duplication elsewhere, not this file's registry read); neither covers the `loadRegistry`/`readRegistry` pair or the `LOAD_REGISTRY_TEXT` double-read cited here.
- Coverage-drift check: the claim is about a repeated/re-derived registry-read DEFINITION; every cell in the file exercises the read through its own call sites, so no diagnostic path is untested.

## Triage
<!-- triage appends: verdict + one-line reason. Nothing above this line is edited. -->
verdict: confirmed — independently re-verified: all three excerpts reproduce verbatim at lockstep:112-123 (loadRegistry/LOAD_REGISTRY/PARSE_REGISTRY), lockstep:1108-1116 (LOAD_REGISTRY_TEXT raw re-read of the same code-registry-load.md page) and registry-oracle.ts:29-42 (readRegistry over the identical shard path via repoFile); line 1 imports only registryHintOf from ./helpers/registry-oracle (grep: one loadRegistry declaration, one registry-oracle import, no readRegistry named), every local copy is live (LOAD_REGISTRY at :155/:653/:712/:1158, PARSE_REGISTRY at :850/:931/:957, LOAD_REGISTRY_TEXT at :1127), and readRegistry(["load"])/(["parse"]) returns RegistryRow[] whose code/message fields are exactly what the file's `rendered()` consumes via the same JS registryMessage, so no load-bearing need is missed (only a readonly-array param widening); the residue is explained by ordering — the test landed 2026-08-23, the helper 2026-09-11+ and 55 sibling tests already import readRegistry; re-ran the carve-out checks: not a gate kin, static markdown read not a recording double, docs/bugs grep for loadRegistry/LOAD_REGISTRY_TEXT → 0, coverage-matrix → 0, no it()/describe() merge/rename/delete; dedupe holds — PTQ-0578 covers tools-derived-name-shape/tools-entry-closed-grammar (different files), PTQ-0722 fixed this file's plant/dispose/runProductionLoad harness, PTQ-0829 its registryHint cell parser, PTQ-0507's note recorded this file as a load-row-harness importer at the time but that import is gone today; in-scope D7 boilerplate-duplication with a mechanical fix (add readRegistry to the open import, delete loadRegistry; the raw-text read can use corpus-reader's readCorpus or stay as the one local residue) (triage: claude-fable-5-1)
