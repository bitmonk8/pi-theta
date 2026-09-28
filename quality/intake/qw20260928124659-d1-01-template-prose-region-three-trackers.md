---
id: pending
title: The "am I inside @`…` template prose" question is answered by three differently-shaped trackers — a char-level state machine in lexer.ts#scanTokens, a bare backtick toggle in contextual-checks.ts#contextualDiagnostics, and a span-building interpolation-depth walk in doc-comment-recovery.ts#templateProseLineSpans — and the toggle shape has already produced one bug (0411→0420) whose residual names the remaining copy
lens: D1
status: intake
verdict: pending
locations:
  - src/lexer/lexer.ts:220-224
  - src/lexer/lexer.ts:510-560
  - src/lexer/lexer.ts:776-791
  - src/lexer/contextual-checks.ts:245-270
  - src/parser/doc-comment-recovery.ts:120-131
  - src/parser/doc-comment-recovery.ts:155-183
  - docs/bugs/0411-doc-comment-scan-reads-template-prose.md:165-168
  - docs/bugs/0420-doc-comment-interp-line-exclusion-overreach.md:242-246
sites: 3
fix_scope: cross-module
d1_class: divergent-solutions
wave: qw20260928124659
reported_by: lens-d1-design (anthropic/claude-fable-5-1)
date: 2026-09-28
triaged_at: 7d0a52af49422fb4ce69fba3a62007fdfaf35a3e
---

# The "am I inside @`…` template prose" question is answered by three differently-shaped trackers — a char-level state machine in lexer.ts#scanTokens, a bare backtick toggle in contextual-checks.ts#contextualDiagnostics, and a span-building interpolation-depth walk in doc-comment-recovery.ts#templateProseLineSpans — and the toggle shape has already produced one bug (0411→0420) whose residual names the remaining copy

## Observation
Three production passes each need to know whether a position in a `.theta` body sits inside a `` @`…` `` query template's prose (where `//`, `/*`, `\`, `let`, `if`, `///` are text, not code) as opposed to code — including the `${…}` interpolation interiors that are code again. Each pass answers the question with its own mechanism. `scanTokens` (lexer.ts) keeps a `TemplateState` with `inTemplateProse` + `interpDepth` and treats a backtick inside an interpolation as ordinary punctuation. `contextualDiagnostics` (contextual-checks.ts) flips a single `inTemplateBody` boolean on every backtick punct token and suppresses the whole span, interpolation interiors included. `templateProseLineSpans` (doc-comment-recovery.ts) walks the same token stream, toggles only at `interpDepth === 0`, and additionally collects interpolation sub-spans so they are excluded from the prose region. The third tracker exists because the second tracker's shape was copied into the doc-comment scan by bug 0411's fix and then produced bug 0420; 0420's fix corrected the doc-comment copy only, and its Residuals item 1 names the contextual-checks copy as carrying "the same whole-span-vs-prose shape".

## Evidence

**Way 1 — char-level state machine, lexer.ts.** `src/lexer/lexer.ts:220-224` (re-read before filing):
```ts
interface TemplateState {
  inTemplateProse: boolean;
  interpDepth: number;
  templateOpenStart: Pos | null;
}
```
`src/lexer/lexer.ts:776-791`:
```ts
    advance();
    tokens.push({ kind: "punct", text: c, range: { start, end: pos() } });
    if (c === "`" && tmpl.interpDepth === 0) {
      // Opening backtick of a `@`...`` template. Only at top-level code: inside a
      // `${...}` interpolation a backtick is ordinary punctuation, matching the
      // parser, which stops its template walk at the first backtick token.
      tmpl.inTemplateProse = true;
      tmpl.templateOpenStart = start; // recovered if EOF arrives before the closing backtick
    } else if (tmpl.interpDepth > 0 && c === "{") {
      tmpl.interpDepth += 1;
    } else if (tmpl.interpDepth > 0 && c === "}") {
      tmpl.interpDepth -= 1;
      if (tmpl.interpDepth === 0) {
        tmpl.inTemplateProse = true; // interpolation closed — resume template prose
      }
    }
