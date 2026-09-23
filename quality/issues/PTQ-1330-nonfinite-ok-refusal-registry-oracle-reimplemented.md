---
id: PTQ-1330
title: subagent-envelope-nonfinite-ok-refusal.test.ts re-parses the four-shard diagnostics registry instead of importing tests/helpers/registry-oracle.ts's REGISTRY
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/subagent-envelope-nonfinite-ok-refusal.test.ts:190-210
  - tests/helpers/registry-oracle.ts:20-42
sites: 2
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# subagent-envelope-nonfinite-ok-refusal.test.ts re-parses the four-shard diagnostics registry instead of importing tests/helpers/registry-oracle.ts's REGISTRY

## Observation
`tests/subagent-envelope-nonfinite-ok-refusal.test.ts` declares its own local `RegistryRow` interface and module-scope `REGISTRY` constant, reading the same four sharded diagnostics-registry pages (`code-registry-{parse,load,runtime,host}.md`), joining their text, and parsing the result through `parseRegistry`. `tests/helpers/registry-oracle.ts` already exports a `REGISTRY` built by the identical four-shard read/join/parse sequence via its `readRegistry(["parse","load","runtime","host"])`, and its header states this exact read "were redeclared byte-for-byte (confirmed via `diff`) in several test files" before being centralised. The in-scope file already imports `composePointerMessage` from `./helpers/registry-oracle` in the same block but does not import its `REGISTRY`.

## Evidence

`tests/subagent-envelope-nonfinite-ok-refusal.test.ts:190-210`:
```ts
interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

/** The live sharded registry, read from the spec corpus exactly as the H5a gate reads it. */
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

`tests/helpers/registry-oracle.ts:20-42` — the canonical export, the same four shard names in the same order, the same `readFileSync`+`fileURLToPath`(via `repoFile`)+`join("\n")`+`parseRegistry` sequence:
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
```
`tests/helpers/registry-oracle.ts:81`: `export const REGISTRY: readonly RegistryRow[] = readRegistry(["parse", "load", "runtime", "host"]);`

Both sequences read the identical four pages in the identical order, join with `"\n"`, and hand the result to `parseRegistry`; the only functional difference is that the in-scope file's local `RegistryRow` interface narrows to the two fields (`code`, `message`) its own `registryMessage(REGISTRY, REFUSAL_CODE)` lookup consumes, versus the helper's full six-field row shape.

## Why this is a problem
`tests/helpers/registry-oracle.ts`'s own header names the reason for its existence: this exact four-shard read/join/parse sequence had already been redeclared byte-for-byte across several test files before being centralised into one export. The in-scope file redeclares that same sequence rather than importing the existing `REGISTRY`, even though it already imports a sibling export (`composePointerMessage`) from the same module in the same import statement.

## Suggested direction (non-binding, optional)
`tests/helpers/registry-oracle.ts`'s exported `REGISTRY` already covers this read; importing it alongside the already-imported `composePointerMessage` (and keeping the file's own narrower `registryMessage`/`expectedRefusalMessage` lookup logic local, as the helper's design already anticipates for callers with file-specific composition needs) is the direction the existing shared module points toward. This finding does not propose merging, renaming, or deleting any test in this file — only relocating the duplicated registry read.

## False-positive check
- Gate-pin check: `tests/subagent-envelope-nonfinite-ok-refusal.test.ts` does not match `*gate*.test.ts` or any named kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate, committed-fixture-parse-gate, registry-closed-set-corpus-gate); not applicable.
- Recording-double check: `REGISTRY`/`parseRegistry` is a static parsed-document read, not a recording double asserting a never-called invariant; the carve-out does not apply.
- docs/bugs/ signature search: `docs/bugs/0180-invoke-return-nonfinite-number-mode-variance.md` is this file's own bug document, cited throughout the file's header comment; its `refusalTemplate()` function (this file, above the cited lines) already handles the registry row's possible absence with a loud `throw` naming the unmet precondition — that is the documented correct-reason-red shape for the registry LOOKUP outcome, not for the registry READ this finding is about. The duplicated four-shard read itself is unconditional and independent of whether the specific row exists yet.
- coverage-matrix/bug-doc citation search: `grep -n "subagent-envelope-nonfinite-ok-refusal" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of the file or any `it()` cell — only that the four-shard registry read could be imported rather than redeclared — so no citation is affected.
- Duplicate-topic search: `quality/resolved/PTQ-0707-04-nonfinite-return-refusal-registry-oracle-reimplemented.md` covers the identical pattern but names a different file (`tests/subagent-invoke-nonfinite-return-refusal.test.ts`) and its own triage note explicitly scopes itself to "only this file's REGISTRY re-parse" (confirmed by re-reading that resolved finding's triage line). No filed or resolved finding names `tests/subagent-envelope-nonfinite-ok-refusal.test.ts`'s own `REGISTRY` re-parse; the file's other three previously-flagged duplications in this exact file (driveChildRoot/soleEnvelope harness — PTQ-0686; prompt-attach driver — PTQ-0687; pointer-message composer — PTQ-0868; realAjvValidator — PTQ-0971) are all already fixed, confirmed by re-reading the current imports, which pull `driveChildRoot`, `drivePromptAttach`, `composePointerMessage`, and `ajv as realAjvValidator` from their respective canonical helpers — but the REGISTRY constant itself was left behind.
- Coverage drift check: this finding does not claim a missing test or an untested path; it identifies a duplicated registry-read constant, leaving the file's tests and assertions untouched.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: tests/subagent-envelope-nonfinite-ok-refusal.test.ts:190-210 declares a local two-field RegistryRow + four-shard REGISTRY (same pages parse/load/runtime/host in the same order, same readFileSync/fileURLToPath/join("\n")/parseRegistry sequence; the local `../docs/...` URL and the helper's repoFile(`../../docs/...`) resolve to the same repo root) while already importing composePointerMessage from ./helpers/registry-oracle, whose header (PTQ-0215) names exactly this read as the centralised one and whose REGISTRY export is live (166 test files import from registry-oracle); REGISTRY is consumed only via registryMessage(REGISTRY, REFUSAL_CODE) at :223/:941, which the helper's six-field rows satisfy; stated searches reproduce (0 coverage-matrix hits; the only resolved findings naming this file — PTQ-0686/0687/0868/0971 — cover other harness pieces, PTQ-0868:173 explicitly excludes the REGISTRY re-parse, and PTQ-0707 names the sibling invoke file only); D7 boilerplate-duplication inside tests/, no gate/recording-double/red-test/citation carve-out applies (triage: claude-fable-5-1)
