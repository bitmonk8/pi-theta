# Bug 0286 — Live H8a cell 89's declared-`E` twin carries a two-question drive whose first query's answer (`524`) is also the value interpolated into the second query, and the streamed text of the whole drive is now exactly `"524"`: the sentinel `865` never appears, so `tests/live/live-production-acceptance.test.ts:14858` reds 4-for-4 across two code versions while the cell's subject (registration refusal plus twin registration) stays green

- **Status:** open.
- **Sev/Diff estimate:** S3/D1 — S3 because this is a verification defect, not a
  product defect: the assertion's truth condition includes a live model
  chaining an arithmetic step, and the red is the full live suite's only red at
  HEAD, which mis-attributes to whatever code change is in flight. D1 because
  the fix is one fixture line plus its comment inside a single cell, no `src/`
  change, on bug 0283's precedent.
- **Kind:** test-infra defect — a live drive discriminator whose expected value
  is one arithmetic step beyond a number that already appears in the same
  drive's transcript.
- **Affected** (every citation re-derived at HEAD `111ba1a7`, v0.282.0;
  `tests/live/live-production-acceptance.test.ts` is the only file involved):
  - `:14721`–`:14728` — `E_SIDE_UNDECLARED_CELL_89`, the offender fixture
    (never driven; its refusal is decided at load). Its query text is at
    `:14725`.
  - `:14736` — `const DECLARED_E_SENTINEL_CELL_89 = "865";`, with the comment
    at `:14735`: `306 + 218 = 524 is theta-computed; 524 + 341 = 865 is the
    answer only that value affords.`
  - `:14749`–`:14758` — `DECLARED_E_HEAD_CELL_89`, the declared-`E` twin. Two
    `@`-queries in one `mode: prompt` body:
    - `:14754` — `let a: Result<integer, Nope> = @`What is 306 plus 218? Answer
      with the number only.`` (typed; answer `524`).
    - `:14755` — `let n = 306 + 218` (theta-computed `524`).
    - `:14756` — `@`A computation produced the value ${n}. What is that value
      plus 341? Answer with the number only.`` (the drive discriminator).
  - `:14846` — the drive:
    `const turn = await driveSlashCaptureTurn(handle, "/b0273livegood");`
    (`driveSlashCaptureTurn` is `tests/live/harness.ts:336`; its `text` field is
    the accumulated `text_delta` stream of the whole drive,
    `tests/live/harness.ts:399`–`:417`).
  - `:14847`–`:14852` — the `turn.systemNotes` emptiness assertion. Passes in
    every run below.
  - `:14853`–`:14858` — the failing assertion:
    `turn.text.includes(DECLARED_E_SENTINEL_CELL_89)`.
  - `:14762`–`:14777` — the offline attribution guard (offender carries exactly
    `theta/parse/unresolved-named-type`, twin carries none). Passes in every run
    below, so no load-path change can explain the red.
  - `:14779`–`:14841` — the registration half (precondition control, twin
    registration, offender absence, refusal note). Passes in every run below.
- **Observed at:** HEAD `111ba1a7` (v0.282.0) and at `87b8a435` (v0.281.0 code,
  throwaway worktree `C:/UnitySrc/pi-theta-v281probe`), against the live
  provider on the same day.

## Summary

Cell 89 (`H8a-T -- bug 0273`) has two halves. The registration half — offender
refused with `theta/parse/unresolved-named-type`, precondition control and
declared-`E` twin registered — passes. The drive half reds.

The twin's body sends two questions in one drive. The typed query at `:14754`
asks `306 plus 218`; its answer is `524`. The untyped discriminator at `:14756`
renders the theta-computed `${n}` (also `524`) and asks for `524 + 341`. The
assertion demands the substring `865` in `turn.text`, the accumulated assistant
text of the whole drive.

`turn.text` is now exactly `"524"` — the intermediate value, and nothing else —
in four consecutive runs, including one against v0.281.0 code. `865` never
appears.

## Reproduction

All live evidence below was **captured by the parent session, not re-run by
this writer**. The live lock and the token budget belong to the parent; this
report re-derives only the source citations, offline.

The drive text at HEAD, verbatim (`:14749`–`:14758`):

```
---
mode: prompt
---
schema Nope { a: number }
let a: Result<integer, Nope> = @`What is 306 plus 218? Answer with the number only.`
let n = 306 + 218
@`A computation produced the value ${n}. What is that value plus 341? Answer with the number only.`
```

(a) Full live run at HEAD `111ba1a7` —
`.pi/tmp/fix-open-bugs/live-full-v0282.log`:

