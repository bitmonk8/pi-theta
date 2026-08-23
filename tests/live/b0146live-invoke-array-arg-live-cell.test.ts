// H8a live witness — bug 0146: an array literal at an `invoke(...)` argument
// slot whose callee declares an incompatible `params:` type must be refused at
// load, the way the same-file `fn` surface already refuses it. The observable
// this cell adds over the offline witness
// (`tests/invoke-arg-array-literal-provable.test.ts`, which reads
// `discoverAndComposeFixtures`) is the REAL production composition root
// deciding registration — `session_start` → `resources_discover` →
// `composeExtensionInstance` → `checkInvokeStaticResolution` — plus the
// `theta-system-note` channel a settled in-memory `SessionManager` carries,
// which is where an `E`-severity code's registration consequence is felt by an
// author.
//
// TWO HALVES:
//   (a) REFUSED — a caller carrying `invoke("./<child>.theta", ["a"])` against
//       a `params: x: string` callee must NOT register, and its refusal must
//       name `theta/parse/invoke-arg-type-mismatch` with the registry-sourced
//       *Message* on the note channel. This half is RED until the collector's
//       `array` arm stops withholding: the caller registers today.
//   (b) ADMITTED — the byte-identical caller with a well-typed `"a"` argument
//       registers and DRIVES a real turn, which is the direction no fix here
//       may move. Asserted on real observables: `driveSlashCaptureTurn`'s
//       deterministic note channel (empty — a fail-closed ending would land
//       there) and its streamed text against a task-question answer, never on
//       `prompt()` merely resolving.
//
// THE REFUSAL CHANNEL IS PROVEN LIVE, token-free, by a third caller passing an
// integer literal at the same callee: that spelling is refused at this HEAD, so
// half (a)'s absent refusal is the collector's withhold and not a note channel
// that carries nothing.
//
// DIAG-4: the asserted message is READ from
// docs/spec_topics/diagnostics/code-registry-parse.md through `parseRegistry` /
// `registryMessage` (tools/code-registry/index.js), never written out here. A
// missing row fails loudly naming the page; nothing here skips.
//
// SUBAGENT CHILD PINS: required. The admitted half's drive executes a real
// `invoke(...)` against a `mode: subagent` callee, which reaches the RFC-0006
// child-process launch; `./harness` sets both #subagent-child-pins (the real pi
// CLI entry at `process.argv[1]` and `PI_THETA_SUBAGENT_EXTENSION_PIN` at this
// tree's `extensions/`, with the authenticated parent-pid carriage) at module
// scope, so the child resolves the build under test.
//
// Token cost: at most two live turns, both in half (b) — the parent's
// task-question turn and the invoked child's. Halves (a) and the refusal
// control are registration-only.
//
// NO SILENT SKIPPING: a missing live provider/model fails loudly through
// `requireLiveProvider` (`failLoudly`); nothing here early-returns or skips.
//
// Bug 0030's file-scope `console.error` spy gates this file: the filtered
// capture (`thetaOwnedStderrLines`) must be empty.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  bootShippedExtension,
  driveSlashCaptureTurn,
  plantThetaWorkspace,
  requireLiveProvider,
  type LiveExtensionHandle,
  type LiveWorkspace,
  type PlantedTheta,
} from "./harness";
import { thetaOwnedStderrLines } from "./theta-stderr-prefixes";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../../tools/code-registry/index.js";

/** The row under test: E severity, phase `type`, so a fired slot denies registration. */
const CODE = "theta/parse/invoke-arg-type-mismatch";

const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

/**
 * One PASS over the `<code>: invoke argument <i> ('<param>') type mismatch:
 * expected <expected>, got <actual>` template, substitution values never
 * re-scanned: `<actual>` legitimately expands to text carrying angle brackets
 * (e.g. `array<string>`), so a second, string-wide placeholder scan after
 * substitution would false-positive on this bug's own output. DIAG-4: the
 * message half is read from the registry row, not copied. This row's
 * *Message* names neither caller nor callee, which is why the registration
 * observable carries the per-caller attribution and the note channel carries
 * the wording.
 */
