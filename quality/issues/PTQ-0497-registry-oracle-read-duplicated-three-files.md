---
id: PTQ-0497
title: three in-scope files each redeclare the four-page diagnostics-registry read that tests/helpers/registry-oracle.ts centralises
lens: D7
status: open
verdict: confirmed
locations:
  - tests/empty-object-discriminator-field-withhold.test.ts:81-98
  - tests/empty-query-annotation.test.ts:162-187
  - tests/empty-template-parse-warning.test.ts:52-77
  - tests/helpers/registry-oracle.ts:1-45
sites: 3
fix_scope: module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# three in-scope files each redeclare the four-page diagnostics-registry read that tests/helpers/registry-oracle.ts centralises

## Observation
Each of the three files reads the same four sharded diagnostics-registry pages
(`code-registry-{parse,load,runtime,host}.md`) from disk via `readFileSync` +
`fileURLToPath`, joins them with `"\n"`, and calls the same `parseRegistry` to
produce a `RegistryRow[]`, under a locally-declared `RegistryRow` interface.
`tests/helpers/registry-oracle.ts` (added 2026-09-11, after all three files
existed) exports exactly this read as `readRegistry`/`REGISTRY`, stating in its
own header that this read "were redeclared byte-for-byte (confirmed via
`diff`) in several test files." None of the three in-scope files imports it.

## Evidence

`tests/empty-object-discriminator-field-withhold.test.ts:81-98`:
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
```

`tests/empty-query-annotation.test.ts:162-187`:
```ts
interface RegistryRow {
  code: string;
  namespace: string;
  severity: string;
  phase: string;
  trigger: string;
  message: string;
}

// The live four-page sharded registry, read from the spec corpus and
// concatenated — the same input tests/code-registry.test.ts reconciles.
const REGISTRY_TEXT = [
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
  .join("\n");

const REGISTRY = parseRegistry(REGISTRY_TEXT) as RegistryRow[];
```

`tests/empty-template-parse-warning.test.ts:52-77`:
```ts
interface RegistryRow {
  code: string;
  namespace: string;
  severity: string;
  phase: string;
  trigger: string;
  message: string;
}

// The sharded registry as shipped — the same input tests/code-registry.test.ts
// reconciles; DIAG-4 makes its Message column the normative expectation.
const REGISTRY_TEXT = [
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
  .join("\n");

const REGISTRY = parseRegistry(REGISTRY_TEXT) as RegistryRow[];
```

`tests/helpers/registry-oracle.ts:17-45` (the canonical helper, added 2026-09-11):
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

The two `REGISTRY_TEXT` declarations (empty-query-annotation.test.ts:173-186,
empty-template-parse-warning.test.ts:63-76) are byte-for-byte identical to each
other, and the `empty-object-discriminator-field-withhold.test.ts` inline
version differs only by folding the `.join("\n")` into the `parseRegistry(...)`
call directly rather than binding an intermediate `REGISTRY_TEXT`.

## Why this is a problem
All three files perform the same disk read, the same four-page ordering, and
the same `parseRegistry` call to produce the same `REGISTRY` shape that
`tests/helpers/registry-oracle.ts` was created to hold in one place. Each
locally-declared `RegistryRow` interface is a third redeclaration of the
helper's exported type. The three files' own per-code message readers
(`messageTemplate`, `registryMessage(REGISTRY, code)`) already vary
per-file and are not part of this observation — only the read-and-parse
scaffolding above them repeats.

## Suggested direction (non-binding, optional)
The natural home for this scaffolding, as the helper's own header states, is
`tests/helpers/registry-oracle.ts`'s `REGISTRY` / `RegistryRow` export; each
file's own message-rendering helpers are file-specific and would stay local.

## False-positive check
Gate-pin check: none of the three files matches `*gate*.test.ts` or the named
gate kin; not a pinned-count census. Recording-double check: `REGISTRY` is a
parsed data table, not a recording double witnessing a MUST-NOT-call. Bug-doc
signature search: `docs/bugs/0129-*`, `0014-*`, `0085-*` were read in full for
each file; none documents the registry-read scaffolding itself as a
correct-reason red — the reds these files carry are over the registry's
*content* (a missing row), not over this read helper. Coverage-matrix /
bug-doc citation search: `grep -rn` for each file's basename across
`docs/reference/coverage-matrix.md` and `docs/bugs/*.md` found only the
files' own bug docs (0129, 0014, 0085) citing themselves as witnesses, not a
citation of the registry-read block specifically, so no rename/merge is
proposed here — only the duplication of the read scaffolding is observed.
git history: `tests/helpers/registry-oracle.ts` was added 2026-09-11
(qw20260911104855); all three in-scope files were added in July/August 2026,
before the helper existed.

## Triage
<!-- pending -->
verdict: confirmed — independently re-verified: all three excerpts reproduce at the cited lines (the two REGISTRY_TEXT blocks byte-identical, the third folding .join into parseRegistry); grep confirms none of the three files imports tests/helpers/registry-oracle.ts while 30 other tests do; the helper's readRegistry reads the same four pages in the same order joined with "\n" through the same parseRegistry, so the migration is a mechanical import swap; git log confirms the helper (2594cd44, 2026-09-11) postdates all three files (6ff550f7 07-28, ce89d9d9 08-21, dd3a4d80 08-22); no carve-out applies (not gate tests, not recording doubles; bugs 0129/0014/0085 red over registry content and never mention the read mechanism; no coverage-matrix rows); not a duplicate — none of the twelve prior confirmed/fixed registry-oracle filings (PTQ-0215/0222/0237/0250/0260/0275/0311/0313/0327/0404/0411/0412) cites this file-set, and sibling same-wave intake filings cover tests/live/** cells only (triage: claude-fable-5-1)
