---
id: PTQ-1673
title: match-pattern head first-letter case is tested by an inline `/^[A-Z]/` regex while the other six enforcement positions call the shared `isTypeLikeName` guard
lens: D1
status: open
verdict: confirmed
locations:
  - src/parser/body-parser.ts:2722-2731
  - src/parser/body-parser.ts:1066-1074
  - src/lexer/name-case.ts:3-19
  - src/lexer/contextual-checks.ts:219
  - src/parser/frontmatter-params.ts:188
  - src/parser/schema-body-parser.ts:641
  - src/parser/type-compat.ts:167
  - src/parser/type-walk.ts:374
sites: 8
fix_scope: module
d1_class: divergent-solutions
wave: qw20260928124659
reported_by: lens-d1-design (anthropic/claude-fable-5-1)
date: 2026-09-28
triaged_at: 7d0a52af49422fb4ce69fba3a62007fdfaf35a3e
---

# match-pattern head first-letter case is tested by an inline `/^[A-Z]/` regex while the other six enforcement positions call the shared `isTypeLikeName` guard

## Observation
lexical.md:14-16 states one first-letter case rule and says that "Inside `match` patterns the same first-letter rule then disambiguates". Six production positions enforce that rule through `isTypeLikeName` (src/lexer/name-case.ts), whose header calls itself "the ONE copy of the guard every enforcement position asks". The seventh position — the bare `match`-pattern head in `BodyParser.parsePattern` — enforces the same rule with an inline regex `/^[A-Z]/.test(t.text)` (body-parser.ts:2724), in the same file that imports and uses `isTypeLikeName` at :1073. The two mechanisms agree today (both are ASCII `A`–`Z` first-character tests); the divergence is in mechanism, not verdict.

## Evidence
Way 1 — the shared guard, src/lexer/name-case.ts:3-19 (re-read before filing):
```ts
/**
 * Whether `name` starts with an uppercase ASCII letter — the lexical.md:15
 * first-letter rule that separates a type-like name (a `schema` / `enum` /
 * type-like binding, PascalCase) from a value binding (lowercase-first or
 * `_`). This is the ONE copy of the guard every enforcement position asks —
 * `contextualDiagnostics` (./contextual-checks), the `fn` parameter and
 * schema-field checks (../parser/body-parser, ../parser/schema-body-parser), the `params:` key check
 * (../parser/frontmatter-params), the inline object-type field check
 * (../parser/type-walk), and the `resolveNamed` read seam
 * (../parser/type-compat) — so the lexer, the parsers, and the compatibility
 * engine agree on the classification by construction rather than by mirrored
 * two-comparison predicates.
 */
export function isTypeLikeName(name: string): boolean {
  const first = name[0] ?? "";
  return first >= "A" && first <= "Z";
}
```
Its six production call sites — `grep -rn "isTypeLikeName(" src --include=*.ts | grep -v "^\s*//\|\* "` → 7 hits (6 callers + the declaration), all pasted:
```
src/lexer/contextual-checks.ts:219:    const isUpper = isTypeLikeName(name.text);
src/lexer/name-case.ts:16:export function isTypeLikeName(name: string): boolean {
src/parser/body-parser.ts:1073:        if (isTypeLikeName(pTok.text)) {
src/parser/frontmatter-params.ts:188:      if (isTypeLikeName(name)) {
src/parser/schema-body-parser.ts:641:        if (isTypeLikeName(nameTok.text)) {
src/parser/type-compat.ts:167:  if (!isTypeLikeName(name)) {
src/parser/type-walk.ts:374:          if (isTypeLikeName(name)) {
```
The in-file caller, src/parser/body-parser.ts:1066-1074:
```ts
      } else if (pTok.kind === "ident") {
        // lexical.md §Identifiers requires lowercase-first for a `fn`
        // parameter name, and code-registry-parse.md's binding-case-mismatch
        // row already names the parameter position in its Trigger. The
        // predicate is the shared `isTypeLikeName` guard (lexer/name-case),
        // the same one `checkName`'s binding arm asks, so the rule keeps one
        // implementation across every position it is enforced at.
        if (isTypeLikeName(pTok.text)) {
          this.diagnostics.push({
```

