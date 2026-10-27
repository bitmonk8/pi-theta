// Bug 0498: positive mechanism/audit coverage, complementing the unchanged
// stale-clause and real-host witnesses. These are spec-text controls, not a
// substitute for b0483's functional recorder tests or the live registration run.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const PIC = "docs/spec_topics/pi-integration-contract/";
const CONTRACTS = [
  {
    id: "PIC18",
    path: `${PIC}conversation-drive.md`,
    start: '<a id="pic-18"></a>',
    required: [
      "**PIC-18. Prompt-mode turn-lifecycle event subscription.**",
      "cancellation forwarding is driver-local, not realised by persistent turn-lifecycle `pi.on` cancellation handlers",
      "`forwardSlashCommandCancel(thetaAbort, ctx.signal)` attaches a one-shot signal listener",
      "a no-op at idle entry when `ctx.signal` is undefined",
      "after the send/start phase, a per-attempt deferred recorder",
      "records an already-aborted signal or installs a one-shot abort listener",
      "records the source reason without aborting `thetaAbort`",
      "re-arms on a different run signal at each non-idle end-phase poll",
      "A later recorded abort replaces the saved reason",
      "detached when the recorder moves to a new run signal, before a continuation attempt replaces its recorder, and in the drive's `finally`",
      "A separate post-settle check observes `ctx.signal?.aborted`",
      "[PIC-78](#pic-78) owns classification, bounded waits, recovery rides and forwarding disposition",
      "a cancel forwards the latest recorded source reason",
      "post-settle `abortForAgentEnd` synthesis when no reason was recorded",
      '`"theta cancelled by agent_end"` reason describe this settled-state synthesis, not an installed `pi.on("agent_end", ...)` handler',
      "foreign-user cancellation precedence and PIC-78 lifecycle-expiry cancellation rules remain unchanged",
      "[PIC-79](#pic-79) owns the no-observed-abort omission disposition",
      "None of these observation points guarantees seeing a run that starts and ends between polls or an abort during a no-signal gap",
      "The only prompt-mode turn-lifecycle `pi.on` consumers are the `PromptToolLoopGovernor`'s `before_provider_request` and `tool_call` handlers",
      "`session_shutdown` and the host-loop `agent_settled` handoff are separate roles",
      "governor registrations persist for the extension instance's lifetime",
      "process-global and carry no per-session origin marker",
      "MUST NOT use these events to resolve query completion",
      "`ToolCallEventResult` that can `block` a call",
      "guarded by a per-drive *armed* window",
      "cross-fires while a drive is armed is debited against — and past the cap blocked by — the driven theta's round budget",
      "#bump-checklist-pi-on-process-global",
      "#bump-checklist-governor-round-boundary",
      "#bump-checklist-turn-lifecycle-event-delivery",
    ],
  },
  {
    id: "PREREQUISITE_V",
    path: `${PIC}host-prerequisites.md`,
    start: "**Pi slash-handler promise lifecycle (theta consumption posture).**",
    required: [
      "six theta-side presuppositions",
      "(v) the theta presupposes the captured command context exposes the current active agent run's `ctx.signal`",
      "post-start read and non-idle end-phase polls",
      "a stable signal object within a run and a fresh signal object for a later run",
      "an observed signal supports the one-shot abort listener",
      "`aborted` / `reason` reads reflect that run's latest abort state",
      "A signal may be undefined at idle entry or during a gap between runs",
      "post-settle read, its state remains readable for PIC-78's post-settle classification",
      "not five subscribed lifecycle callbacks",
      "no guarantee of observing a run completed between polls or an abort during a gap with no run signal",
      "freezes the context on an old run signal, changes run-signal identity, suppresses an observed signal's abort notification, or makes its abort state stale",
      "six presuppositions are taken on a best-effort basis",
      "item (v) covers the (v) run-signal identity/freshness presupposition",
    ],
  },
  {
    id: "AUDIT_V",
    path: `${PIC}version-bump-step2.md`,
    start: '<a id="bump-checklist-turn-lifecycle-event-delivery"></a>',
    required: [
      "(v) *Per-run `ctx.signal` identity, notification and abort-state freshness",
      "contributor SHOULD confirm",
      "post-start read and non-idle end-phase polls",
      "identity is stable within a run and fresh for a later run",
      "one-shot abort notification and exposes current `aborted` / `reason` values",
      "undefined-signal posture at idle entry and between runs",
      "aborted signal still exposed at the post-settle read",
      "driver-local recorder and post-settle observation, not delivery into five cancellation handlers",
      "do not guarantee observing a complete run between polls or an abort while no run signal exists",
      "frozen captured signal, changed run-signal identity, missed notification or stale abort state",
      "`before_provider_request` delivery and `tool_call` blocking dependencies remain audited separately by [item (at)](#bump-checklist-governor-round-boundary)",
      "SHOULD-level only at theta 1.0",
      "typed run-signal lifecycle contract",
    ],
  },
  {
    id: "AUDIT_AH",
    path: `${PIC}version-bump-step2.md`,
    start: '<a id="bump-checklist-pi-on-process-global"></a>',
    required: [
      "contributor SHOULD confirm",
      "delivered to every subscribed extension regardless of which session is active **and** that no `pi.on` event payload carries a per-session origin field",
      "cross-session reach of the governor's persistent registrations",
      "prevents session-scoping the governor's armed window",
      "Cross-fire while armed can debit or block another in-process session's calls",
      "not a harmless-cancellation-handler rationale",
      "Driver-local cancellation uses the signal observations audited by item (v), not these event registrations",
      "a recorded `pass` requires both halves to have been covered",
      "recorded `fail` or `N/A` likewise reflects the joint result",
      "SHOULD-level only at theta 1.0",
    ],
  },
  {
    id: "SLASH",
    path: "docs/spec_topics/cancellation.md",
    start: "- *Slash-command entry.*",
    required: [
      "Forwarding is signal-local, not a subscription to turn-lifecycle `pi.on` events",
      "one-shot deferred recorder and its lifecycle polls, with a separate post-settle aborted-signal check",
      "[PIC-18](./pi-integration-contract/conversation-drive.md#pic-18) owns the mechanism",
      "forwarding is SETTLE-CLASSIFIED rather than immediate",
      "CNCL-4 is unchanged on the forwarded arm (the latest recorded source reason is what is forwarded)",
    ],
  },
  {
    id: "SOURCE",
    path: `${PIC}host-interfaces-core.md`,
    start: "**Cancellation source.**",
    required: [
      "signal-local dispatch/binding-time forwarding",
      "per-run deferred recorder plus post-settle aborted-signal check",
      "[PIC-18](./conversation-drive.md#pic-18) and classified under [PIC-78](./conversation-drive.md#pic-78)",
      "`thetaAbort.abort(reason)`; it does not install five turn-lifecycle `pi.on` cancellation handlers",
      "Because `thetaAbort.signal` is always defined",
      "[Cancellation — Abort-reason propagation](../cancellation.md)",
    ],
  },
] as const;

