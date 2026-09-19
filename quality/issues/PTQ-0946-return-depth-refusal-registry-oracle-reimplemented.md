---
id: PTQ-0946
title: subagent-return-depth-refusal.test.ts re-parses the four-shard diagnostics registry instead of importing tests/helpers/registry-oracle.ts's REGISTRY
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/subagent-return-depth-refusal.test.ts:327-346
  - tests/helpers/registry-oracle.ts:20-42
sites: 2
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260918092852
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
fix_skips: 1
---

# subagent-return-depth-refusal.test.ts re-parses the four-shard diagnostics registry instead of importing tests/helpers/registry-oracle.ts's REGISTRY

## Observation
`tests/subagent-return-depth-refusal.test.ts` declares a local `RegistryRow`
interface (narrowed to the two fields the file's own `nonRepresentableMessage`
reader consumes) and a module-scope `REGISTRY` constant that reads the same
four sharded diagnostics-registry pages
(`code-registry-{parse,load,runtime,host}.md`), joins their text with
`"\n"`, and parses the join through the real `parseRegistry`.
`tests/helpers/registry-oracle.ts` already exports a `REGISTRY` built by the
identical four-shard read/join/parse sequence
(`readRegistry(["parse","load","runtime","host"])`), and that helper's own
header states it exists because this exact read "were redeclared
byte-for-byte (confirmed via `diff`) in several test files."
`tests/subagent-return-depth-refusal.test.ts` does not import that module —
it imports `parseRegistry`/`registryMessage` directly from
`../tools/code-registry/index.js` and re-performs the four-shard read
itself.

## Evidence

`tests/subagent-return-depth-refusal.test.ts:327-346` (re-read immediately
before filing):
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

`tests/helpers/registry-oracle.ts:20-42` — the canonical export, the same
four shard names in the same order, the same
`readFileSync`+`fileURLToPath`+`join("\n")`+`parseRegistry` sequence:
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

/** The live four-page sharded registry — the input tests/code-registry.test.ts reconciles. */
export const REGISTRY: readonly RegistryRow[] = readRegistry(["parse", "load", "runtime", "host"]);
```

Both blocks read the identical four pages in the identical order, join them
with `"\n"`, and hand the result to `parseRegistry`; the only functional
difference is that the in-scope file's local `RegistryRow` interface carries
only the two fields (`code`, `message`) its own `nonRepresentableMessage`
lookup consumes, versus the helper's full six-field row shape. Exact search:
`grep -n "^const REGISTRY = parseRegistry" tests/subagent-return-depth-refusal.test.ts`
→ the one hit at line 332; `grep -n "registry-oracle" tests/subagent-return-depth-refusal.test.ts`
→ 0 hits (no import of the helper module anywhere in the file).

## Why this is a problem
`tests/helpers/registry-oracle.ts`'s own header names the reason for its
existence: this exact "read the four sharded registry pages… parse each
through the real `parseRegistry`, and join the rows into one array"
sequence had already been "redeclared byte-for-byte… in several test files"
before being centralised, with each file's own narrower reader (its
`registryMessageOf`/`nonRepresentableMessage`-equivalent) left local by
design. `tests/subagent-return-depth-refusal.test.ts`'s `REGISTRY` constant
performs that exact same four-shard read independently rather than
importing the existing export — the same root cause the resolved
`PTQ-0707` finding fixed at the sibling file
`tests/subagent-invoke-nonfinite-return-refusal.test.ts` (which now imports
`REGISTRY` from `tests/helpers/registry-oracle.ts` and no longer performs
this read), left unmigrated at this file.

## Suggested direction (non-binding, optional)
`tests/helpers/registry-oracle.ts`'s exported `REGISTRY` already covers this
read; importing it (and keeping the file's own narrower
`nonRepresentableMessage` composition logic local, as the helper's design
already anticipates, and as the sibling file's PTQ-0707 fix already did) is
the direction the existing shared module points toward.

## False-positive check
- Gate-pin check: `tests/subagent-return-depth-refusal.test.ts` does not
  match `*gate*.test.ts` or any named kin; not applicable.
- Recording-double check: `REGISTRY`/`parseRegistry` is a static parsed-document
  read, not a recording double asserting a never-called invariant; the
  carve-out does not apply.
- docs/bugs/ signature search: `grep -n "REGISTRY\|registry" docs/bugs/0187-untyped-subagent-return-boundary-no-depth-ceiling.md`
  → the bug document's own header (quoted in this file's opening comment)
  states no registered `theta/*` diagnostic code exists for the depth
  refusal and that the file composes bug 0180's WITHIN-cap message (a
  different, already-shipped registry row) as a CONTROL fence — the
  duplicated four-shard read itself is unconditional and independent of
  which row's message is being composed.
- coverage-matrix/bug-doc citation search: `grep -n "subagent-return-depth-refusal" docs/reference/coverage-matrix.md`
  → 0 hits; `grep -rl "subagent-return-depth-refusal" docs/bugs/*.md` → only
  its own bug document (0187) and the sibling bug documents (0180, 0201) it
  builds on as CONTROL fences. This finding proposes no merge, rename, or
  deletion of the file or any `it()` cell — only that the four-shard
  registry read could be imported rather than redeclared — so no citation
  is affected.
- Duplicate-topic check: the resolved `PTQ-0707-04-nonfinite-return-refusal-registry-oracle-reimplemented.md`
  finding's `locations` field names only
  `tests/subagent-invoke-nonfinite-return-refusal.test.ts` (now fixed, and
  confirmed by direct read to import `REGISTRY` from
  `tests/helpers/registry-oracle.ts` at HEAD); `tests/subagent-return-depth-refusal.test.ts`
  was not filed as a location there. `grep -rli "subagent-return-depth-refusal"
  quality/issues quality/resolved quality/intake` → 0 hits for this specific
  registry-read root cause (the open `PTQ-0686` finding covers a different
  root cause in the same file — the `driveChildRoot` in-process envelope
  harness — and does not mention `REGISTRY`/`parseRegistry`).
- Coverage-drift check: this finding does not claim a missing test or an
  untested path; it identifies a duplicated registry-read constant, leaving
  the file's tests and assertions untouched.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/subagent-return-depth-refusal.test.ts:327-346 and tests/helpers/registry-oracle.ts:20-42; the in-scope block reads the same four shards in the same order, joins with "\n" and casts through the same `parseRegistry`, differing only in a two-field local `RegistryRow` narrowing that the helper's six-field row satisfies structurally; stated searches reproduce (`^const REGISTRY = parseRegistry` → :332 only; `registry-oracle` → 0 hits in the file; `REGISTRY` consumed at exactly one live site, :360 via `registryMessage(REGISTRY, code)`, a `row.code`/`.message` find identical to how the PTQ-0707-fixed sibling tests/subagent-invoke-nonfinite-return-refusal.test.ts:99/:137 already consumes the helper's export); git: the in-scope copy landed 940206cb 2026-08-19, the helper 2594cd44 2026-09-11, so this is an unmigrated pre-helper copy, not a born-diverged double; D7 boilerplate-duplication inside tests/, not a *gate*/tests/live file, no recording double, no merge/rename/delete proposed (coverage-matrix 0 hits; bug docs 0180/0187/0201 name the file as a witness only); not tracked — PTQ-0868 (open) and intake d7-11 cover the ADJACENT `nonRepresentableMessage` composer at :348-384, PTQ-0686 the driveChildRoot harness, and PTQ-0777/0830/0412/0710/0707 list other files, none this file's `REGISTRY` re-parse; the `d4_class: clone` line on a D7 filing is a harmless template stray (same as accepted PTQ-0707) (triage: claude-fable-5-1)

