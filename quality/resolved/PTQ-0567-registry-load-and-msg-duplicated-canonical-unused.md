---
id: PTQ-0567
title: All three reviewed files hand-parse code-registry-parse.md and redefine an identical msg() filler instead of the canonical tests/helpers/registry-oracle.ts read
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/fn-param-list-unclosed.test.ts:130-166
  - tests/fn-param-name-case.test.ts:115-151
  - tests/fn-param-name-reserved-keyword.test.ts:214-255
  - tests/helpers/registry-oracle.ts:19-40
sites: 3                     # count of occurrences cited in Evidence
fix_scope: cross-module       # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# All three reviewed files hand-parse code-registry-parse.md and redefine an identical msg() filler instead of the canonical tests/helpers/registry-oracle.ts read

## Observation
Each of the three reviewed files opens its DIAG-4 message-oracle section with
the same four-part construct: a local `RegistryRow` interface, a
module-scope `REGISTRY` constant built by
`parseRegistry(readFileSync(fileURLToPath(new
URL("../docs/spec_topics/diagnostics/code-registry-parse.md",
import.meta.url)), "utf8"))`, and a `msg(code, fills)` function whose body —
look up the template, assert it is defined, assert and fill each named
placeholder — is byte-identical in all three (file1's signature alone adds a
default `= []` for `fills`). tests/helpers/registry-oracle.ts already
centralises exactly this read (created to fix PTQ-0205's sibling class,
"the shared four-page diagnostics-registry read... redeclared byte-for-byte...
in several test files") and exports a `REGISTRY` covering the `parse` shard
these three files need, plus a `readRegistry(["parse"])` entry point for
callers who want only that shard. None of the three imports it.

## Evidence
tests/fn-param-list-unclosed.test.ts:130-142:
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

tests/fn-param-name-case.test.ts:115-127 (the identical construct):
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

tests/fn-param-name-reserved-keyword.test.ts:214-227 (the identical
`readFileSync`/`parseRegistry` call, `RegistryRow` widened by one field to
carry `severity` for its own `r1` row-severity assertion):
```ts
interface RegistryRow {
  readonly code: string;
  readonly severity: string;
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

tests/helpers/registry-oracle.ts:19-40 — the canonical shard read this
duplicates, exporting the `parse` shard (among others) as `readRegistry`:
```ts
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
```

The downstream `msg(code, fills)` function is additionally byte-identical
across all three files: `diff <(sed -n '151,166p'
tests/fn-param-list-unclosed.test.ts | tail -n +2) <(sed -n '136,151p'
tests/fn-param-name-case.test.ts | tail -n +2)` → no output, and the same
diff between fn-param-name-case.test.ts's `msg` (136-151) and
fn-param-name-reserved-keyword.test.ts's `msg` (240-255) → no output; only
the three signature lines differ (file1 default-parameterises `fills`, the
other two require it).

Exact search: `grep -rln
'readFileSync.*code-registry-parse\.md\|fileURLToPath.*code-registry-parse'
tests/fn-param-list-unclosed.test.ts tests/fn-param-name-case.test.ts
tests/fn-param-name-reserved-keyword.test.ts` → all 3 files match; `grep -n
"registry-oracle" tests/fn-param-list-unclosed.test.ts
tests/fn-param-name-case.test.ts tests/fn-param-name-reserved-keyword.test.ts`
→ 0 hits in all three.

## Why this is a problem
The read construct and the message-filling logic are the same harness
concern in every file — "get this code's registry Message template and fill
its placeholders" — not domain logic specific to bug 0139, 0148 or 0151. The
project already factored the shard read for exactly this reason
(tests/helpers/registry-oracle.ts's own header: "were redeclared
byte-for-byte... in several test files. This module centralises that read
only"), and its own design explicitly anticipates each caller keeping its
own `msg`/`registryMessageOf`-shaped filler local "whose assertion style and
wording vary per file" — but here the three fillers do NOT vary: they are
byte-for-byte identical function bodies, which is exactly the condition the
sibling `diagLines`/`diagCodes` fix (PTQ-0205) resolved by promoting the
identical helper into tests/helpers/e2e-s1.ts as a shared export. All three
files already import `parseDoc` from that same e2e-s1.ts module, so the
import path to a shared registry read is already open.

## Suggested direction (non-binding, optional)
tests/helpers/registry-oracle.ts already exports a `parse`-shard `REGISTRY`
read; a `msg`/`registryMessageOf`-shaped filler beside it (or promoted into
tests/helpers/e2e-s1.ts, which all three files already import from) is the
established, already-demonstrated home for this identical logic.

## False-positive check
- Gate-pin: none of the three files match `*gate*.test.ts` or the named kin.
- Recording-double: `REGISTRY`/`msg` read a static markdown table already
  parsed into memory; they record no calls and back no "never called"
  witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "registry-oracle\.ts\|readRegistry"
  docs/bugs/*.md` → 0 files; no open bug names this duplication or a
  documented-correct-reason for keeping the read local to each file.
- coverage-matrix/bug-doc citation search: `grep -n
  "fn-param-list-unclosed.test.ts\|fn-param-name-case.test.ts\|fn-param-name-reserved-keyword.test.ts"
  docs/reference/coverage-matrix.md` → 0 hits. Multiple bug docs (0139, 0148,
  0151 and others) cite these three files by filename for their pinned `it()`
  counts and cell ids; this finding proposes no change to any
  `it()`/`describe()` name, count, or assertion — only to where the read and
  filler are defined — so no pinned witness is affected.
- Chronology check: `git log --follow --date=short -- tests/helpers/registry-oracle.ts`
  shows it was first added 2026-09-11 (PTQ-0215's fix commit); the three
  reviewed files were each last touched 2026-09-05, before the helper
  existed, so its absence from them at authorship is expected — the finding
  is about the CURRENT state (the helper exists today and none of the three
  files uses it), not about an authoring-time omission.
- Coverage check: the claim is about a repeated read-and-fill DEFINITION, not
  a missing test path; every copy is exercised by its own file's existing
  tests.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all three excerpts match at the cited lines (fn-param-list-unclosed 130-142, fn-param-name-case 115-127, fn-param-name-reserved-keyword 214-227 — same readFileSync/fileURLToPath/parseRegistry read of code-registry-parse.md), the three `msg` bodies diff empty (sed 152-166 vs 137-151 vs 241-255; only the signature default differs), `grep registry-oracle` → 0 hits in all three while tests/helpers/registry-oracle.ts (first added 2594cd44, 2026-09-11) exports `readRegistry(["parse"])` and a `RegistryRow` carrying `severity`, so both the shard-specific read and file3's widened row are already covered; D7 boilerplate-duplication class in tests/ only, no gate/recording-double/coverage-matrix carve-out applies (coverage-matrix → 0 hits; bug docs cite the files as witnesses but no `it()` changes), and no resolved PTQ (0215/0222/0237/0250/0260/0275/0311/0313/0327/0404/0411/0412 cite other files) nor sibling intake candidate covers these three files — same class as the confirmed-and-fixed PTQ-0404/PTQ-0412 (triage: claude-fable-5-1)
