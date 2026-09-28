---
id: PTQ-1555
title: checkSubagentFnModelOverrides emits theta/load/model-unresolved with a hand-built message that departs from the registry template and skips the line-break normalisation the frontmatter emission site applies
lens: D6
status: open
verdict: confirmed
locations:
  - src/extension/subagent-fn-static-checks.ts:203-217
  - src/parser/frontmatter.ts:602-614
  - docs/spec_topics/diagnostics/code-registry-load.md:45
sites: 3
fix_scope: cross-module
d6_class: text-drift
d6_anchor: "DIAG-4 (docs/spec_topics/diagnostics/diagnostic-shape.md#diag-4) — theta/load/model-unresolved registry Message; bug 0105 line-break normalisation"
wave: qw20260928060032
reported_by: lens-d6-errorposture (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# checkSubagentFnModelOverrides emits theta/load/model-unresolved with a hand-built message that departs from the registry template and skips the line-break normalisation the frontmatter emission site applies

## Observation
Two production sites emit `theta/load/model-unresolved`: the frontmatter `model:` resolver in `src/parser/frontmatter.ts` and the RFC 0001 `with { model }` override check in `src/extension/subagent-fn-static-checks.ts`. The frontmatter site renders the registry *Message* template `theta 'model:' value '<value>' ...` and passes the bound value through `normaliseLiteralValueLineBreaks`. The `subagent fn` site hand-builds a different message, `subagent fn 'with { model }' value '<reference>' ...`, and interpolates the cooked string-literal value raw. The theta lexer decodes a `\n` escape to U+000A (src/lexer/lexer.ts:272), so `with { model: "a\nb" }` puts a raw line break into this code's `message`.

## Evidence
**Divergent side** (src/extension/subagent-fn-static-checks.ts:203-217):
```ts
    // The override string as resolved by the parser (parse already flagged a
    // non-string model value); absent ⇒ nothing further to validate here.
    const reference = fn.sessionConfig?.model;
    if (reference === undefined) {
      continue;
    }
    if (matcher.resolve(reference) !== "resolved") {
      diagnostics.push({
        severity: "error",
        code: "theta/load/model-unresolved",
        file,
        range: modelField.value.range,
        message: `subagent fn 'with { model }' value '${reference}' resolves to no available model, or is ambiguous across providers`,
      });
    }
```
`reference` is the cooked string-literal value. `stringExprValue` (src/parser/theta-document.ts:600-602) returns `expr.value` for a `string` expression, and the lexer lowers the `\n` escape at src/lexer/lexer.ts:272 (`value += "\n";`).

**Sibling side, same code** (src/parser/frontmatter.ts:602-614):
```ts
  const outcome = modelMatcher.resolve(modelRaw);
  if (outcome === "resolved") {
    return renderScalarValue(modelRaw);
  }
  diagnostics.push({
    severity: "error",
    code: "theta/load/model-unresolved",
    file,
    ...(modelRange !== undefined ? { range: modelRange } : {}),
    message: `theta 'model:' value '${normaliseLiteralValueLineBreaks(
      renderScalarValue(modelRaw),
    )}' resolves to no available model, or is ambiguous across providers`,
  });
