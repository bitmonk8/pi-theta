# Bug 0491 — a theta can pin its model but not its thinking level: the reasoning effort a theta's model runs at is whatever the host happens to resolve, and a prompt-mode `model:` window silently changes the user's session thinking level

- **Status:** fixed (0.491.0) — all six fix-direction items landed, plus item 7 (the PIC-64 bridge; reviewer round 1 F1, scope widened by operator approval 2026-09-25).
- **Vehicle ruling (operator, 2026-09-25):** `thinking` is an additive vocabulary field; it lands through this bug rather than an RFC and is tagged theta 1.6 in the spec.
- **Sev/Diff estimate:** S2/D2 — S2: the thinking level is a first-order
  determinant of a theta's behaviour, and a theta has no way to state it.
  The 2026-09-25 D4-lens benchmark (140 audited runs, 5 per config) measured
  opus-5-5 on the same shard at recall 0.00 (low), 0.10 (medium), 0.17
  (high), 0.40 (xhigh), 0.42 (max): a 4× recall spread driven by the level
  alone, with no model change. A lens pinned `model: anthropic/claude-opus-5-5`
  today runs at whatever level the host resolves: in a subagent child the
  child's own settings (`modelThinkingLevels["provider/id"]`, else
  `defaultThinkingLevel`); in prompt mode the user session's current level.
  Both vary per machine and per session, so the same theta produces
  materially different results for different operators. Some models also
  reject levels outright (claude-fable-5-1 answers HTTP 400 "Invalid effort
  level" above `medium` on the operator's account), so an inherited level
  can make a theta fail on one host and work on another. D2: one closed-set
  frontmatter field, one argv flag, one prompt-mode window beside the
  existing PIC-17 model window.
- **Where:**
  - `src/parser/frontmatter.ts` — the recognised-key arm chain has no
    `thinking` arm (a `thinking:` key is today an unknown-field warning and
    is ignored).
  - `src/runtime/subagent-argv.ts` `assembleSubagentArgv` — pushes
    `--provider/--model` only; the child pi resolves its level from its own
    settings. The pi CLI already accepts `--thinking <level>`.
  - `src/extension/live-prompt-query-driver.ts` — the PIC-17 model window
    (bug 0479) swaps `pi.setModel(target)` in and restores the ambient model
    afterwards. Pi's `setModel` re-derives the thinking level for the model
    it switches to (per-model setting, else global default;
    agent-session.js `setModel` → `_getThinkingLevelForModelSwitch`), so the
    restore can leave the user session on a different thinking level than it
    had before the drive: a user who had manually set a level loses it to
    the per-model default. Nothing snapshots or restores the level.

## Expected

- A theta can declare `thinking: off | minimal | low | medium | high | xhigh | max`
  (pi's `ThinkingLevel` set). Present, it applies to every query of the
  theta the way `model:` does; the host clamps it to the model's supported
  levels. Absent, behaviour is unchanged (the host's own resolution applies).
- Any other value — an unknown level string, a non-string scalar, a
  non-scalar — is a load error and the theta is not registered (the
  closed-set shape `mode:` / `bind_context:` / `bind_echo:` already use).
- Subagent mode: the child is launched with `--thinking <level>`.
- Prompt mode: the level is swapped in for each turn after any model swap
  and the session's own level (snapshotted before the window) is restored
  after the model restore. The restore runs whenever the level differs at
  window exit, also when only `model:` swapped, so a `model:` pin no longer
  changes the user's thinking level as a side effect.
- The off-session forced respond turn (`complete()` with a forced tool
  choice) is unchanged: extended thinking is not combinable with a forced
  tool choice on the Anthropic API, and that turn passes no reasoning
  option today.

## Fix direction

1. Parser: a `thinking` arm plus the closed-set value refusal
   (`theta/load/unknown-thinking-value`, E); `ParsedFrontmatter.thinking`.
2. Subagent argv: `thinking?` input → `--thinking <level>` after `--model`;
   the spawn regime passes `theta.frontmatter.thinking`.
3. Prompt mode: a thinking window in `tool-registration.ts` beside
   `withModelWindow` (apply after the model swap, restore after the model
   restore, a single re-attempt then `theta/runtime/thinking-restore-failed`
   (E), mirroring PIC-8-model; the restore never masks the turn's outcome).
4. Spec: frontmatter field-contract row (+ reference transcription),
   PIC-17 thinking paragraph, subagent argv notation, both new registry
   rows (+ reference mirror).
5. Witnesses: parse cells (every level registers; bad values refuse),
   argv cells (present → flag; absent → no flag), prompt-mode cells over the
   real producer (pin swapped in and restored; absent → inert; `model:`-only
   swap restores the pre-drive level; restore failure → diagnostic, outcome
   unmasked).
6. Repin the D4 lens (`.pi/theta/workers/lens-d4-duplication.theta`) to
   `model: anthropic/claude-opus-5-5`, `thinking: xhigh` — 0.40 mean recall (95% of opus-5-5 max's 0.42) at
   51% of max's cost (~$6.80 and ~19 min per shard), with a third of its spread.
7. The PIC-64 host-loop bridge (`production-host-loop-dispatch.ts`) swaps the
   session to its bridge model and back for every code-side extension-tool
   call. Registered `reasoning: false`, the switch in forced the level to `off`
   and the switch back re-derived a per-model or default level, so a
   session-only level was lost after any such call. Fix (reviewer rounds 2 and
   3): the bridge registration now mirrors the session model's reasoning
   capability (reasoning-capable with every level supported, via
   `thinkingLevelMap`, when the session model reasons; non-reasoning otherwise),
   so a pi < 0.84.3 host (outgoing-model derivation, persistence of every level
   change as the global `defaultThinkingLevel`) sees no change and writes
   nothing for either kind of session model; and the dispatch snapshots the
   level at entry and restores it after the model restore for pi ≥ 0.84.3
   hosts. Witnessed in `tests/production-host-loop-dispatch.test.ts` over a
   fake host emulating both generations; mutants for the always-reasoning,
   no-map and never-reasoning registrations are each red.
