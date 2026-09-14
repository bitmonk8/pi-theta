---
id: PTQ-0315
title: b0303, b0305 and b0306 each redeclare an identical import-materialise-then-execute harness with no tests/helpers/ home
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0303-imported-fn-body-declaring-scope.test.ts:170-251
  - tests/b0303-imported-fn-body-declaring-scope.test.ts:260-270
  - tests/b0305-enum-alias-identity.test.ts:132-193
  - tests/b0305-enum-alias-identity.test.ts:199-209
  - tests/b0306-imported-enum-wire-values.test.ts:129-190
  - tests/b0306-imported-enum-wire-values.test.ts:196-206
sites: 6                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260914060226
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-14
---

# b0303, b0305 and b0306 each redeclare an identical import-materialise-then-execute harness with no tests/helpers/ home

## Observation
tests/b0305-enum-alias-identity.test.ts's `run()` (132-193, 62 lines) and
tests/b0306-imported-enum-wire-values.test.ts's `run()` (129-190, 62 lines)
are byte-for-byte identical: parse the importing theta, assert its
frontmatter parsed, drive `checkThetaImports` over `fakeThetaLibFs`, build a
`createProductionProducerDeps` instance around an ambient `resolvePiTool`
stub, assemble a `ThetaCompositionInput`/`ConversationBindInput` pair, `bind`
and `executeBody`, then shape the settled value into
`{appParseCodes, diagLines, materialised, wire, raw}`.
tests/b0303-imported-fn-body-declaring-scope.test.ts's `measure()` (170-251)
runs the identical sequence through the same
theta-construction/bindInput/binding block (confirmed identical, see
Evidence) and diverges only where its own cells need more: a populated
`modelRegistry.getAvailable` (its subagent-fn cell spawns an in-process
session) and an `executeBody(...).then(ok, err)` wrapper that turns a thrown
panic into a comparable value (some of its own cells expect a throw). Each of
the three files also declares its own near-identical
`expectCleanLoad`/`expectCleanImport` precondition helper immediately after
its own harness function. No `tests/helpers/` module hosts any piece of this
bundle; the two existing helpers that also drive
`createProductionProducerDeps` (tests/helpers/call-with-clause-harness.ts,
tests/helpers/tool-call-dispatch-harness.ts) solve a different problem — a
hand-built code-side call/AST dispatch — not "materialise a `.thetalib`
import then execute the importing body," so neither already covers this
bundle.

## Evidence

tests/b0305-enum-alias-identity.test.ts:132-146 (of 132-193) — `run()`'s
opening:
```ts
async function run(appBody: string, libs: Record<string, string>): Promise<Ran> {
  const app = parseApp(appBody);
  expect(
    app.frontmatter,
    `frontmatter must parse or the load pass reads nothing; parse diagnostics: ${JSON.stringify(
      app.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
    )}`,
  ).not.toBeNull();
  const frontmatter = app.frontmatter as ParsedFrontmatter;
  const input: ThetaCompositionInput = {
    slashName: "app",
    sourcePath: "/proj/app.theta",
    frontmatter,
    body: app.body,
  };
```

tests/b0305-enum-alias-identity.test.ts:179-193 — `run()`'s tail:
```ts
    args: "",
    ctx: {} as unknown as ExtensionCommandContext,
  };
  const binding = deps.bindPromptConversation(bindInput);
  const execution = await executeBody(app.body, binding.executeDeps);
  const value = execution.result.value;

  return {
    appParseCodes: app.diagnostics.map((d) => d.code),
    diagLines: check.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
    materialised: check.imports.map((m) => `${m.kind} ${m.name}`),
    wire: value === undefined ? null : (JSON.parse(JSON.stringify(value)) as unknown),
    raw: value as ThetaValue | undefined,
  };
}
```

tests/b0306-imported-enum-wire-values.test.ts:129-143 — the sibling `run()`'s
opening, confirmed byte-identical to the b0305 excerpts above (full-range
`diff` of 129-190 against b0305's 132-193 run immediately before filing
produced zero output):
```ts
async function run(appBody: string, libs: Record<string, string>): Promise<Ran> {
  const app = parseApp(appBody);
  expect(
    app.frontmatter,
    `frontmatter must parse or the load pass reads nothing; parse diagnostics: ${JSON.stringify(
      app.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
    )}`,
  ).not.toBeNull();
  const frontmatter = app.frontmatter as ParsedFrontmatter;
  const input: ThetaCompositionInput = {
    slashName: "app",
    sourcePath: "/proj/app.theta",
    frontmatter,
    body: app.body,
  };
```