```
 Test Files  1 failed | 106 passed (107)
      Tests  1 failed | 224 passed (225)
   Duration  1400.93s
```

Cell 89 is that single red (log `:107`–`:108`):

```
   × H8a-T -- bug 0273: an undeclared head in a `Result<T, E>` annotation's `E` argument denies registration at the query capture, while the declared-`E` twin registers and drives, live (cell 89) (Convention: live-host acceptance) > refuses the undeclared `E` head at registration with theta/parse/unresolved-named-type on the theta-system-note channel, and drives the declared-`E` twin to normal completion through the real discovery->registration path (cell 89) 12824ms
     → the declared-`E` twin's drive did not answer the task question over its own computed value (306 + 218 = 524, then + 341) -- streamed text: "524" (cell 89): expected false to be true // Object.is equality
```

(b) Isolated re-run at HEAD — `.pi/tmp/fix-open-bugs/live-v0282-rerun.log`
(`Tests 1 failed | 89 skipped (90)`): same assertion, `streamed text: "524"`.

(c) Second isolated re-run at HEAD —
`.pi/tmp/fix-open-bugs/live-v0282-rerun2.log`
(`Tests 1 failed | 89 skipped (90)`): same assertion, `streamed text: "524"`.

(d) Cross-version probe at `87b8a435` (v0.281.0 code) in the throwaway worktree
`C:/UnitySrc/pi-theta-v281probe` —
`.pi/tmp/fix-open-bugs/live-v281probe-cell89.log`:

```
 RUN  v2.1.9 C:/UnitySrc/pi-theta-v281probe
 ❯ tests/live/live-production-acceptance.test.ts (90 tests | 1 failed | 89 skipped) 11990ms
AssertionError: the declared-`E` twin's drive did not answer the task question over its own computed value (306 + 218 = 524, then + 341) -- streamed text: "524" (cell 89): expected false to be true // Object.is equality
 ❯ tests/live/live-production-acceptance.test.ts:14858:9
```

(e) The same cell **green** in the v0.281.0 full run 2h31m earlier the same day
(`.pi/tmp/fix-open-bugs/live-full-v0281.log:71`; run start `19:14:42`, run (a)
start `21:45:56`):

```
   ✓ H8a-T -- bug 0273: an undeclared head in a `Result<T, E>` annotation's `E` argument denies registration at the query capture, while the declared-`E` twin registers and drives, live (cell 89) (Convention: live-host acceptance) > refuses the undeclared `E` head at registration with theta/parse/unresolved-named-type on the theta-system-note channel, and drives the declared-`E` twin to normal completion through the real discovery->registration path (cell 89) 8621ms
```

So `865` was reachable within the last day: the fixture is unchanged since
0273's merge and the streamed text carried the sentinel then.

(f) Prior disposition of this exact assertion. The session ledger recorded it as
a stochastic mode, not a persistent red —
`.pi/tmp/fix-open-bugs/RESUME.md:634`–`:636`:

```
(red 3/10 pre-fix) + H8a cell 89 (242 ins; drive sentinel is
1-in-3 stochastic at its LAST assertion — registration assertions
before it deterministic; green at merged tip under lock RC=0).
```

and `RESUME.md:3` lists `cell-89 1-in-3` in the five-entry stochastic-mode
inventory. Four consecutive reds with an identical streamed text is not that
mode: at 1-in-3 independent odds four reds carry probability ≈ 1/81, and the
old mode's signature was variance in the answer, not the same wrong number
every time.

### Offline measurements (this writer's own, at HEAD `111ba1a7`)

- **v0.282.0's only `src/` change cannot reach this cell's verdict.**
  `git diff --stat 87b8a435..111ba1a7 -- src/` names one file,
  `src/parser/theta-document.ts` (+31/−1): bug 0285's `typeSourceEndsAtom`
  guard on the schema-field boundary (`src/parser/theta-document.ts:1903`–
  `:1926`, applied at `:3301`–`:3307`). The twin does declare a schema field
  (`schema Nope { a: number }`), but the guard only withholds a diagnostic when
  the captured `typeSource` does **not** end a `Type` atom; `number` ends one,
  so the field's parse is unchanged. The cell's offline attribution guard at
  `:14775`–`:14777` (twin carries zero diagnostics) passed in all four live runs
  and passes offline at HEAD. The probe at (d) runs the v0.281.0 code and reds
  identically.
