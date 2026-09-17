---
id: PTQ-0502
title: inline-object-field-name-case.test.ts and -comparison-key.test.ts both redeclare the RegistryRow/REGISTRY/msg block tests/helpers/registry-oracle.ts already centralises
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/inline-object-field-name-case.test.ts:207-250
  - tests/inline-object-field-name-comparison-key.test.ts:121-165
  - tests/helpers/registry-oracle.ts:1-45
sites: 2                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# inline-object-field-name-case.test.ts and -comparison-key.test.ts both redeclare the RegistryRow/REGISTRY/msg block tests/helpers/registry-oracle.ts already centralises

## Observation
Both files in this review's scope declare their own local `interface
RegistryRow` (a two-field `{ code, message }` shape), their own `const
REGISTRY = parseRegistry([...four pages].map(readFileSync...).join("\n"))`
read of the same four sharded diagnostics-registry pages
(`code-registry-parse.md`, `code-registry-load.md`, `code-registry-runtime.md`,
`code-registry-host.md`), and their own `function msg(code, fills)` wrapper
over `registryMessage`. Neither file imports `tests/helpers/registry-oracle`,
which already exports a superset `RegistryRow` and the identical four-page
`REGISTRY` join for exactly this purpose.

## Evidence

`tests/inline-object-field-name-case.test.ts:207-250`:
```ts
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
...
function msg(code: string, fills: ReadonlyArray<readonly [string, string]>): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/ must carry the Message row for ${code}`,
  ).toBeDefined();
  let out = template as string;
  for (const [placeholder, value] of fills) {
    expect(
      out,
      `DIAG-4: the ${code} Message template must carry the ${placeholder} placeholder; template=${JSON.stringify(template)}`,
    ).toContain(placeholder);
    out = out.replace(placeholder, value);
  }
  return out;
}
```

`tests/inline-object-field-name-comparison-key.test.ts:121-165` — byte-identical
`RegistryRow`/`REGISTRY`/`msg` block (own `diff` against the excerpt above
shows no difference beyond one dropped comment line at the `REGISTRY`
declaration):
```ts
interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

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
...
function msg(code: string, fills: ReadonlyArray<readonly [string, string]>): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/ must carry the Message row for ${code}`,
  ).toBeDefined();
  let out = template as string;
  for (const [placeholder, value] of fills) {
    expect(
      out,
      `DIAG-4: the ${code} Message template must carry the ${placeholder} placeholder; template=${JSON.stringify(template)}`,
    ).toContain(placeholder);
    out = out.replace(placeholder, value);
  }
  return out;
}
```

`tests/helpers/registry-oracle.ts:1-45` — the canonical export already
covering the identical four pages, with a `RegistryRow` shape that is a
strict superset of the two reviewed files' local interface (adding
`namespace`, `severity`, `phase`, `trigger`, none of which either file's own
`msg` reads):
```ts
export interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}
...
export const REGISTRY: readonly RegistryRow[] = readRegistry(["parse", "load", "runtime", "host"]);
```

Exact search: `grep -n "interface RegistryRow\|^const REGISTRY\|^function msg" tests/inline-object-field-name-case.test.ts tests/inline-object-field-name-comparison-key.test.ts` → both files carry the pattern at the lines cited under `locations`, and neither imports `../../tests/helpers/registry-oracle` (`grep -n "registry-oracle" tests/inline-object-field-name-case.test.ts tests/inline-object-field-name-comparison-key.test.ts` → 0 hits in both).

## Why this is a problem
`tests/helpers/registry-oracle.ts`'s own header states its reason for
existing: "`RegistryRow` and the `REGISTRY` load it backs … were redeclared
byte-for-byte … in several test files. This module centralises that read
only." Both reviewed files' `RegistryRow`/`REGISTRY` blocks are the identical
four-page read the helper already performs, using a `RegistryRow` shape that
is a strict subset of the canonical one, and both additionally duplicate the
identical `msg()` wrapper between each other. A resolved finding in this exact
class, PTQ-0412 (`annotation-root-brace-union-lowering.test.ts` and four
siblings), fixed the same shape by pointing at this helper as the existing,
already-adopted home; the two files reviewed here still carry the
pre-migration shape.

## Suggested direction (non-binding, optional)
`tests/helpers/registry-oracle.ts` already exports a `REGISTRY` covering the
same four pages plus a `RegistryRow` that is a superset of both files' local
interface; it is the existing, already-adopted-elsewhere (PTQ-0327, PTQ-0412)
home the reviewed files' own `RegistryRow`/`REGISTRY` declarations could
import instead of rebuilding. The `msg()` wrapper duplicated identically
between the two reviewed files is a second, smaller instance of the same
observation.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named kin; the
  cited lines are a markdown-table read into rows, not a pinned count or
  inventory.
- Recording-double check: the local `REGISTRY` is a static, parsed-once array
  read at module load; it records no call and backs no "never called"
  assertion.
- docs/bugs/ signature search: `grep -rl "inline-object-field-name-case\|inline-object-field-name-comparison-key" docs/bugs/*.md` → both files are cited as the witness/reproduction file for docs/bugs/0154 and docs/bugs/0159 (and related bugs) respectively, but only for the diagnostic-emission behaviour under test, not for where the `RegistryRow`/`REGISTRY`/`msg` declarations live; the files' own diagnostic assertions are unaffected by which module performs the four-page read.
- coverage-matrix/bug-doc citation search: `grep -n "inline-object-field-name-case\|inline-object-field-name-comparison-key" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of either file or any `it()`/`describe()` — only that the local registry read and `msg` helper could import/share the existing helper — so no citation is affected.
- Coverage check: the claim is about a repeated read/parse DEFINITION and a
  repeated helper function, not a missing test path; the registry read is
  exercised by every test in both files that calls `msg()`.
- Overlap check: grepped `quality/intake` and `quality/resolved` for
  `inline-object-field-name-case` and `inline-object-field-name-comparison-key`
  — no hit names either file's `RegistryRow`/`REGISTRY`/`msg` block; PTQ-0215,
  PTQ-0222, PTQ-0237, PTQ-0250, PTQ-0260, PTQ-0271, PTQ-0272, PTQ-0275,
  PTQ-0311, PTQ-0313, PTQ-0327, PTQ-0404, PTQ-0411, PTQ-0412 (all resolved)
  cover other, disjoint sets of files.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts reproduce at the cited lines (case:207/213/235, comparison-key:121/126/153; own diff of the blocks shows only the dropped comment and two interleaved unrelated constants), `grep registry-oracle` on both files → 0 hits, tests/helpers/registry-oracle.ts:20-45 exports the identical four-shard join under a superset RegistryRow (30 test files already import it; registryMessage is a plain `.find`, so it drops in), the helper header names this exact byte-for-byte read as its reason to exist and PTQ-0412 fixed the same shape against it; D7 boilerplate-duplication in tests/ with no gate/recording-double/coverage-matrix carve-out (0 coverage-matrix hits; the 28 docs/bugs citations are witness-of-behaviour, not of the read's home); not a duplicate — neither file appears in any resolved PTQ and in-wave sibling d7-97-03 cites four tests/live/ files instead (triage: claude-fable-5-1)
