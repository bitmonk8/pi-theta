---
id: PTQ-0189
title: The dropped-theta comment in parseDiscoveredTheta cites src/lexer/lexer.ts:131/:109 for the emitDiagnosticBatch calls, but those lines are now a blank line and a closing brace
lens: D2                     # the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/production-composition.ts:3852-3853
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260910133034
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-10
---

# The dropped-theta comment in parseDiscoveredTheta cites src/lexer/lexer.ts:131/:109 for the emitDiagnosticBatch calls, but those lines are now a blank line and a closing brace

## Observation
Inside `parseDiscoveredTheta`, a comment explains why the dropped-theta
diagnostic filter excludes rows `lexTheta` already delivered, citing
`src/lexer/lexer.ts:131`/`:109` as the two `emitDiagnosticBatch` call sites
inside `lexTheta`. In the current tree, `lexer.ts:109` is a blank line and
`lexer.ts:131` is the closing `}` of the `lexTheta` function; the two actual
`emitDiagnosticBatch` calls are now at `lexer.ts:106` and `lexer.ts:128`.

## Evidence
src/extension/production-composition.ts:3852-3853 — the citation:

```ts
    // Bug 0255: `lexTheta` already delivered `document.deliveredDiagnostics`
    // through the V7d seam (`src/lexer/lexer.ts:131`/`:109`) before this parse
```

src/lexer/lexer.ts:104-109 — the first call, now at line 106; line 109 is blank:

```ts
      message: `invalid UTF-8 encoding at byte offset ${invalidOffset}`,
    };
    emitDiagnosticBatch([encodingDiag], deps);
    return { tokens: [], diagnostics: [encodingDiag], ok: false };
  }

```

src/lexer/lexer.ts:125-131 — the second call, now at line 128; line 131 is the
function's closing brace:

```ts
  if (diagnostics.length > 0) {
    // Producers hand diagnostics to the V7d seam; they never call
    // `pi.sendMessage` directly.
    emitDiagnosticBatch(diagnostics, deps);
  }
  return { tokens, diagnostics, ok: diagnostics.length === 0 };
}
```

`grep -n "emitDiagnosticBatch" src/lexer/lexer.ts` returns 5 hits total; the
two call sites (as opposed to the import and doc-comment mentions) are
exactly `:106` and `:128`.

## Why this is a problem
This is a line-number citation used as a navigation anchor, and it currently
points at code that contradicts what it names: `:109` lands on nothing (a
blank line) and `:131` lands on the function's closing brace, not a call. Git
history explains why: `git blame -L 3853,3853` attributes the citing line to
commit `ade1dfeca` (2026-08-23, "fix: bug 0255"), and this same pair (`:131`/
`:109`) was checked and found accurate as of 2026-09-07 (the already-resolved
PTQ-0080's False-positive section explicitly verified it then). `lexer.ts` was
edited on 2026-09-08 in commit `a6b1aa0d` ("quality: qw20260908115521 D2 fix
src/lexer") — itself an earlier quality-wave narration fix — which rewrote the
module's leading doc comments and, net, removed 3 lines from the span above
`lexTheta`, shifting the two `emitDiagnosticBatch` calls from their original
109/131 down to the current 106/128. The comment in `production-composition.ts`
was never revisited after that shift. The underlying behavioural claim the
comment makes (that `lexTheta` already delivered these rows through the V7d
seam before this parse runs, so re-delivering them here would double-count
them) is unaffected and still true — only the two line numbers are wrong.

## Suggested direction (non-binding, optional)
Update the two numbers to 106/128, or replace them with a name-only reference
(`lexTheta`'s two `emitDiagnosticBatch` calls) the way neighbouring comments in
this same file already reference `resolveEntry` and
`#recheckCalleeContainment` without line numbers.

## False-positive check
- Read the current content at both cited lines: `lexer.ts:109` is blank;
  `lexer.ts:131` is `}` (the closing brace of `lexTheta`).
- `grep -n "emitDiagnosticBatch" src/lexer/lexer.ts` → 5 hits; the two call
  sites are `:106` and `:128`, not `:109`/`:131`.
- `git blame -L 3853,3853 -- src/extension/production-composition.ts` →
  `ade1dfeca` (2026-08-23), confirming the citing comment has not been touched
  since it was written.
- `git show a6b1aa0d -- src/lexer/lexer.ts` → a later, unrelated commit
  (2026-09-08) that rewrote `lexer.ts`'s leading doc comments, netting a
  3-line reduction across the span containing `lexTheta`, which accounts for
  the exact 109→106 / 131→128 shift.
- Duplicate check: the already-resolved `PTQ-0080` (wave qw20260907183353,
  2026-09-07) checked this SAME pair of numbers in its own False-positive
  section and recorded them as accurate at that time ("`src/lexer/lexer.ts:131`
  /`:109` … both still land on `emitDiagnosticBatch(...)` calls in `lexTheta`
  — accurate"). The drift reported here postdates that check by one day
  (the shifting commit, `a6b1aa0d`, is dated 2026-09-08), so this is new
  evidence, not a re-file of PTQ-0080's already-fixed citations.
- Not a deadness claim: nothing here is unreachable code; the finding is a
  stale comment citation into another file. No test-only-reachable production
  code is being reported as dead.

## Triage
verdict: confirmed — reproduced exactly (lexer.ts:106/:128 are the two emitDiagnosticBatch calls, :109 is blank, :131 is lexTheta's closing brace, grep confirms 5 total hits); git show a6b1aa0d proves the pre-commit state had the calls at 109/131 (matching the citation) and the post-commit state at 106/128, an exact 3-line shift from unrelated doc-comment edits above lexTheta, while git blame shows the citing comment (ade1dfeca, 2026-08-23) untouched since, and PTQ-0080's 2026-09-07 False-positive check independently recorded this same pair as accurate then — so this is genuine post-resolution drift, not a duplicate (triage: claude-opus-5)
