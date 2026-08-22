// H8a live witness — bug 0131: a `<name>(args)` call whose callee resolves to a
// top-level `fn` in the same file is now subject to an argument-COUNT check at
// the type phase (`checkFnCallArity`, wired inside `checkFnCallArgs`,
// `src/parser/type-layer-checks.ts` — arity BEFORE per-argument type, an early
// `return` above the per-argument loop). Two consequences are observable only
// through the real discovery→registration path, not through the offline
// `parseDoc` witness:
//   - the mis-arity theta — `fn f(p: integer): integer { 1 }` called
//     `f(1, 2, 3)` — does NOT register, and its refusal reaches the
//     `theta-system-note` channel a real `SessionManager` settles, carrying
//     `theta/parse/fn-arity-too-many` with the registry-sourced Message
//     (DIAG-4);
//   - the correct-arity control DOES register and drives a real turn to a
//     fixture-pinned sentinel — proving the refusal above is not a broken
//     workspace and that this harness can witness both directions.
// (docs/bugs/0131-in-document-fn-call-arity-unchecked.md,
// .pi/tmp/fixes/0131-adjudication.md §(a), §(c).)
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS DOES NOT.
// `tests/fn-call-arity-unchecked.test.ts` pins the exact diagnostic byte lists
// at the `parseDoc` boundary. It does not observe the real
// discovery→registration path deciding whether a mis-arity `fn` call becomes a
// slash command, nor the note channel the settled `SessionManager` carries —
// which is where the registration consequence of an `E`-severity code is felt
// (`const registered = !diagnostics.some((d) => d.severity === "error")`,
// src/extension/production-composition.ts:1735). This cell drives both
// through the shipped production composition root (`bootShippedExtension`),
// mirroring `tests/live/fn-param-sink-array-literal-live-cell.test.ts`, and
// asserts on real observables — the `theta-system-note` channel read off the
// settled `SessionManager`, and `driveSlashCaptureTurn`'s deterministic
// `text`/`systemNotes` — never on `prompt()` merely resolving.
//
// TWO HALVES:
//   (a) REFUSED — `fn f(p: integer): integer { 1 }` called `f(1, 2, 3)` must
//       NOT register, and its note must carry `theta/parse/fn-arity-too-many`
//       with the registry *Message*.
//   (b) ADMITTED (control) — the same callee called with the correct arity
//       (`f(1)`) registers and DRIVES a real turn to a sentinel echo.
//
// DIAG-4: every asserted message half is READ from
// docs/spec_topics/diagnostics/code-registry-parse.md through `parseRegistry` /
// `registryMessage` (tools/code-registry/index.js), never written out here.
//
// FILENAME TOKEN: `` is this lane's merge token. Sibling lanes measure
// their own regions of the same `fn`-argument boundary concurrently, so a
// standalone live cell created under a plain descriptive basename risks a
// both-added collision at merge; the token makes this lane's file uniquely
// named and strippable by the parent. The other standalone `*-live-cell`
// files predate the parallel-lane arrangement and carry no token.
//
// SUBAGENT CHILD PINS: not required for the parse/registration observable —
// both thetas are `mode: prompt` and drive no `invoke` / subagent — but the
// harness sets both #subagent-child-pins at module scope regardless
// (`./harness`).
//
// Token cost: ONE live turn (the admitted control's sentinel echo). The
// refused half is registration-only, so no drive is attempted and no tokens
// are spent on it.
//
// NO SILENT SKIPPING: a missing live provider/model fails loudly through
// `requireLiveProvider` (`failLoudly`); nothing here early-returns or skips.
//
// Bug 0030's file-scope `console.error` spy gates this file: the filtered
// capture (`thetaOwnedStderrLines`) must be empty.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  bootShippedExtension,
  driveSlashCaptureTurn,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";
import { thetaOwnedStderrLines } from "./theta-stderr-prefixes";
import { parseDoc } from "../helpers/e2e-s1";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../../tools/code-registry/index.js";

/** The refusal the mis-arity call must draw (E, type). */
const TOO_MANY_CODE = "theta/parse/fn-arity-too-many";

const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

/** DIAG-4: the message half is read from the registry row, not copied. */
function registryFragment(code: string, substitutions: Readonly<Record<string, string>>): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `${code} has no registry row — the code this cell asserts is not registered (DIAG-2)`,
  ).toBeTypeOf("string");
  let message = template as string;
  for (const [key, value] of Object.entries(substitutions)) {
    message = message.replaceAll(`<${key}>`, value);
  }
  expect(
    message,
    `${code}: an unsubstituted placeholder remains — the registry row's Message template changed shape`,
  ).not.toMatch(/<[a-z]+>/);
  return `${code}: ${message}`;
}

