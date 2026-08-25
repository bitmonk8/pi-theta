# Bug 0283 — The H8a bug-0165 cell's over-fire fence drives a real binder turn with the bare free text `/b165livewf hello` against a REQUIRED `topic` field, and the pinned binder model (`anthropic/claude-haiku-4-5`) now declines to infer the parameter from an unlabelled argument: the drive ends on the system note `theta /b165livewf: argument binding needs more info — The required parameter 'topic' cannot be determined from the user…` with `outbound: []`, so a live test reds for a provider-side judgement change while the code under test registers and lowers correctly

- **Status:** fixed (0.279.0).
- **Sev/Diff estimate:** S3/D1 — S3 because this is a verification gap, not a
  product defect: a live fence reds on every full run while the witnessed code
  behaviour (registration refusal for the empty default, registration plus
  lowering for the well-formed sibling) is correct, and an unfiled red of this
  shape gets mis-attributed to whichever fix landed most recently. D1 because
  the fix is a one-fixture change — make the drive text binder-unambiguous at
  `tests/live/live-production-acceptance.test.ts:6213` (and the assertion
  spellings that embed the bound value, `:6219`), no `src/` change.
- **Kind:** test-infra defect — a live assertion whose truth depends on a
  real model inferring a required parameter name from an unlabelled argument.
  The cell's fence conflates "the code registers and lowers the well-formed
  default correctly" with "a live haiku turn binds `topic` from the bare word
  `hello`". Only the second proposition changed.
- **Affected** (every citation re-derived at HEAD `d530f566`, v0.278.0;
  `tests/live/live-production-acceptance.test.ts` is the only file involved):
  - `tests/live/live-production-acceptance.test.ts:6124`–`:6136` —
    `wellFormedDefaultBinderTheta()`, the fence fixture: `mode: prompt`,
    `bind_model: anthropic/claude-haiku-4-5`, `params:` with `topic: string`
    (required) and `p: 'string = "ok"'` (defaulted), body interpolating both
    bound values behind `B165_SENTINEL` (`:6091`).
  - `tests/live/live-production-acceptance.test.ts:6213` — the drive:
    `const turn = await driveSlashCaptureTurn(handle, "/b165livewf hello");`
    (`driveSlashCaptureTurn` is `tests/live/harness.ts:336`).
  - `tests/live/live-production-acceptance.test.ts:6219` — the failing
    assertion: `.toContain("Running /b165livewf: topic=hello, p=ok (default)")`.
  - `tests/live/live-production-acceptance.test.ts:6220`–`:6225` — the
    downstream sentinel assertion on `turn.userTexts`, unreached once `:6219`
    reds and equally dependent on the binder turn succeeding.
  - `tests/live/live-production-acceptance.test.ts:6139`–`:6212` — the rest of
    the cell (precondition control `b165livectl`, the refusal on
    `b165liveempty`, the load-time `default-without-literal` note assertion):
    all green in every run below. The 0165 subject proper is unaffected.
- **Observed at:** HEAD `d530f566` (v0.278.0) and — decisively — at
  `d2d3d02f` (v0.272.0 code), both against the live provider on the same day.

## Summary

The bug-0165 H8a cell (`H8a-T — bug 0165: a params: default with no literal
after \`=\` does not register, live`) has two halves. The first half — the
refusal under test — passes. The second half is an over-fire fence that drives
a real binder pass: it plants a sibling whose default RHS *is* a literal
(`p: 'string = "ok"'`) alongside a required `topic: string`, drives
`/b165livewf hello`, and demands the system note
`Running /b165livewf: topic=hello, p=ok (default)`.

The sibling registers. Its binder turn no longer binds. The pinned binder model
answers that it cannot determine `topic` from the user text, the runtime emits
`theta /b165livewf: argument binding needs more info — …`, and the drive
produces no outbound message (`outbound: []`). The demanded note never appears
and `:6219` reds.

