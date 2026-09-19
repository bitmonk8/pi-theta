---
id: PTQ-0962
title: params-scalar-nontype-text-refusal.test.ts still reimplements the registry-oracle bundle instead of importing tests/helpers/registry-oracle.ts
lens: D7
status: intake
verdict: questionable
locations:
  - tests/params-scalar-nontype-text-refusal.test.ts:1-10
  - tests/params-scalar-nontype-text-refusal.test.ts:192-216
  - tests/helpers/registry-oracle.ts:14-46
sites: 1
fix_scope: localized
d4_class: clone
wave: qw20260918131151
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
fix_skips: 2
---

# params-scalar-nontype-text-refusal.test.ts still reimplements the registry-oracle bundle instead of importing tests/helpers/registry-oracle.ts

## Observation
`tests/params-scalar-nontype-text-refusal.test.ts` imports `parseRegistry` and
`registryMessage` directly from `../tools/code-registry/index.js` and declares
its own module-scope `interface RegistryRow` and `const REGISTRY =
parseRegistry(...)`, reading and joining the same four sharded diagnostics
pages (`code-registry-{parse,load,runtime,host}.md`) via the same
`readFileSync` / `fileURLToPath` construction that `tests/helpers/registry-
oracle.ts` already exports as `RegistryRow` and `REGISTRY`. The file does not
import from `./helpers/registry-oracle` anywhere. The sibling file in this
same review pair, `tests/params-default-unary-minus-non-numeric-refusal.test.ts`,
already imports `REGISTRY` and `RegistryRow` from that helper
(`import { REGISTRY, type RegistryRow } from "./helpers/registry-oracle";`,
line 1), so the un-migrated copy sits immediately beside a migrated sibling.

## Evidence

`tests/params-scalar-nontype-text-refusal.test.ts:1-10` (no import from
`./helpers/registry-oracle`; the registry bundle is built from the raw JS
module instead):
```ts
import { inlineDefName } from "./helpers/canonical-slug-oracle";
import { readFileSync, readdirSync } from "node:fs";
import { join, posix, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { EnumDecl, SchemaDecl, ThetaDocument } from "../src/parser/theta-document";
import { lowerQueryResponseSchema } from "../src/runtime/query-schema-lowering";
import { firstDiagnostic, expectParamsDropGateShape, parseDoc, diagLines, diagCodes } from "./helpers/e2e-s1";
```

`tests/params-scalar-nontype-text-refusal.test.ts:192-216` (the local
`RegistryRow` interface and `REGISTRY` construction, re-read immediately
before filing):
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

`tests/helpers/registry-oracle.ts:14-46` — the canonical helper this file
bypasses, which reads the identical four shards under the same field shape:
```ts
import { registryMessageOf } from "./load-row-harness";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry } from "../../tools/code-registry/index.js";

/** A parsed row of the sharded code registry, as `parseRegistry` yields it. */
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

Confirming the sibling in this same review scope is already migrated,
`tests/params-default-unary-minus-non-numeric-refusal.test.ts:1`:
```ts
import { REGISTRY, type RegistryRow } from "./helpers/registry-oracle";
```

Exact search: `grep -n "from \"./helpers/registry-oracle\"" tests/params-scalar-nontype-text-refusal.test.ts` returns 0 hits, confirming no partial import exists.

## Why this is a problem
The six-field `RegistryRow` interface and the four-page `parseRegistry(...
.map(readFileSync...).join("\n"))` construction are byte-for-byte the same
shape as `tests/helpers/registry-oracle.ts`'s already-exported `RegistryRow`
and `REGISTRY` (compare the two excerpts above field-for-field and line-for-
line: the four page names, the `readFileSync`/`fileURLToPath` call, and the
`.join("\n")` are identical). This is exactly the harness plumbing that
helper's own header comment states it exists to centralise ("were redeclared
byte-for-byte … in several test files. This module centralises that read").
The sibling file in this review's own pair already imports the helper for
this exact purpose, which shows the migration is mechanically available and
was simply not applied here.

## Suggested direction (non-binding, optional)
Replacing the local `interface RegistryRow` and `const REGISTRY = parseRegistry(...)`
block with `import { REGISTRY, type RegistryRow } from "./helpers/registry-oracle";`
— the same import the sibling file in this pair already uses — is the natural
next step, observationally.

## False-positive check
- Gate-pin check: `tests/params-scalar-nontype-text-refusal.test.ts` does not
  match `*gate*.test.ts` or the named gate-kin patterns (closing-gate,
  cross-cutting-gates, rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate); confirmed by filename inspection.
- Recording-double check: `REGISTRY`/`RegistryRow` are a static, parsed
  markdown-derived array and its row shape; they record no calls and back no
  "never called" witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -n "params-scalar-nontype-text-refusal"
  docs/bugs/*.md` hits `docs/bugs/0059-params-scalar-nontype-text-recorded-
  and-permissive.md`, which cites the file as its whole witness but names no
  specific line range or `it()` label tied to the `REGISTRY` declaration
  itself — this finding proposes no rename, merge or deletion of any cited
  test, only relocating the harness bundle's definition to an import.
