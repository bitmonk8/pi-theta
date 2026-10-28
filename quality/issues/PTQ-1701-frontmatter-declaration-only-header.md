---
id: PTQ-1701
title: frontmatter-contract.ts still describes itself as declaration-only after gaining runtime thinking-level validation.
lens: D2
status: open
verdict: confirmed
locations:
  - src/parser/frontmatter-contract.ts:1-7
  - src/parser/frontmatter-contract.ts:23-29
  - src/parser/frontmatter.ts:329-334
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d2-cruft (openai/gpt-6.1-sol)
date: 2026-10-28
---

# frontmatter-contract.ts still describes itself as declaration-only after gaining runtime thinking-level validation.

## Observation
The module header describes a type/interface surface and calls the file “Declaration-only.” The file now also defines the runtime `THINKING_LEVELS` array and implements `isThinkingLevel`. The frontmatter parser calls that implementation when validating a declared thinking level.

## Evidence
The module's description, `src/parser/frontmatter-contract.ts:1-7`:

```ts
// The frontmatter contract-type family: the exported type/interface surface a
// theta-file frontmatter parse produces and consumes — the theta 1.0 mode and
// model-match vocabulary, the model-reference-matcher injection seam, the
// parsed block/params/frontmatter records, the parse result envelope, and the
// whole-file body-type inputs. Declaration-only; the field-contract parse
// machinery that populates these shapes lives in frontmatter.ts, which
// re-exports this module so importers of either surface resolve unchanged.
```

The runtime array and implemented predicate, `src/parser/frontmatter-contract.ts:23-29`:

```ts
export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

/** Whether `value` is one of the `thinking:` levels. */
export function isThinkingLevel(value: unknown): value is ThinkingLevel {
  return typeof value === "string" && (THINKING_LEVELS as readonly string[]).includes(value);
}
```

A production validation use, `src/parser/frontmatter.ts:329-334`:

```ts
  pushUnknownValueDiagnostic(
    thinkingPresent && !isThinkingLevel(thinkingValue),
    thinkingValue, thinkingValueKind, thinkingRange,
    "theta/load/unknown-thinking-value", "thinking", `${THINKING_LEVELS.slice(0, -1).map((l) => `'${l}'`).join(", ")}, or '${THINKING_LEVELS[THINKING_LEVELS.length - 1]}'`,
    file, diagnostics,
  );
```

## Why this is a problem
This is stale module-responsibility prose: the declaration-only description no longer matches the executable validation code in the same module. The finding concerns that description, not the placement, exports, or implementation of the live validator.

## False-positive check
Read the header and the implemented predicate together, and verified its production use at the cited parser site. `git log --oneline -S 'Declaration-only' -- src/parser/frontmatter-contract.ts` identifies the header's introduction in `9edcc278`; `git log --oneline -S 'THINKING_LEVELS' -- src/parser/frontmatter-contract.ts` identifies `ee60a538`. `git show ee60a538 -- src/parser/frontmatter-contract.ts` shows the thinking-level array and function body added without changing the header. PTQ-1267 concerns the earlier extraction of the contract family, not this later header mismatch. No deadness or export-removal claim is made.

## Triage
verdict: confirmed — All three excerpts reproduce: the header says “Declaration-only” despite the implemented isThinkingLevel and its production validation call; both git-log searches and the ee60a538 diff confirm runtime validation landed after the unchanged header. This is mechanically evidenced stale responsibility prose in src/, not a placement complaint; no same-root filing found, and resolved PTQ-1267 covers the earlier type-family extraction. (triage: claude-opus-5-5)