The red is not a code regression. The identical cell reds at `d2d3d02f`, the
v0.272.0 session-start commit whose full live run was all-green on first pass
roughly six hours earlier. The six fixes merged between those commits
(v0.273.0–v0.278.0) are exonerated by that cross-version result.

## Reproduction

All evidence below was **captured by the parent session, not re-run by this
writer**. The live lock and token budget belong to the parent.

(a) Full live run at HEAD `d530f566` —
`.pi/tmp/fix-open-bugs/live-full-v0278.log`:

```
 Test Files  2 failed | 103 passed (105)
      Tests  2 failed | 219 passed (221)
   Duration  1096.25s
```

The cell's failure (log `:370`–`:375`):

```
 FAIL  tests/live/live-production-acceptance.test.ts > H8a-T — bug 0165: a params: default with no literal after `=` does not register, live (Convention: live-host acceptance) > does not register a caller whose params: default is empty, while its well-formed-default sibling still registers and binds through a real binder pass
AssertionError: the well-formed-default sibling must bind and echo `p=ok (default)` — the over-fire fence for the refusal under test. Notes: ["theta /b165livewf: argument binding needs more info — The required parameter 'topic' cannot be determined from the user…"]; outbound: []: expected [ Array(1) ] to include 'Running /b165livewf: topic=hello, p=o…'
    6219|       ).toContain("Running /b165livewf: topic=hello, p=ok (default)");
```

The run's other failure is the bug-0231 live cell, isolated-green afterwards
(`./0231-well-formed-field-behind-malformed-entry-unchecked.md`); it is a
different signature and not part of this report.

(b) Isolated re-run at HEAD — `.pi/tmp/fix-open-bugs/live-v0278-rerun.log`
(`Test Files 1 failed | 1 passed (2)`): same assertion, same note text,
`outbound: []`.

(c) `-t`-filtered re-run at HEAD —
`.pi/tmp/fix-open-bugs/live-v0278-rerun2.log` (`Test Files 1 failed (1)`):
same assertion, same note text, `outbound: []`.

(d) Cross-version probe. The same cell was run against **v0.272.0 code** at
commit `d2d3d02f` in a throwaway worktree; the probe log was at
`../pi-theta-v272probe/live-0165-probe.log` and the worktree has since been
removed, so this provenance is recorded from the parent session's report
rather than from a surviving file. Result: **RED**, same
`argument binding needs more info` note. That same commit's own full live run
earlier the same day was all-green on first pass —
`.pi/tmp/fix-open-bugs/live-full-v0272.log`:

```
 Test Files  100 passed (100)
      Tests  213 passed (213)
   Duration  1018.80s
```

Four reds for four attempts, spanning two code versions whose only difference
is six unrelated fixes.

### Offline measurements (this writer's own, at HEAD `d530f566`)

- **The fixture's lowered shape is untouched across `d2d3d02f..d530f566`.**
  `git diff --stat d2d3d02f..d530f566 -- src/` names five files;
  `src/parser/params.ts` (47 lines changed) and `src/parser/theta-document.ts`
  are the only parser files on that list. Reading the diff: bug 0277's params.ts change is
  comments-only on the reserved-keyword sink; bug 0281 adds one arm to
  `lowerTypeExpr`'s generic-application path, guarded by
  `RESERVED_KEYWORDS.has(ctor) && !(ctor in GENERIC_ARITY)` — reached only for
  an *applied* head (`Ctor<…>`). This fixture declares `topic: string` and
  `p: 'string = "ok"'`: two bare primitives, no generic application, no
  reserved spelling. Neither hunk is on the path this fixture takes. The
  `theta-document.ts` changes are the `*Absorbed` flags on `let` / `fn`
  body declarations, not the frontmatter `params:` loop. The offline suite is
  green at HEAD, corroborating.
