---
id: pending
title: The leading `---` frontmatter fence is recognised by two scanners with different edge semantics — `splitFrontmatter` on the only production path and `extractFrontmatterBlock` behind `parseFrontmatter`'s `string` arm, which only the test helper reaches
lens: D1
status: intake
verdict: pending
locations:
  - src/parser/doc-comment-recovery.ts:22-64
  - src/parser/frontmatter-yaml.ts:25-42
  - src/parser/frontmatter.ts:980-994
  - src/parser/theta-document.ts:188
  - src/parser/theta-document.ts:270
  - tests/helpers/e2e-s1.ts:71-77
sites: 4
fix_scope: cross-module
d1_class: divergent-solutions
wave: qw20260928124659
reported_by: lens-d1-design (anthropic/claude-fable-5-1)
date: 2026-09-28
triaged_at: 7d0a52af49422fb4ce69fba3a62007fdfaf35a3e
---

# The leading `---` frontmatter fence is recognised by two scanners with different edge semantics — `splitFrontmatter` on the only production path and `extractFrontmatterBlock` behind `parseFrontmatter`'s `string` arm, which only the test helper reaches

## Observation
`parseFrontmatter` accepts `source: string | FrontmatterBlock`. The `string` arm strips the fences with `extractFrontmatterBlock` (frontmatter-yaml.ts); the `FrontmatterBlock` arm takes a block already stripped by `splitFrontmatter` (doc-comment-recovery.ts). The two scanners answer the same question — where does the leading `---`-fenced YAML block start and end, and what does an unclosed fence mean — with different rules: `splitFrontmatter` skips leading blank lines before the opening fence and maps an unclosed fence to an empty block at `lineOffset: open + 1`; `extractFrontmatterBlock` requires the fence on line 0 and maps an unclosed fence (and a fence preceded by a blank line) to `undefined`. In production the block arm is the only one reached (`theta-document.ts:270` passes `split.frontmatter`); the `string` arm's sole caller is `tests/helpers/e2e-s1.ts:76`, through which nine test files parse frontmatter.

## Evidence
Way 1 — `splitFrontmatter`, the production scanner. src/parser/doc-comment-recovery.ts:26-34 (skips leading blank lines before the fence):
```ts
  const lines = text.split("\n");
  let open = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const t = (lines[i] ?? "").trim();
    if (t === "") {
      continue;
    }
    open = t === "---" ? i : -1;
    break;
  }
```
src/parser/doc-comment-recovery.ts:57-64 (unclosed fence → empty block; closed → block with `lineOffset: open + 1`):
```ts
    return {
      frontmatter: { yaml: "", lineOffset: open + 1 },
      bodyText: lines.map(() => "").join("\n"),
    };
  }
  const yaml = lines.slice(open + 1, close).join("\n");
  const bodyText = lines.map((l, i) => (i <= close ? "" : l)).join("\n");
  return { frontmatter: { yaml, lineOffset: open + 1 }, bodyText };
```

Way 2 — `extractFrontmatterBlock`, the `string`-arm scanner. src/parser/frontmatter-yaml.ts:31-42 (fence must be `lines[0]`; unclosed → `undefined`; `lineOffset` fixed at `1`):
```ts
function extractFrontmatterBlock(source: string): FrontmatterBlock | undefined {
  const lines = source.split("\n");
  if ((lines[0] ?? "").trim() !== FENCE) {
    return undefined;
  }
  for (let i = 1; i < lines.length; i += 1) {
    if ((lines[i] ?? "").trim() === FENCE) {
      return { yaml: lines.slice(1, i).join("\n"), lineOffset: 1 };
    }
  }
  return undefined;
}
```

The dispatch that keeps both alive. src/parser/frontmatter.ts:987-994:
```ts
export function parseFrontmatter(
  source: string | FrontmatterBlock,
  options: ParseFrontmatterOptions,
): FrontmatterParseResult {
  const { file, modelMatcher } = options;
  const diagnostics: Diagnostic[] = [];

  const block = typeof source === "string" ? extractFrontmatterBlock(source) : source;
```

Production caller (block arm only). src/parser/theta-document.ts:188 and :268-273:
```ts
  const split = splitFrontmatter(text);
```
```ts
  const frontmatterRefusedRanges = new Set<string>();
  if (split.frontmatter !== null) {
    const fm = parseFrontmatter(split.frontmatter, {
      file,
      modelMatcher: deps.modelMatcher,
      bodyTypes,
    });
```

