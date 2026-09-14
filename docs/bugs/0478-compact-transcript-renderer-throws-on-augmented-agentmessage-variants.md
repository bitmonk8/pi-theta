# Bug 0478 — the binder's compact-transcript renderer assumes a four-arm `AgentMessage` union, but pi-coding-agent augments it with four more and three of them reach the renderer: a `bind_context: session` prompt-mode theta invoked after a `/compact` (or a branch return, or a `!cmd`) throws `TypeError: content is not iterable` inside binding

- **Status:** fixed (0.474.0) — option A (EXCLUDE), human-ruled 2026-09-14:
  out-of-set variants are dropped before the truncation walk; the closed
  role-tag set and every BNDR-7 rendering byte are unchanged.
- **Sev/Diff estimate:** S2/D2 — S2: the feature (`bind_context: session`)
  is completely non-functional in exactly the sessions where it is most
  wanted — any session long enough to have been compacted — and fails as a
  host-level throw inside binding, not as a theta-visible failure mode. Blast
  radius is bounded: the field is opt-in (`src/parser/frontmatter.ts:2371`
  retains `bindContext: "session"` only for a prompt-mode theta that declares
  it), no shipped theta declares it, and no test constructs any of the three
  roles (`rg 'role: "(compactionSummary|branchSummary|bashExecution)"' tests`
  → none). D2: one renderer / walk input-type narrowing plus a pre-walk
  filter, two spec sentences, one future-considerations entry.
