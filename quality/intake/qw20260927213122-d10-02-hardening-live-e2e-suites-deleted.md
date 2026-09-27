---
id: pending
title: The live-e2e verification claims in fix records 0011, 0012, 0013 and 0014 name tests/hardening/ suites (session-binder, session-cancellation, discovery-cli, session-prompt-transport) that a6a5953e deleted without successors
lens: D10
status: intake
verdict: pending
locations:
  - docs/bugs/0011-binder-complete-no-forced-tool-free-text-envelope.md:124-137
  - docs/bugs/0012-untyped-off-session-mid-abort-transport-not-cancelled.md:108-115
  - docs/bugs/0013-load-warnings-dropped-by-both-production-sinks.md:125-128
  - docs/bugs/0014-empty-typed-query-annotation-silent-unvalidated-bind.md:111-117
  - tests/live/hardening/probe-harness.ts
sites: 4
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260927213122
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-27
---

# The live-e2e verification claims in fix records 0011, 0012, 0013 and 0014 name tests/hardening/ suites (session-binder, session-cancellation, discovery-cli, session-prompt-transport) that a6a5953e deleted without successors

## Observation
Four fixed-Status records back their live-verification sentence with a named token-gated suite under `tests/hardening/`:
- 0011's "live-proven" names `session-binder.test.ts`.
- 0012's "Live e2e … green" names `session-cancellation.test.ts`.
- 0013's "Live e2e" names `discovery-cli.test.ts`.
- 0014's "Live e2e" names `session-prompt-transport.test.ts`.

Commit `a6a5953e` ("test: restructure suites into two groups") deleted all four files. Its message says it deleted "the 27 probe files whose surface is pinned by the default suite … or by the H8a/H9a live suites" and moved 7 survivors to `tests/live/hardening/`. None of the four is among the survivors: `find tests -name <basename>` returns 0 for each, while the moved `probe-harness.ts` resolves at `tests/live/hardening/probe-harness.ts`. None of the four records mentions the deletion.

## Evidence
**Site 1:** docs/bugs/0011-binder-complete-no-forced-tool-free-text-envelope.md:124-137
```
required the wrapped forced call to be live-confirmed before the free-text
path was deleted. Two live runs of the token-gated
`tests/hardening/session-binder.test.ts` (real pi binary, binder model
`anthropic/claude-haiku-4-5`): the first falsified the intermediate
`$defs`-hoisted attachment for NamedType params — 7/10 green but all three
enum/schema-typed cases bound malformed (the `d848f1b2` class, scoped to
`$ref`-carrying schemas) — which drove the reference-inlining attachment
design; the second run passed 10/10, including `sev=High` enum binding,
schema-typed object binding, and mixed enum + nullable binding through the
forced call (`Running /triage: sev=High`,
`Running /triage2: sev=High, note="the login page crashes on submit"`). The
unwrapped-`anyOf` finding of `d848f1b2` thus stands falsified only for the
attachment shape it tested; the wrapped, dereferenced forced call is
live-proven.
```

**Site 2:** docs/bugs/0012-untyped-off-session-mid-abort-transport-not-cancelled.md:108-115
```
CLEAN). Live e2e: `tests/hardening/session-cancellation.test.ts` (real pi
binary, real provider) green — its single cell drives a real untyped
`@`-query through the shipped extension across the new text-arm guard under
a never-aborted signal, pinning the guards' negative half (no misfire on a
clean run); the hardening harness cannot inject a mid-turn abort into a
live drive (documented limitation), so the abort-positive halves rest on
the (p1)/(p2) seam pins, which exercise the real classifier fold and the
real PIC-51 probe against scripted turns.
```

**Site 3:** docs/bugs/0013-load-warnings-dropped-by-both-production-sinks.md:125-128
```
none blocking → CLEAN). Live e2e: `tests/hardening/discovery-cli.test.ts`
(real `pi` binary, real extension discovery over planted workspaces) — the
DISC-1 cell proves a warning-severity `theta/load/unreadable-source`
diagnostic arriving as one persistent `theta-system-note` through the real
```
The same Fix section (:113-118) also names `discovery-cli.test.ts`, `frontmatter-diagnostics.test.ts`, `session-binder.test.ts` and `session-discodyn.test.ts` as re-stated hardening probes. All four are in `a6a5953e`'s deletion list. The fifth name there, `probe-harness.ts`, moved to tests/live/hardening/probe-harness.ts.

**Site 4:** docs/bugs/0014-empty-typed-query-annotation-silent-unvalidated-bind.md:111-117
```
lint clean; one review round (CLEAN, no findings). Live e2e: the hardening
prompt-transport typed cell
(`tests/hardening/session-prompt-transport.test.ts`, real extension
discovery → live `AgentSession` → typed two-phase forced respond with AJV)
binds `token=PONG` and interpolates it into the follow-up turn — well-formed
typed queries unregressed through the real stack (its untyped sibling cell
also ran via vitest's substring `-t` matching and passed).
```