- coverage-matrix citation search: `grep -n "params-scalar-nontype-text-
  refusal" docs/reference/coverage-matrix.md` → 0 hits.
- Prior-finding overlap check: `quality/issues/PTQ-0659-...md` (status: fixed)
  covers the identical `RegistryRow`/`REGISTRY` reimplementation pattern but
  names three different files (`params-default-trailing-residue-refusal.test.ts`,
  `params-default-type-compat.test.ts`, `params-default-unary-minus-non-
  numeric-refusal.test.ts` — the last being this pair's already-migrated
  sibling); `tests/params-scalar-nontype-text-refusal.test.ts` was not among
  the files that fix migrated, so this is a residual, un-migrated instance of
  the same landed pattern rather than a duplicate of PTQ-0659. A search of
  `quality/issues/*.md` and `quality/resolved/*.md` for
  "params-scalar-nontype-text-refusal" together with "REGISTRY = parseRegistry"
  or "interface RegistryRow" found no existing filing naming this file for
  this specific reimplementation (existing hits for this filename cover
  `registryMessageOf`'s throw wording (PTQ-0951, PTQ-0880), the local
  `diagLines`/`diagCodes` redeclaration (PTQ-0664, resolved), the inline slug
  oracle (PTQ-0665, resolved), the `sorted()` closure (PTQ-0793), the `Triage`
  fixture (PTQ-0653, PTQ-0666) and the drop-gate-shape assertion (PTQ-0803) —
  none of these cover the `RegistryRow`/`REGISTRY` declaration itself). A
  prior wave's session notes for this same file pair (quality/tmp/
  qw20260917154546/D7/shard-119.notes.txt) recorded no D7 findings but did not
  mention checking this specific bundle, and session notes are not a filed
  issue this brief instructs skipping.
- This is not a coverage claim: the finding is about code that exists (the
  duplicated bundle declaration), not about an untested path.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all three excerpts reproduce verbatim (target :1-10, :192-216; helper :14-46); mktemp `diff` of the two six-field `RegistryRow` interfaces (export-prefix stripped) reports zero differing lines and the local `REGISTRY` reads the same four shards parse/load/runtime/host the helper's exported `REGISTRY` reads; `grep helpers/registry-oracle` on the target exits 1 (no import) while the sibling params-default-unary-minus-non-numeric-refusal.test.ts:1 imports `{ REGISTRY, type RegistryRow }` from it; the local copy is live (registryMessageOf :224, registryRowOf :234); D7 boilerplate-duplication inside tests/, no gate-name match, no recording double, no merge/rename/delete of any docs/bugs/0059-cited cell, coverage-matrix grep → 0; not a duplicate — resolved PTQ-0659 lists three sibling files and 0 mentions of this file, PTQ-0412/0777 name other files, and the five open filings citing this file (PTQ-0653/0666/0793/0880/0951) cover the Triage fixture, sorted closure, registryMessageOf throw wording — none the `RegistryRow`/`REGISTRY` declaration at :192-216 (triage: claude-fable-5-1)
verdict: questionable — parked by the store: skipped by the fixer in 2 waves (see "## Fix attempts"); rule with accept --note <direction> or reject (store)

