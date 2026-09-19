---
id: PTQ-0954
title: Expectation/CLEAN/one()/two() diagnostic-contract helper trio redeclared byte-identically in six test files, including both in-scope files
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: intake
verdict: questionable
locations:                   # every cited site, repo-relative path:line-range
  - tests/loop-element-withhold-binding-scoped.test.ts:271-290
  - tests/match-arm-scope-inference-pass.test.ts:502-518
  - tests/let-arm-withhold-binding-scoped.test.ts:404-423
  - tests/params-declared-type-in-type-layer.test.ts:511-522
  - tests/fn-arg-member-read-proof.test.ts:467-478
  - tests/plain-for-loop-variable-element-type.test.ts:342-353
sites: 6                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260918131151
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
fix_skips: 2
---

# Expectation/CLEAN/one()/two() diagnostic-contract helper trio redeclared byte-identically in six test files, including both in-scope files

## Observation
Both in-scope files declare a module-scope `Expectation` interface (`codes`/
`msgs` string-array pair), a `CLEAN` constant of that type, and a `one(code,
message)` builder — all three byte-identical between the two files. A
`two(first, second)` builder that concatenates two `Expectation`s is also
byte-identical between the two in-scope files (and a third sibling,
`tests/let-arm-withhold-binding-scoped.test.ts`). The same
`Expectation`/`CLEAN`/`one()` triple, byte-identical, recurs in three further
sibling files. No module under `tests/helpers/` exports an `Expectation`
type or a `one`/`two` diagnostic-contract builder.

## Evidence
tests/loop-element-withhold-binding-scoped.test.ts:271-290 (re-read
immediately before filing):
```ts
interface Expectation {
  readonly codes: readonly string[];
  readonly msgs: readonly string[];
}

/** The empty contract — no diagnostic at all. */
const CLEAN: Expectation = { codes: [], msgs: [] };

/** A one-diagnostic contract. */
function one(code: string, message: string): Expectation {
  return { codes: [code], msgs: [message] };
}

/** An ordered two-diagnostic contract (row c5's two judged loops). */
function two(first: Expectation, second: Expectation): Expectation {
  return {
    codes: [...first.codes, ...second.codes],
    msgs: [...first.msgs, ...second.msgs],
  };
}
```

tests/match-arm-scope-inference-pass.test.ts:502-518 (re-read immediately
before filing) — identical apart from the two doc comments being absent:
```ts
interface Expectation {
  readonly codes: readonly string[];
  readonly msgs: readonly string[];
}

/** The empty contract — no diagnostic at all. */
const CLEAN: Expectation = { codes: [], msgs: [] };

function one(code: string, message: string): Expectation {
  return { codes: [code], msgs: [message] };
}

function two(first: Expectation, second: Expectation): Expectation {
  return {
    codes: [...first.codes, ...second.codes],
    msgs: [...first.msgs, ...second.msgs],
  };
}
```

Exact commands run: `diff <(sed -n '/^interface Expectation/,/^}$/p;/^const CLEAN/p;/^function one/,/^}$/p;/^function two/,/^}$/p' tests/loop-element-withhold-binding-scoped.test.ts) <(sed -n '/^interface Expectation/,/^}$/p;/^const CLEAN/p;/^function one/,/^}$/p;/^function two/,/^}$/p' tests/match-arm-scope-inference-pass.test.ts)` → zero output (byte-identical).

Sibling-count search: `grep -rln "interface Expectation" tests/*.test.ts` → 6
hits: the two in-scope files plus `tests/let-arm-withhold-binding-scoped.test.ts:404-423`,
`tests/params-declared-type-in-type-layer.test.ts:511-522`,
`tests/fn-arg-member-read-proof.test.ts:467-478`,
`tests/plain-for-loop-variable-element-type.test.ts:342-353`. All six declare
the identical `Expectation` interface, `CLEAN` constant and `one()` body.
`grep -c "^function two" <file>` on each of the six: 1 for
let-arm-withhold-binding-scoped.test.ts, loop-element-withhold-binding-scoped.test.ts,
match-arm-scope-inference-pass.test.ts and params-declared-type-in-type-layer.test.ts;
0 for fn-arg-member-read-proof.test.ts and plain-for-loop-variable-element-type.test.ts.
Of the four with a `two()`, three (let-arm, loop-element, match-arm-scope) share
the identical `(first: Expectation, second: Expectation)` spread-concatenation
body; params-declared-type-in-type-layer.test.ts's `two()` diverges to a
four-scalar-argument signature and is not claimed as identical here.

