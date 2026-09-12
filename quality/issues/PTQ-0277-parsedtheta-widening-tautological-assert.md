---
id: PTQ-0277
title: composition-producer.test.ts asserts two ParsedTheta fields against the identical references it assigned them from two lines above
lens: D7                     # D2 | D7 — the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/composition-producer.test.ts:536-560
sites: 1
fix_scope: localized          # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912112713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# composition-producer.test.ts asserts two ParsedTheta fields against the identical references it assigned them from two lines above

## Observation
`tests/composition-producer.test.ts`'s "ParsedTheta widening" test builds a
`parsed: ParsedTheta` object literal, assigning `frontmatter: input.frontmatter`
and `body: input.body` directly from the `input` value already in scope, then
asserts `parsed.frontmatter` equals `input.frontmatter` and `parsed.body`
equals `input.body`. `ParsedTheta` (`src/extension/reload-wiring.ts:50-62`) is
a plain data interface with no getters or runtime transformation, so these
two fields hold exactly the references the literal assigned two lines above.

## Evidence
`tests/composition-producer.test.ts:541-554`:
```ts
    // The widened ParsedTheta carries the V19a frontmatter + body AST + the
    // producer run — the seam H8a's session_start registration consumes. This
    // object literal compiles only against the widened seam.
    const parsed: ParsedTheta = {
      slashName: input.slashName,
      frontmatter: input.frontmatter,
      body: input.body,
      run: fixture.run,
    };

    expect(parsed.frontmatter, "ParsedTheta carries the V19a frontmatter").toBe(input.frontmatter);
    expect(parsed.body, "ParsedTheta carries the V19a body AST").toBe(input.body);

    await parsed.run("", ctxDouble());
```

`src/extension/reload-wiring.ts:50-62` (the type `parsed` is annotated as — a
plain interface, no class, no accessor, that could intervene between
assignment and read):
```ts
export interface ParsedTheta {
  /** The slash-command name this theta registers under. */
  readonly slashName: string;
  /**
   * The theta's source file path, when discovered from disk. Carried so the
   * `H8b` invoke resolver can resolve a relative `.theta`-callable / `invoke`
   * path against the calling theta's directory. Absent for in-memory fixtures.
   */
  readonly sourcePath?: string;
  /** The `V19a` parsed frontmatter (`mode:` / `model:` / `tool_loop` / …). */
  readonly frontmatter: ParsedFrontmatter;
  /** The `V19a` whole-file body statement-list AST the interpreter walks. */
  readonly body: ThetaBody;
```

## Why this is a problem
No code runs between the object literal's construction (lines 544-549) and
the two `expect(...).toBe(...)` calls (lines 551-552) that could change
`parsed.frontmatter`, `parsed.body`, `input.frontmatter`, or `input.body` —
`parsed` is a fresh plain object whose `frontmatter`/`body` properties were
bound, by ordinary JavaScript object-literal assignment, to the exact
`input.frontmatter`/`input.body` references the assertions then compare them
against. Neither `expect` call can fail regardless of what
`composeThetaFixture` or anything else in the test does: they verify that a
just-constructed literal holds the values it was just constructed with, not
any observable of production code. The test's only assertion that exercises
production behaviour is the final one — `h.probe().binderCalled` after
`await parsed.run(...)` — which does confirm the widened seam's `run` field
is the live producer run. The two `toBe` calls that precede it read, per
their own inline messages ("ParsedTheta carries the V19a frontmatter" /
"...body AST"), as verifying that the interface transports these fields, but
mechanically they can only restate the assignment two lines above; no
implementation defect anywhere in the codebase could make either of them
fail.

## Suggested direction (non-binding, optional)
None offered beyond the observation; the fix stage owns whether these two
assertions are removed (the surrounding TypeScript annotation already proves
at compile time that `ParsedTheta` accepts these fields) or replaced with a
check against a value obtained independently of the literal under test.

## False-positive check
- Gate-pin check: `tests/composition-producer.test.ts` does not match
  `*gate*.test.ts` and is not among the named kin. No pinned count or
  inventory is at issue.
- Recording-double check: not applicable — `parsed` is a plain object
  literal built in the test body, not a fake, double, or MUST-NOT witness;
  no "never called" property is being asserted here.
- docs/bugs/ signature search: `grep -rln "ParsedTheta widening\|composition-producer.test.ts" docs/bugs/`
  returns no files; no open bug document discusses this test or gives a
  documented-correct-reason rationale for these two assertions.
- coverage-matrix/bug-doc citation search: `grep -n "composition-producer.test.ts\|V19e\b" docs/reference/coverage-matrix.md`
  returns no hits. This finding proposes no merge, rename, or deletion of the
  test — only that two of its internal assertions are tautological given the
  three lines immediately above them.
- Currently green: `npx vitest run tests/composition-producer.test.ts` → 1
  file, 8 tests passed, confirming the cited lines are live, executing
  assertions, not dead or skipped code.

## Triage
verdict: confirmed — verified verbatim: parsed.frontmatter/parsed.body (composition-producer.test.ts:546-547) are copied by ordinary object-literal assignment from input.frontmatter/input.body (thetaInput returns a plain object; ThetaCompositionInput = Omit<ParsedTheta,"run">; reload-wiring.ts:50-62 confirms ParsedTheta is a plain interface with no getters), then re-compared to those same references two lines later (551-552) via .toBe (Object.is reference equality) with no intervening code able to reassign either property, so neither expect can fail regardless of any production defect; docs/bugs and coverage-matrix greps reproduce 0 hits, suite is green (8/8 via `npx vitest run tests/composition-producer.test.ts`), no gate/negative-witness/documented-red carve-out applies, and no existing PTQ (including the same tautology class 0231/0233/0223/0224) covers this file or test (triage: claude-opus-5)