type Contract = (typeof CONTRACTS)[number];

function paragraph(text: string, contract: Contract): string {
  const normalized = text.replace(/\r\n/g, "\n");
  const start = normalized.indexOf(contract.start);
  if (start === -1) throw new Error(`B0498_POSITIVE precondition: missing ${contract.id} anchor`);
  const end = normalized.indexOf("\n\n", start);
  return normalized.slice(start, end === -1 ? undefined : end).replace(/\s+/g, " ");
}

function assertContract(text: string, contract: Contract): void {
  const body = paragraph(text, contract);
  for (const requirement of contract.required) {
    expect(body, `B0498_POSITIVE_${contract.id}: ${requirement}`).toContain(requirement);
  }
}

describe("bug 0498 positive forwarding mechanism and audit contract", () => {
  for (const contract of CONTRACTS) {
    it(`${contract.id}: positively specifies the actual observation points and preserved controls`, () => {
      // Read failures are precondition failures, never empty healthy fixtures.
      const text = readFileSync(new URL(`../${contract.path}`, import.meta.url), "utf8");
      expect(text.startsWith("#"), `required normative document: ${contract.path}`).toBe(true);
      assertContract(text, contract);
    });

    it(`${contract.id}: every positive assertion rejects its own independent omission`, () => {
      // Independent small healthy fixture, not read from the implementation.
      // Each mutation removes exactly one required clause; all others remain.
      const fixture = `${contract.start} ${contract.required.join(". ")}\n\n`;
      assertContract(fixture, contract);
      for (const requirement of contract.required) {
        const mutated = fixture.replace(requirement, "[clause omitted]");
        expect(mutated).not.toBe(fixture);
        expect(() => assertContract(mutated, contract)).toThrow(`B0498_POSITIVE_${contract.id}`);
      }
      expect(() => assertContract("# No contract here\n", contract))
        .toThrow(`B0498_POSITIVE precondition: missing ${contract.id} anchor`);
    });
  }
});
