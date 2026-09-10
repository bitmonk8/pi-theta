---
id: pending
title: resolveSubagentSessionConfigAt is a same-signature wrapper whose body forwards its two parameters unchanged to resolveSubagentSessionConfig
lens: D2
status: intake
verdict: pending
locations:
  - src/parser/theta-document.ts:1486-1500
  - src/parser/theta-document.ts:1433-1436
  - src/extension/import-static-checks.ts:437
sites: 1
fix_scope: module
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# resolveSubagentSessionConfigAt is a same-signature wrapper whose body forwards its two parameters unchanged to resolveSubagentSessionConfig

## Observation
`resolveSubagentSessionConfigAt` is exported from theta-document.ts. Its body is
a single `return` that forwards both parameters, in order, to the module-private
`resolveSubagentSessionConfig`. The two functions have identical parameter types
and identical return types; the only differences are the exported name and the
parameter spelling (`frontmatter` vs `callingFrontmatter`). The wrapper's own
doc comment closes with the statement that for an in-file `subagent fn` "this is
identical to the parse-time resolution".

## Evidence
src/parser/theta-document.ts:1486-1500 — the wrapper, doc and body:

```ts
/**
 * Re-resolve a `subagent fn`'s session config against a DIFFERENT enclosing
 * frontmatter than the one it was parsed under (RFC 0001 FN-9). A `.thetalib`
 * helper has no frontmatter of its own, so its `model` / `tools` /
 * `tool_loop` / `respond_repair` inheritance resolves against the CALLING
 * theta's frontmatter at dispatch time; its `with { … }` overrides still apply
 * on top. For an in-file `subagent fn` (parse-time frontmatter already the
 * enclosing theta's) this is identical to the parse-time resolution.
 */
export function resolveSubagentSessionConfigAt(
  fn: FnDecl,
  callingFrontmatter: ParsedFrontmatter | null,
): SubagentSessionConfig {
  return resolveSubagentSessionConfig(fn, callingFrontmatter);
}
```

src/parser/theta-document.ts:1433-1436 — the wrapped function's signature, which
matches parameter-for-parameter:

```ts
function resolveSubagentSessionConfig(
  fn: FnDecl,
  frontmatter: ParsedFrontmatter | null,
): SubagentSessionConfig {
```

src/extension/import-static-checks.ts:437 — the sole production caller of the
wrapper, which passes exactly the two forwarded arguments:

```ts
              sessionConfig: resolveSubagentSessionConfigAt(stmt, callingFrontmatter),
```

## Why this is a problem
A pass-through wrapper that adds no behaviour: no argument transformation, no
default, no narrowing, no ordering change, no additional work before or after
the call. It exists only to make the module-private function reachable under a
second name, so every reader of the FN-9 call site has one extra hop to walk
before reaching the code that actually resolves the config, and the two doc
blocks (1423-1432 and 1486-1494) restate overlapping halves of the same
inheritance rule at two places that must now be kept in step.

## Suggested direction (non-binding, optional)
One name for one behaviour — either export `resolveSubagentSessionConfig`
directly and have the FN-9 call site use it, or keep the FN-9 spelling as the
single exported entry and let the parse-time site call it.

## False-positive check
- Identifier search across production and tests: `grep -rn
  "resolveSubagentSessionConfigAt" src extensions tools tests --include=*.ts` →
  the definition (theta-document.ts:1495), one prose mention (1431), one
  production import + call (import-static-checks.ts:82, :437), and three test
  references (tests/subagent-fn.test.ts:8, :1309, :1331). Test callers do not
  make it dead and this finding does not claim it is dead — the claim is that
  its body adds nothing.
- Callers of the wrapped function: `grep -n "resolveSubagentSessionConfig(" 
  src/parser/theta-document.ts` → 1433 (definition), 1418 (inside
  `attachSubagentSessionConfigs`), 1499 (inside the wrapper). No other caller.
- String-keyed / dynamic access: `grep -rn "\"resolveSubagentSessionConfigAt\""
  src extensions tools tests --include=*.ts` → no hits.
