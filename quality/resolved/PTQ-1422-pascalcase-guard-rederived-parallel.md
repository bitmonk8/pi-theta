---
id: PTQ-1422
title: PascalCase type-name guard re-derived in six production passes
lens: D4
status: fixed
verdict: confirmed
locations:
  - src/parser/type-compat.ts:163-169
  - src/lexer/contextual-checks.ts:218-219
  - src/parser/body-parser.ts:1225-1226
  - src/parser/body-parser.ts:1802-1803
  - src/parser/frontmatter-params.ts:184-185
  - src/parser/type-walk.ts:373-374
sites: 6
fix_scope: cross-module
d4_class: parallel
wave: qw20260922211400
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-22
---

# PascalCase type-name guard re-derived in six production passes

## Observation

`lexical.md:15` requires type-like bindings (`schema`, `enum`, and other type-like names) to start with an uppercase ASCII letter. Six production sites re-derive the same first-character guard (`first >= "A" && first <= "Z"`) rather than importing a shared predicate:

- `resolveNamed` in `src/parser/type-compat.ts` uses the inverted form to make a non-uppercase name unresolvable.
- `contextualDiagnostics` in `src/lexer/contextual-checks.ts` toggles between `binding-case-mismatch` and `schema-case-mismatch`.
- `body-parser.ts` checks parameter names at `:1225` and match-pattern binders at `:1802`.
- `frontmatter-params.ts` checks `params:` key names.
- `type-walk.ts` checks inline object type field names.

`src/parser/type-compat.ts` itself acknowledges the re-derivation and lists four expected sites, but current code contains at least six, so the inventory is already out of date.

## Evidence

`src/parser/type-compat.ts:163-169` (the read-seam guard):

```typescript
export function resolveNamed(env: TypeEnv, name: string): NamedDecl | undefined {
  const first = name[0] ?? "";
  if (!(first >= "A" && first <= "Z")) {
    return undefined;
  }
  return Object.hasOwn(env, name) ? env[name] : undefined;
}
```

`src/lexer/contextual-checks.ts:218-230`:

```typescript
    const first = name.text[0] ?? "";
    const isUpper = first >= "A" && first <= "Z";
    if (kind === "binding" && isUpper) {
      diagnostics.push({
        severity: "error",
        code: "theta/parse/binding-case-mismatch",
        file,
        range: name.range,
        message: "binding name must start with a lowercase letter or _",
      });
    } else if (kind === "type" && !isUpper) {
      diagnostics.push({
        severity: "error",
```

`src/parser/body-parser.ts:1225-1226`:

```typescript
        const first = pTok.text[0] ?? "";
        const isUpper = first >= "A" && first <= "Z";
```

`src/parser/body-parser.ts:1802-1803`:

```typescript
        const first = nameTok.text[0] ?? "";
        const isUpper = first >= "A" && first <= "Z";
```

`src/parser/frontmatter-params.ts:184-186`:

```typescript
      const first = name[0] ?? "";
      const isUpper = first >= "A" && first <= "Z";
      if (isUpper) {
```

`src/parser/type-walk.ts:373-375`:

```typescript
          const first = name.charAt(0);
          const isUpper = first >= "A" && first <= "Z";
          if (isUpper) {
```

Diff verdict: the predicate is identical across sites; only the surrounding action and the variable name for the first character differ (`first` vs `name.text[0]` vs `name.charAt(0)`). No clone-map group exists because the surrounding context differs enough to fall below the token-window floor.

## Why this is a problem

This is a load-bearing parallel truth: a single language rule (type-like names start with A-Z) is enforced independently in six passes. When the rule changes or when a new pass needs the same discrimination, every re-derivation must change together. Today they do not share a source of truth, and the comment that tries to enumerate them already omits two current sites (`body-parser.ts` has two; `frontmatter-params.ts` has one). If one site were relaxed (for example to accept Unicode uppercase letters or a leading `_`), a name could be accepted as a declaration by the parser but treated as unresolvable by `type-compat.ts`, or vice versa, producing inconsistent diagnostics between the lexer, the body parser, the frontmatter parser, the type grammar, and the compatibility engine.

## Suggested direction (non-binding, optional)

Introduce a single shared predicate such as `isTypeLikeName(name: string): boolean` in a module both `src/lexer/` and `src/parser/` can import (for example `src/parser/named-type-classification.ts`, which already owns named-declaration classification), and replace every local re-derivation with a call to it.

## False-positive check

