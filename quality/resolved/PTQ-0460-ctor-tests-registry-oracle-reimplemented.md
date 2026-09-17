---
id: PTQ-0460
title: ctor-proto-named-field.test.ts and ctor-unresolved-schema-name.test.ts each re-read and re-parse the four-page diagnostics registry instead of importing tests/helpers/registry-oracle.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/ctor-proto-named-field.test.ts:230-248
  - tests/ctor-unresolved-schema-name.test.ts:94-119
  - tests/helpers/registry-oracle.ts:20-49
sites: 2
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# ctor-proto-named-field.test.ts and ctor-unresolved-schema-name.test.ts each re-read and re-parse the four-page diagnostics registry instead of importing tests/helpers/registry-oracle.ts

## Observation
`tests/helpers/registry-oracle.ts` exports a `RegistryRow` interface and a
`REGISTRY`/`readRegistry` read of the sharded
`docs/spec_topics/diagnostics/code-registry-{parse,load,runtime,host}.md`
corpus through the real `parseRegistry`, created (per its own header, PTQ-0215)
because this exact read "were redeclared byte-for-byte … in several test
files." Both `tests/ctor-proto-named-field.test.ts` and
`tests/ctor-unresolved-schema-name.test.ts` independently re-run the identical
four-page `readFileSync` + `parseRegistry` + `.join("\n")` chain at module
scope instead of importing the helper's export, and
`ctor-unresolved-schema-name.test.ts` additionally redeclares the 6-field
`RegistryRow` interface the helper already exports under the same name.

## Evidence
`tests/ctor-proto-named-field.test.ts:230-248`:
```ts
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
) as readonly { readonly code: string; readonly message: string }[];

/**
 * The registered *Message* template for `code`. A missing row fails LOUDLY: the
 * registry is this file's only code oracle, so its absence is a harness
 * failure, never a skip.
 */
function registeredMessage(code: string): string {
```

`tests/ctor-unresolved-schema-name.test.ts:94-119`:
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

`tests/helpers/registry-oracle.ts:20-49` (the canonical, already-exported
equivalent, differing only in relative-path depth `../../` vs each file's
`../`):
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

Neither reviewed file imports from `tests/helpers/registry-oracle`
(`grep -n 'helpers/registry-oracle' tests/ctor-proto-named-field.test.ts
tests/ctor-unresolved-schema-name.test.ts` → 0 hits in both).

## Why this is a problem
`tests/helpers/registry-oracle.ts` exists specifically to hold this read after
a prior review (PTQ-0215, and later PTQ-0260/PTQ-0404/the sibling
`d7-01-registry-oracle-reread-two-files` finding in this same wave) confirmed
the identical four-page `readFileSync`/`fileURLToPath`/`parseRegistry`/`.join`
chain was independently redeclared across test files. Both reviewed files
perform that same read at module scope with no stated reason the read must
stay local — the surrounding comments explain why the registry is read live
rather than hand-copied (DIAG-4), not why the read harness itself must be
reimplemented per file — and `ctor-unresolved-schema-name.test.ts`'s local
`RegistryRow` interface is a field-for-field match of the helper's exported
one.

## Suggested direction (non-binding, optional)
`tests/helpers/registry-oracle.ts` already exports `REGISTRY` (built via
`readRegistry(["parse", "load", "runtime", "host"])`) and its `RegistryRow`
type; it is the existing, purpose-built home for this exact read.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named kin
  (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate); the cited
  `REGISTRY` constants are a static parsed-corpus read, not a pinned-count or
  inventory assertion.
- Recording-double check: `REGISTRY` is a read-once, markdown-parsed array; it
  records no calls and backs no "never called" witness, so the
  negative-witness carve-out does not apply.
- docs/bugs/ signature search: `docs/bugs/0119-proto-named-field-silently-dropped.md`
  and `docs/bugs/0025-ctor-unresolved-schema-name-passthrough.md` are both open
  bugs whose reds are documented and pinned by their own header prose in each
  test file; neither bug document states any rationale for keeping the
  registry-read harness local to either file — the documented-red carve-out
  covers the tests' RED assertions, not this harness-duplication claim.
- coverage-matrix/bug-doc citation search: `grep -n
  "ctor-proto-named-field\|ctor-unresolved-schema-name"
  docs/reference/coverage-matrix.md` → 0 hits. Both files are cited by name in
  several docs/bugs/ documents (0119, 0120, 0121, 0026 cite
  ctor-proto-named-field.test.ts; 0025 and 0028 cite
  ctor-unresolved-schema-name.test.ts), each pinning specific `it()` cell
  ranges elsewhere in the file (e.g. 0119's own cited `describe` blocks, all
  beyond line 248). This finding proposes no merge, rename or deletion of any
  cited cell — only that the module-scope `REGISTRY`/`RegistryRow` declarations
  import the existing helper instead of re-deriving the read.
- Prior-finding search: `grep -rl "ctor-proto-named-field\|ctor-unresolved-schema-name"
  quality/intake quality/resolved` → only this wave's own scratch/shard
  listings and PTQ-0092/PTQ-0274 (distinct root causes — a stale disposable
  claim and a `severityCodes`/`diagCodes` duplication, at different lines);
  `quality/intake/qw20260917154546-d7-01-registry-oracle-reread-two-files.md`
  and the resolved `PTQ-0260-registry-oracle-duplicated-ctor-tests.md` /
  `PTQ-0404-registry-oracle-reimplemented-three-files.md` file the same
  root-cause CLASS against different, non-overlapping files
  (brace-and-angle-annotation-junk-refusal /
  brace-rooted-union-arm-capture.test.ts; ctor-declaration-order /
  ctor-field-type-check.test.ts; a third unrelated trio) — none names either
  file this finding cites.
- Coverage check: the claim is about a duplicated read/parse DEFINITION, not a
  missing test path; the registry read in both files is exercised by every
  diagnostic-message assertion already in each file.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts match at the cited lines and the four-page readFileSync/fileURLToPath/parseRegistry/.join chain is byte-identical to tests/helpers/registry-oracle.ts:31-45 modulo `../` vs `../../` (ctor-unresolved-schema-name.test.ts:94-101 also redeclares the helper's six-field RegistryRow verbatim); `grep registry-oracle` on both files → 0 hits while the helper has 30 importers; every REGISTRY use (registryMessage at :252 / :127, REGISTRY.find at :202) is satisfied by the exported REGISTRY; not a gate test, no recording double, docs/bugs/0119 + 0025 say nothing about a local registry read and coverage-matrix cites neither file; the twelve resolved registry-oracle findings (PTQ-0215/0222/0237/0250/0260/0275/0311/0313/0327/0404/0411/0412) and the two same-wave intakes (reread-two-files, d7-161-01 trio) all cite disjoint files — D7 boilerplate-duplication, mechanical dedupe (triage: claude-fable-5-1)
