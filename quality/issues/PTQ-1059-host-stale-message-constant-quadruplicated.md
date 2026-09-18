---
id: PTQ-1059
title: hot-reload-stale-ctx-replacement.test.ts redeclares the byte-exact HOST_STALE_MESSAGE constant already hand-declared in three sibling files, none importing a shared source
lens: D7
status: open
verdict: confirmed
locations:
  - tests/hot-reload-stale-ctx-replacement.test.ts:86-87
  - tests/hot-reload-stale-quiesce-arms.test.ts:26-28
  - tests/system-note-channel.test.ts:337-338
  - tests/watcher-terminated-recovery.test.ts:201-203
sites: 4
fix_scope: cross-module
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# hot-reload-stale-ctx-replacement.test.ts redeclares the byte-exact HOST_STALE_MESSAGE constant already hand-declared in three sibling files, none importing a shared source

## Observation
`tests/hot-reload-stale-ctx-replacement.test.ts` declares a module-local
`const HOST_STALE_MESSAGE` holding the host's stale-ctx error text, with a
doc comment stating it is "byte-exact from the installed host package". The
identical string (verified character-for-character) is independently
hand-declared as the same constant name in three other test files. Two of
those three even carry a one-line doc comment pointing at another of the
copies ("Byte-exact host stale-ctx message (see
tests/system-note-channel.test.ts).") without importing from it.
`tests/helpers/` exports no module that carries this string; each of the
four files re-types it from scratch.

## Evidence
`tests/hot-reload-stale-ctx-replacement.test.ts:75-87`:
```ts
 * `dist/core/agent-session.js` (the bare-dispose `invalidate(...)` call).
 */
const HOST_STALE_MESSAGE =
  "This extension ctx is stale after session replacement or reload. Do not use a captured pi or command ctx after ctx.newSession(), ctx.fork(), ctx.switchSession(), or ctx.reload(). For newSession, fork, and switchSession, move post-replacement work into withSession and use the ctx passed to withSession. For reload, do not use the old ctx after await ctx.reload().";
```

`tests/hot-reload-stale-quiesce-arms.test.ts:26-28`:
```ts
/** Byte-exact host stale-ctx message (see tests/system-note-channel.test.ts). */
const HOST_STALE_MESSAGE =
  "This extension ctx is stale after session replacement or reload. Do not use a captured pi or command ctx after ctx.newSession(), ctx.fork(), ctx.switchSession(), or ctx.reload(). For newSession, fork, and switchSession, move post-replacement work into withSession and use the ctx passed to withSession. For reload, do not use the old ctx after await ctx.reload().";
```

`tests/system-note-channel.test.ts:337-338`:
```ts
  const HOST_STALE_MESSAGE =
    "This extension ctx is stale after session replacement or reload. Do not use a captured pi or command ctx after ctx.newSession(), ctx.fork(), ctx.switchSession(), or ctx.reload(). For newSession, fork, and switchSession, move post-replacement work into withSession and use the ctx passed to withSession. For reload, do not use the old ctx after await ctx.reload().";
```

`tests/watcher-terminated-recovery.test.ts:201-203`:
```ts
  /** Byte-exact host stale-ctx message (see tests/system-note-channel.test.ts). */
  const HOST_STALE_MESSAGE =
    "This extension ctx is stale after session replacement or reload. Do not use a captured pi or command ctx after ctx.newSession(), ctx.fork(), ctx.switchSession(), or ctx.reload(). For newSession, fork, and switchSession, move post-replacement work into withSession and use the ctx passed to withSession. For reload, do not use the old ctx after await ctx.reload().";
```

Exact search: `grep -rn "^const HOST_STALE_MESSAGE\|^  const HOST_STALE_MESSAGE" tests/*.test.ts` returns exactly these four hits, one per file. `grep -rn "stale after session replacement" tests/helpers/*.ts` returns zero hits — no helper module carries this string.

## Why this is a problem
The exact same 470-character host error string is typed out four separate times across four test files, each under the same identifier name `HOST_STALE_MESSAGE`. Two of the four copies carry a doc comment naming a specific sibling copy as the source of truth ("see tests/system-note-channel.test.ts") but declare their own local constant anyway rather than importing one. A change to the host's wording (which all four copies independently describe as version-sensitive, needing to track the installed `@earendil-works/pi-coding-agent` package) has to be located and hand-edited at four sites instead of one.

## Suggested direction (non-binding, optional)
A single export in `tests/helpers/` (or a small dedicated module) carrying this string would let the two files that already point at `system-note-channel.test.ts` by comment import from that shared source instead of retyping it.

## False-positive check
- Gate-pin check: none of the four files match `*gate*.test.ts` or the named gate kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate, committed-fixture-parse-gate, registry-closed-set-corpus-gate).
- Recording-double check: not applicable — `HOST_STALE_MESSAGE` is a static string literal used to construct thrown/rejected errors in fixtures, not a recording double asserting a call never happened.
- docs/bugs/ signature search: `grep -rln "HOST_STALE_MESSAGE" docs/bugs/*.md` returns 0 hits — no documented correct-reason red cites this constant or its duplication.
- coverage-matrix/bug-doc citation search: `grep -n "hot-reload-stale-ctx-replacement.test.ts\|hot-reload-stale-quiesce-arms.test.ts\|system-note-channel.test.ts\|watcher-terminated-recovery.test.ts" docs/reference/coverage-matrix.md` was run; this finding proposes no merge, rename, or deletion of any file, `describe`, or `it` block — only that the shared string constant declaration could be centralised, leaving every test body and its citations untouched, so no coverage-matrix or bug-doc witness-list citation is disturbed.
- Coverage-drift check: the claim is entirely about a repeated constant DECLARATION; each copy is exercised by its own file's own tests, and no behaviour path is claimed untested.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: `const HOST_STALE_MESSAGE` is declared at exactly the four cited sites (:86/:27/:337/:202) and the mktemp-extracted literals are byte-identical (md5 6d334292, 367 bytes each — the filing's "470-character" is off but immaterial); every copy is live (used at :251, :105, :351/:379/:441, :211); `grep "stale after session replacement" tests/helpers/` → 0 hits, so no shared test-side source exists; all four landed in the same commit 28ce714d (same-commit repeated drift, not a per-file design); the one rationale the filing omitted — system-note-channel.test.ts:334-335 "Deliberately the full host literal rather than the src prefix constant" (src/extension/stale-ctx.ts:22-23 exports only `STALE_CTX_MESSAGE_PREFIX`) — argues against importing from src, not against a shared tests/helpers constant, so the suggested direction respects it; no gate file, no merge/rename/delete proposed, `docs/bugs/` → 0 hits, and no quality/issues, quality/resolved, or TRIAGE_LOG row references HOST_STALE_MESSAGE or the stale-ctx literal — not a duplicate (triage: claude-fable-5-1)
