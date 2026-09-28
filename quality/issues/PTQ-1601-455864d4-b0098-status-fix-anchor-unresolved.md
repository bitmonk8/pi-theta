---
id: PTQ-1601
title: "Bug 0098's Status line points at its shipped record through the in-page link `(#fix-xyz)`, but the record defines no `fix-xyz` anchor, so the link resolves to nothing"
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0098-nonstring-literal-union-emission-unspecified.md:3-7
  - docs/bugs/0098-nonstring-literal-union-emission-unspecified.md:658
  - docs/bugs/0078-cli-entries-not-resolved-by-thetapaths-schema.md:250
  - docs/bugs/0113-listtree-glob-universe-swallow-silent.md:903
sites: 1
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# Bug 0098's Status line points at its shipped record through the in-page link `(#fix-xyz)`, but the record defines no `fix-xyz` anchor, so the link resolves to nothing

## Observation
Bug 0098's Status line reads "fixed (0.252.0)" and sends the reader to `[§Fix (0.252.0)](#fix-xyz)` for the route adjudication and the shipped record. The document contains no `<a id="fix-xyz">` element. Its fix heading is `## Fix (0.252.0)` at `:658`, whose auto-generated slug is not `fix-xyz`. The two other records that use the `#fix-xyz` link (0078, 0113) each define the anchor explicitly with `<a id="fix-xyz"></a>` above their fix section. 0098 has the link without the anchor. The link was written by the fix commit 455864d4 itself and has never resolved.

## Evidence
Claim side, `docs/bugs/0098-nonstring-literal-union-emission-unspecified.md:3-7`:
```
- **Status:** fixed (0.252.0). §Fix disposition 1 landed: step 3 of
  `docs/spec_topics/schema-subset.md` gained the normative rule SUBS-3, which
  elects the bare `{ "enum": [...values...] }` emission the implementation
  already takes for a literal union that is not all strings. See
  [§Fix (0.252.0)](#fix-xyz) for the route adjudication and the shipped record.
```
The intended target, `:658`:
```
## Fix (0.252.0)
```
The sibling precedent, `docs/bugs/0078-cli-entries-not-resolved-by-thetapaths-schema.md:250` and `docs/bugs/0113-listtree-glob-universe-swallow-silent.md:903`:
```
<a id="fix-xyz"></a>
```

Searches (run this session):
- Anchor definitions in the record: `grep -noE '<a id="[^"]+"' docs/bugs/0098-*.md` → 0 hits.
- In-page links in the record: `grep -noE '\]\(#[^)]+\)' docs/bugs/0098-*.md` → 1 hit, `:7` `](#fix-xyz)`.
- Repo-wide: `grep -rn 'fix-xyz' docs` → 5 hits. 0078 has a link at `:5` and an anchor at `:250`. 0113 has a link at `:5` and an anchor at `:903`. 0098 has a link at `:7` and no anchor.
- History: `git log --oneline -S'fix-xyz' -- docs/bugs/0098-nonstring-literal-union-emission-unspecified.md` → `455864d4` (the 0.252.0 fix commit introduced the link). `git log --oneline -S'id="fix-xyz"' -- <same path>` → 0 commits (no anchor was ever added).
- Link/anchor gate: `grep -rln 'fix-xyz' tests tools` → 0, and `grep -rlnE 'slugify|githubSlug|headingSlug|anchorOf' tests tools` → 0. No test in the tree checks in-page anchors in `docs/bugs/`, so no gate enforces this.
- The record's witness itself resolves. `tests/nonstring-literal-union-emission-subs3.test.ts` exists (groups (a)-(h), `describe` at `:375`-`:755`), and the matrix row `docs/plan_topics/coverage-matrix.md:34` reads `| SUBS-1, SUBS-3 | \`V5f\` |`. Only the Status line's pointer to its own evidence section is affected.

## Why this is a problem
The Status line is the record's top-level claim, and it passes the reader to "the shipped record" through a link that goes nowhere. The evidence the claim rests on (§Fix (0.252.0), with its Gates and Verification) is present at `:658`, but the pointer to it does not resolve as written. This is the "anchor gone" case of a decayed pointer, on the record's own claim-to-evidence hop.

## Suggested direction (non-binding, optional)
Make the link resolve to `## Fix (0.252.0)` at `:658`. Records 0078 and 0113 do this with an explicit `<a id="fix-xyz"></a>` above the section.

## False-positive check
- Representations covered: the record's Status line (quoted); its anchor definitions (0) and in-page links (1); sibling records using the same link token (0078, 0113, both self-consistent); tests/tools for any anchor gate (0 hits). Coverage matrix and AGENTS.md gates are not involved in this pointer. CHANGELOG is not relevant to an in-page link.
- Not citation form: the citation-symbol-form gate and the grammar-cite sweeps police `path:line` / symbol citation shape, not in-page Markdown anchors. The searches above found no gate over `#…` fragments in `docs/bugs/`.
- Not a later deletion: `-S'id="fix-xyz"'` returns no commit for this file, so the anchor never existed.

## Triage
verdict: confirmed — reproduced: 0098:7 links `[§Fix (0.252.0)](#fix-xyz)`, the record has 0 `<a id=` anchors, and `fix-xyz` is not the slug of any heading. The only intended target is `## Fix (0.252.0)` at :658. The link text names it, so the earlier `## Fix` at :449 is not a candidate. `git log -S'fix-xyz'` shows only 455864d4, which introduced the link, and `-S'id="fix-xyz"'` finds 0 commits, so the anchor never existed. 0078:250 and 0113:903 each carry the explicit `<a id="fix-xyz"></a>` precedent. No test or tool gates in-page anchors, and no other intake file or PTQ tracks 0098 or 455864d4. Fix is a mechanical re-point: add the anchor above :658, wording untouched (triage: claude-opus-5-5)
