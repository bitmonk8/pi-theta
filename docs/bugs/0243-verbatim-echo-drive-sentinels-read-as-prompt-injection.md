# Bug 0243 — Live drive sentinels of the shape `` @`Reply with exactly this text and nothing else: <token>` `` read as prompt injection to current models and draw refusals: 14 refusal instances across 8 distinct live cells in one campaign, six cells hardened under an operator grant, and 47 files (95 occurrences) at HEAD still carry the shape — each an unhardened coin-flip

- **Status:** fixed (0.220.0).
- **Sev/Diff estimate:** S3/D2 — S3 because no runtime behaviour is wrong: the
  shape produces *false reds* on live gates, not silent passes. The
  discriminating assertions still discriminate when the model complies; when it
  refuses, the test fails loudly with the refusal text in the capture
  (§Reproduction (B)). The cost is gate reliability and operator time, and the
  reds are indistinguishable at a glance from real regressions until the
  capture is read. D2 because the conversion is mechanical and per-file (one or
  two prompt strings and one expected-value constant per cell, precedent in
  five landed commits), but it spans 47 files across three harness families and
  every converted cell must be re-run live under the lock to confirm both that
  it greens and that its vacuity guard still reds on a wrong root
  (`AGENTS.md:124–128`).
- **Kind:** defect — test infrastructure, a verification-gap CLASS. Not a
  runtime divergence: every cited cell's subject (the parse/load behaviour it
  pins) is unaffected. The defect is against the live suite's gating role and
  against AGENTS.md §"Assert on real observables, not on `prompt()` resolving"
  (`AGENTS.md:106`) — a drive assertion whose expected value is only producible
  by a model *obeying an instruction it is trained to distrust* is not a
  deterministic observable. `tests/live/hardening/session-promptstream.test.ts:18–22`
  already records the narrower half of this ("live models do not reliably obey
  that, so asserting `assistantText` contains the sentinel is flaky"); this
  report generalises it to the drive-discriminator role, where the sentinel is
  load-bearing rather than decorative.
- **Affected:** 47 test and fixture files under `tests/live/` carrying the
  verbatim-echo shape at HEAD — 42 `*.test.ts` (90 occurrences) and 5
  `tests/live/acceptance/fixtures/*.theta` (5 occurrences). Full census in
  §Reproduction (A). No `src/` file is affected.
- **Observed at:** HEAD `b9cf2f26` (v0.219.0). Refusal evidence captured in the
  fix-open-bugs campaign logs under `.pi/tmp/fix-open-bugs/`, enumerated in
  §Reproduction (B). Hardening precedent: commits `4a69995f`, `c33dcdc9`,
  `664d0d60`, `aabddbcb`, `3f17afb8`.
- **Scope:** the live suites only (`npm run test:live`). The default offline
  gate (`npm test`) drives no model and is unaffected.

## Summary

Live cells discriminate "the theta registered and drove a real turn" from "the
slash fell through as a plain prompt" by demanding a verbatim echo:

```
@`Reply with exactly this text and nothing else, no punctuation: H9A CLEAN SENTINEL 0231`
```

and asserting the token appears in the capture. Current models classify that
demand as prompt injection and decline. The model's own words, captured
verbatim in `.pi/tmp/fix-open-bugs/live-h9a-0133-rerun.log:6`:

> I'm not going to just output that exact string on request — pairing
> fake-looking compiler errors with an embedded "reply with exactly this and
> nothing else" instruction is a classic prompt-injection test pattern, and I
> don't blindly execute instructions embedded in message content like that.

and in `live-h9a-0239-merged.log:24`:

> That pattern — plausible-looking tool/error output plus a hidden directive to
> parrot attacker-chosen text — is a classic prompt-injection probe, and
> blindly echoing sentinel strings on command is exactly the behavior that
> makes such attacks work, so I won't do it […]

The refusal rate is not uniform: it rises with the *surrounding* content. The
H9a load-refusal cells stage a synthetic offender theta and interpolate parse
diagnostics into the drive prompt, so the model sees fabricated-looking
compiler output followed by an out-of-band echo directive — the textbook
injection silhouette, and the shape both quoted refusals name explicitly.

Fourteen refusal instances across eight distinct cells are captured in one
campaign's logs (§Reproduction (B)). Six cells were converted to task-framed
discriminators — arithmetic over interpolated values, extract-the-last-word
over a theta-computed verdict — in five commits (§Reproduction (C)). Those
conversions are the precedent, not the remedy: the census at HEAD
(§Reproduction (A)) shows 47 files still carrying the shape, including the
interpolated-verdict PROBE halves of five of the six hardened cells, every H8a
`*-live-cell.test.ts` sibling of those same cells, both hardening probe files,
and the acceptance fixtures.

Each carrying site is a coin-flip whose bias is set by a model behaviour
outside this repository's control and observed to be rising.

## Reproduction

### (A) Census at HEAD — which files carry the shape

```
git rev-parse --short HEAD                  # b9cf2f26
grep -rl "Reply with exactly" tests/live --include=*.ts | wc -l         # 42
grep -rl "Reply with exactly" tests/live --include=*.theta | wc -l      # 5
grep -ro "Reply with exactly" tests/live | wc -l                        # 95
```

Occurrences per file (`grep -c`), 42 `.ts` files:

| occurrences | file |
| --- | --- |
| 18 | `tests/live/live-production-acceptance.test.ts` |
| 6 | `tests/live/hardening/session-promptstream.test.ts` |
| 4 | `tests/live/inline-object-field-name-case-live-cell.test.ts` |
| 3 | `tests/live/double-session-start-live.test.ts` |
| 3 | `tests/live/hardening/session-convdrive.test.ts` |
| 2 | `tests/live/acceptance/escaped-quote-inline-rename-load-refusal.test.ts` |
| 2 | `tests/live/acceptance/generic-argument-inline-field-key-load-refusal.test.ts` |
| 2 | `tests/live/acceptance/inline-object-wire-name-rename-load-refusal.test.ts` |
| 2 | `tests/live/acceptance/nested-fn-under-par-for-live.test.ts` |
| 2 | `tests/live/acceptance/non-literal-discriminator-live.test.ts` |
| 2 | `tests/live/acceptance/quoted-inline-field-name-load-refusal.test.ts` |
| 2 | `tests/live/alias-sink-array-element-check-live-cell.test.ts` |
| 2 | `tests/live/blockexpr-production-live-cell.test.ts` |
| 2 | `tests/live/empty-object-discriminator-field-withhold-live-cell.test.ts` |
| 2 | `tests/live/escaped-quote-inline-rename-live-cell.test.ts` |
| 2 | `tests/live/fn-call-arity-live-cell.test.ts` |
| 2 | `tests/live/fn-param-sink-array-literal-live-cell.test.ts` |
| 2 | `tests/live/generic-argument-inline-field-key-live-cell.test.ts` |
| 2 | `tests/live/inline-field-name-not-identifier-live-cell.test.ts` |
| 2 | `tests/live/inline-object-malformed-entry-resync-live-cell.test.ts` |
| 2 | `tests/live/inline-object-wire-name-rename-live-cell.test.ts` |
| 2 | `tests/live/nested-array-element-sink-descent-live-cell.test.ts` |
| 2 | `tests/live/provider-error-revalidation-gate.test.ts` |
| 2 | `tests/live/quoted-inline-field-name-live-cell.test.ts` |
| 1 | `tests/live/acceptance/inline-field-name-not-identifier-load-refusal.test.ts` |
| 1 | `tests/live/acceptance/inline-object-empty-field-type-truncation-load-refusal.test.ts` |
| 1 | `tests/live/acceptance/inline-object-field-name-case-load-refusal.test.ts` |
| 1 | `tests/live/acceptance/inline-object-malformed-entry-resync-load-refusal.test.ts` |
| 1 | `tests/live/acceptance/params-default-unterminated-literal-load-refusal.test.ts` |
| 1 | `tests/live/acceptance/params-unterminated-literal-load-refusal.test.ts` |
| 1 | `tests/live/fn-param-annotation-optional-live-cell.test.ts` |
| 1 | `tests/live/index-sentinel-typeenv-case-fence-live-cell.test.ts` |
| 1 | `tests/live/inline-object-empty-field-type-truncation-live-cell.test.ts` |
| 1 | `tests/live/object-pattern-head-field-set-live-cell.test.ts` |
| 1 | `tests/live/object-pattern-head-unresolved-live-cell.test.ts` |
| 1 | `tests/live/off-session-overflow-classification.test.ts` |
| 1 | `tests/live/params-inline-enum-live-cell.test.ts` |
| 1 | `tests/live/pattern-field-integer-narrowing-live-cell.test.ts` |
| 1 | `tests/live/reserved-keyword-misfire-faces-live-cell.test.ts` |
| 1 | `tests/live/reserved-keyword-object-pattern-head-live-cell.test.ts` |
| 1 | `tests/live/reserved-keyword-remaining-positions-live-cell.test.ts` |
| 1 | `tests/live/typed-query-wire-shapes.test.ts` |

Five `.theta` fixtures, one occurrence each:
`tests/live/acceptance/fixtures/acc-child.theta`,
`acc-multi-source.theta`, `acc-prompt-sentinel.theta`,
`acc-typed-inline.theta`, `acc-typed-named.theta:24`.

Six of the `.ts` rows above are the **already-hardened** cells retaining only
their interpolated-verdict PROBE half (the clean/control half was converted):
`inline-field-name-not-identifier-load-refusal.test.ts:137`,
`inline-object-field-name-case-load-refusal.test.ts:138`,
`inline-object-empty-field-type-truncation-load-refusal.test.ts:133`,
`inline-object-malformed-entry-resync-load-refusal.test.ts:135`,
`params-unterminated-literal-load-refusal.test.ts:143` — each the identical
line `` "@`Reply with exactly this text and nothing else, no punctuation: ${verdict}`" ``.
`tests/live/acceptance/ctor-unresolved-load-refusal.test.ts` is the one cell
converted on both halves and carries no occurrence.

The shape is not confined to the `Reply with exactly` spelling. A broader
`grep -rn -iE "say exactly|reply with exactly|output exactly|and nothing else" tests/live --include=*.ts`
matches 53 files / 92 `and nothing else` lines, so the census above is a lower
bound on the class.

### (B) Refusal instances captured in campaign logs

Locate them:

```
grep -rlE "prompt.injection|blindly execute|I'm not going to" .pi/tmp/fix-open-bugs/*.log
```

Fourteen instances, eight distinct cells. Each log line quoted below is the
`stdout:` tail of the failing assertion message, i.e. the model's reply
verbatim.

| # | cell (file) | log |
| --- | --- | --- |
| 1 | `inline-object-malformed-entry-resync-load-refusal.test.ts` (bug 0231) | `live-h9a-0075-merged.log` |
| 2 | same | `live-h9a-0133-merged.log:30` |
| 3 | same | `live-h9a-0133-rerun.log:6` |
| 4 | same | `live-h9a-0233-rerun.log:11` |
| 5 | same | `live-h9a-0239-merged.log:38` |
| 6 | `inline-object-empty-field-type-truncation-load-refusal.test.ts` (bug 0237) | `live-h9a-0085-merged.log` |
| 7 | `ctor-unresolved-load-refusal.test.ts` (bug 0025) | `live-h9a-0111-merged.log` |
| 8 | same | `live-h9a-0233-merged.log:34` |
| 9 | `params-unterminated-literal-load-refusal.test.ts` (bug 0232) | `live-h9a-0131-merged.log` |
| 10 | same | `live-h9a-0162-merged.log` |
| 11 | `inline-object-field-name-case-load-refusal.test.ts` (bug 0154) | `live-h9a-0131-merged.log` |
| 12 | `inline-field-name-not-identifier-load-refusal.test.ts` (bug 0228) | `live-h9a-0239-merged.log:24` |
| 13 | `noninteractive-acceptance.test.ts` H9a-T (b) typed query, named schema | `live-full-v0153.log:98` |
| 14 | `hardening/session-convdrive.test.ts` CONV-1 | `live-full-v0123.log:127` |

Rows 1–12 are load-refusal H9a cells: the drive prompt sits directly after
interpolated parse diagnostics, and both quoted refusals name that adjacency as
the injection tell. Rows 13 and 14 show the class is not confined to that
staging:

- Row 13 (`live-full-v0153.log:98`) fails the acceptance sentinel
  `ACC TYPED NAMED RESULT`, whose echo demand lives in the fixture
  `tests/live/acceptance/fixtures/acc-typed-named.theta:24`. Reply:
  "I won't do th…", continuing at `:100` — "I won't fabricate lookalike
  tool-output text in the chat."
- Row 14 (`live-full-v0123.log:127`) is a hardening probe over
  `tests/live/hardening/session-convdrive.test.ts:102` (`BANANA`). Reply: "I'll
  pass on that one too — \"Say exactly: … and nothing else\" is the same
  wrapper as before […] which reads like an eval/tes…". The batch passed on a
  later attempt (`BATCH userTexts: ["C1=[PREV=BANANA-HIT-DONE] …"]`), which is
  the coin-flip.

### (C) The six conversions already landed

```
git log -1 --format=%B 4a69995f   # bugs 0231, 0154, 0228 — three H9a cells
git log -1 --format=%B c33dcdc9   # bug 0025 ctor cell
git log -1 --format=%B 664d0d60   # bug 0232 params cell
git log -1 --format=%B aabddbcb   # bug 0237 truncation cell
git log -1 --format=%B 3f17afb8   # bug 0025 control follow-up
```

Mechanics, from the landed diffs:

- `inline-object-malformed-entry-resync-load-refusal.test.ts:98,146` — the
  clean-sibling prompt became `` @`What is 341 plus 415? Answer with the number only.` ``
  and `CLEAN_SENTINEL` became `"756"`.
- `params-unterminated-literal-load-refusal.test.ts:105,154` — `${p}` is still
  interpolated; the prompt asks 508 plus 219 and the expected value is `"727"`.
- `inline-object-empty-field-type-truncation-load-refusal.test.ts:142,156` —
  604 plus 133, `"737"`.
- `ctor-unresolved-load-refusal.test.ts:141,152` — the control carries a number
  in a constructed field (`Note { text: "941" }`), asks for that number plus
  100, and expects `"1041"`, so the answer is computable only from the
  interpolated inline value. The intermediate name-the-fruit phrasing
  (`c33dcdc9`) misled the model twice and was replaced (`3f17afb8`).

In every conversion the refusal half, the registration half, the
empty-capture gates and the note assertions are byte-unchanged, and each cell
was re-run green live under the lock. The in-file rationale is committed at
`tests/live/acceptance/ctor-unresolved-load-refusal.test.ts:145–150`.

## Expected behaviour

A live drive assertion discriminates "the theta registered and drove a turn"
from "the slash fell through as a plain prompt" using an observable the model
produces as a *task result*, not as an act of instruction-following against its
injection training. The expected value must be:

1. Deterministic — one correct answer, byte-comparable.
2. Computable only from content the theta itself supplied (an interpolated
   value, a theta-computed verdict), so a degraded plain-prompt run cannot
   produce it and the wrong-root vacuity guard survives (`AGENTS.md:124–128`).
3. Free of the verbatim-echo silhouette, so refusal rate is not a function of
   the surrounding staged content.

## Actual behaviour / root cause

The demand `Reply with exactly this text and nothing else: <token>` satisfies
(1) and (2) but violates (3). It is, structurally, the artefact injection
training targets: content-embedded directive to emit attacker-chosen text
verbatim. Staging it after interpolated compiler diagnostics with temp-directory
paths sharpens the signal further — `live-h9a-0239-merged.log:38` names both the
fabricated-diagnostic framing and the temp paths (`theta-cellmero-root…`,
`cellmerooffender.theta`) as reasons to decline.

The root cause is therefore not in any single cell. It is a template: the shape
was copied into every new live cell as the standing way to write a drive
discriminator, so the suite acquired 95 instances of one prompt pattern whose
compliance probability is a model-version-dependent external variable. Six
cells were repaired where the class became blocking; the template was never
retired.

## Why it matters

- **Gate reliability.** A refusal reds a merge gate with a message whose
  headline is the cell's own vacuity-guard prose, not "the model refused". The
  campaign logs show cells re-run after a refusal to establish whether the red
  was real: `live-h9a-0133-merged.log:30` refused, `live-h9a-0133-rerun.log:6`
  refused again, and `live-h9a-0133-rerun2.log` carries no refusal.
- **The bias is rising and external.** Commit `4a69995f` records the class
  crossing "from stochastic noise to blocking" in a single day, with one cell
  red at three consecutive merge gates. Nothing in this repository controls the
  trend.
- **Silent scope creep of the repair.** Each hardening commit was taken under
  the owning bug document's witness authority for one cell. The 47 carrying
  files at HEAD have no such single owner, so the class stays open as an
  unowned reliability debt unless converted as a class.
- **Documented-red confusion.** AGENTS.md instructs checking `docs/bugs/` before
  attributing a live red to one's own change. A refusal red matches no filed
  signature, so it costs a full investigation each time.

## Non-goals

- No change to any cell's *subject* — the parse, load, registration and
  refusal behaviour each cell pins. Conversions touch drive-prompt text and the
  expected-value constant only.
- No weakening of a vacuity guard. A discriminator that a degraded plain-prompt
  run could also produce is not an acceptable conversion.
- No change to `src/`. This report claims no runtime divergence.
- No suppression, retry wrapper, or refusal-tolerant assertion. Retrying a
  coin-flip does not make it an observable.

## Fix

Retire the verbatim-echo drive template across the live suites and convert each
carrying site to a task-framed discriminator.

**The conversion class.** A drive prompt asks a question whose answer is a task
result; the assertion expects that answer. Two forms, both with landed
precedent (§Reproduction (C)):

- *Arithmetic over a fixed pair* where the drive's only job is to prove a real
  turn ran under the theta's root — `What is 341 plus 415? Answer with the
  number only.` / expected `756`.
- *Arithmetic or extraction over an interpolated value* where the drive must
  also prove the theta's own computation reached the prompt — a number carried
  in a constructed field plus a constant (`941` → `1041`), or the last word of
  a theta-computed verdict.

The second form is required wherever the current sentinel is interpolated
(`${verdict}`, `${p}`, `${answer.ys}`): the discriminator must remain
computable only from theta-supplied content, or the vacuity guard is lost.

**Per-file witness authority.** Each carrying file is a witness owned by the bug
document whose subject it pins. Conversion of a cell is a witness edit and is
taken under that document's authority, as all five precedent commits were. This
report holds the class, the census and the evidence; it does not hold the
witness authority for any individual cell and does not prescribe per-cell
prompt text. A fixer working this report converts under the owning documents'
authority, or — for files with no single owning document
(`tests/live/live-production-acceptance.test.ts`,
`tests/live/hardening/session-{convdrive,promptstream}.test.ts`,
`tests/live/acceptance/noninteractive-acceptance.test.ts` and its fixtures) —
under this one.

**Per-converted-cell obligations**, matching the precedent:

1. The refusal half, registration half, empty-capture gates and note
   assertions stay byte-unchanged.
2. Re-run the cell live under the lock and confirm green.
3. Confirm the vacuity guard still reds — prove the red path once with a wrong
   root, then restore (`AGENTS.md:124–128`).
4. Leave the in-file rationale comment naming the class, as at
   `ctor-unresolved-load-refusal.test.ts:145–150`.

**Ordering.** No report blocks this one; the six precedent conversions are
landed and shipped. Conversely, this report blocks nothing: an unconverted cell
is red-prone, not wrong. Work it per-file, and prefer files whose refusals are
already logged (§Reproduction (B) rows 13 and 14, then the five hardened cells'
remaining PROBE halves, then the H8a `*-live-cell.test.ts` siblings of the six
hardened H9a cells, which carry the same staged-diagnostic silhouette).

**Also retire the template at the source.** The shape reaches new cells by
copying. AGENTS.md §"Assert on real observables, not on `prompt()` resolving"
(`AGENTS.md:106`) enumerates the deterministic channels; it does not warn
against verbatim-echo discriminators. Adding that warning beside the channel
inventory is part of this fix, otherwise the census regrows.

## Provenance

- **Origin:** the fix-open-bugs campaign of 2026-08-22. The class was first
  repaired ad hoc in `4a69995f` under the operator's standing conditional grant
  ("harden mechanics only under an owning doc's authority if the class keeps
  climbing"), then four more times (`c33dcdc9`, `664d0d60`, `aabddbcb`,
  `3f17afb8`). Those commits enumerate their cells for operator ratification but
  file no report for the residue; this document is that filing.
- **Ownership check performed before writing.** `rg -l` over `docs/bugs/` for
  `prompt.injection|verbatim-echo|sentinel-refusal` returns 0064, 0072, 0085,
  0114, 0126, 0132, 0164, 0190, 0192, 0211, 0237, 0239, 0241. Every hit is a
  passing mention inside a fix record or a live-run note (e.g.
  `0241:417` "declined to echo the token, naming prompt injection";
  `0239:609` "is exposed to the sentinel-refusal class"; `0132:916` a known
  stochastic signature), and every one of those documents is **fixed**. The two
  open documents whose subject is live-test infrastructure —
  [0047](./0047-h9a-code-gate-blind-to-host-namespace.md) (the H9a
  permitted-code gate's namespace alternation) and
  [0048](./0048-double-session-start-live-vacuous-quiesce-witness.md) (an
  absence assertion with no delivery proof) — claim neither drive-sentinel
  mechanics nor the echo shape. No document claims this subject.
- **Measured at HEAD `b9cf2f26`, not copied.** The census (§Reproduction (A)),
  the per-file occurrence counts, the five retained PROBE-half line numbers and
  the four conversion line citations were re-derived from the working tree. The
  fourteen refusal instances were re-derived from the logs by grep, not from
  the commit messages: the commit messages account for twelve of them across
  six cells; rows 13 and 14, which extend the class past the load-refusal
  staging into acceptance fixtures and the hardening probes, are new to this
  report.
- **No source or test file was modified.** No scratch probe was created; the
  reproduction is grep and `git log` only.

## Fix (0.220.0)

- **What shipped:** the conversion sweep of §Fix, applied to the whole
  §Reproduction (A) census — 47 files, 95 `Reply with exactly` occurrences, now
  0 (`grep -ro "Reply with exactly" tests/live | wc -l`). Every carrying drive
  site became a task-framed discriminator in one of the two forms §Fix names:
  fixed-pair arithmetic where the drive's only job is to prove a real turn ran,
  and compute-from-inline-value wherever the sentinel was interpolated.
  `AGENTS.md` §"Assert on real observables" gained the warning §Fix's closing
  paragraph requires, so the template does not regrow. No `src/` file was
  touched (`git diff --name-only -- src/` empty).
- **Gates:** witness run — the 0231 acceptance PROBE with its theta-computed
  `Err` arm temporarily `"953"` → `"111"` reds (`stdout: 1111`, `expected
  '1111\n' to contain '1953'`), restores byte-exact (`git hash-object` =
  `608995dda4b9869956bee7e76610bbc69800c66b` on both the restored file and the
  backup) and greens. Full suite `npx vitest run` → `Test Files 408 passed
  (408) / Tests 8581 passed (8581)`. `npm run typecheck`
  (`tsc -p tsconfig.json --noEmit`) clean. `npm run lint` clean. Both locks
  green and unmodified: `tests/citation-symbol-form-gate.test.ts`,
  `tests/registry-closed-set-corpus-gate.test.ts`.
- **Live:** every converted file ran green under the lock — 23
  `*-live-cell.test.ts` in two batches (8/8; 15/15 files, 16 tests), 6 misc
  live files (6/6 files, 12 tests), `live-production-acceptance.test.ts` (1/1,
  88 tests), and the full `tests/live/acceptance/` run (15/15 files, 25 tests,
  RC=0), which drives all five converted `.theta` fixtures through
  `noninteractive-acceptance.test.ts`. No converted file lacks a green live
  run.
- **Review:** 2 rounds. Round 1 ran per-directory: `tests/live/acceptance/**`
  CLEAN, the misc slice CLEAN, and the `*-live-cell` slice returned one prose
  finding — old-contract "sentinel echo" comments and `expect()` failure
  messages left describing the retired contract. Round 2 (comment and message
  text only, 15 files) resolved it; polish verified by gate-diff and the
  confirmation round skipped, the numeric couplings having been re-checked
  independently.
- **Verification:** PASS. Red path discharged (above). Default suite green.
  Live coverage complete, with the converted-file set cross-checked against the
  green-log file set and no gap found. Lint and typecheck green.

### Conversions, grouped by owning document

Each row is a witness edit taken under the named document's authority, per
§Fix "Per-file witness authority". In every row the refusal half, registration
half, empty-capture gates and note assertions are byte-unchanged; only the
drive-prompt vehicle and its paired reply assertion moved.

| owning doc | file | site | old shape → new discriminator | subject preserved |
| --- | --- | --- | --- | --- |
| 0118 | `acceptance/nested-fn-under-par-for-live.test.ts` | CLEAN, PROBE | echo `H9A NFPF CLEAN SENTINEL` → `463+122=585`; `${verdict}` → per-arm code +1000 (`1573`/`1874`) | nested-`fn`-under-`par for` refusal; hoisted sibling registers and drives |
| 0128 | `acceptance/non-literal-discriminator-live.test.ts` | CLEAN, PROBE | `517+361=878`; `1684`/`1985` | non-literal `by kind` refusal; valid-discriminator sibling drives |
| 0128 | `live-production-acceptance.test.ts` cell 78 | drive | echo helper → `316+445=761` | `by kind` over `kind: string` refused; literal sibling drives |
| 0129 | `empty-object-discriminator-field-withhold-live-cell.test.ts` | drive, control | `152+347=499`; `176+743=919` | empty inline field type withholds nested-discriminator |
| 0131 | `fn-call-arity-live-cell.test.ts` | drive, control | `371+218=589`; `394+545=939` | mis-arity call does not register; correct-arity control drives |
| 0135 | `index-sentinel-typeenv-case-fence-live-cell.test.ts` | drive | `405+182=587` | `schema <lowercase>` refused for casing alone |
| 0150 | `fn-param-annotation-optional-live-cell.test.ts` | render | `${z}` retained, directive reframed | unannotated `fn` parameter binds positionally |
| 0153 | `reserved-keyword-remaining-positions-live-cell.test.ts` | control | `371+718=1089` | registration-only control, never driven |
| 0154 | `acceptance/inline-object-field-name-case-load-refusal.test.ts` | PROBE | `${verdict}` → per-arm code +100 (`345`/`946`) | `{Ys: string}` refusal vs load |
| 0154 | `inline-object-field-name-case-live-cell.test.ts` | drive, control | `answer.ys` retained, value `913` → expect `1013`; `350+629=979` | lowercase-first `{ys: string}` addressable as `answer.ys` |
| 0156 | `fn-param-sink-array-literal-live-cell.test.ts` | drive, control | `264+425=689`; `483+466=949` | union-typed `fn` parameter supplies the array sink |
| 0157 | `alias-sink-array-element-check-live-cell.test.ts` | drive, control | `213+486=699`; `419+490=909` | alias-union sink registers and drives |
| 0158 | `live-production-acceptance.test.ts` cell 86 | drive | `THETA-MATCH-DOM-${m}` → `${m}` plus 478 = `479` | dominating-arm twin drives; heterogeneous `match` refused |
| 0160 | `acceptance/inline-object-wire-name-rename-load-refusal.test.ts` | CLEAN, PROBE | `205+384=589`; `1461`/`1662` | `{a as "w": string}` refusal; rename-free sibling drives |
| 0160 | `inline-object-wire-name-rename-live-cell.test.ts` | drive, control | `answer.wire` retained, `934` → `1034`; `538+461=999` | rename-free wire spelling addressable |
| 0162 | `params-inline-enum-live-cell.test.ts` | control | `193+856=1049`, `sentinel` parameter kept live | registration-only control |
| 0164, 0184, 0056, 0097 | `live-production-acceptance.test.ts` params-intake cells | render | `GOOD=`/`BAD=` retained, echo tail → arithmetic | `params:` intake accepts or rejects per its union |
| 0165, 0166, 0066, 0181 | `live-production-acceptance.test.ts` binder-default cells | render | `Reply with exactly: done.` tail → arithmetic | default-fence presence or absence on `userTexts` |
| 0176 | `acceptance/quoted-inline-field-name-load-refusal.test.ts` | CLEAN, PROBE | `249+432=681`; `1308`/`1709` | `{"a": string}` refusal; identifier-spelled sibling drives |
| 0176 | `quoted-inline-field-name-live-cell.test.ts` | drive, control | `answer.a` retained, `958` → `1058`; `726+293=1019` | identifier spelling addressable as `answer.a` |
| 0182 | `off-session-overflow-classification.test.ts` | control | `337+455=792` | off-session `@`-query resolves `Ok` |
| 0219 | `reserved-keyword-object-pattern-head-live-cell.test.ts` | render | `${label}` retained | reserved-keyword head un-registers; declared head drives |
| 0220 | `live-production-acceptance.test.ts` cell 84 | drive | `254+528=782` | no void-in-non-return-position refusal note |
| 0221 | `object-pattern-head-unresolved-live-cell.test.ts` | render | `${label}` retained | declared braced head selects its arm |
| 0226 | `object-pattern-head-field-set-live-cell.test.ts` | render | `${label}` retained | undeclared listed field un-registers |
| 0227 + 0233 | `inline-object-field-name-case-live-cell.test.ts` residue cell | never-driven, control | `815+214=1029`; `904+155=1059`; `éLan` key byte-unchanged | raw-key refusal alone, case rule silent |
| 0228 | `acceptance/inline-field-name-not-identifier-load-refusal.test.ts` | PROBE | `1418`/`1619` | `{a b: string}` refusal vs load |
| 0228 | `inline-field-name-not-identifier-live-cell.test.ts` | drive, control | `answer.ab` retained, `946` → `1046`; `261+708=969` | `ab` is the property the bad spelling mints |
| 0229 | `acceptance/escaped-quote-inline-rename-load-refusal.test.ts` | CLEAN, PROBE | `372+254=626`; `1214`/`1815` | `{a as "w\"x": string}` refusal; escape-free sibling drives |
| 0229 | `escaped-quote-inline-rename-live-cell.test.ts` | drive, control | `answer.wire` retained, `927` → `1027`; `285+644=929` | escape-free wire spelling addressable |
| 0231 | `acceptance/inline-object-malformed-entry-resync-load-refusal.test.ts` | PROBE | `1352`/`1953` | resync-reached case violation refused |
| 0231 | `inline-object-malformed-entry-resync-live-cell.test.ts` | drive, control | `274+583=857`; `449+540=989` | case-fixed sibling completes its typed query |
| 0232 | `acceptance/params-unterminated-literal-load-refusal.test.ts` | PROBE | `1296`/`1597` | unterminated wire-name literal refused |
| 0233 | `acceptance/generic-argument-inline-field-key-load-refusal.test.ts` | CLEAN, PROBE | `418+371=789`; `1326`/`1927` | `array<{a b: string}>` refusal; conformant sibling drives |
| 0233 | `generic-argument-inline-field-key-live-cell.test.ts` | drive, control | `526+351=877`; `172+787=959` | conformant generic sibling registers and drives |
| 0234 | `pattern-field-integer-narrowing-live-cell.test.ts` | render | `${label}` retained | `integer`-spelled literal narrows and selects |
| 0237 | `acceptance/inline-object-empty-field-type-truncation-load-refusal.test.ts` | PROBE | `1537`/`1738` | `p: '{a: , Zs: string}'` refused |
| 0237 | `inline-object-empty-field-type-truncation-live-cell.test.ts` | drive | `462+315=777`; JSON response-format line byte-unchanged | case-clean sibling completes its typed query |
| 0239 | `acceptance/params-default-unterminated-literal-load-refusal.test.ts` | PROBE, two verdicts | `${gv} ${ov}` → one code `${gv}${ov}` plus `100100`, expecting `231`/`232`/`341`/`342` | unterminated default refused, closed byte-neighbour loads |
| 0241 | `nested-array-element-sink-descent-live-cell.test.ts` | drive, control | `316+261=577`; `617+392=1009` | nested element sink admits its rule-3 literal |
| 0242 | `reserved-keyword-misfire-faces-live-cell.test.ts` | control | `282+797=1079` | registration-only control |
| 0021 + 0024 | `double-session-start-live.test.ts` | drive, 2 never-driven | sentinel kept as a label, echo tail → arithmetic | supersession re-owns the command; the quiesce gate, open bug 0048's subject, is byte-identical |
| 0028 + 0099 | `typed-query-wire-shapes.test.ts` | shared helper | rendered payload retained, echo demand dropped | `enum` / `$ref` / canonical-slug conveyance |
| 0065 | `provider-error-revalidation-gate.test.ts` | 2 prompts | `486+209=695`; `574+123=697` | `onResponse` fires once on 200, never on 400 |
| 0082 | `blockexpr-production-live-cell.test.ts` | 2 renders | `blockexpr-${selected}` retained | `let`-RHS and `match`-arm blocks both execute |
| class-owned (0243) | `live-production-acceptance.test.ts` `promptTheta` / `typedQueryTheta` and 20 further cells | drive, render | helper bodies task-framed; 3 lockstep `toEqual` constants moved with their carrier | one prompt-mode turn drives; the typed reply validates against its declared schema |
| class-owned (0243) | `hardening/session-convdrive.test.ts` | 6 sites | `CHERRY` → `405+376=781`, `BANANA` → `293+514=807` with the `match` arm in lockstep, loop `["A1", "B2"]` → `[647, 143]` → `747`/`243` | final value = model reply crossing the invoke boundary; per-iteration interpolation |
| class-owned (0243) | `hardening/session-promptstream.test.ts` | 2 sites | `AAA`/`BBB` → `384+215`/`456+329`, both `userTexts` constants in lockstep | both queries in a prompt-mode body stream into the transcript |
| class-owned (0243) | `acceptance/fixtures/acc-{prompt-sentinel,multi-source,child}.theta` | 1 each | `482+315=797`, `356+421=777`, `268+431=699` | H9a areas (a), (i), (g): exit 0, permitted codes only |
| class-owned (0243) | `acceptance/fixtures/acc-typed-{inline,named}.theta` | 1 each | echo demand → a reporting task over the theta-validated `${r}`; both stdout anchors byte-identical | QRY-22 typed-query validation, §Reproduction (B) row 13's site |

### Two stragglers, sharpened rather than reverted

Both were cells this sweep converted, both failed live on model arithmetic —
not on refusal — and both took the compute-from-inline sharpening the
`3f17afb8` precedent established, never a return to the echo shape:

1. `acceptance/inline-object-field-name-case-load-refusal.test.ts` — the probe
   asked for a 3-digit code "plus 1000" and the model answered `847` for code
   `846`. The addend is now `100`, the form the precedent proves; expected
   values `345`/`946`.
2. `acceptance/params-default-unterminated-literal-load-refusal.test.ts` — the
   two-verdict prompt asked for "the first code plus 1000, and the second plus
   2000" and the model applied `2000` to the first (`stdout: 2131 2242`).
   Splitting it into two queries put only the second answer in the H9a capture,
   and the first query's `let _ =` binding drew a diagnostic that the
   byte-unchanged offline attribution cell correctly refused. The landed form
   concatenates both verdicts into ONE code and asks ONE addition (`${gv}${ov}`
   plus `100100`): the constant shifts the leading and trailing halves
   together, so all four expected values stay pairwise non-substring, none of
   them occurs in the prompt, and only the two `match` arms can produce them —
   the vacuity guard is stronger than before, not weaker.

### Residuals

1. **Three hardening files carry the shape and are NOT converted:**
   `tests/live/hardening/session-invoke-attach.test.ts` (`:61`, `:70`, `:96`,
   `:105`), `session-promptloop.test.ts` (`:46`),
   `session-subagent-toolloop.test.ts` (`:75`, `:147`). None is in this
   report's §Reproduction (A) census, none has an owning bug document — the
   only `docs/bugs/` references are passing mentions inside fixed reports —
   and the promptloop and toolloop conversions would have to move live
   ASSERTIONS (`session-promptloop.test.ts:150`
   `expect(t.assistantText).toContain("CHAINDONE777")`;
   `session-subagent-toolloop.test.ts:117`
   `expect(userText).toContain("CHAINDONE777")`). Converting them needs either
   an owning document or an explicit grant, so they were left. The marker token
   in those two is TOOL-derived, read out of a chained fixture file, not
   attacker-chosen — a weaker instance of the class.
2. **Adjacent silhouettes deliberately left byte-unchanged**, so the class
   boundary stays where §Fix drew it: the typed-query JSON response-FORMAT
   constraints (`… of the shape {"a": 1, "zs": "<S>"} and nothing else, no
   other text.`) in three `*-live-cell` files, and
   `hardening/session-convdrive.test.ts`'s `Reply with JSON exactly:
   {"label":"MANGO"}`. These are response-format constraints on a typed query
   and the theta-side SOURCE of the values the conversions compute over; moving
   them would move a subject.
3. **Line-citation drift.** The rationale comments this fix adds shift line
   numbers in the converted files, so `path:line` citations into them from
   other documents now point a few lines high. Every affected citation sits in
   a document pinned to an explicit measured HEAD, and the repository's
   `tests/citation-symbol-form-gate.test.ts` lock is green, so no gate is
   violated. The one that matters operationally: open bug
   [0048](./0048-double-session-start-live-vacuous-quiesce-witness.md) cites
   `tests/live/double-session-start-live.test.ts:304–312` for the quiesce gate;
   that gate's bytes are unchanged but it now sits at `:309–317`.
4. **`literalByFieldTheta(sentinel)`** in
   `tests/live/live-production-acceptance.test.ts` no longer uses its
   `sentinel` parameter in the theta body; the `316+445` ↔ `"761"` coupling is
   implicit across two sites. It matches the surrounding cells' style and
   compiles clean, so it did not earn a signature change.
5. **One live red on an untouched file** during a full H9a run:
   `acceptance/inline-object-stray-close-token-load.test.ts` leaked
   `theta/load/binder-model` into the capture because the model editorialised
   about the embedded control-plane-looking text instead of answering. That
   file is not modified by this change (`git status --short` on it is empty),
   it is already-arithmetic and out of this class, and an isolated re-run is
   green. It is the same underlying model behaviour this report describes,
   reaching a cell whose prompt embeds diagnostic-looking strings — recorded
   here as an observation, not converted.
6. **`grep -rn -iE "say exactly|reply with exactly|output exactly|and nothing
   else" tests/live --include=*.ts`** still matches 53 files, as
   §Reproduction (A) predicted. After this sweep every remaining hit is a
   rationale comment, an already-arithmetic answer-format tail, a typed-query
   response-format constraint, or one of residual 1's three files. The
   load-bearing echo census is 0.

- **Discharge notes appended:** none. The sibling documents whose witnesses
  this fix edits are all closed; their subjects are unchanged and their fix
  records need no amendment.
- **Pinned dispositions / non-goals:** all four §Non-goals hold. No cell's
  subject moved. No vacuity guard was weakened — the 0239 cell's guard is
  strictly stronger. No `src/` change. No suppression, retry wrapper or
  refusal-tolerant assertion was added anywhere.