function invokeArgFragment(
  index: number,
  paramName: string,
  expected: string,
  actual: string,
): string {
  const template = registryMessage(REGISTRY, CODE) as string | undefined;
  expect(
    template,
    `${CODE} has no registry row — the code this cell asserts is not registered (DIAG-2)`,
  ).toBeTypeOf("string");
  const subs = new Map<string, string>([
    ["<i>", String(index)],
    ["<param>", paramName],
    ["<expected>", expected],
    ["<actual>", actual],
  ]);
  const used = new Set<string>();
  const message = (template as string).replace(/<[a-z]+>/g, (token) => {
    const value = subs.get(token);
    expect(
      value,
      `${CODE}: the Message template carries ${token}, which this cell supplies no ` +
        "substitution for — the registry row changed shape",
    ).toBeTypeOf("string");
    used.add(token);
    return value as string;
  });
  for (const token of subs.keys()) {
    expect(
      used.has(token),
      `${CODE}: this cell substitutes ${token} into the Message template, which no ` +
        "longer carries it — the registry row changed shape",
    ).toBe(true);
  }
  return `${CODE}: ${message}`;
}

/**
 * The `mode: subagent` callee every caller below names: one declared `params:`
 * field of type `string`, which keeps `classifyBinderBypass` on its
 * single-string-bypass arm so the callee registers without a binder model, and
 * gives the array-literal argument a primitive expected type.
 */
const CHILD = [
  "---",
  "mode: subagent",
  "params:",
  "  x: string",
  "---",
  "@`What is 118 plus 24? Answer with the number only.`",
  "",
].join("\n");

/** REFUSED — half (a): an array literal at the callee's `string` param. */
const REFUSED = [
  "---",
  "mode: prompt",
  "---",
  'invoke("./b0146livekid.theta", ["a"])',
  "@`What is 341 plus 268? Answer with the number only.`",
  "",
].join("\n");

// Drive discriminators are ANSWERS to task questions, never a verbatim-echo
// demand: current models read "reply with exactly …" as prompt injection and
// refuse it, which makes the reply a coin flip rather than an observable (bug
// 0243).
const ADMITTED_SENTINEL = "609";

/**
 * ADMITTED — half (b): byte-identical to REFUSED apart from the argument, which
 * is well-typed. Registers and drives, before and after the fix alike.
 */
const ADMITTED = [
  "---",
  "mode: prompt",
  "---",
  'invoke("./b0146livekid.theta", "a")',
  "@`What is 341 plus 268? Answer with the number only.`",
  "",
].join("\n");

/**
 * The refusal channel's positive control: an integer literal at the same param.
 * That spelling is decided today, so this caller's absent registration and its
 * note prove the channel carries this row at all — without it half (a)'s
 * expectation could pass against a harness that observes no refusal.
 */
const REFUSAL_CONTROL = [
  "---",
  "mode: prompt",
  "---",
  'invoke("./b0146livekid.theta", 1)',
  "@`What is 341 plus 268? Answer with the number only.`",
  "",
].join("\n");

/** A plain theta in the same workspace: a broken workspace must not read as a refusal. */
const WORKSPACE_CONTROL = [
  "---",
  "mode: prompt",
  "---",
  "@`What is 483 plus 466? Answer with the number only.`",
  "",
].join("\n");

let consoleErrorSpy: MockInstance | undefined;

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, "error");
});

afterEach(() => {
  const spy = consoleErrorSpy;
  try {
    const lines = (spy?.mock.calls ?? []).map((args) => args.map(String).join(" "));
    const offenders = thetaOwnedStderrLines(lines);
    expect(
      offenders,
      "bug 0018's live verification observable for this suite is a 0-byte stderr " +
        "capture; this spy caught theta-owned stderr line(s) instead: " +
        JSON.stringify(offenders),
    ).toEqual([]);
  } finally {
    spy?.mockRestore();
    consoleErrorSpy = undefined;
  }
});

/**
 * The `theta-system-note` channel contents of the settled in-memory
 * `SessionManager`, read directly off `getEntries()` (AGENTS.md §"Assert on real
 * observables"). Load-time diagnostics land here before any drive is attempted.
 */
function systemNoteContents(entries: readonly unknown[]): readonly string[] {
  const notes: string[] = [];
  for (const entry of entries) {
    const e = entry as { customType?: string; content?: unknown };
    if (e.customType !== "theta-system-note") continue;
    if (typeof e.content === "string") notes.push(e.content);
    else if (Array.isArray(e.content)) {
      for (const part of e.content) {
        const t = (part as { text?: string }).text;
        if (typeof t === "string") notes.push(t);
      }
    }
  }
  return notes;
}

