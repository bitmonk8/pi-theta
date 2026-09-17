---
id: PTQ-0484
title: Two files re-implement the single-shard code-registry read that tests/helpers/registry-oracle.ts already centralises
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/fn-call-arity-unchecked.test.ts:1-6
  - tests/fn-call-arity-unchecked.test.ts:131-142
  - tests/fn-param-annotation-optional.test.ts:1-6
  - tests/fn-param-annotation-optional.test.ts:314-326
  - tests/helpers/registry-oracle.ts:1-49
  - tests/alias-sink-array-element-check.test.ts:1-4
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# Two files re-implement the single-shard code-registry read that tests/helpers/registry-oracle.ts already centralises

## Observation
`tests/fn-call-arity-unchecked.test.ts` and `tests/fn-param-annotation-optional.test.ts` each declare their own `RegistryRow` interface and their own `REGISTRY` constant, reading `docs/spec_topics/diagnostics/code-registry-parse.md` off disk through `readFileSync` + `fileURLToPath` + the raw `parseRegistry` import. `tests/helpers/registry-oracle.ts` exists specifically to hold this read (its own header cites PTQ-0215 as the reason) and exposes `readRegistry(shards)` for exactly the single-shard case; `tests/alias-sink-array-element-check.test.ts` already consumes it as `readRegistry(["parse"])`.

## Evidence
tests/fn-call-arity-unchecked.test.ts:1-6:
```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic, SourceRange } from "../src/diagnostics/diagnostic";
```

tests/fn-call-arity-unchecked.test.ts:131-142:
```ts
interface RegistryRow {
  readonly code: string;
  readonly severity: string;
  readonly phase: string;
  readonly message: string;
}

const REGISTRY_PAGE = "docs/spec_topics/diagnostics/code-registry-parse.md";

const REGISTRY = parseRegistry(
  readFileSync(fileURLToPath(new URL(`../${REGISTRY_PAGE}`, import.meta.url)), "utf8"),
) as RegistryRow[];
```

tests/fn-param-annotation-optional.test.ts:1-6:
```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic, SourceRange } from "../src/diagnostics/diagnostic";
```

tests/fn-param-annotation-optional.test.ts:314-326:
```ts
interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
    ),
    "utf8",
  ),
) as RegistryRow[];
```

tests/helpers/registry-oracle.ts:1-49 (the canonical helper, in full — `readRegistry(shards)` reads exactly the shards requested and returns a `RegistryRow[]`, and its header states its whole purpose is eliminating this byte-for-byte re-parse):
```ts
// The shared four-page diagnostics-registry read (PTQ-0215).
//
// WHY THIS FILE EXISTS. `RegistryRow` and the `REGISTRY` load it backs — read
// the four sharded registry pages (code-registry-{parse,load,runtime,host}.md),
// parse each through the real `parseRegistry`, and join the rows into one
// array — were redeclared byte-for-byte (confirmed via `diff`) in several test
// files. This module centralises that read only...
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

The single-shard call shape this pair of files needed already exists and is already consumed elsewhere, tests/alias-sink-array-element-check.test.ts:4 and :129:
```ts
import { readRegistry } from "./helpers/registry-oracle";
...
const REGISTRY = readRegistry(["parse"]);
```

## Why this is a problem
Both files in scope read only the `parse` shard of the registry — the exact single-shard case `readRegistry(["parse"])` already serves, and already serves for another test file. Each instead re-derives the `readFileSync(fileURLToPath(new URL(...)))` + `parseRegistry(...)` read locally, together with its own `RegistryRow` shape. `tests/helpers/registry-oracle.ts`'s own header states this read was previously found redeclared byte-for-byte "in several test files" and was centralised for that reason; these two files reproduce the same read the helper was built to remove, rather than the row-specific reader logic (`row`/`msg`) the helper's header explicitly leaves local to each file.

## Suggested direction (non-binding, optional)
Parameterising these two files' `REGISTRY` constant on `readRegistry(["parse"])` from `tests/helpers/registry-oracle.ts` — as `tests/alias-sink-array-element-check.test.ts` already does — would remove the re-parsed read while leaving each file's own row/message-filling logic in place.

## False-positive check
Gate-pin: neither file matches `*gate*.test.ts` or the named gate-kin patterns; not a pinned-count census. Recording-double: no fake/double involved, this is a data read, not a MUST-NOT witness. docs/bugs/ signature search: `grep -l "REGISTRY_PAGE\|RegistryRow" docs/bugs/*.md` returned nothing relevant; neither file's read shape is cited as a documented correct-reason red. coverage-matrix/bug-doc citation search: `grep -rl "fn-call-arity-unchecked\|fn-param-annotation-optional" docs/reference/coverage-matrix.md docs/bugs/*.md` found no citation of either test file by name that would pin this exact code shape. Confirmed the claim is about existing duplicated code, not about a missing test (no coverage argument made). Confirmed via `grep -rl` of quality/intake and quality/resolved that no prior filing in this wave or before it names either `tests/fn-call-arity-unchecked.test.ts` or `tests/fn-param-annotation-optional.test.ts`.

## Triage
verdict: confirmed — re-verified independently: all four excerpts reproduce verbatim at the cited lines (fn-call-arity-unchecked:1-6 + 131-142 four-field RegistryRow + REGISTRY_PAGE parse-page read; fn-param-annotation-optional:1-6 + 314-326 two-field RegistryRow + inlined parse-page read), neither file imports tests/helpers/registry-oracle whose readRegistry(shards) (registry-oracle.ts:30-45) already serves the single-shard case and is consumed as readRegistry(["parse"]) at alias-sink-array-element-check.test.ts:4/129, every registry code either file looks up is theta/parse/* (the lone theta/load/ string at annotation-optional:476 is a startsWith prefix filter on emitted diagnostics, not a registry lookup) so the parse-only helper read covers every need, all locations in tests/, no gate/recording-double carve-out, bug docs 0131/0150 cite both files for behaviour only with no REGISTRY/parseRegistry line pin, coverage-matrix 0 hits; not a duplicate — no PTQ names either file and store precedent (PTQ-0250/0260/0327/0404/0411/0412) files per-file residuals of this registry-oracle gap separately; acceptor note: same-wave sibling d7-01-fn-arg-single-page-registry-oracle-duplicated (triaged confirmed) lists fn-call-arity-unchecked in its 22-file census but not in its locations and omits fn-param-annotation-optional entirely, so merge or keep separate at acceptance; fixer note: REGISTRY_PAGE at arity:138 is also read as an error-message string at :154/:174 and should survive as a string constant per the PTQ-0327 pattern (triage: claude-fable-5-1)
