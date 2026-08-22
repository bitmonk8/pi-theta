// H8a live witness — bug 0157: the three array-literal sink dispatches unfold
// the sink before classifying it, so an alias-spelled `array<T>` annotation
// supplies the element sink through the real discovery→registration path. Two
// consequences are observable there and nowhere in the offline witness:
//   - the alias-spelled element mismatch is REFUSED with the element
//     diagnostic and its index carried on the `theta-system-note` channel a
//     real `SessionManager` settles, so the author sees WHICH element is wrong
//     at load time and not only that something is;
//   - the alias-union theta — a spec-legal source (`A ⊑ A | B` and
//     `B ⊑ A | B`) that an `E`-severity `theta/parse/array-no-common-type`
//     refuses absent this fix — REGISTERS as a slash command and drives a
//     real turn.
// (docs/bugs/0157-alias-vs-concrete-sink-spelling-code-divergence.md,
// §Reproduction (a) and (b); §Why it matters point 2.)
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS DOES NOT.
// `tests/alias-sink-array-element-check.test.ts` pins the exact diagnostic byte
// lists at the `parseDoc` boundary. It does not observe the real
// discovery→registration path deciding whether a `.theta` carrying either shape
// becomes a slash command, nor the note channel the settled `SessionManager`
// carries — which is where the registration consequence of a `E`-severity code
// (`hasLoadParseError`, src/extension/production-composition.ts:1502) is felt.
// This cell drives both through the shipped production composition root
// (`bootShippedExtension`), mirroring
// `tests/live/empty-object-discriminator-field-withhold-live-cell.test.ts`, and
// asserts on real observables — the `theta-system-note` channel read off the
// settled `SessionManager`, and `driveSlashCaptureTurn`'s deterministic
// `text`/`systemNotes` — never on `prompt()` merely resolving.
//
// TWO HALVES:
//   (1) REFUSED — `schema U = array<string>` + `let xs: U = ["a", 1]` must NOT
//       register (both codes are `E`-severity, so either alone already refuses),
//       and its note carries `theta/parse/array-element-type-mismatch` naming
//       index 1 alongside the outer `theta/parse/let-rhs-type-mismatch`. The
//       element fragment is the fixed observable: a cell asserting only absent
//       registration cannot red on this fix's subject, since the outer code
//       alone already refuses without it — so the note text is asserted too.
//   (2) ADMITTED — `schema U = array<A | B>` + `let xs: U = [A { … }, B { … }]`
//       registers and DRIVES a real turn to a sentinel echo. Absent this fix
//       this theta is refused outright, so the drive is the direction the fix
//       opens.
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

/** The element diagnostic the alias spelling is owed (E, type). */
const ELEMENT_CODE = "theta/parse/array-element-type-mismatch";
/** The outer typed-binding code, which fires on both spellings (E, type). */
const LET_RHS_CODE = "theta/parse/let-rhs-type-mismatch";
/** The refusal the admitted half must no longer draw (E, type). */
const NO_COMMON_CODE = "theta/parse/array-no-common-type";

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
 * REFUSED — the report's f3 subject: an alias-spelled `array<string>` sink over
 * a literal whose element 1 is an `integer`. Two `E` codes, the element one
 * carrying the index.
 */
const REFUSED = [
  "---",
  "mode: prompt",
  "---",
  "schema U = array<string>",
  'let xs: U = ["a", 1]',
  "xs",
  "",
].join("\n");

const ADMITTED_SENTINEL = "ALIASSINK0157LIVEADMITTED";

/**
 * ADMITTED — the report's o1 subject: an alias of `array<A | B>` over a literal
 * of one `A` and one `B`. Rule 1 admits both elements against the unfolded
 * element type, so this loads and drives. A plain sentinel-echo prompt rather
 * than a typed query, so no AJV schema is registered under a name this
 * extension host's other document also declares.
 */
