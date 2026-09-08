---
id: PTQ-0112
title: Spec line-number citations in system-note-channel.ts and theta-composition-producer.ts point at the wrong lines of runtime-event-channel.md
lens: D2                     # the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/system-note-channel.ts:255-260
  - src/extension/system-note-channel.ts:413-417
  - src/extension/theta-composition-producer.ts:147-152
sites: 3
fix_scope: cross-module      # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# Spec line-number citations in system-note-channel.ts and theta-composition-producer.ts point at the wrong lines of runtime-event-channel.md

## Observation
Comments in two in-scope modules cite exact line numbers of
`docs/spec_topics/pi-integration-contract/runtime-event-channel.md` as
navigation anchors for the rules they implement. Three citations no longer
point at those rules: the display-gate-across-the-whole-fallback rule cited as
`:134-135` (twice) lives at lines 136-137, the `message = content` rule cited
as `:135` lives at line 137, and the binder-failure `invocation_id`/`theta`
sourcing rule cited as `:83` lives at line 91 (the `invocation_id` field row is
line 80). The cited lines today hold the best-effort `pi.sendMessage`
paragraph, a blank line, and the `RuntimeEvent.message` field row respectively.

## Evidence
Citation 1 — src/extension/system-note-channel.ts:255-260 (the
`emitDeliveryFailed` deps doc):

```ts
   * Bug 0453: the display-aware off-channel realization of the step-2
   * delivery-failed diagnostic. When present, `sendSystemNote` routes step 2
   * here with the originating note's `display`, so a `display: false` note's
   * content is NOT toasted (runtime-event-channel.md:134-135) — it goes stderr-only
   * (headless) / silent (UI), while the structured diagnostic is still carried
   * (message = content, :135). Absent means the pre-0453 `emitDiagnostic` path
```

Citation 2 — src/extension/system-note-channel.ts:413-417 (the fallback
step-2 arm):

```ts
      // Bug 0453: the off-channel realization must honour the originating note's
      // display gate across the WHOLE fallback (runtime-event-channel.md:134-135) —
      // a display:false note's gated content MUST NOT surface transiently on
      // any arm, though the structured diagnostic is still carried (message=content,
      // :135). A display-aware sink skips the toast for display:false and
```

What the cited doc lines hold today
(docs/spec_topics/pi-integration-contract/runtime-event-channel.md, checked
with `sed -n '134,137p'`): line 134 is the best-effort paragraph ("The
`pi.sendMessage` call for `theta-system-note` is treated as best-effort. …");
line 135 is blank; line 136 is fallback step 1 with the "Skipped when
`display: false`" rule; line 137 is fallback step 2 with "`message` set to the
original note's `content`" and "MUST NOT surface the original note's `content`
on `ctx.ui.notify` when the original note's `display` was `false` … holds
across the WHOLE fallback". The cited rules are at 136-137, not 134-135.

Citation 3 — src/extension/theta-composition-producer.ts:147-152 (the
`BinderRunInput.invocationTicket` doc):

```ts
  /**
   * The pre-binder `ActiveInvocationRegistry` ticket `beginInvocation` opened at
   * dispatch entry (mirrors `ConversationBindInput.invocationTicket`): a binder
   * failure's runtime event sources `invocation_id`/`theta` from THIS entry
   * (runtime-event-channel.md:83), not a fresh mint. Absent on harnesses that
   * call `runBinder` directly without a dispatch-level `beginInvocation`.
   */
```

Doc line 83 today is the `RuntimeEvent.message` field row ("message: string; //
the same message string surfaced through the user-facing template …"). The
binder-failure sourcing rule ("for these events `invocation_id` and `theta` are
read from the invocation's ActiveInvocationRegistry entry") is the
"**Binder-failure sourcing.**" paragraph at line 91; the `invocation_id` field
row is line 80.

## Why this is a problem
Stale navigation anchors: a line-number citation exists solely to take the
reader to the rule; each of these three now lands on unrelated content (a
different paragraph, a blank line, a different field row), so the anchor
misleads instead of helping. The doc file moved under the citations and the
comments were not updated — the same drift mechanics as the confirmed sibling
filings on hardcoded line citations (qw20260907130901-d2-02-wire-walk-line-citations-drifted,
qw20260907183353-d2-02-composition-line-citations-drifted), neither of which
cites these files or these doc anchors.

## Suggested direction (non-binding, optional)
Re-point the three citations at the rules' current locations, or replace the
raw line numbers with the doc's stable anchors/step names (e.g. "fallback steps
1-2", "Binder-failure sourcing", PIC-54's section) so the references survive
future doc edits.

## False-positive check
- Verified doc content at every cited and corrected line with `sed -n` against
  the current tree: :83 = `message` field row; :80 = `invocation_id` field row;
  :91 = "Binder-failure sourcing." paragraph; :134 = best-effort paragraph;
  :135 = blank; :136-137 = the two fallback steps carrying the display-gate and
  message=content rules quoted by the comments.
- Confirmed no other runtime-event-channel.md line citation inside the review
  scope drifted: factory.ts (:132) and production-composition.ts (:134-135,
  :135) and production-theta-producer.ts (:83, :130) carry the same pattern but
  are outside this brief's file list, so they are not cited here (noted for a
  wave covering those files).
- Duplicate-filing check: the two prior citation-drift findings list only
  production-composition.ts / wire-walk sites; no overlap with these three.
- Comments only; no behaviour claim.

## Triage
verdict: confirmed — re-verified all three anchors mispoint in the current tree by grep (:83 is the `message` field row while the binder-failure sourcing rule is at :91; :134-135 are the best-effort paragraph and a blank line while the display-gate rules are at :136-137; :135 is cited for message=content, which is at :137), but the filing's drift etiology is refuted: `git show` at and before the authoring commits (daeb9a0a for sites 1-2, ec2a8ac2 for site 3) shows the same numbering, so these anchors were wrong at birth rather than drifted — which makes the suggested stable-anchor/step-name form the right fix, not merely refreshed numbers (triage: claude-opus-5)
