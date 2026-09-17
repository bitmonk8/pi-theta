---
id: PTQ-0710
title: subagent-root-registration-refusal-envelope.test.ts and subagent-wire-parse-failed-emitter.test.ts both re-parse the four-shard diagnostics registry tests/helpers/registry-oracle.ts already exports as REGISTRY
lens: D7
status: open
verdict: confirmed
locations:
  - tests/subagent-root-registration-refusal-envelope.test.ts:112-126
  - tests/subagent-wire-parse-failed-emitter.test.ts:81-97
  - tests/helpers/registry-oracle.ts:19-40
sites: 2
fix_scope: cross-module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# subagent-root-registration-refusal-envelope.test.ts and subagent-wire-parse-failed-emitter.test.ts both re-parse the four-shard diagnostics registry tests/helpers/registry-oracle.ts already exports as REGISTRY

## Observation
Both in-scope files import `parseRegistry` directly from
`../tools/code-registry/index.js` and, at module scope, declare a local
`RegistryRow` interface and a local `REGISTRY` constant that reads the same
four sharded registry pages (`code-registry-{parse,load,runtime,host}.md`),
in the same order, joined and parsed the same way.
`tests/helpers/registry-oracle.ts` already performs and exports exactly this
read (its own header states it exists because this exact read "were
redeclared byte-for-byte … in several test files"), but neither of the two
in-scope files imports from it.

## Evidence

tests/subagent-root-registration-refusal-envelope.test.ts:112-126 (re-read
immediately before filing):
```ts
interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

/** The live sharded registry, read from the spec corpus exactly as the H5a gate reads it. */
const REGISTRY = parseRegistry(
  ["code-registry-parse.md", "code-registry-load.md", "code-registry-runtime.md", "code-registry-host.md"]
    .map((page) =>
      readFileSync(
        fileURLToPath(new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url)),
        "utf8",
      ),
    )
    .join("\n"),
) as RegistryRow[];
```

tests/subagent-wire-parse-failed-emitter.test.ts:81-97 (re-read immediately
before filing — the same four-shard array literal, same order, same
`readFileSync`/`fileURLToPath`/`.join("\n")` construction):
```ts
interface RegistryRow {
  readonly code: string;
  readonly severity: string;
  readonly phase: string;
  readonly message: string;
}

const REGISTRY = parseRegistry(
  ["code-registry-parse.md", "code-registry-load.md", "code-registry-runtime.md", "code-registry-host.md"]
    .map((page) =>
      readFileSync(
        fileURLToPath(new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url)),
        "utf8",
      ),
    )
    .join("\n"),
) as RegistryRow[];
```

tests/helpers/registry-oracle.ts:19-40 — the already-exported equivalent,
covering the same four shards in the same order (re-read immediately before
filing):
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

`readRegistry(["parse", "load", "runtime", "host"])` reads the identical
four pages in the identical order as both in-scope files' local array
literal. Every field either in-scope file's local `RegistryRow` reads
(`code`, `severity`, `phase`, `message`) is present on the helper's exported
6-field `RegistryRow` under the identical name.

## Why this is a problem
This is the "Copy-paste fixtures/doubles" class: the same fixture (the
four-shard joined diagnostics registry) is independently re-implemented in
two in-scope files even though the canonical helper for exactly that read —
`tests/helpers/registry-oracle.ts`'s `REGISTRY` (and its parameterised
`readRegistry`) — already exists under that name, reads the identical four
pages in the identical order, and is imported by neither file. The helper
module's own doc comment names this exact repetition as its reason for
existing.

## Suggested direction (non-binding, optional)
Both files' own `normativeMessage`/`registryRowOf`/`messagePrefixOf`
per-file readers (which already vary in wording and failure-message style
between the two files) could sit on top of the imported `REGISTRY` from
`tests/helpers/registry-oracle.ts` rather than a locally re-parsed copy in
each file.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named kin;
  the cited lines are a registry-page parse and a row-lookup constant, not a
  pinned count or inventory assertion.
- Recording-double check: the cited code is a registry-page parse and
  lookup, not a fake/double recording calls to back a MUST-NOT witness; not
  applicable.
- docs/bugs/ signature search: `grep -rl "REGISTRY = parseRegistry"
  docs/bugs/*.md` → 0 hits; neither file's governing bug doc (0178 for the
  first, 0086 for the second) calls for a per-file re-parse of the registry.
  Both bug docs are status "fixed" and neither file's header claims a
  documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "subagent-root-registration-refusal-envelope\|subagent-wire-parse-failed-emitter"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of either file or any of its `describe`/`it`
  blocks — only that the already-existing helper module's registry read
  could be reused in place of each file's locally retyped equivalent.
- Overlap check: `grep -rl "subagent-root-registration-refusal-envelope\|subagent-wire-parse-failed-emitter" quality/intake/*.md quality/resolved/*.md`
  (excluding this file) → hits only for unrelated topics
  (`resolvinghost-double-duplicated`, `PTQ-0192`, `PTQ-0343`, `PTQ-0003`,
  `PTQ-0011`, `PTQ-0211`), none of which names the registry-read
  duplication; the sibling finding
  `qw20260917154546-d7-03-b0261-registry-oracle-reimplemented.md` names the
  same canonical-helper root cause but cites a different file
  (`tests/b0261-envelope-parse-failed-message-prefix-registry.test.ts`) as
  its only location, not either file cited here.
- Coverage-drift check: the claim is about a repeated fixture-read
  DEFINITION, not a missing test path; every code path cited is exercised by
  each file's own passing tests.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — re-verified independently: both local RegistryRow + four-page parseRegistry reads reproduce verbatim at tests/subagent-root-registration-refusal-envelope.test.ts:112-127 and tests/subagent-wire-parse-failed-emitter.test.ts:81-97 and match tests/helpers/registry-oracle.ts:20-48's REGISTRY (same four shards, same order, same join; the helper's 6-field row is a superset of both local 2-/4-field rows and each file's readers only touch code/severity/phase/message); neither file imports `helpers/registry-oracle` (0 hits) vs 30 test files that do; every looked-up code (theta/load/unresolvable-theta-path, theta/load/binder-model-unresolved on code-registry-load.md:34,43; theta/runtime/subagent-wire-parse-failed on code-registry-runtime.md:29) sits on a page REGISTRY joins; neither is a gate file, 0 coverage-matrix hits, docs/bugs 0178/0086 are both status fixed and no merge/rename/delete is proposed; vitest 16/16 green; no open/resolved PTQ cites either file (0215/0222/0237/0250/0260/0275/0311/0313/0327/0404/0411/0412 cover other files) and same-wave siblings d7-02-subagent-placement-selection (explicitly excludes these two), d7-03-b0261 and d7-149-02 (driveOver, different root cause) cite disjoint sites — same confirmed D7 copy-paste-fixture class (triage: claude-fable-5-1)
