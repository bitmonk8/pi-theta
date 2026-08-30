# Bug 0340 — Four H8a-T cells in the line-pinned `live-production-acceptance.test.ts` assert the pre-0337 cross-file enum equality (`v == Sev.High` renders `true`); after bug 0337 gave `.theta` enums file-qualified identity across in-process invoke, each renders `false` and reds deterministically in every full live run

- **Status:** fixed (0.310.0).
- **Sev/Diff estimate:** S3/D2 — S3: the product behaviour is correct (0337's
  file-qualified identity is the intended semantics); the four cells are
  witnesses asserting the superseded equality, so they red the full live gate
  without a runtime defect behind them. D2: the §Fix is settled by the 0337
  ratification's own logic, confined to one file, and mirrors a landed offline
  re-anchor pattern — but it edits the 14864-line-pinned LPA file and each cell
  needs a live re-run under the campaign lock.
- **Kind:** defect — stale test anchors (four cells assert pre-0337 semantics).
- **Affected** (verified at HEAD `39f05bed`, v0.308.0):
  - `tests/live/live-production-acceptance.test.ts:5747` — H8a-T bug-0067
    cross-envelope cell; renders `SEVCROSS=${v == Sev.High}` where `v` is a
    subagent-mode callee's `Sev.High` and `Sev.High` is the caller's own
    same-named declaration; asserts `.toBe("true")`.
  - `tests/live/live-production-acceptance.test.ts:6664` — H8a-T bug-0172
    boundary-2 cell; renders `B2CROSS=${v == Sev.High}` where `v` is a
    `tools:`-routed `.theta`-callable return; asserts `.toBe("true")`.
  - `tests/live/live-production-acceptance.test.ts:6944` — H8a-T bug-0174
    prompt→prompt attach cell; renders `PPCROSS=${v == Sev.High}` where `v` is
    a prompt-mode callee's return; asserts `.toBe("true")`.
  - `tests/live/live-production-acceptance.test.ts:7324` — H8a-T bug-0172
    face-2 cell; renders `SEVCROSS=${v == Sev.High}` where `v` crosses a typed
    `invoke<Sev | null>` union; asserts `.toBe("true")`.
  - The file is line-pinned at exactly 14864 lines (`wc -l` 14864); multiple
    bug docs cite into it by line, so any edit holds that count.