## Why this is a problem
The same three-symbol contract-builder block — an interface with two
`readonly string[]` fields, an empty-contract constant, and a one-diagnostic
builder — is typed out from scratch in six files rather than shared, and a
four-line spread-concatenation `two()` is typed out identically in three of
them. `tests/helpers/` hosts no `Expectation`/`one`/`two` export (`grep -rl
"Expectation" tests/helpers/*.ts` → no hits), so every file that wants this
tiny ordered-diagnostic-contract shape re-derives it rather than importing a
shared version.

## Suggested direction (non-binding, optional)
A shared `tests/helpers/` module exporting the `Expectation` type plus
`one`/`two` builders is the natural home six files already converge on
independently; each file's own `Row`/`expectRow` machinery, which varies more
across the six, would stay local.

## False-positive check
- Gate-pin check: neither in-scope file matches `*gate*.test.ts` or the named
  gate kin; this finding concerns a helper-function definition, not a pinned
  count or inventory.
- Recording-double check: `Expectation`/`CLEAN`/`one`/`two` build plain
  data objects consumed by ordered-equality assertions in each file; none
  records a call or backs a "never called" witness, so the negative-witness
  carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "interface Expectation" docs/bugs/*.md`
  → 0 hits; no open bug document discusses this duplication or gives a
  documented correct-reason for six separate copies.
- coverage-matrix/bug-doc citation search: `grep -n
  "loop-element-withhold-binding-scoped\|match-arm-scope-inference-pass"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of either file or any `it()`/`describe()` name,
  only that the helper trio's definition could be shared.
- Coverage check: the claim is entirely about a repeated helper-DEFINITION;
  every row in every one of the six files continues to exercise its own
  file's diagnostics exactly as written.
- Prior-finding search: `grep -rl "CLEAN: Expectation\|one(code: string,
  message" quality/issues quality/resolved quality/intake` → 0 hits before
  this filing; the `Expectation`/`CLEAN`/`one`/`two` trio is not the subject
  of resolved PTQ-0468 (registry-page read) or PTQ-0805 (`fill()`
  placeholder interpolation), which cite different blocks of the same two
  in-scope files.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all six excerpts reproduce at the cited lines; mktemp `diff` of the sed-extracted `interface Expectation`/`const CLEAN`/`function one` block (8 lines) is byte-identical across all six files, and `two(first, second)` is byte-identical across loop-element/match-arm-scope/let-arm while params-declared-type's `two()` diverges to a four-scalar signature exactly as the filing states (fn-arg-member-read-proof and plain-for-loop have no `two()`); every copy is live (CLEAN 2-37 / one( 4-32 / two( 1-3 references per file); `grep -rl Expectation tests/helpers/` → 0, `grep -rln "interface Expectation" tests/` → exactly the six cited files; docs/bugs and coverage-matrix greps → 0 for all six filenames; no gate/recording-double carve-out applies (plain data builders, no `*gate*` file); dedupe: only quality/ hit is this candidate, PTQ-0816/0468/0805 cite different blocks of these files and open-issue `Expectation`/`CLEAN` hits are case-insensitive prose noise (`cleanCwd`) — D7 boilerplate-duplication inside tests/ whose fix is a mechanical import of a shared type + builder pair, with params-declared-type's divergent `two()` staying local (triage: claude-fable-5-1)
verdict: questionable — parked by the store: skipped by the fixer in 2 waves (see "## Fix attempts"); rule with accept --note <direction> or reject (store)

## Fix attempts
- qw20260919193904: skipped — [PTQ-0967-fnarg-letrhs-message-builders-duplicated.md] PTQ-0967: Shared six builder pairs through registry-oracle, preserving each file's failure wording. / PTQ-0971: Reused the shared AJV fixture at seven remaining sites; five were already deduplicated. Preserved the distinct production-slug fixture. / PTQ-0972: Replaced the local registry read with readRegistry(["parse"]), retaining the error-message path. / PTQ-0973: Imported shared at/render helpers at three remaining sites. No tests or assertions changed across any issue; the required tsc and full test gate passed (689 files, 11,586 tests). || [PTQ-0975-invoke-arg-array-literal-registry-read-not-migrated.md] PTQ-0975: Replaced local registry parsing with readRegistry(["parse"]); preserved error wording and all assertions. Required TypeScript/full-test gate passed. / PTQ-0977: Replaced duplicated two-page parsing with readRegistry(["parse", "load"]); preserved shard order and all assertions. Required gate passed. / PTQ-0978: Adopted shared production-load and workspace helpers; preserved per-call isolation and cleanup. No tests deleted or weakened. Required gate passed. / PTQ-0981: Imported shared diagLines and removed its local copy and unused types; all assertions preserved. Exact required gate passed: TypeScript clean, 689 test files and 11,586 tests passed. || [PTQ-0982-hexinvocationroot-reimplements-imported-rootdouble.md] PTQ-0982: Delegated hexInvocationRoot to rootDouble with an invocation-ID override; sequence behavior preserved. / PTQ-0983: Shared invokeArgMessage across all five triaged copies, preserving registry interpolation and failure checks. / PTQ-0984: Shared loweredParams across all eight triaged copies, preserving source construction and paths; affected live cell passed. / PTQ-0986: Imported the existing noopPi and removed its local duplicate. No tests or assertions removed across these fixes; required gate passed—TypeScript clean, 689 files and 11,586 tests green. ||
- qw20260919203448: skipped — [PTQ-0989-registry-four-page-read-reimplemented-keyless-entry-refusal.md] PTQ-0989: Reused shared REGISTRY; removed the local registry read, row type, and unused imports. No tests or assertions removed. / PTQ-0990: Replaced the handwritten message with loadRowMessage and interpolate; preserved the message assertion. / PTQ-0991: Imported the three canonical builders and folded the additional array-message copy named in triage; no tests renamed, deleted, or weakened. / PTQ-0993: Reused parseDoc(src, "probe.theta"), retaining both parse-precondition assertions. The required verification command passed: TypeScript and all 11,586 tests across 689 files. || [PTQ-0996-diaglines-reimplemented-stray-close-token-split.md] PTQ-0996: Imported shared diagLines; removed the duplicate and unused type imports. All tests retained. / PTQ-0997: Delegated msg to registryMessageOf, preserving the registry path and substitutions. All tests retained. / PTQ-0998: Imported shared parseDeps; removed the local builder and unused types. All tests retained. / PTQ-1001: Delegated unresolvedMessage to registryMessageOf, retaining the severity wrapper and gaining the placeholder guard. All tests retained. Required verification command passed verbatim for all four fixes: TypeScript clean; 689 test files and 11,586 tests passed. || [PTQ-1007-recordingcheckpoint-reimplements-noopcheckpoint-despite-impo.md] PTQ-1007: Replaced misleading local RecordingCheckpoint with SEAM_NOOP_CHECKPOINT, the current shared replacement for the retired NoopCheckpoint helper; assertions unchanged. / PTQ-1014: Removed local NoopCheckpoint/rootDouble definitions and imported shared rootDouble; assertions unchanged. / PTQ-1017: Removed local noopPi and imported the identical shared helper; assertions unchanged. / PTQ-1018: Imported shared parseDeps while preserving the local parse-clean check; assertions unchanged. All four fixes passed the required verbatim verification command: TypeScript check and 11,586 tests across 689 files. No tests were deleted. || [PTQ-1022-binder-forced-tool-dispatch-root-double-reimplemented.md] PTQ-1022: Root and capture setup now delegate to shared helpers, preserving fixture inputs; AJV was already shared. No tests or assertions removed. / PTQ-1027: Replaced local diagLines with the existing shared export and removed the unused type import. No tests or assertions removed. / PTQ-1028: Replaced local diagLines with the shared export and removed unused type imports. No tests or assertions removed. / PTQ-1029: Centralized reference-closure assertions in canonical-slug-oracle, preserving both failure messages. No tests or assertions removed. Prescribed gate passed for all fixes: TypeScript and all 11,586 tests in 689 files. ||
