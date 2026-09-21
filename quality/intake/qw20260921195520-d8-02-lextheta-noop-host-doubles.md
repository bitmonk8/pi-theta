---
id: pending
title: Three production snippet-lex sites in theta-document.ts fabricate no-op pi/ui host doubles to void lexTheta's mandatory system-note delivery channel, whose payload they already receive on LexResult.diagnostics
lens: D8
status: intake
verdict: pending
locations:
  - src/parser/theta-document.ts:1232-1240
  - src/parser/theta-document.ts:1261-1269
  - src/parser/theta-document.ts:3441-3449
  - src/lexer/lexer.ts:92-99
  - src/lexer/lexer.ts:123-128
sites: 3
fix_scope: cross-module
d8_class: against-grain
d8_host: src/lexer/lexer.ts#lexTheta
wave: qw20260921195520
reported_by: lens-d8-simplification (anthropic/claude-fable-5)
date: 2026-09-21
---

# Three production snippet-lex sites in theta-document.ts fabricate no-op pi/ui host doubles to void lexTheta's mandatory system-note delivery channel, whose payload they already receive on LexResult.diagnostics

## Observation
`lexTheta` requires a `SystemNoteChannelDeps` second parameter and, when any diagnostic is produced, pushes it out through `emitDiagnosticBatch` as a `theta-system-note` — in addition to returning the same diagnostics on `LexResult.diagnostics`. Three production helpers in `theta-document.ts` that lex expression snippets (`parseExpressionSource`, `parseInterpolationSource`, `firstForbiddenInterpolationToken`) do not want that delivery: each constructs an inline fake host `{ pi: { sendMessage: () => {} }, ui: { notify: () => {} }, emitDiagnostic: () => {} }` so the mandatory channel delivers into a void, then reads (or discards) the returned diagnostics. The requirement also makes `src/lexer/lexer.ts` import its deps type from `src/extension/system-note-channel`.

## Evidence
Documented intent of the channel, src/lexer/lexer.ts:92-94 (verbatim):
```ts
 * Any diagnostic produced is delivered through the V7d producer-facing
 * diagnostic-emission seam (`emitDiagnosticBatch`) as exactly one batched
 * `theta-system-note` — never via a direct `pi.sendMessage` call.
```
and the return value already carries the same payload, lexer.ts:123-128:
```ts
  if (diagnostics.length > 0) {
    // Producers hand diagnostics to the V7d seam; they never call
    // `pi.sendMessage` directly.
    emitDiagnosticBatch(diagnostics, deps);
  }
  return { tokens, diagnostics, ok: diagnostics.length === 0 };
```

The fighting usage — a producer-facing delivery seam satisfied by a fabricated host that delivers nothing — theta-document.ts:1232-1240 (verbatim; the other two sites at 1261-1269 and 3441-3449 are byte-identical in the deps literal):
```ts
  const lex = lexTheta(
    { path: "<interpolation>", bytes: encodeSource(source) },
    {
      pi: { sendMessage: () => {} },
      ui: { notify: () => {} },
      emitDiagnostic: () => {},
    },
  );
```
The callers' own docs state the discard is intended: theta-document.ts:1227-1229 "Lex diagnostics are discarded here: a well-formed theta's interpolation already lexed as part of the whole-file body, and a malformed one degrades to `null` at the call site (the inline no-op channel keeps this helper free of shared state …)". `parseInterpolationSource` keeps only the `BodyParser`'s parse diagnostics, not the lex channel's; `firstForbiddenInterpolationToken` reads only `lex.tokens`.

Count: exactly 3 production sites (`grep -n "sendMessage: () => {}" src/` — 3 hits, all in theta-document.ts).

