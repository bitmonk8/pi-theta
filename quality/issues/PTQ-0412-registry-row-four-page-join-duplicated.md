---
id: PTQ-0412
title: annotation-root-brace-union-lowering.test.ts rebuilds the local RegistryRow/four-page REGISTRY join tests/helpers/registry-oracle.ts already centralises
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/annotation-root-brace-union-lowering.test.ts:169-187
  - tests/helpers/registry-oracle.ts:20-45
  - tests/inline-object-nested-lowering.test.ts:208-226
  - tests/params-brace-union-rhs-lowering.test.ts:184-202
  - tests/params-inline-object-lowering.test.ts:142-160
  - tests/union-generic-arm-lowering.test.ts:154-172
sites: 5                     # count of occurrences cited in Evidence
fix_scope: cross-module       # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917121953
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# annotation-root-brace-union-lowering.test.ts rebuilds the local RegistryRow/four-page REGISTRY join tests/helpers/registry-oracle.ts already centralises

## Observation
`tests/annotation-root-brace-union-lowering.test.ts` declares its own local
`interface RegistryRow` (a two-field `{ code, message }` shape) and its own
`const REGISTRY = parseRegistry([...four pages].map(readFileSync...).join("\n"))`
read of the same four sharded diagnostics-registry pages
(`code-registry-parse.md`, `code-registry-load.md`, `code-registry-runtime.md`,
`code-registry-host.md`) that `tests/helpers/registry-oracle.ts` already reads
and exports as `REGISTRY`/`RegistryRow` for exactly this purpose. The file
imports `parseRegistry` and `registryMessage` directly from
`../tools/code-registry/index.js` instead of importing the pre-built
`REGISTRY` export. Four sibling files —
`tests/inline-object-nested-lowering.test.ts`,
`tests/params-brace-union-rhs-lowering.test.ts`,
`tests/params-inline-object-lowering.test.ts`, and
`tests/union-generic-arm-lowering.test.ts` — each redeclare the identical
`interface RegistryRow { code; message }` plus the identical four-page
`parseRegistry(...)` join, none importing `tests/helpers/registry-oracle`.

## Evidence

`tests/annotation-root-brace-union-lowering.test.ts:169-187`:
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

`tests/helpers/registry-oracle.ts:20-45` — the canonical export covering the
identical four pages (superset `RegistryRow` shape adding `namespace`,
`severity`, `phase`, `trigger`, none of which the reviewed file's own local
`unresolvedMessage`/`unresolvedLine` helpers read):
```ts
export interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

/** The live four-page sharded registry — the input tests/code-registry.test.ts reconciles. */
export const REGISTRY: readonly RegistryRow[] = parseRegistry(
  [
    "code-registry-parse.md",
    "code-registry-load.md",
    "code-registry-runtime.md",
    "code-registry-host.md",
  ]
    .map((page) =>
      readFileSync(
        fileURLToPath(new URL(`../../docs/spec_topics/diagnostics/${page}`, import.meta.url)),
        "utf8",
      ),
    )
    .join("\n"),
) as RegistryRow[];
```

`diff` verdict against the reviewed file's `RegistryRow`/`REGISTRY` block:
- `tests/inline-object-nested-lowering.test.ts:208-226` — byte-identical.
- `tests/params-brace-union-rhs-lowering.test.ts:184-202` — byte-identical.
- `tests/params-inline-object-lowering.test.ts:142-160` — byte-identical.
- `tests/union-generic-arm-lowering.test.ts:154-172` — byte-identical.

Exact search: `grep -n "interface RegistryRow\|^const REGISTRY" tests/annotation-root-brace-union-lowering.test.ts tests/inline-object-nested-lowering.test.ts tests/params-brace-union-rhs-lowering.test.ts tests/params-inline-object-lowering.test.ts tests/union-generic-arm-lowering.test.ts` → all five files carry the pattern at the lines cited under `locations`; `grep -n "RegistryRow\|parseRegistry\|registry-oracle" tests/schema-slug-canonical-form-mints.test.ts` → 0 hits (that sibling reads no registry, so it is not part of this count).

## Why this is a problem
`tests/helpers/registry-oracle.ts`'s own header states its reason for existing:
"`RegistryRow` and the `REGISTRY` load it backs … were redeclared
byte-for-byte … in several test files. This module centralises that read
only." The reviewed file's `RegistryRow`/`REGISTRY` block is the identical
four-page read the helper already performs, using a `RegistryRow` shape that
is a strict subset of the canonical one (no field the local shape has that the
canonical shape lacks). A prior finding in this same class, PTQ-0327 (resolved,
`arg-mismatch-diagnostic-count-by-surface.test.ts`), was fixed by importing
`REGISTRY` from `tests/helpers/registry-oracle` in place of an equivalent local
read; the reviewed file and four of its lowering-family siblings still carry
the pre-migration shape for the identical four-page join.

## Suggested direction (non-binding, optional)
`tests/helpers/registry-oracle.ts` already exports a `REGISTRY` covering the
same four pages plus a `RegistryRow` that is a superset of the local
interface; it is the existing, already-adopted-elsewhere (PTQ-0327) home the
reviewed file's own `RegistryRow`/`REGISTRY` declarations could import instead
of rebuilding.

## False-positive check
- Gate-pin check: none of the cited files match `*gate*.test.ts` or the named
  kin; the cited lines are a markdown-table read into rows, not a pinned
  count or inventory.
- Recording-double check: the local `REGISTRY` is a static, parsed-once array
  read at module load; it records no call and backs no "never called"
  assertion.
- docs/bugs/ signature search: `grep -rl "annotation-root-brace-union-lowering" docs/bugs/*.md` → docs/bugs/0053-annotation-root-brace-union-read-as-one-field-list.md cites this file as its reproduction/test file, but only for the union-lowering behaviour under test, not for the `RegistryRow`/`REGISTRY` declaration; the file's own diagnostic assertions (`unresolvedLine`) are unaffected by where the four-page join is defined.
- coverage-matrix/bug-doc citation search: `grep -n "annotation-root-brace-union-lowering" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of the file or any `it()`/`describe()` — only that the local registry read could import the existing export — so no citation is affected.
- Coverage check: the claim is about a repeated read/parse DEFINITION, not a
  missing test path; the registry read is exercised by every test in the file
  that calls `unresolvedMessage`.
- Overlap check: grepped `quality/intake`, `quality/resolved`, `quality/issues`
  for `inline-object-nested-lowering`, `params-brace-union-rhs-lowering`,
  `params-inline-object-lowering`, and `union-generic-arm-lowering` — the only
  hit, PTQ-0212 (resolved, `loadCleanly` harness duplication), does not mention
  `RegistryRow`/`REGISTRY`/`registry-oracle`; PTQ-0327 (resolved) covers a
  different file (`arg-mismatch-diagnostic-count-by-surface.test.ts`, already
  migrated to import `registry-oracle`) and does not cite any of these five
  files.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — all five RegistryRow/REGISTRY blocks reproduce byte-identical at the cited lines (own diff), none imports tests/helpers/registry-oracle whose REGISTRY/RegistryRow superset covers the identical four-page join and the only reader is registryMessage(code/message); all sites in tests/, no gate/coverage-matrix carve-out applies, and no existing PTQ (0215/0222/0237/0250/0260/0275/0311/0313/0327 cover other files) or the sibling d7-01 slug-oracle intake tracks these five files (triage: claude-fable-5-1)
