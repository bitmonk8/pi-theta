# Bug 0494 — the bug-0493 print-mode failure surface misses every binder short-circuit ending: a `pi -p` parent whose invocation dies in the argument binder (needs_info, ambiguous, malformed, ajv_args, transport, cancelled, BNDR-9) still exits 0 with empty stdout and empty stderr

- **Status:** open
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
