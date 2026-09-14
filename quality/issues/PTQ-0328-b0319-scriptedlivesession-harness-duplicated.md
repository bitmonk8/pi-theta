---
id: PTQ-0328
title: tests/b0319 redeclares b0288's ScriptedLiveSession prompt-turn harness verbatim, and b0414 copies it a third time
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0288-prompt-turn-completion-witness.test.ts:106-111
  - tests/b0288-prompt-turn-completion-witness.test.ts:192-203
  - tests/b0288-prompt-turn-completion-witness.test.ts:367-388
  - tests/b0288-prompt-turn-completion-witness.test.ts:392-400
  - tests/b0288-prompt-turn-completion-witness.test.ts:451-460
  - tests/b0319-prompt-bidirectional-ctx-abort-witness.test.ts:121-126
  - tests/b0319-prompt-bidirectional-ctx-abort-witness.test.ts:169-188
  - tests/b0319-prompt-bidirectional-ctx-abort-witness.test.ts:254-275
  - tests/b0319-prompt-bidirectional-ctx-abort-witness.test.ts:338-346
  - tests/b0319-prompt-bidirectional-ctx-abort-witness.test.ts:379-387
  - tests/b0414-preabort-send-issued-witness.test.ts:95-100
  - tests/b0414-preabort-send-issued-witness.test.ts:131-142
  - tests/b0414-preabort-send-issued-witness.test.ts:156-167
  - tests/b0414-preabort-send-issued-witness.test.ts:246-267
  - tests/b0414-preabort-send-issued-witness.test.ts:271-279
sites: 15                    # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260914091051
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-14
fix_skips: 1
---

# tests/b0319 redeclares b0288's ScriptedLiveSession prompt-turn harness verbatim, and b0414 copies it a third time

## Observation
tests/b0319-prompt-bidirectional-ctx-abort-witness.test.ts declares its own
`ANTHROPIC_MODEL` constant, `SessionEntryDouble`/`TurnState` interfaces, a
`ScriptedLiveSession` class, and module-scope `parseDeps()`/`parse()`/`ajv()`/
`piDouble()` functions that are byte-for-byte identical to the same-named
declarations in tests/b0288-prompt-turn-completion-witness.test.ts. b0319's own
doc comment on the class (lines 182-188) states it is "Copied from
`tests/b0288-prompt-turn-completion-witness.test.ts`'s `ScriptedLiveSession` and
reduced to the fields bug 0319 reads." A third file,
tests/b0414-preabort-send-issued-witness.test.ts, redeclares the identical
`ANTHROPIC_MODEL` constant, the identical `SessionEntryDouble`/`TurnState`
interfaces, the identical `#appendUser`/`#appendAssistant`/`#append` private
methods, and the identical `parseDeps()` function — its own doc comment (lines
156-167) states its `ScriptedLiveSession` "Combines the bug-0288
`ScriptedLiveSession` … with the bug-0319 `sends: string[]` send-attempt
observable." No `tests/helpers/` module holds any part of this scaffold; each of
the three files keeps its own full copy. `grep -rn "^class ScriptedLiveSession"
tests/*.test.ts` finds exactly these three declarations.

## Evidence

### `ANTHROPIC_MODEL` — identical in all three files
tests/b0288-prompt-turn-completion-witness.test.ts:106-111:
```
const ANTHROPIC_MODEL = {
  id: "m1",
  api: "anthropic-messages",
  provider: "anthropic",
  strictCapable: true,
};
```
tests/b0319-prompt-bidirectional-ctx-abort-witness.test.ts:121-126 — identical
text. tests/b0414-preabort-send-issued-witness.test.ts:95-100 — identical text:
```
const ANTHROPIC_MODEL = {
  id: "m1",
  api: "anthropic-messages",
  provider: "anthropic",
  strictCapable: true,
};
```

### `SessionEntryDouble` / `TurnState` — identical in all three files
tests/b0288-prompt-turn-completion-witness.test.ts:192-203:
```
interface SessionEntryDouble {
  readonly type: "message";
  readonly id: string;
  readonly parentId: string | undefined;
  readonly message: Record<string, unknown>;
}

/** An in-flight scripted turn: its script plus polls elapsed since the milestone. */
interface TurnState {
  readonly script: TurnScript;
  polls: number;
}
```
tests/b0319-prompt-bidirectional-ctx-abort-witness.test.ts:169-180 — identical
text (confirmed by direct comparison). tests/b0414-preabort-send-issued-witness.test.ts:131-142 —
identical text:
```
interface SessionEntryDouble {
  readonly type: "message";
  readonly id: string;
  readonly parentId: string | undefined;
  readonly message: Record<string, unknown>;
}

/** An in-flight scripted turn: its script plus polls elapsed since the milestone. */
interface TurnState {
  readonly script: TurnScript;
  polls: number;
}
```