**Searches run in this session:**

Filename representation, via `find tests -name <n> | wc -l`:

| Basename | Hits |
|---|---|
| `session-binder.test.ts` | 0 |
| `session-cancellation.test.ts` | 0 |
| `discovery-cli.test.ts` | 0 |
| `session-prompt-transport.test.ts` | 0 |
| `frontmatter-diagnostics.test.ts` | 0 |
| `session-discodyn.test.ts` | 0 |
| `probe-harness.ts` | 1 (`tests/live/hardening/probe-harness.ts`) |

Deletion, not rename: `git show --stat a6a5953e -M` lists each of the six with only `-` lines, for example `tests/hardening/session-binder.test.ts | 419 ------`. By contrast, the moved survivors show as `tests/{ => live}/hardening/…`.

Cell / title representation for a moved successor:
- `rg -l -F 'sev=High' tests/live | wc -l`: 0
- `rg -l 'DISC-1' tests/live | wc -l`: 0
- `rg -l -F 'token=PONG' tests | wc -l`: 0
- `rg -l 'session-cancellation' tests | wc -l`: 0
- `rg -l -i 'bug 0012' tests/live | wc -l`: 0
- `rg -l -i 'bug 0011|bug-0011' tests/live | wc -l`: 0
- `rg -l -i 'bug 0013|bug-0013' tests/live | wc -l`: 1 (`tests/live/hardening/probe-harness.ts`, a harness, not the DISC-1 cell)

Current `tests/live/hardening/` listing: `b0308-cap0-exhaustion-note.test.ts`, `imports-thetalib-fn.test.ts`, `probe-harness.ts`, `question-operand-defect-abort.test.ts`, `recent-rfc-live-drives.test.ts`, `session-convdrive.test.ts`, `session-invoke-attach.test.ts`, `session-promptloop.test.ts`, `session-promptstream.test.ts`, `session-subagent-toolloop.test.ts`. None of these is one of the four named suites.

## Why this is a problem
Each record states its live verification by pointing at a named suite, and each pointer no longer resolves: the file was deleted, not moved. The runs themselves are dated to the fix versions, and this filing does not dispute that they happened. But the stated witness (the suite a reader would re-run to re-establish the "live-proven" / "Live e2e … green" claim) is gone. Nothing in the records says so. `a6a5953e`'s message says the deleted probes' surfaces are pinned elsewhere, but it names no per-probe successor, and the searches above find no cell carrying these probes' observables (`sev=High`, `DISC-1`, `token=PONG`). Under this store's posture, a live witness is already not gate-proven. Once its file is also absent, the claim rests on the record's prose alone.

## Suggested direction (non-binding, optional)
Annotate each live-e2e sentence with the `a6a5953e` deletion, naming a current tests/live/ cell where one carries the same observable. Where none does, record the claim as a historical run only.

## False-positive check
- **Representations covered:**
  - Bug-doc Fix pointers: the four sites, re-read.
  - Test file names: `find` per basename.
  - Test titles and cell observables: the rg searches above over `tests/live` and `tests`.
  - Git history: `git log --diff-filter=DR` and `git show --stat a6a5953e -M`, which show deletion with no rename.
  - Coverage-matrix rows: the records cite no matrix row for these live claims.
  - CHANGELOG: corroboration only, not consulted as a witness.
- **Moved vs deleted:** the moved survivors resolve; these four do not. `probe-harness.ts` resolves, so I counted it as context, not as a site.
- **Not the retired-off-session filing:** this filing is about the `a6a5953e` hardening deletion, a different commit and a different class of witness (live suites). Sibling filing qw20260927213122-d10-01 covers the `89faa7c5` default-suite deletions. Site 2 (0012) sits in the same record as d10-01's Site 4, but it has a different pointer and a different root cause.
- **Already-filed topics:** no listed PTQ/intake file covers these records' live-witness pointers.
- **Honesty-marker check:** 0012's "documented limitation" sentence is a marker and is not what is filed. What is filed is the named-suite pointer.

## Triage
verdict: questionable — decay verified, but no single equivalent exists to re-point to. All four claim excerpts reproduce at 0011:124-137, 0012:108-115, 0013:113-128 and 0014:111-117. `find tests -name` returns 0 for all six basenames and 1 for probe-harness.ts (tests/live/hardening/). `git show --stat -M a6a5953e` shows each suite as a pure deletion, with only probe-harness.ts renamed `{ => live}`. The commit message names no per-probe successor. The stated searches reproduce (sev=High 0, DISC-1 0, token=PONG 0, session-cancellation 0, bug-0013 → probe-harness.ts only). My own searches over tests/live found only loosely related binder and discovery-cli-* live cells, none carrying these probes' observables. No existing PTQ tracks this. With no unambiguous equivalent, changing the records' wording is a human's call (triage: claude-opus-5-5)
