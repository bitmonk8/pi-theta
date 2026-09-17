---
id: PTQ-0678
title: Four-page registry parse re-declared in tests/reassign-rhs-type-compat.test.ts instead of importing tests/helpers/registry-oracle.ts
lens: D7
status: open
verdict: confirmed
locations:
  - tests/reassign-rhs-type-compat.test.ts:203-227
  - tests/helpers/registry-oracle.ts:17-40
sites: 1
fix_scope: localized
d4_class: clone
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# Four-page registry parse re-declared in tests/reassign-rhs-type-compat.test.ts instead of importing tests/helpers/registry-oracle.ts

## Observation
`tests/reassign-rhs-type-compat.test.ts` declares its own local `interface RegistryRow` and its own local `const REGISTRY = parseRegistry(...)` that reads and joins the same four sharded diagnostics-registry pages (`code-registry-{parse,load,runtime,host}.md`) via the same `readFileSync` / `fileURLToPath` construction that `tests/helpers/registry-oracle.ts` already exports as `RegistryRow` and `REGISTRY` (or the parameterised `readRegistry`). The file does not import from that helper module.

## Evidence

tests/reassign-rhs-type-compat.test.ts:203-227:
```ts
interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

/** The live four-page sharded registry, read from the spec corpus (DIAG-4). */
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

The canonical helper this bypasses, tests/helpers/registry-oracle.ts:17-40:
```ts
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

Exact search: `grep -n "interface RegistryRow" tests/reassign-rhs-type-compat.test.ts` (this review's scope is the six briefed files) confirms exactly one such local declaration, at the cited lines, in the reviewed set; the sibling in-scope file `tests/reassignment-binding-type-governs.test.ts` carries no such block (it uses `parseDoc`'s diagnostic codes directly, with no registry read at all).

## Why this is a problem
The `RegistryRow` shape and the exact four-shard `parseRegistry` join in `tests/reassign-rhs-type-compat.test.ts` reproduce `tests/helpers/registry-oracle.ts`'s exported `RegistryRow` interface and `REGISTRY` constant field-for-field and shard-for-shard, rather than importing them. `tests/helpers/registry-oracle.ts`'s own header comment states it was created specifically because this exact block "were redeclared byte-for-byte … in several test files"; this file is one more un-migrated instance of the pattern that helper exists to collapse. A drift in the shard list, the join separator, or the row shape would need a matching edit here that the helper's callers get for free.

## Suggested direction (non-binding, optional)
This file's own `registered()` reader (whose wording/throw-message is specific to this file) could stay local while its `REGISTRY` input is imported from `tests/helpers/registry-oracle.ts`, matching the split the helper's own comment already describes for its existing importers.

## False-positive check
- Gate-pin check: `tests/reassign-rhs-type-compat.test.ts` does not match `*gate*.test.ts` or any named gate kin; not applicable.
- Recording-double check: `REGISTRY` is a parsed data table read from committed spec corpus, not a recording double asserting a MUST-NOT-call; not applicable.
- docs/bugs/ signature search: `grep -rn "reassign-rhs-type-compat" docs/bugs/*.md` — 0 hits; the file's own header names docs/bugs/0115, whose text does not pin this registry-read block's shape as required to diverge from the shared helper.
- coverage-matrix/bug-doc citation search: `grep -n "reassign-rhs-type-compat" docs/reference/coverage-matrix.md` — 0 hits. This finding proposes no change to any `it()`/`describe()` name, count, or assertion — only that the local `REGISTRY` binding could be imported instead of re-parsed — so the citation carve-out does not bind.
- Prior-filing search: `grep -rl "reassign-rhs-type-compat" quality/intake quality/resolved` — 0 hits before this filing; the many other already-filed "registry-oracle-reimplemented" findings name a disjoint set of files (verified by name) and none cites this file.
- Coverage-drift check: the claim is about a repeated harness-read block that exists in the file today, not about any untested behaviour path.

## Triage
<!-- appended by triage -->
verdict: confirmed — re-verified independently: tests/reassign-rhs-type-compat.test.ts:203-227 reproduces exactly (own diff against registry-oracle.ts:20-45: RegistryRow byte-identical, REGISTRY the same four pages in the same order with the same "\n" join differing only in `../` depth vs the helper's readRegistry(["parse","load","runtime","host"])); 0 `helpers/registry-oracle` imports in the file vs 30 elsewhere in tests/; REGISTRY's only consumers are registryMessage() at :235 and a `.find` on row.code at :982, both satisfied by the helper's readonly RegistryRow[]; every looked-up code is theta/parse/* (on the parse shard the shared join covers); not a gate file, coverage-matrix 0 citations, bug 0115 never mentions parseRegistry/readFileSync/RegistryRow so pins no read mechanics; no PTQ or sibling intake cites this file (grep 0 hits) — same confirmed D7 copy-paste-fixture class as PTQ-0404/0411/0412; minor: stray d4_class field on a D7 filing, non-blocking (triage: claude-fable-5-1)