### b0319's own admission
tests/b0319-prompt-bidirectional-ctx-abort-witness.test.ts:182-188:
```
/**
 * The live user-session double, driven by a per-turn lifecycle script. Copied
 * from `tests/b0288-prompt-turn-completion-witness.test.ts`'s
 * `ScriptedLiveSession` and reduced to the fields bug 0319 reads:
 * `isIdle()` mirrors the host (`isIdle === !isStreaming`), and one
 * `session.tick()` per poll interval advances the scripted lifecycle.
 */
```

### `ScriptedLiveSession`'s private append trio — identical in all three files
tests/b0288-prompt-turn-completion-witness.test.ts:367-388:
```
  #appendUser(text: string): void {
    this.#append({ role: "user", content: [{ type: "text", text }], timestamp: 0 });
  }

  #appendAssistant(text: string | undefined): void {
    this.#append({
      role: "assistant",
      content: text !== undefined ? [{ type: "text", text }] : [],
      api: "anthropic-messages",
      provider: "anthropic",
      model: "m1",
      stopReason: "stop",
      timestamp: 0,
    });
  }

  #append(message: Record<string, unknown>): void {
    const id = `e${this.entries.length + 1}`;
    const parentId = this.entries.length === 0 ? undefined : `e${this.entries.length}`;
    this.entries.push({ type: "message", id, parentId, message });
  }
}
```
tests/b0319-prompt-bidirectional-ctx-abort-witness.test.ts:254-275 — identical
text (verified by direct comparison, same 22 lines). tests/b0414-preabort-send-issued-witness.test.ts:246-267 —
identical text (verified by direct comparison, same 22 lines).

### b0414's own admission
tests/b0414-preabort-send-issued-witness.test.ts:156-167:
```
/**
 * The live user-session double, driven by a per-turn lifecycle script and
 * AMBIENT-BUSY at drive entry. Combines the bug-0288 `ScriptedLiveSession`
 * (`isIdle()` mirrors the host `isIdle === !isStreaming`; one `tick()` per poll
 * interval advances the scripted lifecycle; the `ambientRunActive` shape — a run
 * this drive did NOT issue that is in flight at drive entry) with the bug-0319
 * `sends: string[]` send-attempt observable.
 *
 * The ambient run ends at `ambientEndsAtTick`, firing `onAmbientEnd` in that same
 * tick, so the pre-send gate's exit re-check can read the session idle in the
 * very tick the abort was observed.
 */
```

### `parseDeps()` — identical in all three files
tests/b0288-prompt-turn-completion-witness.test.ts:392-400:
```
function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}
```
tests/b0319-prompt-bidirectional-ctx-abort-witness.test.ts:338-346 — identical
text. tests/b0414-preabort-send-issued-witness.test.ts:271-279 — identical
text:
```
function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}
```

### `piDouble()` — identical in b0288 and b0319 (b0414 does not use this seam directly)
tests/b0288-prompt-turn-completion-witness.test.ts:451-460:
```
function piDouble(session: ScriptedLiveSession): ExtensionAPI {
  return {
    sendUserMessage: (content: string): void => session.sendUserMessage(content),
    getActiveTools: (): string[] => [],
    setActiveTools: (): void => {},
    registerTool: (): void => {},
    on: (): void => {},
    sendMessage: (): void => {},
  } as unknown as ExtensionAPI;
}
```
tests/b0319-prompt-bidirectional-ctx-abort-witness.test.ts:379-387 — identical
text.

Additionally, `parse()` (b0288:403-413 / b0319:348-355 / b0414:281-288) and
`ajv()` (b0288:416-422 / b0319:357-363 / b0414:290-296) carry the same
identical bodies in all three files; these two are also part of the
suite-wide `ajv(): AjvSchemaValidator { … }` idiom (`grep -c "^function ajv"
tests/*.test.ts` → 50 files), so they are named here for completeness but are
not the load-bearing evidence — the `ScriptedLiveSession` class, its
interfaces, and its three private methods are specific to this three-file
lineage only (exactly 3 hits for `^class ScriptedLiveSession` in the whole
tests/ tree).

