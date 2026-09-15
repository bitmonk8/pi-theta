---
id: PTQ-0339
title: import-static-checks.ts's resolvedLibs doc comment cites imports.md:19, a blank line, for its "../lib" path example
lens: D2                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/import-static-checks.ts:536-545
  - docs/spec_topics/imports.md:19
  - docs/spec_topics/imports.md:22
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260914130212
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-14
---

# import-static-checks.ts's resolvedLibs doc comment cites imports.md:19, a blank line, for its "../lib" path example

## Observation
The `ThetaImportCheck.resolvedLibs` doc comment cites `imports.md:19` as the
"blessed form" for a `.thetalib` resolving outside every discovery root via a
`../lib/x.thetalib`-shaped relative path. Document line 19 of
`docs/spec_topics/imports.md` is blank. The passage that actually gives this
example — the **Path resolution** paragraph's `"../lib/schemas.thetalib"`
literal — is three lines further down, at line 22.

## Evidence
src/extension/import-static-checks.ts:536-545 — the doc comment and its
citation:
```ts
  /**
   * Bug 0312: every `.thetalib` resolved path this theta's transitive import
   * walk reached (`walked` below) — the SAME closure IMP-5's cycle check and
   * the re-export fixpoint already traverse, surfaced so a caller can widen a
   * watch set to cover a `.thetalib` that resolves outside every discovery
   * root (`../lib/x.thetalib`, imports.md:19's blessed form). Empty for a
   * theta with no top-level `import` or no source path, matching `imports`
   * and `diagnostics` in that case.
   */
  readonly resolvedLibs: readonly string[];
```

docs/spec_topics/imports.md:17-22 — lines 17-21 (via
`grep -n "" docs/spec_topics/imports.md | sed -n '17,22p'`), showing line 19
blank and the real `"../lib/schemas.thetalib"` example at line 22:
```md
17:- May call `invoke(...)`. [...]
18:- May declare a `subagent fn` (theta 1.2; [Functions — FN-9](./functions.md#fn-9)). [...]
19:
20:**Import placement.** An `import … from` statement nested inside any non-top-level statement position [...]
21:
22:**Path resolution.** theta 1.0 supports relative paths only: `"./shared/personas.thetalib"`, `"../lib/schemas.thetalib"`. [...]
```

## Why this is a problem
The comment names a specific line to ground its `../lib/x.thetalib` example
in the spec's own wording ("imports.md:19's blessed form"), so a reader
checking the claim opens an empty line instead of the paragraph that actually
states the example (`"../lib/schemas.thetalib"`, three lines later at line
22). `grep -n "\.\./lib" docs/spec_topics/imports.md` confirms this
`../lib/...`-shaped path literal occurs exactly once in the whole document,
at line 22, so there is no ambiguity about which passage the comment means to
cite.

## Suggested direction (non-binding, optional)
Update the citation from `imports.md:19` to `imports.md:22`.

## False-positive check
- Read `docs/spec_topics/imports.md` lines 17-22 directly and confirmed line
  19 is blank.
- `grep -n "\.\./lib" docs/spec_topics/imports.md`: exactly one hit, line 22
  — ruling out a second, closer candidate passage the citation might have
  intended instead.
- Searched the intake/issues/resolved topic list for a prior filing on this
  citation or on `resolvedLibs`'s doc comment — no match.
- This is a citation-accuracy claim, not a deadness claim: `resolvedLibs` is
  live (assigned at the function's return statement and read by callers per
  the field's own "Bug 0312" note), and this finding does not touch that.

## Triage
verdict: confirmed — re-verified verbatim: import-static-checks.ts:536-545's resolvedLibs doc comment cites imports.md:19 as the "../lib" blessed-form example, but line 19 is blank and the sole `"../lib/schemas.thetalib"` example in the repo's one imports.md is at line 22 (grep confirms exactly one `\.\./lib` hit); no prior filing tracks this citation, matching the established citations-drifted precedent (PTQ-0026/0074/0109). (triage: claude-opus-5)