- **Sibling cells sharing the exposure.** Four drives in `tests/live/` pass an
  unlabelled bareword to a theta with a required `topic` field through a real
  binder pass — all four fixtures pin
  `bind_model: anthropic/claude-haiku-4-5`:
  - `tests/live/live-production-acceptance.test.ts:5576` —
    `"/b66livedef hello"` (bug 0066 fence, assertion `:5599`).
  - `tests/live/live-production-acceptance.test.ts:5974` —
    `"/b166livenum hello"` (bug 0166 fence, assertion `:5980`).
  - `tests/live/live-production-acceptance.test.ts:6213` — this cell.
  - `tests/live/live-production-acceptance.test.ts:7489` —
    `"/b181livedef hello"` (bug 0181 fence, expected note at `:7416`).
  The other three were green in run (a). They share the drift exposure; only
  this one currently reds.
- **This is a new stochastic-adjacent mode.** The session's recorded live-flake
  inventory has four entries: the ~180s stall class, arithmetic
  model-variance, a sibling replying `Done.` without the sentinel, and H8a
  cell 89's 1-in-3 last-assertion flake
  (`.pi/tmp/fix-open-bugs/RESUME.md:371`, `:408`–`:409`, `:632`–`:633`).
  Binder-needs-more-info is none of those, and unlike all four it is not
  intermittent here: 4-for-4 red, including across code versions.

## Expected behaviour

`/b165livewf hello` binds `topic="hello"`, omits `p` so the runtime's
fill-if-absent supplies the declared default, and the theta-system-note
channel carries `Running /b165livewf: topic=hello, p=ok (default)`. The body
dispatches, so `turn.userTexts` contains `SENTINEL-B165`.

## Actual behaviour / root cause

The binder turn returns a needs-more-info verdict:

```
theta /b165livewf: argument binding needs more info — The required parameter 'topic' cannot be determined from the user…
```

`turn.userTexts` is `[]` — the body never dispatches — and the assertion at
`:6219` reds.

Root cause: the fence's truth condition includes a real, unpinned model's
judgement. `hello` is an unlabelled token with no relation to the parameter
name `topic`; binding it requires the model to decide that the sole free-text
argument fills the sole required field. That inference used to happen and no
longer does. Nothing in the extension changed: registration, the
`default-without-literal` refusal, and the lowering of
`topic: string` / `p: 'string = "ok"'` are byte-stable across
`d2d3d02f..d530f566` and all still green in the same cell. The drift is
provider-side, in the binder model's reading of the shipped binder system
prompt against an unlabelled argument.

The cell's fence therefore asserts two propositions at once — "the code
registers and lowers the well-formed default correctly" (its actual subject)
and "a live haiku infers a required param from bare free text" (an incidental
property of the drive text it happens to use). Only the second failed.

## Why it matters

Every future full live run reds at this cell. Without a filed signature the
red is attributed to whichever code change is in flight, and a session can
spend a fix lane chasing a parser regression that does not exist — exactly
what the cross-version probe already ruled out here. `AGENTS.md`
§"Expect documented correct-reason reds" (`AGENTS.md:53`) makes the filed
report the mechanism that prevents that mis-attribution and the mechanism
that stops the test being "fixed" by weakening it.

The three sibling cells at `:5576`, `:5974` and `:7489` carry the same
unlabelled-argument dependency and are one further judgement shift away from
the same red.

## Non-goals

- **Bug 0165's landed subject.** The empty-default registration refusal
  (`./0165-empty-params-default-literal-admitted-and-never-bound.md`, fixed in
  0.92.0) is untouched and green in all four runs above: the precondition
  control registers, `b165liveempty` does not, and the load-time
  `default-without-literal` note fires. Nothing here re-opens it.
- **The binder feature itself.** Whether the binder *should* infer a required
  parameter from a sole unlabelled argument is a product question this report
  does not settle. The runtime's needs-more-info path is behaving as designed:
  it declined and said so on the documented channel rather than binding
  `null`.
- **The bug-0231 live cell**, the run's other red
  (`./0231-well-formed-field-behind-malformed-entry-unchecked.md`), isolated
  green afterwards.

## Fix

Harden the drive text so the fence's truth condition is the code's behaviour,
not the model's inference. This report is the pre-authorization the protected
live cell needs for that edit.

