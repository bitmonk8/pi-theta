---
id: PTQ-1233
title: normaliseLiteralValueLineBreaks hand-rolls a 39-line character scanner for a whitespace-run collapse String.prototype.replace expresses directly
lens: D8
status: open
verdict: confirmed
locations:
  - src/diagnostics/diagnostic.ts:163-201
sites: 1
fix_scope: localized
d8_class: reimplemented
d8_host: src/diagnostics/diagnostic.ts#normaliseLiteralValueLineBreaks
wave: qw20260921183818
reported_by: lens-d8-simplification (anthropic/claude-fable-5)
date: 2026-09-21
---

# normaliseLiteralValueLineBreaks hand-rolls a 39-line character scanner for a whitespace-run collapse String.prototype.replace expresses directly

## Observation
`normaliseLiteralValueLineBreaks` (src/diagnostics/diagnostic.ts:163-201, 39 LOC per the structural map, 9 src importers) implements the placeholder-rendering-b.md §7 literal-value collapse: any run of `space/tab/CR/LF` that contains at least one break collapses (run and adjoining horizontal whitespace together) to one U+0020; break-free runs are untouched; then leading/trailing U+0020 (only) is trimmed. It does this with a hand-written index/accumulator scanner (outer `while`, inner run-scanner with a `sawBreak` flag, then two manual trim loops), where the same transform is a direct `String.prototype.replace` over a global regex — the facility the same module already uses one function up (`/[\r\n]/.test` at :164) and the sibling module uses for the §6 newline normalisation.

## Evidence
src/diagnostics/diagnostic.ts:167-201 (re-read before filing; middle elided, full range is one function):
```ts
  const n = text.length;
  let out = "";
  let i = 0;
  while (i < n) {
    const c = text[i] ?? "";
    if (c === " " || c === "\t" || c === "\r" || c === "\n") {
      let j = i;
      let sawBreak = false;
      ...
      out += sawBreak ? " " : text.slice(i, j);
      i = j;
      continue;
    }
    out += c;
    i += 1;
  }
  let start = 0;
  let end = out.length;
  while (start < end && out[start] === " ") { start += 1; }
  while (end > start && out[end - 1] === " ") { end -= 1; }
  return out.slice(start, end);
```

The facility: ECMAScript `String.prototype.replace` with a global RegExp (ECMA-262 §22.1.3.19), already the house idiom for exactly this class of transform in the diagnostics layer — src/diagnostics/placeholder.ts:293-295 (`firstLineTruncate`):
```ts
  const normalised = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
```

Feature-for-feature against the function's own documented contract (:145-161 doc comment):
- "every break collapses, together with the horizontal whitespace adjoining it, to one U+0020" — `text.replace(/[ \t\r\n]*[\r\n][ \t\r\n]*/g, " ")` matches precisely the maximal whitespace runs containing at least one break (the mandatory `[\r\n]` in the middle) and replaces each with one space; a break-free ` \t ` run contains no `[\r\n]` and never matches.
- "Text containing neither U+000D nor U+000A is returned unchanged (byte identity)" — the existing `if (!/[\r\n]/.test(text)) return text;` guard at :164-166 is independent of the scanner and carries over as-is.
- "Leading and trailing U+0020 are then trimmed" (U+0020 only, not tab — `String.prototype.trim` would be wrong) — `.replace(/^ +| +$/g, "")`, or the two-loop trim collapses to it. After the collapse step a leading/trailing tab can only survive from a break-free run, which the manual trim also leaves in place, so behaviour is identical.
- "U+00A0 is never touched" — the character class contains only the four ASCII characters the scanner tests.

## Why this is a problem
39 lines of index arithmetic, an accumulator string built by per-character concatenation, a two-state run scanner, and two manual trim loops carry a job the standard library expresses in ~3 lines with the module's own established idiom — a disproportionate LOC-to-outcome ratio for a function nine production modules and two rendering channels (diagnostics + binder system prompt, per its own doc comment) depend on. The hand scanner is also the harder shape to verify against the §7 contract: each of the four contract bullets above must be traced through loop state instead of read off a character class.

## Suggested direction (non-binding, optional)
Unproven hypothesis: keep the :164 byte-identity guard and replace the body with `text.replace(/[ \t\r\n]*[\r\n][ \t\r\n]*/g, " ").replace(/^ +| +$/g, "")`; equivalence over the documented cases (block-scalar clip-retained trailing break, interior mixed runs, break-free tabs, U+00A0) sketched above but not test-verified here.

## False-positive check
- Exemption check: no D8 exemption for `src/diagnostics/diagnostic.ts` or this function (the two listed D8 exemptions name enumerateDirectory and firstAdmittingArmProperties).
- Duplicate check: PTQ-0283 (linebreak collapse duplicated between diagnostic and prompt channels) is a duplication filing whose fix this very function's doc comment records (binder-system-prompt.ts now calls it); this filing is the distinct claim that the surviving single copy hand-rolls the facility. No other roster entry names this function.
- Rationale check: the doc comment (:145-161) pins the semantics (whitespace set, trim rule, U+00A0) but states no rationale for the manual scanner over a regex; the same file uses RegExp at :164, so no regex-avoidance convention is in force.
- Spec check: placeholder-rendering-b.md §7 pins the transform's observable behaviour, not its implementation; nothing here drops a spec-required behaviour (no `challenges_spec`).
- Liveness: 9 src importers (structural map), 30+ call sites (grep across src/) — live production code; no demotion to test-only reachability is proposed.

## Triage
verdict: questionable — accounting verified: excerpt byte-exact at diagnostic.ts:163-201 (39 LOC, one function), facility citation placeholder.ts:293-294 real, no D8 exemption for the host, 9 external src importers / 35 call sites live, placeholder-rendering-b.md §"Parse-time literal-value" pins exactly the four-char class + break-containing-run collapse + U+0020-only trim (behaviour, not implementation; no spec drop); the named facility covers every need — scratch fuzz of the hand scanner vs `text.replace(/[ \t\r\n]*[\r\n][ \t\r\n]*/g, " ").replace(/^ +| +$/g, "")` over 266,430 inputs (exhaustive len ≤ 5 on a 9-char alphabet incl. U+00A0/U+2028, plus 200k random len ≤ 30) gave 0 mismatches, block-scalar trailing break / edge tabs / U+00A0 cases agree; not a duplicate of resolved PTQ-0283 (that was the D4 clone across channels, this is the surviving copy's shape); the simpler shape is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-21): confirmed - D8 wave-1 batch ruling; triage equivalence verification trusted.
