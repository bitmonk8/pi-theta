---
id: pending
title: The QRY-17 `@`-template body grammar (escape pairs, `${…}` entry, closing backtick, EOF) is lexed by two mechanisms — `lexer.ts#scanTemplateProse` on the whole-file token path (consumes escape pairs verbatim, emits only the EOF row) and `query-render.ts#lexQueryTemplate` on the parser's raw-slice re-lex (resolves escapes and emits both QRY-17 rows into a `diagnostics` array none of its three src callers read) — so the row anchors live on the path production discards and the whole-file lexer re-emits the row it does fire as a literal
lens: D1
status: intake
verdict: pending
locations:
  - src/lexer/lexer.ts:510-553
  - src/lexer/lexer.ts:596-618
  - src/render/query-render.ts:163-256
  - src/parser/body-parser.ts:3173-3183
  - src/parser/theta-document.ts:1611
  - src/parser/type-layer-interpolation.ts:106
  - src/runtime/query-interpolation.ts:46-48
sites: 2
fix_scope: cross-module
d1_class: divergent-solutions
wave: qw20260928124659
reported_by: lens-d1-design (anthropic/claude-fable-5-1)
date: 2026-09-28
triaged_at: 7d0a52af49422fb4ce69fba3a62007fdfaf35a3e
---

# The QRY-17 `@`-template body grammar (escape pairs, `${…}` entry, closing backtick, EOF) is lexed by two mechanisms — `lexer.ts#scanTemplateProse` on the whole-file token path (consumes escape pairs verbatim, emits only the EOF row) and `query-render.ts#lexQueryTemplate` on the parser's raw-slice re-lex (resolves escapes and emits both QRY-17 rows into a `diagnostics` array none of its three src callers read) — so the row anchors live on the path production discards and the whole-file lexer re-emits the row it does fire as a literal

## Observation
A `` @`…` `` template body is scanned twice in production. First, the whole-file lexer's `scanTemplateProse` walks the prose region character by character: it tokenises only the backtick delimiters and the `${`/`}` entry, consumes any backslash pair verbatim with no diagnostic, and at EOF `emitUnterminatedTemplate` pushes `theta/parse/unterminated-template` with the code and message spelled as string literals. Second, `BodyParser.parseQuery` slices the verbatim body between the two backtick tokens (backticks excluded) into `QueryExpr.template`, and three src consumers re-lex that slice with `lexQueryTemplate` — the module that owns the exported QRY-17 code/message anchors, resolves the six recognised escapes, emits `theta/parse/illegal-template-escape` for any other pair, and emits `theta/parse/unterminated-template` when no closing backtick is seen. All three consumers read only `.parts`; the `diagnostics` and `terminated` members are read by no src caller. Because the slice never contains the closing backtick, `terminated` is `false` and an `unterminated-template` diagnostic is minted and discarded on every well-formed production call. Bug records 0122 and 0246 document both facts and the consequence (0246 added the whole-file emitter rather than routing the array; its §Non-goals leaves the escape row on the discarded path for "a separate adjudication").

## Evidence

Way A — the whole-file lexer. src/lexer/lexer.ts:510-536 (`scanTemplateProse`, escape pair consumed verbatim, no diagnostic):
```ts
function scanTemplateProse(
  cursor: ScannerCursor,
  sinks: ScannerSinks,
  tmpl: TemplateState,
): void {
  const { text, n, pos, advance } = cursor;
  const { tokens } = sinks;
  const c = text[cursor.i];
  if (c === "`") {
    // ...
  }
  if (c === "\\") {
    // A backslash escapes the next character in template prose (`\`` is a
    // literal backtick, `\$` suppresses interpolation); consume the pair so
    // an escaped backtick / `${` is never mistaken for a delimiter, mirroring
    // query-render.ts lexQueryTemplate. It is NOT a stray backslash.
    advance(); // the backslash
    if (cursor.i < n && text[cursor.i] !== undefined) {
      advance(); // the escaped character
    }
    return;
  }
```
src/lexer/lexer.ts:611-617 (`emitUnterminatedTemplate`, the row as literals, not the query-render anchors):
```ts
  sinks.diagnostics.push({
    severity: "error",
    code: "theta/parse/unterminated-template",
    file,
    range: { start: tmpl.templateOpenStart, end: cursor.pos() },
    message: "unterminated @\`...\` query template",
  });
```

The hand-off — src/parser/body-parser.ts:3173-3183 (the interior slice, backticks excluded):
```ts
    // Recover the verbatim template between the backticks from the raw body
    // source (the tokens are a lossy, space-joined view — they collapse the
    // author's spacing and drop interpolation braces). Fall back to the
    // space-joined tokens only when the raw slice is unavailable (no closing
    // backtick, or no body source threaded through).
    const rawTemplate =
      openTick !== null && closeTick !== null && this.bodyText.length > 0
        ? this.bodyText.slice(
            positionToOffset(this.bodyText, openTick.range.end),
            positionToOffset(this.bodyText, closeTick.range.start),
          )
        : parts.join(" ");
