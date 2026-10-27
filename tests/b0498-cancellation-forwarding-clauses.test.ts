// Bug 0498 clause-level isolation. There is no broken cancellation function
// to make red: the defect is five false normative mechanism claims. The live
// witness independently establishes the actual shipped registration surface;
// these offline cells isolate each offending paragraph without a provider.
// Existing b0416 and b0483 tests retain the governor and driver behavior controls.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CLAUSES = [
  {
    id: "SLASH",
    path: "docs/spec_topics/cancellation.md",
    start: "- *Slash-command entry.*",
    phantom: "`ctx.signal` is observed inside one of the runtime's own event handlers",
  },
  {
    id: "PIC18",
    path: "docs/spec_topics/pi-integration-contract/conversation-drive.md",
    start: '<a id="pic-18">',
    phantom: "cancellation-forwarding handlers consume exactly the five members above",
  },
  {
    id: "SOURCE",
    path: "docs/spec_topics/pi-integration-contract/host-interfaces-core.md",
    start: "**Cancellation source.**",
    phantom: "when defined and observed inside one of the runtime's `tool_call` / `tool_result` / `message_update` / `turn_end` / `agent_end` handlers",
  },
  {
    id: "PREREQUISITE",
    path: "docs/spec_topics/pi-integration-contract/host-prerequisites.md",
    start: "**Pi slash-handler promise lifecycle (theta consumption posture).**",
    phantom: "Pi delivers each of the five turn-lifecycle events the runtime's cancellation-forwarding handlers subscribe to",
  },
  {
    id: "AUDIT",
    path: "docs/spec_topics/pi-integration-contract/version-bump-step2.md",
    start: '<a id="bump-checklist-turn-lifecycle-event-delivery">',
    phantom: "Pi still delivers each of the five turn-lifecycle events the runtime's cancellation-forwarding handlers subscribe to",
  },
] as const;

type Clause = (typeof CLAUSES)[number];
const normalize = (text: string): string => text.replace(/\s+/g, " ");

function paragraph(text: string, clause: Clause): string {
  const lines = text.replace(/\r\n/g, "\n");
  const start = lines.indexOf(clause.start);
  if (start === -1) throw new Error(`B0498 precondition: missing ${clause.id} paragraph in ${clause.path}`);
  const end = lines.indexOf("\n\n", start);
  return normalize(lines.slice(start, end === -1 ? undefined : end));
}

function assertNoPhantom(clause: Clause, text: string): void {
  const body = paragraph(text, clause);
  expect(body, `B0498_${clause.id}_PHANTOM_FORWARDING`).not.toContain(clause.phantom);
}

function readClause(clause: Clause): string {
  // Read failures throw, never become an empty/healthy fixture.
  return readFileSync(new URL(`../${clause.path}`, import.meta.url), "utf8");
}

describe("bug 0498 individual forwarding clauses", () => {
  for (const clause of CLAUSES) {
    it(`${clause.id}: does not attribute cancellation forwarding to unregistered lifecycle handlers`, () => {
      assertNoPhantom(clause, readClause(clause));
    });
  }
});

describe("bug 0498 isolated clause oracle controls", () => {
  it("accepts a driver-local mechanism without imposing new replacement wording", () => {
    for (const clause of CLAUSES) {
      assertNoPhantom(clause, `${clause.start} Driver-local ctx.signal recording; settle classification forwards cancellation.\n\n`);
    }
  });

  it("rejects each original claim independently, including multiline formatting", () => {
    for (const clause of CLAUSES) {
      const text = `${clause.start} ${clause.phantom.replaceAll(" ", "\n")}\n\n`;
      expect(() => assertNoPhantom(clause, text)).toThrow(`B0498_${clause.id}_PHANTOM_FORWARDING`);
    }
  });

  it("refuses a missing paragraph instead of treating a removed anchor as a fix", () => {
    for (const clause of CLAUSES) {
      expect(() => assertNoPhantom(clause, "# unrelated document\n"))
        .toThrow(`B0498 precondition: missing ${clause.id} paragraph in ${clause.path}`);
    }
  });
});
