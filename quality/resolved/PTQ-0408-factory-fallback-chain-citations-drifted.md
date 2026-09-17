---
id: PTQ-0408
title: factory.ts's two runtime-event-channel.md line citations for the sendMessage fallback chain point at the wrong lines
lens: D2                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/factory.ts:369
  - src/extension/factory.ts:892-897
  - docs/spec_topics/pi-integration-contract/runtime-event-channel.md:132
  - docs/spec_topics/pi-integration-contract/runtime-event-channel.md:140
  - docs/spec_topics/pi-integration-contract/runtime-event-channel.md:145
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917121953
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# factory.ts's two runtime-event-channel.md line citations for the sendMessage fallback chain point at the wrong lines

## Observation
Two comments in `factory.ts` cite `runtime-event-channel.md:132` for "the
channel's best-effort fallback chain". In the current doc, line 132 is inside
an unrelated clause about the `masked` dedup-key rule; the fallback-chain
paragraph the comments describe starts at line 140. One of the two sites also
cites `:137` for "never aborts this slash handler"; that sentence is at line
145 in the current doc, and line 137 itself is blank (inside the same
unrelated `masked` clause's paragraph break).

## Evidence
`src/extension/factory.ts:369` (doc comment on `ThetaExtensionDeps
.systemNoteChannel`):
```ts
   * lifecycle notes (drain-state dispatch-refusal; repeat-`session_start`
   * supersession) ride, so a host `pi.sendMessage` throw on either walks the
   * channel's best-effort fallback chain (runtime-event-channel.md:132) instead
```

`src/extension/factory.ts:892-897`:
```ts
          if (outcome.kind === "note") {
            // Bug 0451: route the drain-state refusal note through the channel's
            // best-effort fallback chain (runtime-event-channel.md:132) — a
            // non-stale host throw walks ctx.ui.notify → delivery-failed
            // diagnostic → terminal line and never aborts this slash handler
            // (:137); only a stale-ctx throw rethrows (bug 0018, mark-dead +
            // quiesce). Informational note: `details` is omitted on the wire.
```

`docs/spec_topics/pi-integration-contract/runtime-event-channel.md:132` — what
the citation currently points at (the `masked` dedup-key clause, unrelated to
the fallback chain):
```
*(g) Dedup-key non-inclusion rule.* The dedup tuple under **Deduplication and lifetime rules** above is `(kind, query_site, message, occurred_at)`; consumers MUST NOT include `masked` in the dedup tuple. Two emissions that differ only in `masked` represent the same origin and a malformed re-emission, not two distinct occurrences.
```

`docs/spec_topics/pi-integration-contract/runtime-event-channel.md:140` — where
the fallback-chain paragraph the comments describe actually starts:
```
The `pi.sendMessage` call for `theta-system-note` is treated as best-effort. `pi.sendMessage` returns `void` (synchronous); the runtime MUST NOT `await` it and MUST NOT attach a `.catch` handler. The best-effort fallback below covers synchronous throws from the always-log emission sequence...
```

`docs/spec_topics/pi-integration-contract/runtime-event-channel.md:145` — where
the "never aborts the slash-command handler" sentence actually lives:
```
...Step 1's `ctx.ui.notify` is unaffected by which step threw: it runs when `display: true` and is skipped when `display: false`, per its rule above. On a live runtime the fallback never aborts the slash-command handler or the spawned subagent session...
```

## Why this is a problem
Both citations are falsifiable location claims and both are false at HEAD.
Line 132 of the doc is a different, unrelated normative clause (the `masked`
dedup-key rule), not the fallback-chain description; a reader following
either `factory.ts` citation to line 132 lands on the wrong paragraph. The
second sub-citation, `:137`, lands on a blank line inside that same unrelated
clause rather than on the "never aborts" sentence, which is at line 145. This
matches the shape already fixed once for `child-tap.ts` under `PTQ-0354`/
`PTQ-0380` (doc growth shifting a numeric line citation out from under the
comment that names it) but recurring here on a different file/target pair
that has not been corrected.

## Suggested direction (non-binding, optional)
None proposed; the fix stage owns whether to correct both line numbers or
drop numeric citations in favour of naming the doc section (as several other
comments in this same file already do, e.g. citing "PIC-67" or "PIC-72"
without a line number).

## False-positive check
- Read `runtime-event-channel.md` lines 120-160 directly and located both the
  actual fallback-chain paragraph (starts line 140) and the actual
  "never aborts the slash-command handler" sentence (line 145), confirming
  neither is at the cited 132/137.
- `grep -nE '\.md:[0-9]+' src/extension/factory.ts` confirms these are the
  only two `runtime-event-channel.md` line citations in the file, both
  pointing at 132.
- Confirmed the doc file exists at the path both comments imply
  (`docs/spec_topics/pi-integration-contract/runtime-event-channel.md`), so
  this is a drifted line number, not a missing/renamed file.
- Checked this exact file/target pair is not on the do-not-refile list: the
  list's `PTQ-0354`/`PTQ-0380` entries are for `child-tap.ts` citing
  `production-subagent-host.ts`/`subagent-json-driver.ts` (already fixed —
  the current `child-tap.ts` text carries no line numbers at all), a
  different file pair from this `factory.ts`/`runtime-event-channel.md`
  citation.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — reproduced: factory.ts:369 and :895 cite runtime-event-channel.md:132 and :898 cites (:137), but doc :132 is the `masked` clause-(e) implementation note (the candidate's quoted `(g)` text is actually :136 — same unrelated section), :137 is blank, the best-effort fallback paragraph is at :140 and "never aborts the slash-command handler" at :145; not a duplicate — resolved PTQ-0112 explicitly deferred factory.ts (:132) as outside its file list (triage: claude-fable-5-1)