## Why this is a problem
This is the D7 "Boilerplate duplication" class: a near-identical harness
sequence (session-lifecycle double, its supporting interfaces, and the
document-parsing/AJV/pi-tool-surface factories around it) is repeated across
three test files with no `tests/helpers/` home. The repetition count is 3
(tests/b0288-prompt-turn-completion-witness.test.ts,
tests/b0319-prompt-bidirectional-ctx-abort-witness.test.ts,
tests/b0414-preabort-send-issued-witness.test.ts), and two of the three files
say so themselves in their own header comments, naming the sibling file(s)
they copied from rather than a shared module they import from. The codebase
already uses this exact pattern (a hand-written double plus a handful of
one-line factories, centralised once and imported by every consumer) for
other same-shaped families: tests/helpers/thetalib-load-harness.ts,
tests/helpers/compose-workspace-harness.ts and
tests/helpers/tool-call-dispatch-harness.ts each hold one bespoke harness that
otherwise would have been repeated across their own multi-file bug-test
families.

## Suggested direction (non-binding, optional)
A `tests/helpers/` module holding the shared parts named above — the
`ScriptedLiveSession` scaffold (its interfaces and its three append methods,
which none of the three files' own witness logic touches), and the
`parseDeps`/`parse`/`ajv` trio — would give this growing family the same home
already given to the other bug-numbered harness families; each file's own
`ctxDouble`, `driveLiveTheta`, clock choice and `piDouble` variant (b0319 and
b0414 add fields `ScriptedLiveSession` v0288 does not carry) would stay local,
since that is where the three files' behaviour actually diverges.

## False-positive check
- Gate-pin: none of the three files matches `*gate*.test.ts` or the
  cross-cutting-gate family named in the carve-outs; `ls tests/*gate*.test.ts`
  does not include any of the three.
- Recording-double / MUST-NOT witness: this finding is not about an assertion
  that cannot fail — it is about setup code (a session double and harness
  factories) being redeclared, not about what the doubles are used to prove;
  the carve-out for negative witnesses through recording doubles does not
  apply.
- docs/bugs/ signature search: `grep -rn "b0319-prompt-bidirectional-ctx-abort-witness\|b0288-prompt-turn-completion-witness\|b0414-preabort-send-issued-witness" docs/bugs/*.md` shows
  each file is named in its own bug doc's witness/verification section
  (docs/bugs/0319-prompt-mode-bidirectional-ctx-abort-unwired.md:243,
  docs/bugs/0288-multi-query-prompt-drive-completes-without-the-second-querys-reply.md:458,
  docs/bugs/0414-preabort-send-issued-run-never-torn-down.md:185) and in
  passing by several unrelated bug docs that reuse the same harness shape —
  none of those citations concerns the harness-duplication observation made
  here, and this finding proposes no merge, rename, or deletion of any of the
  three test files or their cells, only that the shared scaffold move to a
  helper — so the "pinned by citation" carve-out is not triggered.
- coverage-matrix.md citation search: `grep -n
  "b0319-prompt-bidirectional-ctx-abort-witness\|b0288-prompt-turn-completion-witness\|b0414-preabort-send-issued-witness"
  docs/reference/coverage-matrix.md` → no hits.
- Already-filed/resolved check: searched quality/resolved, quality/issues and
  quality/intake for "b0288", "b0414" and "ScriptedLiveSession" — no existing
  finding addresses this lineage (quality/resolved/PTQ-0231 concerns a
  different, already-fixed tautological assertion inside b0319 at lines
  476-514, unrelated to the harness section cited here). `git log` shows
  tests/b0319-prompt-bidirectional-ctx-abort-witness.test.ts was authored
  2026-09-01 and has been touched by exactly one later quality-fix commit
  (removing that unrelated tautology); tests/b0288-prompt-turn-completion-witness.test.ts
  was last reviewed by D7 in wave qw20260912091742 (recorded in
  quality/tmp/qw20260912091742/D7/shard-06.txt), which predates b0319's fix
  commit (2026-09-12 15:53) and so never had the opportunity to compare the
  two files.
- Coverage drift check: this finding does not assert any behaviour is
  untested — every cited line is setup/fixture code, not a missing test or an
  untested path.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — verified: all 15 excerpts match verbatim at their cited lines in b0288/b0319/b0414 (ANTHROPIC_MODEL, SessionEntryDouble/TurnState, the #appendUser/#appendAssistant/#append trio, parseDeps, piDouble), `^class ScriptedLiveSession` greps to exactly 3 hits repo-wide, and b0319/b0414's own doc comments self-admit copying from b0288 (and each other); helper precedent (thetalib-load-harness.ts etc.) exists and is imported elsewhere; no D7 carve-out applies (not gate tests, not a recording-double witness, no coverage-matrix/bug-doc pin, no merge/rename proposed) and not a duplicate of PTQ-0231 (different lines, unrelated tautology) or the sibling VirtualClock/FakeClock intake filing (different double) (triage: claude-opus-5)

## Fix attempts
- qw20260914091051: skipped — PTQ-0327: Re-verified against current code — reproduced exactly as filed (local REGISTRY_PAGE/RegistryRow/REGISTRY rebuild in tests/arg-mismatch-diagnostic-count-by-surface.test.ts duplicating the canonical superset in tests/helpers/registry-oracle.ts). Replaced the local declarations with `import { REGISTRY } from "./helpers/registry-oracle"`; dropped the now-unused readFileSync/fileURLToPath/parseRegistry imports; kept REGISTRY_PAGE only as the page name cited in harness-failure messages. Behavior identical (98/98 tests still pass); no tests deleted. / PTQ-0328: Re-verified — all 15 cited excerpts matched verbatim across b0288/b0319/b0414. Created tests/helpers/scripted-live-session-harness.ts holding the byte-identical ANTHROPIC_MODEL constant, SessionEntryDouble interface, a generic TurnState<TScript> (generic because each file's own TurnScript shape differs), the appendUserEntry/appendAssistantEntry pair (replacing each file's private #appendUser/#appendAssistant/#append trio), and the parseDeps/parse/ajv harness trio; all three files now import these instead of redeclaring them. Left each file's own ScriptedLiveSession behaviour (its TurnScript shape, sendUserMessage/tick/isIdle), ctxDouble, driveLiveTheta, piDouble, and clock choice local, per the issue's own reasoning that that is where the three files' behaviour actually diverges. No test cells/it/describe blocks changed or deleted, only shared setup/fixture code moved — no orphaned tests to remove. / PTQ-0329: Re-verified — reproduced exactly (hand-rolled VirtualClock/PendingTimer scheduler in b0319, zero FakeClock references anywhere in the file). Replaced VirtualClock with the canonical FakeClock (tests/helpers/fake-clock.ts). Since FakeClock.advance(ms) fuses "move time" and "fire due timers" into one call (unlike VirtualClock's split advance()/fireDue()), the pump now increments its own local `quanta` counter and runs session.tick()/onQuantum BEFORE calling clock.advance(POLL_INTERVAL_MS), preserving the exact happens-before ordering (abort set before the timer that would observe it fires) that cells (A)/(B)/(C)/(D)/(F) depend on. rootDouble now passes the FakeClock instance directly as RuntimeRoot.clock instead of hand-adapting now/wallNow/setTimeout/clearTimeout. All 7 b0319 cells still pass unchanged. / All three issues are lens D7 (tests-only); no src/ production code was touched, no quality/ files were edited, and only the files the issues themselves cite (plus the one new helper module) were modified — confirmed via `git status --porcelain`. / Verification: `npx tsc --noEmit && npm test` green (662/662 test files, 11180/11180 tests). Earlier repeated full-suite runs showed sporadic, unrelated timeouts (different tests each time: shared-subtree-judged-once-per-pass-not-once-per-path.test.ts, production-tools-load-resolution.test.ts, extension-tool-unreachable-load-refusal-e2e.test.ts — none touching anything in this change, and all passing when run in isolation). Process inspection during a failing run found a concurrent sibling lane (temp dir qfix-qw20260914091051-d9__src__extension__production-composition.ts) running its own full `npm test` on the same 32-core machine at the same time, explaining the CPU contention. A subsequent run with no code changes in between was fully green, confirming the flakiness was environmental (shared-machine contention from a sibling lane), not caused by this fix.
