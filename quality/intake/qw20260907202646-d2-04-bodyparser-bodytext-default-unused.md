---
id: pending
title: BodyParser's bodyText constructor parameter carries a `= ""` default that no construction site takes — all three pass an explicit body source
lens: D2
status: intake
verdict: pending
locations:
  - src/parser/theta-document.ts:2666-2673
  - src/parser/theta-document.ts:1063
  - src/parser/theta-document.ts:1881
  - src/parser/theta-document.ts:1910
sites: 3
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# BodyParser's bodyText constructor parameter carries a `= ""` default that no construction site takes — all three pass an explicit body source

## Observation
`BodyParser`'s third constructor parameter, `bodyText`, is declared with a
default of `""`. The class is constructed at exactly three places in the
repository, all inside this same file, and each supplies a third argument
explicitly. The fourth parameter, `paramFieldNames`, is a genuine optional — two
of the three sites omit it — so the two defaults are not in the same state.

## Evidence
src/parser/theta-document.ts:2666-2673 — the parameter and its default:

```ts
    /**
     * The raw (newline-normalised) body source the tokens index into. A
     * `@`...`` query template is recovered by slicing this verbatim between the
     * backtick token bounds, so the template preserves the author's exact text
     * (punctuation, interpolation braces, and internal spacing) rather than a
     * lossy space-join of the interior tokens.
     */
    private readonly bodyText: string = "",
```

`grep -rn "new BodyParser" src extensions tools tests --include=*.ts` returns
exactly three hits, all in this file:

src/parser/theta-document.ts:1063 (inside `parseThetaDocument`):

```ts
  const parser = new BodyParser(lex.tokens, file, split.bodyText, paramFieldNames);
```

src/parser/theta-document.ts:1881 (inside `parseExpressionSource`):

```ts
  const parser = new BodyParser(lex.tokens, "<interpolation>", source);
```

src/parser/theta-document.ts:1910 (inside `parseInterpolationSource`):

```ts
  const parser = new BodyParser(lex.tokens, "<interpolation>", source);
```

For contrast, the fourth parameter's default is live — it is taken at 1881 and
1910, which pass only three arguments (src/parser/theta-document.ts:2684-2689):

```ts
    paramFieldNames: ReadonlySet<string> = new Set(),
  ) {
    for (const name of paramFieldNames) {
      this.bindings.set(name, false);
    }
  }
```

## Why this is a problem
A vestigial default: the initializer expression is unreachable from every call
site, so it encodes a construction mode ("a parser built with no body source")
that no caller uses. It also props up two runtime fallbacks that read as though
they serve real callers — `consumeInlineObjectType`'s
(src/parser/theta-document.ts:4824-4831):

```ts
    const raw =
      this.bodyText.length > 0
        ? this.bodyText.slice(
            positionToOffset(this.bodyText, startTok.range.start),
            positionToOffset(this.bodyText, lastTok.range.end),
          )
        : null;
    parts.push(raw !== null ? raw : consumedTexts.join(""));
```

and `parseQuery`'s (src/parser/theta-document.ts:6550-6554), whose comment names
the absent mode outright:

```ts
    // author's spacing and drop interpolation braces). Fall back to the
    // space-joined tokens only when the raw slice is unavailable (no closing
    // backtick, or no body source threaded through).
    const rawTemplate =
      openTick !== null && closeTick !== null && this.bodyText.length > 0
```

No caller threads nothing through.

## Suggested direction (non-binding, optional)
Make `bodyText` a required parameter and let the call sites, which already pass
it, keep passing it.

## False-positive check
- Construction search across production and tests: `grep -rn "new BodyParser"
  src extensions tools tests --include=*.ts` → three hits, listed above; no test
  constructs the class.
- Export check: the declaration at src/parser/theta-document.ts:2633 is
  `class BodyParser {` with no `export`, so no out-of-file construction is
  possible; `src/parser` has no barrel file (`ls src/parser` lists leaf modules
  only), so no re-export can add one.
- String-keyed / dynamic access: `grep -rn "\"BodyParser\"" src extensions tools
  tests --include=*.ts` → no hits.
- Not a deadness claim about `bodyText` itself: the field is read at
  src/parser/theta-document.ts:4825-4828 and :6554-6557. The claim is scoped to
  the parameter's default value never being taken.
- Contrasted against the sibling parameter so the finding is not a blanket
  "defaults are bad" claim: `paramFieldNames`'s default IS taken, by two of the
  three sites.

## Triage
