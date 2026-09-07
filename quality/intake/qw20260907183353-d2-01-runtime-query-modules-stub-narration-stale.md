---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: Seven runtime modules carry tests-task stub narration describing their implemented functions as inert stubs
lens: D2                     # the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending             # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/runtime/lexical-environment.ts:33-50
  - src/runtime/lexical-environment.ts:257-258
  - src/runtime/lexical-environment.ts:817-819
  - src/runtime/lexical-environment.ts:834-836
  - src/runtime/match-result.ts:19-23
  - src/runtime/match-result.ts:140-142
  - src/runtime/prompt-transport-mapping.ts:48-53
  - src/runtime/query-discard.ts:22-32
  - src/runtime/query-followup-render.ts:35-38
  - src/runtime/query-respond-repair.ts:45-48
  - src/runtime/query-respond-repair.ts:216
  - src/runtime/query-tool-loop.ts:287-292
  - src/runtime/query-tool-loop.ts:349
  - src/runtime/query-tool-loop.ts:361-364
  - src/runtime/query-tool-loop.ts:480-483
sites: 15                    # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# Seven runtime modules carry tests-task stub narration describing their implemented functions as inert stubs

## Observation
These runtime modules were delivered in the repository's tests-task /
implementation pairing (V-x-T lands stubs and their narration; the paired V-x
commit replaces the bodies). At 15 sites across seven files the stub-phase
narration was retained and still asserts, in the present tense, that the named
functions are inert stubs — "V19b-T stubs every behaviour-bearing method
inertly", "`evaluateMatch` is stubbed inert (it matches no arm and raises no
panic)", "stubs the two behaviour-bearing helpers NON-COMPLIANTLY", "V13c-T
stubs this inert: it fires no checkpoint", "adds it as an OPTIONAL, ignored
parameter" — while every named function body is fully implemented in the same
file. One file (query-tool-loop.ts) is internally contradictory: its module
header says "V13c (this implementation leaf) drives both surfaces" while its
two driver doc comments still claim the stub state.

