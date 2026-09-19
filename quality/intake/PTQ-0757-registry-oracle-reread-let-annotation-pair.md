---
id: PTQ-0757
title: Two let-annotation test files re-parse the sharded diagnostics registry from disk instead of importing tests/helpers/registry-oracle.ts
lens: D7
status: intake
verdict: questionable
locations:
  - tests/let-annotation-inline-object-compat.test.ts:98-137
  - tests/let-annotation-query-double-emission.test.ts:53-78
sites: 2
fix_scope: localized
d4_class: parallel
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 2
---

# Two let-annotation test files re-parse the sharded diagnostics registry from disk instead of importing tests/helpers/registry-oracle.ts

## Observation
Both files independently import `parseRegistry`/`registryMessage` from
`../tools/code-registry/index.js`, `readFileSync` and `fileURLToPath`, and
build their own `REGISTRY` constant by reading the sharded
`docs/spec_topics/diagnostics/code-registry-*.md` pages and joining the raw
text before calling `parseRegistry`. `tests/helpers/registry-oracle.ts`
already exports exactly this read as `readRegistry(shards)` and a
pre-instantiated `REGISTRY` (all four shards joined), with a header comment
stating it exists because this exact read "were redeclared byte-for-byte …
in several test files." Neither file in this pair imports it.

## Evidence
tests/let-annotation-inline-object-compat.test.ts:98-137 (imports, then the reimplemented read):
```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
...
/** The live four-page sharded registry — the same input tests/code-registry.test.ts reconciles. */
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

tests/let-annotation-query-double-emission.test.ts:53-78 (the same shape, one shard):
```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
...
const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];
```

The canonical helper, tests/helpers/registry-oracle.ts:1-51 (in full):
```ts
// The shared four-page diagnostics-registry read (PTQ-0215).
...
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

Search: `grep -rln "helpers/registry-oracle" tests/` → 29 hits (other test files), confirming the helper is an actively-adopted canonical import, not a dead export.

