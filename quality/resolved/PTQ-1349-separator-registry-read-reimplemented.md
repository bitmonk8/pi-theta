---
id: PTQ-1349
title: import-specifier-separator test reimplements the RegistryRow/REGISTRY read instead of importing tests/helpers/registry-oracle
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/import-specifier-separator-production-required.test.ts:186-211
  - tests/import-export-from-clause-required.test.ts:1-14
  - tests/import-specifier-list-production-required.test.ts:1-14
  - tests/helpers/registry-oracle.ts:16-40
sites: 1
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# import-specifier-separator test reimplements the RegistryRow/REGISTRY read instead of importing tests/helpers/registry-oracle

## Observation
`tests/import-specifier-separator-production-required.test.ts` declares its own
local `RegistryRow` interface and its own `REGISTRY` constant, built by reading
the four `code-registry-*.md` pages with `readFileSync` and joining them through
`parseRegistry` directly. The other two files in this same three-file bug
family (`import-export-from-clause-required.test.ts` and
`import-specifier-list-production-required.test.ts`) instead import
`REGISTRY` and `RegistryRow` from `tests/helpers/registry-oracle.ts`, which
exports exactly this bundle (a `RegistryRow` interface and a `REGISTRY` built
from the same four pages via `readRegistry`).

## Evidence
`tests/import-specifier-separator-production-required.test.ts:186-211`:
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

`tests/import-export-from-clause-required.test.ts:13` (contrast — this sibling
file in the same bug family imports the canonical bundle instead):
```ts
import { REGISTRY, type RegistryRow } from "./helpers/registry-oracle";
```

`tests/import-specifier-list-production-required.test.ts:13` (same import,
same sibling family):
```ts
import { REGISTRY, type RegistryRow } from "./helpers/registry-oracle";
```

`tests/helpers/registry-oracle.ts:16-40` (the canonical bundle these two
siblings use and this file re-derives instead):
```ts
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
          repoFile(`docs/spec_topics/diagnostics/code-registry-${shard}.md`),
          "utf8",
        ),
      )
      .join("\n"),
  ) as RegistryRow[];
}
...
export const REGISTRY: readonly RegistryRow[] = readRegistry(["parse", "load", "runtime", "host"]);
```

## Why this is a problem
The three files in this review scope are a matched trio (bugs 0058, 0100,
0211) that share almost the whole harness shape — `parseLib`, `parseApp`,
`APP_FRONTMATTER`, `normativeMessage`, `expectStatementRefusal` — and two of
the three already import the shared `REGISTRY` / `RegistryRow` bundle from
`tests/helpers/registry-oracle.ts`. The third file, reviewed in the same
scope, instead hand-rebuilds the identical field-for-field interface and the
identical four-page read-and-join, using `readFileSync` +
`fileURLToPath(new URL(...))` where the canonical helper uses `repoFile`. Two
independent implementations of the same registry read now exist inside one
three-file family, one of which is the file this review is scoped to.

## Suggested direction (non-binding, optional)
The natural home for this read is the one already used by the two sibling
files in the same family — `tests/helpers/registry-oracle.ts`'s exported
`REGISTRY` / `RegistryRow`.

## False-positive check
- Gate-pin check: none of the three files match `*gate*.test.ts`; this is a
  bug-witness trio (0058/0100/0211), not a census/pin gate. Not applicable.
- Recording-double check: `REGISTRY` is a static read of spec-corpus text, not
  a call-recording double; the negative-witness carve-out does not apply.
- docs/bugs/ signature search: the bug docs (0058, 0100, 0211) referenced in
  each file's header describe the diagnostic-registry contract under test, not
  a documented correct-reason red for this harness code; grepped
  `docs/bugs/0211*` for "registry-oracle" and found no reference either way.
- coverage-matrix/bug-doc citation search: grepped
  `docs/reference/coverage-matrix.md` for the three file names — no hits — so
  no citation pins this test's internal structure.
- Confirmed via direct read of all three files (not inferred) that files 1 and
  2 import `REGISTRY`/`RegistryRow` from `./helpers/registry-oracle` and file 3
  declares its own byte-for-byte equivalent interface and re-derives the same
  four-page join locally.

## Triage
verdict: confirmed — reproduces at HEAD: tests/import-specifier-separator-production-required.test.ts:186-211 declares a `RegistryRow` interface byte-identical in fields to tests/helpers/registry-oracle.ts:21-28 and a `REGISTRY` that reads the same four shards in the same order joined with "\n" exactly as `readRegistry(["parse","load","runtime","host"])` at :31-43/:82 does (only path idiom differs: fileURLToPath vs repoFile); the two bug-trio siblings import `{ REGISTRY, type RegistryRow }` from ./helpers/registry-oracle (from-clause :14, specifier-list :13) because PTQ-0916 (fixed) migrated exactly those two and never named this file; `git status` clean, not a *gate* test, 0 hits in docs/reference/coverage-matrix.md, and same-wave candidate 03 targets the distinct `normativeMessage` wrapper — a D7 copy-paste fixture with no open duplicate (triage: claude-fable-5-1)