- Re-exports: src/parser has no barrel file (`ls src/parser` lists leaf modules
  only), so the export reaches consumers only through the direct import above.
- Verified the bodies are not divergent: `resolveSubagentSessionConfig`
  (1433-1484) reads only its two parameters, and the wrapper passes both
  through in the same order with no pre- or post-processing.

## Triage

verdict: questionable — wrapper reproduces verbatim at :1486-1500 as a pure two-arg forward to :1433 (identical param/return types, sole production caller import-static-checks.ts:437, no barrel/re-export/dynamic access), but it is live not dead and the anchor is simplicity taste: `...At` is the deliberately documented FN-9 dispatch-time seam the tests bind to (subagent-fn.test.ts:1289 "the offline seam for the FN-9 obligation") and collapsing it merges two distinct RFC doc blocks, so a human should rule (triage: claude-opus-5)

verdict: questionable — independently re-verified (the note above was never recorded in TRIAGE_LOG/state.json): every excerpt reproduces with ~80-line drift (wrapper now theta-document.ts:1566-1580, wrapped fn :1513-1564, parse-time caller :1499; import-static-checks.ts:82/:437 exact), the reference hunt reproduces (one production caller, tests/subagent-fn.test.ts:8/1289/1309/1331, no string-keyed access, no barrel or re-export), and the body has been this exact two-arg forward in all 91 historical versions since birth in 645bcb02 — so it is live, never-divergent and deliberately named rather than dead code, a vestige, or landed scaffolding; the sole anchor is indirection taste ("one extra hop"), the two doc blocks are complementary FN-7/FN-9 halves with an explicit cross-reference rather than copies, and the test header binds to `...At` by name as "the offline seam for the FN-9 obligation", so a human should weigh the 6-line hop against the named-seam value (triage: claude-opus-5)

verdict: questionable — third independent pass, same conclusion: every excerpt still reproduces at current drift (wrapper theta-document.ts:1551-1565, wrapped fn signature :1498-1501, sole production caller import-static-checks.ts:431 with import at :82; tests/subagent-fn.test.ts:8/1288/1308/1330 call it directly) and both prior git-history claims independently reproduce — `git log -S resolveSubagentSessionConfigAt -- theta-document.ts` returns exactly one commit (645bcb02, the birth), and `git log 645bcb02..HEAD -- theta-document.ts` is exactly 91 commits, so the identifier's presence never toggled across the file's whole revision history since introduction; no string-keyed/dynamic access, barrel, or re-export exists anywhere in the tree (checked including dist/.pi/tmp). The body is a verified pure two-arg forward with matching types, but it is live (production + direct test callers), never diverged, and its only distinguishing fact is the documented FN-9 dispatch-time re-resolution seam (parse-time fn resolves the on-file frontmatter; the export re-resolves against the CALLING theta for cross-file `.thetalib` dispatch) that the test file names by identifier as "the offline seam for the FN-9 obligation" (:1290) — no dead code, no vestige, no stranded scaffolding, so the "one extra hop" complaint is indirection taste per the anchor rule, not a mechanically-proven D2 defect; concur with both prior passes (triage: claude-opus-5)

verdict: questionable — fourth independent pass, same result: every excerpt reproduces at current HEAD (wrapper theta-document.ts:1560-1564 doc+body, wrapped fn signature :1498, sole production caller import-static-checks.ts:431 with import at :82, tests/subagent-fn.test.ts:8/1288/1308/1330 calling it directly), `git log -S resolveSubagentSessionConfigAt -- theta-document.ts` returns exactly the one introducing commit 645bcb02 with 91 commits touching the file since and no re-toggle, and no barrel/re-export/string-keyed/dynamic access exists; the body is confirmed a verbatim pure two-arg forward, but the export is live (production + direct test callers) and is the named, documented FN-9 dispatch-time re-resolution seam (cross-referenced from the FN-7 doc block, not duplicated), so the "one extra hop" complaint is indirection/naming taste rather than proven dead code, a demonstrated vestige, or stranded scaffolding — concur with all three prior passes (triage: claude-opus-5)
