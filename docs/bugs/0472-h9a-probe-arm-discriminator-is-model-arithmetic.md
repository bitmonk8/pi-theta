# Bug 0472 — bug 0231's H9a probe cell discriminates the offender's load disposition by a MODEL-COMPUTED arithmetic answer (`verdict + 1000`), so a one-step model slip reds a run in which the refusal under test provably fired: an observed stdout of `954` (the Err arm's `953`, plus 1 instead of plus 1000) is scored identically to the pre-fix leak value `1352`

- **Status:** fixed (unreleased - commit/push only). No new package release is
  published. This fix is not part of the existing published package version;
  the shipment commit will supply the resolving SHA.
- **Sev/Diff estimate:** S4/D1 — S4 because no shipped behaviour is wrong: the
  refusal, the `match` arm, the registration set and the `parseSystemNoteCodes`
  measurement all held on the observed run; the defect is a live witness that
  cannot distinguish "the code path regressed" from "the model added the wrong
  number". D1 because the remedy is confined to the two arm prompts of one
  fixture string in one test file.
- **Kind:** defect — test fragility. The cell violates AGENTS.md §"Assert on
  real observables, not on `prompt()` resolving": `assistantText` is the
  stochastic channel and may only be asserted against a *fixture-pinned*
  sentinel, but the pinned sentinels `1953` / `1352` are not fixture-pinned
  values — they are the model's own two-input composition ("read the code out of
  the sentence, then add 1000"), so the assertion's subject is the model's
  arithmetic, not the theta's execution path.
- **Affected** (at `1dad42ac`, v0.466.0):
  - `tests/live/acceptance/inline-object-malformed-entry-resync-load-refusal.test.ts:240`
    — `expect(probe.stdout).toContain(REFUSED)`, `REFUSED = "1953"` (`:143`),
    `LOADED = "1352"` (`:144`).
  - the probe fixture at `:126`–`:137`: the `match` arms yield the strings
    `"352"` (Ok) / `"953"` (Err), and the drive is
    ``@`A load probe reported code ${verdict}. What is that code plus 1000? Answer with the number only.` ``
    — the arm identity reaches stdout ONLY through the model's answer to that
    composed question.
  - the same class in the same file at `:146`–`:150`: `CLEAN_SENTINEL = "756"`
    (`341 + 415`) is a fixed-pair question, the form AGENTS.md sanctions, and is
    NOT affected by this report; it is cited as the contrast.

## Symptom

One `npm run test:live` run of this file at `1dad42ac` red at `:240` with

```
probe: the offending theta must NOT load post-fix, so the prober's
invoke("./cellmerooffender.theta") resolves Err(InvokeInfraError) and the match
prints "1953". Printing "1352" means bug 0231's fix did not reach this
generic-argument position. stdout: 954 …
```

`954` is a THIRD value, in neither sentinel's alphabet: `954 = 953 + 1`. The
Err arm therefore DID fire — the offender was refused, `verdict` bound `"953"`,
and that string reached the rendered prompt — and the model answered "plus 1"
instead of "plus 1000". Every claim the cell exists to make held; the cell
reported failure.

