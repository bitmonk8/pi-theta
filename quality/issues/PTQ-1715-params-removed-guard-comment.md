---
id: PTQ-1715
title: extractParsedParams still describes a case-arm reserved-keyword guard that is no longer present.
lens: D2
status: open
verdict: confirmed
locations:
  - src/parser/frontmatter-params.ts:155-158
  - src/parser/frontmatter-params.ts:139-140
  - src/parser/frontmatter-params.ts:166-167
  - src/parser/frontmatter-params.ts:187-188
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d2-cruft (openai/gpt-6.1-sol)
date: 2026-10-28
---

# extractParsedParams still describes a case-arm reserved-keyword guard that is no longer present.

## Observation
The reserved-keyword explanation says the case arm has its own `!RESERVED_KEYWORDS.has` guard. The current implementation instead handles reserved spellings in the initial `if`, identifier shape in an `else if`, and letter case in the final `else`. The case arm itself tests only `isTypeLikeName(name)`.

## Evidence
The guard claim, `src/parser/frontmatter-params.ts:155-158`:

```ts
      // module. The keyword arm runs first — mirroring `parseFn`'s
      // parameter-name check (`theta-document.ts`, `keyword` ahead of
      // `ident`) — though the case arm's own `!RESERVED_KEYWORDS.has` guard
      // already keeps the two subjects disjoint.
```

The reserved-keyword branch, `src/parser/frontmatter-params.ts:139-140`:

```ts
    if (RESERVED_KEYWORDS.has(name)) {
      // lexical.md:20 reserves 32 spellings from identifier position with no
```

The following branch, `src/parser/frontmatter-params.ts:166-167`:

```ts
    } else if (!isIdentifierShaped(name)) {
      // A `params:` key is a field-name position twice over (schema property
```

The final case branch, `src/parser/frontmatter-params.ts:187-188`:

```ts
    } else {
      if (isTypeLikeName(name)) {
```

Exact search: `grep -nF 'RESERVED_KEYWORDS.has' src/parser/frontmatter-params.ts` returns two hits: the positive membership test at line 139 and the comment at line 157. There is no executable negated membership test in this file.

## Why this is a problem
The comment retains the description of a removed guard. It attributes the separation of reserved spellings from case checking to an additional boolean condition, while the current branch structure supplies that separation. This is historical implementation narration, not a request to change the live validation rules.

## False-positive check
Read the entire field-name branch chain and ran the exact two-hit search recorded above. `git log --oneline -G '!RESERVED_KEYWORDS.has' -- src/parser/frontmatter.ts src/parser/frontmatter-params.ts` identifies `bfa5ae84`, `71409cac`, and `4d18f5cf`. `git show 71409cac -- src/parser/frontmatter.ts` shows the former `if (isIdentifierShaped(name) && !RESERVED_KEYWORDS.has(name))` replaced by the keyword-first branch chain while introducing the quoted comment. `git show 4d18f5cf -- src/parser/frontmatter-params.ts` shows that comment carried into the extracted module. The branch chain and its spec-backed checks remain live; none is alleged to be dead or unnecessary.

## Triage
verdict: confirmed — All excerpts and the two-hit grep reproduce; the case arm has no negated membership guard, and commit 71409cac removed that guard while introducing the surviving claim (carried into this module by 4d18f5cf). This is mechanically verified stale implementation commentary in src/, not a validation change; no matching existing finding was found. (triage: claude-opus-5-5)
