// H8a live witness — bug 0156: the callee's declared parameter type is supplied
// as the array-literal element sink at `checkFnCallArgs` (§Fix Route A), so a
// rule-3 union written at the argument position admits through the real
// discovery→registration path. Two consequences are observable there and
// nowhere in the offline witness:
//   - the union-parameter theta — a spec-legal source
//     (`docs/spec_topics/expressions.md:228`: two different named schemas yield
//     `array<A | B>` "only if some sink in scope expects a union", and the
//     callee's `array<A | B>` parameter IS such a sink by `:222`'s own list) —
//     REGISTERS as a slash command and drives a real turn, where an
//     `E`-severity `theta/parse/array-no-common-type` refuses it absent this
//     fix;
//   - the sink-LESS control, which no fix here may move, is still REFUSED and
//     its refusal lands on the `theta-system-note` channel a real
//     `SessionManager` settles — so the harness is proven able to detect a
//     refusal, and the admitted half's registration is not a harness that
//     stopped measuring.
// (docs/bugs/0156-fn-parameter-sink-not-consulted-for-rule3-unions.md,
// §Reproduction rows a1 and d1; §Fix constraint 6, which names exactly this
// pairing — "its refusal control must be d1 so the harness is proven able to
// detect a refusal".)
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS DOES NOT.
// `tests/fn-param-sink-array-literal.test.ts` pins the exact diagnostic byte
// lists at the `parseDoc` boundary. It does not observe the real
// discovery→registration path deciding whether a `.theta` carrying either shape
// becomes a slash command, nor the note channel the settled `SessionManager`
// carries — which is where the registration consequence of an `E`-severity code
// is felt (`const registered = !diagnostics.some((d) => d.severity ===
// "error")`, src/extension/production-composition.ts:1735). This cell drives
// both through the shipped production composition root
// (`bootShippedExtension`), mirroring
// `tests/live/alias-sink-array-element-check-live-cell.test.ts`, and asserts on
// real observables — the `theta-system-note` channel read off the settled
// `SessionManager`, and `driveSlashCaptureTurn`'s deterministic
// `text`/`systemNotes` — never on `prompt()` merely resolving.
//
// TWO HALVES:
//   (1) ADMITTED — `fn f(xs: array<A | B>)` called with `[A { … }, B { … }]`
//       registers and DRIVES a real turn to a sentinel echo. Absent this fix
//       the theta is refused outright, so the drive is the direction the fix
//       opens. This half is expected RED before the fix lands.
//   (2) REFUSED — the same literal with NO sink anywhere must NOT register, and
//       its note must carry `theta/parse/array-no-common-type` with the
//       registry *Message*. This is rule 3 doing its job (bug 0081's witness
//       cell r7, re-measured), the direction the fix must not move, and the
//       proof that an absent registration in half (1) would have been visible.
//
// DIAG-4: every asserted message half is READ from
// docs/spec_topics/diagnostics/code-registry-parse.md through `parseRegistry` /
// `registryMessage` (tools/code-registry/index.js), never written out here.
//
// SUBAGENT CHILD PINS: not required for the parse/registration observable —
// both thetas are `mode: prompt` and drive no `invoke` — but the harness sets
// both #subagent-child-pins at module scope regardless (`./harness`).
//
// Token cost: ONE live turn (the admitted theta's sentinel echo). The refused
// half is registration-only, so no drive is attempted and no tokens are spent
// on it.
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

/** The refusal the sink-less control must keep, and the admitted half must lose (E, type). */
const NO_COMMON_CODE = "theta/parse/array-no-common-type";
/** Rule 1's code — no sink is written in either planted document's failing half. */
const ELEMENT_CODE = "theta/parse/array-element-type-mismatch";

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
 * REFUSED — the report's d1 subject: the identical rule-3 literal with NO sink
 * anywhere. `expressions.md:228` is the only sink-less rejection the array rules
 * prescribe, so this refusal is inside `array-no-common-type`'s own registered
 * *Trigger* ("… and no sink to narrow against") and must survive the fix.
 */
const REFUSED = [
  "---",
  "mode: prompt",
  "---",
  "schema A {",
  "  a: integer",
  "}",
  "schema B {",
  "  b: string",
  "}",
  'let x = [A { a: 1 }, B { b: "x" }]',
  "x",
  "",
].join("\n");

const ADMITTED_SENTINEL = "FNPARAMSINK0156LIVEADMITTED";

/**
 * ADMITTED — the report's a1 subject: a `fn` parameter declaring `array<A | B>`
 * called with one `A` and one `B`. A sink in scope expects exactly the union
 * rule 3 asks about, so this loads and drives. A plain sentinel-echo prompt
 * rather than a typed query, so no AJV schema is registered under a name this
 * extension host's other document also declares.
 */
