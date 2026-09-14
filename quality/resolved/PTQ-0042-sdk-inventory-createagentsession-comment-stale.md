---
id: PTQ-0042
title: sdk-inventory.ts comment claims createAgentSession "stays catalogued below as a still-imported surface", but no such row or import exists
lens: D2                     # the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/sdk-inventory.ts:190-194
  - src/extension/sdk-inventory.ts:209-215
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# sdk-inventory.ts comment claims createAgentSession "stays catalogued below as a still-imported surface", but no such row or import exists

## Observation
Inside the `SDK_SURFACE_INVENTORY` array literal, the comment introducing the
capability function-member rows states that `createAgentSession` "stays
catalogued below as a still-imported surface until the producer's RFC-0005
child-process retirement lands". Fifteen lines later, a second comment in the
same array states the opposite: `createAgentSession` "ha[s] LEFT the inventory
entirely" and "no `src/**` file imports" it. The array contains no
`createAgentSession` row, and no source file imports the symbol; the RFC-0005
retirement the first comment describes as pending landed in the same commit
that wrote it.

## Evidence
src/extension/sdk-inventory.ts:190-194 — the stale claim:
```ts
    // The eight factory-probable capability function members (Step 0 (c)).
    // RFC-0005 retired capability 3's `AgentSession.prototype.abort` member from
    // the probe loop (verified by Step 0 (f) instead). `createAgentSession`
    // stays catalogued below as a still-imported surface until the producer's
    // RFC-0005 child-process retirement lands (production-theta-producer.ts).
```

src/extension/sdk-inventory.ts:209-215 — the same array's contradicting,
accurate comment:
```ts
    // RFC-0005: `createAgentSession` and the former in-process subagent
    // satellites (`SessionManager` / `DefaultResourceLoader` / `getAgentDir` /
    // `defineTool` / `AgentToolResult`) have LEFT the inventory entirely
    // (capability-inventory-items.md item 3) — the subagent drive spawns a
    // child `pi` process and no `src/**` file imports them. (`ToolDefinition`
    // re-entered below as a peer-named-import for bug 0010's respond-tool
    // registration — a `pi.registerTool` consumer, not an in-process satellite.)
```

Row check: `grep -n '"createAgentSession"' src/extension/sdk-inventory.ts` →
0 hits; the array's `namespace-function` rows are exactly `pi.registerCommand`,
`pi.sendUserMessage`, `pi.registerTool`, `pi.setActiveTools`,
`pi.getActiveTools`, `pi.getAllTools`, `pi.registerMessageRenderer`,
`pi.sendMessage`, `pi.registerFlag`, `pi.getFlag` (sdk-inventory.ts:195-218).

Import check: `grep -rn "createAgentSession" --include=*.ts src/` → 9 hits,
all inside comments (capability-probe.ts:14,56,335,464;
production-theta-producer.ts:30; sdk-inventory.ts:12,162,192,209); no import
statement or value use anywhere in src/, tools/, or extensions/.

## Why this is a problem
Historical narration contradicting current code: the comment describes a row
("catalogued below") that does not exist, a dependency state ("still-imported")
that is false, and a pending event ("until the ... retirement lands") that has
already happened — `git log -S 'id: "createAgentSession"'` shows the row was
removed by commit fda23a4b ("feat: child-process subagent sessions (RFC 0005)
— v0.8.0"), the same commit that introduced this sentence, so the file has
carried a self-contradiction (against its own :209-215 comment and its own row
set) ever since. A reader auditing the inventory against the SDK — the exact
purpose of this file per its header — is told to expect a row that a search
will not find.

## Suggested direction (non-binding, optional)
Delete the "createAgentSession stays catalogued below ..." sentence from the
:192-194 comment; the accurate RFC-0005 disposition is already stated once at
:209-215.

## False-positive check
- Row search: `grep -n '"createAgentSession"'` and `grep -n "createAgentSession"`
  over src/extension/sdk-inventory.ts — only comment lines; no
  `SurfaceInventoryEntry` row carries the id.
- Import search across src/, tools/, tests/: `grep -rn "createAgentSession"
  --include=*.ts .` — every src/ hit is a comment; test hits (if any) reference
  the retirement narrative, not an import of the symbol; no `import {
  createAgentSession }` exists anywhere.
- Dynamic-access search: no string-keyed lookup of `"createAgentSession"`
  against the inventory (`find`/`filter` predicates in
  src/extension/version-bump-gates.ts and src/extension/unknown-reason-rule.ts
  key on other ids/kinds).
- Git intent: `git log -S 'id: "createAgentSession"' --
  src/extension/sdk-inventory.ts` → added by 8cc63a64 (V18a), removed by
  fda23a4b (RFC 0005); `git log -S "stays catalogued below"` → added by
  fda23a4b — the claim was stale at birth relative to the same commit's own
  row removal, and no later commit reconciled it.
- Distinctness check: quality/intake/qw20260907130901-d2-04-rfc0005-theta-
  adapter-satellites-dead.md files dead RFC-0005 leftover CODE in
  production-theta-producer.ts; this finding is a different artefact (a
  self-contradicting comment in sdk-inventory.ts) at different locations.

## Triage
verdict: confirmed — reproduced verbatim at :190-194/:209-215; no `createAgentSession` row exists (grep `id: "createAgentSession"` → 0 hits), all 9 src/ hits are comments (no import), and `git show fda23a4b` deletes the row in the very commit that adds the "stays catalogued below" sentence. (triage: claude-opus-5)
