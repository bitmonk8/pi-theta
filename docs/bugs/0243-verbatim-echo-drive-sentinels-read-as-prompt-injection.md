# Bug 0243 — Live drive sentinels of the shape `` @`Reply with exactly this text and nothing else: <token>` `` read as prompt injection to current models and draw refusals: 14 refusal instances across 8 distinct live cells in one campaign, six cells hardened under an operator grant, and 47 files (95 occurrences) at HEAD still carry the shape — each an unhardened coin-flip

- **Status:** open.
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
