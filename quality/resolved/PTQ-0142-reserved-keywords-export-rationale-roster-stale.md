---
id: PTQ-0142
title: reservedKeywords' export rationale names src/parser/params.ts as the one importer it exists for, while three production modules import it and one of those names the other two
lens: D2                     # the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/lexer/lexer.ts:152-166
  - src/parser/params.ts:39
  - src/parser/frontmatter.ts:646-657
  - src/parser/type-grammar.ts:115-123
sites: 3                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# reservedKeywords' export rationale names src/parser/params.ts as the one importer it exists for, while three production modules import it and one of those names the other two

## Observation
`reservedKeywords()` carries a doc comment stating why it is exported and
naming exactly one consumer — "`src/parser/params.ts`'s reserved-keyword
classification". Three production modules import the symbol today:
`src/parser/params.ts`, `src/parser/frontmatter.ts`, and
`src/parser/type-grammar.ts`. Each derives its own module-level
`RESERVED_KEYWORDS` set from the call, and `type-grammar.ts`'s own doc names
both of the other two by path. The lexer's rationale sentence, written when
`params.ts` was the sole importer, still presents a single-consumer roster.

## Evidence
src/lexer/lexer.ts:152-166 — the rationale and the exported set:

```ts
/**
 * The reserved keywords that cannot be used as identifiers (lexical.md).
 * Exported for `src/parser/params.ts`'s reserved-keyword classification: a
 * parser leaf needs the same 32-member set this module already enforces at
 * the token level (`NamedType ::= Ident`, and a reserved spelling is never an
 * `Ident`), rather than a second copy of it.
 */
export function reservedKeywords(): ReadonlySet<string> {
  return new Set([
    "let", "mut", "fn", "if", "else", "for", "in", "while", "break",
    "continue", "return", "match", "schema", "enum", "import", "export",
    "from", "as", "by", "invoke", "true", "false", "null", "Ok", "Err",
    "Result", "string", "number", "integer", "boolean", "array", "void",
  ]);
}
```

The importer census is exhaustive: the search
`grep -rn 'import { reservedKeywords } from "../lexer/lexer";' src/` returns
3 hits — params.ts:39, frontmatter.ts:58, type-grammar.ts:108.

src/parser/params.ts:39 — importer 1, the consumer the comment names (its
derived set is at src/parser/params.ts:683):

```ts
import { reservedKeywords } from "../lexer/lexer";
```

src/parser/frontmatter.ts:646-657 — importer 2 (import line 58), with its own
paragraph asserting the same reuse:

```ts
/**
 * The reserved-keyword spellings a `params:` key can carry (lexical.md
 * §Reserved words), read from the lexer's own set (`reservedKeywords()`,
 * lexer.ts) rather than restated here as a second source of truth — the same
 * reuse `params.ts`'s `RESERVED_KEYWORDS` makes for its atom classification. A
 * `Set`, not a plain object keyed by author text: a record keyed by arbitrary
 * source spellings needs a null prototype and an own-key guard to be indexed
 * safely by author input, which a `Set.has` call needs neither of. Immutable
 * module-level data, not mutable cross-invocation state, matching
 * `THETA_1_0_FIELDS` above.
 */
const RESERVED_KEYWORDS: ReadonlySet<string> = reservedKeywords();
```

src/parser/type-grammar.ts:115-123 — importer 3 (import line 108), whose doc
names both of the others by path:

```ts
 * (`Ok`, `Err`, `Result`, `let`, …) must not draw `binding-case-mismatch`,
 * because `tokeniseType` has no keyword kind at all and would otherwise
 * present every one of them exactly as it presents `Ys`. Derived ONCE at
 * module scope from the lexer's own exported set, the same shape
 * `src/parser/params.ts` and `src/parser/frontmatter.ts` already use for the
 * identical exclusion at their own field-name positions — a module-private
 * immutable derived set, not a mutable global.
 */
const RESERVED_KEYWORDS: ReadonlySet<string> = reservedKeywords();
```

## Why this is a problem
Historical narration: the sentence states the export's purpose as a
one-consumer fact ("Exported for `src/parser/params.ts`'s …"), and that fact is
no longer true. The mismatch is mechanical, not a judgement call — the doc
names one importer, the import graph has three, and the third importer's own
comment enumerates the other two. A reader auditing what depends on the
lexer's 32-member set has to rediscover two of its three dependants by grep
rather than from the export's stated contract.

## Suggested direction (non-binding, optional)
The rationale sentence can name the position the export serves (parser leaves
classifying a reserved spelling at an identifier slot) rather than one file
path, so it stays true as consumers are added.

## False-positive check
- Importer census: `grep -rn "reservedKeywords" src/ extensions/ tools/ tests/`
  → the declaration in lexer.ts, the three import lines (params.ts:39,
  frontmatter.ts:58, type-grammar.ts:108) and their three
  `const RESERVED_KEYWORDS: ReadonlySet<string> = reservedKeywords();` call
  sites (params.ts:683, frontmatter.ts:657, type-grammar.ts:123). Remaining
  hits are prose in theta-document.ts:2428 and in tests, plus the unrelated
  `reservedKeywords?: string[]` out-parameter of
  `src/parser/body-type-lowering.ts` — a differently-scoped local name, not this
  export.
- Re-export check: `grep -rn "export .*reservedKeywords" src/` → only the
  declaration at lexer.ts:159; no barrel re-exports it, so no importer reaches
  it under another path.
- Dynamic access: the symbol is a plain named export consumed by three static
  `import { … }` statements; no string-keyed or index access to it exists in
  the searched trees.
- Member-count claim: the set literal at lexer.ts:160-165 holds 32 spellings,
  matching the doc's "32-member set" and
  docs/spec_topics/lexical.md:20's Reserved-keywords list — this finding is
  about the consumer roster alone, not the count.
- Tests are not the claim: all three cited importers are production modules
  under `src/`; test references were excluded from the count.
- git history intent: `git log -S "Exported for \`src/parser/params.ts\`'s
  reserved-keyword classification" -- src/lexer/lexer.ts` → one commit,
  61806a3a (bug 0044, v0.54.0). `git log -S 'import { reservedKeywords } from
  "../lexer/lexer";' -- src/parser/frontmatter.ts src/parser/type-grammar.ts
  src/parser/params.ts` → 61806a3a (v0.54.0), bfa5ae84 (bug 0149, v0.82.0,
  frontmatter.ts), 28c730ad (bug 0154, v0.165.0, type-grammar.ts). The comment
  was accurate when written and was not revisited when the two later importers
  landed.

## Triage
verdict: confirmed — reproduced in full: lexer.ts:154 names params.ts alone as the reason for the export while grep gives three production importers (params.ts:39, frontmatter.ts:58, type-grammar.ts:108), each deriving its own RESERVED_KEYWORDS (683/657/123) and type-grammar.ts naming both peers, with no re-exports (only lexer.ts:159) or dynamic access, and git dating the sentence (61806a3a v0.54.0) before both later importers (bfa5ae84 v0.82.0, 28c730ad v0.165.0) — in-lens historical narration, not taste (triage: claude-opus-5)
