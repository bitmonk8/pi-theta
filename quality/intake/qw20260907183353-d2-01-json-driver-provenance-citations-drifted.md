---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: Eight line-number citations in subagent-json-driver.ts provenance comments no longer point at the mints they cite
lens: D2                     # the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending             # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/runtime/subagent-json-driver.ts:73-74
  - src/runtime/subagent-json-driver.ts:76
  - src/runtime/subagent-json-driver.ts:81-82
  - src/runtime/subagent-json-driver.ts:226
  - src/runtime/subagent-json-driver.ts:228
  - src/runtime/subagent-json-driver.ts:230
  - src/runtime/subagent-json-driver.ts:233
  - src/runtime/subagent-json-driver.ts:235
sites: 8                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# Eight line-number citations in subagent-json-driver.ts provenance comments no longer point at the mints they cite

## Observation
The `PROPAGATED_INVOKE_INFRA_CAUSES` doc block and the drive loop's `err`-arm
provenance comment anchor their per-cause claims with absolute `file:line`
citations into `production-theta-producer.ts` and `production-composition.ts`.
Every citation into those two files is stale: the cited lines today hold
unrelated code (deps-object members, argv fields, comments), while the mints
and call sites the comments name have moved 200-700 lines away. The five
citations into the small runtime siblings (`subagent-model-guard.ts`,
`subagent-params.ts`, `subagent-envelope.ts`, `subagent-root-regime.ts`) still
resolve.

## Evidence
src/runtime/subagent-json-driver.ts:73-82 (the `PROPAGATED_INVOKE_INFRA_CAUSES`
doc):

```ts
 *   - `parse_failure` — sole mint at `production-theta-producer.ts:3880`
 *     (`#driveCallee`); reaches the envelope only by body `?`-propagation.
 *   - `panic` — the child-side regime catch routes body panics to
 *     `internal_error` (`production-theta-producer.ts:2699`), so every
...
 *   - `subagent_model_unresolved` — minted PARENT-SIDE only (`guardResolvedModel`,
 *     `subagent-model-guard.ts:116`, thrown at
 *     `production-theta-producer.ts:2055`); the child-side preflight mints
```

src/runtime/subagent-json-driver.ts:226-235 (the `err`-arm comment):

```ts
          //   - `load_failure` — marked-root registration refusal (bug 0178,
          //     `subagent-root-regime.ts:218` → `production-composition.ts:1249`);
          //   - `validation` — params-intake refusal
          //     (`production-theta-producer.ts:2592`; `subagent-params.ts:313`);
          //   - `return_validation` — return-value refusal
          //     (`production-theta-producer.ts:2657/2660`;
          //     `subagent-envelope.ts:894/932`);
          //   - `internal_error` — child body panic / defect catch
          //     (`production-theta-producer.ts:2699`);
          //   - `subagent_model_preflight_mismatch` — child-side preflight
          //     (`production-theta-producer.ts:2573`; `subagent-model-guard.ts:164`).
```

What the cited lines hold today (`sed -n '2055p;2573p;2592p;2657p;2660p;2699p;3880p'
src/extension/production-theta-producer.ts`):

```
2055    // downward-only from the parent's signal (child aborts when the parent
2573    // PIC-65 launch. The spawn seam + executable host are wired at the composition
2592          noHostTools,
2657        thetaAbort,
2660        clock: root.clock,
2699      drive,
3880    signal: AbortSignal,
```

`production-composition.ts:1249` today is a `});` closing a
`typedQueryProviderWarning` block; the cited call is at :1333
(`const registrationRefusal = markedRootRegistrationRefusal({`).

Current anchors of the named constructs (grep at HEAD):
`cause: "parse_failure"` mint → production-theta-producer.ts:4173;
`guardResolvedModel(` call → :2280; `confirmChildModel(` call → :2853;
`intakeChildParams(` call → :2786; return-value refusal
(`mapNonRepresentableReturnValue(`) → :2940; child-side regime catch minting
`cause: "internal_error"` → :2967-2982 (mint at :2979).

## Why this is a problem
Historical narration drift: the numbers were correct when written and the cited
file moved on. At the commit that landed this comment block (af476df2, bug 0347
"err_provenance envelope sidecar"), `git show
af476df2:src/extension/production-theta-producer.ts` line 3880 IS the
`parse_failure` mint, line 2055 IS the `InvokeInfraCauseError` throw, and line
2592 IS the params-intake call — the producer has since grown past 7000 lines
and every producer/composition citation now lands a reader on unrelated code
(a deps-object field, an argv member, a launch comment). The same drift class
is already confirmed in sibling files (intake:
qw20260907183353-d2-01-producer-line-citations-drifted — comments *inside* the
producer; qw20260907183353-d2-02-composition-line-citations-drifted); neither
covers this file's comments.

## Suggested direction (non-binding, optional)
Refresh the eight numbers to the constructs' current anchors, or replace the
raw line numbers with symbol names (`#driveCallee`'s `parse_failure` arm,
`guardResolvedModel`, `intakeChildParams`, `confirmChildModel`,
`markedRootRegistrationRefusal`) that survive edits to the cited files.

## False-positive check
- Enumerated every `file:line` citation in the file (`grep -n -o
  "[A-Za-z0-9_./-]*\.\(md\|ts\):[0-9/]*" src/runtime/subagent-json-driver.ts`
  → 13 citations at 10 comment lines). Verified each by reading the cited line.
- The five runtime-sibling citations HOLD and are not claimed:
  subagent-model-guard.ts:116 and :164 are the two `cause:` lines of the
  guard/preflight mints; subagent-params.ts:313 is `refuseParams`'s
  `cause: "validation"` line; subagent-envelope.ts:894/932 fall inside the two
  `cause: "return_validation"` mint objects (891-897, 929-936);
  subagent-root-regime.ts:218 is `kind: "invoke_infra",` inside the
  `markedRootRegistrationRefusal` mint (217-222).
- Located the current anchor for every drifted number (grep transcripts in
  Evidence) — each named construct still exists, so this is comment drift, not
  a stale claim about deleted code.
- Git intent: `git log -S "production-theta-producer.ts:3880" --
  src/runtime/subagent-json-driver.ts` → af476df2 (bug 0347); at that commit
  lines 3880/2055/2592 hold exactly the constructs the comments name, proving
  the numbers were correct when written.
- Checked already-filed intake: the citation-drift findings on file cover
  comments located in production-theta-producer.ts, production-composition.ts,
  wire-translation/wire-form-depth-walk, invoke-provenance-ledger,
  theta-document, type-compat, params-registry, note-channel, import-separator,
  type-grammar, and tokenise sites; none lists a
  src/runtime/subagent-json-driver.ts location.

## Triage
