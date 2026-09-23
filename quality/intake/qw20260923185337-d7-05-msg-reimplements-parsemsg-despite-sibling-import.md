---
id: pending
title: reserved-keyword-remaining-identifier-positions.test.ts re-derives load-row-harness's parseMsg via a second registry-read path instead of importing it, as its own sibling file already does
lens: D7
status: intake
verdict: pending
locations:
  - tests/reserved-keyword-remaining-identifier-positions.test.ts:190-198
  - tests/reserved-keyword-misfire-faces.test.ts:1-4
  - tests/helpers/load-row-harness.ts:104-108
sites: 2
fix_scope: localized
wave: qw20260923185337
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# reserved-keyword-remaining-identifier-positions.test.ts re-derives load-row-harness's parseMsg via a second registry-read path instead of importing it, as its own sibling file already does

## Observation
`tests/reserved-keyword-remaining-identifier-positions.test.ts` reads the
parse-diagnostics registry through `readRegistry(["parse"])` (from
`tests/helpers/registry-oracle.ts`) into a local `REGISTRY` constant, then
declares a local `msg(code, fills)` that calls
`registryMessageOf(REGISTRY, "docs/spec_topics/diagnostics/code-registry-parse.md", code, fills)`.
`tests/helpers/load-row-harness.ts` already exports `parseMsg(code, fills)`,
whose body is exactly `registryMessageOf(PARSE_REGISTRY, PARSE_REGISTRY_PATH,
code, fills)` over its own `PARSE_REGISTRY` constant (the same page, read via
a different `readFileSync`/`parseRegistry` call) and its own
`PARSE_REGISTRY_PATH` constant (the identical literal
`"docs/spec_topics/diagnostics/code-registry-parse.md"` the in-scope file
spells out by hand). The in-scope file's own sibling in this review's
scope, `tests/reserved-keyword-misfire-faces.test.ts`, already imports
`parseMsg` from `load-row-harness` directly (aliased `as msg`) and uses it
unmodified.

## Evidence
`tests/reserved-keyword-remaining-identifier-positions.test.ts:190-198`:
```ts
const REGISTRY = readRegistry(["parse"]);

const RESERVED = "theta/parse/reserved-keyword-as-identifier";
const MUT_IMMUTABLE = "theta/parse/mut-on-immutable-context";
const IMPORT_MALFORMED = "theta/parse/import-malformed-specifier-list";

function msg(code: string, fills: ReadonlyArray<readonly [string, string]>): string {
  return registryMessageOf(REGISTRY, "docs/spec_topics/diagnostics/code-registry-parse.md", code, fills);
}
```

`tests/reserved-keyword-misfire-faces.test.ts:1-4` — the sibling file's
import line, already using the canonical function under the same local name:
```ts
import {
  PARSE_REGISTRY as REGISTRY, parseMsg as msg, reservedAt, singleLineIfAt, SINGLE_LINE_IF,
  type ParseCodeRegistryRow as RegistryRow,
} from "./helpers/load-row-harness";
```

`tests/helpers/load-row-harness.ts:104-108` — the canonical export the
in-scope file's local `msg` reproduces line-for-line:
```ts
export function parseMsg(
  code: string,
  fills: ReadonlyArray<readonly [string, string]> = [],
): string {
  return registryMessageOf(PARSE_REGISTRY, PARSE_REGISTRY_PATH, code, fills);
}
```

Exact search: `grep -n "PARSE_REGISTRY_PATH" tests/helpers/load-row-harness.ts`
→ the constant is defined once, `"docs/spec_topics/diagnostics/code-registry-parse.md"`
(`load-row-harness.ts:47`), the identical literal the in-scope file's `msg`
spells out inline. `grep -n "parseMsg as msg\|parseMsg("
tests/reserved-keyword-misfire-faces.test.ts
tests/reserved-keyword-inline-object-and-literal-keys.test.ts` → both files
already import the canonical `parseMsg`; the in-scope file does not.