Edit sites, both in `tests/live/live-production-acceptance.test.ts`:

1. `:6213` — replace the drive text `"/b165livewf hello"` with a spelling that
   names the field, e.g. `"/b165livewf topic=hello"` or
   `"/b165livewf topic: hello"`. The bound value stays `hello`, so the theta
   fixture, the required/defaulted split and the sentinel body need no change,
   and the fence keeps testing what it was written to test: that a
   literal-RHS default registers, binds, and recovers its declared value.
2. `:6219` — the expected note
   `"Running /b165livewf: topic=hello, p=ok (default)"` embeds the bound value
   and stays correct under either spelling; confirm it verbatim after the
   change rather than assuming it. `:6220`–`:6225` (the `B165_SENTINEL`
   assertion) and `:6226`–`:6233` (the fail-closed-note assertion) are
   value-independent and need no edit.

Re-verify by running the single cell under the live lock:

```
npx vitest run --config config/vitest/vitest.live.config.ts tests/live/live-production-acceptance.test.ts -t "well-formed-default sibling"
```

Then prove both directions per `AGENTS.md` §"Verify both directions": the
hardened drive must still red if the binder genuinely fails.

Pinning a different `bind_model:` is **not** the route. It trades one model's
judgement for another's and leaves the same latent dependency; the drive text
should be model-robust. The same reasoning already settled
`./0243-verbatim-echo-drive-sentinels-read-as-prompt-injection.md`, which
rewrote drive text rather than chasing model behaviour.

Deciding whether to apply the same hardening to the three sibling drives at
`:5576`, `:5974` and `:7489` is inside this fix's scope; they are green today,
so a fix that changes only `:6213` is complete on its own and may record the
siblings as a follow-on observation.

## Provenance

Filed in the eighteenth `/fix-open-bugs` session tail at HEAD `d530f566`,
v0.278.0. The live evidence is the parent session's: the full live run at
`d530f566` (`.pi/tmp/fix-open-bugs/live-full-v0278.log`, 219/221), two
re-runs (`live-v0278-rerun.log`, `live-v0278-rerun2.log`), and the
cross-version probe at `d2d3d02f` (v0.272.0 code) in a throwaway worktree
whose log — `../pi-theta-v272probe/live-0165-probe.log` — did not survive the
worktree's removal. The v0.272.0 baseline
(`.pi/tmp/fix-open-bugs/live-full-v0272.log`, 100 files / 213 tests, all
green first pass) is the contrast that makes the probe decisive. This writer
ran no live tests. Every static citation above — fixture, drive, assertions,
sibling drives, the `d2d3d02f..d530f566` parser diff — was re-derived offline
at HEAD `d530f566`.

## Fix (0.279.0)

