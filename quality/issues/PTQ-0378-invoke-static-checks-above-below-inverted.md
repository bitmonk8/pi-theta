---
id: PTQ-0378
title: Four invoke-static-checks.ts comments still say the sibling call-surface function's code is above/below after Seam A reordered the two functions
lens: D2                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/invoke-static-checks.ts:958-964
  - src/extension/invoke-static-checks.ts:990-994
  - src/extension/invoke-static-checks.ts:1659-1664
  - src/extension/invoke-static-checks.ts:1684-1690
sites: 4                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260916144930
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-16
---

# Four invoke-static-checks.ts comments still say the sibling call-surface function's code is above/below after Seam A reordered the two functions

## Observation
`checkThetaCallableCallSurface` (src/extension/invoke-static-checks.ts:933)
and `checkInvokeStaticResolution` (src/extension/invoke-static-checks.ts:1515)
are two top-level functions in this file, each holding one of the two
clause-bearing call surfaces (the `.theta`-callable surface and the
`invoke(...)` surface respectively). Four doc comments — two inside each
function — use the words "above"/"below" to point at code that lives in the
*other* function. Given the current file order (the `.theta`-callable
function starts 582 lines before the invoke function), two of the four
comments describe code that is actually below them, and the other two
describe code that is actually above them.

## Evidence
`src/extension/invoke-static-checks.ts:958-964` (inside
`checkThetaCallableCallSurface`, claims the invoke arm's own mode gate is
"above" — the invoke arm's gate is inside `checkInvokeStaticResolution`,
defined at line 1515, i.e. below this comment):
```ts
    // RFC 0009 (invocation.md INV-8 static mode gate), the `.theta`-callable
    // half of the invoke arm's gate above. PRODUCTION-UNREACHABLE: a
    // prompt-mode `.theta` in `tools:` already un-registers the theta at load
    // (`theta/load/prompt-mode-callable`, tool-calls.md), so no registered
    // caller can hold this site — the arm exists so the gate is uniform
    // across both clause-bearing surfaces (and for harness inputs). `<callee>`
    // is the PRESENTED callable name here, not the callee path
```

`src/extension/invoke-static-checks.ts:990-994` (also inside
`checkThetaCallableCallSurface`, claims the invoke arm's own `<callee>`
rendering rule is "above" — that rule lives inside
`checkInvokeStaticResolution`, below this comment):
```ts
    const arityDiags = checkInvokeArity({
      // The `invoke(...)` arm above renders `<callee>` as the verbatim path
      // literal because that IS the text at its diagnostic range. Here the
      // range is the call site instead, and the callee path appears
      // nowhere on that line — only the presented callable name does — so
```

`src/extension/invoke-static-checks.ts:1659-1664` (inside
`checkInvokeStaticResolution`, claims the `.theta`-callable arm's own
`emptyCalleeAnnotationEnv` is "below" — that local is declared inside
`checkThetaCallableCallSurface`, at line 1046, i.e. above this comment):
```ts
        //
        // This arm's OWN empty callee-annotation env, judged separately from
        // the `.theta`-callable arm's `emptyCalleeAnnotationEnv` below (same
        // rationale — see that arm's own comment for why the EXPECTED side
        // must be judged in the callee's namespace, not the caller's).
        const emptyCalleeAnnotationEnv: TypeEnv = Object.create(null) as TypeEnv;
```

`src/extension/invoke-static-checks.ts:1684-1690` (also inside
`checkInvokeStaticResolution`, claims the `.theta`-callable arm's per-site
emission cap is "below" — that cap lives inside
`checkThetaCallableCallSurface`, above this comment):
```ts
        // emission is the adjudicated rule for it (diagnostic-shape.md
        // #argument-mismatch-multiplicity). The `.theta`-callable arm below
        // caps at one emission per call site instead — not because it shares
        // this loop's shape, but because its own emitter is called once per
        // slot from inside a loop that `break`s after the first mismatch; see
        // that loop's own comment for why. `checkFnCallArgs`
        // (../parser/type-layer-checks.ts) and `checkImportedFnCallArgs`
```