- **What the logs do and do not localise.** The assertion message prints
  `turn.text` only. It does not print `turn.userTexts`, the deterministic
  outbound-render channel (`tests/live/harness.ts:314`, documented at `:303`–
  `:313`), so the captured
  evidence does not distinguish which of the drive's two queries produced the
  `"524"`: the typed query's in-session free-phase turn
  (`src/extension/production-theta-producer.ts:4687`, free phase driven while
  `maxRounds > 0`; the forced respond turn is off-session, `:4609`–`:4617`), or
  the untyped discriminator answering with the value handed to it. Both
  readings share one property and one remedy: the number `524` is available to
  the model as a complete-looking answer at two places in the same drive, and
  `865` requires an addition on top of it.

## Expected behaviour

`/b0273livegood` registers and drives. The discriminator's rendered body
carries the theta-computed `524`, the model answers `865`, and
`turn.text.includes("865")` holds — proving a real drive turn ran over a value
the theta's own code computed, through the real
discovery → registration → drive path.

## Actual behaviour / root cause

`turn.systemNotes` is empty (no err, cancelled or panic framing — the drive
ends normally) and `turn.text` is exactly `"524"`. The assertion at `:14858`
reds.

Root cause: the discriminator's truth condition includes a live model
performing a second arithmetic step past a number that is already the correct
answer to a question in the same drive. The fixture makes `524` doubly
available — it is the answer to `:14754` and the interpolated value in
`:14756` — while the sentinel `865` exists nowhere in the prompt text. A model
that stops at `524` produces a reply that reads as a complete answer to the
transcript it sees, and the streamed text of the whole drive then contains no
`865`.

Nothing in the extension changed on that path: the fixture bytes, the
registration half and the offline attribution guard are stable across
`87b8a435..111ba1a7`, and the probe at v0.281.0 code reds the same way. The
drift is provider-side, in the drive model's handling of a chained numeric
task.

The cell therefore asserts two propositions at once — "the declared-`E` twin
registers and drives a real turn over its own computed value" (its subject) and
"a live model adds 341 to a number it has already emitted as an answer" (an
incidental property of the drive text). Only the second failed.

## Why it matters

This is the full live suite's only red at HEAD (224/225 in run (a)). Every
subsequent full run reds here, and without a filed signature the red attaches
to whichever fix is in flight — the mis-attribution `AGENTS.md`
§"Expect documented correct-reason reds" exists to prevent. A standing red also
masks a genuine regression arriving at the same cell: the next reader sees a
known-red cell and stops looking.

The cell's registration half is the live witness for bug 0273's fix. Leaving
the file red keeps that witness's verdict unreadable in run output.

## Non-goals

- **Bug 0273's subject.** The `E`-side resolution
  (`./0273-propagated-result-error-side-unresolved-name-silent.md`, fixed in
  0.267.0) is untouched: the offender is refused with
  `theta/parse/unresolved-named-type`, is absent from the registered set, and
  the twin registers — all green in runs (a)–(e). This report does not re-open
  it and does not change the offender fixture or the refusal assertions.
- **Bug 0283's signature.** That red is binder-stage — a needs-more-info
  verdict on an unlabelled argument before any body dispatch
  (`./0283-live-binder-declines-bare-free-text-argument-h8a-0165-cell.md`,
  fixed 0.279.0, cell green post-fix in run (a)). Here the binder is not
  involved: the theta takes no params, the drive dispatches, and the model
  answers — with the wrong number.
- **Bug 0243's refusal class.** This is not a refusal. The model complies with
  a task-framed question and emits a number; it stops one step early
  (`./0243-verbatim-echo-drive-sentinels-read-as-prompt-injection.md`). The
  discriminator is already 0243-compliant (task-framed, no verbatim-echo
  demand) and must stay so.
- **Single-step compute-from-inline-value drives.** The
  `@`What is ${n} plus <k>? Answer with the number only.`` form — one addition
  over one theta-computed value, no competing answer in the transcript — passed
  everywhere in run (a):
  `tests/live/b0274live-reserved-keyword-type-head-registration.test.ts:214`,
  `tests/live/b0277live-unapplied-generic-head-registration.test.ts:190`,
  `tests/live/b0278live-result-arity-mismatch-registration.test.ts:162`,
  `tests/live/b0281live-applied-reserved-generic-head-registration.test.ts:194`,
  `tests/live/b0282live-unknown-applied-generic-head-registration.test.ts:261`,
  `tests/live/b0284live-non-identifier-applied-generic-head.test.ts:248`. That
  form is not in scope and is the shape the fix converges on.

### Sibling exposure (measured, `tests/live/**` at HEAD)

Six fixtures put a second query's answer one arithmetic step past a value the
first query produced. All were green in run (a); they carry the same class of
dependency:

- `tests/live/escaped-quote-inline-rename-live-cell.test.ts:154`/`:157` —
  typed field, then `${answer.wire}` `plus 100`.
