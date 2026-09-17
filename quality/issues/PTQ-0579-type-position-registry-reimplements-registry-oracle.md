---
id: PTQ-0579
title: reserved-keyword-type-position.test.ts re-reads and re-joins all four registry pages instead of importing tests/helpers/registry-oracle.ts's REGISTRY
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/reserved-keyword-type-position.test.ts:116-135
  - tests/helpers/registry-oracle.ts:1-45
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# reserved-keyword-type-position.test.ts re-reads and re-joins all four registry pages instead of importing tests/helpers/registry-oracle.ts's REGISTRY

## Observation
tests/reserved-keyword-type-position.test.ts declares its own `RegistryRow`
interface and its own module-level `REGISTRY` constant, built by reading the
same four registry pages (`code-registry-{parse,load,runtime,host}.md`),
joining their text with `"\n"`, and calling the real `parseRegistry` over the
joined text. tests/helpers/registry-oracle.ts exists specifically to
centralise exactly this read — its own header comment states it exists
because "the shared four-page diagnostics-registry read … [was] redeclared
byte-for-byte … in several test files" — and exports both a parameterised
`readRegistry(shards)` function and a ready-built `REGISTRY` constant over
the same four shards in the same order. The reviewed file does not import
from `./helpers/registry-oracle`.

## Evidence
tests/reserved-keyword-type-position.test.ts:116-135:
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

tests/helpers/registry-oracle.ts:1-45 — the shared read this file was built
to centralise:
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
          fileURLToPath(
            new URL(`../../docs/spec_topics/diagnostics/code-registry-${shard}.md`, import.meta.url),
          ),
          "utf8",
        ),
      )
      .join("\n"),
  ) as RegistryRow[];
}

export const REGISTRY: readonly RegistryRow[] = readRegistry(["parse", "load", "runtime", "host"]);
```

Both reads name the same four pages in the same order
(`parse`, `load`, `runtime`, `host`), join the file contents with `"\n"`,
and feed the joined text through the same `parseRegistry` import
(`../tools/code-registry/index.js` / `../../tools/code-registry/index.js`,
the same module at different relative depths).

## Why this is a problem
tests/helpers/registry-oracle.ts's own header comment states its reason for
existing: this exact four-page read was "redeclared byte-for-byte … in
several test files", and the module was built so callers compose their own
message-reading logic on top of its exported `REGISTRY`/`readRegistry`
rather than re-parsing the pages themselves. The reviewed file's `REGISTRY`
constant is mechanically that same read — same four filenames, same order,
same join, same parse call — reconstructed locally instead of imported. Its
narrower local `RegistryRow` type (`code`, `message` only) is a subset of the
already-exported `RegistryRow` interface, so no additional field forced the
local reimplementation.

## Suggested direction (non-binding, optional)
Importing `REGISTRY` (or `readRegistry(["parse", "load", "runtime", "host"])`
if a distinct binding is wanted) from `tests/helpers/registry-oracle.ts`
supplies the same rows this file's local `REGISTRY` constant computes; the
file's own `msg`/`kw`/`named`/`voidLine` readers, which vary in assertion
wording from other files' readers, are unaffected and stay local per the
helper module's own stated design.

## False-positive check
- Gate-pin check: tests/reserved-keyword-type-position.test.ts does not
  match `*gate*.test.ts` or the named gate kin.
- Recording-double check: `REGISTRY` is a parsed static array read once at
  module load; it records no calls and backs no "never called" witness, so
  the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "REGISTRY = parseRegistry"
  docs/bugs/*.md` → 0 files; no open bug names this duplication or gives a
  documented correct-reason for a local re-read.
- coverage-matrix/bug-doc citation search: `grep -n
  "reserved-keyword-type-position" docs/reference/coverage-matrix.md` → 0
  hits. docs/bugs/0044-unresolved-named-type-fires-for-keyword-shaped-text.md
  cites this file by name and by row id (a1-a4, b-*, c1-c3, d1-d6, e1-e2,
  f1-f4, g1-g6, h1-h5, i1-i7) but never by `REGISTRY`'s construction; this
  finding proposes no change to any `it()`/`describe()` name, count, or
  assertion — only to where the parsed registry rows are read from.
- Existing-helper verification: tests/helpers/registry-oracle.ts was read in
  full above; its `readRegistry`/`REGISTRY` read the identical four
  filenames in the identical order, joined the identical way, and fed the
  identical `parseRegistry` function, confirmed by direct comparison against
  the reviewed file's inline construction.
- Prior-filing overlap check: `grep -rl "registry-oracle.ts\|REGISTRY = parseRegistry"
  quality/intake/*.md` finds many prior "registry-oracle-reimplemented"
  filings in this wave, none of which lists
  `tests/reserved-keyword-type-position.test.ts` in `locations:` (confirmed
  separately: neither this file nor
  `tests/reserved-keyword-remaining-identifier-positions.test.ts` appears in
  any existing intake filename or body other than the two `ajv()` builder
  findings, which target a different function).
- Coverage check: the claim is about a repeated data-load DEFINITION, not a
  missing test path; `REGISTRY` is read by every group in the file today.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — re-verified independently: the local RegistryRow + four-page `parseRegistry([...].map(readFileSync).join("\n"))` read reproduces verbatim at tests/reserved-keyword-type-position.test.ts:116-135 and is registry-oracle.ts:31-48's `readRegistry(["parse","load","runtime","host"])` / `REGISTRY` bar `../` depth and a 2-field subset row type; 0 `registry-oracle` imports in the file while 30 other tests import the helper; REGISTRY's three consumers (:225, :698, :722) all go through `registryMessage(REGISTRY, code)` so the exported constant is a drop-in; stated greps re-run (docs/bugs `REGISTRY = parseRegistry` → 0; coverage-matrix → 0; bug 0044 cites the file only as its 42-cell offline lock, untouched by relocating the load); not a gate, backs no recording double; 42/42 green at HEAD; no resolved PTQ (0215/0222/0237/0250/0260/0275/0311/0313/0404/0411/0412) cites this file, and wave sibling d7-04 targets the distinct `msg` reader at :218-239, not this load — same confirmed D7 copy-paste-fixture class as PTQ-0404/0411/0412 (triage: claude-fable-5-1)
