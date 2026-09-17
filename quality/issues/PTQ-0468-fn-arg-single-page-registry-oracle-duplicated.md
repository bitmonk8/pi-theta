---
id: PTQ-0468
title: fn-arg-member-read-proof.test.ts redeclares the single-page parse-registry oracle instead of importing the existing PARSE_REGISTRY helper
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/fn-arg-member-read-proof.test.ts:158-183
  - tests/helpers/load-row-harness.ts:36-51
  - tests/division-result-type-number.test.ts:188-214
  - tests/match-arm-scope-inference-pass.test.ts:151-174
sites: 22                    # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# fn-arg-member-read-proof.test.ts redeclares the single-page parse-registry oracle instead of importing the existing PARSE_REGISTRY helper

## Observation
tests/fn-arg-member-read-proof.test.ts declares its own module-scope
`RegistryRow` interface, a `REGISTRY_PAGE` constant naming
`docs/spec_topics/diagnostics/code-registry-parse.md`, and a `REGISTRY`
constant built by `readFileSync` + `fileURLToPath` + `parseRegistry` over that
one page — the identical read `tests/helpers/load-row-harness.ts` already
performs and exports as `PARSE_REGISTRY_PATH` / `PARSE_REGISTRY`. The same
three-part block (interface, `REGISTRY_PAGE` constant, `REGISTRY` read) recurs
byte-for-byte (module differs only in the interface's field list, one
optional/regenerated comment wording) in at least 21 other test files.

## Evidence
tests/fn-arg-member-read-proof.test.ts:158-168
```ts
interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

/** The live `theta/parse/*` registry page — this file's only message oracle. */
const REGISTRY_PAGE = "docs/spec_topics/diagnostics/code-registry-parse.md";

const REGISTRY = parseRegistry(
  readFileSync(fileURLToPath(new URL(`../${REGISTRY_PAGE}`, import.meta.url)), "utf8"),
) as RegistryRow[];
```

The canonical read already exported for reuse, tests/helpers/load-row-harness.ts:36-51:
```ts
/** A parsed row of the code registry, as `parseRegistry` yields it. */
export interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

/** The single-page diagnostics registry several `b02xx` load harnesses share. */
export const PARSE_REGISTRY_PATH = "docs/spec_topics/diagnostics/code-registry-parse.md";

