---
id: PTQ-0032
title: parseMinimalTheta extracts a `mode` field whose only downstream use is the discard statement `void parsed.mode`
lens: D2                     # the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/mvp/minimal-theta.ts:30-35
  - src/mvp/minimal-theta.ts:64-69
  - src/mvp/minimal-theta.ts:111
sites: 3                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# parseMinimalTheta extracts a `mode` field whose only downstream use is the discard statement `void parsed.mode`

## Observation

`parseMinimalTheta` (src/mvp/minimal-theta.ts) runs a regex over every
frontmatter line to extract the `mode:` value into `ParsedMinimalTheta.mode`.
The only mention of that field after the parse is `void parsed.mode;` inside
the fixture's `run` closure — an explicit discard. No branch, validation,
message, or return ever consumes the value, in this module or in the one
external caller (tests/minimal-slash-command.test.ts, which asserts on the
driven turn, never on `mode`). The fence-tracking part of the loop is not
implicated: it also gates which lines are eligible as body queries, so only
the `mode` extraction, the field, and the discard are load-free.

## Evidence

src/mvp/minimal-theta.ts:30-35 — the field:

```ts
/** The minimal happy-path parse of a single-untyped-query prompt-mode theta. */
interface ParsedMinimalTheta {
  /** The frontmatter `mode:` value (the MVP happy path requires `prompt`). */
  readonly mode: string;
  /** The rendered text of the single untyped `` @`<literal>` `` body query. */
  readonly queryText: string;
}
```

src/mvp/minimal-theta.ts:64-69 — the extraction that feeds it:

```ts
    if (inFrontmatter) {
      const match = /^\s*mode\s*:\s*(\S+)\s*$/.exec(line);
      if (match !== null && match[1] !== undefined) {
        mode = match[1];
      }
      continue;
    }
```

src/mvp/minimal-theta.ts:106-114 — the sole read is a `void` discard:

```ts
    run: async (_args, ctx: ExtensionCommandContext) => {
      // Prompt mode: the single query is a turn the user sees in their session
      // (SLSH-2). Issue the rendered query text as one user turn and await the
      // streamed assistant response; the interpreter resumes only after the
      // turn goes idle, leaving exactly one appended prompt-mode turn.
      void parsed.mode;
      pi.sendUserMessage(parsed.queryText);
      await ctx.waitForIdle();
    },
```

Reference search: `grep -rn "parsed.mode" src tests extensions tools` — the
single hit is the `void` statement at src/mvp/minimal-theta.ts:111.
`ParsedMinimalTheta` is module-private; `buildMinimalTheta`'s return type
(`ThetaFixture`) exposes only `slashName` and `run`, so no caller can reach
`mode`. `grep -n "mode" tests/minimal-slash-command.test.ts` shows `mode:
prompt` only inside the fixture source string (:22) and in comments — no
assertion touches the parsed value.

## Why this is a problem

Vestigial field: the value is computed on every parse and never read — the
`void parsed.mode;` statement exists precisely to mark the value unused (a
lint-silencing discard), which is leftover scaffolding from the doc-comment's
promise that "`M` implements: parse `mode:` frontmatter (prompt mode)"
(:90-93) without any consumer having ever materialised. The field, its regex
extraction, and the discard statement carry no behaviour; the fixture would
drive the identical turn with `queryText` alone.

## Suggested direction (non-binding, optional)

Drop the `mode` field, its extraction regex, and the `void` discard from the
minimal pipeline (or, if the seam is meant to keep documenting the parsed
shape, have the doc stop claiming the value participates in the drive).

## False-positive check

- Reference searches: `parsed.mode` across src/, tests/, extensions/, tools/
  (one hit — the `void` discard); `buildMinimalTheta` / `minimal-theta` across
  the same roots (definition plus tests/minimal-slash-command.test.ts only);
  `ParsedMinimalTheta` (module-private, no external reference); dynamic access
  `["mode"]` over this module — none.
- Tests-only-caller rule considered: the module is test-only-reachable, so no
  deadness claim is made against the module or `buildMinimalTheta`; this
  finding is scoped to the `mode` value, which is unread by every caller,
  tests included (the test's `mode: prompt` string is fixture input, and its
  assertions are on `sendUserMessage` / turn behaviour).
- Scope check on the parse loop: the `---` fence state machine also excludes
  frontmatter lines from the body-query regex, so it is deliberately NOT cited
  as mode-only machinery; only lines 64-69 exist solely for `mode`.
- Git history intent: the file's only commit since the corpus rename is
  2bc69157 ("Rename Loom -> Theta across the corpus"); the discard has been in
  place since the M leaf landed, with no consumer added since.

## Triage

verdict: confirmed — independently reproduced: sole reference to `parsed.mode` is the no-op `void` discard at :111 (`parsed` stays alive via `queryText` at :112), the field is module-private and absent from `ThetaFixture`, no dynamic/string-keyed access exists, and the witness test never reads it, so the value is computed and discarded with the M drive already landed (triage: claude-opus-5)

