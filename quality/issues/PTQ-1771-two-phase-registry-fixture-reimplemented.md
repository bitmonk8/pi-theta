---
id: PTQ-1771
title: typed-two-phase-live.test.ts rebuilds the shared parse-registry fixture inline.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/typed-two-phase-live.test.ts:96-108
  - tests/typed-two-phase-live.test.ts:1275-1287
  - tests/helpers/load-row-harness.ts:49-55
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# typed-two-phase-live.test.ts rebuilds the shared parse-registry fixture inline.

## Observation
`tests/typed-two-phase-live.test.ts:96-108` reads and parses `code-registry-parse.md` inline to look up `EMPTY_ANNOTATION_MESSAGE`. `tests/helpers/load-row-harness.ts:49-55` already exports `PARSE_REGISTRY`, built by reading and parsing that same page. The test uses the resulting message as the expected diagnostic text at `tests/typed-two-phase-live.test.ts:1275-1287`; this filing concerns the duplicated fixture construction, not that diagnostic assertion.

## Evidence

`tests/typed-two-phase-live.test.ts:96-108` — the one in-scope inline fixture construction:

```ts
const EMPTY_ANNOTATION_MESSAGE = registryMessage(
  parseRegistry(
    readFileSync(
      fileURLToPath(
        new URL(
          "../docs/spec_topics/diagnostics/code-registry-parse.md",
          import.meta.url,
        ),
      ),
      "utf8",
    ),
  ),
  EMPTY_ANNOTATION_CODE,
```

`tests/helpers/load-row-harness.ts:49-55` — the existing shared fixture reads the same page through the same parser:

```ts
/** The single-page diagnostics registry several `b02xx` load harnesses share. */
export const PARSE_REGISTRY_PATH = "docs/spec_topics/diagnostics/code-registry-parse.md";

/** `code-registry-parse.md`, parsed once. */
export const PARSE_REGISTRY: readonly ParseCodeRegistryRow[] = parseRegistry(
  readFileSync(repoFile(PARSE_REGISTRY_PATH), "utf8"),
) as ParseCodeRegistryRow[];
```

`tests/typed-two-phase-live.test.ts:1275-1287` — the consumer needs the message from that page, not a separate registry-loading implementation:

```ts
    expect(
      errors.map((d) => d.code),
      "the fixture that used to drive the degraded arm now parses with exactly " +
        "the bug-0014 rejection",
    ).toEqual([EMPTY_ANNOTATION_CODE]);
    expect(
      EMPTY_ANNOTATION_MESSAGE,
      "the registry row exists (DIAG-2) — code-registry-parse.md",
    ).toBeDefined();
    expect(
      errors[0]!.message,
      "DIAG-4: the emitted message is the registry row's normative Message",
    ).toBe(EMPTY_ANNOTATION_MESSAGE);
```

## Why this is a problem
This is the D7 copy-paste-fixture class: the inline `readFileSync`/`parseRegistry` construction repeats an existing `tests/helpers/` fixture for the identical registry page. The duplicated code owns another spelling of the fixture path and its file-read/parser plumbing even though the assertion consumes only a row's message. The registry-derived oracle itself remains meaningful and is not a tautology or a request for different coverage. `tests/helpers/load-row-harness.ts` is the existing shared home for this exact single-page fixture.

## False-positive check
- **Gate-pin:** the scoped filename is not a gate or census test; the cited construction loads a diagnostic oracle rather than pinning an inventory. The code/message assertion at lines 1275-1287 is retained as evidence of the consumer, not challenged as a fixed-value assertion.
- **Recording-double:** neither cited registry construction is a recording double or a MUST-NOT witness.
- **docs/bugs/ signature search:** `rg -n 'registry-oracle|EMPTY_ANNOTATION_MESSAGE|parseRegistry' docs/bugs/0014-empty-typed-query-annotation-silent-unvalidated-bind.md` returned no matches. Bug 0014's residual witness discussion describes the degraded-source behavior, not a requirement to rebuild the registry fixture locally. No red or disabled test is being reported.
- **Coverage-matrix/bug-doc citation search:** `rg -n 'typed-two-phase-live' docs/reference/coverage-matrix.md` returned no matches. `rg -l 'typed-two-phase-live' docs/bugs/` returned bugs 0010, 0012, 0014, 0028, 0099, 0288, and 0291. In particular, bug 0014 cites the `(deg-live)` witness; this finding proposes no merge, rename, or deletion of that test or any other cited witness.
- **Existing-report check:** `rg -l 'EMPTY_ANNOTATION_MESSAGE' quality` returned no matches before filing. The reports returned by the scoped-filename search concern other harness/fixture definitions or behavioral witnesses; PTQ-0728 and PTQ-1344 concern the migrated session/model/AJV and respond-schema fixtures, not this registry fixture. PTQ-0718's registry-read locations are two other test files.
- **History intent:** `git log -1 --oneline -S 'EMPTY_ANNOTATION_MESSAGE' -- tests/typed-two-phase-live.test.ts` identifies `6ff550f7`, the bug-0014 parse-rejection fix. The retained registry-derived assertion agrees with that intent; the observation is limited to its fixture-loading implementation.
- **Coverage boundary:** no missing test, untested path, suite-composition change, production-code change, or runtime-risk claim is made.

## Triage
verdict: confirmed — Both excerpts reproduce: the inline reader parses the identical registry page already exported as PARSE_REGISTRY, and its only consumer needs the row's message; this is mechanical D7 fixture duplication, with no applicable carve-out, prescribed resolved shape, or existing report covering this site. (triage: claude-opus-5-5)
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