- `tests/live/inline-field-name-not-identifier-live-cell.test.ts:158`/`:161` —
  `${answer.ab}` `plus 100`.
- `tests/live/inline-object-field-name-case-live-cell.test.ts:142`/`:145` —
  `${answer.ys}` `plus 100`.
- `tests/live/inline-object-wire-name-rename-live-cell.test.ts:149`/`:152` —
  `${answer.wire}` `plus 100`.
- `tests/live/quoted-inline-field-name-live-cell.test.ts:144`/`:147` —
  `${answer.a}` `plus 100`.
- `tests/live/hardening/session-convdrive.test.ts:107`/`:109` — `293 plus 514`,
  then a record restating `${a}`.

Cell 89 is the only one where the first query's answer and the interpolated
value are the **same number** (`524`), which is what makes the truncated reply
indistinguishable from a complete one. `tests/live/hardening/session-promptstream.test.ts:60`–`:61`
holds two arithmetic queries but asserts dispatch on `userTexts`, not answer
content, so it carries no exposure.

## Fix

Harden the twin's drive so the cell's truth condition is the code's behaviour.
This report is the pre-authorization the protected live cell needs for that
edit, on bug 0283's precedent.

Edit sites, all inside cell 89 in `tests/live/live-production-acceptance.test.ts`:

1. `:14754` — retarget the typed query so its answer collides with neither the
   interpolated value nor the sentinel:
   `"let a: Result<integer, Nope> = @`What is 471 plus 133? Answer with the number only.`"`
   (answer `604`). The annotation, the head `Nope` and the typed shape are the
   part bug 0273 needs and do not move.
2. `:14756` — keep the discriminator's single-step task-framed form verbatim:
   `"@`A computation produced the value ${n}. What is that value plus 341? Answer with the number only.`"`.
   After (1) the only path to `865` is reading `524` out of the rendered body,
   so the cell still proves the theta's own computation reached the prompt.
3. `:14736` — the sentinel stays `"865"`; `:14855`–`:14858` keep their shape.
   Confirm the expected value verbatim after the change rather than assuming
   it.
4. `:14856` — fold `turn.userTexts` into the existing failure message
   (`JSON.stringify(turn.text) + "; userTexts: " + JSON.stringify(turn.userTexts) +`)
   so the next occurrence names which query was answered. This is the
   diagnosability gap measured above and fits on the existing line.
5. `:14730`–`:14748` — update the two comment blocks in place: the sentinel
   comment at `:14735` must state one addition over a rendered value, not a
   chain, and the typed query's new operands must be described accurately.

Hold the file at **14864 lines** (`wc -l` at HEAD). Bug 0283's fix held this
same file at 14864 lines for exactly this reason — many docs cite it by line
(`./0283-live-binder-declines-bare-free-text-argument-h8a-0165-cell.md`
§Fix outcome). The edits above are all in-line replacements; a line-count move
is permitted only if unavoidable and must be stated in the fix record with the
citing docs re-checked.

Do not weaken the assertion. Dropping to `turn.userTexts` alone, or to
`systemNotes` emptiness, removes the drive-turn proof the cell exists for; the
outbound-render channel is deterministic and would green on a drive the model
never answered.

Re-verify under the live lock, both directions per `AGENTS.md`
§"Verify both directions":

```
npx vitest run --config config/vitest/vitest.live.config.ts tests/live/live-production-acceptance.test.ts -t "cell 89"
```

Green with the hardened text; then neutralise (restore the two-question
collision, or point `${n}` at a literal) and confirm the red returns with the
filed signature before restoring.

The six sibling drives enumerated above stay byte-untouched under this fix.
They are green today; hardening them is available under this report's authority
if one reds with this signature, and is otherwise recorded as a follow-on
observation.

## Provenance

Filed in the twentieth `/fix-open-bugs` session at HEAD `111ba1a7`, v0.282.0,
with the backlog at zero. The live evidence is the parent session's, quoted
from its logs: the full run at HEAD
(`.pi/tmp/fix-open-bugs/live-full-v0282.log`, 224/225), two isolated re-runs
(`live-v0282-rerun.log`, `live-v0282-rerun2.log`), the cross-version probe at
`87b8a435` (`live-v281probe-cell89.log`, worktree
`C:/UnitySrc/pi-theta-v281probe`), and the same cell green in
`live-full-v0281.log:71` earlier the same day. The prior 1-in-3 disposition is
`.pi/tmp/fix-open-bugs/RESUME.md:3`, `:634`–`:636`. Source citations, the
sibling-exposure sweep and the `src/` diff reading are this writer's own,
offline at HEAD. No live test was run by this writer.
