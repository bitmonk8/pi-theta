---
id: PTQ-0908
title: b0268 re-parses the parse-phase registry page inline instead of calling tests/helpers/registry-oracle.ts's readRegistry
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0268-load-note-path-spelling-single-convention.test.ts:116-133
  - tests/helpers/registry-oracle.ts:19-42
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918075903
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
fix_skips: 1
---

# b0268 re-parses the parse-phase registry page inline instead of calling tests/helpers/registry-oracle.ts's readRegistry

## Observation
tests/b0268-load-note-path-spelling-single-convention.test.ts declares its own
`RegistryRow` interface and builds its own `REGISTRY` constant by calling the
raw `parseRegistry` import over one `readFileSync`/`fileURLToPath` read of
`docs/spec_topics/diagnostics/code-registry-parse.md`. tests/helpers/registry-oracle.ts
already exports a `readRegistry(shards)` function that performs the identical
read-and-parse over the same shard files (selected by name, `"parse"` among
them) and an equivalent `RegistryRow` shape (a superset carrying two extra
fields, `namespace` and `trigger`, which b0268 does not use but which do not
conflict with any of its own field reads). b0268 imports nothing from
tests/helpers/registry-oracle.ts.

## Evidence

tests/b0268-load-note-path-spelling-single-convention.test.ts:116-133 (re-read
immediately before filing):
```ts
interface RegistryRow {
  code: string;
  severity: string;
  phase: string;
  message: string;
}

const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL(
        "../docs/spec_topics/diagnostics/code-registry-parse.md",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as RegistryRow[];
```

tests/helpers/registry-oracle.ts:19-42 — the canonical read, same
read-and-parse computation generalised over a shard list (re-read immediately
before filing):
```ts
/** A parsed row of the sharded code registry, as `parseRegistry` yields it. */
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
```

Exact search: `grep -rl "code-registry-parse.md" tests/*.test.ts | xargs grep
-l "parseRegistry(" | xargs grep -L "helpers/registry-oracle\|helpers/load-row-harness"`
→ 60+ files construct their own inline `RegistryRow`/`parseRegistry`/
`readFileSync` read rather than importing `tests/helpers/registry-oracle.ts`
or `tests/helpers/load-row-harness.ts` (which itself re-exports a
parse-shard-only `PARSE_REGISTRY` built through `readRegistry`'s identical
pattern); tests/b0268-load-note-path-spelling-single-convention.test.ts is one
of that set, confirmed by direct read of both files above.

## Why this is a problem
tests/helpers/registry-oracle.ts's own header states it exists because
`RegistryRow` and the registry read it backs "were redeclared byte-for-byte
(confirmed via `diff`) in several test files" and that "this module
centralises that read only." b0268's own `RegistryRow` interface and
`REGISTRY` constant reproduce that exact read (same `parseRegistry` call, same
`readFileSync`/`fileURLToPath` construction, same "parse" shard, same `as
RegistryRow[]` cast) against the identical file, one directory level away from
the module built to centralise it. A change to how the shard read is
performed (a changed relative path base, an added shard, a parse-error
wrapper) applied to `readRegistry`'s callers would not reach this file's
independent copy.

## Suggested direction (non-binding, optional)
tests/helpers/registry-oracle.ts already exports `readRegistry(["parse"])`,
which performs the identical read over the identical file and yields a
`RegistryRow` shape whose `code`/`severity`/`phase`/`message` fields are the
only ones b0268 itself reads; the local `interface RegistryRow` and `const
REGISTRY = parseRegistry(...)` block could be replaced by that already-built
export.

## False-positive check
- Gate-pin check: tests/b0268-load-note-path-spelling-single-convention.test.ts
  does not match `*gate*.test.ts` or the named kin; the cited lines build a
  registry-row array for a message lookup, not a pinned count or inventory
  assertion.
- Recording-double check: `RegistryRow`/`REGISTRY` are a parsed-file read, not
  a fake or double backing a "never called" witness. Not applicable.
- docs/bugs/ signature search: docs/bugs/0268-load-notes-render-same-file-with-mixed-path-separators.md,
  Status "fixed (0.265.0)". `npx vitest run tests/b0268-load-note-path-spelling-single-convention.test.ts`
  → 2 passed (2) at HEAD, so this is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0268-load-note-path-spelling-single-convention" docs/reference/coverage-matrix.md`
  → 0 hits. `grep -n "RegistryRow\|REGISTRY" docs/bugs/0268-*.md` → 0 hits.
  This finding proposes no merge, rename or deletion of any test, `it()` or
  `describe()` — only that the file's own registry-row read could call an
  already-exported helper instead of restating it — so no witness-list
  citation is disturbed.
