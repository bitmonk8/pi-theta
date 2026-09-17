---
id: PTQ-0577
title: subagent-placement-selection.test.ts re-parses the same four sharded diagnostics-registry pages that tests/helpers/registry-oracle.ts already reads and exports as REGISTRY
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/subagent-placement-selection.test.ts:34-39
  - tests/helpers/registry-oracle.ts:1-39
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# subagent-placement-selection.test.ts re-parses the same four sharded diagnostics-registry pages that tests/helpers/registry-oracle.ts already reads and exports as REGISTRY

## Observation
tests/subagent-placement-selection.test.ts imports `parseRegistry` and
`registryMessage` directly from `../tools/code-registry/index.js` and, at
module scope, re-reads the same four sharded registry pages
(`code-registry-{parse,load,runtime,host}.md`), in the same order, joined and
parsed through `parseRegistry`. `tests/helpers/registry-oracle.ts` already
performs and exports exactly this read via `readRegistry(shards)` and the
pre-built `REGISTRY` constant (`readRegistry(["parse", "load", "runtime",
"host"])`), but this file never imports from that helper module.

## Evidence

tests/subagent-placement-selection.test.ts:34-39 (re-read immediately before filing):
```ts
const REGISTRY = parseRegistry(
  ["code-registry-parse.md", "code-registry-load.md", "code-registry-runtime.md", "code-registry-host.md"]
    .map((page) =>
      readFileSync(fileURLToPath(new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url)), "utf8"),
    )
    .join("\n"),
) as { code: string; message: string; severity: string }[];
```

tests/helpers/registry-oracle.ts:1-39 — the already-exported equivalent,
covering the same four shards in the same order (re-read immediately before filing):
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

`REGISTRY` from `registry-oracle.ts` already reads `["parse", "load",
"runtime", "host"]` in that order — the same four shards, same order, as
this file's local array literal `["code-registry-parse.md",
"code-registry-load.md", "code-registry-runtime.md",
"code-registry-host.md"]`. This file's local anonymous type
(`code`/`message`/`severity`) is a 3-field subset of the helper's 6-field
`RegistryRow`, and every field this file reads
(`registryMessage(REGISTRY, code)` plus a direct `.find(row => row.code ===
...)` on `severity`) is present on the helper's export under the identical
name.

Exact search: `grep -l '\["code-registry-parse.md", "code-registry-load.md",
"code-registry-runtime.md", "code-registry-host.md"\]' tests/*.test.ts` → 7
files reproduce this identical array literal
(tests/b0261-envelope-parse-failed-message-prefix-registry.test.ts,
tests/b0385-key-placeholder-json-stringify.test.ts,
tests/missing-object-key-rendering.test.ts,
tests/subagent-placement-registry.test.ts,
tests/subagent-placement-selection.test.ts,
tests/subagent-root-registration-refusal-envelope.test.ts,
tests/subagent-wire-parse-failed-emitter.test.ts); this finding files only
the in-scope instance.

## Why this is a problem
This is the "Copy-paste fixtures/doubles" class: a fixture (the four-shard
joined diagnostics registry) is re-implemented in this file even though the
canonical helper for exactly that read — `tests/helpers/registry-oracle.ts`'s
`REGISTRY` (and its parameterised `readRegistry`) — already exists under that
name, reads the identical four pages in the identical order, and is not
imported here. The helper module's own header states its reason for
existing: "`RegistryRow` and the `REGISTRY` load it backs ... were
redeclared byte-for-byte (confirmed via `diff`) in several test files. This
module centralises that read only."

## Suggested direction (non-binding, optional)
`tests/helpers/registry-oracle.ts`'s `REGISTRY` export already carries the
same four shards this file re-reads; this file's own `registryMessage`/row
lookups (the part that varies per file, per that helper's own stated design)
could sit on top of the imported `REGISTRY` rather than a locally re-parsed
copy.

## False-positive check
- Gate-pin: `tests/subagent-placement-selection.test.ts` does not match
  `*gate*.test.ts` or any named kin; nothing here asserts a pinned count or
  inventory, so the census/pin carve-out does not apply.
- Recording-double: the cited code is a registry-page parse and lookup, not a
  fake/double that records calls to witness a MUST-NOT; not applicable.
- docs/bugs/ signature search: `grep -rl "subagent-placement-selection"
  docs/bugs/*.md` → 0 hits. Not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "subagent-placement-selection" docs/reference/coverage-matrix.md` → 0
  hits. This finding proposes no merge, rename, or deletion of the file or
  any of its `describe`/`it` blocks — only that the already-existing helper
  module's registry read could be reused in place of the locally retyped
  equivalent.
- Coverage check: the claim is entirely about a repeated fixture DEFINITION
  inside one file, not a missing test path.
- Overlap check: `grep -rl "subagent-placement-selection" quality/intake/*.md
  quality/resolved/*.md` → 0 hits before this filing; the sibling instance for
  a different file with this same array literal
  (tests/b0261-envelope-parse-failed-message-prefix-registry.test.ts) is
  already separately filed as
  qw20260917154546-d7-03-b0261-registry-oracle-reimplemented.md, whose
  locations list does not include tests/subagent-placement-selection.test.ts.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — re-verified independently: the local four-page parseRegistry read reproduces verbatim at tests/subagent-placement-selection.test.ts:34-39 and matches tests/helpers/registry-oracle.ts:31-45's REGISTRY (same pages, same order, same join; helper excerpt actually sits at :20-48, not :1-39 — tolerable drift), the file has 0 `helpers/registry-oracle` imports vs 30 test files that do, its only readers (registryMessage → code/message; .find on code/severity) are covered by RegistryRow and the looked-up code theta/load/subagent-placement-unavailable is on the load page REGISTRY joins; the 7-file array-literal grep reproduces; not a gate file, no docs/bugs or coverage-matrix citations; no open/resolved PTQ (0215/0222/0237/0250/0260/0275/0311/0313/0327/0404/0411/0412 cover other files) and sibling d7-03 cites only b0261 — same confirmed D7 copy-paste-fixture class (triage: claude-fable-5-1)