## Why this is a problem
The read logic — join shard pages by name, `readFileSync` each through
`fileURLToPath(new URL(...))`, join with `\n`, call `parseRegistry` — is
reproduced byte-for-byte (module list aside) in both files under review,
duplicating exactly the sequence `tests/helpers/registry-oracle.ts`'s own
header comment names as the reason it was created ("redeclared byte-for-byte
… in several test files"). The four-shard case in
`let-annotation-inline-object-compat.test.ts` reproduces `readRegistry(["parse",
"load", "runtime", "host"])`'s body verbatim; the single-shard case in
`let-annotation-query-double-emission.test.ts` reproduces what
`readRegistry(["parse"])` already computes.

## Suggested direction (non-binding, optional)
Importing `REGISTRY` (or `readRegistry(["parse"])`) from
`tests/helpers/registry-oracle.ts` in place of each file's local read would
remove the duplicated read while leaving each file's own `templateOf`/message
lookup wording local, exactly as the helper's own docstring already
anticipates.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` naming; not applicable.
- Recording-double check: this is a fixture (registry data read), not a
  negative-witness double; not applicable.
- docs/bugs/ signature search: both files cite live, open bug docs
  (0130, 0093) for their *subject* diagnostics; the registry-read duplication
  is unrelated to either bug's pinned failure signature — no
  documented-correct-reason-red shape applies to this observation.
- coverage-matrix/bug-doc citation search: `grep -rn "let-annotation-inline-object-compat\|let-annotation-query-double-emission" docs/reference/coverage-matrix.md docs/bugs/` found no hits citing either file by name; this finding does not propose renaming, merging, or deleting either file, only its registry-read helper choice, so the citation question does not bind here regardless.
- Confirmed `tests/helpers/registry-oracle.ts` is not itself created for this wave (header cites PTQ-0215, already resolved) and is actively imported by 29 other test files, so its canonical status is not a coincidence of this review's scope.
- This is scoped to test code only (tests/), no production code touched.

## Triage
verdict: confirmed — independently re-verified: both REGISTRY blocks sit at the cited lines (compat :127-141 four-shard, double-emission :71-78 single-shard) and reproduce the readFileSync+fileURLToPath(new URL)+join("\n")+parseRegistry sequence tests/helpers/registry-oracle.ts:31-45 centralises (readRegistry(["parse"]) is a one-element join over the same page, result-identical; the helper's RegistryRow is a superset of both local {code; message} casts so registryMessage/templateOf still work); `grep -rln helpers/registry-oracle tests/` → 30 importers; no carve-out binds (neither file is a gate; bug docs 0093/0130 cite the files as whole witnesses and their "byte-identical" remarks are git-hash-object verification notes at fix time, not pins on the REGISTRY lines; no rename/merge/delete proposed); not a duplicate — all twelve open/resolved registry-oracle rows (PTQ-0215/0222/0237/0250/0260/0275/0311/0313/0327/0404/0411/0412) cite disjoint file sets, same-wave d7-01 covers tests/live/** and d7-70 the FM/TAIL/body triad in this pair (triage: claude-fable-5-1)
verdict: questionable — parked by the store: skipped by the fixer in 2 waves (see "## Fix attempts"); rule with accept --note <direction> or reject (store)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
- qw20260919104142: skipped — [PTQ-0757-registry-oracle-reread-let-annotation-pair.md] PTQ-0757: No longer reproduces; both files already use registry-oracle. No edits for this issue. / PTQ-0893: Shared the range-table harness through tests/helpers/e2e-s1.ts, retaining range guards, fixture paths, failure messages, and assertions. No tests deleted. / PTQ-0854: Shared the three delivery-count helpers through tests/helpers/compose-workspace-harness.ts, preserving raw counting and failure messages. No tests deleted or weakened. / PTQ-1059: Centralised the byte-exact host literal in tests/helpers/recording-system-note-channel.ts; all four files import it. No tests deleted. Required verification gate passed: TypeScript and all 11,585 tests across 689 files. | review unconfirmed: PTQ-0757-registry-oracle-reread-let-annotation-pair.md — no uncommitted working-tree change is attributable to it, so it is not credited to this fix; however the described problem is verifiably already gone at HEAD (13ad8266): tests/let-annotation-inline-object-compat.test.ts:97 imports REGISTRY from ./helpers/registry-oracle and tests/let-annotation-query-double-emission.test.ts:52,68 imports and calls readRegistry(["parse"]) — neither file reimplements the shard read anymore (the compat file's remaining readFileSync/fileURLToPath imports serve a live fixture read at :585, not a leftover). The issue file is stale; it can be closed on re-verification with no further code change. ||
- qw20260919114228: skipped — [PTQ-0757-registry-oracle-reread-let-annotation-pair.md] PTQ-0757: Already resolved at HEAD; both files use registry-oracle. No edits. / PTQ-0848: Shared constructor drive plumbing/readers through the existing helper, including the triage-added interpolation copy; preserved guards and assertions. No tests deleted. / PTQ-1013: Renamed the ternary test to describe its observed result; assertions unchanged. No citation updates needed. / PTQ-1015: Replaced all eight triage-identified double copies with one shared factory; preserved recordings, responses, and assertions. No tests deleted. Required gate passed: TypeScript and all 11,585 tests across 689 files. | review unconfirmed: PTQ-0757-registry-oracle-reread-let-annotation-pair.md — shed by the fixer (no working-tree change attributable to it), and correctly so: the described problem no longer exists at HEAD — tests/let-annotation-inline-object-compat.test.ts:97 imports REGISTRY from ./helpers/registry-oracle and tests/let-annotation-query-double-emission.test.ts:52,68 imports and calls readRegistry(["parse"]); neither file reimplements the shard read anymore. The issue file is stale and can be closed on re-verification with no code change. ||
