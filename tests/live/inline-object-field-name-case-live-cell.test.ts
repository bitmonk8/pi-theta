// Lane-wave marker for the parallel merge of this wave's live additions:
//
// H8a live witness — bug 0154: an inline object type's field name is a
// schema field name, so lexical.md's lowercase-first rule reaches it, and an
// ill-cased spelling (`{ Ys: string }`) now draws
// `theta/parse/binding-case-mismatch` at every `Type` position and denies
// registration
// (docs/bugs/0154-inline-object-type-field-name-rules-unenforced.md).
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS DOES NOT.
// `tests/inline-object-field-name-case.test.ts` pins the diagnostic bytes at
// the `parseThetaDocument` boundary directly. Neither offline cell observes
// the real discovery->registration path deciding whether a `.theta` whose
// annotation carries an ill-cased inline field name becomes a slash command
// at all, nor a real typed query completing against its lowercase-first
// sibling. This cell drives both through the shipped production composition
// root (`bootShippedExtension`), modelled on the freshest neighbour at this
// exact leaf, bug 0176's own H8a cell
// (`tests/live/quoted-inline-field-name-live-cell.test.ts`), and asserts on
// real observables -- the `theta-system-note` channel read off the settled
// `SessionManager`, and `driveSlashCaptureTurn`'s deterministic
// `text`/`systemNotes` -- never on `prompt()` merely resolving.
//
// TWO HALVES:
//   (1) BAD -- `let r: { Ys: string } = @<...>` must NOT register: the
//       `theta/parse/binding-case-mismatch` row denies registration
//       (`hasLoadParseError`, an E-severity code), and the load-time refusal
//       lands on the theta-system-note channel before any drive is attempted
//       -- no tokens spent.
//   (2) GOOD -- the lowercase-first sibling `{ ys: string }` registers and
//       DRIVES a real typed query to completion, and the returned field is
//       addressed as `answer.ys` -- the field the ill-cased sibling would
//       have registered under a PascalCase key with no case check, closed by
//       this fix. One live turn, sentinel-pinned.
//
// SUBAGENT CHILD PINS: not required for the parse/registration observable --
// both thetas are `mode: prompt` and drive no `invoke` -- but the harness
// sets both #subagent-child-pins at module scope regardless (`./harness`).
//
// Token cost: ONE live turn (the GOOD sibling's typed query + sentinel echo).
// The BAD half is registration-only -- it must not register, so no drive is
// attempted and no tokens are spent on it.
//
// Bug 0030's file-scope `console.error` spy gates this file (mirrors bug
// 0176's cell and `tests/live/live-production-acceptance.test.ts`): the
// filtered capture (`thetaOwnedStderrLines`) must be empty.
//
// OFFLINE ATTRIBUTABLE GUARD: an attribution check runs BEFORE the live host
// is required, so a neutralised fix reds here with zero tokens spent (per
// AGENTS.md's "prefer the offline-attributable guard").

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
// @ts-expect-error -- JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../../tools/code-registry/index.js";

/** The registered code bug 0154's fix draws (E, parse). */
const BINDING_CASE_CODE = "theta/parse/binding-case-mismatch";

const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

/**
 * `binding name must start with a lowercase letter or _` -- DIAG-4: the
 * message half is read from the registry row, not copied, mirroring bug
 * 0176's `quotedInlineFieldFragment`.
 */
function bindingCaseFragment(): string {
  const template = registryMessage(REGISTRY, BINDING_CASE_CODE) as string | undefined;
  expect(
    template,
    `${BINDING_CASE_CODE} has no registry row -- the code this cell asserts is not registered (DIAG-2)`,
  ).toBeTypeOf("string");
  return `${BINDING_CASE_CODE}: ${template as string}`;
}

/**
 * The theta-system-note channel contents from the settled in-memory
 * `SessionManager`, read directly off `getEntries()` (AGENTS.md
 * #"Assert on real observables"). Mirrors bug 0176's `systemNoteContents`.
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
 * BAD -- an inline object annotation on a `let` binding whose field name is
 * PascalCase (bug 0154 row i1's shape, at the annotation-root position).
 * Query-free before the refusal would fire: the refusal is at parse/load
 * time, so no query need ever be constructed.
 */
