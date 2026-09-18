---
id: PTQ-0864
title: readDiagnosticsPage and its DIAGNOSTICS_DIR constant are redeclared byte-identical between both in-scope inline-object test files
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/inline-object-type-source-capture.test.ts:172-176
  - tests/inline-object-wire-name-rename-refusal.test.ts:182-186
sites: 2
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# readDiagnosticsPage and its DIAGNOSTICS_DIR constant are redeclared byte-identical between both in-scope inline-object test files

## Observation
Both in-scope files declare the same module-scope `DIAGNOSTICS_DIR` string
constant and the same `readDiagnosticsPage(page: string): string` function,
which reads a named page from `docs/spec_topics/diagnostics/` via
`readFileSync`/`fileURLToPath`/`import.meta.url` and returns its raw text.
Each file calls this function exactly once, to read
`placeholder-rendering-b.md`'s raw text for a direct `.toContain(...)` /
`.includes(...)` string check against the diagnostics-registry's own
placeholder-rendering convention page (cell "A1" in both files). No
`tests/helpers/` module exports this raw-page-read function.

## Evidence

`tests/inline-object-type-source-capture.test.ts:172-176` (re-read
immediately before filing):
```ts
const DIAGNOSTICS_DIR = "../docs/spec_topics/diagnostics/";

function readDiagnosticsPage(page: string): string {
  return readFileSync(fileURLToPath(new URL(`${DIAGNOSTICS_DIR}${page}`, import.meta.url)), "utf8");
}
```

`tests/inline-object-wire-name-rename-refusal.test.ts:182-186` — byte-identical:
```ts
const DIAGNOSTICS_DIR = "../docs/spec_topics/diagnostics/";

function readDiagnosticsPage(page: string): string {
  return readFileSync(fileURLToPath(new URL(`${DIAGNOSTICS_DIR}${page}`, import.meta.url)), "utf8");
}
```

Exact check: `diff <(sed -n '172,176p' tests/inline-object-type-source-capture.test.ts) <(sed -n '182,186p' tests/inline-object-wire-name-rename-refusal.test.ts)` produces zero differences (5 lines each, including the blank line). Each file's sole call site reads the same page name: `readDiagnosticsPage("placeholder-rendering-b.md")` — `tests/inline-object-type-source-capture.test.ts:679` and `tests/inline-object-wire-name-rename-refusal.test.ts:783`.

## Why this is a problem
`readDiagnosticsPage` is a two-line, non-domain-specific file-read wrapper
declared independently, byte-for-byte, in both files rather than shared. The
two files already sit in the same `docs/bugs/0228`/`docs/bugs/0160` file
family (each names the other in its own header comment as a "landed sibling")
and already both import `REGISTRY` from `tests/helpers/registry-oracle.ts`
for the structured registry read, but the raw-text read of an individual
diagnostics page used for the placeholder-rendering-convention check has no
shared home, so each file re-derives the same `URL`/`fileURLToPath`/
`readFileSync` construction independently. A change to the diagnostics
directory's relative path or to the page-read encoding would need the
identical edit applied by hand at both sites.

## Suggested direction (non-binding, optional)
A `tests/helpers/` export of a `readDiagnosticsPage(page: string): string`
function, alongside the existing `registry-oracle.ts` module that already
supplies the structured `REGISTRY` read for the same directory, is the
natural home the two byte-identical copies point at.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate-kin
  patterns (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate).
- Recording-double check: `readDiagnosticsPage` performs a static file read;
  it records no calls and backs no "never called" witness, so the
  negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "readDiagnosticsPage"
  docs/bugs/0228-*.md docs/bugs/0160-*.md` returns no hits — neither bug
  document states a rationale for redeclaring this read locally rather than
  sharing it.
- coverage-matrix/bug-doc citation search: `grep -n
  "inline-object-type-source-capture\|inline-object-wire-name-rename-refusal"
  docs/reference/coverage-matrix.md` returns no hits. Both files are cited by
  name in docs/bugs/0228 and docs/bugs/0160 as each report's fix witness, but
  always for the diagnostic-emission or lowering cells under test, never for
  where `readDiagnosticsPage`'s own code lives; this finding proposes no
  merge, rename, or deletion of either file or any `it()`/`describe()` block
  — only that the duplicated two-line read function could be shared.
- Coverage check: the claim is about a repeated helper-function DEFINITION,
  not a missing test path; both copies are exercised by the "A1" cell in
  their own file today.
- Prior-filing overlap check: `grep -rl "readDiagnosticsPage" quality/intake
  quality/issues` (before this filing) found one hit, PTQ-0734, which covers
  a disjoint file trio (`unresolved-annotation-lowering.test.ts`,
  `unterminated-literal-params-type-refusal.test.ts`,
  `unterminated-template-lexer-emission.test.ts`) and a disjoint root cause —
  the four-shard `RegistryRow`/`REGISTRY` construction, not the single-page
  `readDiagnosticsPage` read — and does not name either file in this
  filing's location list. A broader search
  (`grep -rl "function readDiagnosticsPage" tests/*.test.ts`) finds exactly
  four files sharing this function
  (`escaped-quote-inline-field-name-refusal.test.ts`, the two in-scope
  files, and `unterminated-literal-params-type-refusal.test.ts`); this
  finding is confined to the two files inside this review's scope.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: `diff <(sed -n 172,176p …type-source-capture) <(sed -n 182,186p …wire-name-rename-refusal)` is empty (DIAGNOSTICS_DIR + readDiagnosticsPage byte-identical), each file has exactly one live call `readDiagnosticsPage("placeholder-rendering-b.md")` (drifted to :712 and :818, content matches) backing a real `.toContain`/`.includes` A1 assertion, `grep -rn readDiagnosticsPage tests/helpers/` = 0 (registry-oracle.ts:39 only reads the four code-registry shards internally, no raw-page export), `grep -rl 'function readDiagnosticsPage' tests/` = the four files the filing lists, docs/bugs and coverage-matrix greps = 0 as stated, both files now import REGISTRY from ./helpers/registry-oracle so this is the residue PTQ-0474's own triage carved out ("readDiagnosticsPage is still needed for placeholder-rendering-b.md … only the RegistryRow/REGISTRY block is the dedupe target"), both locations under tests/, D7 boilerplate-duplication class, not a gate file, no recording-double/red-test carve-out; not a duplicate — PTQ-0474/0475 (resolved) and PTQ-0734/0750 track the RegistryRow/REGISTRY four-shard read (0734's excerpt merely embeds this function on a disjoint trio), and same-wave siblings d7-01-inline-object-type-source-wire-name-msg (msg() at :208-223/:224-239) and d7-57-01 (single-shard readRegistry) cite different root causes (triage: claude-fable-5-1)