```
(`scanTemplateProse`, `src/lexer/lexer.ts:510-560`, is the prose-side half: it clears `inTemplateProse` on the closing backtick and on `${`, setting `interpDepth = 1`.)

**Way 2 — bare toggle over tokens, contextual-checks.ts.** `src/lexer/contextual-checks.ts:245-270`:
```ts
  // comment" — nor is it code). Backticks are template delimiters and always
  // pair, so a toggle tracks the template body; `${…}` interpolations sit inside
  // it and legitimately carry no control-header/declarator statement, so
  // suppressing the whole region is safe.
  let inTemplateBody = false;
  const braceRegions: BraceRegion[] = [];
  for (let k = 0; k < tokens.length; k += 1) {
    const t = tokens[k];
    if (t === undefined) {
      continue;
    }
    if (t.kind === "punct" && t.text === "`") {
      inTemplateBody = !inTemplateBody;
      continue;
    }
```
This toggle has no interpolation depth: a backtick token the scanner emitted as "ordinary punctuation" inside `${…}` (Way 1's comment) flips it, and `${…}` interiors are suppressed span-wide.

**Way 3 — span builder with interpolation depth, doc-comment-recovery.ts.** `src/parser/doc-comment-recovery.ts:155-183`:
```ts
  let openBacktick: Position | undefined;
  let interpDepth = 0;
  let interpOpen: Position | undefined;
  let prevTok: Token | undefined;
  for (const tok of tokens) {
    if (tok.kind === "punct" && tok.text === "`" && interpDepth === 0) {
      if (openBacktick === undefined) {
        openBacktick = tok.range.start;
      } else {
        templateLineSpans.push({ open: openBacktick, close: tok.range.start });
        openBacktick = undefined;
      }
    } else if (tok.kind === "punct" && tok.text === "{") {
      if (
        openBacktick !== undefined &&
        interpDepth === 0 &&
        prevTok?.kind === "punct" &&
        prevTok.text === "$"
      ) {
        interpDepth = 1;
        interpOpen = prevTok.range.start;
      } else if (interpDepth > 0) {
        interpDepth += 1;
      }
    } else if (tok.kind === "punct" && tok.text === "}" && interpDepth > 0) {
      interpDepth -= 1;
```
Its own header (`src/parser/doc-comment-recovery.ts:124-131`) describes the other two as the same toggle it copied:
```ts
  // prompt, not a comment); the lexer's own `inTemplateProse` and
  // `contextualDiagnostics`'s `inTemplateBody` both already toggle on backtick
  // puncts to skip template interiors, so this scan gets the same toggle over
  // the already-in-scope `tokens`. Backticks are template delimiters and
  // always pair (matching lexer.ts's own toggle) EXCEPT when lexed inside a
  // `${…}` interpolation, where a backtick is ordinary punctuation, not a
  // delimiter (lexer.ts) — so the toggle only fires at interpolation depth 0.
```

**Site count, both ways.** Search `grep -rln "inTemplateProse\|inTemplateBody\|interpDepth" src/` → 3 hits:
```
src/lexer/contextual-checks.ts
src/lexer/lexer.ts
src/parser/doc-comment-recovery.ts
```
Search `grep -rn 'text === "`"' src/ | grep -v "^src/lexer/lexer.ts"` → 3 hits (the third, body-parser.ts:2327, is the parser's value-position bare-template dispatch, not a prose tracker):
```
src/lexer/contextual-checks.ts:256:    if (t.kind === "punct" && t.text === "`") {
src/parser/body-parser.ts:2327:      if (t.text === "`") {
src/parser/doc-comment-recovery.ts:160:    if (tok.kind === "punct" && tok.text === "`" && interpDepth === 0) {
```
No shared helper is imported by any of the three: each declares its own state variables locally (excerpts above).

**Drift that already happened (the cost).** `docs/bugs/0411-doc-comment-scan-reads-template-prose.md:165-168` (§Fix option 1, the one adopted — Status fixed 0.411.0):
```
1. Build a template-line exclusion set from the lexer's token stream at the
   `scanDocComments` call site (`:1033`): walk `lex.tokens` toggling on
   backtick puncts (they always pair; `${…}` interpolations sit between), and
   mark every line whose content is inside a template body; skip those lines
```
That is Way 2's shape ("toggling on backtick puncts … `${…}` interpolations sit between"), reproduced for a new consumer. It was then filed as its own defect, `docs/bugs/0420-doc-comment-interp-line-exclusion-overreach.md:1` ("A column-1 `///` line inside a multi-line `${…}` interpolation loads cleanly and the line silently vanishes … where `lexical.md:24` pins that comments inside an interpolation 'behave exactly as in any other expression position'"), whose fix added interpolation tracking to the doc-comment copy only. Its residual, `docs/bugs/0420-…:242-246`:
```
- Residuals: 1. `src/lexer/lexer.ts` `inTemplateBody`
  (`contextualDiagnostics`) skips interpolation interiors span-wide — the same
  whole-span-vs-prose shape as this bug on a different surface, but with no
  demonstrated observable divergence (interior keyword misuse is refused by the
  main expression parse anyway) and outside 0420's §Affected; successor-report
  material only, not a blocker.
```
(The residual's pointer is itself stale: `inTemplateBody` now lives in `src/lexer/contextual-checks.ts`, per `git log --format='%h %ad %s' --date=short -S'inTemplateBody' -- src/lexer/` → 3 hits:
```
eed3cf39 2026-09-21 quality: qw20260921070027 fix d9/src__lexer__lexer.ts
679870ca 2026-08-22 fix(bug-0242): the reserved-keyword misfire faces stop drawing codes on correct tokens — v0.215.0
4d435eae 2026-07-04 fix(loom): don't flag control/declarator keywords inside @`...` template prose
```
) Search `grep -rn "inTemplateBody" docs/bugs/` → 2 hits:
```
docs/bugs/0411-doc-comment-scan-reads-template-prose.md:36:    prose characters) and `contextualDiagnostics`' `inTemplateBody` toggle.
docs/bugs/0420-doc-comment-interp-line-exclusion-overreach.md:242:- Residuals: 1. `src/lexer/lexer.ts` `inTemplateBody`
```

**Self-inconsistency statement.** No written rule exists for how template-prose regions are to be tracked; the anchor is self-inconsistency plus the cost cited above (bug 0411's fix copied the weakest tracker's shape and became bug 0420; 0420's fix produced a third shape rather than one, and its residual points at the remaining copy).

## Why this is a problem
Principle: one question, one answer. The three passes answer "is this position template prose?" with three mechanisms whose semantics differ on two inputs: (a) a backtick token lexed inside `${…}` — Way 1 and Way 3 leave prose state unchanged, Way 2 flips it and thereby misclassifies every following token in the file; (b) a `${…}` interpolation interior — Way 1 and Way 3 treat it as code, Way 2 suppresses it. Mechanically, a maintainer adding a fourth consumer (as 0411 did) has to pick one of three shapes to copy; the record shows the pick landed on the wrong one and cost a second bug report and fix cycle, and the same shape is still live at contextual-checks.ts:249-268 with a bug residual pointing at it under a now-wrong file name. Way 3's own header (doc-comment-recovery.ts:124-131) already describes the three as "the same toggle", which is a misread of Way 1 (a char-level state machine with an EOF-diagnostic obligation, not a token toggle) — evidence that the divergence is invisible to the people maintaining it.

## Suggested direction (non-binding, optional)
Unproven hypothesis: the two token-stream consumers (Ways 2 and 3) could be fed by one token-level region classifier — the depth-aware walk Way 3 already implements — exposing "prose / interpolation / code" per token or per span, so contextual-checks' suppression inherits interpolation awareness and the lexer's char-level state machine remains the sole char-level tracker (it must stay char-level because it decides what becomes a token). Whether the contextual-checks suppression should keep skipping interpolation interiors is a behavioural question this finding does not decide.

## False-positive check
- **Injected clone map:** no group covers any of the three sites (G033 is the `reservedKeywords`/`trailingTriggers` set-literal pair; no group lists contextual-checks.ts:245-270, lexer.ts:776-791, or doc-comment-recovery.ts). The three are not token-similar: a 3-line boolean toggle, a 25-line char-level state machine over `TemplateState`, and a 60-line span builder over `Position` pairs — mechanism-shaped, not copy-shaped. Prior D8 review notes (REVIEW_LOG 2026-09-22 shard-01, 2026-09-23 shard-03) routed "three independent backtick template-toggle walks" to D4; no D4 filing exists (`grep -rln "inTemplateBody\|templateProseLineSpans\|inTemplateProse" quality/` → hits only in D9 resolved files PTQ-1156/1166/1167/1264/1278 and review notes, none of which files this divergence), and the divergence is one of mechanism, so it is filed here under D1.
- **D9-affinity check:** not a wrong-home claim — each tracker sits with its consumer (scanner, contextual checks, doc-comment scan); the claim is that three mechanisms exist, not that one is misplaced.
- **D2-deadness check:** all three are live in production: `scanTokens` is `lexTheta`'s tokeniser (lexer.ts:112), `contextualDiagnostics` is called at lexer.ts:114, `templateProseLineSpans` is imported and called at `src/parser/theta-document.ts:107` and `:227` (`grep -rn "templateProseLineSpans" src/ | grep -v doc-comment-recovery.ts` → 2 hits, both theta-document.ts).
- **Export-style exemption:** not applicable (divergent-solutions, no contract-width claim).
- **Prior filings:** PTQ-1167/PTQ-1278 (scanTokens D9 breakdown) and PTQ-1156/1166/1264 (theta-document D9) are size filings whose fixes moved code; none addressed tracker unification (their Observation sections concern LOC/phase counts). Bug 0420's residual explicitly defers this to "successor-report material".
- **Self-inconsistency statement:** no written rule exists; the anchor is self-inconsistency plus the cost cited above.

## Triage
verdict: questionable — accounting verified; whether to unify (and to what) is a design decision for a human ruling. All three ways match at their cited lines: TemplateState at lexer.ts:220-224, the depth-0 backtick/interp arms at :776-791 and scanTemplateProse at :510-560; the bare `inTemplateBody = !inTemplateBody` toggle with no depth at contextual-checks.ts:249-259; the depth-gated span walk at doc-comment-recovery.ts:155-183, with its header at :124-131. Every stated search reproduces verbatim: 3 files; 3 backtick hits including body-parser.ts:2327; git -S gives eed3cf39/679870ca/4d435eae; 2 docs/bugs hits. clone-scan map for lexer.ts lists only G033 (continuation.ts:15-27 vs lexer.ts:156-169), so no clone group covers this. The cost is real: 0411 §Fix option 1 (:165-168) prescribes the backtick-toggle shape, 0411:36 cites the inTemplateBody toggle, 0420 was filed against the overreach, and 0420:242-246's residual names inTemplateBody under the stale path src/lexer/lexer.ts (it lives only in contextual-checks.ts). All three are live: theta-document.ts:107/:227 call the doc-comment walk. No duplicate in intake or issues; the qry17 D1 intake explicitly calls itself a different root cause. reported_by matches (triage: claude-opus-5-5)