## Fix attempts
- qw20260919193904: skipped — [PTQ-0967-fnarg-letrhs-message-builders-duplicated.md] PTQ-0967: Shared six builder pairs through registry-oracle, preserving each file's failure wording. / PTQ-0971: Reused the shared AJV fixture at seven remaining sites; five were already deduplicated. Preserved the distinct production-slug fixture. / PTQ-0972: Replaced the local registry read with readRegistry(["parse"]), retaining the error-message path. / PTQ-0973: Imported shared at/render helpers at three remaining sites. No tests or assertions changed across any issue; the required tsc and full test gate passed (689 files, 11,586 tests). || [PTQ-0975-invoke-arg-array-literal-registry-read-not-migrated.md] PTQ-0975: Replaced local registry parsing with readRegistry(["parse"]); preserved error wording and all assertions. Required TypeScript/full-test gate passed. / PTQ-0977: Replaced duplicated two-page parsing with readRegistry(["parse", "load"]); preserved shard order and all assertions. Required gate passed. / PTQ-0978: Adopted shared production-load and workspace helpers; preserved per-call isolation and cleanup. No tests deleted or weakened. Required gate passed. / PTQ-0981: Imported shared diagLines and removed its local copy and unused types; all assertions preserved. Exact required gate passed: TypeScript clean, 689 test files and 11,586 tests passed. || [PTQ-0982-hexinvocationroot-reimplements-imported-rootdouble.md] PTQ-0982: Delegated hexInvocationRoot to rootDouble with an invocation-ID override; sequence behavior preserved. / PTQ-0983: Shared invokeArgMessage across all five triaged copies, preserving registry interpolation and failure checks. / PTQ-0984: Shared loweredParams across all eight triaged copies, preserving source construction and paths; affected live cell passed. / PTQ-0986: Imported the existing noopPi and removed its local duplicate. No tests or assertions removed across these fixes; required gate passed—TypeScript clean, 689 files and 11,586 tests green. ||
- qw20260919203448: skipped — [PTQ-0989-registry-four-page-read-reimplemented-keyless-entry-refusal.md] PTQ-0989: Reused shared REGISTRY; removed the local registry read, row type, and unused imports. No tests or assertions removed. / PTQ-0990: Replaced the handwritten message with loadRowMessage and interpolate; preserved the message assertion. / PTQ-0991: Imported the three canonical builders and folded the additional array-message copy named in triage; no tests renamed, deleted, or weakened. / PTQ-0993: Reused parseDoc(src, "probe.theta"), retaining both parse-precondition assertions. The required verification command passed: TypeScript and all 11,586 tests across 689 files. || [PTQ-0996-diaglines-reimplemented-stray-close-token-split.md] PTQ-0996: Imported shared diagLines; removed the duplicate and unused type imports. All tests retained. / PTQ-0997: Delegated msg to registryMessageOf, preserving the registry path and substitutions. All tests retained. / PTQ-0998: Imported shared parseDeps; removed the local builder and unused types. All tests retained. / PTQ-1001: Delegated unresolvedMessage to registryMessageOf, retaining the severity wrapper and gaining the placeholder guard. All tests retained. Required verification command passed verbatim for all four fixes: TypeScript clean; 689 test files and 11,586 tests passed. || [PTQ-1007-recordingcheckpoint-reimplements-noopcheckpoint-despite-impo.md] PTQ-1007: Replaced misleading local RecordingCheckpoint with SEAM_NOOP_CHECKPOINT, the current shared replacement for the retired NoopCheckpoint helper; assertions unchanged. / PTQ-1014: Removed local NoopCheckpoint/rootDouble definitions and imported shared rootDouble; assertions unchanged. / PTQ-1017: Removed local noopPi and imported the identical shared helper; assertions unchanged. / PTQ-1018: Imported shared parseDeps while preserving the local parse-clean check; assertions unchanged. All four fixes passed the required verbatim verification command: TypeScript check and 11,586 tests across 689 files. No tests were deleted. || [PTQ-1022-binder-forced-tool-dispatch-root-double-reimplemented.md] PTQ-1022: Root and capture setup now delegate to shared helpers, preserving fixture inputs; AJV was already shared. No tests or assertions removed. / PTQ-1027: Replaced local diagLines with the existing shared export and removed the unused type import. No tests or assertions removed. / PTQ-1028: Replaced local diagLines with the shared export and removed unused type imports. No tests or assertions removed. / PTQ-1029: Centralized reference-closure assertions in canonical-slug-oracle, preserving both failure messages. No tests or assertions removed. Prescribed gate passed for all fixes: TypeScript and all 11,586 tests in 689 files. ||
