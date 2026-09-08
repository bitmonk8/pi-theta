---
id: PTQ-0129
title: The `c === "\r"` disjunct in the lexer's whitespace-skip branch can never match — scanTokens' only caller hands it text from which normaliseNewlines has already removed every carriage return
lens: D2                     # the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/lexer/lexer.ts:416-419
  - src/lexer/lexer.ts:113-123
  - src/lexer/lexer.ts:301-304
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# The `c === "\r"` disjunct in the lexer's whitespace-skip branch can never match — scanTokens' only caller hands it text from which normaliseNewlines has already removed every carriage return

## Observation
`scanTokens` skips insignificant whitespace with a three-way disjunction that
includes `c === "\r"`. `scanTokens` is module-private and has exactly one call
site: `lexTheta`, which passes the output of
`normaliseNewlines(decodeUtf8(...))`. `normaliseNewlines` rewrites `\r\n` and
bare `\r` to `\n` over the whole string, so no `U+000D` survives into the text
`scanTokens` walks. The carriage-return disjunct therefore selects nothing; the
`\n` branch immediately above it (lexer.ts:410-415) is what handles every
line break, including those that were carriage returns in the source bytes.

## Evidence
src/lexer/lexer.ts:410-419 — the newline branch and the whitespace-skip branch
whose third disjunct is the subject:

```ts
    if (c === "\n") {
      const start = pos();
      advance();
      tokens.push({ kind: "newline", text: "\n", range: { start, end: pos() } });
      continue;
    }
    if (c === " " || c === "\t" || c === "\r") {
      advance();
      continue;
    }
```

src/lexer/lexer.ts:301-304 — the normalisation that removes every carriage
return (`/\r\n?/g` matches a lone `\r` as well as `\r\n`):

```ts
/** Normalise `\r\n` and bare `\r` to `\n` (lexical.md §Newline normalisation). */
function normaliseNewlines(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}
```

src/lexer/lexer.ts:113-123 — the sole producer of `scanTokens`' input, which
runs that normalisation first:

```ts
  // Step 2 — decode (skipping a leading UTF-8 BOM) and normalise CRLF / bare CR
  // to LF before any position is recorded, so spans are on the normalised
  // stream and CRLF / LF sources tokenise identically (lexical.md §Newline
  // normalisation).
  const text = normaliseNewlines(decodeUtf8(source.bytes));
  ...
  const scanned = scanTokens(text, file);
```

Call-site count: `grep -rn "scanTokens" src/ extensions/ tools/ tests/` → 3
hits — the definition (lexer.ts:313), the single call (lexer.ts:123), and one
prose mention in tests/fn-arg-type-mismatch-wired.test.ts:2653. There is no
second entry point that could hand `scanTokens` un-normalised text.

## Why this is a problem
Dead branch: a disjunct whose predicate is false on every input the enclosing
function can receive. The deadness is structural, not incidental — the same
module both strips carriage returns (`normaliseNewlines`) and then tests for
them (`scanTokens`), and the header comment at lexer.ts:113-116 states the
normalisation happens "before any position is recorded", i.e. before the
scanner runs. Nothing downstream re-introduces `\r`: the escape table's `\r`
case (lexer.ts:487-489) writes the character into a string token's decoded
`value`, never back into the source text being scanned.

## Suggested direction (non-binding, optional)
The whitespace-skip predicate can state exactly the two characters the
normalised stream can present at that point, leaving the newline branch above
it as the sole line-break handler.

## False-positive check
- Reachability of `scanTokens`: it is declared `function scanTokens(` (not
  exported) at lexer.ts:313; `grep -rn "scanTokens" src/ extensions/ tools/
  tests/` returns only the definition, the one call at lexer.ts:123, and a
  comment in a test. No dynamic/string-keyed access is possible — the symbol is
  module-private and the module exports no dispatch table.
- Input provenance: `grep -n "normaliseNewlines" src/lexer/lexer.ts` → 2 hits
  (the call at :117 and the definition at :302). The only expression bound to
  `text` in `lexTheta` is line 117.
- Regex behaviour: `/\r\n?/g` has an optional `\n`, so a lone `\r` is matched
  and replaced; the replacement is `"\n"`, which contains no `\r`.
- Re-introduction of `\r` inside the scanner: `grep -n '"\\r"' src/lexer/lexer.ts`
  → 2 hits, line 416 (the subject) and line 488 (`value += "\r";`, which appends
  to a token's decoded `value`, not to `text`). `advance()` (lexer.ts:346-356)
  only reads `text[i]` and never writes it.
- Tests as callers: no test reaches `scanTokens` directly (it is not exported);
  the lexer tests go through `lexTheta`, which normalises. So this is not a
  test-only-reachable path being mistaken for dead code.

## Triage
verdict: confirmed — re-verified: `scanTokens` is module-private with exactly one call site (lexer.ts:123, repo-wide `git grep` shows only definition+call, no re-export or dynamic access), its sole input is `normaliseNewlines(decodeUtf8(...))` at lexer.ts:117, `/\r\n?/g`→`"\n"` provably leaves no U+000D (checked against `\r`, `\r\n`, `\r\r`, `\r\r\n`), and the function's own doc comment declares its input "the normalised stream", so the `c === "\r"` disjunct at lexer.ts:416 is unreachable dead code in production src/ — not fail-closed (an impossible CR would merely become a punct token) and not test-only-reachable; the report's "3 hits" grep count is understated (8 repo-wide, the 5 extras all prose comments) but the call-site enumeration reproduces exactly (triage: claude-opus-5)
