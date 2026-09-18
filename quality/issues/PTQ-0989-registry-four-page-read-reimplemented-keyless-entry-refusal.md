---
id: PTQ-0989
title: inline-object-keyless-entry-refusal.test.ts re-parses the four-page sharded registry inline instead of importing tests/helpers/registry-oracle.ts's REGISTRY export
lens: D7
status: open
verdict: confirmed
locations:
  - tests/inline-object-keyless-entry-refusal.test.ts:176-196
  - tests/helpers/registry-oracle.ts:21-49
sites: 1
fix_scope: localized
wave: qw20260918155535
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# inline-object-keyless-entry-refusal.test.ts re-parses the four-page sharded registry inline instead of importing tests/helpers/registry-oracle.ts's REGISTRY export

## Observation
`tests/helpers/registry-oracle.ts` exports `readRegistry(shards)` and, built
from it, `REGISTRY: readonly RegistryRow[]` — the live join of
`code-registry-{parse,load,runtime,host}.md`, each page read with
`readFileSync`/`fileURLToPath` and parsed through `parseRegistry`, then
joined with `"\n"`. That module's own header states this centralisation was
done because the same four-page read "were redeclared byte-for-byte
(confirmed via `diff`) in several test files."
`tests/inline-object-keyless-entry-refusal.test.ts` does not import that
module; it declares its own module-scope `RegistryRow` interface and
`REGISTRY` constant that perform the identical read — the same four page
names in the same order, the same `readFileSync`/`fileURLToPath`
construction, the same `.join("\n")` — directly against `parseRegistry`
imported from `../tools/code-registry/index.js`.

## Evidence

`tests/inline-object-keyless-entry-refusal.test.ts:176-196` (re-read
immediately before filing):
```ts
interface RegistryRow {
  readonly code: string;
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

`tests/helpers/registry-oracle.ts:21-49` — the canonical export, reading the
identical four shards in the identical order through the identical
`parseRegistry`/`.join("\n")` construction:
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
...
/** The live four-page sharded registry — the input tests/code-registry.test.ts reconciles. */
export const REGISTRY: readonly RegistryRow[] = readRegistry(["parse", "load", "runtime", "host"]);
```

The reviewed file's own import block
(`tests/inline-object-keyless-entry-refusal.test.ts:1-9`) imports
`readFileSync`, `fileURLToPath` and `parseRegistry`/`registryMessage`
directly, with no import from `./helpers/registry-oracle`.

## Why this is a problem
The four-page read this file performs — same pages, same order, same join —
is exactly what `readRegistry(["parse", "load", "runtime", "host"])` already
computes and exports as `REGISTRY`, in a module created specifically to stop
this read from being redeclared per file. The in-scope file instead
re-parses the same four spec pages from a second, independent call site,
which must be kept in sync with the shard list and read order the helper
already owns whenever a fifth registry shard is added.

## Suggested direction (non-binding, optional)
Importing `REGISTRY` from `./helpers/registry-oracle` in place of the local
`parseRegistry(...)` call removes the second independent four-page parse;
the local two-field `RegistryRow` interface (a structural subset of the
helper's six-field `RegistryRow`) would need to narrow or be dropped, which
is a decision for the fix stage.

## False-positive check
- Gate-pin check: the file is not `*gate*.test.ts` and does not match the
  named gate kin (closing-gate, cross-cutting-gates,
  rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate); the cited lines are a registry read, not
  a pinned count or inventory.
- Recording-double check: `REGISTRY` is a static parsed array used to look
  up message templates; it records no calls and backs no "never called"
  witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rn "REGISTRY = parseRegistry"
  docs/bugs/0244-colon-less-inline-object-entry-silently-discarded.md
  docs/bugs/0256-generic-argument-stranded-entry-registers-permissive.md`
  → 0 hits; both bug docs discuss diagnostic codes and cell dispositions,
  never the registry-loading mechanism or a rationale for re-parsing it
  locally.
- coverage-matrix/bug-doc citation search: `grep -n
  "inline-object-keyless-entry-refusal" docs/reference/coverage-matrix.md`
  → 0 hits. Both bug docs cite this file by name and by cell/group id, never
  by the `REGISTRY` constant's construction; this finding proposes no
  change to any `it()`/`describe()` name, count, or assertion — only to
  where the registry read is sourced from.
- Coverage check: the claim is about a repeated four-page-read DEFINITION,
  not a missing test path; the local `REGISTRY` is exercised by every
  `registryMessageOf` call in the file.
- Prior-finding overlap check: `grep -rl "inline-object-keyless-entry-refusal"
  quality/issues quality/intake quality/resolved` returns PTQ-0596 (a
  disjoint `expectGroup` harness root cause), PTQ-0878 (a disjoint
  `envelope()` fragment-builder root cause), PTQ-0951 (the file's own
  throw-based `registryMessageOf` function body, ratified and narrowed to
  that function's shape — a different root cause from the `REGISTRY` read
  it is built on top of), PTQ-0555/PTQ-0205 (resolved, disjoint
  frontmatter-fixture and `diagLines` helpers). None of these five names
  `REGISTRY`, `readRegistry`, or `registry-oracle`, and the immediate
  sibling scope file `tests/inline-object-malformed-entry-resync.test.ts`'s
  identical read was filed and confirmed separately as PTQ-0867 — this
  finding is the same root cause's occurrence in the other in-scope file,
  not previously filed for this file.

## Triage
<!-- triage appends here -->
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/inline-object-keyless-entry-refusal.test.ts:176-196 and tests/helpers/registry-oracle.ts:21-49; the local `REGISTRY` reads the same four shards in the same order through the same readFileSync/fileURLToPath/parseRegistry/.join("\n") construction as the helper's exported `REGISTRY = readRegistry(["parse","load","runtime","host"])` (a mktemp node run of the four-page read yields 251 rows with the six-field row shape, of which the local two-field `RegistryRow` is a structural subset), the file imports `parseRegistry` directly (:5) and never `./helpers/registry-oracle` (0 hits; 137 sibling tests/*.test.ts do import it), the local copy is live with exactly one consumer (`registryMessage(REGISTRY, code)` :207 inside `registryMessageOf`, 2 call sites) so the swap is a green drop-in after which `readFileSync`/`fileURLToPath`/`parseRegistry` imports become unused (:1,:2,:5 — fixer should drop them); both locations under tests/, D7 boilerplate-duplication class, not a gate file, not a recording double, no it()/describe() touched; stated searches reproduce (docs/bugs 0244/0256 `REGISTRY = parseRegistry|registry-oracle` → 0, their only test-file mentions are committed-fixture-parse-gate; coverage-matrix → 0); file green 19/19; not a duplicate — the quality store cites this file only at :200-219 (PTQ-0951, the throw-shaped reader, narrowed by human ratification to that function), :334 and :794-799 (PTQ-0596/0878), never :176-196, PTQ-0867 covers the sibling malformed-entry-resync file only, and per-file residuals of the registry-oracle gap are the store's established granularity (PTQ-0830/0945/0972/0975) (triage: claude-fable-5-1)