Way 2 — the inline regex, src/parser/body-parser.ts:2722-2731:
```ts
      if (t.kind === "keyword") {
        this.diagnostics.push(reservedKeywordAsIdentifierDiagnostic(t.text, t.range, this.file));
      } else if (/^[A-Z]/.test(t.text)) {
        // A capitalised bare head names none of the admitted pattern
        // productions (expressions.md's disambiguation sentence assigns the
        // binding reading to a LOWERCASE identifier only); refused here,
        // after the `(`/`{`-gated constructor and object arms above, so
        // those two real productions are unaffected (bug 0141 §Fix route 1).
        this.diagnostics.push(capitalisedPatternHeadDiagnostic(t.text, t.range, this.file));
      }
```
`grep -rn '\^\[A-Z\]' src extensions --include=*.ts` → 2 hits, both pasted (the first is an extension-id filter in the inventory audit, not the lexical rule):
```
src/extension/inventory-closure-audit.ts:777:      .filter((e) => !e.id.includes(".") || /^[A-Z]/.test(e.id))
src/parser/body-parser.ts:2724:      } else if (/^[A-Z]/.test(t.text)) {
```
`grep -rn 'first >= "A"' src --include=*.ts` → 1 hit: `src/lexer/name-case.ts:18:  return first >= "A" && first <= "Z";` — i.e. every two-comparison spelling has been folded into the guard; only the regex spelling remains outside it.

That the pattern head IS the same rule: docs/spec_topics/lexical.md:16 (verbatim) "Inside `match` patterns the same first-letter rule then disambiguates without ambiguity: a lowercase identifier introduces a fresh binding, an uppercase identifier refers to an existing schema, enum, or constructor in scope"; and src/parser/theta-document.ts:1520-1523 describes the diagnostic's trigger as "a bare `match` pattern head that is an `ident` token starting A–Z".

Drift that already happened (the demonstrated cost). `git log --format='%h %ad %s' --date=short -S'/^[A-Z]/.test(t.text)' -- src/parser/body-parser.ts src/parser/theta-document.ts` → 2 hits:
```
702a1f2e 2026-09-21 quality: qw20260921130057 fix d9/src__parser__theta-document.ts
2afc312e 2026-08-21 fix(bug-0141): refuse a capitalised bare match-pattern head — v0.146.0
```
The regex was minted by bug 0141 (2afc312e) and moved into body-parser.ts by 702a1f2e. PTQ-1422 (quality/resolved, D4 "PascalCase type-name guard re-derived in six production passes") was then fixed by commit 19516518 (2026-09-23), which created src/lexer/name-case.ts and migrated every `first >= "A" && first <= "Z"` site (`git log --format='%h %ad %s' --date=short -- src/lexer/name-case.ts` → `63cafb11 2026-09-28 …` and `19516518 2026-09-23 quality: qw20260923072108 fix src/parser`). That migration did not touch the regex site: `git show 19516518 -- src/parser/body-parser.ts | grep -n '\[A-Z\]'` → 0 hits (exit 1). PTQ-1422's own inventory was assembled by `grep -rn 'first >= "A" && first <= "Z"' src/` (its Triage note), which by construction cannot find a regex-spelled instance of the same rule — so the unification that declared itself "the ONE copy … every enforcement position asks" shipped with one position outside it. That is the mechanical cost of the two mechanisms: a maintainer who changes `isTypeLikeName` (or audits its callers) has no way to reach the pattern-head position, and the header's inventory omits it.

Self-inconsistency statement: no written rule mandates how the first-letter predicate is spelled; the anchor is self-inconsistency (one file, two mechanisms for one spec-stated rule) plus the cost above (a completed unification pass missed the differently-spelled site, leaving name-case.ts's "ONE copy" claim false).

## Why this is a problem
The same spec rule (lexical.md:14-16) is enforced by two mechanisms that must agree: a shared exported predicate that documents itself as the single implementation, and an inline regex in a file that already imports that predicate. The divergence has already defeated one repository-wide unification (PTQ-1422 / 19516518), whose grep-by-spelling inventory could not see the regex site. Any future change to the guard's semantics (e.g. widening beyond ASCII, or narrowing to exclude `_`-led names) would apply to six positions and silently not to the seventh, and name-case.ts's enumeration of "every enforcement position" would continue to omit it.

## Suggested direction (non-binding, optional)
Unproven hypothesis: the pattern-head test at body-parser.ts:2724 is the same predicate as `isTypeLikeName` and could ask it, with name-case.ts's header gaining the `parsePattern` position in its inventory. Whether the pattern-head position should instead be documented as a deliberately separate predicate is for the fix stage.

## False-positive check
- Injected clone map: no group covers body-parser.ts:2724 or :1073 (groups G001/G008/G034/G036/G044/G051 cover 1017-1042, 1156-1219, 2065-2074, 2308-2316, 2623-2633, 2761-2767, 2867-2881). A one-line regex vs a one-line function call is not a token clone; this is mechanism divergence.
- D9-affinity: not a wrong-home claim — the check belongs where `parsePattern` runs; the claim is about which predicate it asks.
- D2-deadness: both sides live — the regex site is reached by every bare capitalised pattern head in production parsing, and its diagnostic is witnessed: `grep -rln "capitalised-pattern-head" tests` → 12 files, first 10: tests/capitalised-bare-match-pattern-refusal.test.ts, tests/fn-arg-type-mismatch-wired.test.ts, tests/fn-param-name-case.test.ts, tests/live/capitalised-pattern-head-live-cell.test.ts, tests/live/match-pattern-increment-decrement-live-cell.test.ts, tests/live/par-for-body-return-live-cell.test.ts, tests/live/reserved-keyword-object-pattern-head-live-cell.test.ts, tests/match-pattern-increment-decrement.test.ts, tests/object-pattern-head-unresolved-refusal.test.ts, tests/reserved-keyword-object-pattern-head-refusal.test.ts (total 12). `isTypeLikeName` has the 6 production callers listed above.
- Prior filings: PTQ-1422 (resolved) covered six `first >= "A"` sites and its fix commit 19516518 demonstrably did not touch :2724 (0 hits above); no other quality/ record names `capitalised-pattern-head`, `2724`, or `^[A-Z]` in body-parser (`grep -rln "capitalised-pattern-head\|2724\|\^\[A-Z\]" quality/` → 4 hits, all D10/D9 records or state.json, none about this predicate).
- Export-style exemption: not applicable (divergent-solutions).
- Behaviour: both predicates return identical verdicts for every input today; no behaviour change is claimed or requested.
- Self-inconsistency statement: no written rule exists; the anchor is self-inconsistency plus the cost cited above.

## Triage
verdict: questionable — accounting verified; whether to unify (and to what) is a design decision for a human ruling: body-parser.ts:2724 `/^[A-Z]/.test(t.text)` and :1073 `isTypeLikeName(pTok.text)` reproduce verbatim, as does name-case.ts's "ONE copy … every enforcement position" header, which leaves out parsePattern. Every stated search reproduces: isTypeLikeName( gives 7 hits (6 callers plus the declaration), `^[A-Z]` gives 2, `first >= "A"` gives 1, git -S gives 2afc312e and 702a1f2e, `git show 19516518` | grep `[A-Z]` gives exit 1, and the capitalised-pattern-head grep over tests gives 12 files. The quality/ grep matches its stated 4 hits once this file, its wave notes and the later REVIEW_LOG row are excluded. clone-scan map on body-parser.ts lists G001/G008/G034/G036/G044/G051, and none of them covers :2724 or :1073. The cost is real: PTQ-1422 inventoried sites by grepping for the `first >= "A" && first <= "Z"` spelling, so its fix 19516518 never touched the regex site even though the header claims every position. lexical.md quote drift (at :18, not :16) is tolerated. No D2/D4/D8/D9 candidate or PTQ states this root cause (triage: claude-opus-5-5)
verdict: confirmed — RATIFIED: the bare match-pattern head asks the shared guard. In src/parser/body-parser.ts:2724 replace `/^[A-Z]/.test(t.text)` with `isTypeLikeName(t.text)` (module already imports it — :1073), keeping the surrounding bug-0141 comment and noting the predicate is the shared lexical.md first-letter guard. Add the parsePattern bare-head position to src/lexer/name-case.ts's header inventory (:3-19) so its "the ONE copy of the guard every enforcement position asks" claim becomes true (PTQ-1422's unification missed this spelling because its inventory grepped for the two-comparison form). Behaviour identical — both predicates are the same ASCII A–Z first-character test on every input.
