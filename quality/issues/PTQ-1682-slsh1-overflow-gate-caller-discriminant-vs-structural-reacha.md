---
id: PTQ-1682
title: The SLSH-1 no-params overflow gate is implemented twice — slash-dispatch.ts's dispatchNoParamsTheta gates on an explicit SlashCallerKind discriminant that no production site produces, while binder-run.ts's #emitNoParamsOverflowNote re-implements the trim-then-emit rule with no caller guard and is the only path production runs
lens: D1
status: open
verdict: confirmed
locations:
  - src/runtime/slash-dispatch.ts:11-16
  - src/runtime/slash-dispatch.ts:39-56
  - src/runtime/slash-dispatch.ts:72-88
  - src/extension/binder-run.ts:871-897
  - src/extension/binder-run.ts:189
  - src/extension/binder-run.ts:263
sites: 6
fix_scope: cross-module
d1_class: divergent-solutions
wave: qw20260928124659
reported_by: lens-d1-design (anthropic/claude-fable-5-1)
date: 2026-09-28
triaged_at: 7d0a52af49422fb4ce69fba3a62007fdfaf35a3e
---

# The SLSH-1 no-params overflow gate is implemented twice — slash-dispatch.ts's dispatchNoParamsTheta gates on an explicit SlashCallerKind discriminant that no production site produces, while binder-run.ts's #emitNoParamsOverflowNote re-implements the trim-then-emit rule with no caller guard and is the only path production runs

## Observation
SLSH-1 (slash-invocation.md) says a no-params theta reached with extra slash text emits one overflow note before running, on the slash path only. `slash-dispatch.ts` supplies `dispatchNoParamsTheta`, which decides "slash path" by an explicit `caller: SlashCallerKind` discriminant (`"slash" | "invoke" | "tool"`) and then trims and emits. `binder-run.ts` supplies `#emitNoParamsOverflowNote`, which trims and emits with no caller check, relying on the structural fact that `runBinder` is only reached from slash dispatch. Production calls the second (two call sites) and never the first; the first's caller discriminant is produced only by `tests/slash-dispatch.test.ts`. Both call the same `trimSlashArgumentWhitespace` and `renderNoParamsOverflowNote`, so the divergence is in the gate mechanism, not the text.

## Evidence

Way A — explicit caller discriminant, src/runtime/slash-dispatch.ts:39-44:
```ts
/**
 * How the theta was reached. SLSH-1 fires the overflow note only on the
 * slash-invocation path; `invoke(...)` and registered-tool callers skip the
 * slash parser entirely and have no notion of "extra text".
 */
export type SlashCallerKind = "slash" | "invoke" | "tool";
```
and :72-88:
```ts
export async function dispatchNoParamsTheta(
  input: NoParamsDispatchInput,
  deps: NoParamsDispatchDeps,
): Promise<void> {
  // SLSH-1: the overflow note is slash-path-only — `invoke`/`tool` callers skip
  // the slash parser and have no notion of "extra text". On the slash path,
  // trim leading/trailing slash-argument whitespace; emit exactly one note only
  // when the trimmed remainder is non-empty. The note never blocks execution —
  // the theta always runs, and after the note.
  if (input.caller === "slash") {
    const trimmed = trimSlashArgumentWhitespace(input.rawArgs);
    if (trimmed.length > 0) {
      deps.emitOverflowNote(renderNoParamsOverflowNote(input.name));
    }
  }
  await deps.run();
}
```
The module header presenting Way A as the SLSH-1 behaviour, src/runtime/slash-dispatch.ts:11-14:
```ts
// V12a-T (tests-task) declared the seam shapes; V12a (this leaf) supplies the
// behaviour: `renderNoParamsOverflowNote` renders the SLSH-1 template,
// `dispatchNoParamsTheta` emits the note only on the slash path with a
// non-empty trimmed remainder, `rendersTranscriptCard` reports only the
```

Way B — structural reachability, no guard, src/extension/binder-run.ts:877-880 and :886-896:
```ts
   * whitespace-only remainder emits no note). `runBinder` is only reached on the
   * slash-invocation path (invoke/tool callers spawn callees directly), so no
   * caller-kind guard is needed. Routed through `sendSystemNote` — the same
   * chain every other note on this instance uses.
```
```ts
  #emitNoParamsOverflowNote(binderInput: BinderRunInput): void {
    if (trimSlashArgumentWhitespace(binderInput.args).length === 0) {
      return;
    }
    // Informational note (runtime-event-channel.md "Informational notes carry no `details`");
    // routes through the channel with `details` ABSENT rather than fabricate the runtime-event key.
    sendSystemNote(
      { content: renderNoParamsOverflowNote(binderInput.theta.slashName), display: true },
      this.#systemNoteChannel(),
    );
  }
```
Way B's two production call sites, src/extension/binder-run.ts:189 and :263 (search below).

