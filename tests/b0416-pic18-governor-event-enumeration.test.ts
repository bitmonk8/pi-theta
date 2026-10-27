// Bug 0416 witness — retain the governor event/blocking controls after 0498's
// correction of PIC-18's historical five-handler premise.
//
// Bug doc: docs/bugs/0416-pic18-closed-event-set-contradicted-by-governor.md.
// Historical PIC-18 (anchor `pic-18`, line 27 at 261e483b) falsely described
// "exactly the five members above" and harmless cancellation-only handlers.
// Bug 0416 exposed the missing governor roles: `before_provider_request` marks
// round boundaries and `tool_call` returns `{ block: true, reason }`. Its
// "sixth event" terminology below is retained in historical cell names only;
// the five cancellation subscribers were never installed. The two governor
// registrations are the actual shipped prompt-mode turn-lifecycle consumers.
//
// Bug 0416 added the governor enumeration, blocking role, armed-window caveat
// and event-delivery bump audit. Bug 0498 retains all those controls, removes
// the false harmless-forwarder rationale, and documents driver-local deferred
// signal recording plus settle classification instead. Item (v) now audits
// those signal observations; item (at) audits governor delivery/blocking and
// item (ah) audits process-global delivery and the lack of origin markers.
//
// Cell (A) is the unchanged SHIPPED-SURFACE CONTROL. Cells (B)/(C)/(D)/(E)
// were RED at the 0416 fork because its spec lacked the governor enumeration,
// blocking role, armed-window caveat and bump audit. They remain unchanged
// regression assertions against the corrected PIC-18 contract.
//
// Sibling patterns: the FakePi recorder mirrors
// tests/prompt-tool-loop-governor.test.ts; the `readFileSync(fileURLToPath(new
// URL(...)))` spec-md read mirrors tests/absent-member-presence-gate.test.ts.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import type {
  ExtensionAPI,
  ExtensionHandler,
  ToolCallEvent,
  ToolCallEventResult,
} from "@earendil-works/pi-coding-agent";
import { PromptToolLoopGovernor } from "../src/extension/prompt-tool-loop-governor";

/**
 * A minimal fake `pi` surface that records the ORDER and NAMES of every
 * `pi.on(event, …)` the governor registers, so a test can assert the governor's
 * consumed event set. Only `on(...)` is exercised (mirrors the FakePi in
 * tests/prompt-tool-loop-governor.test.ts).
 */
class RecordingPi {
  readonly events: string[] = [];
  readonly api: ExtensionAPI;

  constructor() {
    const on = (event: string, _handler: ExtensionHandler<unknown, unknown>): void => {
      this.events.push(event);
    };
    this.api = { on } as unknown as ExtensionAPI;
  }
}

/** Read a required spec file as text, failing loudly and naming it if absent. */
function readSpec(relPath: string): string {
  const url = new URL(`../${relPath}`, import.meta.url);
  try {
    return readFileSync(fileURLToPath(url), "utf8");
  } catch (cause) {
    throw new Error(
      `b0416 precondition unmet: required spec file not readable: ${relPath} (${String(cause)})`,
    );
  }
}

const CONVERSATION_DRIVE = "docs/spec_topics/pi-integration-contract/conversation-drive.md";
const VERSION_BUMP_STEP2 = "docs/spec_topics/pi-integration-contract/version-bump-step2.md";

/**
 * Extract the PIC-18 paragraph — from its `<a id="pic-18">` anchor up to the
 * next `<a id=` anchor (or a blank-line paragraph break, whichever comes first).
 * Fails loudly naming the anchor if it is absent, so a spec restructure surfaces
 * as a named precondition rather than a vacuous pass.
 */
function extractPic18(specText: string): string {
  const anchor = '<a id="pic-18">';
  const start = specText.indexOf(anchor);
  if (start === -1) {
    throw new Error(
      `b0416 precondition unmet: PIC-18 anchor '${anchor}' not found in ${CONVERSATION_DRIVE}`,
    );
  }
  const rest = specText.slice(start + anchor.length);
  const nextAnchor = rest.indexOf("<a id=");
  const paragraphBreak = rest.indexOf("\n\n");
  const candidates = [nextAnchor, paragraphBreak].filter((i) => i !== -1);
  const end = candidates.length > 0 ? Math.min(...candidates) : rest.length;
  return rest.slice(0, end);
}

