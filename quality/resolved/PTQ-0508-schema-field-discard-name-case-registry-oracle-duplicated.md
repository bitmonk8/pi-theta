---
id: PTQ-0508
title: schema-field-discard-prefix-retention.test.ts and schema-field-name-case.test.ts each re-derive the RegistryRow/REGISTRY/msg registry-oracle harness instead of importing tests/helpers/registry-oracle.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/schema-field-discard-prefix-retention.test.ts:118-165
  - tests/schema-field-name-case.test.ts:163-206
  - tests/helpers/registry-oracle.ts:1-49
sites: 2                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# schema-field-discard-prefix-retention.test.ts and schema-field-name-case.test.ts each re-derive the RegistryRow/REGISTRY/msg registry-oracle harness instead of importing tests/helpers/registry-oracle.ts

## Observation
Both files independently declare a local `RegistryRow` interface, a
module-level `REGISTRY` constant built via `parseRegistry(readFileSync(...))`
over the `docs/spec_topics/diagnostics/code-registry-*.md` pages, and a
`msg(code, fills)` function with an identical body (read the template via
`registryMessage`, `expect(template).toBeDefined()`, then for each
placeholder assert `.toContain(placeholder)` and replace it). Neither file
imports `tests/helpers/registry-oracle.ts`, which already exports the same
`RegistryRow` shape and a `REGISTRY`/`readRegistry` built from the identical
four-shard `parseRegistry` read.

## Evidence

tests/schema-field-discard-prefix-retention.test.ts:118-165:
```ts
interface RegistryRow {
  readonly code: string;
  readonly severity: string;
  readonly phase: string;
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
...
function msg(code: string, fills: ReadonlyArray<readonly [string, string]>): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/code-registry-parse.md must carry the Message row for ${code}`,
  ).toBeDefined();
  let out = template as string;
  for (const [placeholder, value] of fills) {
    expect(
      out,
      `DIAG-4: the ${code} Message template must carry the ${placeholder} placeholder; template=${JSON.stringify(template)}`,
    ).toContain(placeholder);
    out = out.replace(placeholder, value);
  }
  return out;
}
```

tests/schema-field-name-case.test.ts:163-206 — the same shape, reading all
four shards instead of one, with the `msg` body byte-identical apart from the
assertion-message wording:
```ts
interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

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
...
function msg(code: string, fills: ReadonlyArray<readonly [string, string]>): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: the sharded registry under docs/spec_topics/diagnostics/ must carry the Message row for ${code}`,
  ).toBeDefined();
  let out = template as string;
  for (const [placeholder, value] of fills) {
    expect(
      out,
      `DIAG-4: the ${code} Message template must carry the ${placeholder} placeholder; template=${JSON.stringify(template)}`,
    ).toContain(placeholder);
    out = out.replace(placeholder, value);
  }
  return out;
}
```

