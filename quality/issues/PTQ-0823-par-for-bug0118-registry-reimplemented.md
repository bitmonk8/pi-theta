---
id: PTQ-0823
title: par-for.test.ts re-reads the four-page diagnostics registry inline instead of importing tests/helpers/registry-oracle.ts's REGISTRY/readRegistry
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/par-for.test.ts:372-390
  - tests/helpers/registry-oracle.ts:1-46
sites: 1
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# par-for.test.ts re-reads the four-page diagnostics registry inline instead of importing tests/helpers/registry-oracle.ts's REGISTRY/readRegistry

## Observation
`tests/par-for.test.ts` declares its own module-scope `BUG_0118_REGISTRY` constant that reads and parses the same four sharded diagnostics-registry pages (`code-registry-{parse,load,runtime,host}.md`) that `tests/helpers/registry-oracle.ts` already reads and exports as `REGISTRY` (via its exported `readRegistry` function). The reviewed file never imports anything from `./helpers/registry-oracle`; it re-implements the `readFileSync` + `fileURLToPath` + `parseRegistry` + `.join("\n")` read verbatim, then feeds it to a locally-named `registryMessageFor` wrapper.

## Evidence
`tests/par-for.test.ts:372-390`:
```ts
/**
 * The live registry, read from the spec corpus — the DIAG-4 message oracle for
 * this group (the same source, and the same reader, the production emitters'
 * messages are transcribed from).
 */
const BUG_0118_REGISTRY = parseRegistry(
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
```

`tests/helpers/registry-oracle.ts:1-46` (the canonical read this duplicates, whose own header states its reason for existing):
```ts
// The shared four-page diagnostics-registry read (PTQ-0215).
//
// WHY THIS FILE EXISTS. `RegistryRow` and the `REGISTRY` load it backs — read
// the four sharded registry pages (code-registry-{parse,load,runtime,host}.md),
// parse each through the real `parseRegistry`, and join the rows into one
// array — were redeclared byte-for-byte (confirmed via `diff`) in several test
// files. This module centralises that read only: each file's own
// `registryMessageOf` / `registryRowOf`-shaped reader — whose assertion style
// and wording vary per file — stays local, parameterised by the `REGISTRY` this
// module exports rather than by a locally re-parsed copy.
...
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry } from "../../tools/code-registry/index.js";
...
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
...
export const REGISTRY: readonly RegistryRow[] = readRegistry(["parse", "load", "runtime", "host"]);
```

Search run: `grep -n "registry-oracle" tests/par-for.test.ts` → 0 hits (the file imports `readFileSync`, `fileURLToPath`, and `parseRegistry` directly at lines 2, 3 and 6 instead). `grep -n "^import" tests/par-for.test.ts` confirms no import from `./helpers/registry-oracle`.

## Why this is a problem
`tests/helpers/registry-oracle.ts`'s own header states its sole purpose: the four-page `readFileSync`/`fileURLToPath`/`parseRegistry`/`join` read "were redeclared byte-for-byte … in several test files. This module centralises that read only." `tests/par-for.test.ts`'s `BUG_0118_REGISTRY` is exactly that read — same four page names, same URL-join pattern, same `parseRegistry` call, same `.join("\n")` — declared locally rather than obtained from the helper's exported `REGISTRY` constant or its `readRegistry` function, which the module's own header explicitly leaves free for exactly this purpose (only the file-local *reader* wrapper, e.g. `registryMessageFor`, is documented as intentionally staying local; the four-page *read* itself is what the module centralises).

## Suggested direction (non-binding, optional)
Importing `REGISTRY` from `tests/helpers/registry-oracle.ts` in place of the file's own `BUG_0118_REGISTRY` constant is the fit the helper's own stated purpose points to; the file's local `registryMessageFor` wrapper (parameterised by whichever registry value it receives) is unaffected by this observation, per the helper's own documented split between the shared read and the file-local reader shape.

## False-positive check
- Gate-pin carve-out: `tests/par-for.test.ts` is not a `*gate*.test.ts` file and asserts no pinned count/inventory this finding touches — `BUG_0118_REGISTRY` backs message lookups, not a pinned corpus count.
- Recording-double carve-out: `BUG_0118_REGISTRY` is a read-only data table, not a recording double or MUST-NOT-called witness; not applicable.
- docs/bugs/ signature search: `grep -rl "par-for.test.ts" docs/bugs` returns 17 bug documents naming this test file as a witness (0090, 0117, 0118, 0126, 0148, 0153, 0200, 0223, 0224, 0230, 0240, 0265, 0268, 0273, 0324, 0325, 0326); none of them prescribe or excuse keeping the four-page registry read local — `docs/bugs/0200-par-codes-missing-from-sharded-registry.md:848` cites `tests/par-for.test.ts` (95 cells) only to record it stayed green and byte-identical to HEAD across that bug's registry-shard edit, not to pin the file's internal `BUG_0118_REGISTRY` implementation.
- coverage-matrix/bug-doc citation search: `grep -n "par-for.test.ts" docs/reference/coverage-matrix.md` → no hits. This finding proposes no merge, rename, or deletion of the file or any test in it, only that the local four-page read could import the existing `REGISTRY` export instead of re-deriving it.
- Reference/callers check: `tests/helpers/registry-oracle.ts`'s `REGISTRY` export is live (imported by other test files per its own header's stated rationale); this is not a dead-export claim.
- Already-filed check: none of the wave's already-filed or resolved findings name `tests/par-for.test.ts` in connection with the registry-oracle helper (the three existing `par-for.test.ts` findings — PTQ-0483, PTQ-0629, PTQ-0692 — cover the separate `ParForHost`/`makeDeps`/`execDeps` runtime harness, not this parse-time registry read).

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: `BUG_0118_REGISTRY` reproduces verbatim at tests/par-for.test.ts:372-390 (parseRegistry + readFileSync/fileURLToPath over the same four code-registry-{parse,load,runtime,host}.md pages, `.join("\n")`), functionally identical to tests/helpers/registry-oracle.ts:30-48 `readRegistry`/`REGISTRY` (helper header states it centralises exactly this read; 128 test files already import it); `grep -n registry-oracle tests/par-for.test.ts` → 0 hits, imports at :2/:3/:6 confirm the direct read; the copy is live (`registryMessage(BUG_0118_REGISTRY, code)` at :436 backs ~25 `registryMessageFor` assertions) and the local reader wrapper is the part the helper documents as staying file-local, so only the read is the clone; both locations under tests/, D7 boilerplate-duplication class; not a gate file, 0 coverage-matrix hits, the 17 docs/bugs witnesses cite the file's cells not its registry read, no recording-double carve-out; dedupe: no PTQ in quality/issues or resolved names tests/par-for.test.ts for the registry read (PTQ-0483/0629/0692 are the ParForHost harness; PTQ-0777 is live-production-acceptance only), and per-file registry-oracle rereads are tracked as separate rows in this store — fix is the mechanical import of `REGISTRY` (triage: claude-fable-5-1)