/** `code-registry-parse.md`, parsed once. */
export const PARSE_REGISTRY: readonly ParseCodeRegistryRow[] = parseRegistry(
  readFileSync(
    fileURLToPath(new URL(`../../${PARSE_REGISTRY_PATH}`, import.meta.url)),
    "utf8",
  ),
) as ParseCodeRegistryRow[];
```

Two of the sibling redeclarations, confirmed identical apart from the
`RegistryRow` field list and comment wording — tests/division-result-type-number.test.ts:188-201:
```ts
interface RegistryRow {
  readonly code: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

/** The live `theta/parse/*` registry page — the DIAG-4 oracle for this file. */
const REGISTRY_PAGE = "docs/spec_topics/diagnostics/code-registry-parse.md";

const REGISTRY = parseRegistry(
  readFileSync(fileURLToPath(new URL(`../${REGISTRY_PAGE}`, import.meta.url)), "utf8"),
) as RegistryRow[];
```

tests/match-arm-scope-inference-pass.test.ts:151-161:
```ts
interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

/** The live `theta/parse/*` registry page — this file's message oracle. */
const REGISTRY_PAGE = "docs/spec_topics/diagnostics/code-registry-parse.md";

const REGISTRY = parseRegistry(
  readFileSync(fileURLToPath(new URL(`../${REGISTRY_PAGE}`, import.meta.url)), "utf8"),
) as RegistryRow[];
```

Pattern-wide search: `grep -rl "^const REGISTRY_PAGE = \"docs/spec_topics/diagnostics/code-registry-parse.md\";" tests/*.test.ts` → 22 files: tests/arg-mismatch-diagnostic-count-by-surface.test.ts, tests/array-ternary-common-type-union.test.ts, tests/b0429-imported-schema-ctor-field-set.test.ts, tests/b0430-imported-enum-unknown-variant.test.ts, tests/b0448-imported-non-object-ctor.test.ts, tests/division-result-type-number-invoke.test.ts, tests/division-result-type-number.test.ts, tests/fn-arg-member-read-proof.test.ts, tests/fn-arg-type-mismatch-wired.test.ts, tests/fn-call-arity-unchecked.test.ts, tests/imported-thetalib-fn-call-args-checked.test.ts, tests/invoke-arg-array-literal-provable.test.ts, tests/join-element-unresolvable-disposition.test.ts, tests/let-arm-withhold-binding-scoped.test.ts, tests/loop-element-withhold-binding-scoped.test.ts, tests/match-arm-scope-inference-pass.test.ts, tests/match-fn-return-lub-dominating-discipline.test.ts, tests/modulo-zero-result-type-number.test.ts, tests/params-declared-type-in-type-layer.test.ts, tests/plain-for-loop-variable-element-type.test.ts, tests/ternary-common-type-trigger-adjudication.test.ts, tests/unresolvable-operand-structural-target-adjudication.test.ts.

## Why this is a problem
`tests/helpers/load-row-harness.ts` (created to centralise exactly this read,
per its own header note citing PTQ-0206/PTQ-0207) already exports
`PARSE_REGISTRY_PATH` and `PARSE_REGISTRY` reading the identical single page
through the identical `readFileSync` + `fileURLToPath` + `parseRegistry` call.
tests/fn-arg-member-read-proof.test.ts (in scope for this review) re-executes
that same read locally under a differently-named constant (`REGISTRY_PAGE` /
`REGISTRY`) rather than importing the exported one, and the same
re-declaration recurs in 21 further files, each paying its own markdown read
and registry re-parse for a value the project already computes once and
exports.

## Suggested direction (non-binding, optional)
tests/helpers/load-row-harness.ts's already-exported `PARSE_REGISTRY_PATH` /
`PARSE_REGISTRY` names the existing home for this read; each file's own
placeholder-filling/throw-wording reader (`registered`/`fill` here) is the
part that legitimately varies per file and would stay local.

## False-positive check
- Gate-pin: tests/fn-arg-member-read-proof.test.ts and the cited sibling files
  do not match `*gate*.test.ts` or the named kin (closing-gate,
  cross-cutting-gates, rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate) — this is not a pinned-count gate.
- Recording-double: the `REGISTRY` value is a static markdown-derived array
  read once; nothing here records calls or backs a "never called" assertion,
  so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "REGISTRY_PAGE" docs/bugs/` → 0 hits.
  No open bug document names this duplication or gives a documented
  correct-reason for keeping the single-page read local to each file.
- coverage-matrix/bug-doc citation search: `grep -n "REGISTRY_PAGE"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  change to any `it()`/`describe()` name or count, only to where the shared
  read is defined, so no cited-test-by-name concern applies.
- Coverage check: the claim is about a repeated harness DEFINITION (interface
  + two constants), not a missing test path; every copy is already exercised
  by its own file's tests.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — all three excerpts reproduce at the cited lines (fn-arg-member-read-proof:158-168, division-result-type-number:188-201, match-arm-scope-inference-pass:151-161; load-row-harness.ts:36-51 exports PARSE_REGISTRY_PATH/PARSE_REGISTRY over the identical single page, imported by 11 test files) and the primary file imports nothing from tests/helpers but parseDoc; the stated grep reproduces at 22 hits BUT sites is over-counted by 2 — tests/arg-mismatch-diagnostic-count-by-surface.test.ts and tests/b0448-imported-non-object-ctor.test.ts already `import { REGISTRY } from "./helpers/registry-oracle"` (fixed under PTQ-0327/PTQ-0250) and retain REGISTRY_PAGE only as an error-message string with no local parseRegistry read, so the true residual is 20 files (the primary plus 19 siblings, each with `const REGISTRY = parseRegistry(readFileSync(...))` and zero helper imports; the local RegistryRow extras are never read — only registryMessage consumes the rows); all locations in tests/, no gate/recording-double carve-out, docs/bugs cite the primary file (0150/0190/0192/0199) for behaviour only and bug 0200 cites a sibling's REGISTRY lines as line-citations without requiring a local read, coverage-matrix 0 hits; not a duplicate — no PTQ names fn-arg-member-read-proof.test.ts and store precedent (PTQ-0250/0327/0412) files per-wave residuals of this registry-oracle gap separately; note two existing homes (registry-oracle.ts four-page REGISTRY, 30 importers; load-row-harness.ts PARSE_REGISTRY) — direction non-binding (triage: claude-fable-5-1)