Producers and consumers, both ways. Command: `grep -rn "dispatchNoParamsTheta\|renderNoParamsOverflowNote\|trimSlashArgumentWhitespace" src/ extensions/ tools/ --include=*.ts --include=*.mjs | grep -v "^\S*:[0-9]*:\s*[/*]"` — 13 hits; first 10:
```
src/binder/binder-envelope.ts:224:export function trimSlashArgumentWhitespace(raw: string): string {
src/binder/binder-envelope.ts:271:        args: { [decision.wireName]: trimSlashArgumentWhitespace(input.slashArguments) },
src/binder/binder-system-prompt.ts:65:import { trimSlashArgumentWhitespace } from "./binder-envelope";
src/binder/binder-system-prompt.ts:361:  line(`User arguments: ${trimSlashArgumentWhitespace(input.rawArguments)}`);
src/extension/binder-run.ts:24:  trimSlashArgumentWhitespace,
src/extension/binder-run.ts:68:import { renderNoParamsOverflowNote } from "../runtime/slash-dispatch";
src/extension/binder-run.ts:887:    if (trimSlashArgumentWhitespace(binderInput.args).length === 0) {
src/extension/binder-run.ts:893:      { content: renderNoParamsOverflowNote(binderInput.theta.slashName), display: true },
src/runtime/slash-dispatch.ts:22:import { trimSlashArgumentWhitespace } from "../binder/binder-envelope";
src/runtime/slash-dispatch.ts:33:export function renderNoParamsOverflowNote(name: string): string {
```
(remaining 3: `slash-dispatch.ts:72` the `dispatchNoParamsTheta` declaration, `:82` and `:84` its own body). `dispatchNoParamsTheta` therefore has 0 callers in src/, extensions/, tools/; production imports only `renderNoParamsOverflowNote` from the module (`binder-run.ts:68`).

Command: `grep -rn "emitNoParamsOverflowNote" src/ --include=*.ts | grep -v "^\S*:[0-9]*:\s*[/*]"` — 3 hits:
```
src/extension/binder-run.ts:189:      this.#emitNoParamsOverflowNote(binderInput);
src/extension/binder-run.ts:263:      this.#emitNoParamsOverflowNote(binderInput);
src/extension/binder-run.ts:886:  #emitNoParamsOverflowNote(binderInput: BinderRunInput): void {
```

Way A's discriminant is produced by no production site. Command: `grep -rn "caller: \"" src/ --include=*.ts | grep -v "^\S*:[0-9]*:\s*[/*]"` — 0 hits. Command: `grep -rln "dispatchNoParamsTheta" tests/` — 1 hit:
```
tests/slash-dispatch.test.ts
```
That file produces all three arms (tests/slash-dispatch.test.ts:73, :94, :109, :113 — `caller: "slash"`, `"slash"`, `"invoke"`, `"tool"`) and witnesses the invoke/tool exclusion against Way A only; it contains no reference to `runBinder` / `binder-run` (`grep -rn "runBinder\|BinderRunner\|binder-run" tests/slash-dispatch.test.ts` — 0 hits).