## Why this is a problem
The in-scope file reads the same registry page a second way
(`registry-oracle.ts`'s `readRegistry` rather than `load-row-harness.ts`'s
already-parsed `PARSE_REGISTRY`) and re-derives the identical one-line
`registryMessageOf` wrapper `load-row-harness.ts` already exports under the
name `parseMsg`, spelling the registry page path out as a duplicate literal
in the process. Its own sibling file in this review's scope proves the
canonical import already satisfies the exact same job (same code constant
`theta/parse/reserved-keyword-as-identifier`, same registry page, same
`msg`-shaped local alias), so this is not a case where the shared helper is
absent or unreachable from this file.

## Suggested direction (non-binding, optional)
`tests/reserved-keyword-misfire-faces.test.ts` already shows the shape:
`import { PARSE_REGISTRY as REGISTRY, parseMsg as msg, ... } from
"./helpers/load-row-harness"` in place of the local `readRegistry` call and
the hand-written `msg` wrapper.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin; not a census/pin gate.
- Recording-double check: `msg`/`parseMsg`/`REGISTRY`/`PARSE_REGISTRY` are a
  registry-message reader and a parsed-registry constant, not fakes,
  doubles, or MUST-NOT witnesses.
- docs/bugs/ signature search: `grep -rl "parseMsg\b" docs/bugs/*.md` →
  0 hits; no documented correct-reason red names either declaration.
- coverage-matrix/bug-doc citation search: `grep -n
  "reserved-keyword-remaining-identifier-positions" docs/reference/coverage-matrix.md`
  → 0 hits; no merge, rename, or deletion of the file or any `it()`/
  `describe()` is proposed — only that the local `REGISTRY`/`msg` pair could
  import the already-exported `PARSE_REGISTRY`/`parseMsg` pair its sibling
  file already imports.
- Prior-filing search: `grep -rl "registryMessageOf(REGISTRY" quality/issues
  quality/resolved quality/intake` (before this filing) → 0 hits naming this
  file; the resolved PTQ-0616 targeted a different, now-superseded
  hand-rolled reader body (five inline assertions) at this same file's
  earlier line range 211-232, which the intervening fix already collapsed
  into the present one-line `registryMessageOf`-wrapping `msg` — the residual
  duplication cited here (a second registry-read path plus a redundant
  wrapper, when the sibling file already imports the same-named canonical
  export) is a distinct, unfiled root cause, not a re-opening of PTQ-0616.
  This is narrower than the widely-spread `registryMessageOf(REGISTRY,
  "docs/spec_topics/diagnostics/code-registry-parse.md", ...)` wrapper shape
  that recurs across roughly a dozen unrelated test files project-wide (each
  supplying its own independently-derived `REGISTRY`) — no claim is made
  about that wider population; this filing is scoped to the fact that the
  in-scope file's own reviewed sibling already imports the exact-named
  canonical `parseMsg` this file re-derives.

## Triage
verdict: questionable — the facts check out: remaining-identifier-positions:190-198 has `REGISTRY = readRegistry(["parse"])` plus a one-line `msg` that just calls `registryMessageOf(REGISTRY, "<parse page literal>", code, fills)`, load-row-harness.ts:104-109 `parseMsg` has the same body over PARSE_REGISTRY/PARSE_REGISTRY_PATH (:47-52), and misfire-faces:1-4 imports it `as msg`; parseMsg only arrived in d3bf3e19, which moved this file onto `reservedAt` but left its `msg`, so this is a real leftover that was not migrated, not a re-open of resolved PTQ-0616. But the case for it is thin. What is duplicated is a one-line delegation. The load-row-harness.ts:5-13 header lets each file pass in its own registry array and path. readRegistry is itself the canonical registry-oracle reader (PTQ-0484/0569 moved files onto it), so this is not a stray "second read path". And 15 test files carry the identical `registryMessageOf(REGISTRY, "docs/spec_topics/diagnostics/code-registry-parse.md", …)` wrapper, so fixing one file is an arbitrary slice. The earlier TRIAGE_LOG:300 ruling treated this wrapper shape as the harness's deliberate parameterisation. A human should rule whether parseMsg is now the required default (triage: claude-opus-5-5)