- **Kind:** implementation defect against a normative totality clause whose
  premise is itself false in the spec — the spec says the renderer "is total
  over the `AgentMessage` arms listed" and lists four; pi's `AgentMessage` has
  seven at the pin (`Message`'s three plus the four augmentations). Spec gap
  in two places (see §Spec basis).
- **Spec basis** (at `276cd713`, v0.473.0 — pre-amendment wording):
  - [`binder/binder-model-and-context.md` §Compact-transcript format (normative)](../spec_topics/binder/binder-model-and-context.md#compact-transcript-format-normative)
    — line 47: "The rendering function MUST be total over the `AgentMessage`
    union returned by `buildSessionContext(...)` (`user` / `assistant` /
    `toolResult` / `custom` …)"; rule 3 (line 54) fixes the role-tag set to
    the closed set `[user]`, `[assistant]`, `[tool]`, `[custom:<type>]` and
    says nothing about any other `AgentMessage` variant; the BNDR-7 reference
    renderings bndr-7a…7j (lines 60–135) are normative and byte-pinned;
    BNDR-9 (line 137) is the `custom`-only pre-scan.
  - [`pi-integration-contract/host-interfaces-core.md` §`SessionContext` and the `.messages` element shape](../spec_topics/pi-integration-contract/host-interfaces-core.md#sessioncontext-shape)
    — line 11: "The compact-transcript renderer … is total over the
    `AgentMessage` arms listed below" — four arms listed. That premise is
    what is false: the list is the theta-load-bearing *subset*, not the
    union.
  - [`pi-integration-contract/host-prerequisites.md` — leading-`user`-message guarantee](../spec_topics/pi-integration-contract/host-prerequisites.md#messages-leading-user-message-presupposition)
    — "a non-empty array always begins with a `user` message". Observed
    false at the pin after a compaction: the compaction-aware entry list
    begins with the `compaction` entry, which projects to a leading
    `compactionSummary` message (see §Root cause).
- **Affected** (at `276cd713`):
  - `src/binder/compact-transcript.ts:238-253` — `renderMessage(message:
    AgentMessage)` switches on `message.role` for `user` / `assistant` /
    `toolResult`; its `default:` arm's comment reads "the remaining variant is
    `custom` (the `AgentMessage` union is `Message | CustomMessage`)" and
    casts to `{ customType, content }` → `renderCustom` → `textBody(content)`
    (`:169`) does `for (const block of content)` — a `TypeError` when
    `content === undefined`.
  - `src/binder/compact-transcript.ts:268-283` — the BNDR-9 pre-scan checks
    only `role === "custom"`, so the three foreign roles pass it untouched.
  - `src/binder/session-context-walk.ts` — the walk types its input as
    `readonly AgentMessage[]` and hands every element to the renderer; the
    foreign roles also count toward the token estimate.
  - `src/binder/turn-grouping.ts:28` — `groupMessagesIntoTurns` keys turn
    boundaries on `role === "user"` alone; a leading `compactionSummary`
    opens a turn of its own (grouping stays total, but the turn is not one
    the spec's turn definition describes).
  - `src/extension/production-theta-producer.ts:1440-1462` —
    `#buildBinderSessionContext`: when `fm.bindContext === "session" &&
    fm.mode === "prompt"`, `buildSessionContext(ctx.sessionManager.getEntries(),
    getLeafId()).messages` → `walkSessionContext` →
    `renderCompactTranscript(walk.includedMessages)` — the production route
    to the throw.
- **Host facts** (`@earendil-works/pi-coding-agent` 0.80.10, the pin):
  - `dist/core/messages.d.ts:49-56` — `declare module
    "@earendil-works/pi-agent-core" { interface CustomAgentMessages {
    bashExecution; custom; branchSummary; compactionSummary } }`, so
    `AgentMessage` = `Message` (user / assistant / toolResult) ∪ those four.
  - `dist/core/session-manager.js:165-190` —
    `sessionEntryToContextMessages` emits a `compactionSummary` message for
    every `compaction` entry, a `branchSummary` for every `branch_summary`
    entry, and passes a `bashExecution` `message` entry through unchanged
    (pi's own `convertToLlm`, `dist/core/messages.js`, is what later drops
    the `excludeFromContext` ones and re-roles the rest as `user` text —
    the binder never calls it).
- **Observed at:** v0.473.0 (`276cd713`); surfaced by the quality loop's D8
  lens (`quality/REVIEW_LOG.md`, wave `qw20260913154244`, routing note on
  `compact-transcript.ts#renderMessage`); reproduced offline (see
  §Reproduction).
- **Related:** BNDR-9 / bug 0398 (the `custom`-only pre-scan and its note
  shape — unchanged here); bug 0404 (custom-type-unsafe note matrix row —
  unchanged); the D8 routing note above.

## Summary

The renderer's `switch` on `message.role` is not exhaustive: it names three
arms and treats the `default:` as "must be `custom`". pi's `AgentMessage` is
an *open* interface union (`CustomAgentMessages` is augmentable), and
pi-coding-agent augments it with `compactionSummary`, `branchSummary`, and
`bashExecution` alongside `custom`. `buildSessionContext` emits all three
into `.messages`. None has a `content` field, so the `custom` cast's
`textBody(content)` iterates `undefined` and throws. Because the throw
happens inside `runBinder` before any provider call, the slash invocation
dies as an uncaught host error rather than a theta failure mode.

## Reproduction

Offline, against the renderer alone (the production route reaches the same
call with the same list):

```ts
renderCompactTranscript([
  { role: "user", content: "go", timestamp: 0 },
  { role: "compactionSummary", summary: "S", tokensBefore: 1, timestamp: 0 },
]);
// → TypeError: content is not iterable
```

In a live session: any prompt-mode theta with `params:` of ≥2 fields (so the
binder runs), `bind_context: session`, and a resolvable `bind_model:`;
`/compact`; then invoke the theta. `branch_summary` (returning from a branch)
and a `!cmd` (a `bashExecution` message entry) reach the renderer the same
way; a `!!cmd` (`excludeFromContext: true`) does too — the binder never runs
`convertToLlm`, so it does not benefit from pi's exclusion either.

## Expected behaviour

Binding proceeds: the transcript block is constructed without a throw, and
the closed role-tag set of rule 3 stays closed. The disposition of the three
foreign roles is the design ruling recorded in §Fix.

## Actual behaviour / root cause

See §Affected. Two independent premises are false: (1) the code comment /
cast in `renderMessage`'s `default:` arm (the union is `Message |
CustomAgentMessages[keyof CustomAgentMessages]`, not `Message |
CustomMessage`); (2) the spec's totality clause in `host-interfaces-core.md`
line 11 (the four listed arms are the load-bearing subset the renderer
*reads*, not the union it *receives*). Secondary: the leading-`user`
presupposition is observed false post-compaction because the compaction
entry projects to a leading `compactionSummary`; pi's `firstKeptEntryId`
cut point (`dist/core/compaction/compaction.js` `findCutPoint`) is a
turn-start entry when one exists, so the first *in-set* message after the
summary is a `user` message.

## Non-goals

- Any new diagnostic code (the closed-set registry gates —
  `tests/registry-closed-set-corpus-gate.test.ts` — stay untouched).
- Changing any existing BNDR-7 reference rendering byte.
- Calling pi's `convertToLlm` from the binder (it re-roles every custom
  variant as `user` text and would change the `[custom:<type>]` tags BNDR-7c
  / BNDR-7h pin).

## Fix (0.474.0)

**Ruling (option A — EXCLUDE).** Messages whose `role` is outside the closed
set {`user`, `assistant`, `toolResult`, `custom`} are dropped before the
truncation walk, so they count toward neither the transcript nor its token
estimate; the rule-3 tag set stays closed; no new byte-pinned rendering; no
new diagnostic code. Rendering the summaries is recorded as a deferred
upgrade. The alternative (option B — new `[summary]` / `[bash]` tags with
new BNDR-7 renderings) was declined: heavier, and the feature has no shipped
user yet.

- `src/binder/compact-transcript.ts` — the renderer's input type is now the
  CLOSED set: `export type TranscriptMessage = UserMessage | AssistantMessage
  | ToolResultMessage | CustomMessage` (the `custom` arm reached as
  `Extract<AgentMessage, { role: "custom" }>`, so its field shape tracks the
  pin rather than a local re-declaration). `isTranscriptMessage(message:
  AgentMessage): message is TranscriptMessage` is the membership guard: an
  exhaustive `switch` on `role` that names the four admitted arms, names the
  three excluded arms (`bashExecution` / `branchSummary` /
  `compactionSummary`), and routes `default:` through a `never`-typed helper
  (`excludeUnpinnedRole`) — so a variant pi adds at a later pin fails `tsc`
  at the guard (verified: deleting one excluded `case` yields `Argument of
  type 'CompactionSummaryMessage' is not assignable to parameter of type
  'never'`), while at runtime the `default:` arm is the closed-set drop
  (`false`), never a throw, for a role the pinned type does not know (a
  second host's augmentation). `renderMessage(message: TranscriptMessage)`
  is likewise exhaustive with a `never`-typed `default:` that throws as a
  caller defect (unreachable by construction). `renderCompactTranscript`
  takes `readonly TranscriptMessage[]`; the BNDR-9 pre-scan reads
  `message.customType` off the narrowed `custom` arm with no cast.
- `src/binder/session-context-walk.ts` — the filter lives in the walk:
  `SessionContextWalkInput.messages` stays the RAW `readonly AgentMessage[]`
  (callers hand the host list over unfiltered), and immediately after the
  BNDR-10 `applies` fence the walk does
  `input.messages.filter(isTranscriptMessage)` before grouping or counting;
  `SessionContextWalkResult.includedMessages` is `readonly
  TranscriptMessage[]`.
- `src/binder/turn-grouping.ts` — `groupMessagesIntoTurns<T extends
  AgentMessage>(messages: readonly T[]): T[][]` (generic, so the narrowing
  survives grouping without a cast); the boundary rule is unchanged.
- `src/extension/production-theta-producer.ts` — `#buildBinderSessionContext`
  is behaviourally unchanged (the walk owns the filter); its doc comment now
  names the raw-list posture.
- **Spec amendments** (all at the ruling's scope, plus one presupposition
  clause the fix made necessary):
  - [`binder-model-and-context.md` §Session-context truncation](../spec_topics/binder/binder-model-and-context.md#session-context-closed-set-exclusion)
    — new anchored sentence `#session-context-closed-set-exclusion`: "Before
    any turn is formed or any token counted, the runtime MUST drop every
    element … whose `role` is outside the closed set …"; the totality clause
    that opened §Compact-transcript format now says the renderer is total
    over the closed set the exclusion admits "and receives no other variant";
    rule 3 gains the sentence closing the set against the host's wider union
    and pointing at the deferred upgrade; the leading-`user` sentence reads
    "read over the closed-set subsequence the exclusion above retains".
  - [`host-interfaces-core.md` §`SessionContext` shape](../spec_topics/pi-integration-contract/host-interfaces-core.md#sessioncontext-shape)
    — the false premise corrected: `AgentMessage` is the open union
    `Message | CustomAgentMessages[keyof CustomAgentMessages]`, seven arms at
    the pin, all emitted by `buildSessionContext(...)`; the renderer is total
    over the four listed arms "and receives no other"; the excluded-arm set
    joins the per-bump re-validation ("an arm added at a later pin is a
    bump-procedure decision to admit or exclude, not a silent drop").
  - [`host-prerequisites.md` — leading-`user`-message guarantee](../spec_topics/pi-integration-contract/host-prerequisites.md#messages-leading-user-message-presupposition)
    — one clause: the guarantee is read over the closed-set subsequence, not
    the raw array, because a compacted session's raw list leads with the
    `compactionSummary` (this was observed-false at the pin; see §Root cause).
  - [`future-considerations/surface-extensions.md` §Surface extensions without a dedicated topic-page seam](../spec_topics/future-considerations/surface-extensions.md#render-compaction-branch-summaries)
    — sixth item, *Rendering Pi's compaction / branch summaries and
    `!`-command executions in the binder transcript* (carrier: rule 3's closed
    set + the exclusion); the sub-bucket's intro count five→six and its
    partition sentence gain the third category; the matching one-clause
    description in [`overview-and-orientation.md` §Scope](../spec_topics/overview-and-orientation.md#scope)
    names the new category. The sub-bucket is outside the GOV-30 lock-step
    scope and the GOV-31 12-seam tally (no seam blockquote, not counted).
- `CHANGELOG.md` 0.474.0; `docs/bugs/README.md` row.

### Witnesses

- `tests/b0478-augmented-agentmessage-variants-excluded-before-walk.test.ts`
  (NEW, 11 cells; red-at-fork proven against the unfixed renderer: 4 walk
  cells red on `includedMessages` / turn-count / estimator-spy assertions,
  3 render/production cells red on `TypeError: content is not iterable`, the
  CONTROL cell green both ways):
  1. `isTranscriptMessage` admits exactly the four in-set roles and excludes
     the three pinned augmentations (`bashExecution` with and without
     `excludeFromContext`);
  2. a role the pinned type does not know is classified out-of-set at
     runtime (drop, not throw);
  3. type-level tripwire — a never-invoked closure carries a
     `@ts-expect-error` on `renderCompactTranscript([m])` for `m:
     AgentMessage`, so widening the renderer's input back to the open union
     fails `tsc` (verified: TS2578 *Unused '@ts-expect-error' directive*);
  4. a session carrying `compactionSummary` / `branchSummary` /
     `bashExecution` (±`excludeFromContext`) among ordinary turns walks to
     the same `includedMessages`, turn count and token total as the same
     session without them (the foreign messages weigh 9000 each, so a walk
     that counted them would drop a turn) and renders byte-identical BNDR-7
     bytes containing none of the foreign sentinels;
  5. the `TokenEstimator` seam is never consulted for an out-of-set message
     (spy estimator records only `user` / `assistant`);
  6. post-compaction shape — a leading `compactionSummary` opens no turn; the
     first in-set `user` does (turn count 1, not 2);
  7. a list of only out-of-set messages walks to zero turns → BNDR-7i no
     block;
  8. BNDR-9 unaffected — a safe `custom` among foreign messages renders under
     its `[custom:<type>]` tag (BNDR-7c bytes);
  9. CONTROL — an unsafe `customType` among foreign messages is still
     rejected `custom-type-unsafe` (green both directions);
  10. production route — `runBinder` for a `bind_context: session`
      prompt-mode theta against a `sessionManager` double whose entries
      include a `compaction` entry (`firstKeptEntryId` mid-chain), a
      `branch_summary` entry, and `!cmd` / `!!cmd` `bashExecution` message
      entries binds (`bound: true`, exactly one off-session `complete()`),
      the captured system prompt carries exactly the in-set *Recent session
      context* block and none of the foreign bytes (nor the summarised
      pre-compaction turn), and the only note is the success echo;
  11. the captured system prompt is byte-identical to the one built for the
      same conversation with no compaction / branch / bash entries.
- `tests/bind-context-transcript.test.ts`, `tests/integration-acceptance.test.ts`
  — constructors / annotations re-typed to `TranscriptMessage` (the
  renderer's new input type); every assertion byte unchanged.
