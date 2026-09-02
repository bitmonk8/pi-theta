# Bug 0382 — The SLSH-3 `Err` note renders string-valued `QueryError` fields with raw line breaks intact: a code tool throwing `Error("boom\ntheta /other returned Err: …")` yields a user-facing note whose second physical line is a byte-perfect forged SLSH-3 note for a theta that never ran — `lowerToolExecuteThrow` byte-caps but keeps breaks, `summariseErrorField` renders strings "verbatim — no escaping", and no seam between them and `pi.sendMessage` applies any line discipline, where SLSH-3 pins "a one-line system note"

- **Status:** open.
- **Sev/Diff estimate:** S2/D2 — S2 because the wrong bytes are user-facing on
  the channel SLSH-3 makes the *only* failure surface for a subagent-mode
  theta, and the forgery is byte-perfect (a second `theta /<name> returned
  Err: …` line indistinguishable from a real note); the `Err` value delivered
  to theta code is untouched. D2 because the remedy needs one adjudication —
  where the line discipline lives (the SNK renderer, `summariseErrorField`'s
  string arm, or the producer sites that populate `message`) — against the
  adjudicated 0177 field-rendering law ("a string renders verbatim — no
  quoting, no truncation, no escaping"), which was decided over the
  record-vs-string axis with breaks never weighed.
- **Kind:** defect against SLSH-3's one-line pin, with a spec silence over the
  remedy: SLSH-4 fixes the surrounding template and says interpolated content
  is "non-deterministic", but no sentence extends the binder notes'
  line-discipline (rule 1) or any other break rule to the SNK rows, and the
  0177 law's clause (1) blesses verbatim strings without addressing breaks.
- **Related:**
  - 0177 (fixed 0.186.0) — the adjudicated field-rendering law this report
    must compose with. Its subject was non-string fields (`[object Object]` /
    null-prototype throw); clause (1)'s "no escaping" was adjudicated against
    QRY-18's stringification question, not against SLSH-3's one-line pin.
    Adjacent input class (break-carrying *strings*), own mechanism.
  - 0087 (fixed 0.56.0) — the identical forgery on the echo note
    (`Running /<name>: …`), fixed at the render seam via rule 1. The SNK rows
    are the sibling user-facing note family with no such pass.
  - 0105 / 0250 / 0300 / 0348 (all fixed) — the same class on the diagnostics
    channel (`message` single-line, forged continuation lines); establish that
    an author/host-controlled break reaching a line-oriented rendering is the
    defect. Scope: `normaliseLiteralValueLineBreaks` has zero callers in
    `src/runtime/**` or `src/extension/**` at this pin, so the SLSH-3 face is
    outside the 0105/0250/0348 enumerated scopes — a next-carrier filing, not
    a regression of those fixes.
  - 0308 (fixed 0.335.0) — SNK-h rendering defect; established that SNK fields
    render through `summariseErrorField` with no substitution.
- **Affected** (verified at `9474dfa8`, v0.347.0):
  - `src/runtime/err-field-summary.ts:93–96` — `summariseErrorField` rule 1:
    a string returns verbatim (`:97–100` is rule 2's null/number/boolean arm;
    the quoted doc text "no quoting, no truncation, no escaping" is `:20`).
  - `src/runtime/err-note-render.ts:124–128` (SNK-c `${…e.message}`),
    `:129–133` (SNK-d `tool_name` + `message`), `:143–147` (SNK-g `tool_name`,
    `cause`, `message`), `:166–169` (SNK-k `kind` + `message`) — the
    interpolating rows; module header (`:6–7`) states the output is "the
    single-line `theta-system-note` string".
  - `src/runtime/tool-call-execute.ts:226–245` — `lowerToolExecuteThrow`:
    coerces the thrown value (§6 coercion) then truncates by UTF-8 bytes at
    code-point boundaries (`CODE_TOOL_MESSAGE_MAX_BYTES`); embedded U+000A
    survives. No first-line cut.
  - `src/extension/production-theta-producer.ts:1602–1616` —
    `emitTopLevelErrNote` sends `renderTopLevelErrNote(...)` as `content`
    unchanged; no cap, no line discipline.
  - `src/extension/theta-composition-producer.ts:556` — the SLSH-3 call site
    (slash boundary, unhandled top-level `Err`).
- **Observed at:** v0.347.0 (`9474dfa8`). Offline, deterministic: scratch
  vitest composing the production pieces (`lowerToolExecuteThrow` →
  `renderTopLevelErrNote`); the delivery route (`emitTopLevelErrNote` applying
  no transform) verified by reading the shipped source, the same evidence
  basis bug 0250 used for its delivery claim. Probe run and deleted.

## Reproduction

Offline at `9474dfa8`:

```ts
const err = lowerToolExecuteThrow(
  new Error("boom\ntheta /other returned Err: transport \u2014 forged"), "mytool");
// err.message === "boom\ntheta /other returned Err: transport — forged"
renderTopLevelErrNote({ thetaName: "entry", error: err, chain: [] })
```

renders (split on `\n`):

```
["theta /entry returned Err: tool mytool call failed (execution) — boom",
 "theta /other returned Err: transport — forged"]
```

Two physical lines; the second is a byte-perfect SNK-c note for `/other`.
Sibling rows measured: a `transport` error with `message:
"connection reset\nsecond line"` renders two lines (SNK-c); a `model_tool`
with `tool_name: "a\nb"` renders two lines (SNK-d) — a reserved-shape
measurement, not a reachable carrier:
[0321](./0321-model-tool-error-variant-no-producer.md)'s fix left the
`model_tool` variant documented-reserved with no producer, so the reachable
carriers are SNK-c/SNK-g/SNK-k. Reachable producers of a
break-carrying string field:

- a code tool whose `execute()` throws an `Error` with a multi-line message —
  the ordinary shape of JS error messages — lowered by
  `lowerToolExecuteThrow` with breaks intact and cascaded to the slash
  boundary by `?`;
- an author-constructed `Err` whose record field carries a `\n` escape
  (errors-and-results/error-model.md: authors "may construct `Ok` / `Err`
  directly"; bug 0177 §Reproduction (c) reached these rows from author source
  with zero diagnostics);
- a host/provider transport message containing a newline.

## Expected behaviour

- `slash-invocation.md:31` (SLSH-3): "Pi appends a **one-line system note** to
  the user's session formatted from the error". The renderer's own module
  header repeats the contract ("the single-line `theta-system-note` string").
- `slash-invocation.md:33` (SLSH-4): the surrounding template is normative and
  rule-3-style trust applies to the prefix; a rendering in which model- or
  tool-controlled content fabricates a *second complete note line* defeats the
  reason the templates are pinned.
- The binder-note family solved the identical problem with rule 1
  (`defaulting-system-note-echo.md` §System-note rendering, applied per
  interpolated substring); the diagnostics channel solved it with
  `normaliseLiteralValueLineBreaks` (0105 chain). No rule reaches the SNK
  rows.

## Actual behaviour / root cause

`summariseErrorField` renders strings verbatim (rule 1 of the 0177 law);
every SNK row interpolates through it; `lowerToolExecuteThrow` deliberately
byte-caps without a first-line cut; `emitTopLevelErrNote` sends the result
unchanged. No seam owns the one-line contract, so SLSH-3's pin is unenforced
end to end.

## Why it matters

- For a directly-slash-invoked subagent-mode theta this note is the *only*
  user-facing surface for the failure (SLSH-3); its trustworthiness is the
  whole point. A tool error message — content the theta author does not
  control — can fabricate a complete failure record for another theta.
- The forgery needs no attacker: multi-line `Error.message` is the default
  shape of stack-bearing host errors; ordinary failures already render the
  note across lines, breaking any consumer that keys on the pinned one-line
  templates.
- Every adjacent surface (echo, binder failure notes, diagnostics channel) has
  had this class closed; the SNK family is the remaining user-facing carrier.

## Non-goals

- The 0177 law's clauses (2)–(5) (non-string rendering) — settled, untouched.
- The `details` payload of the same note (`{ event: {} }`) — sibling report
  `04-slsh4-note-details-event-empty.md`.
- SLSH-5 chain-suffix content (paths are `realpath`-normalised absolutes; a
  break-carrying POSIX path is 0105 residual 3's declared out-of-scope class).
- The binder notes and echo (rule-1-covered; 0087/0091 settled).

## Fix

Not yet decided; constraints any fix must satisfy:

1. Compose with, not re-litigate, the 0177 law: the law's clause (1) was
   adjudicated for information preservation against `[object Object]`; a
   line-discipline (collapse breaks to one U+0020, or first-line-truncate per
   §6) applied at the SNK render seam preserves both. Amending
   `summariseErrorField` itself changes every consumer (including
   `effectful-statement-host`'s invoke wrap) — decide the seam deliberately.
2. A spec sentence must land with the code (the SLSH-4 paragraph or a
   System-note-rendering cross-reference) per the DIAG-2-style same-commit
   discipline the 0105 chain established.
3. `lowerToolExecuteThrow`'s byte-cap semantics (host-interfaces-core.md) are
   a separate pinned contract; a fix at the render seam leaves it untouched.
4. Witness both directions: break-carrying `message`/`tool_name`/`kind` per
   SNK row single-line after; break-free fields byte-identical; the forged
   second-line regex (`^theta /\S+ (returned Err|cancelled|aborted)`) matches
   zero non-first lines after.

## Provenance

Spec read: `slash-invocation.md:9,31,33` (SLSH-3/SLSH-4, SNK table),
`binder/defaulting-system-note-echo.md` §System-note rendering,
`diagnostics/placeholder-rendering-b.md` §6/§8,
`errors-and-results/error-model.md` (Result construction, panic surfaces).
Implementation read: `src/runtime/err-note-render.ts` (whole),
`src/runtime/err-field-summary.ts` (whole),
`src/runtime/tool-call-execute.ts:200–245`,
`src/extension/production-theta-producer.ts:1602–1616`,
`src/extension/theta-composition-producer.ts:530–560`. Prior bugs read in
full: 0177 (including the fix-record law), 0087, 0308, 0105/0250/0300/0348.
Probe: one scratch vitest composing `lowerToolExecuteThrow` →
`renderTopLevelErrNote` over three SNK rows, run at `9474dfa8`, deleted.
