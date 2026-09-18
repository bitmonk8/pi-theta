// PIC-64 / FN-6 — `subagent fn` body code-side extension-tool dispatch: the
// LOAD-time half.
//
// RFC 0012 §10 moved a `subagent fn` body into its own child `pi` process, so
// its code-side extension-tool calls dispatch through THAT child's private,
// discarded session — never the user's live session in the parent (the
// prompt-mode pollution path PIC-64's *Accepted cost* once named for this
// construct is closed). What stays load-time is unchanged: a body is NOT a
// no-rung context — registration tracks rung availability alone, and only a
// surfaces-absent host keeps the fail-closed
// `theta/load/extension-tool-unreachable` refusal.
//
// Two obligations are witnessed here (the dispatch legs are live-exercised:
// the body now runs in a real child):
//   1. (load, parent) a `mode: prompt` theta whose code-side extension-tool
//      call sits INSIDE a `subagent fn` body REGISTERS with zero diagnostics
//      when the host-loop surfaces are present — through the production
//      compose helper (`discoverAndComposeFixtures`);
//   2. (load, no-rung) a surfaces-absent host still refuses the same theta
//      fail-closed with `theta/load/extension-tool-unreachable` naming the
//      tool — the refusal keys on rung availability, never on the enclosing
//      construct.
//
// Spec: pi-integration-contract/subagent.md PIC-64 (#pic-64,
// #subagent-host-loop-dispatch), functions.md FN-6 (#fn-6), RFC 0012 §10,
// diagnostics/code-registry-load.md (`theta/load/extension-tool-unreachable`).

import { resolvingHost } from "./helpers/fake-json-child";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ThetaFixture } from "../src/extension/factory";
import {
  composeExtensionInstance,
  discoverAndComposeFixtures,
} from "../src/extension/production-composition";
import { EXTENSION_TOOL_UNREACHABLE_CODE } from "../src/runtime/host-loop-dispatch";

import { makeIdleModelHost, noteLinesContaining } from "./helpers/compose-workspace-harness";
import { FakeParentHost } from "./helpers/fake-host-loop-host";

// --- The planted thetas ------------------------------------------------------

function theta(...lines: readonly string[]): string {
  return lines.join("\n") + "\n";
}

/**
 * The inline-body acceptance theta: PROMPT mode, an extension tool in `tools:`,
 * and the code-side call to it INSIDE a `subagent fn` inline body. The body's
 * `?` unwraps the tool's Ok; the outer `?` unwraps the FN-6 boundary Result, so
 * the theta's final value is the tool text.
 */
const PARENT_FNCALL = theta(
  "---",
  "mode: prompt",
  "tools: my_tool",
  "---",
  "subagent fn probe() {",
  '  my_tool({ op: "write", n: 7 })?',
  "}",
  "probe()?",
);

const MY_TOOL_SCHEMA = {
  type: "object",
  properties: { op: { type: "string" }, n: { type: "number" } },
  required: ["op"],
} as const;

// --- Parent leg: load + dispatch through the production compose helper --------

let parentDir: string;
let parentHost: FakeParentHost;
let parentFixtures: readonly ThetaFixture[];

beforeAll(async () => {
  parentDir = mkdtempSync(join(tmpdir(), "theta-subfn-exttool-parent-"));
  const dir = join(parentDir, ".pi", "theta");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "fncall.theta"), PARENT_FNCALL, "utf8");
  parentHost = new FakeParentHost(parentDir, MY_TOOL_SCHEMA);
  parentFixtures = await discoverAndComposeFixtures(parentHost.pi, parentHost.ctx);
});

afterAll(() => {
  rmSync(parentDir, { recursive: true, force: true });
});

describe("PIC-64 inline-body context (parent leg) — a prompt-mode theta whose extension-tool code call sits inside a `subagent fn` body", () => {
  it("REGISTERS with zero diagnostics when the host-loop surfaces are present (the inline body is NOT a no-rung context)", () => {
    expect(
      parentFixtures.map((f) => f.slashName),
      "PIC-64: the inline `subagent fn` body dispatches through the process's " +
        "backing host session, so the theta must register when the parent " +
        "host-loop rung is establishable. Notifications: " +
        JSON.stringify(parentHost.notifications),
    ).toContain("fncall");
    // Zero diagnostics: no error toast fired (unknown-tool, unreachable, parse,
    // …) and no load-refusal note reached the note channel.
    expect(parentHost.notifications).toEqual([]);
    expect(parentHost.notes.join("\n")).not.toContain(EXTENSION_TOOL_UNREACHABLE_CODE);
    expect(parentHost.notes.join("\n")).not.toContain("theta/load");
    expect(parentHost.notes.join("\n")).not.toContain("theta/parse");
  });
});

// --- No-rung host: the refusal survives, keyed on rung availability alone -----

describe("PIC-64 rung 3 — a surfaces-absent host still refuses the inline-body code call fail-closed", () => {
  let noRungDir: string;

  beforeAll(() => {
    noRungDir = mkdtempSync(join(tmpdir(), "theta-subfn-exttool-norung-"));
    const dir = join(noRungDir, ".pi", "theta");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "fncall.theta"), PARENT_FNCALL, "utf8");
  });

  afterAll(() => {
    rmSync(noRungDir, { recursive: true, force: true });
  });

  it("refuses with theta/load/extension-tool-unreachable naming the tool (the walk covers `subagent fn` bodies; no silent registration)", async () => {
    const noteContent: string[] = [];
    // A host WITHOUT the host-loop dispatch Pi surfaces (no registerProvider /
    // unregisterProvider / setModel): `probeHostLoopSurfaces` fails, no rung is
    // establishable, and the ladder is fail-closed.
    const { pi, ctx } = makeIdleModelHost(noRungDir, true, {
      noteContent,
      tools: [{ name: "my_tool", parameters: MY_TOOL_SCHEMA, sourceInfo: { scope: "user" } }],
      hostLoopSurfaces: false,
    });

    const wiring = await composeExtensionInstance(pi, ctx, {
      subagentExecutableHost: resolvingHost(),
    });

    expect(
      wiring.thetas.map((t) => t.slashName),
      "with NO establishable rung the inline-body code call must refuse to " +
        "register — notes: " + JSON.stringify(noteContent),
    ).not.toContain("fncall");
    // The refusal is the pinned fail-closed rung-3 diagnostic, attributed to the
    // refusing theta (one line carrying the file, the code, and the tool name) —
    // NOT an admission unknown-tool (the registry name resolves mode-independently).
    const refusalLines = noteLinesContaining(
      noteContent,
      "fncall.theta",
      EXTENSION_TOOL_UNREACHABLE_CODE,
    );
    expect(
      refusalLines.length,
      "fncall.theta itself must refuse with the extension-tool-unreachable code — " +
        "notes: " + JSON.stringify(noteContent),
    ).toBeGreaterThan(0);
    expect(refusalLines.join("\n")).toContain("my_tool");
    expect(noteContent.join("\n")).not.toContain("unknown Pi tool 'my_tool'");
  });
});
