---
id: PTQ-0916
title: import-export-from-clause-required.test.ts and import-specifier-list-production-required.test.ts each redeclare the four-page RegistryRow/REGISTRY read tests/helpers/registry-oracle.ts already centralises
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/import-export-from-clause-required.test.ts:132-175
  - tests/import-specifier-list-production-required.test.ts:191-235
  - tests/helpers/registry-oracle.ts:20-42
  - tests/helpers/load-row-harness.ts:62-77
sites: 2
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260918075903
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# import-export-from-clause-required.test.ts and import-specifier-list-production-required.test.ts each redeclare the four-page RegistryRow/REGISTRY read tests/helpers/registry-oracle.ts already centralises

## Observation
Both in-scope files declare their own module-scope `interface RegistryRow`
(fields `code`, `namespace`, `severity`, `phase`, `trigger`, `message`) and
their own `const REGISTRY = parseRegistry(...)` that reads and concatenates
the same four pages — `code-registry-parse.md`, `code-registry-load.md`,
`code-registry-runtime.md`, `code-registry-host.md`, in that order — and each
also declares its own `normativeMessage(code)` function that looks the code
up via `registryMessage(REGISTRY, code)` and fails loudly with
`expect(template, ...).toBeDefined()` when the row is absent.
`tests/helpers/registry-oracle.ts` already exports an identical
`RegistryRow` interface and a `REGISTRY` constant built by reading and
joining the same four pages in the same order, and
`tests/helpers/load-row-harness.ts` already exports `registryMessageOf`,
which performs the identical lookup-and-fail-loudly sequence. The
`registry-oracle.ts` module's own header states it exists because this exact
`RegistryRow`/`REGISTRY` pair "were redeclared byte-for-byte (confirmed via
`diff`) in several test files" — neither in-scope file has migrated to it.

## Evidence
`tests/import-export-from-clause-required.test.ts:132-175`:
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

function normativeMessage(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `no registry row for ${code} — DIAG-4 anchor: ` +
      `docs/spec_topics/diagnostics/code-registry-parse.md must carry its Message row ` +
      `(mirrored into docs/reference/diagnostics.md in the same commit, DIAG-2)`,
  ).toBeDefined();
  return template as string;
}
```

`tests/import-specifier-list-production-required.test.ts:191-235` — the
identical `RegistryRow` interface, the identical four-page `REGISTRY` read
(same page list, same order, same join), and a `normativeMessage` whose body
is byte-identical to the one above (verified with `diff` after stripping
comment-only lines: the two blocks differ only in trivial code/line-number
citations inside doc comments, never in executable code).

`tests/helpers/registry-oracle.ts:20-42` (the canonical, already-exported
equivalent):
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

`tests/helpers/load-row-harness.ts:62-77` (the canonical lookup, same
fail-loudly shape as both files' local `normativeMessage`):
```ts
export function registryMessageOf(
  registry: readonly RegistryRow[],
  registryPath: string,
  code: string,
  fills: ReadonlyArray<readonly [string, string]> = [],
): string {
  const template = registryMessage(registry, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: ${registryPath} must carry the Message row for ${code}`,
  ).toBeDefined();
  let out = template as string;
  for (const [placeholder, value] of fills) {
    ...
  }
  return out;
}
```

## Why this is a problem
`tests/helpers/registry-oracle.ts` was created specifically to hold this
`RegistryRow`/`REGISTRY` pair once, citing its own prior redeclaration across
"several test files" as the reason. Both in-scope files still carry their
own copy of the interface, the four-page read (same pages, same order), and
a message-lookup function whose fail-loudly shape mirrors
`registryMessageOf` — the two in-scope files are also identical to each
other on this block, so the duplication is threefold: against the canonical
module and between the two files in scope.

## Suggested direction (non-binding, optional)
Importing `REGISTRY` (or building it via `readRegistry([...])`) from
`tests/helpers/registry-oracle.ts`, and rendering messages through
`registryMessageOf` from `tests/helpers/load-row-harness.ts`, is the path
`registry-oracle.ts`'s own header names as the reason it exists.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or a listed gate
  kin; not a pinned-count/inventory gate.
- Recording-double check: `REGISTRY` and `normativeMessage` are a static
  parsed table and a stateless lookup, not a recording double backing a
  "never called" witness; not applicable.
- docs/bugs/ signature search: `grep -n "RegistryRow\|registry-oracle" docs/bugs/0058-fromless-export-form-parses-without-spec-production.md docs/bugs/0100-production-excluded-import-export-spellings-parse-clean.md` → 0 hits in either; neither bug document cites a deliberate reason for a local registry-read copy.
- coverage-matrix/bug-doc citation search: `grep -n "import-export-from-clause-required\|import-specifier-list-production-required" docs/reference/coverage-matrix.md` → 0 hits. No rename, merge, or deletion of any `it()`/`describe()` is proposed — only relocating the shared setup block to the existing helpers — so any bug-doc witness-list citation of either file by name is unaffected.
- Duplicate-topic check: `grep -rln "registry-oracle.ts\|RegistryRow" quality/issues quality/resolved` returns many entries (e.g. PTQ-0404, PTQ-0499, PTQ-0634, PTQ-0659, PTQ-0718, PTQ-0812, and this same wave's qw20260918075903-d7-02-registry-oracle-reimplemented-b0268.md), each naming a different file or file pair; none names `import-export-from-clause-required.test.ts` or `import-specifier-list-production-required.test.ts`, so this is an unfiled instance of the same class at these two files.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: all four excerpts reproduce verbatim at the cited lines (`interface RegistryRow` + four-page `const REGISTRY = parseRegistry(...)` + `normativeMessage` at tests/import-export-from-clause-required.test.ts:132-175 and tests/import-specifier-list-production-required.test.ts:191-235; canonical `RegistryRow`/`readRegistry`/`REGISTRY` at tests/helpers/registry-oracle.ts:20-49 and `registryMessageOf` at tests/helpers/load-row-harness.ts:62-82), `diff` of the sed-extracted comment-stripped blocks from the two in-scope files is empty, both copies are live (`REGISTRY.find` at A:294/B:431, `normativeMessage(` called 6×/7× in positive assertions), neither file imports `./helpers/registry-oracle` or `./helpers/load-row-harness` (imports at A:1-10, B:1-9 confirm the local `parseRegistry`/`registryMessage` + `readFileSync` route), the stated docs/bugs and coverage-matrix searches both reproduce at 0, both locations are under tests/ and the class is D7 boilerplate/copy-paste duplication with no gate/recording-double/red-test carve-out (nine bug docs cite these files by name but no it()/describe() rename, merge or delete is proposed); dedupe: `grep -rl` of both filenames across quality/issues, resolved, intake finds only PTQ-0731/0813 (separator file, parseDoc/isLoadParseError), resolved PTQ-0239/0467/0493 (parse()/fakeThetaLibFs, not the registry read) and the sibling d7-07 (parseDoc), and none of the registry-oracle filings (PTQ-0412, 0484, 0777, 0830, …) lists either file, so this is an unfiled per-file instance of the class the store tracks per file; one note for the fixer — registry-oracle.ts's own header sanctions a per-file `registryMessageOf`-shaped local reader, so the load-bearing fix is migrating the `RegistryRow`/`REGISTRY` read (the title's claim); folding `normativeMessage` into `registryMessageOf` is optional (triage: claude-fable-5-1)
