# Bug 0472 — bug 0231's H9a probe cell discriminates the offender's load disposition by a MODEL-COMPUTED arithmetic answer (`verdict + 1000`), so a one-step model slip reds a run in which the refusal under test provably fired: an observed stdout of `954` (the Err arm's `953`, plus 1 instead of plus 1000) is scored identically to the pre-fix leak value `1352`

- **Status:** open.
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

## Provenance

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
