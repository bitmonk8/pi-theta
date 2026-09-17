---
id: PTQ-0475
title: Both briefed inline-object test files redeclare the four-page registry read instead of importing tests/helpers/registry-oracle.ts
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/inline-object-stray-close-token-split.test.ts:190-208
  - tests/inline-object-type-source-capture.test.ts:171-194
  - tests/helpers/registry-oracle.ts:1-46
sites: 2
fix_scope: localized
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# Both briefed inline-object test files redeclare the four-page registry read instead of importing tests/helpers/registry-oracle.ts

## Observation
Both files in this review's scope open with a local `interface RegistryRow` plus a `const REGISTRY = parseRegistry([...four page names...].map(...).join("\n"))` block that reads the same four diagnostics-registry pages (`code-registry-parse.md`, `-load.md`, `-runtime.md`, `-host.md`) through the same `parseRegistry` import and the same `readFileSync`/`fileURLToPath` construction. `tests/helpers/registry-oracle.ts` already exports exactly this read as `RegistryRow` / `readRegistry` / `REGISTRY`, and its own header comment states it exists because this exact block "were redeclared byte-for-byte (confirmed via `diff`) in several test files." Neither file in scope imports from that helper.

## Evidence

`tests/inline-object-stray-close-token-split.test.ts:190-208`:
```typescript
interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

/** The live four-page sharded registry, read from the spec corpus (DIAG-4). */
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

`tests/inline-object-type-source-capture.test.ts:171-194` (same four page names, same `readFileSync`/`fileURLToPath`/`.join("\n")` chain feeding `parseRegistry`, factored one level through a locally-declared `readDiagnosticsPage` rather than an inline arrow, and a wider local `RegistryRow` shape that adds `severity`/`namespace`/`phase`):
```typescript
interface RegistryRow {
  readonly code: string;
  readonly message: string;
  readonly severity: string;
  readonly namespace: string;
  readonly phase: string;
}

const DIAGNOSTICS_DIR = "../docs/spec_topics/diagnostics/";

function readDiagnosticsPage(page: string): string {
  return readFileSync(fileURLToPath(new URL(`${DIAGNOSTICS_DIR}${page}`, import.meta.url)), "utf8");
}

const REGISTRY = parseRegistry(
  [
    "code-registry-parse.md",
    "code-registry-load.md",
    "code-registry-runtime.md",
    "code-registry-host.md",
  ]
    .map(readDiagnosticsPage)
    .join("\n"),
) as RegistryRow[];
```

`tests/helpers/registry-oracle.ts:1-46` (the canonical helper; excerpt of its exported read and its own stated reason for existing):
```typescript
// The shared four-page diagnostics-registry read (PTQ-0215).
//
// WHY THIS FILE EXISTS. `RegistryRow` and the `REGISTRY` load it backs — read
// the four sharded registry pages (code-registry-{parse,load,runtime,host}.md),
// parse each through the real `parseRegistry`, and join the rows into one
// array — were redeclared byte-for-byte (confirmed via `diff`) in several test
// files. This module centralises that read only: each file's own
// `registryMessageOf` / `registryRowOf`-shaped reader — whose assertion style
// and wording vary per file — stays local, parameterised by the `REGISTRY` this
// module exports rather than by a locally re-parsed copy.
...
export interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

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

export const REGISTRY: readonly RegistryRow[] = readRegistry(["parse", "load", "runtime", "host"]);
```

Import-site check: `grep -n "registry-oracle" tests/inline-object-stray-close-token-split.test.ts tests/inline-object-type-source-capture.test.ts` returns no matches in either file — neither imports `REGISTRY`/`RegistryRow`/`readRegistry` from the canonical helper, each declares its own copy of the same four-page union instead.

## Why this is a problem
Both files independently re-implement the same 15-20 line "read four sharded registry pages and parse them into one array" block that `tests/helpers/registry-oracle.ts` already exports under the name `REGISTRY`, and that helper's own header comment names this exact byte-shape ("read the four sharded registry pages ... parse each through the real `parseRegistry` ... join the rows into one array") as the redeclaration it was created to end. The second file's local `RegistryRow` additionally re-types a narrower/differently-shaped fixture (`code`/`message`/`severity`/`namespace`/`phase`, missing `trigger`) than the helper's own exported `RegistryRow` (which also carries `trigger`), so the two files are not only unmigrated but have also drifted from each other and from the canonical shape while re-deriving the same fixture.

## Suggested direction (non-binding, optional)
`tests/helpers/registry-oracle.ts`'s exported `REGISTRY` (`readRegistry(["parse","load","runtime","host"])`) is the same four-page union both files build locally; importing it in place of each file's own declaration is the shape the helper's own header already describes as its purpose.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate-kin patterns; not applicable.
- Recording-double check: `REGISTRY`/`RegistryRow` is a static read of documentation pages, not a recording double; not applicable.
- docs/bugs/ signature search: `grep -rln "inline-object-stray-close-token-split\|inline-object-type-source-capture" docs/bugs/` finds both files cited by name in `docs/bugs/0238-*.md` and `docs/bugs/0228-*.md` (and several others) as their respective §Fix witnesses, naming specific `it(...)` cells; none of those citations names or depends on the `RegistryRow`/`REGISTRY` declaration block, and this finding does not propose merging, renaming, or deleting either test file — only the local registry-read declaration each carries.
- coverage-matrix/bug-doc citation search: `grep -n "inline-object-stray-close-token-split\|inline-object-type-source-capture" docs/reference/coverage-matrix.md` returns no hits under those exact filenames in a spot check of the surrounding bug docs' witness lists — the bug docs cite specific cell IDs and line ranges inside each file's body (e.g. W1-W22, A0/A1, B1/B2), none of which fall inside the cited 190-208 / 171-194 ranges.
- Coverage drift check: this finding does not claim any behaviour is untested; it is confined to a duplicated fixture-read declaration inside tests that already exist and already run.
- Prior-filing check: `grep -rl "inline-object-stray-close-token-split\|inline-object-type-source-capture" quality/intake/*.md quality/resolved/*.md` returns only `qw20260917154546-d7-02-generic-argument-frontmatter-builder-duplicated.md` and `qw20260917154546-d7-03-generic-argument-expectgroup-harness-duplicated.md`, both of which name these two files only inside a "pattern-wide search" hit count for a DIFFERENT root cause (the `theta()`/`paramsSrc()` fixture builder and the `Cell`/`expectGroup` comparison harness, respectively); neither cites or proposes anything about the `RegistryRow`/`REGISTRY` block this finding is about, so this is not a re-file of either.

## Triage
<!-- pending -->
verdict: confirmed — independently re-verified: both local RegistryRow/REGISTRY four-page parseRegistry reads reproduce at the cited lines (stray-close:190-208 inline arrow; type-source-capture:171-194 via readDiagnosticsPage), identical page list/order/join to tests/helpers/registry-oracle.ts:31-45 differing only in `../` depth; `grep registry-oracle` returns 0 hits in both files vs 30 importer files elsewhere in tests/; every field each file reads off REGISTRY (code/message/severity/namespace/phase) is in the helper's exported RegistryRow superset; both suites 37/37 green (no documented-red), not gate files, coverage-matrix 0 hits, bug docs 0228/0238 cite the files by name with no line pins into the registry block; no existing PTQ (0215/0222/0237/0250/0260/0275/0311/0313/0327/0404/0411/0412 all cite other files) nor wave siblings d7-02/d7-03 (different root causes) track these two files — same confirmed D7 copy-paste-fixture class (triage: claude-fable-5-1)
