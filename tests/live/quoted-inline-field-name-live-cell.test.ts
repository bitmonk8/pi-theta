// H8a live witness — bug 0176: the inline field-name slot admits a QUOTED key.
// `{"a": string}` used to load with zero diagnostics at every `Type` position
// and lower a JSON Schema property whose name is the three characters `"a"`,
// quote characters included — a name no theta identifier can spell
// (docs/spec_topics/lexical.md:13) and that
// docs/spec_topics/schemas.md:39 reserves to the `as "WireName"` clause.
// (docs/bugs/0176-quoted-inline-field-key-admitted-and-lowered-verbatim.md).
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS DOES NOT.
// `tests/inline-object-quoted-field-name-refusal.test.ts` pins the diagnostic
// bytes at the `parseThetaDocument` boundary and drives the runtime seams
// (AJV, the typed-query repair loop) by direct call with a scripted
// follow-up. Neither offline cell observes the real discovery→registration
// path deciding whether a `.theta` whose annotation carries the quoted key
// becomes a slash command at all, nor a real typed query completing against
// its identifier-spelled sibling. This cell drives both through the shipped
// production composition root (`bootShippedExtension`, mirroring
// `tests/live/live-production-acceptance.test.ts` cell 78's non-literal-
// discriminator live witness and cell 79's registration-only pattern), and
// asserts on real observables — the `theta-system-note` channel read off the
// settled `SessionManager`, and `driveSlashCaptureTurn`'s deterministic
// `text`/`systemNotes` — never on `prompt()` merely resolving.
//
// TWO HALVES:
//   (1) BAD — `let r = @<{"a": string}>` must NOT register: the new
//       `theta/parse/quoted-inline-field-name` row denies registration
//       (`hasLoadParseError`, an E-severity code), and the load-time refusal
//       lands on the theta-system-note channel before any drive is attempted
//       — no tokens spent.
//   (2) GOOD — the identifier-spelled sibling `{a: string}` registers and
//       DRIVES a real typed query to completion, and the returned field is
//       addressed as `answer.a` — the exact theta-side access the bug
//       document (§Reproduction (i)) shows is impossible for the quoted
//       spelling's minted key. One live turn, sentinel-pinned.
//
// SUBAGENT CHILD PINS: not required for the parse/registration observable —
// both thetas are `mode: prompt` and drive no `invoke` — but the harness sets
// both #subagent-child-pins at module scope regardless (`./harness`).
//
// Token cost: ONE live turn (the GOOD sibling's typed query + task-question answer).
// The BAD half is registration-only — it must not register, so no drive is
// attempted and no tokens are spent on it.
//
// Bug 0030's file-scope `console.error` spy gates this file (mirrors
// `tests/live/live-production-acceptance.test.ts`): the filtered capture
// (`thetaOwnedStderrLines`) must be empty.

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

/** The code bug 0176 §Fix route A adds (E, parse). */
const QUOTED_INLINE_CODE = "theta/parse/quoted-inline-field-name";

const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

/**
 * `quoted field name '<field>' within one inline object type; field names are
 * identifiers` with `<field>` substituted — DIAG-4: the message half is read
 * from the registry row, not copied, mirroring cell 78's
 * `nonLiteralDiscriminatorFragment`.
 */
function quotedInlineFieldFragment(field: string): string {
  const template = registryMessage(REGISTRY, QUOTED_INLINE_CODE) as string | undefined;
  expect(
    template,
    `${QUOTED_INLINE_CODE} has no registry row — the code this cell asserts is not registered (DIAG-2)`,
  ).toBeTypeOf("string");
  const message = (template as string).replaceAll("<field>", field);
  expect(
    message,
    `${QUOTED_INLINE_CODE}: an unsubstituted placeholder remains — the registry row's Message template changed shape`,
  ).not.toMatch(/<[a-z]+>/);
  return `${QUOTED_INLINE_CODE}: ${message}`;
}

/**
 * The theta-system-note channel contents from the settled in-memory
 * `SessionManager`, read directly off `getEntries()` (AGENTS.md §"Assert on
 * real observables"). Mirrors `live-production-acceptance.test.ts`'s
 * `systemNoteContents`.
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
 * BAD — the annotation-root position of 0176 §Reproduction row q1, a
 * non-repeating quoted key. Query-free before the refusal would fire: the
 * refusal is at parse/load time, so no query need ever be constructed.
 */
