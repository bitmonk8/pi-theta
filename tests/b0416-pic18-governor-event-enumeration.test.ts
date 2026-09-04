// Bug 0416 witness — PIC-18's closed event-consumption set is contradicted by
// the shipped PromptToolLoopGovernor.
//
// Bug doc: docs/bugs/0416-pic18-closed-event-set-contradicted-by-governor.md.
// PIC-18 (docs/spec_topics/pi-integration-contract/conversation-drive.md,
// anchor `pic-18`, line 27 at 261e483b) pins a CLOSED consumption set — "of
// which theta 1.0 consumes exactly the five members above" (`tool_call`,
// `tool_result`, `message_update`, `turn_end`, `agent_end`) — and rests a
// normative conclusion on passivity: the handlers' "sole prompt-mode role is
// cancellation forwarding, so cross-fire from an unrelated session's turn event
// is harmless". But the shipped `PromptToolLoopGovernor.ensureRegistered`
// (src/extension/prompt-tool-loop-governor.ts) subscribes a SIXTH event via its
// `pi.on` calls — `before_provider_request` — AND a `tool_call` handler
// (`#onToolCall`) that returns `{ block: true, reason }`, an EFFECTFUL role
// beyond cancellation forwarding. The version-bump audit item (v)
// (docs/spec_topics/pi-integration-contract/version-bump-step2.md, bump-checklist
// item (v)) audits only "the five turn-lifecycle events the runtime's
// cancellation-forwarding handlers subscribe to"; `before_provider_request`
// appears in no checklist item.
//
// The settled spec-side §Fix (no code change) widens PIC-18 to enumerate the
// governor's two subscriptions and their roles (`before_provider_request`
// round-boundary detection; the `tool_call` handler's `block`ing role), scopes
// the harmless-cross-fire sentence to the five cancellation-forwarding handlers
// only and adds an `armed`-window session-scoping caveat, and adds a bump item
// auditing `before_provider_request` delivery.
//
// Cell (A) is the SHIPPED-SURFACE CONTROL — green both directions (the code is
// untouched by the fix). Cells (B)/(C)/(D)/(E) assert the settled spec-side
// §Fix end state against the doc text and are RED at fork for the right reason:
// the spec text lacks the governor's sixth subscription, its blocking role, the
// armed-window caveat, and the bump audit of `before_provider_request`.
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
    // Proves the impl side of the contradiction: the governor consumes
    // `before_provider_request` (a SIXTH member beyond PIC-18's five) and a
    // `tool_call` handler whose `{ block: true }` return is an effectful role.
    const events = subscribedEvents();
    expect(events).toEqual(["before_provider_request", "tool_call"]);

    // The tool_call handler returns a real block decision (effectful, not the
    // "re-check of a non-aborted captured signal" PIC-18 permits): a round-cap
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
    // RED at fork: `before_provider_request` is subscribed but PIC-18 says
    // "exactly the five members above" and never names it. GREEN once the fix
    // widens PIC-18 to enumerate the governor's two subscriptions.
    const missing = events.filter((e) => !pic18.includes(e));
    expect(missing).toEqual([]);
  });
});

describe("b0416 (C) PIC-18 describes the tool_call handler's blocking role (RED at fork)", () => {
  it("the PIC-18 paragraph references a blocking role for the tool_call handler", () => {
    const pic18 = extractPic18(readSpec(CONVERSATION_DRIVE));
    // RED at fork: PIC-18 currently says the handlers' "sole prompt-mode role is
    // cancellation forwarding" and never mentions the governor's `block`. GREEN
    // once the fix names the tool_call handler's ToolCallEventResult `block`.
    expect(pic18).toContain("block");
  });
});

describe("b0416 (D) PIC-18 carries the armed-window session-scoping caveat (RED at fork)", () => {
  it("the PIC-18 paragraph mentions the armed drive window", () => {
    const pic18 = extractPic18(readSpec(CONVERSATION_DRIVE));
    // RED at fork: PIC-18 has no armed-window caveat about concurrent in-process
    // sessions being mis-governed during a drive. GREEN once the fix adds it.
    expect(pic18).toContain("armed");
  });
});

describe("b0416 (E) the version-bump checklist audits before_provider_request (RED at fork)", () => {
  it("some bump-checklist text references before_provider_request", () => {
    const bumpText = readSpec(VERSION_BUMP_STEP2);
    // RED at fork: item (v) audits only the five cancellation-forwarding events;
    // `before_provider_request` — on which ceiling #2's round-boundary detection
    // depends — is in no item. GREEN once the fix adds the new bump item.
    expect(bumpText).toContain("before_provider_request");
  });
});