## Why this is a problem
The API's documented grain is producer-facing note delivery; at these three sites the delivery is actively fought — a five-line fake host per site whose only job is to make a mandatory side effect vanish, for a payload the function already returns. The mandatory parameter also drags an `src/extension/` type import into the lexer for callers that are pure parse-layer helpers. The in-code rationale ("the inline no-op channel keeps this helper free of shared state — no module-level mutable channel") justifies the inline literal over a shared mutable channel, not the requirement to supply a delivery channel at all for a snippet re-lex whose text already lexed — and already noted — as part of the whole file.

## Suggested direction (non-binding, optional)
Unproven hypothesis: make the deps parameter optional (or add a pure entry that lexes and returns `LexResult` without the emission step), keeping the whole-file call site (theta-document.ts:211, real `deps.systemNote`) on the batched-note seam unchanged. The three snippet sites then pass nothing instead of fabricating hosts.

## False-positive check
- Spec check: lexer.ts's V7d note requires producer diagnostics to reach the user as one batched system note; the snippet sites' texts already lexed inside the whole-file pass (their doc says so verbatim), so no docs/spec_topics/ clause requires a second note for the `<interpolation>` re-lex — no clause is being argued against.
- D2 precedent check (stated-rationale knob): the stated rationale defends inline-vs-shared-state, not the mandatory channel; the claim here does not contradict any stated design rationale.
- Already-filed check: no quality/ file mentions `lexTheta`, `parseExpressionSource`, or the no-op channel trio (grep over quality/issues, quality/intake, quality/resolved — only stale-doc PTQ-0039/PTQ-0157, both resolved, about other facts). PTQ-1148 (lexer file D9 concerns) makes no claim on this seam.
- Exemption check: no D8 exemption on `src/lexer/lexer.ts` or `src/parser/theta-document.ts`.
- Not test-only: all three call sites are production parse paths (interpolation parsing, forbidden-interpolation check).

## Triage
verdict: questionable — accounting verified: lexer.ts:92-94/:123-128 excerpts byte-exact, three byte-identical no-op `SystemNoteChannelDeps` literals at theta-document.ts:1232-1240/1261-1269/3441-3449 (grep `sendMessage: () => {}` src/ → 3 hits; lexTheta has 4 production callers, :211 the only real-channel one), both the encoding and scan/contextual diagnostics are returned on LexResult so the discarding callers lose nothing by not delivering, the :1227-1229 rationale defends inline-vs-shared-state only, no D8 exemption on either host, nothing open tracks the seam; but the simpler shape is a design ruling — bug 0255 §Fix candidate 1 rejected making lexTheta a pure returner and pinned the V7d producer-seam contract text 'deliberately unchanged' (0264 reaffirmed), while 0255 constraint 2 also says no route may require the three callers to supply a real channel, so optional-deps/pure-sibling-entry is consistent with but not covered by the record (triage: claude-fable-5-1)
verdict: questionable — re-verified independently: lexer.ts:92-94 and :123-128 excerpts byte-exact; the three inert-channel literals at theta-document.ts:1232-1240/1261-1269/3441-3449 reproduce (grep `sendMessage: () => {}` src/ → 3 hits, all theta-document.ts; lexTheta production callers = 4, only :211 passes a real `deps.systemNote`); all three callers read only `lex.tokens` / BodyParser diagnostics and lexTheta returns its full diagnostics on LexResult, so the documented producer-facing delivery grain is genuinely fought at these sites; the :1227-1229 rationale defends inline-vs-shared-state only; quality/exemptions.json has no D8 row for lexer.ts or theta-document.ts; no open PTQ tracks the seam (only resolved PTQ-0039/0157/0189 stale-doc rows); but the simpler shape is a design ruling — docs/bugs/0255 §Fix candidate 1 (make lexTheta a pure returner) is 'rejected on the record' per 0264 §Non-goals, while 0255 constraint 2 / 0264 constraint 4 explicitly protect these inert-channel callers ('none may require them to supply a real channel'), so an optional-deps or pure sibling entry is compatible with the record yet unratified and touches the pinned V7d seam contract text (tests/lexer-core.test.ts seam assertions) — needs a human ruling (triage: claude-fable-5-1)