## Fix attempts
- qw20260919193904: skipped — [PTQ-0967-fnarg-letrhs-message-builders-duplicated.md] PTQ-0967: Shared six builder pairs through registry-oracle, preserving each file's failure wording. / PTQ-0971: Reused the shared AJV fixture at seven remaining sites; five were already deduplicated. Preserved the distinct production-slug fixture. / PTQ-0972: Replaced the local registry read with readRegistry(["parse"]), retaining the error-message path. / PTQ-0973: Imported shared at/render helpers at three remaining sites. No tests or assertions changed across any issue; the required tsc and full test gate passed (689 files, 11,586 tests). || [PTQ-0975-invoke-arg-array-literal-registry-read-not-migrated.md] PTQ-0975: Replaced local registry parsing with readRegistry(["parse"]); preserved error wording and all assertions. Required TypeScript/full-test gate passed. / PTQ-0977: Replaced duplicated two-page parsing with readRegistry(["parse", "load"]); preserved shard order and all assertions. Required gate passed. / PTQ-0978: Adopted shared production-load and workspace helpers; preserved per-call isolation and cleanup. No tests deleted or weakened. Required gate passed. / PTQ-0981: Imported shared diagLines and removed its local copy and unused types; all assertions preserved. Exact required gate passed: TypeScript clean, 689 test files and 11,586 tests passed. || [PTQ-0982-hexinvocationroot-reimplements-imported-rootdouble.md] PTQ-0982: Delegated hexInvocationRoot to rootDouble with an invocation-ID override; sequence behavior preserved. / PTQ-0983: Shared invokeArgMessage across all five triaged copies, preserving registry interpolation and failure checks. / PTQ-0984: Shared loweredParams across all eight triaged copies, preserving source construction and paths; affected live cell passed. / PTQ-0986: Imported the existing noopPi and removed its local duplicate. No tests or assertions removed across these fixes; required gate passed—TypeScript clean, 689 files and 11,586 tests green. ||