const BAD = ["---", "mode: prompt", "---", "let r: { Ys: string } | null = null", "r", ""].join(
  "\n",
);

const GOOD_SENTINEL = "BINDINGCASE0154LIVEGOOD";

/**
 * GOOD -- the lowercase-first sibling: `{ ys: string }` instead of
 * `{ Ys: string }`. Registers, drives a real typed query, and reads the
 * returned field back as `answer.ys`.
 */
const GOOD = [
  "---",
  "mode: prompt",
  "---",
  "let answer: {ys: string} = @`Set the field ys to exactly the text " +
    GOOD_SENTINEL +
    " and return only that JSON object, nothing else.`?",
  "@`Reply with exactly this text and nothing else, no punctuation: ${answer.ys}`?",
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

describe("bug 0154 live: an ill-cased inline object field name is refused at registration, and the lowercase-first sibling registers and drives", () => {
  it("does not register `let r: { Ys: string } | null = null`, the theta-system-note channel carries theta/parse/binding-case-mismatch, and `{ys: string}` still registers and drives to the live sentinel via `answer.ys`", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): BAD carries exactly the fixed code and GOOD is clean, so
    // neither live observable below can be produced by an unrelated load
    // failure. This reds a neutralised fix before any provider call is made.
    expect(
      parseDoc(BAD, "b0154livebad.theta").diagnostics.map((d) => d.code),
      "attribution: BAD must carry exactly one diagnostic, " + BINDING_CASE_CODE,
    ).toEqual([BINDING_CASE_CODE]);
    expect(
      parseDoc(GOOD, "b0154livegood.theta").diagnostics.map((d) => d.code),
      "attribution: GOOD must carry zero diagnostics -- the fix must not disturb the " +
        "lowercase-first sibling",
    ).toEqual([]);

    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the same workspace, so an
      // absent BAD registration cannot be misattributed to a broken
      // workspace.
      {
        source: "project",
        stem: "b0154livectl",
        text: [
          "---",
          "mode: prompt",
          "---",
          "@`Reply with exactly the token bug 0154 CONTROL and nothing else.`",
          "",
        ].join("\n"),
      },
      { source: "project", stem: "b0154livebad", text: BAD },
      { source: "project", stem: "b0154livegood", text: GOOD },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b0154livectl"),
        "the precondition control did not register -- a broken workspace, not the fixed " +
          "gate, would explain the BAD theta's absence too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: an ill-cased inline field name is refused, so
      // the caller must NOT register.
      expect(
        handle.command("b0154livebad"),
        "`let r: { Ys: string } | null = null` registered -- the binding-case-mismatch refusal did not " +
          "fire. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b0154livebad");

      // The theta-system-note channel, read off the settled SessionManager --
      // the load-time diagnostic fires before any drive is attempted, so the
      // full entry list already carries it.
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const expectedFragment = bindingCaseFragment();
      expect(
        notes.some((note) => note.includes(expectedFragment)),
        "no theta-system-note entry named " +
          BINDING_CASE_CODE +
          " for the BAD declaration -- the fixed gate did not fire. Notes: " +
          JSON.stringify(notes),
      ).toBe(true);

      // The lowercase-first sibling is unaffected by the fix: it registers.
      expect(
        handle.command("b0154livegood"),
        "`{ys: string}` failed to register -- the fix must not disturb the lowercase-first " +
          "good path. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // "still drives": one real live turn, proving the lowercase-first
      // sibling's typed query completes against a live model and its field
      // is addressed as `answer.ys`.
      const driven = await driveSlashCaptureTurn(handle, "/b0154livegood");
      expect(
        driven.text,
        "the live model reply for the lowercase-first sibling did not contain the " +
          "deterministic sentinel echoed through `answer.ys`. Reply: " +
          JSON.stringify(driven.text),
      ).toContain(GOOD_SENTINEL);
      expect(
        driven.systemNotes,
        "the driven turn over the lowercase-first sibling appended a theta-system-note " +
          "(a fail-closed ending) -- the good path must drive clean. Notes: " +
          JSON.stringify(driven.systemNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
