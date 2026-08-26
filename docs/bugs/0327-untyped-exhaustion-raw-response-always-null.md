# Bug 0327 — `ToolLoopExhaustedError.raw_response` is structurally always `null` on the untyped exhaustion path: the loop's exhaustion branch hardcodes `raw_response: null` and the `FreePhaseTurn` `tool_use` arm carries no text slot at all, so the text the model emitted alongside the blocked terminal tool call — present in the transcript / in the parsed provider reply on both drivers — never reaches the field ERR-19 defines as carrying exactly that text

- **Status:** open (candidate; found in bug-hunt at HEAD `ee681f7b`).
- **Sev/Diff estimate:** S3/D2 — S3 because a documented, theta-visible field
  is misdelivered on every untyped exhaustion: `raw_response` binds `null` to
  theta code even when the model provably emitted text alongside the blocked
  terminal tool call and the runtime holds that text (in the user-session
  transcript on the prompt driver; in the parsed `AssistantMessage.content`
  text parts on the off-session driver). The `Err` itself, `rounds`, and
  `last_tool_name` are correct, and no wrong success binds. D2 because the fix
  widens the shared `FreePhaseTurn` `tool_use` arm with a text slot (or a
  terminal-text capture) and threads it through both production drivers plus
  the loop's exhaustion branch; the seam type is shared with the scripted-test
  drivers, so the widening touches the loop, two drivers, and the seam pins.
- **Kind:** implementation defect (query tool loop + both production
  `QueryModelDriver`s). The spec sentence reads as an obligation, not
  latitude: queryerror-variants.md:211 is two-sided — "`ToolLoopExhaustedError`
  carries `raw_response` only when the model emitted text alongside its
  terminating tool-use block; the field is `null` when exhaustion fired on a
  pure tool-use turn." The observed turn was not a pure tool-use turn.

## Symptom

Live (prompt mode, probe harness, claude-sonnet-5): an untyped query under
`tool_loop: { max_rounds: 1 }` against a sequential ≥3-round read chain, with
the query text instructing one sentence of narration ("PLANSTEP …") before
every tool call. The model narrates and reads on round 1 (allowed), narrates
and attempts the round-2 read (blocked by the governor — exhaustion). The
theta matches the query directly (bug 0307 workaround) and encodes the ERR-19
fields through an index-OOB panic key
(`(rounds * 100) + (raw_response == null ? 10 : 20) + (last_tool_name == null ? 1 : 2)`):

```
theta /praw aborted: index out of bounds: 112 not in 0..1
```

112 = `rounds: 1` (100) + `raw_response == null` (10) + `last_tool_name`
non-null (2). The same drive's streamed assistant text, captured by the
harness, shows the narration on BOTH tool-call turns — including the blocked
terminal one:

```
"PLANSTEP Read ch1.txt to find the next file in the chain.PLANSTEP Read
qz-ch2.txt to continue following the chain.I was unable to complete the file
chain because the tool loop was exhausted after reading qz-ch2.txt, so I
don't have the final number needed to compute the answer. …"
```

The second `PLANSTEP` sentence is text emitted alongside the blocked `read`
call (the terminal tool-use turn ERR-19's `last_tool_name` names — the note
channel separately reports `last tool: read` on the unhandled-tail variant of
the same fixture). The provider surfaced that text; the session transcript
holds it; `raw_response` delivered `null`. Observed at HEAD `ee681f7b` live,
probe harness (`tests/live/hardening/probe-harness.ts`), deterministic panic
key, ~14 s.

## Expected

- queryerror-variants.md:151 (ERR-19 field comment): `raw_response: string |
  null — any text the model emitted alongside the final tool call, when
  surfaced by the provider`. The text was surfaced (it is in the transcript
  the driver itself reads for every other purpose).
- queryerror-variants.md:211 (Notes): "`ToolLoopExhaustedError` carries
  `raw_response` only when the model emitted text alongside its terminating
  tool-use block; the field is `null` when exhaustion fired on a pure
  tool-use turn." — a biconditional: `null` is reserved for the pure
  tool-use turn. The observed terminal turn carried text.

Expected field value: the narration text of the blocked terminal turn (probe
encoding 122).

## Actual

`raw_response` is `null` on every untyped exhaustion, unconditionally:

- src/runtime/query-tool-loop.ts:384–389 — `runUntypedQueryLoop`'s
  `max_rounds`-final branch calls `makeToolLoopExhaustedError({ …,
  raw_response: null })`. The literal `null` is the only value this branch can
  produce.