## Evidence
src/runtime/lexical-environment.ts:33-50 (module header; excerpted):
```ts
// factory, and the real `ThetaEvalHost` realising `V3a`'s `EvalHost` — and stubs
// each behaviour-bearing method inertly so the failing tests compile and red on
// their own primary assertions:
//
//   - `resolve` returns the inert `unresolved` arm, so every precedence,
//     `fn`-hoisting, and import-materialisation assertion reds (no arm matches);
//   - `writeBinding` inertly accepts every write without recording it, so the
...
// No test reds on a compile error, a missing fixture, or a harness throw. The
// paired V19b implementation leaf fills these in.
```
The same file repeats the claim at :257-258 ("V19b-T stubs every
behaviour-bearing method inertly … The paired V19b implementation leaf fills
the scope model in."), :817-819 ("V19b-T stubs this inert — it returns an
environment whose methods are inert"), and :834-836 ("V19b-T stubs both methods
as the inert `null` sentinel — neither consults the environment"). Current
code: `resolve` performs the four-arm precedence walk (:596-620),
`buildEnvironment` returns the real environment (`return new
LexicalEnvironment(inputs, null);`, :822), and `ThetaEvalHost.resolveIdentifier`
consults the environment (`const r = this.env.resolve(name);`, :842).

src/runtime/match-result.ts:19-23 (header) and :140-142 (doc on
`evaluateMatch`):
```ts
 * V4a-T stubs this inert: it matches no arm and raises no panic, returning a
 * sentinel. The paired V4a leaf implements pattern dispatch, binding, and the
 * `MatchError` raise.
```
Current code: the body directly below dispatches arms (:149-155) and raises the
panic (`throw new MatchError(...)`, :160).

src/runtime/prompt-transport-mapping.ts:48-53 (module header):
```ts
// V9n-T (tests-task) declares this seam and stubs the two behaviour-bearing
// helpers NON-COMPLIANTLY so the failing tests compile and red on their own
// primary assertions; the paired V9n implementation leaf fills in the
// cancellation short-circuit, the `stopReason: "error"` probe, the
// `"provider transport failure"` fallback, and the coerced sync-throw mapping.
```
Current code: `extractPromptModeQueryResult` implements the cancellation
short-circuit (:192) and both probes; `mapPromptModeSyncThrow` implements the
coerced mapping (`message: coerceUnderlyingString(caught)`, :316).

src/runtime/query-discard.ts:22-32 (module header; excerpted):
```ts
// V13g-T (this tests-task) declares the seam shapes and stubs the two
// behaviour-bearing functions inertly so the failing tests compile and red on
// their own primary assertions:
//   - `checkDiscardedQueryResult` returns `undefined` always (never fires the
//     parse error), so the QRY-19 positive assertion reds.
//   - `emitDiscardObservability` unconditionally emits one sentinel event with
//     `display: true` and a payload that preserves neither `kind` / `message`
```
Current code: `checkDiscardedQueryResult` fires the QRY-19 diagnostic
(:105-116); `emitDiscardObservability` emits nothing on `Ok` (:215) and builds
the kind/message/discard_site-preserving event.

src/runtime/query-followup-render.ts:35-38 (module header):
```ts
// V13h-T (this tests task) declares the seam shape and stubs `renderFollowUpTurn`
// inert (it returns the empty string) so the failing tests compile and red on
// their own primary byte-comparison assertions while the paired `V13h`
// implementation is absent. The paired `V13h` leaf fills the renderer in.
```
Current code: `renderFollowUpTurn` renders both templates (:107-135).

src/runtime/query-respond-repair.ts:45-48 (module header) and :216 (section
header "The loop (V13d-T stub; the paired V13d fills it in).")
```ts
// V13d-T (this tests task) declares the seam shapes and stubs
// `runRespondRepairLoop` inert (it issues no follow-up and returns an inert
// `value` outcome) so the failing tests compile and red on their own primary
// assertions while the paired `V13d` implementation is absent.
```
Current code: the attempt loop issues follow-ups (`for (let attempt = 1;
attempt <= attempts; attempt++)`, :267) and implements all four outcome arms.

src/runtime/query-tool-loop.ts:349 (section header "The two drivers (V13c-T
stubs; the paired V13c fills them in).") plus :361-364 and :480-483:
```ts
 * V13c-T stubs this inert: it fires no checkpoint, runs no tool-call round, and
 * returns an inert terminating text outcome with no committed side effects — so
 * the exhaustion, checkpoint, and ERR-13 assertions red on their own primary
 * expectation. The paired V13c leaf implements the loop.
```
Current code: both drivers fire the checkpoint (`await
checkpoint.before("query", config.querySite);`, :375 and :501), run the round
loop, and dispatch the forced respond turn. The same file's module header
(:43) already states "V13c (this implementation leaf) drives both surfaces",
contradicting these sites.

src/runtime/query-tool-loop.ts:287-292 (the V13e-T seam block):
```ts
// V13e-T declares this seam and adds it as an OPTIONAL, ignored parameter to
// `runTypedQueryLoop` (the paired `V13e` implementation wires the loop to
// orchestrate it). The `V13c` loop body added no orchestration, so a test that
// injects this seam and drives the loop reds: none of the seam's steps are
// invoked and a non-conforming response is bound as the query value instead of
// routing through respond-repair.
```
Current code: the loop orchestrates the seam — `lowered =
schemaValidation.lower(shape); schemaValidation.convey(lowered);` (:579-580),
`schemaValidation.validate(...)` and `schemaValidation.runRespondRepair(...)`
below — so the parameter is neither ignored nor un-orchestrated.

## Why this is a problem
Historical narration comments — a named D2 smell — asserting present-tense
falsehoods about the code they document: a reader of `runUntypedQueryLoop`'s
contract block is told it "fires no checkpoint" two lines above the `await
checkpoint.before(...)` call. The scaffolding's feature has landed, shown in
git per file: adb0a7e4 (V19b-T) → 4d52edbf (V19b); d88e07ec (V13g-T) →
cbd64750 (V13g); cc2bc7e3 (V9n-T) → ce955fbe (V9n); 72db2da0 (V13h-T) →
a9bd7aa4 (V13h); af7193d5 (V13d-T) → c954a722 (V13d); 3a235cb4 (V13c-T) →
bcd4dff0 (V13c); e624a878 (V4a). The house style updates the narration at
implementation time — sibling src/runtime/query-error.ts:30-34 speaks in past
tense ("V4d-T … declared the seam shapes and stubbed the behaviour-bearing
helpers inertly … the failing tests compiled and redded"), and
query-tool-loop.ts's own header was updated (:43) while its function docs were
not — so the 15 retained sites are leftovers, not a convention.

## Suggested direction (non-binding, optional)
Rewrite or delete the stub-phase sentences the way the already-updated siblings
did (query-error.ts:30-34's past-tense provenance form, or query-tool-loop.ts's
header sentence "V13c (this implementation leaf) drives both surfaces"), so no
doc comment asserts a stub behaviour the code no longer has. Comment-only
change; no code motion.

## False-positive check
- Current-code contradiction verified per function: `resolve`
  (lexical-environment.ts:596-620), `buildEnvironment` (:821-823),
  `ThetaEvalHost.resolveIdentifier` (:841-844), `evaluateMatch`
  (match-result.ts:144-160), `extractPromptModeQueryResult`
  (prompt-transport-mapping.ts:186-267), `mapPromptModeSyncThrow` (:308-318),
  `checkDiscardedQueryResult` (query-discard.ts:98-116),
  `emitDiscardObservability` (:205-220), `renderFollowUpTurn`
  (query-followup-render.ts:106-135), `runRespondRepairLoop`
  (query-respond-repair.ts:230-307), `runUntypedQueryLoop`
  (query-tool-loop.ts:366-450), `runTypedQueryLoop` (:485-800) — every body is
  implemented; none is inert or returns a sentinel.
- Site-count check: grep for the stub-claim phrases (`stubs this inert`,
  `stubs every behaviour-bearing`, `stubbed inert`, `stubs the two`,
  `NON-COMPLIANTLY`, `V13c-T stubs`, `implementation is absent`, `fills it in`,
  `fills them in`, `fills these in`, `fills the scope|renderer|loop`) across
  the 15 files of this review scope returns exactly the sites cited; the other
  eight scope files (invoke-*, no-rollback, query-error, query-schema-lowering,
  query-swallowing-handler) carry past-tense or accurate narration and are not
  cited.
- Git-history intent: `git log --reverse` per file shows the tests-task commit
  introducing each paragraph and the paired implementation commit landing
  without revising it (pairs listed above).
- Overlap check: the prior stale-narration filings cover other directories
  (qw20260907130901-d2-01: binder/ + diagnostics/diagnostic.ts; -d2-08:
  extension/inventory-closure-audit.ts + load-pre-eval.ts; -d2-09: discovery/ +
  placeholder.ts + drain-state.ts) and other single files
  (value-model, tool-call, schema-validator, lowering-system, lexer/parser
  seams, extension modules, factory header) — none cites any of these seven
  files or these lines. qw20260907130901-d2-02-ceiling-arbitration cites
  query-tool-loop.ts:38-41 for a different claim (the V16a consult sentence),
  disjoint from the lines here.
- Behaviour check: comments only; no code, test, or tool reads these strings
  (they are not registry messages or spec-quoted bytes).

## Triage
