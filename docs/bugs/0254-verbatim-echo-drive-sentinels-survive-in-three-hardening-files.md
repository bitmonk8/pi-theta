# Bug 0254 — Three live hardening files still drive the verbatim-echo sentinel shape that bug 0243 retired corpus-wide in 0.220.0: 7 prompt sites across `session-invoke-attach.test.ts`, `session-promptloop.test.ts` and `session-subagent-toolloop.test.ts`, left unconverted because they sat outside 0243's 47-file census and two of them pin the echoed token in a live assertion

- **Status:** fixed (0.243.0).
- **Sev/Diff estimate:** S3/D1 — S3 because no runtime behaviour is wrong: the
  shape produces false reds on live gates, not silent passes; the cost is gate
  reliability and operator time, and each red is indistinguishable from a real
  regression until the capture is read. D1 because the conversion is mechanical
  and per-file — 7 prompt strings, 2 fixture marker values and 4 assertion
  constants across three files, with the landed mechanics and five precedent
  commits already in 0243's `## Fix (0.220.0)`.
- **Kind:** defect — test infrastructure. A verification-gap residue of the
  class bug [0243](./0243-verbatim-echo-drive-sentinels-read-as-prompt-injection.md)
  defined and closed. No subject behaviour of the three cells (invoke-attach
  turn visibility, prompt-mode ceiling #2, subagent tool loops) is affected.
- **Affected** (every citation verified at HEAD `53cd0d86`, 0.240.0):
  - `tests/live/hardening/session-invoke-attach.test.ts` — four sites, both
    cells. In the cell "prompt->prompt attach: child query is a user-visible
    turn in the caller's session" (`:52`): the parent query `:61`
    (``@`PARENT_TURN_SENTINEL reply with exactly: OK` ``) and the child query
    `:70` (``@`CHILD_TURN_SENTINEL reply with exactly: OK` ``). In the cell
    "prompt->prompt attach: callee final value still propagates to the caller"
    (`:87`): `:96` (``@`RET=${v}|reply with exactly: OK` ``) and `:105`
    (``@`NUMCHILD_SENTINEL reply with exactly: OK` ``). The four assertions
    (`:77`, `:79`, `:112`, `:114`) match on the drive's transcript text and pin
    the sentinel labels and `RET=42`; none pins the echoed `OK`.
  - `tests/live/hardening/session-promptloop.test.ts:43–46` — `CHAIN_QUERY`,
    ending `"Reply with EXACTLY that marker token and nothing else."`. Used by
    both cells: `PL-1` (`:63`, drive text at `:83`) and `PL-1 control` (`:116`,
    drive text at `:134`). The marker `CHAINDONE777` is planted in the chained
    fixture `ch3.txt` (`:39`) and pinned in two live assertions — positively at
    `:150` (`expect(t.assistantText).toContain("CHAINDONE777")`) and negatively
    at `:106` (`expect(notes).not.toContain("CHAINDONE777")`).
  - `tests/live/hardening/session-subagent-toolloop.test.ts:73–76` —
    `CHAIN_INSTRUCTION`, same tail (`"Reply with EXACTLY that marker token and
    nothing else."`), driven as the subagent child's whole body at `:102`
    (`STL-1`, `:84`) and `:156` (`STL-2`, `:130`). Marker `CHAINDONE777` in
    `ch3.txt` (`:69`); pinned at `:117`
    (`expect(userText).toContain("CHAINDONE777")`) and read into the
    `capAbsorbed` probe at `:170`.
  - `tests/live/hardening/session-subagent-toolloop.test.ts:147` — a second
    shape in the same file: the `STL-2` parent's
    ``@`Repeat verbatim, nothing else: OUTCOME[${outcome}]` ``. The assertions
    that consume it (`:169`, `:170`, `:176`) read `t.userTexts` — the
    interpolated query text — so nothing pins the model's reply here.
  - `docs/bugs/0243-verbatim-echo-drive-sentinels-read-as-prompt-injection.md`
    `## Fix (0.220.0)` §Residuals item 1 (`:508–521`) — the record that these
    seven sites were left, why (outside §Reproduction (A)'s census, no owning
    document, and the two assertion re-pins), and the stated condition for
    converting them: "Converting them needs either an owning document or an
    explicit grant". This report is that document.
- **Related:**
  - [0243](./0243-verbatim-echo-drive-sentinels-read-as-prompt-injection.md) —
    **fixed (0.220.0)**. Defines the class, measures it (14 refusal instances
    across 8 distinct live cells in one campaign, with the captured refusal
    texts), and lands the conversion mechanics this report reuses. Its census
    covered 47 files / 95 occurrences; these three files are not in it.
  - **Ordering:** no report blocks this one, and this one blocks none. The fix
    touches only the three named live files; any concurrent edit to them
    rebases on whichever lands first.

## Summary

Bug 0243 established that current models read a verbatim-echo drive demand
(``Reply with exactly …``, ``Say exactly …``, a trailing ``and nothing else``)
as prompt injection and refuse it, turning any live assertion over the echoed
token into a coin-flip, and converted the shape out of 47 files. Seven prompt
sites in three `tests/live/hardening/` files still carry it at HEAD. They were
not part of 0243's census, no bug document owns their prompts, and in
`session-promptloop.test.ts` and `session-subagent-toolloop.test.ts` the
echoed token is also the *asserted* value, so conversion moves live assertions
as well as prompts — which 0243's run declined to self-authorize.

## Reproduction

Census at HEAD `53cd0d86` (0.240.0). The whole-tree grep for the shape:

```
rg -n -i "reply with exactly|say exactly|repeat verbatim|EXACTLY that|and nothing else" \
  tests/live tests/fixtures
```

Every hit under `tests/live/**` is a post-conversion rationale *comment*
(e.g. `tests/live/blockexpr-production-live-cell.test.ts:139`,
`tests/live/hardening/session-promptstream.test.ts:22`) except the seven drive
sites in the three files under §Affected:

```
tests/live/hardening/session-invoke-attach.test.ts:61,70,96,105
tests/live/hardening/session-promptloop.test.ts:46
tests/live/hardening/session-subagent-toolloop.test.ts:75,147
```

The two echoed-token assertions:

```
$ rg -n 'toContain\("CHAINDONE777"\)|not\.toContain\("CHAINDONE777"\)' tests/live/hardening
tests/live/hardening/session-promptloop.test.ts:106:        expect(notes).not.toContain("CHAINDONE777");
tests/live/hardening/session-promptloop.test.ts:150:        expect(t.assistantText).toContain("CHAINDONE777");
tests/live/hardening/session-subagent-toolloop.test.ts:117:      expect(userText).toContain("CHAINDONE777");
```

Ownership check:

```
$ rg -ln "session-invoke-attach|session-promptloop|session-subagent-toolloop" docs/bugs/
docs/bugs/0009-live-prompt-queryerror-provider-field-derivation.md
docs/bugs/0067-subagent-envelope-drops-enum-tag.md
docs/bugs/0174-typed-invoke-enum-return-validation-prompt-cell.md
docs/bugs/0180-invoke-return-nonfinite-number-mode-variance.md
docs/bugs/0188-negative-zero-loses-sign-across-subagent-envelope.md
docs/bugs/0243-verbatim-echo-drive-sentinels-read-as-prompt-injection.md
```

All six are `fixed` (0.19.0, 0.90.0, 0.98.0, 0.105.0, 0.117.0, 0.220.0). The
references are passing mentions; none pins a prompt string in these files. No
open report owns them.

The refusal mechanism itself is not re-measured here: it is bug 0243's
§Reproduction (B), which records the refusal instances and the captured refusal
texts.

## Expected behaviour

Every live drive prompt in the repository discriminates through a task-framed
answer the model cannot produce without doing the work — fixed-pair arithmetic
when the drive only needs to prove a real turn ran, or a computation over an
inline or theta-computed value when the discriminator must also prove the
theta's own computation reached the prompt (`AGENTS.md` §"Assert on real
observables, not on `prompt()` resolving"). No live drive asks the model to
reproduce a token verbatim.

## Actual behaviour / root cause

Seven sites ask for verbatim reproduction. Two of them additionally pin the
demanded token as the expected value:
`session-promptloop.test.ts:150` asserts the model's `assistantText` contains
`CHAINDONE777`, and `session-subagent-toolloop.test.ts:117` asserts the
subagent's returned value — which is the child's final model reply, produced by
the same echo demand — contains it. Each of those cells is a coin-flip on model
compliance: a refusal reds the cell with no defect in the subject.

Root cause of the survival, not of the shape: 0243's §Reproduction (A) census
enumerated the files that had an owning bug document pinning their prompts.
These three had none, so they never entered the census. The orchestrator that
executed 0243's fix found them, recorded them as §Residuals item 1, and stopped
rather than self-authorize the assertion moves that the promptloop and toolloop
conversions require.

The two chain cells are a weaker instance of the class than the campaign's
measured refusals: the marker is TOOL-derived (read out of the planted
`ch3.txt`), not attacker-chosen text handed to the model in the prompt. The
echo demand in the instruction is the same, and so is the refusal exposure.

## Why it matters

Three hardening files gate the subagent tool loop, prompt-mode ceiling #2, and
prompt→prompt invoke attachment. A refusal reds them with a signature that
reads as a regression in those subjects. `AGENTS.md` §"Expect documented
correct-reason reds" directs an operator to check `docs/bugs/` for an open
report matching a red signature; until this report exists, a refusal red in
these files matches nothing and costs a full investigation. Two of the cells
also lose their discriminating power on the compliant path in a subtler way: an
assertion pinning a token the prompt already contains cannot distinguish the
loop having run from the model having copied text out of its own instruction.

## Fix

Convert all seven sites to 0243's landed mechanics — task-framed
discriminators computable from inline or theta-computed values, never verbatim
reproduction — and move the assertions the conversion requires. This report is
the authority for those assertion moves; the files have no other owner.

1. `session-invoke-attach.test.ts` (`:61`, `:70`, `:96`, `:105`) — prompt-only.
   Keep the sentinel labels (`PARENT_TURN_SENTINEL`, `CHILD_TURN_SENTINEL`,
   `NUMCHILD_SENTINEL`, `RET=${v}`): the four assertions match on the drive's
   transcript text, so they pin the query text, not the reply. Replace each
   `reply with exactly: OK` tail with a fixed-pair arithmetic task
   (`What is <a> plus <b>? Answer with the number only.`). No assertion
   changes; `:112`'s `RET=42` stays byte-identical.
2. `session-promptloop.test.ts` — change `ch3.txt` (`:39`) to plant a number
   rather than the token `CHAINDONE777`, and rewrite `CHAIN_QUERY`'s tail
   (`:46`) to a compute-from-inline task over the chain's final value (report
   that value plus a fixed constant, one addition). Re-pin both assertions to
   the computed sum: `:150` positively, `:106` negatively. The sum must not
   occur in the prompt or in any planted file, so only chain completion can
   produce it — that is what keeps `:106`'s negative assertion non-vacuous.
