# Bug 0400 — SNK-h interpolates `last_tool_name` without the SLSH-4 line-break collapse: a model-supplied tool name carrying U+000A renders the top-level `Err` note across two physical lines, and a crafted name forges a byte-perfect second `theta /<name> returned Err:` line — the 0382 discipline's conceded field, fed by an unsanitised model-controlled channel

- **Status:** fixed (0.389.0).
- **Kind:** defect — implementation diverges from the SLSH-4 sentence 0382's
  fix added ("any line break in an interpolated placeholder's content … is
  collapsed to a single space before insertion … so interpolated content
  cannot fabricate a second physical line"), which is stated over EVERY
  interpolated placeholder; the SNK-h renderer wires the collapse for none of
  its fields.
- **Related:**
  - 0382 (fixed 0.354.0) — the same defect class on SNK-c/d/g/k
    `message`/`tool_name`/`cause`/`kind`. Its §Pinned dispositions state
    "SNK-h `last_tool_name` and the numeric `attempts`/`rounds` fields are
    outside the adjudicated witness set" — outside the witness set, not
    declared unreachable or out of scope (contrast its SNK-i `callee_path`
    disposition, which cites the 0105 residual-3 out-of-scope class). This
    report measures that conceded field and proves the break reachable.
  - 0308 (fixed 0.335.0) — SNK-h's `last_tool_name` null arm; same row,
    different mechanism (fabrication vs forgery).
  - 0384 §Residuals 1 precedent — a same-class carrier outside a fix's seven
    sites is a new-filing candidate, not a defect of the fix.
- **Affected** (verified at `d63c5148`, v0.382.0):
  - `src/runtime/err-note-render.ts:164–172` — the SNK-h arm:
    `summariseErrorField(e.last_tool_name)` (and `e.rounds`) interpolated
    WITHOUT `renderNoteField` (`:66–68`), the 0382 collapse wrapper the four
    fixed rows use.
  - `src/runtime/query-tool-loop.ts:459` — `lastToolName =
    turn.batch[turn.batch.length - 1]!.toolName`: recorded verbatim from the
    model's `tool_use` batch; `:404–410` — threaded into
    `makeToolLoopExhaustedError`.
  - `src/extension/production-theta-producer.ts:6175` — the off-session
    (subagent-mode) driver builds that batch as `calls.map((call) => ({
    toolName: call.name, … }))` — `call.name` is the provider reply's raw
    `ToolCall.name`, unfiltered (a name outside the callable set is serviced
    as an unavailable-tool `isError` result, `:6191–6199`, but its NAME is
    recorded first).
  - `src/extension/prompt-tool-loop-governor.ts:191` — the prompt-mode
    carrier: `active.lastToolName = event.toolName` from Pi's tool-call event;
    surfaced through `#exhaustionTurn`
    (`production-theta-producer.ts:4968–5008`).
  - `docs/spec_topics/slash-invocation.md:33` — the SLSH-4 collapse sentence
    (quoted above), placeholder-general; `:46` — the SNK-h row; `:50` — its
    "standard field-summarisation rule" clause; `:31` (SLSH-3) — one-line pin.
- **Observed at:** v0.382.0 (`d63c5148`). Offline, deterministic: scratch
  probes P6a/P6b/P6c (deleted) over the exported `renderTopLevelErrNote` and
  the production `emitTopLevelErrNote` delivery (capturing `pi.sendMessage`).

## Summary

0382 closed the SLSH-3 forged-second-note class by wiring
`normaliseLiteralValueLineBreaks` around the interpolated fields of
SNK-c/SNK-d/SNK-g/SNK-k, and landed the spec sentence making the collapse a
property of every interpolated placeholder. SNK-h — the `tool_loop_exhausted`
row — interpolates `last_tool_name` through bare `summariseErrorField`,
outside the discipline.

`last_tool_name` is model-controlled: both production drivers record it from
the raw tool-call name the model emitted (the off-session driver from the
provider reply's `ToolCall.name`, the prompt-mode governor from Pi's tool-call
event), before any callable-set membership check disposes of the call itself.
A model that names a nonexistent tool `x\ntheta /victim returned Err:
transport — forged` in the final permitted round has that string recorded,
carried onto `ToolLoopExhaustedError`, and — when the exhaustion cascades to
the slash boundary — rendered raw into the one-line user-facing note:

```
theta /entry returned Err: tool-call loop exhausted after 2 rounds (last tool: x
theta /victim returned Err: transport — forged)
```

The second physical line matches the forged-note signature
`^theta /\S+ (returned Err|cancelled|aborted)` byte-for-byte up to the
attacker-chosen tail — the exact forgery 0382's fix proved and closed for the
QueryError string fields, reopened through the tool-NAME channel.

## Reproduction

At `d63c5148`, offline (scratch probes, deleted):

1. Render seam:
   `renderTopLevelErrNote({ thetaName: "entry", error: { kind:
   "tool_loop_exhausted", message: "…", rounds: 2, last_tool_name:
   "x\ntheta /victim returned Err: transport \u2014 forged", raw_response:
   null }, chain: [] })` → splits into 2 physical lines; line 2 =
   `theta /victim returned Err: transport — forged)` — matches
   `/^theta \/\S+ (returned Err|cancelled|aborted)/`.
2. Delivery seam: `deps.emitTopLevelErrNote("entry", <same leaf with
   last_tool_name: "a\nb">)` → captured `content` =
   `"theta /entry returned Err: tool-call loop exhausted after 1 rounds (last
   tool: a\nb)"` — raw U+000A on the wire.
3. Control (both directions): the same `a\nb` as SNK-d `tool_name` renders
   `tool a b failed` — single line (0382's fix holds on its adjudicated set),
   isolating the divergence to the SNK-h seam.

Reachability of the break-carrying name: `query-tool-loop.ts:459` records the
batch's last `toolName` verbatim; the off-session batch is
`calls.map(call => ({ toolName: call.name, … }))`
(`production-theta-producer.ts:6175`) over the raw provider reply — tool
names are model output, the same trust class as the `message` fields 0382
sanitised (and BNDR-9 already treats a `customType`'s U+000A as reachable
hostile input on an adjacent model-adjacent channel).

## Expected behaviour

- `slash-invocation.md:33` (SLSH-4, last sentence — landed with 0382): "any
  line break in an interpolated placeholder's content — together with any
  spaces adjoining it — is collapsed to a single space before insertion and
  the rendered field is then trimmed …, so interpolated content cannot
  fabricate a second physical line." Stated over interpolated placeholders
  generally; `<last_tool_name>` is one.
- `slash-invocation.md:31` (SLSH-3) — the note is one line.
- `:50` — SNK-h's "standard field-summarisation rule" governs the null
  rendering (0177/0308 law) and does not exempt the row from the SLSH-4
  collapse; the two compose, exactly as they do on SNK-c/d/g/k
  (`renderNoteField` = collapse ∘ summarise).

## Actual behaviour / root cause

`err-note-render.ts:171` interpolates `summariseErrorField(e.last_tool_name)`
directly; 0382's `renderNoteField` wrapper was applied only to the four rows
in its adjudicated witness set. The producer chain never sanitises tool names
(they are ordinarily registered identifiers, but the recorded value is the
model's, not the registry's).

## Non-goals

- SNK-i `callee_path` / the SLSH-5 chain paths — 0382/0105 residual-3
  out-of-scope class (adjudicated; a path with a break is the filesystem's
  exotic case, not a model channel).
- The numeric `rounds`/`attempts` interpolations (no break carrier).
- `summariseErrorField` itself (the 0177 law; composition at the render seam
  is the settled fix shape).
- Whether `last_tool_name` should record only registry-validated names — a
  wider design question; the render-seam collapse closes the note regardless.

## Fix

Wire the SNK-h string field through the existing `renderNoteField`
(`err-note-render.ts:66`) exactly as SNK-c/d/g/k:
`(last tool: ${renderNoteField(e.last_tool_name)})`. `null` still renders
`null` (`renderNoteField(null)` → `normaliseLiteralValueLineBreaks("null")` is
byte-identical, preserving 0308's pin). No spec edit needed — the SLSH-4
sentence already covers the field; no registry Message moves (DIAG-4).
Witness per 0382's pattern: physical-line count, the forged-second-line regex
over non-first lines, break-free and null controls byte-identical; red
direction is today's two-line output.

## Provenance

Spec read: `slash-invocation.md:31–50` (SLSH-3/SLSH-4 incl. the 0382
sentence, SNK-h row). Implementation read:
`src/runtime/err-note-render.ts:55–180`,
`src/runtime/query-tool-loop.ts:370–470`,
`src/extension/production-theta-producer.ts:4891–5008, 6119–6199`,
`src/extension/prompt-tool-loop-governor.ts:55–195`,
`src/runtime/query-error.ts:96–110, 300–330`. Prior bugs read in full: 0382
(§Fix, §Pinned dispositions), 0308, 0105 (residual-3 class), 0177, 0243.
Probes P6a/P6b/P6c run at `d63c5148` (scratch file deleted).

## Fix (0.389.0)

- What shipped: `src/runtime/err-note-render.ts` — the SNK-h (`tool_loop_exhausted`) arm of `renderLeafKindNote` now wires `last_tool_name` through the existing `renderNoteField` (= `normaliseLiteralValueLineBreaks` ∘ `summariseErrorField`) exactly as SNK-c/d/g/k, per §Fix. `rounds` stays on bare `summariseErrorField` (numeric, no break carrier); `renderNoteField(null)` is byte-identical to `summariseErrorField(null)`, so bug 0308's null pin holds. No spec edit, no registry Message moves.
- Gates: witness `tests/b0400-snk-h-last-tool-name-line-discipline.test.ts` 10/10 green (red at fork: 8 failed on the two-physical-line / forged-second-line output; break-free and null controls green both directions); full default suite 557 files / 10317 tests green; `npm run typecheck` clean; `npm run lint` clean.
- Review: 1 round — `bug-fix-reviewer` CLEAN (no correctness/fidelity/spec findings; sole residual is a pre-existing untracked `.npm-ci.log`, outside the diff).
- Verification: VERIFIED — the witness reds without the fix on the two-line / forged-second-line assertions and greens restored byte-exact; full suite green (5 transient parallel-load timeouts, all green isolated); typecheck + lint clean; adjacent SNK-h live cell `tests/live/hardening/b0308-cap0-exhaustion-note.test.ts` green under the shared live lock (run by the orchestrator — the fix is a render-seam string collapse with no registration/drive-outcome change for any input class, so one adjacent live cell witnesses the SNK-h note path).
- Residuals: none.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: SNK-i `callee_path` / the SLSH-5 chain paths (0105 residual-3 out-of-scope class); the numeric `rounds`/`attempts` interpolations (no break carrier); `summariseErrorField` itself (the 0177 law) — all unchanged, per §Non-goals.