The `string` arm's only caller. tests/helpers/e2e-s1.ts:71-77:
```ts
export function parseFrontmatterSource(
  source: string,
  matcher: ModelReferenceMatcher = resolvingMatcher,
  file = "test.theta",
): FrontmatterParseResult {
  return parseFrontmatter(source, { file, modelMatcher: matcher });
}
```

Searches (run this session):

`grep -rn "parseFrontmatter(" src/ extensions/ tools/` — 2 hits:
```
src/parser/frontmatter.ts:987:export function parseFrontmatter(
src/parser/theta-document.ts:270:    const fm = parseFrontmatter(split.frontmatter, {
```
`grep -rn "parseFrontmatter(" tests/` — 1 hit:
```
tests/helpers/e2e-s1.ts:76:  return parseFrontmatter(source, { file, modelMatcher: matcher });
```
`grep -rn "extractFrontmatterBlock" src/ extensions/ tools/ tests/` — 8 hits:
```
src/parser/doc-comment-recovery.ts:56:    // surface (see `extractFrontmatterBlock` in frontmatter.ts).
src/parser/frontmatter-yaml.ts:31:function extractFrontmatterBlock(source: string): FrontmatterBlock | undefined {
src/parser/frontmatter-yaml.ts:514:  extractFrontmatterBlock,
src/parser/frontmatter.ts:47:  extractFrontmatterBlock,
src/parser/frontmatter.ts:982: * `extractFrontmatterBlock`) or an already-extracted `FrontmatterBlock` — the
src/parser/frontmatter.ts:994:  const block = typeof source === "string" ? extractFrontmatterBlock(source) : source;
tests/tools-field-shape-refusal.test.ts:337: * `extractFrontmatterBlock` joins the fenced lines, so the parsed YAML has no
tests/tools-field-zero-entry-scalar-refusal.test.ts:266: * trailing newline (`extractFrontmatterBlock`, frontmatter.ts:331–341), parsed
```
`grep -rn "splitFrontmatter(" src/ extensions/ tools/ tests/` — 2 hits:
```
src/parser/doc-comment-recovery.ts:22:export function splitFrontmatter(text: string): {
src/parser/theta-document.ts:188:  const split = splitFrontmatter(text);
```
`grep -rln "parseFrontmatterSource\|parseFrontmatterLines" tests/` — 9 hits:
```
tests/b0491-frontmatter-thinking-pin.test.ts
tests/bind-context-transcript.test.ts
tests/e2e-s2-advisory-diagnostics.test.ts
tests/e2e-s2-frontmatter-fields.test.ts
tests/frontmatter-contract.test.ts
tests/frontmatter-tool-loop-respond-repair.test.ts
tests/helpers/e2e-s1.ts
tests/tools-field-shape-refusal.test.ts
tests/tools-field-zero-entry-scalar-refusal.test.ts
```

Counts both ways: producers of a fence decision — 2 scanners (`splitFrontmatter`, `extractFrontmatterBlock`); consumers — 1 production caller of the block arm (theta-document.ts:270), 0 production callers of the `string` arm, 1 test-helper caller of the `string` arm fanning out to 9 test files.