tests/b0303-imported-fn-body-declaring-scope.test.ts:170-183 (of 170-251) —
`measure()`'s opening, matching the two excerpts above line-for-line apart
from the assert message's wording:
```ts
async function measure(appBody: string, libs: Record<string, string>): Promise<Measured> {
  const app = parseApp(appBody);
  expect(
    app.frontmatter,
    `the importing theta's frontmatter must parse or the load pass reads nothing; diagnostics: ${JSON.stringify(
      app.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
    )}`,
  ).not.toBeNull();
  const frontmatter = app.frontmatter as ParsedFrontmatter;
  const input: ThetaCompositionInput = {
    slashName: "app",
    sourcePath: "/proj/app.theta",
    frontmatter,
    body: app.body,
```

tests/b0303-imported-fn-body-declaring-scope.test.ts:210-224 — the
theta/bindInput/binding-construction block, confirmed byte-identical to
tests/b0305-enum-alias-identity.test.ts:169-182 via `diff` (zero output):
```ts
  });
  const theta: ThetaCompositionInput = {
    slashName: "app",
    sourcePath: "/proj/app.theta",
    frontmatter,
    body: app.body,
    callableSet: Object.freeze({ entries: new Map() }),
    ...(imports.length > 0 ? { imports } : {}),
  } as ThetaCompositionInput;
  const bindInput: ConversationBindInput = {
    theta,
    args: "",
    ctx: {} as unknown as ExtensionCommandContext,
  };
  const binding = deps.bindPromptConversation(bindInput);
```

The remaining divergence — the `deps = createProductionProducerDeps({...})`
block's `modelRegistry` (b0303 populates `getAvailable`; b0305/b0306 stub it
`{}`) and the tail (b0303 wraps `executeBody(...).then(ok, err)` to capture a
thrown panic as a value; b0305/b0306 `await executeBody(...)` directly) — was
compared directly: apart from those two named differences, the two 39-line
openings (b0303:171-209 vs b0305:133-171) diff to exactly two changed lines
(the assert-message string and the `modelRegistry` value).