- Re-read every cited span in current code; all are live production paths.
- Searched `src/` for `first >= "A" && first <= "Z"`: six production hits plus the `type-compat.ts` comment that documents the duplication. No generated or test-only matches.
- The spec clause (`lexical.md:15`) is the same rule everywhere, but these are not spec-normative vector tables that the spec itself repeats; they are independent enforcement predicates.
- Not in `tests/`; not generated code.

## Triage
verdict: questionable — accounting verified for the root cause: `grep -rn 'first >= "A" && first <= "Z"' src/` returns exactly the six cited production sites (type-compat.ts:165, contextual-checks.ts:219, body-parser.ts:1226 and :1803, frontmatter-params.ts:185, type-walk.ts:374; the only other hit is a comment in tests/fn-param-name-case.test.ts:364), every excerpt matches at the cited lines, all six are live enforcement paths for the one lexical.md:15 first-letter rule, and no shared predicate (`isTypeLikeName`/`isPascalCase`/`isUpperFirst`) exists in src/; two secondary claims are refuted and corrected here — (a) the type-compat.ts:153-157 comment does NOT omit two sites: it names five external functions (`contextualDiagnostics`, `extractParsedParams`, `parseFn`, `parseSchemaObjectBody`, `walkType`) which map 1:1 onto the five external hits (parseFn → `parseFnParamList` at body-parser.ts:1124 hosting :1226; `parseSchemaObjectBody` at :1699 hosting :1803), so the inventory is complete by function and only its file paths are stale after the lexer.ts/frontmatter.ts/theta-document.ts/type-grammar.ts splits; (b) body-parser.ts:1802 checks schema field names in `parseSchemaObjectBody`, not match-pattern binders; each site also carries a comment stating the re-derivation is deliberate ("keeps one spelling across every position"), so whether to hoist a shared predicate is a design decision for a human ruling; not a duplicate of PTQ-1115 (the `case "named"` alias classifier) (triage: claude-fable-5-1)
verdict: questionable — re-verified independently: `grep -rn 'first >= "A" && first <= "Z"' src/ tests/ extensions/ tools/` yields exactly the six cited production lines (type-compat.ts:165, contextual-checks.ts:219, body-parser.ts:1226/:1803, frontmatter-params.ts:185, type-walk.ts:374) plus one test comment; every excerpt byte-matches; all six are live enforcement of the single lexical.md:15 first-letter rule and no shared predicate exists in src/ — so the parallel-class accounting holds and per D4 parallel rules the shared source of truth is a human design ruling (never confirmed); two secondary claims are inaccurate and corrected: the type-compat.ts:153-157 comment names five external functions that map 1:1 onto the five external sites (only its file paths are stale post-split), and body-parser.ts:1802 guards schema field names inside `parseSchemaObjectBody`, not match-pattern binders; each site also documents the re-derivation as deliberate ("keeps one spelling across every position"); not a duplicate — PTQ-0087 (resolved) is a type-compat line-citation drift and PTQ-1115 is the `case "named"` alias classifier (triage: claude-fable-5-1)
verdict: questionable — accounting verified; the shared source of truth is a design decision for a human ruling: third independent re-run of `grep -rn 'first >= "A" && first <= "Z"' src/ tests/ extensions/ tools/` returns exactly the six cited production lines (type-compat.ts:165, contextual-checks.ts:219, body-parser.ts:1226/:1803, frontmatter-params.ts:185, type-walk.ts:374) plus the single comment hit at tests/fn-param-name-case.test.ts:364; every excerpt matches at the cited lines, all six are live enforcement of the one lexical.md:15 first-letter rule, and no `isTypeLikeName`/`isPascalCase`/`isUpperFirst` predicate exists anywhere in src/; two secondary claims remain refuted and do not alter the count — the type-compat.ts:153-157 comment's five external functions map 1:1 onto the five external sites (`parseFnParamList` at body-parser.ts:1124 hosts :1226, `parseSchemaObjectBody` at :1699 hosts :1803; only its pre-split file paths are stale), and :1802 guards schema field names, not match-pattern binders; the sites' own comments call the re-derivation deliberate ("keeps one spelling across every position"), so hoisting is a design ruling; not a duplicate — PTQ-1115 (resolved) is the `case "named"` alias classifier, PTQ-0087 (resolved) is a citation drift, PTQ-1200 (resolved) names `isUpper` only as a D9 inventory local (triage: claude-fable-5-1)
triage worker failed (verdict not applied; re-triaged next wave) (loop, 2026-09-23)
verdict: confirmed — RATIFIED (human, 2026-09-23): confirmed - batch ruling; triage verification trusted.
