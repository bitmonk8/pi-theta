---
id: PTQ-0581
title: b0261 re-parses the same four sharded diagnostics-registry pages that tests/helpers/registry-oracle.ts already reads and exports as REGISTRY
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0261-envelope-parse-failed-message-prefix-registry.test.ts:63-98
  - tests/helpers/registry-oracle.ts:1-39
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0261 re-parses the same four sharded diagnostics-registry pages that tests/helpers/registry-oracle.ts already reads and exports as REGISTRY

## Observation
tests/b0261-envelope-parse-failed-message-prefix-registry.test.ts imports
`parseRegistry` and `registryMessage` directly from `../tools/code-registry/index.js`
and, at module scope, re-declares a `RegistryRow` interface and re-reads the
same four sharded registry pages
(`code-registry-{parse,load,runtime,host}.md`), joined and parsed through
`parseRegistry`. `tests/helpers/registry-oracle.ts` already performs and
exports exactly this read — a `RegistryRow` interface, a `readRegistry(shards)`
function, and a `REGISTRY` constant reading the identical four shards in the
identical order — but this file never imports from that helper module.

## Evidence

tests/b0261-envelope-parse-failed-message-prefix-registry.test.ts:63-98:
```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import {
  mapEnvelopeParseFailure,
  mapWireParseFailure,
  SUBAGENT_ENVELOPE_PARSE_FAILED_CODE,
  SUBAGENT_WIRE_PARSE_FAILED_CODE,
} from "../src/runtime/subagent-envelope";
...
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

tests/helpers/registry-oracle.ts:1-39 — the already-exported equivalent,
covering the same four shards in the same order:
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
b0261's local array literal `["code-registry-parse.md", "code-registry-load.md",
"code-registry-runtime.md", "code-registry-host.md"]`. b0261's local
`RegistryRow` uses a 4-field subset (`code`/`severity`/`phase`/`message`) of
the helper's 6-field `RegistryRow`; every field b0261 reads
(`registryMessage(REGISTRY, code)` looks up rows by `code` and returns
`message`) is present on the helper's export under the identical name.

## Why this is a problem
This is the "Copy-paste fixtures/doubles" class: a fixture (the four-shard
joined diagnostics registry) is re-implemented in this file even though the
canonical helper for exactly that read — `tests/helpers/registry-oracle.ts`'s
`REGISTRY` (and its parameterised `readRegistry`) — already exists under that
name, reads the identical four pages in the identical order, and is not
imported here. The helper module's own header states its reason for existing:
"`RegistryRow` and the `REGISTRY` load it backs ... were redeclared
byte-for-byte (confirmed via `diff`) in several test files. This module
centralises that read only."

## Suggested direction (non-binding, optional)
`tests/helpers/registry-oracle.ts`'s `REGISTRY` export already carries the
same four shards this file re-reads; this file's own `messagePrefixOf` reader
(the part that varies per file, per that helper's own stated design) could
sit on top of the imported `REGISTRY` rather than a locally re-parsed copy.

## False-positive check
- Gate-pin: `tests/b0261-envelope-parse-failed-message-prefix-registry.test.ts`
  does not match `*gate*.test.ts` or any named kin; nothing here asserts a
  pinned count or inventory, so the census/pin carve-out does not apply.
- Recording-double: the cited code is a registry-page parse and lookup, not a
  fake/double that records calls to witness a MUST-NOT; not applicable.
- docs/bugs/ signature search: `docs/bugs/0261-envelope-parse-failed-message-diverges-from-registry.md`
  Status "fixed (0.249.0)"; `npx vitest run
  tests/b0261-envelope-parse-failed-message-prefix-registry.test.ts` → 5/5
  passed at HEAD. Not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0261-envelope-parse-failed-message-prefix-registry"
  docs/reference/coverage-matrix.md` → 0 hits; `grep -rl
  "b0261-envelope-parse-failed-message-prefix-registry" docs/bugs/` → only the
  bug's own document (0261), which cites the file by name (not by specific
  `it()` name) as its own witness, not a cross-citation from another bug's
  witness list. This finding proposes no merge, rename, or deletion of the
  file or any of its `describe`/`it` blocks — only that the already-existing
  helper module's registry read could be reused in place of the locally
  retyped equivalent.
- Coverage check: the claim is entirely about a repeated fixture DEFINITION
  inside one file, not a missing test path; every code path cited is exercised
  by the file's own 5 passing tests.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — re-verified independently: the local RegistryRow + four-page parseRegistry read reproduces verbatim at tests/b0261-envelope-parse-failed-message-prefix-registry.test.ts:82-98 and matches tests/helpers/registry-oracle.ts:20-48's REGISTRY (same four shards, same order, same join; the helper's 6-field row is a superset of the local 4-field one and registryMessage only reads code/message); the file has 0 `helpers/registry-oracle` imports vs 30 test files that do; both looked-up rows sit on code-registry-runtime.md:29-30, a page REGISTRY joins; not a gate file, 0 coverage-matrix hits, only docs/bugs/0261 (fixed 0.249.0) names the file and no merge/rename/delete is proposed; vitest 5/5 green; no open/resolved PTQ cites this file (0215/0222/0237/0250/0260/0275/0311/0313/0327/0404/0411/0412 cover other files) and same-wave siblings d7-02/d7-149-01 cite disjoint files — same confirmed D7 copy-paste-fixture class (triage: claude-fable-5-1)