Divergence, mechanically: for a source whose first line is blank and whose second line is `---`, Way 1 yields a block (the theta's `mode:` is read; the theta can register) and Way 2 yields `undefined` (frontmatter.ts:994 → `block === undefined` → no `map` → `theta/load/missing-mode`). For an unclosed fence, Way 1 yields `{ yaml: "", lineOffset: open + 1 }` and Way 2 yields `undefined`; both end in `missing-mode`, but through different block shapes (`lineOffset` `open + 1` vs the `block?.lineOffset ?? 0` fallback at frontmatter.ts:1014).

Self-inconsistency statement: no written rule pins where fence recognition lives or whether one or two scanners may exist (docs/spec_topics/frontmatter.md is an 8-line contents page; PTQ-1231's triage recorded that it "pins no fence position or double extraction"); the anchor is self-inconsistency — two live scanners for one grammar with different edge rules — plus the cost below.

## Why this is a problem
Drift has already been recorded once: PTQ-1231 (resolved, D8) documented the same two scanners disagreeing on leading blank lines and unclosed fences, and the fix (commit c4967576) removed the strip-then-rewrap by adding the `FrontmatterBlock` arm to `parseFrontmatter` — but left the `string` arm and `extractFrontmatterBlock` in place, so the divergence PTQ-1231's Observation named ("The two scanners also disagree ...") is unchanged; what changed is who reaches each scanner. Today every production document is fenced by Way 1 and every `parseFrontmatterSource` / `parseFrontmatterLines` test is fenced by Way 2. The mechanical cost: a maintainer who edits fence semantics in `splitFrontmatter` (FM-4's unclosed-fence posture, or the leading-blank-line skip) sees the nine frontmatter test files continue to pass unchanged, because they never traverse that scanner; conversely, a test written through the string arm against a leading-blank-line or unclosed-fence document asserts a verdict (`missing-mode`) production does not produce for the same bytes. The comment at doc-comment-recovery.ts:56 already points readers to `extractFrontmatterBlock` "in frontmatter.ts" as the sibling surface for the same decision (it lives in frontmatter-yaml.ts), so the two are maintained as one grammar in prose while diverging in code.

## Suggested direction (non-binding, optional)
Unproven hypothesis: one scanner owns fence recognition — either `parseFrontmatter` drops the `string` arm and the test helper splits with `splitFrontmatter` first, or `extractFrontmatterBlock` becomes a thin adapter over `splitFrontmatter`'s rules — so production and the test helper decide "what is frontmatter" identically. The fix stage owns the choice.

## False-positive check
- Clone-map check: the injected clone map lists no group for src/parser/doc-comment-recovery.ts or src/parser/frontmatter-yaml.ts; the two bodies are mechanism-shaped (blank-skip vs line-0 test; empty-block vs `undefined`), not a token-level copy — no group covers this.
- D9-affinity check: not a wrong-home claim; both scanners sit beside their own consumers (`splitFrontmatter` next to the doc-comment line scan that reuses its body blanking, `extractFrontmatterBlock` beside `parseFrontmatter`'s YAML helpers). The claim is two rule-sets for one grammar, wherever they live.
- D2-deadness check: both sides live. `splitFrontmatter` has 1 production caller (theta-document.ts:188); `extractFrontmatterBlock` is reached through `parseFrontmatter`'s `string` arm from tests/helpers/e2e-s1.ts:76 (tests are callers, so it is not dead — and its liveness is exactly what keeps the second rule-set exercised).
- Prior-filing check: PTQ-1231 (quality/resolved) is the D8 strip-then-rewrap claim; I opened it and read its fix scope — the fix commit c4967576 changed `parseFrontmatter`'s signature to accept a block and rewired theta-document.ts, and did not touch `extractFrontmatterBlock` or `splitFrontmatter`'s rules. PTQ-1146 / PTQ-1164 / PTQ-1156 / PTQ-1166 (resolved D9) inventory these functions as members only. No intake/issue file names `splitFrontmatter` (`grep -rln "splitFrontmatter" quality/intake quality/issues` — 0 hits).
- Spec check: docs/spec_topics/frontmatter.md (8 lines) pins no fence position; the divergence is not adjudicated by a written rule, so it is not a D6 anchor question and no behaviour is asserted to be wrong here.
- Not a bug filing: this does not claim either scanner is incorrect; it records that two rule-sets exist and which callers reach which.

## Triage
verdict: questionable — accounting verified; whether to unify (and to what) is a design decision for a human ruling. All 5 stated searches reproduce line for line (parseFrontmatter( → frontmatter.ts:987 + theta-document.ts:270; tests → e2e-s1.ts:76 only; extractFrontmatterBlock 8 hits; splitFrontmatter( 2 hits; the helper grep gives 9 files, but that count includes tests/helpers/e2e-s1.ts, so 8 test files use the string arm, not nine). Both scanners match the cited lines: doc-comment-recovery.ts:26-34 skips leading blank lines and :57-64 turns an unclosed fence into an empty block with lineOffset open+1; frontmatter-yaml.ts:31-42 requires the fence on line 0 and returns undefined when the fence is unclosed. The dispatch is at frontmatter.ts:994, and production reaches only the block arm. clone-scan map on doc-comment-recovery.ts shows no clone groups, so this does not belong to D4. The cost is real: PTQ-1231 (resolved D8) recorded the same divergence and its direction said the rules should have one owner, but its fix c4967576 touched only frontmatter.ts and theta-document.ts, so extractFrontmatterBlock is unchanged. The eight string-arm test files never run splitFrontmatter. However, no current test asserts a leading-blank-line or unclosed-fence verdict through the string arm (the misread is prospective). This is not a duplicate of PTQ-1231: that root cause (strip then re-wrap) is gone, and no intake or issue filing names these scanners. It is not D2 either, because callers that are only tests do not make code dead (triage: claude-opus-5-5)

