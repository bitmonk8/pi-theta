---
id: PTQ-0558
title: invoke-depth-cycle.test.ts re-reads and re-parses the runtime/load registry shards instead of calling tests/helpers/registry-oracle.ts's readRegistry
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/invoke-depth-cycle.test.ts:45-61
  - tests/helpers/registry-oracle.ts:1-45
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# invoke-depth-cycle.test.ts re-reads and re-parses the runtime/load registry shards instead of calling tests/helpers/registry-oracle.ts's readRegistry

## Observation
tests/invoke-depth-cycle.test.ts builds its own `REGISTRY_TEXT` by mapping the two page names `"code-registry-runtime.md"` and `"code-registry-load.md"` through `readFileSync`/`fileURLToPath` against `../docs/spec_topics/diagnostics/${page}`, joins them with `"\n"`, declares its own local `RegistryRow` interface (`code`, `message`), and calls the real `parseRegistry` over the joined text to build its own `REGISTRY` constant. `tests/helpers/registry-oracle.ts` already exports `readRegistry(shards: readonly ("parse" | "load" | "runtime" | "host")[])`, documented as "Read only the requested shards, preserving page-specific registry oracles" — a call `readRegistry(["runtime", "load"])` reads the identical two pages through the identical `readFileSync`/`fileURLToPath`/`parseRegistry` sequence and returns the wider canonical `RegistryRow` (which is a structural superset of the file's own two-field local interface, since `registryMessage` only reads `code`/`message` off each row). This file does not import `registry-oracle.ts`.

## Evidence

tests/invoke-depth-cycle.test.ts:45-61 (re-read immediately before filing):
```ts
const REGISTRY_TEXT = ["code-registry-runtime.md", "code-registry-load.md"]
  .map((page) =>
    readFileSync(
      fileURLToPath(
        new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url),
      ),
      "utf8",
    ),
  )
  .join("\n");

interface RegistryRow {
  code: string;
  message: string;
}

const REGISTRY = parseRegistry(REGISTRY_TEXT) as RegistryRow[];
```

tests/helpers/registry-oracle.ts:26-45 — the canonical, already-exported equivalent parameterised exactly for this "only some shards" case (re-read immediately before filing):
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

`readRegistry(["runtime", "load"])` produces byte-identical input to `parseRegistry` as the in-scope file's own `REGISTRY_TEXT` build: both read `code-registry-runtime.md` then `code-registry-load.md` (same order) via the same `fileURLToPath(new URL(...))` construction (differing only in the `../` vs `../../` relative depth the two files' own locations require) and join with `"\n"`. The in-scope file's local `RegistryRow` (`code`, `message`) is exactly the two fields `registryMessage` reads off a row, so consuming the canonical six-field `RegistryRow` in its place changes nothing observable.

## Why this is a problem
`tests/helpers/registry-oracle.ts`'s own header states its `readRegistry` export exists because "`RegistryRow` and the `REGISTRY` load it backs... were redeclared byte-for-byte (confirmed via `diff`) in several test files," and it was written with a `shards` parameter precisely so a file needing fewer than all four pages — this file's exact case — still shares the read. `tests/invoke-depth-cycle.test.ts` reproduces the parameterised case (`["runtime", "load"]`) as its own inline re-derivation rather than the one-line `readRegistry(["runtime", "load"])` call, so a future change to the shard-file naming, the join separator, or the relative path construction must be mirrored here by hand.

## Suggested direction (non-binding, optional)
Replacing the file's local `REGISTRY_TEXT`/`RegistryRow`/`REGISTRY` block with `readRegistry(["runtime", "load"])` from `tests/helpers/registry-oracle.ts` is the one-line substitution the helper's own `shards` parameter was built for.

## False-positive check
- Gate-pin check: tests/invoke-depth-cycle.test.ts does not match `*gate*.test.ts` or its named kin; the cited lines are a registry read/parse setup, not a pinned count or inventory assertion.
- Recording-double check: `REGISTRY`/`parseRegistry` here back a message-template lookup (`expectedMessage`), not a recording double witnessing a MUST-NOT-called invariant; the negative-witness carve-out does not apply.
- docs/bugs/ signature search: this file's header cites the V15b invoke-depth-bound-and-cycle-detection obligation (invocation.md §INV-4, hard-ceilings ceilings-3-and-4.md CIO-2) rather than an open docs/bugs/ report; `grep -rl "invoke-depth-cycle" docs/bugs/*.md` → 0 hits. This finding is a static duplication claim over the registry-read setup, independent of any red/green cell state.
- coverage-matrix/bug-doc citation search: `grep -n "invoke-depth-cycle" docs/reference/coverage-matrix.md` → 0 hits; `grep -rl "invoke-depth-cycle" docs/bugs/*.md` → 0 hits. This finding proposes no merge, rename, or deletion of the file or any `it()` cell — only that its registry-read setup could call the existing helper.
- Overlap check against already-filed/resolved topics: `grep -rl "invoke-depth-cycle" quality/intake/*.md quality/resolved/*.md` → 0 hits before this filing; the several already-filed `registry-oracle`-shaped findings in this same wave (e.g. `qw20260917154546-d7-01-registry-oracle-read-duplicated-three-files.md`) each cite a disjoint set of files, none of which is `tests/invoke-depth-cycle.test.ts` — this is an additional, independent instance of the same helper-bypass pattern in a file none of them covers.
- Coverage-drift check: this finding is about test-support code that exists and runs; it makes no claim that any diagnostic code or path is untested.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: excerpt matches tests/invoke-depth-cycle.test.ts:45-61 verbatim; tests/helpers/registry-oracle.ts:36-50 `readRegistry` is live (30 importer files, subset-shard calls such as `readRegistry(["host"])` at acceptance-stderr-gate.test.ts:494 and `readRegistry(["parse"])` at alias-sink-array-element-check.test.ts:129 already use the parameter this way) and reads the same two pages in the same order joined with "\n"; `registryMessage` (tools/code-registry/index.js:88-90) reads only `code`/`message`, so the six-field canonical row is a drop-in superset of the local two-field interface; no PTQ or wave sibling cites this file's registry read (only D2 PTQ-0028/0295 on the src module) — copy-paste fixture class, in tests/ only; note the candidate's "docs/bugs → 0 hits" claim is inaccurate (docs/bugs/0354 cites the file's thetalibFnFrameKind cells at 222-240 as witnesses) but the finding proposes no merge/rename/delete of any cell so the witness-list carve-out does not apply (triage: claude-fable-5-1)
