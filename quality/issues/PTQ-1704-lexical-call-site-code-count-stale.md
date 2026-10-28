---
id: PTQ-1704
title: checkLexicalCallSites still advertises four diagnostic codes after adding the runtime-tool isolation check.
lens: D2
status: open
verdict: confirmed
locations:
  - src/parser/lexical-call-sites.ts:262-267
  - src/parser/lexical-call-sites.ts:276-277
  - src/parser/lexical-call-sites.ts:286-287
  - src/parser/lexical-call-sites.ts:304-305
  - src/parser/lexical-call-sites.ts:120-127
  - src/parser/lexical-call-sites.ts:496-499
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d2-cruft (openai/gpt-6.1-sol)
date: 2026-10-28
---

# checkLexicalCallSites still advertises four diagnostic codes after adding the runtime-tool isolation check.

## Observation
The function header says the lexical walk emits four registered codes and enumerates four entries. The same walk also invokes `checkCallSiteCall`, whose runtime-tool branch emits `theta/parse/session-tool-in-isolated-body`. The header therefore omits a diagnostic responsibility implemented by the walk.

## Evidence
`src/parser/lexical-call-sites.ts:262-267`:

```ts
 * and `fn` parameters shadow inside their scopes; an `fn` body sees only the
 * whole-file declarations plus its own parameters — theta 1.0 has no
 * closures) — and emits four registered codes from that single resolution
 * judgement:
 *
 *   1. `theta/parse/shadowed-callable-call` (bug 0016,
```

`src/parser/lexical-call-sites.ts:276-277`:

```ts
 *   2. `theta/parse/tool-arg-arity` (bug 0072,
 *      docs/bugs/0072-tool-arg-checks-dead-and-no-runtime-net.md) for a call
```

`src/parser/lexical-call-sites.ts:286-287`:

```ts
 *   3. `theta/parse/tool-arg-not-object-literal` (bug 0003,
 *      docs/bugs/0003-tool-arg-shape-rule-not-enforced.md) for a call whose
```

`src/parser/lexical-call-sites.ts:304-305`:

```ts
 *   4. `theta/parse/bare-object-literal` (bug 0016 part B; bug 0072) for EVERY
 *      DIRECT bare-object argument of a call whose callee is NOT (lexically)
```

`src/parser/lexical-call-sites.ts:120-127`:

```ts
  if (resolvesToRuntimeTool && insideParFor) {
    walkCtx.out.push({
      severity: "error",
      code: "theta/parse/session-tool-in-isolated-body",
      file: walkCtx.file,
      range: e.range,
      // DIAG-4: exact Message template from the registry row.
      message: `'${e.callee}' addresses the enclosing conversation and is not available inside a par for body`,
```

`src/parser/lexical-call-sites.ts:496-499`:

```ts
  switch (e.kind) {
    case "call": {
      const localBinder = locals.get(e.callee);
      checkCallSiteCall(e, localBinder, insideParFor, walkCtx);
```

The exact roster search `rg -n '^ \*   [1-4]\. `theta/parse/' src/parser/lexical-call-sites.ts` returns four hits, at lines 267, 276, 286, and 304. The isolation diagnostic at line 123 is not one of those four entries.

## Why this is a problem
This is a stale responsibility inventory: the stated count and numbered roster exclude the runtime-tool isolation emission shown above. The finding concerns the header, not the live diagnostic branch or its specification.

## False-positive check
Read the numbered roster, the call-expression dispatch, and the runtime-tool emission together. The module-level header already mentions the isolation code, so this is not a request to introduce a new diagnostic. `git log --oneline -S 'emits four registered codes' -- src/parser/lexical-call-sites.ts` and `git log --oneline -S 'session-tool-in-isolated-body' -- src/parser/lexical-call-sites.ts` both identify extraction commit `336b8de4`; `git show 336b8de4:src/parser/lexical-call-sites.ts` contains both the four-code claim and the isolation emitter. No deadness claim is made.

## Triage
verdict: confirmed — All excerpts and stated searches reproduce: the function header counts and lists four codes, but its call dispatch reaches checkCallSiteCall, which also emits theta/parse/session-tool-in-isolated-body with insideParFor set by the par-for arm; this is a mechanically stale responsibility inventory in src/, present since 336b8de4, with no existing finding tracking this root cause. (triage: claude-opus-5-5)