const ADMITTED = [
  "---",
  "mode: prompt",
  "---",
  "schema A {",
  "  a: integer",
  "}",
  "schema B {",
  "  b: string",
  "}",
  "fn f(xs: array<A | B>): integer { 1 }",
  'let y = f([A { a: 1 }, B { b: "x" }])',
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

describe("bug 0156 live: a union-typed `fn` parameter supplies the array sink so its call registers and drives, while the sink-less twin stays refused", () => {
  it("registers `fn f(xs: array<A | B>)` called with one A and one B and drives it to the live sentinel, while the sink-less literal does not register and carries its refusal on the theta-system-note channel", async () => {
    // ATTRIBUTION GUARD for the REFUSED half (offline, token-free, runs BEFORE
    // the live host is required): the sink-less document carries exactly the
    // one-code disposition, so its live observable below cannot be produced by
    // an unrelated load failure. The ADMITTED half's guard is deliberately
    // deferred to directly above its own live assertions: it is the half this fix
    // opens, so asserting it here would abort the run before the refusal half
    // has proven the harness can witness a refusal at all.
    expect(
      parseDoc(REFUSED, "b0156liveref.theta").diagnostics.map((d) => d.code),
      "attribution: the sink-less document must carry exactly " + NO_COMMON_CODE,
    ).toEqual([NO_COMMON_CODE]);

    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the same workspace, so an
      // absent refused-document registration cannot be misattributed to a
      // broken workspace.
      {
        source: "project",
        stem: "b0156livectl",
        text: [
          "---",
          "mode: prompt",
          "---",
          "@`Reply with exactly the token bug 0156 CONTROL and nothing else.`",
          "",
        ].join("\n"),
      },
      { source: "project", stem: "b0156liveref", text: REFUSED },
      { source: "project", stem: "b0156liveadm", text: ADMITTED },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b0156livectl"),
        "the precondition control did not register — a broken workspace, not the load " +
          "refusal, would explain the refused document's absence too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // (2) REFUSED — the direction the fix must not move, asserted FIRST so
      // the harness's ability to observe a refusal is established before the
      // admitted half's registration is read as meaningful.
      expect(
        handle.command("b0156liveref"),
        '`let x = [A { a: 1 }, B { b: "x" }]` registered — rule 3\'s sink-less refusal stopped ' +
          "denying the load gate. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();

      // The theta-system-note channel, read off the settled SessionManager. The
      // load-time diagnostics fire before any drive is attempted, so the full
      // entry list already carries them.
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const refusalFragment = registryFragment(NO_COMMON_CODE, {});
      expect(
        notes.some((note) => note.includes(refusalFragment)),
        "no theta-system-note entry named " +
          NO_COMMON_CODE +
          " for the sink-less document — the refusal did not reach the note channel, so this " +
          "harness cannot witness a refusal at all and the admitted half's registration proves " +
          "nothing. Notes: " + JSON.stringify(notes),
      ).toBe(true);
      expect(
        notes.some((note) => note.includes(ELEMENT_CODE)),
        "a theta-system-note entry named " +
          ELEMENT_CODE +
          " fired — rule 1's code needs a sink in scope, and neither planted document writes " +
          "one over a mismatched element. Notes: " + JSON.stringify(notes),
      ).toBe(false);

      // (1) ADMITTED — the direction the fix opens: a spec-legal rule-3 source
      // at an argument position becomes a slash command. Its attribution guard
      // runs here rather than at the top of the test, so the refusal half above
      // is exercised live on every run.
      expect(
        parseDoc(ADMITTED, "b0156liveadm.theta").diagnostics.map((d) => d.code),
        "attribution: the union-parameter document must carry zero diagnostics — a spec-legal " +
          "source the fix stops refusing",
      ).toEqual([]);
      expect(
        handle.command("b0156liveadm"),
        "`fn f(xs: array<A | B>)` called with one A and one B failed to register — the callee's " +
          "parameter type is still not supplied as the array-literal sink and the source is " +
          "refused. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // "and drives": one real live turn, proving the newly-admitted document
      // completes a drive rather than merely passing a static registration
      // check.
      const driven = await driveSlashCaptureTurn(handle, "/b0156liveadm");
      expect(
        driven.text,
        "the live model reply for the union-parameter document did not contain the " +
          "deterministic sentinel. Reply: " + JSON.stringify(driven.text),
      ).toContain(ADMITTED_SENTINEL);
      expect(
        driven.systemNotes,
        "the driven turn over the union-parameter document appended a theta-system-note (a " +
          "fail-closed ending) — the admitted path must drive clean. Notes: " +
          JSON.stringify(driven.systemNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
