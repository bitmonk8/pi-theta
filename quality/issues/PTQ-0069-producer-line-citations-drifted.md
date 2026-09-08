---
id: PTQ-0069
title: "Five line-number citations in production-theta-producer.ts comments no longer point at the constructs they cite"
lens: D2
status: open
verdict: confirmed
locations:
  - src/extension/production-theta-producer.ts:8421-8423
  - src/extension/production-theta-producer.ts:1152-1153
  - src/extension/production-theta-producer.ts:1457-1460
  - src/extension/production-theta-producer.ts:1889
  - src/extension/production-theta-producer.ts:1909
sites: 6
fix_scope: localized
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# Five line-number citations in production-theta-producer.ts comments no longer point at the constructs they cite

## Observation

Comments in this file anchor claims with absolute `file:line` citations. Most
of them still resolve (twenty-odd were re-checked and hold — see the
false-positive check), but five citations, across six comment sites, now point
at different constructs than the ones they name: the cited files gained or
moved lines and the numbers were not updated. A reader following any of these
five lands on unrelated code or an unrelated spec clause.

## Evidence

Site 1 — src/extension/production-theta-producer.ts:8421-8423 cites
`statement-executor.ts:1060` for the executor's `applyBinaryScalar` belt:

```ts
      // Bug 0338 belt: mirrors the executor's `applyBinaryScalar` bug 0332 belt
      // (statement-executor.ts:1060) into this pure host, so a statically-deferred
      // non-numeric operand (a WITHHELD fn param reaching an interpolation or an
```

`applyBinaryScalar` is declared at src/runtime/statement-executor.ts:1370 and
its `BinaryNonNumericError` throw is at :1407 (`grep -n "function
applyBinaryScalar" src/runtime/statement-executor.ts` → 1370; `grep -n "throw
new BinaryNonNumericError" ` → 1407). Line 1060 today is inside the effect-flow
routing, unrelated to the belt (src/runtime/statement-executor.ts:1059-1062):

```ts
  // A `<name>(args)` call whose callee resolves to a user `fn` executes the
  // function body in-process (FN-1…FN-5); it is not a host tool-call / invoke
  // effect, so it never reaches `checkpointFor`.
  if (expr.kind === "call") {
```

Site 2 — src/extension/production-theta-producer.ts:1152-1153 cites
`argument-echo.ts:74` as the `(default)` tag source:

```ts
   * (defaulting-system-note-echo.md:9; `defaulting.ts:70–75`,
   * `argument-echo.ts:74`). The echo is rendered off the resolved runtime
```

src/render/argument-echo.ts:74 is the unrelated `value` member; the
`tookDefault` member the claim is about sits at :77-83:

```ts
  /** The bound value (a runtime value from the value model). */
  readonly value: ThetaValue;
  /** The field's static type, selecting its per-value rendering rule. */
  readonly type: EchoType;
  /**
   * Whether the field took its declared default this run (default-supplied, per
   * §Defaulting's fill-if-absent rule — the `defaultedWireNames` from `V11g`).
   * Only a `true` here tags the field `(default)`; a binder-supplied value for a
```

(field at :83, `readonly tookDefault: boolean;` per `grep -n "tookDefault"
src/render/argument-echo.ts`).

Sites 3 and 4 — src/extension/production-theta-producer.ts:1457-1460
(`#emitBinderFailureNote` doc) cites `runtime-event-channel.md:40` for the
group-A always-log membership and `:83` for the registry-entry sourcing:

```ts
   * Bug 0397 §Fix: the binder-failure note is a group-A always-log member
   * (runtime-event-channel.md:40, runtime-event-channel.md:46-53) whose
   * `details.event` is sourced from the dispatch-site `ActiveInvocationRegistry`
   * entry (runtime-event-channel.md:83) — THREADED in via `ticket` (the
```

