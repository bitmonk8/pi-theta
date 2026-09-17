---
id: PTQ-0629
title: b0438 reproduces the makeDeps/parse/bodyOf/ParForHost/execDeps harness already flagged as duplicated across three sibling par-for bug files, as an uncounted fifth site
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0438-par-max-fractional-width-silent-floor.test.ts:101-115
  - tests/b0438-par-max-fractional-width-silent-floor.test.ts:169-183
  - tests/b0438-par-max-fractional-width-silent-floor.test.ts:231-247
  - tests/b0326-max-non-positive-runtime.test.ts:82-227
sites: 1
fix_scope: cross-module        # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: parallel
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 1
---

# b0438 reproduces the makeDeps/parse/bodyOf/ParForHost/execDeps harness already flagged as duplicated across three sibling par-for bug files, as an uncounted fifth site

## Observation
`quality/intake/qw20260917154546-d7-01-parforhost-harness-quadruplicated.md`
(already filed this wave) documents that `tests/b0324-max-non-number-runtime.test.ts`,
`tests/b0325-nan-infinity-max-zero-workers.test.ts`, and
`tests/b0326-max-non-positive-runtime.test.ts` each re-type the same
nine-part `makeDeps`/`parse`/`bodyOf`/`NOOP_CHECKPOINT`/`NoopMutator`/`tick`/
`ok`/`ParForHost`/`execDeps` harness, naming
`tests/par-for.test.ts` as a fourth instance "out of this wave's scope, cited
only as the fourth instance". `tests/b0438-par-max-fractional-width-silent-floor.test.ts`
— one of this wave's nine reviewed files, not named anywhere in that finding
— reproduces the identical block a fifth time: its own header comment states
the `ParForHost` is "modelled on the `ParForHost` of
tests/b0326-max-non-positive-runtime.test.ts" (line 62), and a
comment-stripped diff of the two files' harness blocks differs in only 18
lines out of roughly 160 (the bug-specific code/message constants and one
added `countCode` helper).

## Evidence

`tests/b0438-par-max-fractional-width-silent-floor.test.ts:101-115` (`makeDeps`
— byte-identical to `tests/b0326-max-non-positive-runtime.test.ts:69-83`,
already cited in the existing finding):
```ts
function makeDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = {
    resolve: (): "resolved" => "resolved",
  };
  return { systemNote, modelMatcher };
}
```

`tests/b0438-par-max-fractional-width-silent-floor.test.ts:169-183`
(`ParForHost`'s opening state/methods — byte-identical to
`tests/b0326-max-non-positive-runtime.test.ts:146-160`):
```ts
class ParForHost implements StatementEvalHost {
  inFlight = 0;
  peakInFlight = 0;
  /** An optional gate every effect awaits before resolving (concurrency probe). */
  gate: Promise<void> | null = null;

  evaluatePure(expr: Expr, env: LexicalEnvironment): ThetaValue {
    return this.#eval(expr, env);
  }

  checkpointFor(expr: Expr): CheckpointDescriptor | null {
    if (expr.kind === "call" || expr.kind === "query" || expr.kind === "invoke") {
      return { kind: "tool-call", site: { file: "test.theta", line: 1, column: 1 } };
    }
    return null;
```

`tests/b0438-par-max-fractional-width-silent-floor.test.ts:231-247`
(`execDeps` — byte-identical to
`tests/b0326-max-non-positive-runtime.test.ts:206-222`):
```ts
function execDeps(
  body: ThetaBody,
  host: StatementEvalHost,
  captured: Diagnostic[],
): DiagnosticSpyDeps {
  return {
    env: buildEnvironment({ body }),
    host,
    checkpoint: NOOP_CHECKPOINT,
    signal: new AbortController().signal,
    mutator: new NoopMutator(),
    mode: "prompt",
    emitDiagnostic: (d: Diagnostic): void => {
      captured.push(d);
    },
```