3. `session-subagent-toolloop.test.ts` — the same conversion for `ch3.txt`
   (`:69`) and `CHAIN_INSTRUCTION` (`:75`), which the child drives at `:102`
   and `:156`. Re-pin `:117` and the `capAbsorbed` constant at `:170` to the
   child's computed answer. `:169`'s `capEnforced` check on
   `tool_loop_exhausted` and `:176`'s `expect(capEnforced).toBe(true)` are
   unaffected. Separately, replace `:147`'s
   ``Repeat verbatim, nothing else: OUTCOME[${outcome}]`` with a task-framed
   query carrying the same `OUTCOME[${outcome}]` interpolation: the assertions
   at `:169`/`:170` read `t.userTexts`, so the interpolation must survive
   byte-identically and no assertion moves.
4. Keep the three chain instructions' sequencing constraint intact ("Read
   exactly ONE file at a time, following the chain") — it is what forces the
   ≥3 sequential rounds each cell measures. Only the reply demand changes.
5. Add the per-file rationale comment 0243's converted files carry, so a later
   census sees the shape as swept rather than as a fresh occurrence.
6. Re-run all three files live and verify both directions per `AGENTS.md`
   §"Verify both directions when adding or strengthening an assertion": green
   on the converted form, and red once on a wrong expected constant, for each
   re-pinned assertion.