Two consecutive re-runs of the same file at the same HEAD (`1dad42ac` plus the
branch's uncommitted live-test repairs) are green:

```
npx vitest run --config config/vitest/vitest.live.config.ts \
  tests/live/acceptance/inline-object-malformed-entry-resync-load-refusal.test.ts
→ Test Files 1 passed (1)   (4.86 s, then 6.53 s)
```

## Expected

An H9a cell that pins a LOAD DISPOSITION discriminates it on a channel the
model cannot perturb, or on a sentinel the model reproduces in one step. A
model slip must not be indistinguishable from the regression the cell guards
(`1352`, bug 0231's pre-fix leak), and a run whose observed value PROVES the
correct arm fired must not red.

## Actual / root cause

The arm identity is encoded into the model's task rather than carried beside
it. The probe's `verdict` is deterministic theta state, but the only surface it
reaches under `pi -p` is the assistant reply to a question that requires the
model to (1) locate a three-digit number inside a prose sentence and (2) add
1000 to it. Both steps are stochastic; a failure in step 2 leaves the observed
value inside neither sentinel's alphabet, so the failure message's own
dichotomy ("printing `1352` means the fix did not reach this position") does not
cover the observed case and the operator must decode `954` by hand.

AGENTS.md §"Assert on real observables" names the two sanctioned drive forms:
*fixed-pair arithmetic* when the drive need only prove a real turn ran, and
*compute-from-inline-value* when the discriminator must ALSO prove the theta's
own computation reached the prompt. This cell needs only the weaker property —
which of two `match` arms fired — but pays the stronger form's stochasticity,
because both arms share ONE question whose answer is a function of the arm's
value.

## Why it matters

- A correct-reason-green run reds ~1 in N, and the red's signature (`954`)
  matches no documented pin, so it enters an investigation as a suspected
  regression. This report is that investigation's record.
- The failure message misattributes: its only alternative to `1953` is the
  bug-0231 leak value, so an arithmetic slip reads as "bug 0231's fix did not
  reach this generic-argument position".
- The cell is outside the nine-area H9a manifest (its own §SCOPE ISOLATION), so
  no other gate scores this spawn; the sentinel IS the whole discrimination.

## Non-goals

- Bug 0231's fix and its offline witness
  (`tests/inline-object-malformed-entry-resync.test.ts` group (D)) — unaffected;
  the parse-boundary claim is deterministic and stays.
- The `CLEAN_SENTINEL = "756"` fixed-pair drive (`:146`) and the bug-0030
  empty-capture stderr gate — neither is in this class.
- The `parseSystemNoteCodes` measurement at `:246` — it expects `[]` and is
  arm-independent.
- Weakening the discrimination. The remedy must keep a red available for the
  `1352` direction (the Ok arm firing) with the same strength it has today.

## Fix

Make each `match` arm carry its OWN fixed-pair question, so the model's task is
the sanctioned fixed-pair form and the arm identity is a choice of question
rather than an input to the model's arithmetic. Sketch:

```
let verdict = match r {
  Ok(v)  => "What is 100 plus 200? Answer with the number only.",
  Err(e) => "What is 263 plus 514? Answer with the number only."
}
@`${verdict}`
```

with `REFUSED = "777"` and `LOADED = "300"`. Constraints on the remedy:

1. Both directions keep a red: the Ok arm's answer must remain a value the
   refusal path cannot print, and the cell must keep asserting
   `not.toContain(LOADED)`.
2. No verbatim-echo demand anywhere (bug 0243) — the arms differ by question,
   not by an instruction to repeat a string.
3. The two expected answers must not be substrings of one another, nor of the
   other spawn's `CLEAN_SENTINEL`, nor of any digits `pi -p` prints for its own
   reasons.
4. The offline attribution guard at `:170`–`:186` is unchanged: it is
   token-free, deterministic, and already pins the offender's exact code set.
5. Zero-token property preserved: the offender/probe spawn still spends exactly
   one turn, and the offender body still carries no query.

An alternative — retry the probe spawn once on a value in neither alphabet —
was considered and is NOT recommended: it hides the stochasticity behind a
retry budget and makes a genuine `1352` cost two spawns.

Sibling audit obligation: every H9a/H8a cell whose sentinel is a
compute-from-inline-value answer where only arm identity is at stake carries
this class. `grep -rn "plus 1000" tests/live/` is the starting set.

## Closure record

The sections above preserve the original report and proposed sketch. The actual
repair changes only the test fixture and its coverage, not production refusal,
Result selection, interpolation, or the normative specification.

### Cause and actual fix

`PROBE` in
`tests/live/acceptance/inline-object-malformed-entry-resync-load-refusal.test.ts`
encoded the selected arm as a code that the model had to recover from prose and
add to 1000. Production selected and rendered that code correctly; the reply was
a stochastic, indirect arm measurement. The repaired fixture selects
`100 plus 200? Answer with the number only.` on Ok and
`263 plus 514? Answer with the number only.` on Err, then supplies the common
literal `What is ` prefix in the shared query. Refusal pins `777`, admission
pins `300`, and the unchanged healthy question pins `756`.

This differs from the interpolation-only sketch above because
[QRY-6](../spec_topics/query/query-forms.md#qry-6) correctly warns on an empty
static template body. The meaningful common prefix preserves the existing
zero-diagnostic guards without filtering warnings or changing the parser.
[QRY-18](../spec_topics/query/query-escapes-stringification.md#qry-18) and
`renderQueryText` (`src/runtime/query-interpolation.ts`) concatenate that prefix
with the theta-selected suffix to produce the exact fixed-pair question.

Additive unit and real-host tests inspect both selected questions, including
exact operand mapping. They retain the original positive/opposite-answer,
attribution, exit, stderr and code-measurement controls. Real-host JSONL checks
also require one normally stopped assistant, one user query, no failure notes
and no `theta_result` envelope in the complete stream. The refusal oracle
rejects `300`, empty output and historical `954`; none is accepted as an
alternative. The failure explanation distinguishes an unknown reply from proof
of load admission. No helper, retry, timeout, dependency or sibling changes
were made. There remains one query per host and none in the callee bodies.

### Red, green and independent review

Artifacts are retained in the run directory:

`/home/thomasa/Projects/pi-theta/.pi/tmp/fix-bug-0472-7ff0c3dd-f0c9-4525-8f2e-ead7a9a5d638/`

Commands below ran after explicitly changing to the dedicated worktree root.
The witness argv and failure signatures remain unchanged in `witnesses.json`.

```sh
npx vitest run --config config/vitest/vitest.live.config.ts tests/live/acceptance/inline-object-malformed-entry-resync-load-refusal.test.ts
npx vitest run --config config/vitest/vitest.live.config.ts tests/live/acceptance/inline-object-malformed-entry-resync-load-refusal.test.ts -t 'B0472 unit'
```

- **Pre-fix red:** the full-file command exits 1 in
  `reproduce-attempt-1-live-regression-red.log` and
  `diagnose-attempt-1-live-red.log`; the unit command exits 1 in
  `diagnose-attempt-1-unit-red.log`. Both actual host arms send the old compound
  question and fail the fixed-pair matcher after successful provider completion
  and correct old answers (`1953` / `1352`). The healthy control passes.
  Controller captures `red-0.json` and `red-1.json` preserve the same reds.
- **Post-fix green:** `implement-attempt-3-live.log` records all nine cases
  passing, exit 0; `implement-attempt-3-unit.log` records five units passing,
  exit 0. The unit selector excludes four live cases; the full-file run executes
  them. Controller `green-1-0.json`, `green-1-1.json` and
  `gate-1-initial-2.json` repeat these green commands.
- **Observed mapping:** real healthy, refused and admitted hosts send exactly
  the 341/415, 263/514 and 100/200 questions and answer `756`, `777` and `300`.
  Each exits 0 with empty stderr, one query, one assistant stopping normally,
  no failure note and no complete-stream result envelope. These are actual
  `openai/gpt-6.1-sol` turns, not success inferred from `prompt()` resolving.
- **Ordinary gates:** `npm test`, `npm run typecheck`, `npm run lint` and
  `npx vitest run tests/inline-object-malformed-entry-resync.test.ts` each exit
  0 in the corresponding `implement-attempt-3-{default-suite,typecheck,lint,offline-controls}.log`.
  The default suite passes 765 files / 13,158 tests; refusal/parser controls
  pass all eight. Controller `gate-1-initial-0.json` and
  `gate-1-initial-1.json` repeat typecheck and the full default suite, exit 0.
- **Independent verdict:** `reviews.md` records **CLEAN**, no actionable
  in-scope must-fix findings. The reviewer independently passes the full-file
  live command and eight offline controls in `fix-audit-independent-live.log`
  and `fix-audit-offline-controls.log`. `fix-audit-operator-host.log` additionally
  records all three exact mappings through the operator's pi 1.4.0; the normal
  suite uses the repository-pinned pi 1.3.0. Neither host version is a pi-theta
  release attribution.

The two exact Astra CONTINUE decisions authorize the bounded fixture/oracle
migration and, after replan and independent review, the common-prefix repair:
`decision-6535a55e-3548-4ab9-b958-a1442de6a2b1/record.json` and
`decision-3b912605-ac88-46f6-a76b-f389b0a8e093/record.json`.
Earlier BLOCKED decisions and failed captures remain preserved. In particular,
two unrelated reporting-host ETIMEDOUT failures in
`implement-attempt-2-default-suite.log` were not waived: unchanged full-suite
runs subsequently pass. Their cause remains unknown; no infrastructure repair
is claimed. `close.md` in the run records the exact execution ledger, hashes,
source/spec citations and closure checks.

### Limits and residual scope

Historical `954` was not newly observed. A reply alone does not logically prove
which arm ran; the new exact outbound-text assertions provide that independent
measurement. Fixed-pair arithmetic can still fail, and unknown answers still
fail the witness. No measured flake-rate reduction or model infallibility is
claimed. Unit invoke/query doubles cover production selection/rendering, not
real loading or provider behavior; the real-host cases cover that boundary.
These prompt-mode invokes do not add nested-subagent or Windows coverage.

The read-only sibling audit in `diagnose.md` and
`diagnose-attempt-1-{sibling,expanded}-audit.log` identifies twelve remaining
arm-code arithmetic forms outside this single-file repair: ten other +1000
fixtures, one +100 fixture and a separate four-outcome +100100 fixture. They
remain unmodified; their stochastic failure rates were not measured. Genuine
computation-propagation tests remain separate. This closes the named fixture
defect, not the entire family or unrelated open bugs. No new residual runtime
failure was established or separately filed during closure.

No commit, staging, push, tag, version bump or publication occurs in this stage.
No new package release is published, and no resolving SHA is invented.

## Provenance

Closure draws on `PROBE`, `isolatedQuestion` and the B0472/H9a groups in the
named test, `renderQueryText`, QRY-6/QRY-18, AGENTS.md's observable-channel and
red-direction guidance, and the preserved run reports, raw host captures,
controller gates and independent CLEAN review cited above. The original source
and accepted red logs remain immutable; closure is a documentation-only record
of the reviewed, verified worktree patch.

Found while root-causing two substantive live reds on branch
`feat/rfc-0010-visibility` (RFC 0010 Phase 6). Discrimination against that
branch: the probe's verdict path is note-channel-independent (a `match` over
`invoke`'s `Result`), so neither the RFC-0010 entry-channel migration of the
operator note classes
([PIC-72](../spec_topics/pi-integration-contract/runtime-event-channel.md#pic-72))
nor the `/theta-status` registration change can reach it; the cell's only
note-derived assertion expects `[]` and an entry payload never prints to `pi -p`
stdout at all. The branch's own defect in that pair — the entry realization
bypassing bug 0268's POSIX `file` spelling — was fixed at
`deliverOperatorNotePreferringEntry` in the same pass and is unrelated to this
report.