// ONE boot for both halves: the halves are reported independently so a red half
// (a) does not hide half (b)'s verdict, and one live host serves both.
let workspace: LiveWorkspace;
let handle: LiveExtensionHandle;

beforeAll(async () => {
  const provider = await requireLiveProvider();
  const thetas: PlantedTheta[] = [
    { source: "project", stem: "b0146livectl", text: WORKSPACE_CONTROL },
    { source: "project", stem: "b0146livekid", text: CHILD },
    { source: "project", stem: "b0146livepos", text: REFUSAL_CONTROL },
    { source: "project", stem: "b0146liveref", text: REFUSED },
    { source: "project", stem: "b0146liveadm", text: ADMITTED },
  ];
  workspace = plantThetaWorkspace(thetas);
  handle = await bootShippedExtension({ workspace, provider });
});

afterAll(async () => {
  await handle.dispose();
  workspace.dispose();
});

describe("bug 0146 live: an array literal at an incompatible `invoke(...)` param denies registration, while its well-typed twin registers and drives", () => {
  it("(a) REFUSED — the array-literal caller does not register and its refusal names the row on the theta-system-note channel", () => {
    expect(
      handle.command("b0146livectl"),
      "the workspace control did not register — a broken workspace, not the gate under " +
        "test, would explain the array-literal caller's absence too. Registered: " +
        JSON.stringify(handle.registeredNames()),
    ).toBeDefined();
    expect(
      handle.command("b0146livekid"),
      "the callee did not register — a single-string-bypass `params:` field needs no " +
        "binder model, so its absence would confound every caller below. Registered: " +
        JSON.stringify(handle.registeredNames()),
    ).toBeDefined();

    const notes = systemNoteContents(handle.sessionManager.getEntries());

    // The refusal channel's positive control, asserted FIRST: an integer
    // literal at the same param is decided today, so this establishes that a
    // refusal of this row is observable here at all.
    expect(
      handle.command("b0146livepos"),
      "the integer-literal caller registered — this row's already-wired spelling stopped " +
        "denying registration, so half (a) below cannot distinguish a missing emission " +
        "from a dead surface. Registered: " + JSON.stringify(handle.registeredNames()),
    ).toBeUndefined();
    expect(
      notes.some((note) => note.includes(invokeArgFragment(0, "x", "string", "integer"))),
      "no theta-system-note entry named " +
        CODE +
        " for the integer-literal control, so this harness carries no instance of the row " +
        "and half (a)'s note assertion measures nothing. Notes: " + JSON.stringify(notes),
    ).toBe(true);

    // (a) The reported direction: the same call spelling with an array literal.
    expect(
      handle.command("b0146liveref"),
      '`invoke("./b0146livekid.theta", ["a"])` registered against a `params: x: string` ' +
        "callee — a declared param type is unenforced at the invoke surface while the " +
        "same-file `fn` surface refuses the identical mistype. Registered: " +
        JSON.stringify(handle.registeredNames()),
    ).toBeUndefined();
    expect(
      notes.some((note) =>
        note.includes(invokeArgFragment(0, "x", "string", "array<string>")),
      ),
      "no theta-system-note entry carried " +
        CODE +
        " with an `array<string>` actual type, so the array literal's refusal did not " +
        "reach the channel an author reads it on. Notes: " + JSON.stringify(notes),
    ).toBe(true);
  });

  it("(b) ADMITTED — the well-typed twin registers and drives one real turn clean", async () => {
    expect(
      handle.command("b0146liveadm"),
      "the byte-identical caller with a well-typed argument did not register, so a literal " +
        "`invoke(...)` call cannot register in this harness at all and half (a) proves " +
        "nothing about the argument. Registered: " +
        JSON.stringify(handle.registeredNames()),
    ).toBeDefined();

    const driven = await driveSlashCaptureTurn(handle, "/b0146liveadm");
    expect(
      driven.systemNotes,
      "the driven turn appended a theta-system-note — a fail-closed ending, so the " +
        "well-typed `invoke(...)` did not complete. Notes: " +
        JSON.stringify(driven.systemNotes),
    ).toEqual([]);
    expect(
      driven.text,
      "the live reply did not answer the theta's task question, so the admitted caller's " +
        "turn did not run to completion. Reply: " + JSON.stringify(driven.text),
    ).toContain(ADMITTED_SENTINEL);
  });
});
