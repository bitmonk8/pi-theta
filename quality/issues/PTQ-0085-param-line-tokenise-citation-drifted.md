---
id: PTQ-0085
title: "normaliseParamLineBreaks's doc comment cites the tokeniseExpr string-token loop at literal-sublanguage.ts:136–150, where the loop no longer sits (now 145–160)"
lens: D2                     # the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/binder/binder-system-prompt.ts:300-301
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# normaliseParamLineBreaks's doc comment cites the tokeniseExpr string-token loop at literal-sublanguage.ts:136–150, where the loop no longer sits (now 145–160)

## Observation

The doc comment on `normaliseParamLineBreaks` anchors its string-literal span
walk to the string-token loop in `tokeniseExpr` by a hard line-range citation,
`src/parser/literal-sublanguage.ts:136–150`. In the current file the
string-token loop (`if (c === '"' || c === "'") { ... }`) begins at line 145
and ends at line 160; lines 136-144 today hold the `isIdentStart`/`isIdentPart`
helpers, the `twoChar` set, the `while` head, and the whitespace-skip arm. The
citation was accurate when written and drifted as later edits added lines above
the loop.

## Evidence

src/binder/binder-system-prompt.ts:300-301 — the citation:

```ts
 * `\"` does not close the span. The span walk below mirrors the string-token
 * loop in `tokeniseExpr` (src/parser/literal-sublanguage.ts:136–150),
```

src/parser/literal-sublanguage.ts:145-154 — where the cited loop actually
starts today:

```ts
    if (c === '"' || c === "'") {
      const start = i;
      const quote = c;
      i += 1;
      while (i < n && source[i] !== quote) {
        if (source[i] === "\\" && i + 1 < n) {
          i += 1;
        }
        i += 1;
      }
```

Git history: the citation was introduced in 125d3691 ("fix(bug-0060): normalise
the binder Parameters: type and default tokens at the render seam"); at that
commit `git show 125d3691:src/parser/literal-sublanguage.ts` places the
string-token loop at lines 136-151, matching the citation. Later changes to
literal-sublanguage.ts (e.g. b4b96503 bug 0166, fdcb0835 bug 0175) added lines
above the loop, shifting it to 145-160 at HEAD.

## Why this is a problem

Historical narration drift: a hard line-range citation that no longer points at
the code it names. A reader following `literal-sublanguage.ts:136–150` lands on
tokeniser helper definitions and only the first half of the loop, not the
string-token loop whose unterminated-quote disposition the comment claims to
mirror. The staleness is mechanically proven — accurate at the introducing
commit, wrong at HEAD after unrelated edits above the cited lines.

## Suggested direction (non-binding, optional)

Refer to the loop by function name and shape (as the surrounding sentence
already does) rather than a hard line range, or refresh the range.

## False-positive check

- Current-code check: `sed -n '130,168p' src/parser/literal-sublanguage.ts`
  shows `tokeniseExpr` starting at 130 and the string-token loop spanning
  145-160; lines 136-144 are helper/loop-head lines, not the string loop.
- Origin check: `git log -S "literal-sublanguage.ts:136"` on
  binder-system-prompt.ts finds the single introducing commit 125d3691, and
  `git show 125d3691:src/parser/literal-sublanguage.ts` confirms the loop sat
  at 136-151 there — the citation drifted, it was not born wrong.
- Other hard line citations in the scoped files were checked and found
  accurate: defaulting.ts's "`:133`" (the spread literal is at
  defaulting.ts:133) and binder-inference.ts's "schema-subset.md:8" (the
  `properties`/`required` agreement line is docs/spec_topics/schema-subset.md:8)
  — so this is the one drifted citation, cited alone.
- Duplicate check: the already-filed
  qw20260907130901-d2-02-wire-walk-line-citations-drifted.md concerns different
  citations in a different file (wire-walk), not this site.

## Triage
verdict: confirmed — reproduced exactly: binder-system-prompt.ts:301 cites literal-sublanguage.ts:136–150 but the string-token loop sits at 145–160 at HEAD (136–144 are isIdentStart/isIdentPart/twoChar/while-head/whitespace arm), origin 125d3691 is the sole introducing commit where it did sit at 136–150 and tokeniseExpr moved 121→130, and the cited unterminated-quote disposition (155–157) now falls outside the range; sole hard line citation in the file, D2 charter names historical narration comments (triage: claude-opus-5)

