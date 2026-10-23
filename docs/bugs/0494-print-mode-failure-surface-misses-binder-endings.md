# Bug 0494 — the bug-0493 print-mode failure surface misses every binder short-circuit ending: a `pi -p` parent whose invocation dies in the argument binder (needs_info, ambiguous, malformed, ajv_args, transport, cancelled, BNDR-9) still exits 0 with empty stdout and empty stderr

- **Status:** fixed (unreleased - commit/push only)
- **Release status:** no new package release is published. The existing published
  package does not contain this new fix; no resolving shipment SHA is assigned
  here. Commit/push remain outside this closure worker's authority.
- **Owning repo:** pi-theta
- **Sev/Diff estimate:** S3/D1 — S3: the same defect class as bug 0493 D2
  (no result corruption, but the parent run's failure is invisible at the
  process boundary: exit 0, empty stdout, no stderr line, and — on the
  pinned host's assistant-gated flush — no session file either, since a
  binder short-circuit by construction precedes the first assistant turn).
  Every `pi -p` lane whose invocation dies in the binder is scored green.
  D1: the seam already exists and is already gated — `BinderRunner` holds
  the exact input that carries it — so the fix is two emit-site additions
  plus witnesses.
- **Where:**
  - `src/extension/binder-run.ts:874` — `#emitBinderFailureNote` (the six
    `BinderFailureSurface` kinds) sends the note and nothing else: no
    `printModeFailureSurface` call on any of its three arms (ticket-less,
    stamp-failure fallback, normal).
  - `src/extension/binder-run.ts:849` — `#emitCustomTypeUnsafeNote` (the
    BNDR-9 transcript-unsafe abort): same gap.
  - `src/extension/theta-composition-producer.ts:320–322` — the single
    consumer of every binder short-circuit: `if (!binderResult.bound)
    { return; }` — the drive ends silently; the run-card summary is left at
    its seeded `"cancelled"` and neither 0493 D2 producer method ever runs
    (the body never started, so there is no top-level `Err`/panic to
    frame).
  - `src/extension/production-theta-producer.ts:446–447, 472–473` — the
    two bug-0493 D2 surface calls (`emitTopLevelErrNote` / `emitPanicNote`)
    — the two methods the settled 0493 §Fix took as the COMPLETE funnel
    for terminal non-Ok endings. That premise was false: the funnel is
    four methods, two of them in `BinderRunner`.
  - `src/extension/production-composition.ts:1107–1122` — the surface
    definition and its gating (`ctx.mode` ∈ {print, json} ∧
    `!subagentRootRegime.active`), correct and reusable as-is.
  - `src/extension/production-producer-deps.ts:424–428` —
    `ProductionProducerInput.printModeFailureSurface`, the optional seam;
    `BinderRunner`'s construction input IS `ProductionProducerInput`
    (`binder-run.ts:174` `readonly #input: ProductionProducerInput`), so
    the surface is already reachable at both missing emit sites.
  - `docs/spec_topics/pi-integration-contract/runtime-event-channel.md:35`
    — the spec files binder failure notes in the SAME
    `details: { event: RuntimeEvent }` top-level-cascade row as SLSH-3
    (only the template source differs: the failure-mode templates table,
    "the binder cascades out before any theta code runs, so no SLSH-3 site
    ever produced it"). The spec already treats these endings as the same
    top-level-cascade family the 0493 D2 surface was built for; the
    implementation surfaces only half the row.

## Observed (2026-09-27, round-1 release review of the 0493 fix, commit d941f7df)

Verified by code walk over `runBinder` (`src/extension/binder-run.ts:198+`):
every `{ bound: false }` return emits exactly one system note through
exactly two `BinderRunner` emitters before returning, and neither emitter
touches the print-mode failure surface. The complete ending enumeration —
each verified to reach `theta-composition-producer.ts:320`'s silent return:

| # | Ending | Emit site(s) (`binder-run.ts`) | Note template |
|---|---|---|---|
| 1 | `needs_info` (terminal classified outcome) | `:245` | `theta /<name>: argument binding needs more info — <msg>` |
| 2 | `ambiguous` (terminal classified outcome) | `:245` | `theta /<name>: ambiguous arguments — <msg>` |
| 3 | `malformed` (envelope unparseable after the HC3-b retry; plus the defensive unresolved-binder-model arm) | `:245`, `:313` | `theta /<name>: argument binding failed — could not parse arguments` |
| 4 | `transport` (HC3-a budget exhausted; plus the bug-0417 unsupported-api pre-dispatch gate) | `:245`, `:336` | `theta /<name>: argument binder unavailable (<provider>: <message>)` |
| 5 | `ajv_args` (post-default-merge AJV refusal / CIO-1 depth cross-route) | `:426` | `theta /<name>: argument binding produced invalid args — <ajv-summary>` |
| 6 | `cancelled` (pre-call checkpoint abort; in-flight abort) | `:502`, `:507` | `theta /<name>: argument binding cancelled` |
| 7 | BNDR-9 custom-type-unsafe (session-context abort; group-B diagnostics note, not a group-A event note) | `:230` → `:849` | `theta /<name>: custom-message type is not transcript-safe: '<value>'` |

In a `pi -p` (or `--mode json`) parent every one of these ends the run
with exit 0, empty stdout (no assistant turn ever happened), empty stderr,
and — pre-assistant on the pinned 0.87.1 host — no session file
(`SessionManager._persist` `hasAssistant` gate, bug 0493 D2). The note
lands only in the unflushed in-memory session. The bound arms
(`params` absent, the two bypasses) and a successful bind are unaffected.

The 0493 fix's own live witness family does not cover these endings:
`tests/print-mode-failure-surface.test.ts` drives `emitTopLevelErrNote` /
`emitPanicNote` only, and no acceptance cell invokes a params-carrying
theta whose binder fails.

## Expected

The bug-0493 D2 contract, applied to the whole top-level-cascade family
the spec already defines: a top-level drive in a print/json parent (not a
subagent child) that terminates without the body producing a surfaced
outcome — whether the ending is SLSH-3 Err, cancelled, panic, OR any of
the seven binder short-circuits — writes its rendered note to stderr and
sets `process.exitCode = 1`, so a lane runner can tell a failed probe from
a green one without forensics.

On which endings are genuine failures: all seven. `transport`,
`malformed`, `ajv_args`, and BNDR-9 are failures everywhere. `needs_info`
and `ambiguous` are interactive dialogue affordances — the binder is
asking the USER a question — and in print mode there is no user and the
process is about to exit: the invoked theta definitively did not run, and
"asked a question to nobody" reported as success is exactly the silent-
green shape 0493 D2 was filed against. `cancelled` mirrors the drive-level
cancelled ending, which 0493 D2 already marks failed
(`emitTopLevelErrNote` owns the cancelled rendering,
`err-note-render.ts:147–149`); the binder's cancelled arm reporting
success while the drive's cancelled arm reports failure would be
incoherent at the process boundary. No exit-code taxonomy split: `1` for
all, per D2's assign-only/never-lower rule.

## Actual

The surface is called from exactly two producer methods
(`production-theta-producer.ts:446–447, 472–473`). All seven binder
endings bypass both: `runBinder` returns `{ bound: false }`, the
composition producer returns at `:320–322`, and the process exits 0 in
silence. The 0493 §Fix sentence "All three terminal non-Ok framings of a
top-level drive already funnel through exactly two producer methods" was
false as a statement about terminal non-Ok ENDINGS — it enumerated the
framings of endings that reach the producer, not the endings of the drive.
Recorded at fix time as 0493 Residual 3; this bug is that residual filed.

## Fix direction

1. **Extend the same surface to both binder emitters.** `BinderRunner`
   already holds `ProductionProducerInput` (`binder-run.ts:174`), so both
   `#emitBinderFailureNote` and `#emitCustomTypeUnsafeNote` end with the
   same two calls the producer methods use:
   `this.#input.printModeFailureSurface?.mirrorLine(content)` then
   `…?.markFailed()`, where `content` is the same rendered note string the
   emitter just sent. Fire on EVERY arm — the ticket-less degrade
   (`details: { event: {} }`), the stamp-failure fallback
   (`#buildGroupAEventOrFallback` returning `undefined`: the note was
   already delivered, but the ending still owes its process-boundary
   surface), and the normal arm — matching 0493 D2's settled rule ("how
   the note was delivered does not change how the drive ended").
2. **No gating changes.** The surface's construction gate
   (print/json ∧ ¬subagent-root, `production-composition.ts:1107–1122`)
   carries over unchanged. A subagent child's marked root never reaches
   `runBinder` (the slash `run` routes it to `driveSubagentRootRegime`
   first — the subagent-root exemption), and a child composition defines
   no surface anyway, so no double-report path exists.
3. **Spec.** Give the print-mode failure surface its normative sentence
   (0493 Residual 4: today it exists only in the 0493 bug doc), scoped to
   the whole family in one place — the natural host is the
   `runtime-event-channel.md:35` cascade row's neighbourhood or a
   print-mode paragraph in `subagent.md`'s vicinity: a print/json
   non-child parent mirrors every top-level-cascade note (SLSH-3 Err,
   cancelled, panic, the binder failure rows, BNDR-9) to stderr and sets
   exit code 1.
   *Note (2026-09-28):* the normative home now exists at
   [slash-invocation.md — Print-mode failure surface](../spec_topics/slash-invocation.md#slsh-3-print-mode-failure-surface);
   this fix amends its binder-exclusion sentence there. Correction to
   §Observed: a `--mode json` parent does not end with empty stdout —
   it streams every session event (the note included) to stdout and exits
   `0`; empty stdout holds for text-mode `pi -p` only. Correction to the
   Sev/Diff estimate and §Observed: "no session file" holds for a new
   session only. A run on a session that already has a file (`-c`,
   `--session <existing file>`, `--session-id <existing id>`, `--fork`)
   appends every entry to it, the note included — `SessionManager` holds
   back writes only while the session is unflushed, and opening an
   existing file marks it flushed. Correction to the title and §Observed
   as fix expectations: the pre-fix state this fix removes is "no surface
   line on stderr", not literally "empty stderr" — on the arm where a
   binder note's own delivery falls to the fallback chain (unreachable
   today), the chain's step-2 `theta/runtime/system-note-delivery-failed`
   diagnostic is mirrored to a UI-less context's stderr as a
   `theta:`-prefixed line, so the fix's claims and witnesses must assert
   the absence of the surface's own line, not an empty stream.
4. **Witnesses.** Extend `tests/print-mode-failure-surface.test.ts` (or a
   sibling) over the real `BinderRunner`: each of the seven endings ×
   `ctx.mode` ∈ {print, json} fires the surface exactly once with the
   rendered note; tui/rpc inert; subagent-root composition inert; a
   successful bind and both bypasses inert; the stamp-failure and
   ticket-less arms still fire it. Optionally one H9a acceptance cell on
   the zero-spend deterministic arm (the bug-0417 unsupported-api gate
   refuses pre-dispatch): `pi -p` invoking a params theta whose
   `bind_model:` names a gate-refused api → exit 1 + `argument binder
   unavailable` on stderr.

## Relation to prior bugs

- **0493 (fixed 0.493.0)** — D2 built the surface and wired it to the two
  producer methods; its Residual 3 records this gap verbatim. This bug
  completes D2's coverage to the endings its premise missed.
- **0397 (fixed)** — made the binder failure notes group-A always-log
  members with `details.event` sourcing; the spec row this bug leans on
  (binder failures in the top-level cascade row) is that fix's work.
- **0417 (fixed 0.401.0)** — the pre-dispatch unsupported-api gate is the
  deterministic zero-spend `transport` arm a live witness can use.
- **0437 (fixed)** — the `#systemNoteChannel` routing both binder emitters
  share with the producer methods; the surface call rides beside it.

## Closure record — reviewed working-tree fix, unreleased

The observations and source locations above are preserved historical evidence,
including their explicit JSON/stdout, session-persistence and fallback-stderr
corrections. This section records the actual resulting fix, not a release.

### Cause and actual fix

`theta-composition-producer.ts:313–322` returns normally on an unbound binder
result, before the theta body or producer Err/panic framing. Both binder note
owners already received `ProductionProducerInput.printModeFailureSurface` but
never called it. The group-A emitter also returned early on ticket-less delivery
and completed stamp-failure fallback. Thus the existing producer-only mirror
could not see these pre-body endings.

- `src/extension/binder-run.ts:802–814`: BNDR-9 renders once, sends its unchanged
  group-B diagnostic note, then calls `mirrorLine(content)` and `markFailed()`.
- `src/extension/binder-run.ts:830–861`: normal stamped-event delivery,
  ticket-less degrade and completed non-stale stamp fallback converge on the
  same mirror/mark pair. An undefined event after fallback prevents a second
  original-note send, not the process surface. Non-stale send fallback also
  completes before the pair. No unconditional `finally` was introduced;
  recognized stale-runtime invalidation still unwinds before surface calls.
- `src/extension/production-producer-deps.ts:414–431`: comment-only update names
  both binder owners. No interface or wiring change was necessary.
- The existing adapter at `src/extension/production-composition.ts:1102–1124`
  remains unchanged: print/json AND inactive subagent-root regime, rendered
  content plus one newline, assign-only exit 1, retaining a numeric exit code
  greater than 1. TUI/RPC and child-root composition remain inert.

All seven endings now qualify, including noninteractive `needs_info`,
`ambiguous` and cancellation. Successful binding, bypasses, success echoes and
SLSH-1 informational overflow do not qualify. The exact rendered/sanitized/capped
note is mirrored; the full structured cause and group-A/group-B partition are
unchanged. No body execution, retry, persistence or child-envelope policy changes.

### Contract decisions and specification

This intentionally extends the former written binder exclusion; it is not
presented as an implementation-only correction to that old contract. The run's
controller-recorded human decision `397535af` authorized the two new tests and
all-seven-ending expectations. Separate delegated decision `625886c9` authorized
exactly five normative replacements in three files. They are applied at:

- [Slash invocation — Print-mode failure surface](../spec_topics/slash-invocation.md#slsh-3-print-mode-failure-surface),
  `:41`: enumeration, normal/ticket-less/fallback coverage, no duplicate send,
  inert success/informational paths and stale-unwind qualification.
- `docs/spec_topics/pi-integration-contract/runtime-event-channel.md:14`:
  synchronized process-boundary summary; payload families remain distinct.
- `docs/reference/discovery-cli.md:252–280`: synchronized CLI reference.

The existing binder non-execution/templates contract remains at
`docs/spec_topics/binder/determinism-cancellation-failure.md:20–26,44–58`.
Independent review reconstructed the current three docs from the five exact
approved substitutions byte-for-byte. No additional normative scope was used.
Consumers that previously accepted exit 0 for an unrun noninteractive binder
invocation now receive exit 1 and the rendered stderr line; default-print SDK
embeddings observe the same existing gate.

### Preserved red and verified green

Run directory **R** (absolute):

`/home/thomasa/Projects/pi-theta/.pi/tmp/fix-bug-0494-b1a46249-1a08-4d4c-b8da-05902b3acf8a`

All commands below ran from `/home/thomasa/Projects/pi-theta`; log names are
relative to R. Original captures and `witnesses.json` remain unchanged.

| Exact command | Pre-fix exit / log | Post-fix exit / log |
|---|---|---|
| `npx vitest run tests/b0494-binder-print-mode-failure-surface.test.ts` | 1 — `diagnose-attempt-1-composition-red.log`: 21 missing-surface failures, 36 controls pass | 0 — `implement-attempt-2-composition-green.log`, controller `green-1-0.json`: all 57 pass |
| `npx vitest run tests/b0494-binder-print-mode-failure-surface.test.ts -t 'B0494 UNIT'` | 1 — `diagnose-attempt-1-unit-red.log`: six missing mirror/mark failures, seven controls pass | 0 — `implement-attempt-2-unit-green.log`, `green-1-2.json`: all 13 selected units pass |
| `npx vitest run --config config/vitest/vitest.live.config.ts tests/live/acceptance/b0494live-binder-print-mode-failure-surface.test.ts` | 1 — `reproduce-attempt-2-live-candidate.log`, `diagnose-attempt-1-live-red.log`: genuine JSON/text exit 0, missing own stderr line, healthy control passes | 0 — `implement-attempt-2-live-green.log`, `green-1-1.json`, `gate-1-initial-2.json`: both cases pass |

Pinned red mismatches include `B0494 print needs_info: binder failure must set
exit 1: expected undefined to be 1`, `B0494 json: binder refusal must exit 1:
expected +0 to be 1`, and `B0494 UNIT stamp-failure: missing mirror and markFailed:
expected [] to deeply equal`. They occur after exact cause/note/non-execution
premises pass. Draft import/render-literal errors are preserved separately and
are not bug witnesses. The unit `-t` command deselects 44 composition cases;
the unfiltered command executes all 57, with no source skip or weakened oracle.

The real-host stimulus is a production unsupported-api pre-dispatch transport
refusal, not a provider/authentication failure. A test-owned catalog only makes
the model resolvable. Complete JSONL establishes the exact event, absent assistant
body and absence of `theta_result` anywhere before process assertions. Post-fix
JSON and text both exit exactly 1 and emit this own stderr line once, followed
by one newline:

```text
theta /refused: argument binder unavailable (google-generative-ai: no measured forced-tool-choice mapping for this prov…
```

Text stdout remains empty; JSON stdout correctly includes custom-note events.
The healthy OpenAI bypass completes a real assistant turn (`stopReason: stop`)
computing 777, exits 0 and has empty stderr. This is execution evidence, not
`prompt()` resolution. The composition matrix covers all seven endings,
body non-execution, successful binding/bypasses, TUI/RPC, active child-regime
gating, never-lower exit handling, and delivery-before-mirror/mark. Units retain
the real runner/event guard/note fallback and force the bounded delivery arms.

### Gates, related controls and independent review

| Exact command | Exit | Captured evidence under R |
|---|---:|---|
| `npm run typecheck` | 0 | `implement-attempt-2-typecheck.log`, controller `gate-1-initial-0.json` |
| `npm run lint` | 0 | `implement-attempt-2-lint.log` |
| `npm test` | 0 | `implement-attempt-2-default-suite.log`, controller `gate-1-initial-1.json`: 759 files / 12,983 tests, including committed-fixture parsing and provider-free real-child spawn |
| `npx vitest run tests/print-mode-failure-surface.test.ts tests/b0417-responses-binder-toolchoice-gate.test.ts tests/b0397-binder-failure-note-runtime-event.test.ts tests/b0437-producer-note-raw-send-fallback.test.ts tests/b0398-custom-type-unsafe-note-details-diagnostics.test.ts tests/binder-call-cancellation.test.ts tests/system-note-channel.test.ts` | 0 | `implement-attempt-2-related-controls.log`: 65 controls |
| `npx vitest run --config config/vitest/vitest.live.config.ts tests/live/acceptance/b0493live-refused-subagent-callee-print-parent.test.ts tests/live/b0417live-responses-binder-toolchoice-live-cell.test.ts` | 0 | `implement-attempt-2-related-live.log`: all three cases, including actual non-bypass binding/body execution |
| `B0494_OPERATOR_CLI=/home/thomasa/.pi/agent/install/releases/1.4.0/node_modules/@earendil-works/pi-coding-agent/dist/cli.js npx vitest run --config "$R/implement-attempt-2-operator-host.config.ts" tests/live/acceptance/b0494live-binder-print-mode-failure-surface.test.ts tests/live/acceptance/b0493live-refused-subagent-callee-print-parent.test.ts` | 0 | `implement-attempt-2-operator-live.log`: four unchanged acceptance cases on actual operator 1.4.0 |

Pinned-host captures use repo host 1.3.0. The supplemental run-local selector
changes only the acceptance harness's exact CLI initializer in memory, with
version/realpath and original/transformed hash receipts; tracked harness and
assertion bytes are unchanged. Independent review repeated both hosts.

- `evidence-review-result.json`: `ok: true`, CLEAN evidence review, including
  the migration correction below; its then-future operator-host requirement is
  discharged by implementation and the later fix review.
- `reviews.md`: **CLEAN for fix focus**, no actionable in-scope must-fix finding.
  Fresh `audit-fix-offline.log` passes 122 tests; `audit-fix-pinned-live.log`
  passes five cases; `audit-fix-operator-live.log` passes four cases, each with
  `AUDIT_EXIT=0`. The latter two establish both hosts and genuine healthy turns.
- `implement-attempt-2-integrity.log`: exit 0, approved doc reconstruction,
  frozen tests/witnesses/red signatures, exact source/fixture diffs and actual
  operator CLI selection verified. This close stage does not claim to be the
  later controller final review or to have rerun these tests.

### Separately authorized related-test migration

An earlier required 0417 live control stopped at registration because
`unity-responses/gpt-4.1` was unavailable (`implement-attempt-1-related-live.log`,
exit 1). That is preserved prerequisite evidence, **not** a 0494 or 0417 causal
bug red. Initial blocked decisions did not waive it. Later exact delegated
migration decision `a01e644b`, reaffirmed by `8da101f8` and `0267a3f8`, authorized
only `tests/live/b0417live-responses-binder-toolchoice-live-cell.test.ts`'s
`openai/gpt-6-luna` model replacement and three associated comment lines.
Assertions, messages, controls, ordering and helpers remain unchanged.

`R/fixture-migration-gpt6-luna/` preserves original source/hash and exact diff.
Its `counterfactual-owner-repair/spelling-red.log` records the unchanged targeted
command exiting 1 at the whole-object attribution guard (expected `type:
function`, received `type: tool`); `mutation.diff` changes only the Responses
spelling row. `restoration.json` records byte-exact restoration, followed by
`restored-green.log` (same targeted command, exit 0) and `related-live-green.log`
(complete related command above, exit 0). This is a token-free spelling negative
control followed by genuine live execution, not a new HTTP-negative capture.
No permanent forced-tool-choice source change remains. Fresh independent
reviews accepted these artifacts. Current Unity-route compatibility is not proved
or claimed equivalent; original historical 0417 Reach 1/2 evidence is preserved
in its report.

### Scope, residuals and shipment boundary

Resulting fix files are the two production files, three approved spec/reference
files, two new 0494 test files and one exactly authorized 0417 fixture listed
above. CLOSE changes only this report and `docs/bugs/README.md`, plus run-local
closure documentation. No release/version/dependency or controller-file edits.

No new residual production bug was established. Existing separate bugs 0495
(H9a area-(f) fixture ENOENT), 0497 (shared auth-store race) and 0498
(cancellation-subscription documentation) remain open and are not fixed or
waived here. The full broad live suite was not run or claimed. Relevant planned
live gates passed; no current unrelated failure was waived.

Live 0494 coverage is deterministic transport only; all-seven semantics are
production-composition coverage, not seven natural live model outcomes. The new
cancellation matrix is pre-call; active child-regime gating is not a new child
lifetime proof. Forced fallback stimuli, every in-flight/stale schedule, session
persistence, and Unity-route equivalence are not newly established. These are
coverage limits, not newly proven defects.

Detailed stage commands, logs, preservation checks and uncertainties are in
`R/close.md` and the earlier immutable reports/history. No staging, commit,
push, tag or publication occurred in CLOSE. No resolving SHA is invented, and
**no new package release is published**. This fix is not attributed to the
existing package version; a future authorized shipment commit supplies its SHA.