const BAD = ["---", "mode: prompt", "---", 'let r = @<{"a": string}>`hi`', "r", ""].join("\n");

// Drive discriminators are ANSWERS to task questions over the theta's own
// computed text -- deterministic content a degraded plain-prompt run cannot
// produce. A verbatim-echo demand ("reply with exactly this") reads as prompt
// injection to current models and draws refusals: the sentinel-refusal class
// filed as bug 0243.
const GOOD_SENTINEL = "958";
const GOOD_EXPECTED = "1058";

/**
 * GOOD — the identifier-spelled sibling: `{a: string}` instead of
 * `{"a": string}`. Registers, drives a real typed query, and — the exact
 * theta-side access the bug document's §Reproduction (i) shows is impossible
 * for the quoted spelling's minted key — reads the returned field back as
 * `answer.a`.
 */
const GOOD = [
  "---",
  "mode: prompt",
  "---",
  "let answer: {a: string} = @`Set the field a to exactly the text " +
    GOOD_SENTINEL +
    " and return only that JSON object, nothing else.`?",
  "@`The prior step produced the number ${answer.a}. What is that number plus 100? Answer with the number only.`?",
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

describe("bug 0176 live: a quoted inline field-name key is refused at registration, and the identifier-spelled sibling registers and drives", () => {
  it("does not register `@<{\"a\": string}>`, the theta-system-note channel carries theta/parse/quoted-inline-field-name, and `{a: string}` still registers and drives to the live sentinel via `answer.a`", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): BAD carries exactly the new code and GOOD is clean, so
    // neither live observable below can be produced by an unrelated load
    // failure.
    expect(
      parseDoc(BAD, "b0176livebad.theta").diagnostics.map((d) => d.code),
      "attribution: BAD must carry exactly one diagnostic, " + QUOTED_INLINE_CODE,
    ).toEqual([QUOTED_INLINE_CODE]);
    expect(
      parseDoc(GOOD, "b0176livegood.theta").diagnostics.map((d) => d.code),
      "attribution: GOOD must carry zero diagnostics — the fix must not disturb the " +
        "identifier-spelled sibling",
    ).toEqual([]);

    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the same workspace, so an
      // absent BAD registration cannot be misattributed to a broken workspace.
      {
        source: "project",
        stem: "b0176livectl",
        text: [
          "---",
          "mode: prompt",
          "---",
          "@`What is 726 plus 293? Answer with the number only.`",
          "",
        ].join("\n"),
      },
      { source: "project", stem: "b0176livebad", text: BAD },
      { source: "project", stem: "b0176livegood", text: GOOD },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b0176livectl"),
        "the precondition control did not register — a broken workspace, not the fixed gate, " +
          "would explain the BAD theta's absence too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: a quoted inline field-name key is refused, so
      // the caller must NOT register.
      expect(
        handle.command("b0176livebad"),
        "`@<{\"a\": string}>` registered — the quoted-key refusal did not fire. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b0176livebad");

      // The theta-system-note channel, read off the settled SessionManager —
      // the load-time diagnostic fires before any drive is attempted, so the
      // full entry list already carries it.
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const expectedFragment = quotedInlineFieldFragment('"a"');
      expect(
        notes.some((note) => note.includes(expectedFragment)),
        "no theta-system-note entry named " +
          QUOTED_INLINE_CODE +
          " for the BAD declaration — the fixed gate did not fire. Notes: " +
          JSON.stringify(notes),
      ).toBe(true);

      // The identifier-spelled sibling is unaffected by the fix: it registers.
      expect(
        handle.command("b0176livegood"),
        "`{a: string}` failed to register — the fix must not disturb the identifier-spelled " +
          "good path. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // "still drives": one real live turn, proving the identifier-spelled
      // sibling's typed query completes against a live model and its field is
      // addressed as `answer.a` — the exact theta-side access the bug
      // document's §Reproduction (i) shows is impossible for the quoted
      // spelling's minted key.
      const driven = await driveSlashCaptureTurn(handle, "/b0176livegood");
      expect(
        driven.text,
        "the live model reply for the identifier-spelled sibling did not contain the " +
          "arithmetic answer computed from the value carried in `answer.a`. Reply: " + JSON.stringify(driven.text),
      ).toContain(GOOD_EXPECTED);
      expect(
        driven.systemNotes,
        "the driven turn over the identifier-spelled sibling appended a theta-system-note " +
          "(a fail-closed ending) — the good path must drive clean. Notes: " +
          JSON.stringify(driven.systemNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