const ADMITTED = [
  "---",
  "mode: prompt",
  "---",
  "schema A {",
  "  a: string",
  "}",
  "schema B {",
  "  b: string",
  "}",
  "schema U = array<A | B>",
  'let xs: U = [A { a: "x" }, B { b: "y" }]',
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

describe("bug 0157 live: an alias-spelled array sink refuses with the element diagnostic, and the alias-union sink registers and drives", () => {
  it("does not register `schema U = array<string>` + `let xs: U = [\"a\", 1]` and carries the element diagnostic with its index on the theta-system-note channel, while `schema U = array<A | B>` over one A and one B registers and drives to the live sentinel", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): the refused document carries exactly the two-code disposition
    // and the admitted one is clean, so neither live observable below can be
    // produced by an unrelated load failure.
    expect(
      parseDoc(REFUSED, "b0157liveref.theta").diagnostics.map((d) => d.code),
      "attribution: the refused document must carry exactly " +
        LET_RHS_CODE +
        " then " +
        ELEMENT_CODE,
    ).toEqual([LET_RHS_CODE, ELEMENT_CODE]);
    expect(
      parseDoc(ADMITTED, "b0157liveadm.theta").diagnostics.map((d) => d.code),
      "attribution: the alias-union document must carry zero diagnostics — a spec-legal " +
        "source the fix stops refusing",
    ).toEqual([]);

    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the same workspace, so an
      // absent refused-document registration cannot be misattributed to a
      // broken workspace.
      {
        source: "project",
        stem: "b0157livectl",
        text: [
          "---",
          "mode: prompt",
          "---",
          "@`Reply with exactly the token bug 0157 CONTROL and nothing else.`",
          "",
        ].join("\n"),
      },
      { source: "project", stem: "b0157liveref", text: REFUSED },
      { source: "project", stem: "b0157liveadm", text: ADMITTED },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b0157livectl"),
        "the precondition control did not register — a broken workspace, not the load " +
          "refusal, would explain the refused document's absence too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      expect(
        handle.command("b0157liveref"),
        '`let xs: U = ["a", 1]` registered — an `E`-severity type diagnostic did not deny ' +
          "registration. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();

      // The theta-system-note channel, read off the settled SessionManager. The
      // load-time diagnostics fire before any drive is attempted, so the full
      // entry list already carries them. THE FIXED OBSERVABLE is the element
      // fragment with its index: absent registration alone cannot red on this
      // fix's subject, since the outer code alone already refuses without it.
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const outerFragment = registryFragment(LET_RHS_CODE, {
        name: "xs",
        expected: "U",
        actual: "array<string | integer>",
      });
      const elementFragment = registryFragment(ELEMENT_CODE, {
        i: "1",
        expected: "string",
        actual: "integer",
      });
      expect(
        notes.some((note) => note.includes(outerFragment)),
        "no theta-system-note entry named " +
          LET_RHS_CODE +
          " for the refused document — the load refusal did not reach the note channel. " +
          "Notes: " + JSON.stringify(notes),
      ).toBe(true);
      expect(
        notes.some((note) => note.includes(elementFragment)),
        "no theta-system-note entry named " +
          ELEMENT_CODE +
          " with index 1 for the refused document — the alias-spelled sink still routes " +
          "the literal down the sink-less path and the author is not told which element " +
          "is wrong. Notes: " + JSON.stringify(notes),
      ).toBe(true);
      expect(
        notes.some((note) => note.includes(NO_COMMON_CODE)),
        "a theta-system-note entry named " +
          NO_COMMON_CODE +
          " fired — that row's registered Trigger requires no sink to narrow against, and " +
          "both planted documents write one. Notes: " + JSON.stringify(notes),
      ).toBe(false);

      // The admitted half: a spec-legal alias-union source becomes a slash
      // command.
      expect(
        handle.command("b0157liveadm"),
        "`schema U = array<A | B>` over one A and one B failed to register — the " +
          "alias-spelled union sink is still discarded and the source is refused. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // "and drives": one real live turn, proving the newly-admitted document
      // completes a drive rather than merely passing a static registration
      // check.
      const driven = await driveSlashCaptureTurn(handle, "/b0157liveadm");
      expect(
        driven.text,
        "the live model reply for the alias-union document did not contain the " +
          "deterministic sentinel. Reply: " + JSON.stringify(driven.text),
      ).toContain(ADMITTED_SENTINEL);
      expect(
        driven.systemNotes,
        "the driven turn over the alias-union document appended a theta-system-note (a " +
          "fail-closed ending) — the admitted path must drive clean. Notes: " +
          JSON.stringify(driven.systemNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