- **What shipped:** `tests/live/live-production-acceptance.test.ts` — the H8a
  bug-0165 over-fire fence's drive at `:6213` is now
  `"/b165livewf topic=hello"` (§Fix step 1, the doc's own first spelling); the
  adjoining comment states why the field is labelled — a real binder pass must
  not hinge on the model inferring a required parameter's name from an
  unlabelled bareword. §Fix step 2 confirmed rather than edited: the bound
  value is still `hello`, so the expected note at `:6219` stays verbatim
  `"Running /b165livewf: topic=hello, p=ok (default)"`, and `:6220`–`:6233`
  are byte-untouched. `bind_model:` unchanged (the repin route is rejected by
  §Fix). The refusal under test — the empty-default offender, its precondition
  control and the load-time `default-without-literal` note assertion — is
  byte-untouched. Net line delta zero (14864 lines before and after), so the
  line citations sibling bug documents hold into this file (`:6556`, `:6938`,
  `:7489`, `:11363`) survive. No `src/` change; one file, five lines in, five
  out.
- **Gates:**
  - Witness, both directions, under the live lock, single file filtered by
    `-t "bug 0165"`. Hardened drive: `Test Files 1 passed (1)` /
    `Tests 1 passed | 89 skipped (90)`, the cell green in 123.07 s. Neutralised
    (drive temporarily restored to `"/b165livewf hello"`):
    `Test Files 1 failed (1)`, `AssertionError: … Notes: ["theta /b165livewf:
    argument binding needs more info — The required parameter 'topic' cannot
    be determined from the user…"]; outbound: []` at `:6219` — the filed
    signature exactly. Restore byte-exact: `git hash-object` =
    `9130dddbcb2e2a40b71b22afad69b6ad9f20c7f4` before and after, 14864 lines
    before and after.
  - `npm test` — `Test Files 456 passed (456)`, `Tests 9368 passed (9368)`.
  - `npx tsc --noEmit` — clean, no output.
  - `npm run lint` — clean, no output.
- **Review:** one pre-review correction round (comment prose only, zero
  assertion and zero behavioural change: the implementer's comment had grown
  the file by four lines, shifting the later-line citations four sibling bug
  documents hold into this file; recompressed to net zero, drive and assertion
  back at `:6213`/`:6219`, restored line count stated above). Round 1
  (`bug-fix-reviewer`): CLEAN, no findings — it confirmed from `src/` that a
  `field=value` slash argument still routes through a real binder pass
  (`classifyBinderBypass`, `src/binder/binder-envelope.ts`: the fixture's two
  fields defeat both bypass classes; `src/extension/production-theta-producer.ts`
  hands the raw argument string to the binder model verbatim, with no
  `key=value` pre-parse anywhere in `src/`), so the fence is not vacuous; it
  recorded the sibling exposure as the doc-sanctioned follow-on.
- **Verification:** VERIFIED. Witness both directions — audited above, and the
  three-way hash match (before / after / current working tree) proves the
  neutralised state did not survive. Default suite, typecheck, lint —
  independently re-run green by both the verifier and this orchestrator. Live
  coverage of the fixed path — the hardened cell itself, run for real against
  the pinned model. Scope — `git status --porcelain` shows exactly the one
  modified file; `tests/fixtures/h7a/permitted-codes.json` byte-identical;
  the three sibling bare-`hello` drives byte-untouched; no verbatim-echo drive
  shape introduced (bug 0243); scratch-token sweep zero hits.
- **Phase adaptations (D1 test-infra):** no new test was owed and none was
  added — the defect is a drive-text dependency inside an existing protected
  live cell, and an offline witness cannot reach a live binder turn. The
  red-proof is discharged by this report's captured evidence (three HEAD logs
  plus the cross-version probe at `d2d3d02f`, 4-for-4 red) and re-proved
  first-hand by the neutralise-and-run above; no pre-edit live run was made,
  because the neutralised run is that same measurement post-edit and the live
  budget is shared. Verification ran offline-only in its own process: this
  orchestrator executed every live command under the shared lock and handed
  the verifier the output, and no reviewer was ever scheduled concurrently
  with a tree-mutating step.
- **Residuals:**
  1. The three sibling fences still drive an unlabelled bareword against a
     required `topic` field through a real binder pass — `:5576`
     (`"/b66livedef hello"`), `:5974` (`"/b166livenum hello"`), `:7489`
     (`"/b181livedef hello"`), all pinning
     `bind_model: anthropic/claude-haiku-4-5`. They are green today (run (a)
     above) and §Fix states a change touching only `:6213` is complete on its
     own and may record them as a follow-on observation, so they are left
     byte-untouched. Each is one further judgement shift from this exact red;
     the remedy is mechanical and identical (label the field).
  2. The drift itself is provider-side and unfixed by definition: the pinned
     binder model still declines the bare spelling, as the neutralised run
     demonstrates today. This fix removes the dependency at one site, not the
     drift.
- **Discharge notes appended:** none.
- **Pinned dispositions / non-goals:** a `bind_model:` repin remains rejected
  (§Fix) — it trades one model's judgement for another's and leaves the latent
  dependency. Bug 0165's landed subject, the binder feature question, and the
  bug-0231 live cell stay out of scope, per §Non-goals.