tests/helpers/registry-oracle.ts:1-49, the canonical helper neither file
imports (its `REGISTRY` export is exactly the four-shard join
`schema-field-name-case.test.ts` re-derives locally):
```ts
// The shared four-page diagnostics-registry read (PTQ-0215).
...
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

Exact search: `grep -n "^interface RegistryRow\|^const REGISTRY = parseRegistry\|^function msg(code" tests/schema-field-discard-prefix-retention.test.ts tests/schema-field-name-case.test.ts` finds exactly these two declarations in each of the two in-scope files that build this pattern (`tests/schema-declarations.test.ts` and `tests/schema-lowering-hash.test.ts`, the other two files in this review's scope, declare no such block — they call the parser seams directly and assert literal message strings, so they are unaffected by this finding).

## Why this is a problem
Both files import `parseRegistry`/`registryMessage` directly from
`../tools/code-registry/index.js` and each re-derives the identical
read-parse-lookup-assert-placeholder-replace sequence rather than importing
`tests/helpers/registry-oracle.ts`'s `RegistryRow`/`REGISTRY`/`readRegistry`,
which already performs the same `parseRegistry` read over the same
`docs/spec_topics/diagnostics/code-registry-*.md` shards (the helper's own
header states it exists precisely because this read "were redeclared
byte-for-byte ... in several test files"). The `msg` function's body —
template lookup, definedness assertion, per-placeholder containment
assertion, substitution loop — is identical between the two files down to
variable names, differing only in the wording of the two assertion-failure
strings.

## Suggested direction (non-binding, optional)
Both files' `REGISTRY` construction could import `REGISTRY`/`readRegistry`
from `tests/helpers/registry-oracle.ts` instead of re-parsing the shard
files locally, leaving each file's own `msg` wording as-is; naming that
existing helper is observation, not a design for the change.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate).
- Recording-double check: `REGISTRY`/`msg` are read-only lookups over a
  static parsed document, not recording doubles backing a "never called"
  witness — the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -l "0133\|0149" docs/bugs/*.md` finds
  docs/bugs/0133-field-list-discard-recovery-unsettled.md and
  docs/bugs/0149-field-name-case-positions-unenforced.md, the bug documents
  each file's header cites; neither states a rationale for re-deriving the
  registry read locally rather than importing the shared helper — both
  files' own headers ("DIAG-4 ... no asserted message string is written out
  here") justify reading the *Message* from the registry at all, not
  re-parsing it per file.
- coverage-matrix/bug-doc citation search: `grep -n
  "schema-field-discard-prefix-retention\|schema-field-name-case"
  docs/reference/coverage-matrix.md docs/bugs/*.md` returns only each file's
  own self-reference inside its own bug document (as the fix's witness
  file); no cited `it()`/`describe()` name, count or assertion is proposed
  to change — only where the registry read is derived.
- Prior-filing overlap search: `grep -rl
  "schema-field-discard-prefix-retention\|schema-field-name-case"
  quality/intake/*.md quality/resolved/*.md` finds only
  qw20260917154546-d7-67-malformed-entry-resync-registers-reimplements-isloadparseerror.md,
  which is a different function (`registers`, re-deriving
  `isLoadParseError`) in a different file outside this review's scope that
  merely lists `schema-field-name-case.test.ts` among nine other files
  sharing that unrelated duplication; it does not cite or evidence the
  `RegistryRow`/`REGISTRY`/`msg` harness this finding is about. No other
  filed or resolved finding (including PTQ-0215, which created the helper
  this finding cites) names either of these two files.
- Coverage check: the claim is about a repeated harness DEFINITION, not a
  missing test path; both local `REGISTRY`/`msg` pairs are exercised by
  their own file's tests today.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — re-verified independently: all three excerpts reproduce at the exact cited lines (discard:118-165 two-field-plus RegistryRow + parse-page read + msg; name-case:163-206 RegistryRow + four-page join line-for-line identical to registry-oracle.ts:31-45 bar `../` depth + msg whose body differs only in one assertion string; helper :1-49 verbatim), the stated grep reproduces (3 hits per file, 0 in schema-declarations/schema-lowering-hash), neither file imports helpers/registry-oracle (30 other test files do), all 10 codes the discard file looks up are on code-registry-parse.md so readRegistry(["parse"]) covers the narrow read (single-page reads already ruled in per PTQ-0313/0404), both bug docs read fixed (0.203.0/0.82.0) with 104/104 vitest green so no documented-red carve-out, not a gate file, coverage-matrix cites neither, both files (2026-08-06/08-22) predate the helper (2026-09-11 in 2594cd44), and none of the ten resolved registry-oracle PTQs (0215/0222/0237/0250/0260/0275/0311/0313/0327/0404/0411/0412) nor the sibling d7-67/d7-157-02 intakes (which name schema-field-name-case only in an unrelated `registers`/isLoadParseError roster) cite these files — same D7 copy-paste-fixture class, mechanical dedupe (triage: claude-fable-5-1)