- Overlap check against already-filed/resolved topics: PTQ-0427
  (b0268-load-note-makehost-duplicated, fixed) covers this file's
  `makeHost`/`LoadPass`/`runLoadPass`/`requireDriven`/note-reading
  redeclarations and does not cite `RegistryRow`, `REGISTRY`, or lines
  116-133 anywhere in its Evidence or `locations`. `grep -rl "b0268-load-note-path-spelling-single-convention"
  quality/issues quality/resolved quality/intake` (before this filing) found
  only PTQ-0427, whose scope is disjoint from the registry read cited here.
  Given the very large number of already-filed same-shape
  "registry-oracle-reimplemented" findings across other files in this
  codebase, this filing's claim is scoped strictly to
  tests/b0268-load-note-path-spelling-single-convention.test.ts, the only file
  in this wave's brief that exhibits it; the wider 60+-file inventory above is
  reported as the exact search and hit count, not as a claim this finding
  covers every one of those files.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at the cited lines (b0268 :116-133 local `RegistryRow` + `REGISTRY = parseRegistry(readFileSync(fileURLToPath(new URL("../docs/.../code-registry-parse.md"))))`, registry-oracle.ts :19-42 `export function readRegistry(shards)` performing the same `parseRegistry`/`readFileSync`/`fileURLToPath` read over `code-registry-${shard}.md`), whitespace-stripped extraction shows the two reads differ only by the shard-parameterised path and the `.join("\n")` over one shard, which is the identity for `["parse"]`; the local copy is live (`registryMessage(REGISTRY, code)` :142, reached via `normativeMessagePattern` :310) and predates the export (b0268 region 978670e0 2026-08-24 vs. `readRegistry` c79a9039 2026-09-17, module minted 2594cd44 2026-09-11) so it is an unmigrated residual, not a design choice; `grep helpers/registry-oracle\|helpers/load-row-harness` on the file → 0, the stated three-stage grep reproduces at 64 files; bug 0268 fixed (0.265.0), test 2 passed at HEAD, no gate/recording-double/red-test carve-out, no merge/rename/delete proposed; both locations under tests/, D7 boilerplate-duplication class; not a duplicate — no filed or resolved PTQ cites this file's registry read (PTQ-0427 resolved covers :173-326 makeHost/LoadPass symbols only, PTQ-0626 names b0268 only as a model), and the confirmed same-wave sibling d7-01 (:135-152 `normativeMessagePattern` body vs. compose-workspace-harness.ts) is a distinct root cause whose own triage note records d7-02 as separate; per the store's per-file registry-oracle convention (PTQ-0830, PTQ-0896 et al.) this is a distinct unremediated occurrence (triage: claude-fable-5-1)

## Fix attempts
- qw20260919162231: skipped — [PTQ-0914-bug0058-bug0100-local-parse-reimplements-parsedoc.md] PTQ-0914: Replaced both local parse wrappers with shared parseDoc; all tests and assertions retained. / PTQ-0916: Reused shared REGISTRY and RegistryRow; retained local message readers as triage permits. / PTQ-0917: Strengthened the assertion to require exactly one error note, retaining diagnostic and envelope checks. / PTQ-0918: Reused plantThetaWorkspace and disposeWorkspace in both files; fixture writes unchanged. No tests deleted. Required gate passed for all four issues: TypeScript clean, 689 test files and 11,586 tests passed. || [PTQ-0919-assertframestointernalerror-reimplements-assertinternalerror.md] PTQ-0919: Both framing helpers delegate to assertInternalError, preserving all four checks; no tests deleted or renamed. / PTQ-0921: Reused the canonical parse-registry reader and message lookup, retaining the non-empty-message guard; no tests deleted or renamed. / PTQ-0922: Replaced the inline pi/ctx double with makeHarness; discovery assertions remain unchanged; no tests deleted or renamed. / PTQ-0926: Shared thetaInput and driveBinder across all three files, preserving per-file parsing, contexts, and fixtures; no tests deleted or renamed. Required gate passed for all four fixes: tsc clean, 689 test files and 11,586 tests passed. ||