/**
 * The exact event set the shipped governor subscribes, derived from the
 * recorder so the doc-text assertions below stay honest against the impl rather
 * than against a hard-coded list.
 */
function subscribedEvents(): string[] {
  const pi = new RecordingPi();
  const gov = new PromptToolLoopGovernor();
  gov.ensureRegistered(pi.api);
  return pi.events;
}

describe("b0416 (A) shipped-surface control — governor consumes a sixth pi.on event and a blocking tool_call handler", () => {
  it("ensureRegistered subscribes exactly before_provider_request + tool_call", () => {
    // Green now (the code is under test unchanged) and after the doc-only fix.
    // Proves the impl side of the historical contradiction: the governor
    // consumes `before_provider_request` and a `tool_call` handler whose
    // `{ block: true }` return is an effectful role.
    const events = subscribedEvents();
    expect(events).toEqual(["before_provider_request", "tool_call"]);

    // The tool_call handler returns a real block decision (not the passive
    // signal re-check the old PIC-18 falsely described): a round-cap
    // exhaustion (`begin(0)` blocks the first tool-use round).
    const pi = new RecordingPi();
    const gov = new PromptToolLoopGovernor();
    let captured: ((e: ToolCallEvent) => ToolCallEventResult | undefined) | undefined;
    (pi.api as unknown as {
      on: (event: string, handler: (e: ToolCallEvent) => ToolCallEventResult | undefined) => void;
    }).on = (event, handler) => {
      if (event === "tool_call") captured = handler;
    };
    gov.ensureRegistered(pi.api);
    gov.begin(0);
    const decision = captured?.({
      type: "tool_call",
      toolCallId: "tc-1",
      toolName: "read",
      input: {},
    } as unknown as ToolCallEvent);
    expect(decision).toEqual({ block: true, reason: "tool_loop_exhausted" });
  });
});

describe("b0416 (B) PIC-18 enumerates every event the governor subscribes (RED at fork)", () => {
  it("every subscribed pi.on event name appears in the PIC-18 paragraph", () => {
    const pic18 = extractPic18(readSpec(CONVERSATION_DRIVE));
    // Derived from cell (A)'s recorder so the assertion tracks the impl.
    const events = subscribedEvents();
    // RED at the 0416 fork: the old PIC-18 falsely said "exactly the five
    // members above" and omitted `before_provider_request`. The corrected
    // PIC-18 must still enumerate both real governor subscriptions.
    const missing = events.filter((e) => !pic18.includes(e));
    expect(missing).toEqual([]);
  });
});

describe("b0416 (C) PIC-18 describes the tool_call handler's blocking role (RED at fork)", () => {
  it("the PIC-18 paragraph references a blocking role for the tool_call handler", () => {
    const pic18 = extractPic18(readSpec(CONVERSATION_DRIVE));
    // RED at the 0416 fork: the old spec's false cancellation-only premise
    // omitted the governor's `block`. Keep that effectful role explicit.
    expect(pic18).toContain("block");
  });
});

describe("b0416 (D) PIC-18 carries the armed-window session-scoping caveat (RED at fork)", () => {
  it("the PIC-18 paragraph mentions the armed drive window", () => {
    const pic18 = extractPic18(readSpec(CONVERSATION_DRIVE));
    // RED at the 0416 fork: its spec lacked the armed-window caveat about
    // concurrent in-process sessions being mis-governed. Keep that limitation.
    expect(pic18).toContain("armed");
  });
});

describe("b0416 (E) the version-bump checklist audits before_provider_request (RED at fork)", () => {
  it("some bump-checklist text references before_provider_request", () => {
    const bumpText = readSpec(VERSION_BUMP_STEP2);
    // RED at the 0416 fork: old item (v) audited the phantom five forwarders
    // and no item audited `before_provider_request`. Item (at) now owns the
    // governor's real provider-round delivery and blocking dependencies.
    expect(bumpText).toContain("before_provider_request");
  });
});