/**
 * The theta-system-note channel contents from the settled in-memory
 * `SessionManager`, read directly off `getEntries()` (AGENTS.md §"Assert on
 * real observables").
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

/**
 * REFUSED — the report's a-1v3 subject: `fn f(p: integer): integer { 1 }`
 * called `f(1, 2, 3)` — three arguments against a one-parameter callee.
 */
const REFUSED = [
  "---",
  "mode: prompt",
  "---",
  "fn f(p: integer): integer { 1 }",
  "let r = f(1, 2, 3)",
  "r",
  "",
].join("\n");

const ADMITTED_SENTINEL = "FNCALLARITY0131LIVEADMITTED";

/**
 * ADMITTED (control) — the same callee called at the correct arity. A plain
 * sentinel-echo prompt rather than a typed query, so no AJV schema is
 * registered under a name this extension host's other document also declares.
 */
const ADMITTED = [
  "---",
  "mode: prompt",
  "---",
  "fn f(p: integer): integer { 1 }",
  "let r = f(1)",
  "@`Reply with exactly the token " + ADMITTED_SENTINEL + " and nothing else.`",
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
      "bug 0018's live verification observable for this suite is a 0-byte " +
        "stderr capture; this spy caught theta-owned stderr line(s) instead: " +
        JSON.stringify(offenders),
    ).toEqual([]);
  } finally {
    spy?.mockRestore();
    consoleErrorSpy = undefined;
  }
});

describe("bug 0131 live: a same-file `fn` call with too many arguments does not register, while the correct-arity control drives", () => {
  it("registers the correct-arity control and drives it to the live sentinel, while the mis-arity call does not register and carries its refusal on the theta-system-note channel", async () => {
    // ATTRIBUTION GUARD for the REFUSED half (offline, token-free, runs BEFORE
    // the live host is required): the mis-arity document carries exactly the
    // one-code disposition, so its live observable below cannot be produced by
    // an unrelated load failure.
    expect(
      parseDoc(REFUSED, "b0131livref.theta").diagnostics.map((d) => d.code),
      "attribution: the mis-arity document must carry exactly " + TOO_MANY_CODE,
    ).toEqual([TOO_MANY_CODE]);
    // The ADMITTED half's guard is asked here too, beside the refused one,
    // rather than deferred to its own live assertions: both halves share one
    // planted extension host below, so a regression in either document's
    // shape invalidates the whole cell's attribution rather than one half's,
    // and failing before the provider is required spends no tokens on a run
    // whose observables could no longer be attributed.
    expect(
      parseDoc(ADMITTED, "b0131livadm.theta").diagnostics.map((d) => d.code),
      "attribution: the correct-arity document must carry zero diagnostics",
    ).toEqual([]);

    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the same workspace, so an
      // absent refused-document registration cannot be misattributed to a
      // broken workspace.
      {
        source: "project",
        stem: "b0131livectl",
        text: [
          "---",
          "mode: prompt",
          "---",
          "@`Reply with exactly the token bug 0131 CONTROL and nothing else.`",
          "",
        ].join("\n"),
      },
      { source: "project", stem: "b0131livref", text: REFUSED },
      { source: "project", stem: "b0131livadm", text: ADMITTED },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b0131livectl"),
        "the precondition control did not register — a broken workspace, not the load " +
          "refusal, would explain the refused document's absence too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // (a) REFUSED — the mis-arity call must not register.
      expect(
        handle.command("b0131livref"),
        "`f(1, 2, 3)` against a one-parameter `fn f(p: integer)` registered — the arity check " +
          "stopped denying the load gate. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();

      // The theta-system-note channel, read off the settled SessionManager. The
      // load-time diagnostics fire before any drive is attempted, so the full
      // entry list already carries them.
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const refusalFragment = registryFragment(TOO_MANY_CODE, {
        name: "f",
        required: "1",
        provided: "3",
      });
      expect(
        notes.some((note) => note.includes(refusalFragment)),
        "no theta-system-note entry named " +
          TOO_MANY_CODE +
          " for the mis-arity document — the refusal did not reach the note channel, so this " +
          "harness cannot witness a refusal at all and the admitted half's registration proves " +
          "nothing. Notes: " + JSON.stringify(notes),
      ).toBe(true);

      // (b) ADMITTED (control) — the correct-arity call must register and
      // drive a real turn to the deterministic sentinel.
      expect(
        handle.command("b0131livadm"),
        "`f(1)` against a one-parameter `fn f(p: integer)` failed to register — the correct-arity " +
          "control must not be refused. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      const driven = await driveSlashCaptureTurn(handle, "/b0131livadm");
      expect(
        driven.text,
        "the live model reply for the correct-arity control did not contain the deterministic " +
          "sentinel. Reply: " + JSON.stringify(driven.text),
      ).toContain(ADMITTED_SENTINEL);
      expect(
        driven.systemNotes,
        "the driven turn over the correct-arity control appended a theta-system-note (a " +
          "fail-closed ending) — the correct-arity path must drive clean. Notes: " +
          JSON.stringify(driven.systemNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