- src/runtime/query-tool-loop.ts:94 — the seam type forces it:
  `FreePhaseTurn`'s `tool_use` arm is `{ kind: "tool_use"; batch:
  ToolCallRequest[] }` with no text member, so no driver can surface the text
  accompanying a tool-use turn even where it holds it.
- Prompt driver: src/extension/production-theta-producer.ts:4541–4546 —
  `#exhaustionTurn()` synthesises the blocked round as a text-less
  `tool_use` batch. The blocked turn's narration (and any post-block
  wrap-up text of the settled native turn) is in the user-session transcript
  the same driver reads via `extractTrailingTurnText`
  (production-theta-producer.ts:4523) on the success path; on the exhausted
  path it is discarded.
- Off-session driver: src/extension/production-theta-producer.ts:5604–5613 —
  `#driveFreePhaseRound` pushes the whole `AssistantMessage` (text parts
  included) into the held conversation, then maps ONLY the `toolCall` parts
  into the returned `tool_use` batch; the accompanying text parts of the
  final free-phase reply are held but never threaded to the exhaustion
  branch.

## Mechanism

One seam-type omission, three sites. The loop's exhaustion branch fires at
the round boundary after the terminal tool-use round was consumed; the only
data it has about that round is the `ToolCallRequest` batch, which carries
tool names and ids only. Both production drivers possess the terminal turn's
assistant text at that moment (transcript read surface on the prompt leg,
parsed reply content on the off-session leg) and structurally cannot hand it
over. The spec's "when surfaced by the provider" latitude therefore never
exercises: the provider surfaces the text on every narrated tool-use turn and
the field is `null` anyway.

## Impact

Authors and triage tooling reading `raw_response` off a
`tool_loop_exhausted` `Err` (the documented use: what the model was saying
when the loop gave up — e.g. the model's own statement of what it still
needed, as in the observed transcript) always get `null` and cannot
distinguish "model was narrating its blocked intent" from "pure tool-use
turn". The field is dead on the untyped path in exactly the cases ERR-19
defines it for. Impact class: live divergence from the documented contract;
wrong (null) field value silently delivered to theta code.

## Reproduction

Live, ~14 s, one drive, deterministic sink: plant the 3-file sequential read
chain (each file names the next), plus

```theta
---
description: praw
mode: prompt
tools: read
tool_loop:
  max_rounds: 1
---
let empty = [0]
let code = match @`Before EVERY tool call, first write one short sentence starting with the word PLANSTEP describing what you will read next. Then read the file ch1.txt. Each file names the next file to read. Read exactly ONE file at a time, following the chain, until a file gives you a final number. Report that number plus 2000. Answer with the number only.` {
  Err(QueryError { kind: "tool_loop_exhausted", rounds, last_tool_name, raw_response }) => ((rounds * 100) + ((raw_response == null) ? 10 : 20)) + ((last_tool_name == null) ? 1 : 2),
  Err(e) => 7,
  Ok(t) => 8
}
empty[code]
```

Drive `/praw`; read the per-drive `theta-system-note` channel and the
captured assistant text. Observed verbatim: note `theta /praw aborted: index
out of bounds: 112 not in 0..1`; assistant text with two `PLANSTEP` sentences
(the second on the blocked round). Spec-conformant behaviour encodes 122.

Live-confirmed: yes (HEAD `ee681f7b`, probe harness, claude-sonnet-5; the
encoding is deterministic given exhaustion, and exhaustion under the chain
fixture is the shipped PL-1 pattern).

## Related

- Bug 0308 — sibling ERR-19 field defect on the same exhaustion path
  (`last_tool_name: null` note fabrication at cap 0); this report is the
  `raw_response` half, distinct mechanism (seam-type omission vs note
  renderer substitution).
- Bug 0307 — the direct-scrutinee match workaround this repro uses (a
  let-bound query `Err` aborts the body).
- ERR-19 (queryerror-variants.md:143–151, :211) — the two spec sentences the
  fix must satisfy (or amend in the same commit if `null`-always is the
  intended untyped-path behaviour, which would make :211's biconditional and
  :151's field comment false as written).
- The preceding discovery-campaign hunt over this surface (unfiled working
  notes) recorded it as "not filed, noted for a future hunter" pending a
  live case where text provably accompanied the blocked round; this report
  supplies that case.
