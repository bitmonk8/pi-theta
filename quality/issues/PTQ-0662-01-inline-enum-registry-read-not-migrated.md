---
id: PTQ-0662
title: params-inline-enum-position-refusal.test.ts rebuilds the four-page RegistryRow/REGISTRY join tests/helpers/registry-oracle.ts already centralises
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/params-inline-enum-position-refusal.test.ts:124-148
  - tests/helpers/registry-oracle.ts:1-46
  - tests/params-inline-object-lowering.test.ts:1-16
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# params-inline-enum-position-refusal.test.ts rebuilds the four-page RegistryRow/REGISTRY join tests/helpers/registry-oracle.ts already centralises

## Observation
`tests/params-inline-enum-position-refusal.test.ts` declares its own local
`interface RegistryRow` (the full six-field shape: `code`, `namespace`,
`severity`, `phase`, `trigger`, `message`) and its own
`const REGISTRY = parseRegistry([...four pages].map(readFileSync...).join("\n"))`
read of the same four sharded diagnostics-registry pages
(`code-registry-parse.md`, `code-registry-load.md`, `code-registry-runtime.md`,
`code-registry-host.md`) that `tests/helpers/registry-oracle.ts` already reads
and exports as `REGISTRY`/`RegistryRow` for exactly this purpose. The file
imports `parseRegistry` and `registryMessage` directly from
`../tools/code-registry/index.js` instead of importing the pre-built
`REGISTRY` export. The other file in this same review's scope,
`tests/params-inline-object-lowering.test.ts`, imports `REGISTRY` from
`./helpers/registry-oracle` rather than re-declaring the join.

## Evidence
`tests/params-inline-enum-position-refusal.test.ts:124-148`:
```ts
interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

/** The live four-page sharded registry — the input tests/code-registry.test.ts reconciles. */
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

`tests/helpers/registry-oracle.ts:1-46` — the canonical export, whose header
states its own purpose ("`RegistryRow` and the `REGISTRY` load it backs …
were redeclared byte-for-byte … in several test files. This module
centralises that read only") and whose exported `RegistryRow`/`REGISTRY` are
the byte-identical six-field shape and four-page join the reviewed file
re-derives:
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

`tests/params-inline-object-lowering.test.ts:1-16` — the sibling file
reviewed in this same wave, already importing the canonical export instead of
re-declaring it:
```ts
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { registryMessage } from "../tools/code-registry/index.js";
import { REGISTRY } from "./helpers/registry-oracle";
```

Search: `grep -n "interface RegistryRow\|^const REGISTRY" tests/params-inline-enum-position-refusal.test.ts` → hits at lines 124 and 134, the block quoted above; `grep -n "registry-oracle" tests/params-inline-enum-position-refusal.test.ts` → 0 hits.

## Why this is a problem
The `RegistryRow` interface and the `REGISTRY` four-page join are harness
plumbing — how a test obtains the parsed diagnostics registry — not domain
logic specific to bug 0162. `tests/helpers/registry-oracle.ts` exists
specifically to hold this exact six-field shape and four-page join once; its
own header names "several test files" that redeclared it byte-for-byte as the
reason for its existence. The reviewed file's copy is not a divergent
variant needing independence (unlike, for example, the file's own
independently-justified slug-oracle helpers in the sibling file) — it is the
identical shape and the identical four pages, joined the identical way, with
no field the canonical export lacks.

## Suggested direction (non-binding, optional)
`tests/helpers/registry-oracle.ts` already exports a `REGISTRY` covering the
identical four pages and a `RegistryRow` of the identical shape; it is the
existing home the reviewed file's own `RegistryRow`/`REGISTRY` declarations
could import instead of rebuilding, the way this file's own sibling in the
same review scope already does.

## False-positive check
- Gate-pin check: the file does not match `*gate*.test.ts` or the named gate
  kin; not applicable.
- Recording-double check: the local `REGISTRY` is a static, parsed-once array
  read at module load; it records no call and backs no "never called"
  assertion.
- docs/bugs/ signature search: `grep -rl "params-inline-enum-position-refusal" docs/bugs/*.md` returns docs/bugs/0162-inline-enum-trigger-misses-params-position.md, which cites this file as its reproduction test, but only for the inline-enum trigger behaviour under test, not for the `RegistryRow`/`REGISTRY` declaration; the file's own diagnostic assertions (`registryMessageOf`) are unaffected by where the four-page join is defined.
- coverage-matrix/bug-doc citation search: `grep -n "params-inline-enum-position-refusal" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no change to any `it()`/`describe()` name, count, or assertion, only that the local registry read could import the existing export — so no citation is affected.
- Overlap check: grepped `quality/intake` and `quality/resolved` for
  "params-inline-enum-position-refusal" — no prior hit other than this
  review's own shard file. The related, already-resolved PTQ-0412
  (registry-row-four-page-join-duplicated) covers five different files
  (`annotation-root-brace-union-lowering.test.ts`,
  `inline-object-nested-lowering.test.ts`,
  `params-brace-union-rhs-lowering.test.ts`,
  `params-inline-object-lowering.test.ts`, `union-generic-arm-lowering.test.ts`)
  and does not name or cite the reviewed file; `tests/params-inline-object-lowering.test.ts`
  is confirmed already migrated (imports `REGISTRY` from `./helpers/registry-oracle`,
  re-read at lines 1-16 immediately before filing), consistent with that PTQ's
  "fixed" status — this finding is a distinct, not-yet-migrated instance in a
  file that PTQ did not cover.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: local RegistryRow (test:124-131) diffs byte-identical to registry-oracle.ts:21-28 and the local REGISTRY (test:134-148) joins the same four pages in the same order as the exported REGISTRY (helper:31-45, 30 importers in tests/), its sole consumer is registryMessage(REGISTRY, code) at :160 which the readonly export satisfies; 0 `registry-oracle` hits in the file, coverage-matrix 0 citations, bug 0162 names the file as witness without pinning its registry-read mechanics, not a gate file; none of the resolved registry-oracle PTQs (0215/0222/0237/0250/0260/0275/0311/0313/0327/0404/0411/0412) cite this file and the two sibling intake shards track diagLines, a distinct root cause — same confirmed D7 copy-paste-fixture class as PTQ-0327/0411/0412 (triage: claude-fable-5-1)