```

**Registry row** (docs/spec_topics/diagnostics/code-registry-load.md:45). The *Message* cell is `` `theta 'model:' value '<value>' resolves to no available model, or is ambiguous across providers` ``. The row's Trigger prose covers "A theta `model:` field" only and documents no position-specific `with { model }` template. Command: `sed -n 45p docs/spec_topics/diagnostics/code-registry-load.md | grep -o "subagent\|with {[^}]*}"` → 0 hits.

**Why these are siblings.** Both sites resolve a model reference through the same injected `ModelReferenceMatcher` and fire the same registered code with the same severity on the same failure (no-match or ambiguous). FN-7 states that the override reuses the frontmatter field's diagnostic (docs/spec_topics/functions.md:71): "reuses those fields' diagnostics rather than coining parallel codes — `model` through `theta/load/model-unresolved`". The site's own doc comment (subagent-fn-static-checks.ts:180-191) says it emits "the identical `theta/load/model-unresolved` diagnostic".

**Anchors (quoted verbatim, opened this session):**
- DIAG-4 (docs/spec_topics/diagnostics/diagnostic-shape.md:74): "The *Message* column is normative. Every row in the registry tables carries a *Message* ...; renderers MUST emit it character-for-character with placeholders interpolated. Tests asserting a diagnostic's rendered message MUST source the string from this column ... A code reused across multiple emission positions carries exactly one *Message* cell, so a position-specific template that the *Message* cell cannot also hold MAY instead be documented in that row's *Trigger* column as prose-with-inline-code".
- docs/spec_topics/diagnostics/placeholder-rendering-b.md:76. It lists `theta/load/model-unresolved` among the parse-time literal-value rows and states: "Before that rendering, the bound text of every `theta/load/*` row in this list passes a line-break normalisation, because `message` is a single-line summary".
- Bug 0105 §Fix (0.217.0) (docs/bugs/0105-malformed-tool-entry-message-embeds-raw-newline.md:771-777) fixed the frontmatter side: "`src/parser/frontmatter.ts` — the transform wraps the `<value>` binding of ... `theta/load/model-unresolved` (at the message site only ...)". The same doc records the consumer that a raw break damages: the break "forges the `  hint: <hint>` continuation line or the `  <file>:<line>:<col>: <message>` related-site line that the serialised content format reserves" (title).

Searches run in this session:
- `grep -rn "\"theta/load/model-unresolved\"" src --include=*.ts` → 2 hits (subagent-fn-static-checks.ts:212, frontmatter.ts:608). Those are the whole emitter set.
- `grep -c "normaliseLiteralValueLineBreaks" src/extension/subagent-fn-static-checks.ts` → 0. `grep -rn "normaliseLiteralValueLineBreaks" src --include=*.ts | wc -l` → 34.
- `grep -rn "subagent fn 'with { model }'" tests` → 0 hits. No test pins the divergent text. The only witness, tests/subagent-fn.test.ts:1618-1627, is titled "emits the same diagnostic frontmatter `model:` does" but asserts only `code` and `severity`.

## Why this is a problem
The rendered `message` of a registered code is a load-bearing format. DIAG-4 makes the *Message* cell character-for-character normative and requires tests to source expected strings from it. A registry-sourced message assertion on the `subagent fn` emission position would fail, because this position renders a template the row neither holds in its *Message* cell nor documents in its Trigger prose. The missing normalisation also lets an author-controlled `\n` escape carry a raw break into `message`, the single-line summary. That breaks the serialised content format's line shapes, which is exactly what bug 0105 fixed at the sibling site for this same code.

## Suggested direction (non-binding, optional)
Have the override position render the same registry-backed `<value>` message through the same line-break normalisation the frontmatter site uses. If a position-specific wording is wanted, document it in the row's Trigger column as DIAG-4 permits.

## False-positive check
- EXST-9 / PIC-73 class check: this is a load-time diagnostic emission, not an execution-status sink or producer hook, and not a degrade-silent capability. Neither applies.
- allow-broad-catch token check: neither cited site contains a catch. N/A.
- Stated-rationale check: the fn site's doc comment (subagent-fn-static-checks.ts:180-191) claims it emits "the identical" diagnostic, which argues for parity, not for a distinct wording. `git log -S "subagent fn 'with { model }' value" -- src` → 1 commit (645bcb02, "impl: subagent fn (RFC 0001) feature"), with no stated reason for the wording. The two bug docs that mention `checkSubagentFnModelOverrides` (0109, 0138) discuss only its `withClause` coverage and not its message. Bug 0105 §Fix enumerates the positions it wrapped, and this position is not among them.
- Sibling-reality check: both sites run on the production load path. The frontmatter site runs through `parseFrontmatter`, and the fn site is called from production-composition.ts:1934 and import-static-checks.ts:432. Both push the same `code`.
- Already-filed check: `grep -rl "checkSubagentFnModelOverrides\|with { model }' value" quality/` hits only resolved D2/D9 items (PTQ-0159, 0304, 0334, 0368, 0418). None concerns the message.

## Triage
verdict: confirmed — re-verified both sides. subagent-fn-static-checks.ts:209-215 hand-builds `subagent fn 'with { model }' value '${reference}' …` from the cooked literal (lexer.ts:271-272 lowers `\n` to U+000A; theta-document.ts:600-602/537-540 pass it through raw). frontmatter.ts:606-613 renders the registry template `theta 'model:' value '<value>' …` wrapped in normaliseLiteralValueLineBreaks. The emitter set is exactly these 2 sites (grep reproduces), and neither the fn file nor the tests contain a normalise call or the fn wording (0 hits each). The anchor holds: code-registry-load.md:45's Message cell is the frontmatter template and its Trigger has no with-position template (0 hits); DIAG-4 (diagnostic-shape.md:74) makes that cell character-for-character normative; placeholder-rendering-b.md:76 requires line-break normalisation for model-unresolved; FN-7 (functions.md:71) says the override reuses this code. The named consumer is real: the serialised content format's hint/related-site line shapes, which is bug 0105's fixed signature for this same code at the frontmatter site. Not a dupe: d6-01 covers budget values (triage: claude-opus-5-5)