History: Command: `git log --oneline -S"dispatchNoParamsTheta(" -- src/` — 1 hit:
```
2bc69157 Rename Loom -> Theta across the corpus
```
(the seam's declaration under its pre-rename name predates that commit; no commit ever added or removed a production call).

Self-inconsistency statement: no written rule exists for where the SLSH-1 gate must live or how "slash path" must be decided; the anchor is self-inconsistency (an explicit discriminant in one implementation, structural reachability in the other, one text-rendering helper shared by both) plus the cost cited below.

## Why this is a problem
One spec clause, two gate mechanisms, and the module that names itself the behaviour supplier is the one production never runs. The concrete misread: `slash-dispatch.ts:11-14` tells a reader that `dispatchNoParamsTheta` is how the runtime "emits the note only on the slash path", and `SlashCallerKind`'s doc (:40-43) describes invoke/tool callers as a case the gate handles; in production there is no caller-kind value anywhere (0 producers) and the slash-only property rests on `binder-run.ts:877-879`'s prose claim that `runBinder` is unreachable from invoke/tool. The SLSH-1 exclusion test (`tests/slash-dispatch.test.ts:108-116`) therefore passes against a discriminant production does not compute, while the production rule that actually enforces it — the reachability of `runBinder` — is asserted in a comment and gated by nothing. A maintainer who tightens or loosens the trim/emit rule in `dispatchNoParamsTheta` (the seam the tests-task pinned) changes nothing in production; one who changes it in `#emitNoParamsOverflowNote` leaves the seam and its tests describing the old rule.

## Suggested direction (non-binding, optional)
Unproven hypothesis: pick one gate — either thread the real dispatch through `dispatchNoParamsTheta` (giving `SlashCallerKind` a production producer) or retire `dispatchNoParamsTheta`/`SlashCallerKind` so `renderNoParamsOverflowNote` is the module's only SLSH-1 export and `binder-run.ts` is the acknowledged single implementation. Which side wins, and whether the invoke/tool exclusion deserves a production-side witness, is the fix stage's call.

## False-positive check
- Clone-map check: the injected clone map lists no group for `src/runtime/slash-dispatch.ts`; the two bodies share only two imported helper calls and differ in gate shape (discriminant vs none), so this is mechanism-shaped, not a token copy.
- D9-affinity check: no wrong-home claim — the filing does not argue the gate belongs in `binder-run.ts` or `slash-dispatch.ts`; it argues there are two of it.
- D2-deadness check: both sides live. `dispatchNoParamsTheta` and `SlashCallerKind` are exercised by `tests/slash-dispatch.test.ts` (search pasted above), so not dead under the tests-as-callers rule; `#emitNoParamsOverflowNote` is called at `binder-run.ts:189` and `:263` on the production no-params and `params: {}` bypass paths.
- Export-style exemption: not a wide-surface filing. `SlashCallerKind`'s `"invoke"`/`"tool"` arms having no production producer is cited only as evidence of which mechanism production runs, not filed as a width claim (the arms are read by `dispatchNoParamsTheta` and mirror the spec's slash/invoke/tool caller trichotomy).
- Prior-filing check: bugs 0401 and 0437 (fixed) changed `#emitNoParamsOverflowNote`'s note shape (`details` absent) and delivery chain; neither touched `dispatchNoParamsTheta` or the gate split — the seam's `emitOverflowNote: (note: string) => void` never carried `details` at all. `grep -rln "dispatchNoParamsTheta" quality/intake quality/issues quality/resolved` — 1 prior hit, `quality/resolved/PTQ-0071-runtime-modules-stub-narration-stale.md` (D2, fixed): it rewrote the stale tests-task stub narration in four module headers, including `slash-dispatch.ts:11-24`; its scope was the header prose, and it made no claim on the gate being implemented twice or on `dispatchNoParamsTheta` having no production caller (the header it left in place still names `dispatchNoParamsTheta` as the behaviour supplier, which is this filing's misread).
- Spec check: slash-invocation.md SLSH-1 pins the template, the trim rule, and the slash-only scope; it does not pin the mechanism, so no `challenges_spec` applies and no behaviour change is asserted.
- Exemption check: `grep -n "slash-dispatch\|binder-run" quality/exemptions.json` — 0 hits.
- Self-inconsistency: no written rule exists; the anchor is self-inconsistency plus the cost cited above (the header's falsified behaviour-supplier claim and the exclusion witnessed on the unused mechanism).

## Triage
verdict: questionable — accounting verified; whether to unify (and to what) is a design decision for a human ruling. All stated searches reproduce verbatim (13/3/0/1/0 hits; -S log → 2bc69157 only). dispatchNoParamsTheta (slash-dispatch.ts:72-88) is called only from tests/slash-dispatch.test.ts (:73/:94/:109/:113 produce all three caller arms). Production runs #emitNoParamsOverflowNote (binder-run.ts:886-896, called at :189 and :263) with no caller guard, relying on the "runBinder is slash-only" comment at :877-879. clone-scan lists no group for slash-dispatch.ts, there are no exemptions, and no D2/D4/D8/D9 filing or PTQ covers this (PTQ-0071 only rewrote the header prose). The cost is concrete: the :11-14 header names the unused seam as the behaviour supplier, and the invoke/tool exclusion test exercises only the unused discriminant (triage: claude-opus-5-5)
verdict: confirmed — RATIFIED: binder-run's #emitNoParamsOverflowNote is the single SLSH-1 gate; retire the never-wired seam. In src/runtime/slash-dispatch.ts delete dispatchNoParamsTheta, SlashCallerKind, NoParamsDispatchInput and NoParamsDispatchDeps (production has produced no caller-kind value since birth — 0 `caller:` producers in src/, git -S shows only the rename commit); keep renderNoParamsOverflowNote, PromptTurnKind/rendersTranscriptCard, driveSlashPromptTurn and every other live export untouched. Rewrite the module header (:11-16) to name binder-run.ts #emitNoParamsOverflowNote (:886-896, called at :189/:263) as the SLSH-1 implementation, slash-only by runBinder's reachability (binder-run.ts:877-880 states it). Re-aim tests/slash-dispatch.test.ts: keep the trim/emit/template cells against renderNoParamsOverflowNote + trimSlashArgumentWhitespace; drop the caller-discriminant cells. Behaviour identical.
