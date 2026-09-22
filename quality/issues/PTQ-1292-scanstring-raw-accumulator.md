---
id: PTQ-1292
title: scanStringLiteral hand-accumulates the token's verbatim text through 14 `raw +=` sites when it is a single slice of the cursor's own text/index state
lens: D8
status: open
verdict: confirmed
locations:
  - src/lexer/lexer.ts:211-355
sites: 14
fix_scope: localized
d8_class: reimplemented
d8_host: src/lexer/lexer.ts#scanStringLiteral
wave: qw20260922173443
reported_by: lens-d8-simplification (anthropic/claude-fable-5)
date: 2026-09-22
---

# scanStringLiteral hand-accumulates the token's verbatim text through 14 `raw +=` sites when it is a single slice of the cursor's own text/index state

## Observation
`scanStringLiteral` maintains a mutable `raw` string alongside the decoded
`value`, appending the character every `advance()` returns at 14 separate sites
spread across every escape-handling branch. `raw` is read exactly once, as the
token's `text` at the final push. Its own doc-comment states what `raw` is:
"`text` keeps the verbatim source slice" (lexer.ts:213). The `ScannerCursor`
the function already receives exposes both the full source (`text`) and the
live index (`i`, lexer.ts:189-195), so the verbatim slice is
`cursor.text.slice(<index at entry>, cursor.i)` at the push — no per-character
bookkeeping.

## Evidence
Facility: `String.prototype.slice` over state the cursor already carries —
src/lexer/lexer.ts:189-195:
```ts
interface ScannerCursor {
  readonly text: string;
  readonly n: number;
  readonly i: number;
  readonly pos: () => Pos;
  readonly advance: () => string;
}
```

The accumulator and its sole read — lexer.ts:216 (init) and 350-355 (only use):
```ts
  let raw = advance(); // opening quote
  ...
  tokens.push({
    kind: "string",
    text: raw,
    value,
    range: { start, end: pos() },
  });
```

The 14 append sites (grep `raw \+=|let raw` on the file, all inside 211-360):
216, 225, 231, 246, 249, 252, 255, 257, 267, 271, 274, 283, 325, 330. Sample
of the threading burden in the `\u{...}` branch, lexer.ts:267-274:
```ts
          raw += advance(); // `{`
          while (cursor.i < n && isHexDigit(text[cursor.i] ?? "")) {
            const digit = advance();
            hex += digit;
            raw += digit;
          }
          if (text[cursor.i] === "}") {
            raw += advance(); // `}`
```

Feature-for-feature: every `advance()` call inside the function appends its
returned character to `raw` (all 14 sites verified against the 211-360 body;
the two `raw += digit` sites append the character the immediately preceding
`advance()` returned), and `raw` is written nowhere else — so at the push
`raw` is byte-identical to `text.slice(startIndex, cursor.i)` where
`startIndex` is `cursor.i` captured before the opening-quote advance. The
`start`/`pos()` range on the same token is already derived from cursor state
rather than accumulated, so the slice form matches the function's own idiom
for the span.

## Why this is a problem
Fourteen threading sites reimplement, one character at a time, a value that is
a single expression over state the cursor already exposes — and the doc-comment
itself names the target ("the verbatim source slice"). Every escape branch
(plain escape, `\u` braced, `\u` braceless, malformed escape, offending-char
consume) must independently remember the parallel append; a branch that
advances without appending silently corrupts the token's `text` with no
diagnostic, which is exactly the failure mode the accumulator's spread across
branches invites. By contrast `scanNumberLiteral`'s accumulator doubles as its
`Number(value)` parse input; `raw` here has no second consumer.

## Suggested direction (non-binding, optional)
Unproven hypothesis: capture `const startIndex = cursor.i` before the opening
`advance()`, drop `raw` and all 14 appends, and push
`text: cursor.text.slice(startIndex, cursor.i)`. Behaviour-identical per the
equivalence above; the fix stage owns verification.

## False-positive check
Spec check: lexical.md §"String literals" constrains the escape table and
diagnostics, not how the token's verbatim text is materialised; the doc-comment
pins `text` as "the verbatim source slice", which the slice form satisfies by
construction. Exemption check: no D8 exemption keys `src/lexer/lexer.ts` or
`#scanStringLiteral`. Prior-filing check: PTQ-1148 (lexer file five concerns),
PTQ-1167 / qw20260922150013-d9-03 (scanTokens size), PTQ-1253 (dead
re-exports), PTQ-0560 (test fixture) are all different claims; grep of
quality/intake and quality/issues for `scanStringLiteral` found no accumulator
filing. D9 boundary: this is not a size/breakdown claim — the function stays
whole; the claim is the hand-rolled parallel accumulation alone. Verified
`raw` has no reader other than the token push (single-file search).

## Triage
verdict: questionable — accounting verified: exactly 14 `raw` writes at lexer.ts:216, 225, 231, 246, 249, 252, 255, 257, 267, 271, 274, 283, 325, 330 and exactly 14 `advance()` calls in the 211-360 body (the two `raw += digit` sites append the value the immediately preceding `const digit = advance()` returned, so no advance is unpaired); `raw` has a single reader (`text: raw`, line 356); `advance()` (lexer.ts:502-512) returns `text[i] ?? ""` and increments `i` by exactly 1, `cursor.i` is a live getter (line 517), and every in-function advance is guarded by a defined current char so `i` never overruns `n` — hence `raw === cursor.text.slice(startIndex, cursor.i)` at the push holds; doc-comment quote "`text` keeps the verbatim source slice" real at line 213; lexical.md §"String literals" constrains escapes/diagnostics only, not how `text` is materialised; no D8 exemption keys `src/lexer/lexer.ts` or `#scanStringLiteral`; sibling qw20260922173443-d9-01 is a breakdown claim naming `raw` only as a shared local, not the same root cause — per the D8 rule the simpler shape (slice vs accumulator) is a design decision for a human ruling, never confirmed (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-22): confirmed - batch ruling over the RFC-0015-era review wave; triage verification trusted.
