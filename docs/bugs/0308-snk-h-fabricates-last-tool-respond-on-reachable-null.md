# Bug 0308 — `last_tool_name: null` is reachable (any untyped query under `tool_loop.max_rounds: 0` exhausts before any tool call), and the SNK-h note renderer swaps the null for the literal `respond`: the user-facing note names a tool the untyped query does not have and never called, on the strength of an "unreachable null" assumption ERR-19 states and the cap-0 path defeats

- **Status:** open (candidate; found in bug-hunt at HEAD `bc52da38`, v0.287.0).
- **Sev/Diff estimate:** S3/D1 — S3 because the wrong bytes are user-facing
  (the SLSH-3 note misattributes the exhaustion to a tool named `respond`,
  which for an untyped query does not exist — it is the typed-query respond
  tool's vocabulary) but the theta-side `Err` value itself is correct
  (`last_tool_name: null` binds to theta code). D1 because the fix is one
  rendering arm plus a one-sentence ERR-19 correction; the reachable-null
  witness is deterministic and token-free.
- **Kind:** implementation defect (note renderer) + spec defect (ERR-19's
  reachability claim), one mechanism.

## Symptom

Live (prompt mode, probe harness, claude-sonnet-5): a `mode: prompt` theta
with `tool_loop: { max_rounds: 0 }` whose body ends in an unhandled untyped
query settles with

```
theta /tzero returned Err: tool-call loop exhausted after 0 rounds (last tool: respond)
```

No tool named `respond` exists for the theta (untyped queries register no
respond tool), no tool of any name was called (zero provider turns were
issued — the loop exhausts at initialisation, `0 == 0`), yet the note reports
`last tool: respond`. Observed at HEAD `bc52da38` live, probe harness, three
independent fixtures.

The theta-side field is correct: matching the same `Err` directly
(`match @`…`` { Err(QueryError { kind: "tool_loop_exhausted", rounds,
last_tool_name, raw_response }) => … }`) and encoding the fields through an
index-OOB panic key yields `rounds=0`, `last_tool_name == null`,
`raw_response == null` (live-observed as `index out of bounds: 11 not in
0..0` under the encoding `rounds*100 + (t==null?10:20) + (w==null?1:2)`).

## Expected

- slash-invocation.md:46 (SNK-h) pins the template "theta `/<name>` returned
  `Err`: tool-call loop exhausted after `<rounds>` rounds (last tool:
  `<last_tool_name>`)" — the placeholder is the FIELD, and the field is
  `null`. Rendering rules for a null field value are the summariser's
  (`summariseErrorField`), not a substituted tool name.
- queryerror-variants.md:149 documents `last_tool_name: string | null` as
  "most recent tool the model called on the loop's terminal free-phase round".
  At `max_rounds: 0` there is no terminal free-phase round and no call — the
  faithful rendering carries no tool name.

## Actual

`renderTopLevelErrNote`'s SNK-h arm (`src/runtime/err-note-render.ts`): the
arm's comment says "`last_tool_name` renders as
the literal `respond` when null (defensive forward-compat rendering; no theta
1.0-reachable null case)" and implements `const lastTool = e.last_tool_name
?? "respond"`. The "no reachable null case" premise is false:

- src/runtime/query-tool-loop.ts:373–381 (`runUntypedQueryLoop`'s
  `max_rounds`-final branch): `lastToolName` initialises `null` and the
  branch fires BEFORE the first `nextFreePhaseTurn` whenever
  `slotCount === config.maxRounds` holds at entry — i.e. for every untyped
  query under `max_rounds: 0`, a frontmatter value FRNT-1 admits
  (src/parser/frontmatter.ts:84–86: "non-negative integer") and
  query-tool-loop.md's own `max_rounds: 0` boundary discussion embraces.
- The spec side repeats the same false premise: queryerror-variants.md:149
  and :213 justify the `| null` branch as having "no theta 1.0-reachable
  case" by the typed-query exemption alone, overlooking the cap-0 untyped
  exhaustion its own QRY-16/CIO-4 semantics produce (`slot_count ==
  max_rounds` at initialisation).

A second `?? "respond"` of the same family sits at
src/extension/production-theta-producer.ts:4542 (`#exhaustionTurn`):
unreachable today (`exhausted === true` implies a blocked call recorded a
name) but the same fabricated-name pattern; a fix should sweep both.

## Impact

An operator reading the note is told the model was looping on a tool named
`respond` — the typed-query respond tool's reserved name — when the real
condition is "the query was configured to allow zero tool rounds and the
model was never consulted". Misleads triage toward the typed-query wire for a
purely-untyped configuration error.

## Reproduction

Zero-token deterministic live repro: plant

```theta
---
description: tzero0
mode: prompt
tool_loop:
  max_rounds: 0
---
@`anything`
```

drive `/tzero0`, read the per-drive `theta-system-note` channel: the note
above appears verbatim with `(last tool: respond)`. (Any unhandled untyped
query works; the tail-position query is the QRY-19 void-tail discard shape at
top level, surfacing the Err through SLSH-3.)

Live-confirmed: yes (three fixtures at HEAD, ~300 ms each, zero provider
turns for the failing query).

## Related

- Bug 0036 — the `<key>` rendering defect in the same renderer family.
- ERR-19 (queryerror-variants.md:143–149, :211–213) — the spec sentences to
  correct in the same commit.
- PL-1 (tests/live/hardening/session-promptloop.test.ts) — pins the cap ≥ 1
  note prefix through "after 1 rounds" and deliberately leaves the last-tool
  suffix unasserted; a fix can extend it.
