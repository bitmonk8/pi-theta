---
id: pending
title: BodyParser.parseQuery is 111 LOC recognising the `@<T>` / `@Ident` annotation capture and the backtick template capture as two sequential phases that share only `at` and `schema`
lens: D9
status: intake
verdict: pending
locations:
  - src/parser/body-parser.ts:3932-4042
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/parser/body-parser.ts#BodyParser.parseQuery
d9_band: justify
wave: qw20260923185337
reported_by: lens-d9-placement (anthropic/claude-opus-5-5)
date: 2026-09-23
---

# BodyParser.parseQuery is 111 LOC recognising the `@<T>` / `@Ident` annotation capture and the backtick template capture as two sequential phases that share only `at` and `schema`

## Observation
The wave structural map gives `BodyParser.parseQuery` at src/parser/body-parser.ts:3932-4042, 111 LOC, band justify (FN_BANDS justify = 100). The host file's header describes it as "Recursive-descent body parsing and token lookahead for the theta document seam". The method has one caller, `parsePrimary` at body-parser.ts:3160 (`if (t.text === "@") { return this.parseQuery(); }`). Its body runs four steps in order: it captures the optional response-schema annotation (the angle-bracket form with its own depth loop and the bug 0014 empty-annotation refusal, or the bare `@Ident` form), then scans the backtick template, then files the QRY-6 empty-template warning, then builds the `query` node. The annotation step's `parts`/`depth` locals are block-scoped. The template step declares a second, unrelated `parts` at function scope (line 3996).

## Evidence
Step inventory (line ranges re-read at HEAD. The LOC column sums to the map's 111):

| step | lines | LOC | locals read | locals written |
|---|---|---|---|---|
| S0 header: consume `@` | 3932-3933 | 2 | — | `at` |
| S1 annotation capture: `@<T>` angle-depth loop with inline-`ObjectType` routing, bug 0014 `theta/parse/empty-query-annotation`, bare `@Ident` arm (QRY-3 / query-forms.md §Explicit form, :55) | 3934-3995 | 62 | `at` (3983, diagnostic range) | `schema`; block-local `parts`, `depth`, `ann` |
| S2 template capture: backtick scan + raw-source slice | 3996-4019 | 24 | — | `parts` (second declaration), `openTick`, `closeTick`, `rawTemplate` |
| S3 QRY-6 empty-template warning | 4020-4034 | 15 | `openTick`, `closeTick`, `rawTemplate` | — |
| S4 node build | 4035-4042 | 8 | `schema`, `rawTemplate`, `at` | — |

Seam cost: only `at` (in) and `schema` (out) cross the S1 boundary. S1's `parts`/`depth` are declared inside the `if (this.isPunct("<"))` block (3943-3944), so S2-S4 cannot read them.

S1's angle-depth loop, src/parser/body-parser.ts:3941-3953:

```ts
    if (this.isPunct("<")) {
      this.advance(); // `<`
      const parts: string[] = [];
      let depth = 1;
      while (depth > 0 && !this.atEnd()) {
        if (this.isPunct("<")) {
          depth += 1;
        } else if (this.isPunct(">")) {
          depth -= 1;
          if (depth === 0) {
            this.advance();
            break;
          }
        } else if (this.isPunct("{")) {
```

S2's separate template scan, src/parser/body-parser.ts:3996-4007:

```ts
    const parts: string[] = [];
    let openTick: Token | null = null;
    let closeTick: Token | null = null;
    if (this.isPunct("`")) {
      openTick = this.advance(); // opening backtick
      while (!this.isPunct("`") && !this.atEnd()) {
        parts.push(this.advance().text);
      }
      if (this.isPunct("`")) {
        closeTick = this.advance(); // closing backtick
      }
    }