tests/b0303-imported-fn-body-declaring-scope.test.ts:260-270 — its own
precondition helper:
```ts
function expectCleanLoad(row: Measured, label: string, expectedMaterialised: string[]): void {
  expect(row.appParseCodes, `${label}: the importing file parses clean`).toEqual([]);
  expect(
    row.diagLines,
    `${label}: a well-formed \`.thetalib\` import is legal at every static gate; the load pass must report nothing (bug doc §Reproduction: \`diags :: []\`)`,
  ).toEqual([]);
  expect(
    row.materialised,
    `${label}: imports.md §Visibility auto-exports a top-level \`fn\`/\`enum\`, so the imported symbol materialises under its local name`,
  ).toEqual(expectedMaterialised);
}
```

tests/b0305-enum-alias-identity.test.ts:199-209 — the same shape, same three
assertions in the same order, differing only in the middle assert's wording:
```ts
function expectCleanLoad(row: Ran, label: string, expectedMaterialised: string[]): void {
  expect(row.appParseCodes, `${label}: the importing file parses clean`).toEqual([]);
  expect(
    row.diagLines,
    `${label}: a well-formed enum import is legal at every gate; the load pass must report nothing`,
  ).toEqual([]);
  expect(
    row.materialised,
    `${label}: imports.md §Visibility exports the declaration, so each import must materialise under its local name`,
  ).toEqual(expectedMaterialised);
}
```

tests/b0306-imported-enum-wire-values.test.ts:196-206 — the third copy,
same shape and same first two assertions verbatim, only pinning
`expectedMaterialised` to a literal `["enum Sev"]` instead of taking it as a
parameter:
```ts
function expectCleanImport(row: Ran, label: string): void {
  expect(row.appParseCodes, `${label}: the importing file parses clean`).toEqual([]);
  expect(
    row.diagLines,
    `${label}: a well-formed enum import is legal at every gate; the load pass must report nothing`,
  ).toEqual([]);
  expect(
    row.materialised,
    `${label}: imports.md:27 §Visibility exports the declaration, so the enum must materialise under its local name`,
  ).toEqual(["enum Sev"]);
}
```

Exact search: `grep -n "^async function measure\|^async function run" tests/b0301-bind-echo-tool-loop-respond-repair-holes.test.ts tests/b0303-imported-fn-body-declaring-scope.test.ts tests/b0304-transitive-lib-diagnostics.test.ts tests/b0305-enum-alias-identity.test.ts tests/b0306-imported-enum-wire-values.test.ts tests/b0310-watch-roots-root-union.test.ts` (the six files this wave reviews) → exactly 3 hits, the three files cited above; b0301, b0304 and b0310 declare no such driver (b0304 stops at `checkThetaImports`'s diagnostics and never executes a body; b0301 and b0310 need no import materialisation at all).

## Why this is a problem
This is the "Boilerplate duplication" class: a 62-line driver function
(parse → assert load precondition → `checkThetaImports` → build
`createProductionProducerDeps` → bind → `executeBody` → shape the outcome)
recurs byte-for-byte between two of the three files and near-identically
(two substantive divergences, both load-bearing for that file's own cells)
in the third, with an attached near-identical precondition-assertion helper
repeated a third time on top. Unlike the sibling `fakeThetaLibFs` finding in
this same wave, no existing `tests/helpers/` module already covers this
larger sequence — the two helpers that also wrap
`createProductionProducerDeps` build a hand-rolled code-side call dispatch
over a frozen `CallableSetSnapshot`, a different problem from "materialise a
`.thetalib` import, then execute the importing body and read back the
result."

## Suggested direction (non-binding, optional)
A `tests/helpers/`-hosted module exporting this shared driver — parameterised
by the one or two things that vary (the `modelRegistry` stub, whether a
thrown panic is captured as a value) — is the natural next home these three
files' own near-identical `run()`/`measure()`/`expectCleanLoad`/
`expectCleanImport` declarations already point toward, alongside this
family's existing tests/helpers/thetalib-load-harness.ts for the narrower
load-only variant of the same sequence.

## False-positive check
- Gate-pin check: none of the three files matches `*gate*.test.ts` or the
  named kin; the cited lines are harness/precondition-helper plumbing, not a
  pinned count or inventory assertion.
- Recording-double check: none of the cited functions records a call or
  backs a "never called" witness — `run()`/`measure()` return a value the
  test's own `it()` body asserts on, and `expectCleanLoad`/`expectCleanImport`
  assert a precondition, not an interaction count — so the negative-witness
  carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0303-imported-fn-body-resolves-in-caller-scope.md
  ("fixed", 0.291.0), docs/bugs/0305-enum-identity-minted-from-alias.md
  ("fixed", 0.290.0) and docs/bugs/0306-imported-enum-drops-explicit-wire-values.md
  ("fixed", 0.289.0). `npx vitest run tests/b0303-imported-fn-body-declaring-scope.test.ts tests/b0305-enum-alias-identity.test.ts tests/b0306-imported-enum-wire-values.test.ts`
  → 18 passed (18) at HEAD, so none of the three is a documented
  correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "b0303-imported-fn-body-declaring-scope\|b0305-enum-alias-identity\|b0306-imported-enum-wire-values" docs/reference/coverage-matrix.md`
  → 0 hits. docs/bugs/0335 and docs/bugs/0354 name "the
  tests/b0303-imported-fn-body-declaring-scope.test.ts `measure()` harness" /
  "harness pattern" as a reused shape (not a pin against changing it);
  docs/bugs/0361 names tests/b0305-... as "the bug-0305 test harness shape"
  for the same reason; docs/bugs/0305 carries a parent ratification for
  tests/b0306-...'s row 4 explicitly bounded to "this ONE assertion operand,
  nothing else in that file" — none of these bounds the harness function or
  the precondition helper this finding cites, and this finding proposes no
  merge, rename or deletion of any file or `it()`/`describe()` — only that
  the shared driver could be centralised.
- Coverage check: the claim is about repeated harness/helper DEFINITIONS, not
  a missing test path; every cited function is exercised by every test in
  its own file (18/18 passing, confirmed above).
- Overlap check against this wave's sibling candidates: qw20260914060226-d7-01
  covers the same three files' `fakeThetaLibFs` declarations under a separate
  root cause (an existing canonical helper already covers that piece) and
  cites disjoint line ranges — its b0303/b0305/b0306 ranges (87-120/66-99/
  63-96) end before this finding's ranges begin (170-251/132-193/129-190).

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: b0305:132-193 and b0306:129-190 `run()` are byte-identical (diff, 62/62 lines, zero output), b0303:170-251 `measure()` shares the identical parse/check/bind block diverging only in the `modelRegistry` stub and the thrown-panic wrapper, the three precondition helpers match as described, the exact-search hit count and vitest 18/18-pass claims reproduce, and no existing tests/helpers/ module covers the bind+executeBody sequence (thetalib-load-harness.ts stops at checkThetaImports; the other two helpers solve a different AST-call-dispatch problem) — matches this codebase's own PTQ-0232/PTQ-0206 precedent for this D7 boilerplate-duplication class (triage: claude-opus-5)