docs/spec_topics/pi-integration-contract/runtime-event-channel.md:40 is today a
group-B `details: { diagnostics: [...] }` table row ("single-element
parse-namespaced batch (`theta/parse/interpolated-result`) routed as an
operator-facing pre-spawn `system:`-render refusal note…"), not a group-A
anchor (the `details: { event: RuntimeEvent }` rows are at :23 and :36; the
always-log paragraph is at :46, which the second half of the citation still
hits). Line :83 is the `message: string;` field row of the RuntimeEvent
schema; the `ActiveInvocationRegistry` sourcing statement is at :91
("**Binder-failure sourcing.** … `invocation_id` and `theta` are read from the
invocation's `ActiveInvocationRegistry` entry…").

Sites 5 and 6 — src/extension/production-theta-producer.ts:1889 and :1909
(`#buildGroupAEventOrFallback` doc plus its catch-arm comment) cite
`runtime-event-channel.md:130` for the group-A clock-guard fallback:

```ts
   * Bug 0437 §Fix (group-A clock guard, runtime-event-channel.md:130): for a
```
```ts
    } catch (stampError: unknown) { // allow-broad-catch: pi-sdk-boundary — mirrors sendSystemNote's send-throw containment, runtime-event-channel.md:130
```

runtime-event-channel.md:130 is today the "(g) Dedup-key non-inclusion rule"
clause; the sentence the comments rely on ("for group-A `details: { event }`
notes this is `Clock.wallNow()` during `occurred_at` stamping and the
`pi.sendMessage` call…") is at :134.

## Why this is a problem

Historical narration drift: absolute line numbers are copies of a fact about a
cited file at the time of writing, and the cited files have since changed.
Each stale number now directs a reader to an unrelated construct —
`statement-executor.ts:1060` is ~310-347 lines away from the belt it names,
`argument-echo.ts:74` names a different interface member, and the three
`runtime-event-channel.md` numbers land on a group-B table row, a schema field
row, and a dedup clause instead of the group-A membership, sourcing, and
clock-guard statements they support. The same drift class has been confirmed
in this repo's sibling files (intake:
qw20260907130901-d2-02-wire-walk-line-citations-drifted,
qw20260907183353-d2-02-composition-line-citations-drifted); those findings do
not cover this file.

## Suggested direction (non-binding, optional)

Refresh the five citations to the constructs' current anchors, or replace raw
line numbers with symbol names / spec anchor ids (e.g.
`#binder-failure-sourcing`, `applyBinaryScalar`) that survive edits to the
cited files.

## False-positive check

- Enumerated every `*.ts:NNN` citation in the file (`grep -n -o
  "[A-Za-z0-9_-]*\.ts:[0-9…]*"`): `defaulting.ts:70–75` (twice, lines 735 and
  1152) resolves to `FillDefaultsResult.args`/`defaultedWireNames` (actual
  69-76 — holds); `provider-error-mapping.ts:311, :388, :399` resolve to the
  three `message` carriers claimed (holds); `theta-composition-producer.ts:103`
  is `function paramBindingsFrom(` and `:527` is its call (holds);
  `argument-echo.ts:74` and `statement-executor.ts:1060` are the two claimed
  drifted.
- Spot-checked the doc-line citations: `queryerror-variants.md:106/:151/:182-
  183/:211`, `conversation-drive.md:16` (three uses; PIC-50/51/70 anchors all
  live in that single line), `runtime-event-channel.md:46-53`,
  `slash-invocation.md:63`, `defaulting-system-note-echo.md:9`,
  `invocation.md:50`, `frontmatter-fields-b-and-templates.md:46`,
  `schema-subset.md:8/:12/:80` and `type-system.md:15` (the
  docs/spec_topics/ copies), `schemas.md:43`,
  `query-escapes-stringification.md:27`, `provider-error-mapping.md:7/:13/:45`
  — all resolve to the claimed content. Only the five citations above are
  claimed stale.
- `agent-session.js:1858` (line 5460 area) cites an external pi host file not
  vendored in this repo; not claimed either way.
- Checked already-filed intake for this topic: the citation-drift findings on
  file locate their sites in src/runtime/wire-translation.ts +
  src/runtime/wire-form-depth-walk.ts, src/extension/production-composition.ts,
  src/runtime/invoke-provenance-ledger.ts, and src/parser/theta-document.ts;
  none lists production-theta-producer.ts locations.
- Git intent: the cited files gained the drift after these comments landed
  (e.g. runtime-event-channel.md's line-40 table row is the bug-0422 pre-spawn
  render-refusal addition; statement-executor.ts grew the 0332/0338/0368/0369
  belts above line 1060) — the numbers were correct when written, which is the
  drift mechanism, not a transcription error.

## Triage

verdict: confirmed — re-verified all six sites: git shows statement-executor.ts:1060 WAS the `BinaryNonNumericError` throw at commit d7089572 and is now :1407, argument-echo.ts:74 is `value` (tookDefault at :83), and runtime-event-channel.md :40/:83/:130 land on a group-B diagnostics row, the `message: string` schema row, and the (g) dedup clause instead of the group-A rows :35-36 / sourcing :91 / clock clause :134 (triage: claude-opus-5)