```

Line composition (counted over 3932-4042): 35 comment lines, 76 code lines.

## Why this is a problem
The justify band presumes breakdown unless a concrete keep-whole reason is found and recorded. Reasons considered:
- **One grammar production family.** This is the reason the previous wave used to keep the method whole (REVIEW_LOG qw20260922150013 shard-07, "query-forms.md QRY-3"). It fails on both counts. First, no grammar rule covers the query form: `grep -n "::=" docs/reference/grammar.md` lists no `@`/query production, and `grep -c "::=" docs/spec_topics/query/query-forms.md` gives 0. QRY-3 (query-forms.md:27) is the ascription-precedence rule, and it covers S1 alone. S3 answers a different clause, QRY-6 (query-forms.md:99). Second, the reason requires the routine to "call out for every sub-production already". S1's annotation capture is written inline, with its own depth counter. It does not call a sub-recogniser.
- **Single algorithm with shared local state.** Only 2 locals cross the S1 boundary (`at`, `schema`), well under the ≥ 6 bar. S2 even redeclares `parts`, which shows the two steps keep separate state.
- **Closed-enumeration dispatch.** Not applicable. The body is a fixed sequence of steps, not a switch or if-chain over a closed set.
- **Data-only.** No. The method builds one object literal (8 LOC) and the rest is scanning logic.
- **Generated code.** No. It is hand-written and cites bugs 0014 and 0228.
- **Strong reasons** (not needed in the justify band): the method is not in quality/exemptions.json, and neither `git log -S parseQueryAnnotation` nor `git log -S captureAngleAnnotation` returns anything, so no earlier split was reverted.

## Suggested direction (non-binding, optional)
These are unproven hypotheses; the human ratifies one.
- **Seam A:** move S1 (3934-3995, 62 LOC) into a private `parseQueryAnnotation(at: Token): string | null` on `BodyParser`. It moves no exported symbols and has 0/0 external importers; its only link back into the host is the one `at` parameter plus the cursor methods it already uses.
- **Seam B:** move only S1's angle-depth loop (3941-3964, 24 LOC) into a private angle-annotation capture helper that `parseInvoke`'s structurally similar `invoke<T>` loop (3788-3816) could also call. It moves no exported symbols and has 0/0 external importers. Whether those two loops count as a clone is a D4 question and is not claimed here.
- **Seam C:** none further identified yet.

## False-positive check
- **Band:** 111 LOC is in justify (100-199), taken from the wave map, not recounted by hand. Only the targeted ranges of this 4056-LOC file were read (3925-4048, 3776-3860, and the caller at 3160).
- **Reasons considered:** the list above, each with the evidence that defeats it.
- **Exemptions:** quality/exemptions.json has D9 keys only for binder-system-prompt#normaliseParamLineBreaks and package-discovery. There is no key for this host or file.
- **Generated code:** the method is hand-authored and cites bugs.
- **Spec mirror:** no grammar.md or query-forms.md production mirrors the method. The two steps map to two separate clauses (QRY-3 and QRY-6).
- **Dedupe:** the pending quality/intake/qw20260923145222-d9-01-body-parser-residual-strong.md is keyed on the whole file (`d9_host: src/parser/body-parser.ts`), not on this method. No issue or intake file carries `d9_host` `#BodyParser.parseQuery` (checked with `grep -rn parseQuery quality/issues quality/intake`, whose only hit is that file-level candidate's inventory table). PTQ-1282 is about type-layer-walk.ts's query arm, a different host.

## Triage
verdict: questionable — accounting verified: I re-ran size-scan map on a one-line manifest and got BodyParser.parseQuery 3932-4042, 111 LOC, band justify (FN_BANDS justify=100). The single caller is at :3160. The step boundaries (3933/3934/3995/3996/4019/4020/4034/4035) and both excerpts match verbatim, the rows add to 111, and 35 of the lines are comments. S1's parts/depth are block-scoped at 3943-3944, so only at and schema cross into S2-S4. The one-production reason fails: grammar.md has no `::=` for the query form, query-forms.md has 0, and S1 scans the `Type` interior inline rather than handing it to parseType. That means the earlier keep-whole calls (REVIEW_LOG :621/:893) are properly contested. No other reason applies: no closed enum, no 6-local shared state, not data or generated, not in exemptions.json (D9 keys are only binder-system-prompt and package-discovery), and both git -S searches return nothing. Not a duplicate: the pending body-parser residual intake and resolved PTQ-1280 are keyed on the whole file, not #BodyParser.parseQuery. Whether to extract and in what shape needs a human ruling (triage: claude-opus-5-5)
verdict: questionable — accounting verified; target shape needs a human ruling: I re-ran size-scan map on a one-line manifest and got parseQuery 3932-4042, 111 LOC, band justify (FN_BANDS justify=100, strong=200). The only caller is body-parser.ts:3160. Both excerpts and all step boundaries match verbatim. S1's parts/depth are block-scoped (3943-3944) and S2 redeclares `parts` at 3996, so only at and schema cross the seam, well short of the ≥6-shared-locals bar. There is no `::=` query production (grammar.md only lists "`@`...`` query templates" in prose at :425, and query-forms.md has 0). exemptions.json has no key for this host (D9 keys are binder-system-prompt and package-discovery only). `git log -S parseQueryAnnotation` finds nothing. No issue or intake carries `#BodyParser.parseQuery`. One inaccuracy: the claim that S1 "does not call a sub-recogniser" is overstated, because it delegates brace groups to consumeInlineObjectType (3960). It does still scan the angle interior inline rather than through parseType. So the one-production keep-whole reason is contested rather than refuted, and REVIEW_LOG :621/:893 kept this method whole. A human needs to settle that disagreement (triage: claude-opus-5-5)