- **Observed at:** HEAD `39f05bed`, v0.308.0. Full live run
  (`npx vitest run --config config/vitest/vitest.live.config.ts`) recorded at
  `.pi/tmp/fix-open-bugs/live-full-v0308.log` (6 failed / 232 passed;
  the four cells here are cases 2–5 of that file's six-item failure list).
  The other two reds in that log belong to a different signature and are out of
  scope here.

## Summary

Bug 0337 (fixed 0.305.0, `62bf9d3c`) made a `.theta`-declared enum's identity
file-qualified across in-process invoke: a callee's returned enum variant
belongs to the callee's declaration and compares `!=` against the caller's own
same-named variant. Four H8a-T cells in `live-production-acceptance.test.ts`
were written to the pre-0337 semantics — each declares `enum Sev { High =
"high" }` in a parent, invokes a callee that declares and returns its own
`Sev.High`, renders `${v == Sev.High}` into the transcript, and asserts the
segment is `"true"`. Under 0337 that comparison is now `false`, so the four
cells red deterministically in every full live run. The subjects the cells
witness (tag reattachment across the PIC-59 envelope, the inbound translation
pass on a `.theta`-callable return, prompt-attach return validation, and
first-admitting-arm union dispatch) are unchanged; only the equality anchor is
stale.

The 0337 lane premeasured the DEFAULT (offline) suite and re-anchored 26
offline cells under parent ratification. The LIVE config was not premeasured
and the LPA file was rider-forbidden to the lane, so its four cross-file cells
kept asserting the superseded equality.

## Reproduction

Full live run at HEAD `39f05bed`; the four cells red with these signatures
(verbatim from `.pi/tmp/fix-open-bugs/live-full-v0308.log`, each
`expected 'false' to be 'true'` on a rendered `valuesEqual` segment):

```
FAIL tests/live/live-production-acceptance.test.ts:5747
  H8a-T — bug 0067: a named-enum value crossing the PIC-59 envelope regains its tag, live
  > a typed invoke<Sev> binds a spawned subagent child's bare enum variant,
    and it compares equal to the parent's own Sev.High
  AssertionError: … Rendered segment: "false": expected 'false' to be 'true'

FAIL tests/live/live-production-acceptance.test.ts:6664
  H8a-T — bug 0172 boundary 2: a .theta-callable tool-call return performs the inbound translation pass, live
  > a named-enum value returned by a tools:-routed .theta-callable call (no
    invoke<Schema> annotation) compares equal to the caller's own variant
  AssertionError: … Rendered segment: "false": expected 'false' to be 'true'

FAIL tests/live/live-production-acceptance.test.ts:6944
  H8a-T — bug 0174: a typed invoke<Sev> of a PROMPT-mode callee validates a named-enum return on the attach cell, live
  > a named-enum value returned by a prompt-mode callee across the prompt→prompt
    attach cell compares equal to the caller's own Sev.High
  AssertionError: … Rendered segment: "false": expected 'false' to be 'true'

FAIL tests/live/live-production-acceptance.test.ts:7324
  H8a-T — bug 0172 face 2: invoke<Sev | null> dispatches the first-admitting anyOf arm, live
  > a typed invoke<Sev | null> binds a spawned subagent child's bare enum
    variant under the union's first arm, and it compares equal to the parent's
    own Sev.High
  AssertionError: … Rendered segment: "false": expected 'false' to be 'true'
```

Each parent theta declares its own `enum Sev { High = "high" }`, obtains a
`Sev.High` from a callee that declares its own same-named enum, and interpolates
`${v == Sev.High}` between markers; the extracted segment is the observable.

## Expected behaviour

A full live run at HEAD is green on these four cells, and each cell witnesses
its subject against the post-0337 semantics: the returned value carries a tag
(it is not the bare wire string), and — because it belongs to the callee's
declaration in a different file — it compares `!=` the caller's own same-named
variant (`runtime-value-model.md:34`: at the invoke-return and typed
`.theta`-callable-return boundaries "the reattached tag keys on the CALLEE's
declaring file … the result compares equal to a variant of the callee's own
declaration, and — where the receiving file happens to declare its own
same-named enum — unequal to that one").

## Actual behaviour / root cause

The four cells render `${v == Sev.High}` comparing the callee's returned
`Sev.High` against the caller's own `Sev.High` and assert the segment is
`"true"`. Pre-0337, both variants tagged on the bare name `"Sev"` and
`valuesEqual` returned `true`. Post-0337, the callee's variant carries its
file-qualified `enumDeclaringKey` and the caller's carries its own, so
`valuesEqual` returns `false`; the rendered segment is `"false"` and the
`.toBe("true")` assertion reds.

The staleness escaped the 0337 lane because the lane premeasured only the
offline suite. The 0337 ratification re-anchored 26 offline cells across both
sub-kinds (stale-bare-anchor and cross-callee), but the LIVE config was never
premeasured and the LPA file was rider-forbidden to the lane, so its four
cross-file cells were not touched. The subjects are intact: the cross-envelope
tag reattachment (0067), the inbound translation pass on the `tools:`-callable
return (0172 boundary 2), the prompt→prompt attach-cell validation (0174), and
the first-admitting-arm union dispatch (0172 face 2) all still hold under 0337
— only the cross-file equality anchor was invalidated.

## Why it matters

The four reds recur in every full live run. Per AGENTS.md §"Expect documented
correct-reason reds", they are documented correct-reason reds owned by this
report until the re-anchor lands: a full-live run treats this pinned signature
(`expected 'false' to be 'true'` on the four cited lines) as owned here, not as
a fresh regression. Without this record, each live run re-triages four reds
whose cause is settled.

## Fix

Re-anchor the four cells under the line-14864 pin, subject-preserving,
mirroring the offline sub-kind-(A) cross-callee re-anchors bug 0337 landed
(pattern in `tests/subagent-invoke-inbound-enum-tag.test.ts` and
`tests/inbound-boundary-theta-callable.test.ts`). For each cell:

- Keep the drive and the marker-anchored extraction unchanged.
- Render two observables instead of the single cross-file equality: an in-theta
  tag-presence discriminator (`v == "high"` → `false`, because a tagged enum
  value is not the bare wire string, proving the tag was reattached, not
  dropped) and the new cross-declaration inequality (`v == Sev.High` → `false`,
  because the returned variant belongs to the callee's declaration in a
  different file). The tag-presence discriminator preserves each owning bug's
  "tag reattached, not dropped" subject; the inequality is the post-0337
  observable.
- Update the assertion-message prose to cite the post-0337 sentence of
  `docs/spec_topics/runtime-value-model.md:34` (invoke-return / typed
  `.theta`-callable-return boundary keys the tag on the callee's declaring
  file), replacing the pre-0337 "must compare equal to the caller's own
  variant" phrasing.
- Hold the file at exactly 14864 lines (`wc -l` 14864 before and after each
  edit); change no other cell, fixture, or code.

Re-run each re-anchored cell live under the campaign lock after editing to
confirm green. This edit is confined to
`tests/live/live-production-acceptance.test.ts` and requires a run permitted to
touch the file under the pin; it folds into any open batch on the file
(precedent: `./0336-stale-lexical-environment-cite-in-lpa-comment.md` §Fix,
executed under the 14864-line pin).

## Provenance

- Surfaced by the full live run at HEAD `39f05bed` (v0.308.0),
  `.pi/tmp/fix-open-bugs/live-full-v0308.log`. All four line cites and both
  cell mechanics (parent + callee both declaring `enum Sev`, the rendered
  `${v == Sev.High}` segment, the `.toBe("true")` assertion) verified by
  `Read`/`grep` at HEAD offline. No live test was run to file this report.
- The re-anchor semantics are settled by the bug 0337 parent ratification
  (2026-08-27, twenty-third session), whose sub-kind-(A) rule ("re-anchor to
  the CALLEE's file-qualified variant … where a cell's very point was the
  cross-file comparison, ADDITIONALLY assert the new inequality against the
  caller's own enum") extends to these four live cells; the ratification's
  premeasure covered only the offline suite, leaving them out of the lane.
- Related:
  [0337](./0337-theta-enum-identity-collides-across-in-process-invoke.md) —
  fixed (0.305.0); the fix that gave `.theta` enums file-qualified identity
  across in-process invoke, invalidating these cells' equality anchor.
  [0067](./0067-subagent-envelope-drops-enum-tag.md) — fixed (0.90.0); owns
  the `:5747` cell's cross-envelope tag-reattachment subject.
  [0172](./0172-inbound-translation-pass-unperformed-at-three-boundaries.md) —
  fixed (0.102.0); owns the `:6664` boundary-2 and `:7324` face-2 subjects.
  [0174](./0174-typed-invoke-enum-return-validation-prompt-cell.md) — fixed
  (0.98.0); owns the `:6944` prompt-attach subject.
  [0336](./0336-stale-lexical-environment-cite-in-lpa-comment.md) — fixed
  (0.308.0); precedent for a same-line-count edit inside the same
  14864-line-pinned LPA file.

## Fix (0.310.0)

- What shipped: `tests/live/live-production-acceptance.test.ts` — the four
  H8a-T cross-file cells re-anchored to the post-0337 file-qualified identity,
  keyed to §Fix. Each parent theta now renders TWO observables between the
  unchanged markers — `${v == Sev.High}/${v == "high"}` — and the assertion
  flips from `.toBe("true")` to `.toBe("false/false")`: the cross-declaration
  inequality (`v == Sev.High` → false, the returned variant belongs to the
  callee's declaration in a different file) and the tag-presence discriminator
  (`v == "high"` → false, a tagged enum is not the bare wire string —
  preserving each owning bug's tag-reattached-not-dropped subject). Cells:
  bug 0067 cross-envelope (`b67SevEnumParentTheta`), bug 0172 boundary-2
  (`b172liveB2ParentTheta`), bug 0174 prompt-attach (`b174livePpParentTheta`),
  bug 0172 face-2 (`b0172Face2UnionEnumParentTheta`). Each assertion message
  re-cited to `docs/spec_topics/runtime-value-model.md:34`'s post-0337
  sentence (the reattached tag keys on the CALLEE's declaring file), replacing
  the pre-0337 "must compare equal to the caller's own variant" phrasing. The
  drive and the marker-anchored extraction regex (`/…=([\s\S]*?)\|END/`) are
  byte-unchanged. Same-line-count edit under the 14864-line pin; no other
  cell, fixture, or code touched.
- Gates: witness — the four cells run live under the campaign lock RED before
  the edit (`Rendered segment: "false": expected 'false' to be 'true'`, the
  §Reproduction signature) and GREEN after (all four "1 passed"); full offline
  suite `npm test` 485 files / 9612 tests green (unchanged — the LPA is
  excluded from the default config); `npm run typecheck` exit 0; `npm run lint`
  exit 0; `wc -l` 14864 held before and after every edit; `git diff --stat`
  49 insertions / 49 deletions (line-neutral); LF preserved (`grep -c $'\r'`
  0); `tests/fixtures/h7a/permitted-codes.json` `git hash-object` unchanged
  (`a4a8da04…`).
- Review: 1 round — `bug-fix-reviewer` CLEAN; no correctness/fidelity/spec
  finding; two `prose` residuals (R1/R2 below) held out of the settled §Fix
  scope.
- Verification: PASS — (A) red→green witness discharged by the pre-edit RED
  and post-edit GREEN live logs; (B) offline suite 485/9612 green; (C)
  typecheck + lint exit 0; (D) pin 14864, diff confined to the four enumerated
  cells (the bug-0181 same-file `sev == Sev.High` cell at the neighbouring
  banner untouched — the only surviving `.toBe("true")` in the file), stash
  empty, fixture hash held. The verifier's initial FAIL rested on two
  non-defects: a `sha1sum`-vs-`git hash-object` tooling mismatch on the
  untouched fixture (the pinned `git hash-object` value matches on disk), and
  the not-yet-written Fix record (this section).
- Residuals:
  1. R1 (prose) — the four cells' `it` titles still read "…compares equal to
     the parent's/caller's own Sev.High", now contradicting their
     `.toBe("false/false")` assertions. Held out of scope: §Fix enumerates only
     "assertion-message prose", and this doc's §Reproduction pins those titles
     verbatim as the red signature (and they are the live `-t` selectors), so
     re-titling exceeds the settled edit and would decouple the reproduction
     anchors. A 0336-class same-pin follow-up.
  2. R2 (prose) — the four owning-bug cell banners still narrate "post-fix …
     renders `true`", accurate until 0337 inverted the rendered value. Same
     out-of-scope 0336-class follow-up as R1.
- Discharge notes appended: none owed.
- Pinned dispositions / non-goals: the file stays line-pinned at 14864; the
  discriminator is rendered as a single combined `false/false` segment (not two
  separate assertions) to hold the pin under the line-neutral constraint — the
  faithful LPA idiom of the offline sub-kind-(A) two-field mirror. R1/R2 stay
  fold-in material for any future batch permitted to touch the file under the
  pin. Multi-hop attribution is out of scope (bug 0342).
