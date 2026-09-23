---
id: PTQ-1513
title: uppercase-pi-tool-name-refusal.test.ts hand-rolls its own two-shard registry read instead of the canonical REGISTRY it already imports a sibling export from
lens: D7
status: open
verdict: confirmed
locations:
  - tests/uppercase-pi-tool-name-refusal.test.ts:172-197
  - tests/helpers/registry-oracle.ts:1-11
  - tests/helpers/registry-oracle.ts:28-42
  - tests/helpers/registry-oracle.ts:83-84
sites: 1
fix_scope: localized
wave: qw20260923203928
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# uppercase-pi-tool-name-refusal.test.ts hand-rolls its own two-shard registry read instead of the canonical REGISTRY it already imports a sibling export from

## Observation
`tests/uppercase-pi-tool-name-refusal.test.ts` imports `expectedMessage` from `./helpers/registry-oracle` (line 1), a module whose own header comment states it centralises "the shared four-page diagnostics-registry read" because that read "were redeclared byte-for-byte ... in several test files", and which exports `REGISTRY` — the joined parse+load+runtime+host registry, already covering both pages this file needs. Instead of importing `REGISTRY` alongside `expectedMessage`, the file re-derives its own two separate single-page reads (`REGISTRY` for the load page, `PARSE_REGISTRY` for the parse page) using raw `readFileSync`/`fileURLToPath`/`new URL`, duplicating the exact read `registry-oracle.ts` was written to replace.

## Evidence
tests/uppercase-pi-tool-name-refusal.test.ts:172-197:
```
/** The live sharded load registry — the *Message* column DIAG-4 makes normative. */
const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL(
        "../docs/spec_topics/diagnostics/code-registry-load.md",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

// Bug 0320's fix moved `theta/parse/invoke-non-theta-extension` (a PARSE code)
// in front of the `.theta`-path arm's `resolveThetaCallee` call, so the C5 test
// below now needs the PARSE registry page's Message, not the LOAD page's.
const PARSE_REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL(
        "../docs/spec_topics/diagnostics/code-registry-parse.md",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];
```

tests/helpers/registry-oracle.ts:1-11, the module this file already imports `expectedMessage` from, stating the exact problem this duplication re-creates:
```
// The shared four-page diagnostics-registry read (PTQ-0215).
//
// WHY THIS FILE EXISTS. `RegistryRow` and the `REGISTRY` load it backs — read
// the four sharded registry pages (code-registry-{parse,load,runtime,host}.md),
// parse each through the real `parseRegistry`, and join the rows into one
// array — were redeclared byte-for-byte (confirmed via `diff`) in several test
// files. This module centralises that read, placeholder interpolation,
// pointer-message composition and the identical live-cell fragment assertions.
```

tests/helpers/registry-oracle.ts:83-84, the exported constant that already covers both pages:
```
/** The live four-page sharded registry — the input tests/code-registry.test.ts reconciles. */
export const REGISTRY: readonly RegistryRow[] = readRegistry(["parse", "load", "runtime", "host"]);
```

tests/helpers/registry-oracle.ts:171-181, `expectedMessage`'s own signature — it accepts any `Pick<RegistryRow, "code"|"message">[]`, so the canonical `REGISTRY` (a superset carrying both the load and parse pages this file needs) can be handed to it directly in place of both local re-reads:
```
export function expectedMessage(
  registry: readonly Pick<RegistryRow, "code" | "message">[],
  code: string,
  subs: Readonly<Record<string, string>>,
): string {
```

## Why this is a problem
The file redeclares the identical raw read (`readFileSync(fileURLToPath(new URL(...)))` piped into `parseRegistry`) that `registry-oracle.ts`'s own header names as the reason the module exists, and does it twice over — once per registry page — rather than importing the already-loaded, already-joined `REGISTRY` constant it sits one import line away from. Every use in this file of the local `REGISTRY`/`PARSE_REGISTRY` (`registryMessage(REGISTRY, INVALID_PI_TOOL_CODE)`, `expectedMessage(PARSE_REGISTRY, INVOKE_NON_THETA_EXTENSION_CODE, ...)`, etc.) would resolve identically against the canonical `REGISTRY`, since that constant is the join of all four shards including both pages this file reads separately.

## Suggested direction (non-binding, optional)
The two local reads could be replaced by importing `REGISTRY` from `./helpers/registry-oracle` alongside the already-imported `expectedMessage`, dropping the `readFileSync`/`fileURLToPath`/`parseRegistry` calls and the now-unneeded `PARSE_REGISTRY` split.

## False-positive check
- Gate-pin: the file is not `*gate*.test.ts` and does not assert a pinned count or inventory over the registry; the carve-out does not apply.
- Recording-double: no recording double or MUST-NOT witness is involved; the carve-out does not apply.
- docs/bugs/ search: `grep -ril "uppercase-pi-tool" docs/bugs/` finds only docs/bugs/0108-uppercase-pi-tool-name-mints-unspellable-callable.md, which documents the defect under test, not this registry-read construction; no correct-reason-red citation covers it.
- coverage-matrix/bug-doc citation search: `grep -rn "uppercase-pi-tool-name-refusal" docs/reference/coverage-matrix.md docs/bugs/*.md` finds no citation of this file or its local `REGISTRY`/`PARSE_REGISTRY` constants by name.
- Not a coverage claim: the read already exists and is exercised by every test in the file; the finding is about the duplicated construction of that read, not about a missing test.

## Triage
<!-- appended by triage -->
verdict: confirmed — re-verified: the two raw `parseRegistry(readFileSync(fileURLToPath(new URL(…code-registry-{load,parse}.md))))` reads are at uppercase-pi-tool-name-refusal.test.ts:172-197, next to the line-1 `expectedMessage` import from registry-oracle.ts, whose header (1-11), `readRegistry` (32-45) and `REGISTRY` (83-84) reproduce as cited; each of the 8 codes the file looks up (7 load, 1 parse) is on its page, and the four shards hold 252 unique codes (252 rows, 252 distinct), so the canonical oracle returns the same rows; not a duplicate — PTQ-1396 (fixed) removed the `parseExpectedMessage` helper, not these reads, and PTQ-0698/0739/0740 cover other harnesses; this is the same D7 boilerplate-duplication class as PTQ-0634; no gate, recording-double or red-citation carve-out applies, and no merge/rename/delete of a cited witness is proposed; fixer note: Group A's failure text names code-registry-load.md, so `readRegistry(["load"])` / `readRegistry(["parse"])` keep that page-specific pin, which the joined `REGISTRY` would loosen (triage: claude-opus-5-5)