```

Way B — the re-lex. src/render/query-render.ts:163-177 and 244-256 (`lexQueryTemplate`: opening-backtick skip is conditional, closing backtick required for `terminated`):
```ts
export function lexQueryTemplate(source: string): QueryTemplateLexResult {
  const parts: QueryTemplatePart[] = [];
  const diagnostics: Diagnostic[] = [];
  let text = "";
  let terminated = false;
  // ...
  // Skip the opening backtick; `source` begins with it.
  let i = source[0] === "`" ? 1 : 0;
```
```ts
  flushText();

  if (!terminated) {
    diagnostics.push({
      severity: "error",
      code: UNTERMINATED_TEMPLATE_CODE,
      message: UNTERMINATED_TEMPLATE_MESSAGE,
    });
  }

  return { parts, diagnostics, terminated };
```
src/render/query-render.ts:208-218 (the escape row, emitted only here):
```ts
        default:
          // No other escapes are recognised (QRY-17): a backslash before any
          // other character is `theta/parse/illegal-template-escape`. Recovery
          // renders the offending character as literal content so the rest of
          // the body still lexes.
          diagnostics.push({
            severity: "error",
            code: ILLEGAL_TEMPLATE_ESCAPE_CODE,
            message: illegalTemplateEscapeMessage(next),
          });
          text += next;
```

Consumers of Way B, counted. `grep -rn "lexQueryTemplate(" src --include=*.ts | grep -v "^\S*:\s*\(//\|\*\)"` → 4 hits (3 callers + the definition), every caller reading `.parts` only:
```
src/parser/theta-document.ts:1611:  for (const part of lexQueryTemplate(e.template).parts) {
src/parser/type-layer-interpolation.ts:106:  for (const part of lexQueryTemplate(e.template).parts) {
src/render/query-render.ts:163:export function lexQueryTemplate(source: string): QueryTemplateLexResult {
src/runtime/query-interpolation.ts:46:  const lexed = lexQueryTemplate(expr.template);
```
(src/runtime/query-interpolation.ts:48 is `for (const part of lexed.parts) {`.) Readers of the result's other two members in src: `grep -rn "\.terminated\b\|terminated }" src --include=*.ts | grep -v "unterminated"` → 1 hit, the producer's own return:
```
src/render/query-render.ts:256:  return { parts, diagnostics, terminated };
```
Emission sites of the two QRY-17 rows across src — `grep -rn "theta/parse/unterminated-template\|theta/parse/illegal-template-escape\|UNTERMINATED_TEMPLATE_CODE\|ILLEGAL_TEMPLATE_ESCAPE_CODE" src --include=*.ts | grep -v "^\S*:\s*\(//\|\*\)"` → 8 hits:
```
src/lexer/lexer.ts:614:    code: "theta/parse/unterminated-template",
src/render/query-render.ts:70:/** `theta/parse/illegal-template-escape` (E). */
src/render/query-render.ts:71:export const ILLEGAL_TEMPLATE_ESCAPE_CODE = "theta/parse/illegal-template-escape";
src/render/query-render.ts:72:/** `theta/parse/unterminated-template` (E). */
src/render/query-render.ts:73:export const UNTERMINATED_TEMPLATE_CODE = "theta/parse/unterminated-template";
src/render/query-render.ts:86:/** Registry Message for `theta/parse/unterminated-template`. */
src/render/query-render.ts:215:            code: ILLEGAL_TEMPLATE_ESCAPE_CODE,
src/render/query-render.ts:251:      code: UNTERMINATED_TEMPLATE_CODE,
```
So: `unterminated-template` has two emitters (lexer.ts:614 on the read path, query-render.ts:251 on the discarded path); `illegal-template-escape` has one emitter, on the discarded path.

Drift that already happened (the demonstrated cost). docs/bugs/0122-template-interpolation-diagnostics-discarded.md:708-712 (§Non-goals):
```
- **`theta/parse/illegal-template-escape` and `theta/parse/unterminated-template`.**
  Measured silent at load and produced only by `lexQueryTemplate`, whose
  `diagnostics` array all three callers ignore. These are *template*-lex rows,
  not interpolation-expression rows: the fix surface is the template lex and its
  `terminated`-is-always-false call convention, not `parseExpressionSource`.
```
docs/bugs/0246-unterminated-query-template-registered-unfired.md:17-19 and :293-297:
```
  registry row already fixes as `lex`, must not route the existing
  `lexQueryTemplate` array (all three callers pass the interior slice, so
  `terminated` is `false` on every well-formed call — bug 0122 §Non-goals),
```
```
- **`theta/parse/illegal-template-escape`.** The second row discarded at the
  same three call sites (`query-render.ts:207–211`), measured silent here too
  (`` let _ = @`a \q b `` → `[]`). Its *Trigger* is a backslash pair inside a
  body, not EOF, and its fix surface is the caller convention rather than an
  EOF branch. Recorded as adjacent evidence; a separate adjudication.
```
and 0246's shipped fix, :496-497: "**`theta/parse/illegal-template-escape` stays unreachable** (§Non-goals): the second row discarded at the same three call sites is untouched".

Self-inconsistency statement: no written rule exists; the anchor is self-inconsistency (one QRY-17 grammar, two lexers, with the diagnostics-bearing lexer on the path whose diagnostics are structurally discarded and the reachable lexer re-spelling the row it fires) plus the cost cited above.

## Why this is a problem
The two scanners owe each other consistency: `scanTemplateProse`'s own comment says it consumes the escape pair "mirroring query-render.ts lexQueryTemplate" (lexer.ts:527-530), and the parser's raw-slice hand-off (body-parser.ts:3173-3183) exists precisely so the second lexer can re-derive what the first tokenised past. Mechanically, a maintainer who adds or removes a QRY-17 escape, or changes the recovery for an unrecognised pair, edits `lexQueryTemplate` — the module holding the exported anchors — and observes green unit tests (tests/query-render.test.ts drives `lexQueryTemplate` directly), while production emits nothing, because the array is discarded at all three consumers and the whole-file lexer has no escape classification at all. This is not hypothetical: 0122 measured both rows silent, 0246 discharged one of them by adding a second, literal-spelled emitter in lexer.ts rather than by connecting the anchored one, and recorded the other as still unreachable. A second concrete misread: `lexQueryTemplate`'s `terminated`/`unterminated` contract presumes a source that "begins with the opening backtick" (query-render.ts:176), but every production caller hands it the interior slice, so on every well-formed template the function fabricates an `unterminated-template` diagnostic that is then dropped — forwarding the array (the obvious fix a reader would reach for) would fire the row on every `@`-query in the corpus (0246 §Fix constraint 1).

## Suggested direction (non-binding, optional)
Unification hypothesis, unproven: one template-body lexer that the whole-file lexer either delegates to (handing it the delimited source, so `terminated` means what it says and its diagnostics ride `LexResult.diagnostics`) or that is the only place the QRY-17 escape classification lives, with `lexQueryTemplate`'s consumers receiving parts only. Which side should absorb the other, and whether the parser's raw-slice hand-off survives, is not shown here; the neighbouring D1 intake qw20260928124659-d1-01-template-prose-region-three-trackers.md (prose-region position tracking across lexer.ts / contextual-checks.ts / doc-comment-recovery.ts) is a different root cause and would be affected by any move of the prose scan.

## False-positive check
- Injected clone map: no group covers this (query-render.ts lists "(no clone groups)"; lexer.ts is out of shard; PTQ-1120's resolved G014 clone was the `${…}` brace-depth loop between system-interpolation.ts and query-render.ts, now shared via `scanInterpolationBody`, and is not this pair). The two scanners are mechanism-shaped — a stateful whole-file token scanner vs. a slice re-lexer producing parts — not token copies.
- D9-affinity check: not a wrong-home claim — the finding is that the QRY-17 body grammar is implemented twice on two paths with the diagnostics on the discarded one, not that either function sits in the wrong module.
- D2-deadness check: both sides live — `scanTemplateProse` runs on every `.theta` lex; `lexQueryTemplate` is entered from the three production callers above on every `@`-query (its `.parts` are load-bearing for QRY-18 rendering and the type-layer walks). The unread `diagnostics`/`terminated` members are a symptom cited here, not the root cause filed; a pure unread-return-member claim would be D2's (cf. PTQ-1446) and is routed there in the shard notes.
- Not a bug filing: the unreachable escape row is already recorded as a documented residual by bug 0246 §Non-goals / §Fix constraint 4 and bug 0122 §Non-goals; this filing names the design split that produces it and is not a report that the row should fire.
- Export-style exemption: not applicable (divergent-solutions).
- Prior filings: PTQ-1282 (D8, type-layer double lex) removed a duplicated `lexQueryTemplate` call inside type-layer-walk.ts and did not touch the two-lexer split; PTQ-1278/PTQ-1525 are D9/D8 filings on `scanTokens`/`scanStringLiteral` size and did not cover the template path; same-wave d1-01 (prose-region trackers) cites lexer.ts:510-560 as one of its three trackers but files position tracking, not escape/diagnostic lexing, and does not cite query-render.ts.
- Self-inconsistency statement: no written rule exists; the anchor is self-inconsistency plus the cost cited above.
- All excerpts re-read at HEAD immediately before filing; all searches run in this session with outputs pasted in full.

## Triage
verdict: questionable — accounting verified; whether to unify (and to what) is a design decision for a human ruling. All excerpts match at the cited lines: lexer.ts:510-553 scanTemplateProse and :611-617 with the literal-spelled row, query-render.ts:163-256, body-parser.ts:3173-3183 slicing between the backticks, and the three .parts-only callers. All three stated searches reproduce verbatim (4, 1 and 8 hits, same lines). clone-scan map for lexer.ts lists only G033 (continuation.ts), so no clone group covers this. The cost is real: 0122:708-712 and 0246:17-19, :293-297 and :496-497 exist as quoted, and 0246 shipped a second literal emitter while illegal-template-escape stays unreachable. tests/query-render.test.ts drives lexQueryTemplate directly (9 refs). No open or filed PTQ or intake states this root cause: d1-01 prose-trackers does not cite query-render, PTQ-1282 removed one double lex only, and PTQ-1120 is the brace-scan clone (triage: claude-opus-5-5)
