---
id: PTQ-0742
title: watcher-terminated-recovery.test.ts reimplements tests/helpers/registry-oracle.ts's four-shard registry read locally instead of importing it
lens: D7
status: open
verdict: confirmed
locations:
  - tests/watcher-terminated-recovery.test.ts:63-81
  - tests/helpers/registry-oracle.ts:28-42
  - tests/helpers/registry-oracle.ts:45-46
sites: 1
fix_scope: localized
d4_class: clone
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 1
---

# watcher-terminated-recovery.test.ts reimplements tests/helpers/registry-oracle.ts's four-shard registry read locally instead of importing it

## Observation
`tests/watcher-terminated-recovery.test.ts` builds its own `REGISTRY`
constant by reading all four sharded diagnostics-registry pages
(`code-registry-parse.md`, `code-registry-load.md`, `code-registry-runtime.md`,
`code-registry-host.md`) off disk, joining their text, and parsing the result
through `parseRegistry` imported directly from `tools/code-registry/index.js`.
`tests/helpers/registry-oracle.ts` already exports `readRegistry(["parse",
"load", "runtime", "host"])` and a top-level `REGISTRY` constant built from
calling it with exactly that same four-shard array — its own header states
the module exists because this exact read "were redeclared byte-for-byte…
in several test files" (PTQ-0215). This file imports neither.

## Evidence
`tests/watcher-terminated-recovery.test.ts:63-81` (re-read immediately
before filing):
```ts
const REGISTRY_TEXT = [
  "code-registry-parse.md",
  "code-registry-load.md",
  "code-registry-runtime.md",
  "code-registry-host.md",
].map((page) =>
  readFileSync(
    fileURLToPath(
      new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url),
    ),
    "utf8",
  ),
).join("\n");

interface RegistryRow {
  code: string;
  message: string;
}

const REGISTRY = parseRegistry(REGISTRY_TEXT) as RegistryRow[];
```

`tests/helpers/registry-oracle.ts:28-42` (`readRegistry`, the module this
file never imports, performing the identical shard-list → per-shard
`readFileSync` → join → `parseRegistry` sequence):
```ts
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

`tests/helpers/registry-oracle.ts:45-46` (the exported `REGISTRY`, already
built from the identical four-shard array this file re-lists):
```ts
export const REGISTRY: readonly RegistryRow[] = readRegistry(["parse", "load", "runtime", "host"]);
```

## Why this is a problem
`readRegistry(["parse", "load", "runtime", "host"])` (or the module's
already-built `REGISTRY` export) performs byte-for-byte the same read this
file's own `REGISTRY_TEXT` construction does — same four shard names, same
`readFileSync`+`fileURLToPath`+`import.meta.url` pattern, same `join("\n")`,
fed to the same `parseRegistry`. A page-set or path change to the sharded
registry read has to be hand-applied here separately from the already-shared
module built to end exactly this redeclaration.

## Suggested direction (non-binding, optional)
`tests/helpers/registry-oracle.ts`'s exported `REGISTRY` constant already
holds the parsed rows this file re-derives locally; the local `REGISTRY_TEXT`
+ `parseRegistry` call could read off that shared export instead.

## False-positive check
- Gate-pin check: the file is not named `*gate*.test.ts` and is not one of
  the named gate kinds; not a census/pin gate.
- Recording-double check: `parseRegistry`/`registryMessage` parse a static doc
  page into rows; not a recording double and this finding does not touch any
  "never called" assertion.
- docs/bugs/ signature search: `grep -rl "registry-oracle" docs/bugs/*.md` →
  0 hits naming this file's local re-derivation as a documented
  correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "watcher-terminated-recovery" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any `it()`/`describe()` or file — only that the local `REGISTRY_TEXT` read could draw from the already-existing shared parse.
- Coverage check: the claim is about a repeated read-and-parse SEQUENCE that exists in this file today, not a missing test path.

## Triage
verdict: confirmed — independently re-verified: tests/watcher-terminated-recovery.test.ts:63-82 rebuilds the four-shard readFileSync+join+parseRegistry read byte-for-byte against tests/helpers/registry-oracle.ts:28-46 (the PTQ-0215 helper whose header exists to end this redeclaration), imports parseRegistry directly and never imports the helper (30 other test files do); the local REGISTRY is live (line 189-190, registryMessage which only does registry.find(row.code).message, so the helper's exported REGISTRY covers the need); not a gate test, no merge/rename/delete, no coverage-matrix citation; no existing PTQ names this file (PTQ-0404/0411/0412/0327 are per-file siblings of the same pattern for other files; PTQ-0150 is D2 on src/extension/watcher-recovery.ts) (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