Exact search run: `diff <(sed -n '101,265p' tests/b0438-par-max-fractional-width-silent-floor.test.ts | grep -v '^\s*//' | grep -v '^\s*\*') <(sed -n '65,240p' tests/b0326-max-non-positive-runtime.test.ts | grep -v '^\s*//' | grep -v '^\s*\*')` → 18 differing lines total, over the full comment-stripped harness span (`makeDeps`, `parse`, `bodyOf`, `codesOf`, `NOOP_CHECKPOINT`, `NoopMutator`, `tick`, `ok`, `ParForHost`, `DiagnosticSpyDeps`, `execDeps`) — the differences are the bug-specific code/message constants (`NON_INTEGER_CODE`/`NON_INTEGER_MESSAGE`/etc. vs. `NON_POSITIVE_CODE`/`NON_POSITIVE_MESSAGE`) and the addition of an `okCount`/`countCode` pair in b0438 that b0326 also has (only reordered), confirming the two blocks are the same harness typed twice.

## Why this is a problem
The already-filed `qw20260917154546-d7-01-parforhost-harness-quadruplicated.md`
establishes the pattern (four sites, `tests/par-for.test.ts` cited only as
out-of-scope pattern evidence, never as a claim). `tests/b0438-par-max-fractional-width-silent-floor.test.ts`
is a fifth, in-scope reproduction of the exact same
`makeDeps`/`parse`/`bodyOf`/`codesOf`/`NOOP_CHECKPOINT`/`NoopMutator`/`tick`/
`ok`/`ParForHost`/`DiagnosticSpyDeps`/`execDeps` block, confirmed by its own
header comment's admission of the copy ("modelled on ... tests/b0326") and
the near-zero comment-stripped diff — not named or counted in that finding's
site list, and therefore not covered by it.

## Suggested direction (non-binding, optional)
As the existing finding already observes, the natural home for this
nine-part block (now typed a fifth time) is a shared module under
`tests/helpers/`, parameterised by each caller's own code/message constants —
the same division of labour `tests/helpers/runtime-belt-probe-harness.ts`
already uses elsewhere in this codebase (a `bugTag`/constants parameter, with
each file's own rationale comment staying local).

## False-positive check
- Gate-pin check: `tests/b0438-par-max-fractional-width-silent-floor.test.ts`
  does not match `*gate*.test.ts` or the named kin.
- Recording-double check: `ParForHost`'s `peakInFlight`/`inFlight` are
  positive observables the tests read directly (concurrency witnesses), not
  a "never called" negative recorder; the carve-out does not apply.
- docs/bugs/ signature search: `docs/bugs/0438-*.md` — the file's own header
  states "Witness suite (Phase 1, RED); fix deferred to Phase 2", i.e. the
  FLIP cells are expected red pending a fix, but that is a behavioural
  red/green disposition, not a claim about the harness-duplication D7 class
  this finding raises; the harness itself is not red or skipped.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0438-par-max-fractional-width-silent-floor"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of any `it()`/`describe()` — only that the local
  harness block could be drawn from a shared module.
- Coverage check: the claim is about a repeated harness DEFINITION, not a
  missing test path.
- Duplicate check: distinct from
  `qw20260917154546-d7-01-parforhost-harness-quadruplicated.md`, whose site
  list is b0324/b0325/b0326/par-for.test.ts (the last cited only as
  out-of-scope pattern evidence) — b0438 appears nowhere in that finding and
  is inside this shard's own review scope.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all three excerpts match at the cited lines; diff shows ParForHost b0438:169-229 ↔ b0326:150-210 and execDeps b0438:231-248 ↔ b0326:212-229 byte-identical, and re-running the stated comment-stripped span diff yields 16 differing lines (not 18), every one a range-offset artefact (b0326's three code/message constants at the top of its range, b0438's countCode at the bottom — which b0326 also carries at 229-232), so the whole makeDeps/parse/bodyOf/codesOf/NOOP_CHECKPOINT/NoopMutator/tick/ok/ParForHost/DiagnosticSpyDeps/execDeps/okCount block is a byte-identical fifth copy and b0438:161-162 names b0326 as its model; not a gate file, no coverage-matrix pin (grep 0438 → 0 hits), docs/bugs/0438 lists the file as witness but the filing proposes no it() merge/rename/delete; not a duplicate of confirmed sibling qw20260917154546-d7-01 (its site list is b0324/b0325/b0326/par-for.test.ts, b0438 absent) — store precedent PTQ-0228 (after PTQ-0206/0207) and PTQ-0393 (after PTQ-0310) accepts an uncounted extra site of an already-filed harness as its own filing; minor: stray d4_class field on a D7 filing (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
