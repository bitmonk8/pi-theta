---
id: PTQ-1231
title: parseThetaDocument strips the frontmatter fences with its own splitFrontmatter scanner, then re-synthesises fake `---` fences at both parseFrontmatter call sites because extractFrontmatterBlock re-requires them
lens: D8
status: fixed
verdict: confirmed
locations:
  - src/parser/theta-document.ts:1404-1447
  - src/parser/theta-document.ts:222-223
  - src/parser/theta-document.ts:281-292
  - src/parser/frontmatter-yaml.ts:26-42
sites: 2
fix_scope: cross-module
d8_class: against-grain
d8_host: src/parser/theta-document.ts#splitFrontmatter
wave: qw20260921183818
reported_by: lens-d8-simplification (anthropic/claude-fable-5)
date: 2026-09-21
---

# parseThetaDocument strips the frontmatter fences with its own splitFrontmatter scanner, then re-synthesises fake `---` fences at both parseFrontmatter call sites because extractFrontmatterBlock re-requires them

## Observation
The production pipeline has two frontmatter fence scanners: `extractFrontmatterBlock` (frontmatter-yaml.ts:31-42, the one `parseFrontmatter` runs internally) and `splitFrontmatter` (theta-document.ts:1404-1447, a second hand-rolled fence scan that strips the fences and blanks the region). Because `splitFrontmatter` has already removed the fences, both production call sites of `parseFrontmatter` — the only two in src/ — reconstruct a fake fenced document (`` `---\n${split.frontmatterText}\n---` ``) so that `parseFrontmatter`'s internal `extractFrontmatterBlock` can strip them again. The in-code comment at the second site concedes the mismatch and a known line-number-shift residual it creates.

## Evidence
The documented intent of the internal scanner — src/parser/frontmatter-yaml.ts:26-31:
```ts
/**
 * Extract the leading `---`-fenced frontmatter block. Returns `undefined` when
 * the source has no opening fence or the opening fence is never closed — both
 * cases mean "no recognised frontmatter mapping", ...
 */
function extractFrontmatterBlock(source: string): FrontmatterBlock | undefined {
```
The fighting use — src/parser/theta-document.ts:281-292 (comment verbatim):
```ts
    // `splitFrontmatter` returns the frontmatter text with the `---` fences
    // stripped, but `parseFrontmatter` re-requires them (its
    // `extractFrontmatterBlock` matches a leading/closing `---` fence). Re-wrap
    // the block in fences so the frontmatter fields (`mode:` / `model:` / …)
    // actually parse; without this every fenced `.theta` yields `frontmatter:
    // null` and a spurious `theta/load/missing-mode`. The frontmatter line
    // numbers are block-relative for a fence at file line 0 — the common case;
    // a fence preceded by blank lines shifts them by the blank-line count,
    // which no current obligation asserts.
    const fm = parseFrontmatter(`---\n${split.frontmatterText}\n---`, {
```
Second re-wrap site — src/parser/theta-document.ts:222-223:
```ts
    const earlyFm = parseFrontmatter(`---\n${split.frontmatterText}\n---`, {
      file,
```
Grep `parseFrontmatter\(` across src/ hits exactly the definition (frontmatter.ts:1030) and these two synthesised-fence callers — so in production `extractFrontmatterBlock`'s fence scan only ever runs over text whose real fences were just removed and replaced with synthetic ones. The two scanners also disagree: `splitFrontmatter` skips leading blank lines before the opening fence and maps an unclosed fence to an EMPTY frontmatter block (FM-4 posture, theta-document.ts:1424-1443), while `extractFrontmatterBlock` requires the fence on line 0 and maps unclosed to `undefined` — differences the re-wrap papers over, and the source of the admitted line-shift residual quoted above ("a fence preceded by blank lines shifts them by the blank-line count").

## Why this is a problem
The extraction work is done, undone, and redone — per document, twice (the early param-names pass and the authoritative pass each rebuild the fenced string and re-strip it). Frontmatter diagnostics are computed in synthetic-document coordinates rather than file coordinates, which the comment itself records as an unasserted line-number shift whenever the fence is not at file line 0. And the fence grammar now lives in two scanners with divergent edge-case semantics (leading blanks, unclosed fence), so a change to either silently forks what counts as frontmatter between the splitter and the field parser.

## Suggested direction (non-binding, optional)
Unproven hypothesis: let `parseFrontmatter` (or a thin overload/option) accept the already-extracted block plus its line offset — the `FrontmatterBlock` shape `extractFrontmatterBlock` already produces — so `splitFrontmatter`'s output feeds it directly and the synthetic fences, the double strip, and the coordinate shift all disappear; the two scanners' edge-case semantics then have one owner. (The early full `parseFrontmatter` run at 222 existing only to read param field KEYS is a separate ordering concern, noted but not filed here.)

## False-positive check
Call-site census: grep shows the two synthesised-fence calls are parseFrontmatter's only production callers; tests calling it with genuinely-fenced sources are not affected by this accounting. Spec check: frontmatter.md pins the fence grammar and FM-4's unterminated-fence posture — both are behaviour of the extraction, not of where extraction happens; no clause requires extracting twice, so no `challenges_spec`. D2-precedent check: the re-wrap comment documents the mismatch, not a rationale for keeping two scanners — it names the workaround's necessity given the current signatures, which is the finding, not a design ruling. Duplicate check: PTQ-1156/PTQ-1166 (D9) inventory `splitFrontmatter` as one row of theta-document's concern list and PTQ-1146/PTQ-1164 cover frontmatter.ts's size; none files the strip-then-rewrap against-grain claim — cross-referenced, distinct d8 claim. No D8 exemption exists for this host; hosts straddle the shard boundary (frontmatter-yaml.ts is outside this shard's manifest) — the mechanism's caller side is fully in-shard.

## Triage
verdict: questionable — accounting verified at HEAD: both scanners are real (splitFrontmatter theta-document.ts:1404-1447 skips leading blank lines and maps an unclosed fence to `frontmatterText: ""`; extractFrontmatterBlock frontmatter-yaml.ts:31-42 requires the fence on line 0 and maps unclosed to `undefined`, doc-comment quote byte-exact at 26-30), `grep -rn "parseFrontmatter(" src/` hits exactly the definition (frontmatter.ts:1030) plus the two synthetic-fence callers (theta-document.ts:222, 288), so in production extractFrontmatterBlock's scan only ever runs over `---\n${split.frontmatterText}\n---` and parseFrontmatter derives `lineOffset` from that synthetic document (frontmatter.ts:1037-1058), which the re-wrap comment at 281-289 itself concedes as the blank-line coordinate shift; splitFrontmatter has one caller (194) and no other references in src/extensions/tools/tests; no D8 row for theta-document or frontmatter in quality/exemptions.json; docs/spec_topics/frontmatter.md (8 lines) pins no fence position or double extraction, and the named direction (feed the extracted block + offset in) drops no FM-4 behaviour, so no challenges_spec needed; dedupe clean — PTQ-1156/PTQ-1146/PTQ-1164/PTQ-1166 (all resolved D9) list splitFrontmatter/extractFrontmatterBlock only as inventory members, none files the strip-then-rewrap against-grain claim; D8 never confirms — whether parseFrontmatter grows a block-accepting entry or splitFrontmatter is folded into it is a design ruling (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-21): confirmed - D8 wave-1 batch ruling; triage equivalence verification trusted.
