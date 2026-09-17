---
id: PTQ-0496
title: Two reviewed files redeclare the registry-oracle RegistryRow/REGISTRY bundle instead of importing tests/helpers/registry-oracle.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/discriminator-field-classifier-brace-group.test.ts:95-114
  - tests/division-result-type-number-invoke.test.ts:89-98
sites: 2                     # count of occurrences cited in Evidence
fix_scope: cross-module       # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# Two reviewed files redeclare the registry-oracle RegistryRow/REGISTRY bundle instead of importing tests/helpers/registry-oracle.ts

## Observation
`tests/discriminator-field-classifier-brace-group.test.ts` declares its own
`RegistryRow` interface and its own module-scope `REGISTRY` constant, built by
reading all four sharded diagnostics pages
(`code-registry-{parse,load,runtime,host}.md`) and joining them through
`parseRegistry`. `tests/division-result-type-number-invoke.test.ts` declares
the identical two-field `RegistryRow` shape and its own `REGISTRY` constant,
built the same way but narrowed to reading only one of the four pages.
`tests/helpers/registry-oracle.ts` already exports a `RegistryRow` type (a
superset carrying the same two fields plus four more) and a pre-built,
already-four-page-joined `REGISTRY` constant, built for exactly this purpose
(its own header: "redeclared byte-for-byte ... in several test files. This
module centralises that read"). Neither reviewed file imports from it.

## Evidence

`tests/discriminator-field-classifier-brace-group.test.ts:95-114`:
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
```

`tests/division-result-type-number-invoke.test.ts:89-98`:
```ts
const REGISTRY_PAGE = "docs/spec_topics/diagnostics/code-registry-parse.md";

interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

const REGISTRY = parseRegistry(
  readFileSync(fileURLToPath(new URL(`../${REGISTRY_PAGE}`, import.meta.url)), "utf8"),
) as RegistryRow[];
```

`tests/helpers/registry-oracle.ts:12-18,29-40` — the canonical bundle both
excerpts above duplicate the shape of:
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

Search: `grep -n "production-load-harness\|registry-oracle" tests/discriminator-field-classifier-brace-group.test.ts tests/division-result-type-number-invoke.test.ts` → 0 hits in either file; both build their own `parseRegistry(...)` call directly against `tools/code-registry/index.js` instead.

## Why this is a problem
`tests/helpers/registry-oracle.ts` exists specifically to hold the four-page
`parseRegistry` read and the `RegistryRow` shape once, citing its own
motivation as "redeclared byte-for-byte ... in several test files" (its
header comment). Both reviewed files independently perform the identical
read (one at full four-page width, one narrowed to a single page that the
canonical `REGISTRY` constant already is a superset of) and independently
retype the same two-field row shape, rather than importing the shared
`REGISTRY` export and reading `.code`/`.message` off it. Each copy is a site
where a change to the registry-parsing call (e.g. an added shard, a changed
relative path, a `parseRegistry` signature change) must be re-applied by hand
rather than fixed once.

## Suggested direction (non-binding, optional)
`tests/helpers/registry-oracle.ts`'s exported `REGISTRY` constant already
carries every row either file's local `REGISTRY` does (a strict superset, by
field count and by page coverage), so it is the existing import target both
local blocks point at.

## False-positive check
- Gate-pin check: neither `tests/discriminator-field-classifier-brace-group.test.ts`
  nor `tests/division-result-type-number-invoke.test.ts` matches
  `*gate*.test.ts` or the named gate kin (closing-gate, cross-cutting-gates,
  rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate); neither excerpt is a pinned count or
  inventory assertion.
- Recording-double check: `REGISTRY` is a static, parsed-once array read from
  committed markdown; it records no calls and backs no "never called"
  witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl
  "discriminator-field-classifier-brace-group\|division-result-type-number-invoke"
  docs/bugs/*.md` hits 18 bug documents (0096, 0142, 0332, and others) that
  cite these files by name/test-count as witnesses, none discussing or
  requiring a particular implementation of the registry-read block; `npx
  vitest run tests/discriminator-field-classifier-brace-group.test.ts
  tests/division-result-type-number-invoke.test.ts` reproduces 13/13 passing
  at HEAD, so neither is a documented correct-reason red.
- coverage-matrix/bug-doc citation search: docs/bugs/0096:773 cites
  `tests/discriminator-field-classifier-brace-group.test.ts` by name and cell
  count (9 cells); docs/bugs/0142:988 and docs/bugs/0332:211,296 cite
  `tests/division-result-type-number-invoke.test.ts` by name and cell counts.
  All four citations pin the file and its test count/behaviour, not the
  internal `REGISTRY`/`RegistryRow` construction; this finding proposes no
  merge, rename, or deletion of any test, `it()`, or `describe()` — only that
  an internal reader bundle could be imported rather than redeclared — so no
  witness-list citation is disturbed.
- Coverage check: the claim is about a repeated harness-definition (an
  interface plus a `parseRegistry` call), not a missing test path; both
  copies are exercised by the passing tests in their own files.
- Overlap/duplicate check: `grep -rl
  "discriminator-field-classifier-brace-group\|division-result-type-number-invoke"
  quality/intake quality/resolved` (excluding this shard's own manifest and
  TRIAGE_LOG mentions) → 0 hits before this filing; PTQ-0215 (fixed) is the
  finding that created `tests/helpers/registry-oracle.ts`, but its own cited
  sites are three other files
  (annotation-nontype-text-refusal.test.ts,
  schema-body-nontype-text-refusal.test.ts,
  b0449-reexport-chain-enum-unknown-variant.test.ts); neither of the two
  files reviewed here is among PTQ-0215's cited sites, so this is a distinct,
  uncited instance of the same non-adoption pattern, consistent with the many
  other per-file "registry-oracle duplicated" findings already accepted
  elsewhere in this project's history.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts byte-match at the cited lines (discriminator-field-classifier-brace-group.test.ts:95-114 four-page join; division-result-type-number-invoke.test.ts:89-98 single parse-page read) against tests/helpers/registry-oracle.ts (RegistryRow :21-28, readRegistry :31-45, REGISTRY :48 — ~9-line drift from the cited 12-18/29-40, content identical), 0 hits for `registry-oracle|production-load-harness` in either file, both files consume REGISTRY solely through `registryMessage(REGISTRY, code)` reading `.code`/`.message` (registryMessage = `find(row.code===code)?.message`) and both codes (`invoke-arg-type-mismatch`, `non-numeric-arithmetic-operands`) occur only on code-registry-parse.md, so the canonical four-page REGISTRY is a drop-in superset; neither file is a gate, `npx vitest run` reproduces 13/13 green (not a documented red), coverage-matrix.md has 0 citations and the 18 citing bug docs pin test counts/behaviour not the registry block; no resolved PTQ (0215/0222/0237/0250/0260/0275/0311/0313/0327/0404/0411/0412 re-read) cites either file — same confirmed D7 copy-paste-fixture class as PTQ-0327 (single-page variant) and PTQ-0412 (four-page variant); note only that sibling intake qw20260917154546-d7-01-fn-arg-single-page-registry-oracle-duplicated.md lists division-result-type-number-invoke in its 22-file pattern grep (not in its locations), so the fixer should coordinate that one site (triage: claude-fable-5-1)