## Why this is a problem
Each comment names a specific fact ("the invoke arm's gate", "the
`.theta`-callable arm's `emptyCalleeAnnotationEnv`") and tells the reader
which direction in the file to look for it. `git blame` shows the two
"below" comments (1659-1664, 1684-1690) were authored on 2026-08-05 and
2026-08-23 respectively, before the Seam A extraction existed — at that time
the `.theta`-callable loop's code sat physically after the invoke loop's
code, inside the same function, so "below" was correct. `git show 4a31825f`
(the 2026-09-14 commit that performed the ratified Seam A extraction, PTQ-0321)
shows the two "above" comments (958-964, 990-994) were carried byte-for-byte
out of their old nested position — where "above" was, symmetrically, also
correct — into the new, earlier-positioned standalone function
`checkThetaCallableCallSurface`, with no wording change. The extraction
inverted which function is physically first without anyone updating these
four direction words, so a reader who follows any one of them today searches
in the wrong direction and either concludes the referenced code does not
exist or has to search the whole file to find it.

## Suggested direction
Swap "above" and "below" in these four comments to match the current file
order (or replace the bare direction word with a name-only cross-reference,
as the module already does elsewhere for cross-file references, e.g. "(the
sibling `checkThetaCallableCallSurface` function)").

## False-positive check
- Confirmed function start lines with `grep -n "^async function
  checkThetaCallableCallSurface\|^export async function
  checkInvokeStaticResolution"`: 933 and 1515 respectively — the
  `.theta`-callable function is defined 582 lines before the invoke function
  in the current file.
- Ran `git show 4a31825f -- src/extension/invoke-static-checks.ts` and
  confirmed the two "...above" comments were removed from one position and
  reinserted at another with byte-identical text (diff shows old lines
  230/262 removed, new lines 50/82 added with the same wording) — i.e. the
  Seam A commit moved the surrounding code but not the words.
- Ran `git blame -L 1658,1666` and `git blame -L 1683,1690` on the current
  file: both blocks are attributed to commits `a314ac839` (2026-08-05) and
  `8dd418b96` (2026-08-23), both predating `4a31825f` (2026-09-14) and
  untouched by it — confirming these two comments were correct when written
  and became stale only once the sibling code moved out from under them.
- Re-ran a whole-file `above`/`below` search (~35 hits) and manually checked
  every other hit not cited above: each remaining one either references an
  adjacent `switch`/`case` arm a few lines away inside the same function (the
  move never touched those), or is a forward reference from a doc comment
  (e.g. `collectProvableArgTypes`'s "all consumers below") to code that is
  still, in fact, further down the same file — none of the others describes a
  cross-function relationship Seam A inverted.
- Checked `quality/issues/`, `quality/resolved/`, `quality/intake/`, and this
  wave's do-not-refile list: no filed finding names this four-site
  above/below inversion. A prior wave's own review log
  (`qw20260916045442`, D2 shard-02 entry) records this exact candidate as
  drafted but never persisted to disk after a tool outage, and explicitly
  invites a later wave to refile it; no PTQ number was ever minted for it.
- Not a deadness claim: both functions, and every line of code the four
  comments describe, are live production code reached from the exported
  `checkInvokeStaticResolution`.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — both function positions (933/1515, 582 lines apart) and all four excerpts verified verbatim; git show 4a31825f and git blame (a314ac839/8dd418b96) reproduce the historical-correct/now-inverted narrative exactly, down to the diff's own line numbers (50/82 added vs. 230/262 removed); dedupe search confirms no existing PTQ/intake file covers this (candidate misattributes the earlier lost draft to wave qw20260916045442 D2 shard-02, which records a different lost candidate — the real one is qw20260914130212 D2 shard-02 — but the "never persisted, no PTQ minted" conclusion still holds) (triage: claude-opus-5)
