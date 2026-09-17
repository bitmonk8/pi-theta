---
id: PTQ-0401
title: node-error-code.ts's header says "the three discovery modules" use nodeErrorCode, but four other modules now call it
lens: D2                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/discovery/node-error-code.ts:1-2
  - src/discovery/discovery-path-classify.ts:167,220,395
  - src/discovery/discovery-source-enumerate.ts:74
  - src/discovery/package-discovery.ts:497
  - src/discovery/settings.ts:244
sites: 4                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917095931
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# node-error-code.ts's header says "the three discovery modules" use nodeErrorCode, but four other modules now call it

## Observation
`node-error-code.ts`'s header describes `nodeErrorCode` as "the shared Node-style `.code` reader the three discovery modules classify filesystem rejections with." Counting every module outside `node-error-code.ts` itself that imports and calls the function, there are four: `discovery-path-classify.ts`, `discovery-source-enumerate.ts`, `package-discovery.ts`, and `settings.ts`.

## Evidence
`src/discovery/node-error-code.ts:1-2` — the header's claim:
```ts
// The shared Node-style `.code` reader the three discovery modules classify
// filesystem rejections with.
```

The four call sites, each importing `nodeErrorCode` and using it in a Promise-rejection handler:

`src/discovery/discovery-path-classify.ts:167`:
```ts
    (error: unknown) => ({ ok: false as const, code: nodeErrorCode(error) }),
```
(also called again at line 220 and line 395 of the same file — three call sites within this one module)

`src/discovery/discovery-source-enumerate.ts:74`:
```ts
    (error: unknown) => ({ ok: false as const, code: nodeErrorCode(error) }),
```

`src/discovery/package-discovery.ts:497`:
```ts
    (error: unknown) => ({ ok: false as const, code: nodeErrorCode(error) }),
```

`src/discovery/settings.ts:244`:
```ts
    (error: unknown) => ({ ok: false as const, value: undefined, code: nodeErrorCode(error) }),
```

Exact search: `grep -rln "nodeErrorCode" src/` returns exactly five files — `discovery-path-classify.ts`, `discovery-source-enumerate.ts`, `node-error-code.ts` (the declaration site itself), `package-discovery.ts`, and `settings.ts` — i.e. four external consumers, not three.

## Why this is a problem
The header's count is a factual claim about how many modules depend on this shared helper, offered as the rationale for the module's own existence and the rationale in its doc-comment for "why not bind a `catch`". The claim no longer matches the current import graph: a fourth module (`settings.ts`, per its own header a later V10c addition) now shares the same rejection-classification need the header attributes to only three modules.

## Suggested direction (non-binding, optional)
Update the header's count (or drop the specific number) to match the current four-module consumer set.

## False-positive check
- Ran `grep -rln "nodeErrorCode" src/` → five files (the four consumers plus the declaration site itself).
- Ran `grep -n "nodeErrorCode" <each file>` individually to confirm each of the four names both imports the symbol and calls it at least once in a live Promise-rejection handler (not merely a dangling import or a comment mention).
- Searched `quality/resolved/` and `quality/issues/` for `"three discovery modules"` — no prior filing on this header line.

## Triage
verdict: confirmed — header lines 1-2 and all six call-site excerpts reproduce verbatim; grep across src/extensions/tools/tests confirms exactly four importing modules (discovery-path-classify, discovery-source-enumerate, package-discovery, settings), each with a live call; git shows "three" was accurate at creation (7f360d20: discovery-walk/package-discovery/settings) and went stale when the D9 splits 846fd992/46a063e0 moved discovery-walk's calls into two new modules — the filing's attribution of the fourth to settings.ts is wrong on cause but the stale count is real; no existing PTQ tracks this line (PTQ-0286 only quotes it) (triage: claude-fable-5-1)
verdict: confirmed — header lines 1-2, all six call sites and four import lines reproduce verbatim at the cited lines; repo-wide grep finds exactly four importing modules, each with a live rejection-handler call; git grep at creation commit 7f360d20 shows three consumers (discovery-walk/package-discovery/settings), so the count went stale when D9 splits 846fd992/46a063e0 spread discovery-walk's calls over discovery-path-classify and discovery-source-enumerate (the filing's settings.ts-as-fourth attribution is wrong on cause, the stale count is real); PTQ-0286/0342 only quote the phrase, different root causes (triage: claude-fable-5-1)
