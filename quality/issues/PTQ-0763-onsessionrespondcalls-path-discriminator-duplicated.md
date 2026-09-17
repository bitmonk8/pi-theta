---
id: PTQ-0763
title: The on-session respond-tool-call path discriminator is restated byte-for-byte between the b0480 and b0481 typed-query live cells
lens: D7
status: open
verdict: confirmed
locations:
  - tests/live/b0480live-responses-typed-query-live-cell.test.ts:167-181
  - tests/live/b0481live-fable51-typed-query-degraded-live-cell.test.ts:130-144
sites: 2
fix_scope: localized
d4_class: clone
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# The on-session respond-tool-call path discriminator is restated byte-for-byte between the b0480 and b0481 typed-query live cells

## Observation
Both `tests/live/b0480live-responses-typed-query-live-cell.test.ts` and `tests/live/b0481live-fable51-typed-query-degraded-live-cell.test.ts` need the same discriminator: proof that a typed query's binding came from the off-session forced `complete()` dispatch and not from a free-phase turn that volunteered the on-session respond tool. Each file slices the entries appended by its one drive, casts them to the same anonymous shape, and filters for an assistant message whose content array holds a `toolCall` entry whose name starts with `__theta_respond_`. The two blocks are identical token-for-token.

## Evidence
tests/live/b0480live-responses-typed-query-live-cell.test.ts:167-181:
```
      const entriesBefore = handle.sessionManager.getEntries().length;
      const turn = await driveSlashCaptureTurn(handle, `/${STEM}`);
      const appended = handle.sessionManager.getEntries().slice(entriesBefore) as readonly {
        readonly type?: string;
        readonly message?: { readonly role?: string; readonly content?: unknown };
      }[];
      const onSessionRespondCalls = appended.filter(
        (e) =>
          e.type === "message" &&
          e.message?.role === "assistant" &&
          Array.isArray(e.message.content) &&
          (e.message.content as { type?: string; name?: string }[]).some(
            (c) => c.type === "toolCall" && String(c.name ?? "").startsWith("__theta_respond_"),
          ),
      ).length;
```

tests/live/b0481live-fable51-typed-query-degraded-live-cell.test.ts:130-144 (same 14 lines, verbatim):
```
      const entriesBefore = handle.sessionManager.getEntries().length;
      const turn = await driveSlashCaptureTurn(handle, `/${STEM}`);
      const appended = handle.sessionManager.getEntries().slice(entriesBefore) as readonly {
        readonly type?: string;
        readonly message?: { readonly role?: string; readonly content?: unknown };
      }[];
      const onSessionRespondCalls = appended.filter(
        (e) =>
          e.type === "message" &&
          e.message?.role === "assistant" &&
          Array.isArray(e.message.content) &&
          (e.message.content as { type?: string; name?: string }[]).some(
            (c) => c.type === "toolCall" && String(c.name ?? "").startsWith("__theta_respond_"),
          ),
      ).length;
```

b0481live-fable51-typed-query-degraded-live-cell.test.ts:44-48 names the mirror directly: "PATH DISCRIMINATOR (same shape as the b0480 cell): the settled transcript must carry NO on-session `__theta_respond_*` call — a volunteering free phase would bind without the forced dispatch and measure nothing about the degradation."

## Why this is a problem
The two files' own header comments identify this block as the same discriminator applied to a second model (`b0481` explicitly: "same shape as the b0480 cell"), and the two 14-line bodies match token-for-token including the anonymous cast shape and the `__theta_respond_` prefix check. Both files already import shared helpers from `./harness` (`bootShippedExtension`, `driveSlashCaptureTurn`, `plantThetaWorkspace`, `requireLiveProvider`), so the natural home for a discriminator two typed-query live cells need identically is that same module, as one exported function taking the handle and a since-index and returning the on-session-respond-call count.

## Suggested direction (non-binding, optional)
Nothing about the block differs per file — a `countOnSessionRespondCalls(handle, entriesBefore)`-shaped export in `tests/live/harness.ts` would let both cells call one function instead of each carrying its own copy of the cast and filter.

## False-positive check
Gate-pin check: neither file matches `*gate*.test.ts` or kin. Recording-double check: this is a read of real transcript entries the live host actually produced, not a recording double's call log — not a negative-witness assertion (it computes a count, and the count is used both to fail loudly on a non-zero value and as a re-run signal, not as a "never called" witness on a fake). docs/bugs/ signature search: `docs/bugs/0481-typed-query-dies-on-model-level-forced-tool-choice-rejection.md` documents the degraded-dispatch fix itself but does not call for this discriminator to be restated per file. coverage-matrix/bug-doc citation search: neither file is cited by name in `docs/reference/coverage-matrix.md` for this specific block; this finding does not propose merging, renaming, or deleting either test, only that the shared block could resolve to one helper.

## Triage
<!-- pending -->
verdict: confirmed — independently re-verified: sed-extracted b0480:167-181 and b0481:130-144 diff clean (15 byte-identical lines: entries slice, anonymous cast, assistant/toolCall/`__theta_respond_` filter, `.length`); b0481:24 header self-declares "same shape as the b0480 cell"; grep of `__theta_respond_`/`getEntries().slice` across tests/live shows no third copy and tests/live/harness.ts exports no respond-call counter (classifyLastTurn classifies settlement only), so a shared helper is a fresh two-caller extraction; D7 boilerplate-duplication class, both hosts under tests/, neither a *gate* test, reads a real host transcript (not a recording-double negative witness), bug docs 0480/0481 cite both files as witnesses but the fix is helper extraction not merge/rename/delete and failLoudly posture is untouched; no existing PTQ names onSessionRespondCalls or either file (triage: claude-fable-5-1)
