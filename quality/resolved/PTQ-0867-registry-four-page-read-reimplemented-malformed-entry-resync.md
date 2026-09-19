---
id: PTQ-0867
title: inline-object-malformed-entry-resync.test.ts re-parses the four-page sharded registry inline instead of importing the REGISTRY export tests/helpers/registry-oracle.ts already carries
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/inline-object-malformed-entry-resync.test.ts:158-173
  - tests/helpers/registry-oracle.ts:31-49
sites: 1
fix_scope: localized
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# inline-object-malformed-entry-resync.test.ts re-parses the four-page sharded registry inline instead of importing the REGISTRY export tests/helpers/registry-oracle.ts already carries

## Observation
`tests/helpers/registry-oracle.ts` exports `readRegistry(shards)` and, built
from it, `REGISTRY: readonly RegistryRow[]` — the live join of
`code-registry-{parse,load,runtime,host}.md`, each page read with
`readFileSync`/`fileURLToPath` and parsed through `parseRegistry`, then
joined with `"\n"`. That module's own header states this centralisation was
done because the same four-page read "were redeclared byte-for-byte
(confirmed via `diff`) in several test files." `tests/inline-object-malformed-entry-resync.test.ts`
does not import that module; it declares its own module-scope `REGISTRY`
constant that performs the identical read — the same four page names, the
same `readFileSync`/`fileURLToPath` construction, the same `.join("\n")` —
directly against `parseRegistry` imported from `../tools/code-registry/index.js`.

## Evidence

`tests/helpers/registry-oracle.ts:31-49` (re-read immediately before
filing):
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

/** Fill the named discovery descriptors, leaving unknown placeholders intact. */
export function interpolate(template: string, subs: Record<string, string>): string {
```
(the `interpolate` line is the next export; the cited export itself ends at
line 45 and `REGISTRY` is declared at line 49 as
`export const REGISTRY: readonly RegistryRow[] = readRegistry(["parse", "load", "runtime", "host"]);`.)

`tests/inline-object-malformed-entry-resync.test.ts:158-173` (re-read
immediately before filing):
```ts
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

The reviewed file's own import block (`tests/inline-object-malformed-entry-resync.test.ts:1-9`)
imports `readFileSync`, `fileURLToPath` and `parseRegistry`/`registryMessage`
directly, with no import from `./helpers/registry-oracle`. The sibling file
in this same review's scope, `tests/inline-object-nested-lowering.test.ts:19`,
imports `REGISTRY` from that exact module
(`import { REGISTRY } from "./helpers/registry-oracle";`), showing the shared
export is reachable from this file family.

## Why this is a problem
The four-page read this file performs — same pages, same order, same join —
is exactly what `readRegistry(["parse", "load", "runtime", "host"])` already
computes and exports as `REGISTRY`, in a module created specifically to stop
this read from being redeclared per file. The reviewed file's own sibling in
this review's scope imports that export directly; this file instead
re-parses the same four spec pages from a second, independent call site.

## Suggested direction (non-binding, optional)
Importing `REGISTRY` from `./helpers/registry-oracle` in place of the local
`parseRegistry(...)` call removes the second independent four-page parse;
the local `RegistryRow` interface (a two-field subset of the canonical
`RegistryRow`) would need to narrow or widen to match, which is a decision
for the fix stage.

## False-positive check
- Gate-pin check: the file does not match `*gate*.test.ts` or the named gate
  kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate); the cited
  lines are a registry read, not a pinned count or inventory.
- Recording-double check: `REGISTRY` is a static parsed array used to look up
  message templates; it records no calls and backs no "never called"
  witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -n "REGISTRY" docs/bugs/0231-well-formed-field-behind-malformed-entry-unchecked.md`
  → 0 hits naming a rationale for re-parsing the registry locally rather than
  importing the shared read; the bug doc discusses diagnostic codes and cell
  dispositions, not the registry-loading mechanism.
- coverage-matrix/bug-doc citation search: `grep -n "inline-object-malformed-entry-resync"
  docs/reference/coverage-matrix.md` → 0 hits. docs/bugs/0231 cites this file
  by name as its §Fix (e) witness and by cell/group id, never by the
  `REGISTRY` constant's construction; this finding proposes no change to any
  `it()`/`describe()` name, count, or assertion — only to where the registry
  read is sourced from.
- Coverage check: the claim is about a repeated four-page-read DEFINITION,
  not a missing test path; the local `REGISTRY` is exercised by every `msg()`
  call in the file.
- Overlap check: `grep -rl "inline-object-malformed-entry-resync" quality/issues quality/intake quality/resolved`
  found PTQ-0555, PTQ-0596, PTQ-0574, PTQ-0653, PTQ-0691, PTQ-0753, none of
  which names `REGISTRY`, `readRegistry`, or `registry-oracle`; this is a
  distinct, previously untracked root cause. Note that this file's own local
  `msg(code, fills)` message-template reader intentionally parallels
  `registryMessageOf` (`tests/helpers/load-row-harness.ts`) — but
  `tests/helpers/registry-oracle.ts`'s own header states that per-file
  message-reader variation ("whose assertion style and wording vary per
  file") is the deliberate, accepted shape, provided the reader is
  "parameterised by the `REGISTRY` this module exports rather than by a
  locally re-parsed copy"; this finding is confined to the re-parsed `REGISTRY`
  itself, which that same header identifies as the actual duplication to
  avoid, and does not propose changing `msg()`'s wording or structure.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/inline-object-malformed-entry-resync.test.ts:158-173 and tests/helpers/registry-oracle.ts:31-49; the local `REGISTRY` reads the same four pages in the same order through the same readFileSync/fileURLToPath/parseRegistry/.join("\n") construction as `readRegistry(["parse","load","runtime","host"])` (differing only in `../` depth and filename-array vs shard-template spelling), the file imports `parseRegistry` directly (:5) and never `./helpers/registry-oracle` while sibling inline-object-nested-lowering.test.ts:6 imports `REGISTRY` from it; the local copy is live (consumed by `msg()` at :182), both locations under tests/, D7 boilerplate/copy-paste-fixture class, not a gate file, no recording-double or documented-red carve-out, stated searches reproduce (docs/bugs/0231 `REGISTRY` → 0; coverage-matrix file cite → 0), no cell rename/merge/delete proposed; dedupe: the registry-oracle family is ruled per file set (PTQ-0222/0237/0250/0260/0275/0311/0313/0404/0411/0508/0750/0757/0776/0777) and none of those nor the six PTQs naming this file (0555/0596/0753/0755/0759/0543/0727 — 0759 and resolved 0508 mention it only in unrelated rosters) cites its registry read — mechanical dedupe by importing `REGISTRY` (triage: claude-fable-5-1)
