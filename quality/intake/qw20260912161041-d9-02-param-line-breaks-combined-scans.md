---
id: pending
title: normaliseParamLineBreaks combines a lexer-mirroring string-literal escape scan with an unrelated whitespace-collapse rule in one 63-LOC function
lens: D9
status: intake
verdict: pending
locations:
  - src/binder/binder-system-prompt.ts:308-370
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/binder/binder-system-prompt.ts#normaliseParamLineBreaks
d9_band: zone
wave: qw20260912161041
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-12
---

# normaliseParamLineBreaks combines a lexer-mirroring string-literal escape scan with an unrelated whitespace-collapse rule in one 63-LOC function

## Observation
`normaliseParamLineBreaks` (src/binder/binder-system-prompt.ts:308-370, 63 LOC) is the function-level "band zone" item the structural map lists for this file (FN_BANDS zone is 60-99 LOC; the file itself is band-exempt at 455 LOC). Its own doc comment states it applies two different rules while scanning one string left-to-right: "A line break inside a string literal renders as the two-character escape `\n` ... Every other line break renders as one U+0020 SPACE." The same comment states the string-literal arm "mirrors the string-token loop in `tokeniseExpr` (src/parser/literal-sublanguage.ts)," a lexer routine in a different module.

## Evidence
src/binder/binder-system-prompt.ts:317-331 (string-literal span scan; the arm continues to line 348, truncated here for excerpt length)
```ts
    if (c === '"' || c === "'") {
      const quote = c;
      out += quote;
      i += 1;
      while (i < n && text[i] !== quote) {
        let ch = text[i] ?? "";
        if (ch === "\\" && i + 1 < n) {
          // The escape unit: emitted verbatim, and what keeps the character
          // after it — even a quote — from ending the span here.
          out += "\\";
          i += 1;
          ch = text[i] ?? "";
        }
        if (ch === "\r") {
          out += "\\n";
```

src/binder/binder-system-prompt.ts:349-362 (whitespace-run collapse; the arm closes at line 365)
```ts
    if (c === " " || c === "\t" || c === "\r" || c === "\n") {
      let j = i;
      let sawBreak = false;
      while (j < n) {
        const wc = text[j] ?? "";
        if (wc !== " " && wc !== "\t" && wc !== "\r" && wc !== "\n") {
          break;
        }
        if (wc === "\r" || wc === "\n") {
          sawBreak = true;
        }
        j += 1;
      }
      out += sawBreak ? " " : text.slice(i, j);
```

Step inventory:

| concern | line range | LOC | locals read / written |
|---|---|---|---|
| Loop scaffolding (fast path, setup, dispatch, close, return) | 308-316, 366-370 | 14 | reads `text`; writes `n`, `out`, `i`, `c` |
| String-literal span scan (escape-aware; converts embedded breaks to the two-char `\n`; mirrors `tokeniseExpr`'s string-token loop) | 317-348 | 32 | reads `text`, `i`, `n`; writes `out`, `i` (plus locals `quote`, `ch`) |
| Whitespace-run collapse (outside string literals) | 349-365 | 17 | reads `text`, `i`, `n`; writes `out`, `i` (plus locals `j`, `sawBreak`) |

The two substantive rows cover 49 of the function's 63 LOC (78%).

## Why this is a problem
The function sits in the FN_BANDS zone (60-99 LOC; this function is 63), which files only on 2-or-more-concern evidence — shown above. Reasons considered and why each fails to keep the function whole:
- Closed-enumeration dispatch: the outer branch is only a 2-way character-class split (inside a string literal vs. not), and this reason requires each arm to be short — here one arm is 32 LOC, close to half the function, which is not "short" in the sense the reason requires (contrast this same review's `resolveBinderModel`, longest arm 14 LOC, and `buildBinderSystemPrompt`, longest item 7 LOC, both left whole on that reason).
- Single algorithm with shared local state: a split into `consumeStringLiteralSpan(text, i, n)` and `consumeWhitespaceRun(text, i, n)`, each returning `{appended, nextIndex}`, would thread at most 3 locals across either helper boundary — well under the 6-local bar this reason requires.
- Data-only module / one grammar production family / generated code: none apply — the string-literal arm only partially mirrors a lexer production, and the function also carries the unrelated whitespace-collapse rule, so the function as a whole is not one production's sequential recognition.
- The two rules are independently attested: the governing doc comment states them as two coordinate clauses (quoted above), and this same file already implements the whitespace-collapse clause alone, with no string-literal awareness, in the 39-LOC sibling `normalisePromptTextLineBreaks` (lines 99-137, not over threshold) — evidence the two rules do not require one shared body to hold correct.

## Suggested direction (non-binding, optional)
Seam A: string-literal span scan (317-348) → a `consumeStringLiteralSpan` helper (hypothesis) — 32 LOC, isolating the escape-aware `\n` conversion the doc comment ties to `tokeniseExpr`. Not currently exported (0 external importers as private in-function code), so the only cross-reference back into the host is the one call the outer loop keeps at the opening-quote branch.
Seam B: whitespace-run collapse (349-365) → its own helper (hypothesis) — 17 LOC. The file's own doc comment on the sibling `normalisePromptTextLineBreaks` already discusses, and declines, sharing this shape ACROSS files "since the two answer different spec sentences ... and may move independently under a future adjudication" — that cross-file rationale would need separate re-examination before assuming it also blocks a within-file extraction of this arm alone.
None identified beyond A/B.

## False-positive check
Band: zone (63 LOC against FN_BANDS zone 60-99). Reasons-considered: closed-enumeration dispatch (defeated — the 32-LOC arm is not short by this review's own comparators), single-algorithm-shared-state (defeated — at most 3 locals cross any hypothetical helper boundary), data-only/grammar-production/generated (none apply outright, only a partial mirror of one production). Exemptions check: `quality/exemptions.json` is `{}` — no existing ruling for this host or function. Generated-code check: the file carries no generator banner; part of the hand-authored V11d/V11d-T binder system-prompt builder series per the file header. Spec-mirror check: the governing spec clause (Type display / Default-literal rendering, binder-bypass-and-envelope.md) states the string-literal-escape rule and the "every other break collapses" rule as two coordinate sentences, not one enumerated production, and this file's own sibling function already implements the second sentence alone with no zone flag.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — accounting verified: size-scan confirms normaliseParamLineBreaks is 308-370/63 LOC (zone band) in a 455-LOC exempt file, the cited 317-331/349-362 excerpts and step-inventory LOC (14/32/17, 78% in the two substantive rows) match the file exactly, the doc comment states two independently-attested rules corroborated by the 39-LOC sibling normalisePromptTextLineBreaks (99-137), and every concrete reason (closed-enumeration arm-length, ≥6 shared locals, data-only, grammar-production, generated) is correctly defeated with cited evidence and none overlooked — but per the D9 breakdown rule this is never confirmed, since the target shape is a design decision for human ratification (triage: claude-opus-5)
