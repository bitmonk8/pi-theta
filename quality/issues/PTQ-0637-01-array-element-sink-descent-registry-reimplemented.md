---
id: PTQ-0637
title: nested-array-element-sink-descent.test.ts reimplements the registry-oracle read/render pair its own cited sibling already imports from tests/helpers/
lens: D7
status: open
verdict: confirmed
locations:
  - tests/nested-array-element-sink-descent.test.ts:1-8
  - tests/nested-array-element-sink-descent.test.ts:126-166
  - tests/alias-sink-array-element-check.test.ts:1-8
  - tests/alias-sink-array-element-check.test.ts:129-149
  - tests/helpers/registry-oracle.ts:18-45
  - tests/helpers/load-row-harness.ts:62-79
sites: 2
fix_scope: localized
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# nested-array-element-sink-descent.test.ts reimplements the registry-oracle read/render pair its own cited sibling already imports from tests/helpers/

## Observation
`tests/nested-array-element-sink-descent.test.ts` hand-declares a `RegistryRow`
interface, parses `code-registry-parse.md` itself via raw `parseRegistry(readFileSync(...))`,
and defines its own `msg()` template-fill function. The file's own header
comment names `tests/alias-sink-array-element-check.test.ts` as "the sibling
witness [that] states the same convention for this file" — and that sibling
already imports the single-page registry read from the canonical helper
`tests/helpers/registry-oracle.ts` (`readRegistry(["parse"])`) rather than
re-parsing the file by hand.

## Evidence
`tests/nested-array-element-sink-descent.test.ts:1-8` (no helper import; raw registry libs only):
```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaDocument } from "../src/parser/theta-document";
import { findCode, parseDoc } from "./helpers/e2e-s1";
```

`tests/nested-array-element-sink-descent.test.ts:126-149` (the hand-rolled read + oracle):
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

function msg(code: string, fills: ReadonlyArray<readonly [string, string]>): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
```

`tests/alias-sink-array-element-check.test.ts:4` (the cited sibling's import) and `:129,137`:
```ts
import { readRegistry } from "./helpers/registry-oracle";
...
const REGISTRY = readRegistry(["parse"]);
...
function msg(code: string, fills: ReadonlyArray<readonly [string, string]>): string {
```

`tests/helpers/registry-oracle.ts:18-45` (the canonical single/multi-page read the sibling calls):
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
```

`tests/helpers/load-row-harness.ts:62-79` (the canonical template-fill reader the file's `msg()` duplicates):
```ts
export function registryMessageOf(
  registry: readonly RegistryRow[],
  registryPath: string,
  code: string,
  fills: ReadonlyArray<readonly [string, string]> = [],
): string {
  const template = registryMessage(registry, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: ${registryPath} must carry the Message row for ${code}`,
  ).toBeDefined();
  let out = template as string;
  for (const [placeholder, value] of fills) {
    expect(
```

Search: `grep -n "readRegistry\|registryMessageOf" tests/*.ts` shows both helpers exist and are already imported by other files (e.g. `alias-sink-array-element-check.test.ts:4`); `tests/nested-array-element-sink-descent.test.ts` imports neither.

## Why this is a problem
The single-page registry parse-and-join sequence (`parseRegistry` + `readFileSync` + `fileURLToPath` + the `RegistryRow` shape) and the definedness-then-placeholder-fill template reader are both centralised in `tests/helpers/` today (`registry-oracle.ts`'s `readRegistry`, `load-row-harness.ts`'s `registryMessageOf`), and this file's own header comment points a reader at the sibling file that already imports the first of the two. Instead this file re-declares both from scratch, so a change to the read (e.g. the registry directory moving, or the definedness-assertion wording) has one more hand-copied site to update out of sync with the helper.

## Suggested direction (non-binding, optional)
The natural home for this file's `REGISTRY` line and `msg()` function is the same two helpers its cited sibling already imports — `readRegistry(["parse"])` and `registryMessageOf` — as an observation of where the duplication would collapse to, not a prescribed edit.

## False-positive check
- Gate-pin carve-out: this file is not `*gate*.test.ts` or named-kin; not applicable.
- Recording-double carve-out: `msg()` is a template renderer, not a negative-witness recording double; not applicable.
- docs/bugs/ signature search: the file documents bug 0241, which concerns the array-element-sink-descent defect itself, not this harness; no correct-reason-red claim is made or contradicted here.
- coverage-matrix/bug-doc citation search: `grep -rn "nested-array-element-sink-descent" docs/reference/coverage-matrix.md docs/bugs/` returned no hits naming this test file by name for its harness shape, so no citation is being contradicted; this finding does not propose renaming or deleting the test, only naming where its duplicated setup already lives.
- Confirmed the claim stays in test code: both cited helper files and the sibling file are under `tests/`; no production code is touched or judged.

## Triage
verdict: confirmed — independently re-verified: all excerpts reproduce at the cited lines (local two-field `RegistryRow` + single-page `parseRegistry(readFileSync(...code-registry-parse.md))` at :126-137, `msg()` at :143-158, header naming the sibling at :21-22); the file imports neither `readRegistry` nor `registryMessageOf` (grep 0, vs 28 test files importing one or both) while the cited sibling took `readRegistry(["parse"])` in PTQ-0404's fix c79a9039; all six looked-up codes are on the parse shard so the swap is mechanical; `msg()` is byte-identical to the sibling's and to load-row-harness `registryMessageOf` bar the closed-over `REGISTRY` and hardcoded registryPath; all locations in tests/, no gate/recording-double/failLoudly carve-out, bug 0241 and coverage-matrix pin no REGISTRY/msg mechanics (grep 0); not a duplicate — no issues/ or resolved/ PTQ names this file (0215/0222/0237/0250/0260/0275/0311/0313/0327/0404/0411/0412 cite disjoint sets; same-wave d7-03 only mentions it in a triage note); fixer note: registry-oracle.ts's PTQ-0215 header says per-file `registryMessageOf`-shaped readers "stay local" and PTQ-0404's fix left the sibling's `msg()` in place, so the read half is the confirmed class and collapsing `msg()` onto `registryMessageOf` is permitted, not required (triage: claude-fable-5-1)
