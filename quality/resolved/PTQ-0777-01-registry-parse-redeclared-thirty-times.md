---
id: PTQ-0777
title: tests/live/live-production-acceptance.test.ts redeclares the readFileSync+parseRegistry registry-page read thirty times instead of importing tests/helpers/registry-oracle.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/live/live-production-acceptance.test.ts:995-1006
  - tests/live/live-production-acceptance.test.ts:1562-1573
  - tests/live/live-production-acceptance.test.ts:1737-1748
  - tests/live/live-production-acceptance.test.ts:2059-2070
  - tests/live/live-production-acceptance.test.ts:2209-2220
  - tests/live/live-production-acceptance.test.ts:2379-2390
  - tests/live/live-production-acceptance.test.ts:2554-2565
  - tests/live/live-production-acceptance.test.ts:2750-2761
  - tests/live/live-production-acceptance.test.ts:2959-2970
  - tests/live/live-production-acceptance.test.ts:3165-3176
  - tests/live/live-production-acceptance.test.ts:3397-3408
  - tests/live/live-production-acceptance.test.ts:3572-3583
  - tests/live/live-production-acceptance.test.ts:3855-3866
  - tests/live/live-production-acceptance.test.ts:4252-4263
  - tests/live/live-production-acceptance.test.ts:4609-4620
  - tests/live/live-production-acceptance.test.ts:5066-5077
  - tests/live/live-production-acceptance.test.ts:5284-5295
  - tests/live/live-production-acceptance.test.ts:5826-5837
  - tests/live/live-production-acceptance.test.ts:6064-6075
  - tests/live/live-production-acceptance.test.ts:7605-7616
  - tests/live/live-production-acceptance.test.ts:8305-8316
  - tests/live/live-production-acceptance.test.ts:10681-10692
  - tests/live/live-production-acceptance.test.ts:11637-11648
  - tests/live/live-production-acceptance.test.ts:13242-13253
  - tests/live/live-production-acceptance.test.ts:13445-13453
  - tests/live/live-production-acceptance.test.ts:13660-13666
  - tests/live/live-production-acceptance.test.ts:13815-13826
  - tests/live/live-production-acceptance.test.ts:13978-13989
  - tests/live/live-production-acceptance.test.ts:14159-14166
  - tests/live/live-production-acceptance.test.ts:14328-14339
  - tests/helpers/registry-oracle.ts:1-40
sites: 30
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# tests/live/live-production-acceptance.test.ts redeclares the readFileSync+parseRegistry registry-page read thirty times instead of importing tests/helpers/registry-oracle.ts

## Observation
Thirty module-scope constants in this single file each independently read one
sharded diagnostics-registry page (`code-registry-parse.md` or
`code-registry-load.md`) off disk through `fileURLToPath(new URL(...,
import.meta.url))` + `readFileSync(..., "utf8")`, then parse it through the
same imported `parseRegistry` and cast the result to the same
`{ code: string; message: string }[]` shape. `tests/helpers/registry-oracle.ts`
already centralises exactly this read (`readRegistry(shards)` / the exported
`REGISTRY` constant, built for the stated purpose of ending this same
byte-for-byte redeclaration across test files — see its own header, "PTQ-0215"),
but this file imports `parseRegistry` directly from
`tools/code-registry/index.js` (line 59) and never imports
`tests/helpers/registry-oracle.ts`.

## Evidence
Exact search: `grep -n "= parseRegistry(" tests/live/live-production-acceptance.test.ts` → 30 hits (all 30 listed in `locations` above).

`tests/live/live-production-acceptance.test.ts:995-1006`:
```ts
const INVOKE_PATH_ESCAPE_REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../docs/spec_topics/diagnostics/code-registry-load.md",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];
```

`tests/live/live-production-acceptance.test.ts:1562-1573`:
```ts
const INTERPOLATED_RESULT_REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../docs/spec_topics/diagnostics/code-registry-parse.md",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];
```

`tests/live/live-production-acceptance.test.ts:2750-2761`:
```ts
const UNKNOWN_METHOD_CODE = "theta/parse/unknown-method";
const UNKNOWN_METHOD_REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../docs/spec_topics/diagnostics/code-registry-parse.md",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];
```

