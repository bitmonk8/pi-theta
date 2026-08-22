//
// H8a live witness -- bug 0231: `TypeParser.parseObject`'s malformed-field
// `break` discarded every entry behind the first one that did not spell
// `Ident ":"`, so a field-name case violation SIBLING to a malformed entry
// went unchecked at every `Type` position -- and at a generic type argument
// (bug 0227's registered carve-out on the raw-key rows, unaffected by this
// fix) it was the ONLY check that would have fired, so the whole document
// loaded with an EMPTY diagnostic list and REGISTERED
// (docs/bugs/0231-well-formed-field-behind-malformed-entry-unchecked.md
// §Reproduction (d), row d1). §Fix (a) route 1 replaces the `break` with a
// brace-and-angle-aware resynchronisation to this interior's next depth-0 `,`,
// so `Zs`'s `theta/parse/binding-case-mismatch` now fires there too and the
// document is REFUSED at registration.
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS DOES NOT.
// `tests/inline-object-malformed-entry-resync.test.ts` group (D) pins the
// diagnostic bytes and the `registers()` predicate directly at the
// `parseThetaDocument` boundary. No offline cell observes the real
// discovery->registration path deciding whether a `.theta` whose annotation
// carries `array<{a b: integer, Zs: string}>` becomes a slash command at all.
// This cell drives that decision through the shipped production composition
// root (`bootShippedExtension`), mirroring
// `tests/live/inline-field-name-not-identifier-live-cell.test.ts` structure
// exactly, and asserts on real observables -- the `theta-system-note` channel
// read off the settled `SessionManager` -- never on `prompt()` merely
// resolving.
//
// TWO HALVES:
//   (1) OFFENDER -- `let x: array<{a b: integer, Zs: string}> = [1]` must NOT
//       register post-fix: `Zs`'s `binding-case-mismatch` is E-severity, so
//       `hasLoadParseError` denies registration and the refusal lands on the
//       theta-system-note channel before any drive is attempted -- no tokens
//       spent. Pre-fix (route 1 neutralised) this theta loads with an EMPTY
//       diagnostic list and registers -- the exact regression this cell
//       proves closed.
//   (2) CLEAN -- the case-fixed sibling `array<{a b: integer, zs: string}>`
//       registers and DRIVES a real typed query to completion, so "still
//       registers AND still drives" is proven end to end through the real
//       composition root, not merely offline. One live turn, sentinel-pinned.
//
// SUBAGENT CHILD PINS: not required for the parse/registration observable --
// both thetas are `mode: prompt` and drive no `invoke` -- but the shared
// harness sets BOTH #subagent-child-pins plus the parent-pid carriage at
// module scope regardless (`./harness`), the AGENTS.md requirement for any
// in-process harness that can reach the RFC-0006 child launch.
//
// Token cost: ONE live turn (the CLEAN sibling's typed query + sentinel
// echo). The OFFENDER half is registration-only.
//
// Bug 0030's file-scope `console.error` spy gates this file: the filtered
// capture (`thetaOwnedStderrLines`) must be empty.
//
// OFFLINE ATTRIBUTABLE GUARD: the attribution check runs BEFORE the live host
// is required, so a neutralised fix reds here with zero tokens spent (per
// AGENTS.md's "prefer the offline-attributable guard").

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import {
  bootShippedExtension,
  driveSlashCaptureTurn,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";
import { thetaOwnedStderrLines } from "./theta-stderr-prefixes";
import { parseDoc } from "../helpers/e2e-s1";

/** The registered row bug 0154's fix draws, still withheld pre-0231 (`Zs`, row d1). */
const CASE = "theta/parse/binding-case-mismatch";

/**
 * OFFENDER -- §Reproduction (d) row d1's exact fixture: a malformed inline
 * entry (`a b`, no `Ident ":"` head) followed by a well-formed field (`Zs`)
 * whose case violation is unreachable pre-fix, inside a generic type
 * argument (`array<...>`) where bug 0227's raw-key carve-out withholds
 * `inline-field-name-not-identifier` too, so `binding-case-mismatch` is the
 * ONLY check that would ever fire at this position. Query-free: the
 * refusal/admission is decided at parse/load time.
 */
const OFFENDER = [
  "---",
  "mode: prompt",
  "---",
  "let x: array<{a b: integer, Zs: string}> = [1]",
  "let a = \"OFFENDER BODY RAN\"",
  "a",
  "",
].join("\n");

const CLEAN_SENTINEL = "H8A CLEAN SENTINEL 0231";

/**
 * CLEAN -- the case-fixed sibling: `zs` in place of `Zs`, `a` in place of
 * `a b`. Registers and drives a real typed query, so the fix's own good path
 * -- an ordinary two-field generic argument -- is proven undisturbed.
 */
const CLEAN = [
  "---",
  "mode: prompt",
  "---",
  'let x: array<{a: integer, zs: string}> = @`Return a JSON array containing exactly ' +
    'one object of the shape {"a": 1, "zs": "' +
    CLEAN_SENTINEL +
    '"} and nothing else, no other text.`?',
  "@`Reply with exactly this text and nothing else, no punctuation: " + CLEAN_SENTINEL + "`?",
  "",
].join("\n");

/**
 * The theta-system-note channel contents from the settled in-memory
 * `SessionManager`, read directly off `getEntries()` (AGENTS.md
 * §"Assert on real observables").
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
      "bug 0018's live verification observable for this suite is a 0-byte stderr capture; this " +
        "spy caught theta-owned stderr line(s) instead: " + JSON.stringify(offenders),
    ).toEqual([]);
  } finally {
    spy?.mockRestore();
    consoleErrorSpy = undefined;
  }
});

describe("bug 0231 live: a well-formed field's case violation behind a malformed generic-argument entry now refuses registration", () => {
  it("does not register `let x: array<{a b: integer, Zs: string}> = [1]` post-fix, the theta-system-note channel names binding-case-mismatch, and the case-fixed sibling still registers and drives", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): the offender carries exactly the fixed code and the clean
    // sibling is clean, so neither live observable below can be produced by
    // an unrelated load failure. This reds a neutralised fix before any
    // provider call is made.
    // Since bug 0233's widen (0.196.0) the malformed `a b` entry inside the
    // generic argument ALSO draws `theta/parse/inline-field-name-not-identifier`
    // beside the case refusal this cell witnesses — an entailed second
    // diagnostic, ratified under 0233's origin authority (matching this cell's
    // H9a acceptance sibling); the cell's subject (0231's resync reaching
    // `Zs`'s case rule) is unchanged.
    expect(
      parseDoc(OFFENDER, "b0231livebad.theta").diagnostics.map((d) => d.code),
      "attribution: the offending theta must carry exactly the fixed code set " +
        "[binding-case-mismatch, inline-field-name-not-identifier]",
    ).toEqual([CASE, "theta/parse/inline-field-name-not-identifier"]);
    expect(
      parseDoc(CLEAN, "b0231livegood.theta").diagnostics.map((d) => d.code),
      "attribution: the case-fixed sibling must carry zero diagnostics -- the fix must not " +
        "disturb the good path",
    ).toEqual([]);

    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the same workspace, so an
      // absent OFFENDER registration cannot be misattributed to a broken
      // workspace.
      {
        source: "project",
        stem: "b0231livectl",
        text: [
          "---",
          "mode: prompt",
          "---",
          "@`Reply with exactly the token bug 0231 CONTROL and nothing else.`",
          "",
        ].join("\n"),
      },
      { source: "project", stem: "b0231livebad", text: OFFENDER },
      { source: "project", stem: "b0231livegood", text: CLEAN },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b0231livectl"),
        "the precondition control did not register -- a broken workspace, not the fix, would " +
          "explain the OFFENDER theta's absence too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: `Zs`'s case violation, behind the malformed
      // `a b` entry inside a generic type argument, must now be reached, so
      // the caller must NOT register (§Reproduction (d) row d1's loss of
      // loads-cleanly status).
      expect(
        handle.command("b0231livebad"),
        "`let x: array<{a b: integer, Zs: string}> = [1]` registered -- bug 0231's field-loop " +
          "resynchronisation did not reach `Zs`'s case violation behind the malformed entry. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b0231livebad");

      // The theta-system-note channel, read off the settled SessionManager --
      // the load-time diagnostic fires before any drive is attempted, so the
      // full entry list already carries it.
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      expect(
        notes.some((note) => note.includes(CASE)),
        "no theta-system-note entry named " + CASE + " for the OFFENDER declaration -- the " +
          "resynchronised field loop did not reach `Zs`, or the note is missing entirely. " +
          "Notes: " + JSON.stringify(notes),
      ).toBe(true);

      // The case-fixed sibling is unaffected: it registers.
      expect(
        handle.command("b0231livegood"),
        "the case-fixed generic-argument sibling failed to register -- the fix must not " +
          "disturb the good path. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // "still drives": one real live turn, proving the case-fixed sibling's
      // typed query completes against a live model and echoes the sentinel
      // planted through the literal array element, no query on the
      // generic-argument annotation itself.
      const driven = await driveSlashCaptureTurn(handle, "/b0231livegood");
      expect(
        driven.text,
        "the live model reply for the case-fixed sibling did not contain the deterministic " +
          "sentinel. Reply: " + JSON.stringify(driven.text),
      ).toContain(CLEAN_SENTINEL);
      expect(
        driven.systemNotes,
        "the driven turn over the case-fixed sibling appended a theta-system-note (a " +
          "fail-closed ending) -- the good path must drive clean. Notes: " +
          JSON.stringify(driven.systemNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
