---
id: PTQ-0707
title: subagent-invoke-nonfinite-return-refusal.test.ts re-parses the four-shard diagnostics registry instead of importing tests/helpers/registry-oracle.ts's REGISTRY
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/subagent-invoke-nonfinite-return-refusal.test.ts:146-165
  - tests/helpers/registry-oracle.ts:20-42
sites: 2
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# subagent-invoke-nonfinite-return-refusal.test.ts re-parses the four-shard diagnostics registry instead of importing tests/helpers/registry-oracle.ts's REGISTRY

## Observation
`tests/subagent-invoke-nonfinite-return-refusal.test.ts` declares a local `RegistryRow` interface and a module-scope `REGISTRY` constant that reads the same four sharded diagnostics-registry pages (`code-registry-{parse,load,runtime,host}.md`), joins their text, and parses it through `parseRegistry`. `tests/helpers/registry-oracle.ts` already exports a `REGISTRY` built by the identical four-shard read/join/parse sequence (`readRegistry(["parse", "load", "runtime", "host"])`), and its own header states it was created because this exact read "were redeclared byte-for-byte (confirmed via `diff`) in several test files." `subagent-invoke-nonfinite-return-refusal.test.ts` does not import that module.

## Evidence

`tests/subagent-invoke-nonfinite-return-refusal.test.ts:146-165`:
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

`tests/helpers/registry-oracle.ts:20-42` — the canonical export, the same four shard names, the same `readFileSync`+`fileURLToPath`+`join("\n")`+`parseRegistry` sequence:
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

Both blocks read the identical four pages in the identical order, join them with `"\n"`, and hand the result to `parseRegistry`; the only functional difference is that the in-scope file's local `RegistryRow` interface carries only the two fields (`code`, `message`) its own `registryMessage` lookup consumes, versus the helper's full six-field row shape.

## Why this is a problem
`tests/helpers/registry-oracle.ts`'s own header names the reason for its existence: this exact "read the four sharded registry pages… parse each through the real `parseRegistry`, and join the rows into one array" sequence had already been "redeclared byte-for-byte… in several test files" before being centralised, with each file's own narrower reader (its `registryMessageOf`/`registryRowOf`-equivalent) left local by design. `subagent-invoke-nonfinite-return-refusal.test.ts`'s `REGISTRY` constant performs that exact same four-shard read independently rather than importing the existing export.

## Suggested direction (non-binding, optional)
`tests/helpers/registry-oracle.ts`'s exported `REGISTRY` already covers this read; importing it (and keeping the file's own narrower `expectedRefusalMessage` composition logic local, as the helper's design already anticipates) is the direction the existing shared module points toward. This finding does not propose merging, renaming, or deleting any test in `tests/subagent-invoke-nonfinite-return-refusal.test.ts` — only relocating the duplicated registry read.

## False-positive check
- Gate-pin check: `tests/subagent-invoke-nonfinite-return-refusal.test.ts` does not match `*gate*.test.ts` or any named kin; not applicable.
- Recording-double check: `REGISTRY`/`parseRegistry` is a static parsed-document read, not a recording double asserting a never-called invariant; the carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0180-invoke-return-nonfinite-number-mode-variance.md's own header (quoted in this file's opening comment) states its fix is not yet landed and describes the registry row as part of "§Fix (b)" that "needs a registered code and its same-commit spec edits" — the file's `expectedRefusalMessage` helper explicitly handles the row's current absence with an `<unavailable: …>` marker rather than throwing, which is the documented correct-reason-red shape for the registry LOOKUP outcome, not for the registry READ this finding is about; the duplicated four-shard read itself is unconditional and unaffected by whether the specific row exists yet.
- coverage-matrix/bug-doc citation search: `grep -n "subagent-invoke-nonfinite-return-refusal" docs/reference/coverage-matrix.md` → 0 hits; `grep -rl "subagent-invoke-nonfinite-return-refusal" docs/bugs/*.md` → only its own bug document (0180). This finding proposes no merge, rename, or deletion of the file or any `it()` cell — only that the four-shard registry read could be imported rather than redeclared — so no citation is affected.
- Coverage drift check: this finding does not claim a missing test or an untested path; it identifies a duplicated registry-read constant, leaving the file's tests and assertions untouched.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: tests/subagent-invoke-nonfinite-return-refusal.test.ts:146-165 declares a local RegistryRow + four-shard REGISTRY (same pages, same order, same readFileSync/fileURLToPath/join("\n")/parseRegistry sequence) and does not import tests/helpers/registry-oracle.ts, whose header (PTQ-0215) names exactly this read as the centralised one and whose REGISTRY export is live (30 test importers); stated searches reproduce (0 coverage-matrix hits, only docs/bugs/0180 cites the file); no open/resolved PTQ cites this file for the registry read (PTQ-0404/0411/0412 name other files; PTQ-0011's mention is an unrelated clock param); D7 boilerplate-duplication inside tests/, no gate/red-test/citation carve-out applies (triage: claude-fable-5-1)