## Non-goals

- The response-FORMAT constraints 0243 left byte-unchanged (typed-query JSON
  shape lines, `session-convdrive.test.ts`'s `Reply with JSON exactly:
  {"label":"MANGO"}`) stay unchanged. They constrain a typed reply's shape and
  are the source of the values conversions compute over; 0243 §Residuals item 2
  drew the class boundary there.
- `tests/fixtures/h7b-invalid/malformed.theta:15` carries
  ``@`Reply with exactly: OK` `` and stays as-is. That fixture is the seeded-invalid
  input of the offline `tests/committed-fixture-parse-gate.test.ts`
  (`SEEDED_INVALID`, `:44`); it is parsed, never driven against a model, so no
  refusal can reach it.
- No `src/` change. Nothing about runtime behaviour is at issue.

## Provenance

- Origin: bug 0243 `## Fix (0.220.0)` §Residuals item 1, which names all seven
  sites, states that converting them "needs either an owning document or an
  explicit grant", and records the two assertion re-pins as the reason the run
  stopped. Fix-run detail in `.pi/tmp/fixes/0243-report.md`.
- Refusal mechanism and its measurement are bug 0243's, not re-derived here.
- Every citation in this report was re-derived at HEAD `53cd0d86` by `rg` and
  `Read` over the tree rather than copied from 0243. All seven prompt sites and
  both assertions 0243 §Residuals item 1 names still sit at the stated lines.
  Two consumers of the echoed token that item 1 does not list are added here:
  `session-promptloop.test.ts:106` (the negative assertion) and
  `session-subagent-toolloop.test.ts:170` (`capAbsorbed`).
- No live run was performed for this report: the shape's consequence is
  probabilistic, and the census is static.

## Fix (0.243.0)

- What shipped (tests only; no `src/` byte touched):
  - `tests/live/hardening/session-invoke-attach.test.ts` — §Fix item 1: the four
    `reply with exactly: OK` tails became fixed-pair arithmetic tasks
    (`:67` 314+259, `:76` 407+186, `:102` 528+231, `:111` 163+372). The four
    sentinel labels and the `RET=${v}` interpolation survive byte-identically;
    no assertion moved and `RET=42` is unchanged.
  - `tests/live/hardening/session-promptloop.test.ts` — §Fix item 2: `ch3.txt`
    plants `3193` instead of a marker token (`:48`), `CHAIN_QUERY`'s tail became
    `Report that number plus 2000. Answer with the number only.` (`:55`), and
    both consumers re-pinned to the computed sum `5193` — negatively at `:115`,
    positively at `:159`.
  - `tests/live/hardening/session-subagent-toolloop.test.ts` — §Fix item 3: the
    same conversion (`ch3.txt` plants `4271` at `:79`; `CHAIN_INSTRUCTION` asks
    for that number plus 3000 at `:85`), with `:127` and the `capAbsorbed` probe
    at `:180` re-pinned to `7271`; the `Repeat verbatim` parent query became
    `OUTCOME[${outcome}] What is 731 plus 154? Answer with the number only.`
    (`:157`), carrying the interpolation byte-identically so `capEnforced` and
    `expect(capEnforced).toBe(true)` are untouched.
  - §Fix item 4: both chain instructions keep the sequencing clause `Read
    exactly ONE file at a time, following the chain` byte-unchanged.
  - §Fix item 5: each of the three files carries the per-file rationale comment
    in the landed 0243 idiom, and the two chain files state the non-vacuity
    property.
- Gates:
  - Witness (§Fix item 6, both directions, live): green on the landed bytes —
    `npx vitest run --config config/vitest/vitest.live.config.ts` over the three
    files, `Test Files 3 passed (3)` / `Tests 6 passed (6)`, RC=0. Red proven
    once per re-pinned assertion under five simultaneous neutralisations, RC=1,
    `Test Files 3 failed (3)` / `Tests 5 failed | 1 passed (6)`, each for the
    right reason (`expected '5193' to contain '5194'`; `expected 'Say ok.
    MR=\n\n\n7271' to contain '7272'`; `expected false to be true` for the
    temporarily asserted `capAbsorbed`; `expected 'theta /ploop1 returned Err:
    tool-call…' not to contain 'tool-call loop exhausted'` for the negative
    assertion, whose channel cannot be reddened by flipping its constant;
    `expected 'NUMCHILD_SENTINEL What is 163 plus 37…' to contain 'RET=41'`).
    Restoration was by byte-write and hash-verified.
  - Default suite: `npm test` — `Test Files 422 passed (422)` /
    `Tests 8888 passed (8888)`. `vitest.config.ts:12` excludes `tests/live/**`,
    so this change cannot reach that suite.
  - `npm run typecheck` — clean. `npm run lint` — clean.
- Review: 2 rounds. Round 1 (`bug-fix-reviewer`) — FINDINGS: two prose defects
  (a toolloop header sentence that called the `OUTCOME[]` interpolation a sum
  and claimed it occurs in no prompt, and five surviving "marker" references
  after the marker→number conversion, including the STL-1 test title). Round 2
  (`bug-fix-reviewer-fast`, after a comment/prose-only fixer round) — CLEAN, no
  findings, no deep-review recommendation.
- Verification: SOLID. Witness genuineness — the five reds cover every re-pinned
  assertion and each quoted message names the right cause; landed hashes
  re-derived independently. Default suite — green, 422/8888. Live coverage —
  the three converted files are the live coverage; `PL-1-control assistantText:
  "5193"`, `STL-1 parent userTexts: "Say ok. MR=\n\n\n7271"`, `STL-2 parent
  userTexts: "OUTCOME[tool_loop_exhausted] What is 731 plus 154? …"` with
  cap-enforced true and cap-absorbed false. Lint and typecheck — clean.
- Residuals:
  1. `tests/live/hardening/session-subagent-toolloop.test.ts`'s parent query
     `@\`Say ok. MR=${r}\`` keeps its narrative framing. It is not one of the
     seven enumerated sites, carries no verbatim-echo demand, and the STL-1
     re-pin works through the `MR=${r}` interpolation — the live capture
     `"Say ok. MR=\n\n\n7271"` shows the computed value reaching `userTexts`
     regardless. Left byte-unchanged as out of this report's scope.
  2. Line-citation drift: each file gained a header rationale comment, so
     `path:line` citations into them from other documents point a few lines low.
     The §Fix record above cites post-fix lines; §Affected's pre-fix lines are
     left as measured.
  3. The default suite reds intermittently with `Error: Hook timed out in
     10000ms` on files this change does not touch when sibling worktrees run
     concurrently on the same machine; every such file passes in isolation and
     the verifier's own full run was green.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: `tests/fixtures/h7b-invalid/malformed.theta`
  is unchanged (parse-gate-only input, never driven); the response-FORMAT
  constraints 0243 §Residuals item 2 fenced off are unchanged.