`tests/live/live-production-acceptance.test.ts:8305-8316`:
```ts
const UNKNOWN_VARIANT_CODE = "theta/parse/unknown-variant";

/** The sharded registry page carrying `theta/parse/unknown-variant`'s row. */
const UNKNOWN_VARIANT_REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../docs/spec_topics/diagnostics/code-registry-parse.md",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];
```

`tests/live/live-production-acceptance.test.ts:14159-14166`:
```ts
const CELL_D_REFUSAL_CODE = "theta/parse/annotation-type-not-expression";
const CELL_D_MISMATCH_CODE = "theta/parse/explicit-schema-mismatch";

/** The sharded registry page carrying both bug-0222 codes' rows. */
const CELL_D_REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];
```

`tests/helpers/registry-oracle.ts:1-40` — the module this file never imports,
whose own header states its purpose is exactly to end this redeclaration
("were redeclared byte-for-byte (confirmed via `diff`) in several test
files. This module centralises that read only"):
```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry } from "../../tools/code-registry/index.js";

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

## Why this is a problem
The same eleven-line disk-read-and-parse sequence — `fileURLToPath(new
URL("../../docs/spec_topics/diagnostics/code-registry-<shard>.md",
import.meta.url))` piped through `readFileSync` and `parseRegistry`, cast to
the identical inline `{ code: string; message: string }[]` shape — is written
out independently 30 times in one file, 28 of them reading the identical
`code-registry-parse.md` page and 2 reading `code-registry-load.md`. A module
already exists, already imported by other test files for this exact purpose
(per its own header), that reads all four shard pages once and exports the
parsed rows; this file bypasses it every single time instead.

## Suggested direction (non-binding, optional)
`tests/helpers/registry-oracle.ts`'s exported `REGISTRY` (or `readRegistry`)
already holds the parsed rows this file re-derives 30 times; each of the 30
local `*_REGISTRY` constants could read off that shared parse instead of
re-opening and re-parsing the same page.

## False-positive check
- Gate-pin check: the file is not named `*gate*.test.ts` and is not one of
  the named gate kinds (closing-gate, cross-cutting-gates,
  rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate); this is not a census/pin gate.
- Recording-double check: `parseRegistry`/`registryMessage` parse a static doc
  page into rows and read a message template; neither is a recording double
  and no assertion here is a "never called" witness, so the negative-witness
  carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "registry-oracle\|redeclared" docs/bugs/*.md` →
  0 hits; no open bug documents a rationale for this file re-parsing the
  registry pages locally rather than importing the shared helper.
- coverage-matrix/bug-doc citation search: `grep -n
  "live-production-acceptance" docs/reference/coverage-matrix.md` → 0 hits.
  Several `docs/bugs/*.md` files cite this test file as their live
  verification location, but none of them names or pins any of the 30
  `*_REGISTRY` constant declarations, and this finding proposes no change to
  any `it()`/`describe()` name, count, or assertion — only that the constants'
  own read could draw from the already-existing shared parse — so the
  citation carve-out does not bind.
- Coverage check: the claim is about a repeated read-and-parse SEQUENCE
  reimplemented 30 times inside one file, not about a missing test path;
  all 30 sites are exercised by the tests that already exist in this file.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: `grep -n "= parseRegistry("` yields exactly 30 module-scope constants at the cited lines (28 read code-registry-parse.md, 2 code-registry-load.md, all with the same readFileSync+fileURLToPath+`as { code; message }[]` shape; every constant has live consumers), the file imports parseRegistry from tools/code-registry/index.js:59 and never tests/helpers/registry-oracle.ts, whose header states it exists (PTQ-0215) to end exactly this redeclaration and whose readRegistry(shards) preserves the per-page oracle; tests/live/** already imports tests/helpers (e2e-s1 at line 55) so tier is no barrier; not a gate file, no coverage-matrix citation, no bug-doc rationale (bug 0123's sole "registry-oracle" hit is a test-group label); no prior registry-oracle PTQ (0215/0222/0237/0250/0260/0275/0311/0313/0327/0404/0411/0412) cites this file and in-wave sibling d7-99-03 targets the registryMessageOf substitution idiom, a distinct root cause — D7 boilerplate-duplication, mechanical dedupe (triage: claude-fable-5-1)
