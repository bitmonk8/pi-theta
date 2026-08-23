// H8a live witness — bug 0129: an empty inline object (`{}`) written as the
// type of a field an explicit `by <field>` clause names draws EXACTLY ONE
// `E`-severity diagnostic through the real discovery→registration path —
// `theta/parse/empty-schema-body` naming `'{}'` — and the discriminator
// constraint row (`theta/parse/nested-discriminator`) WITHHOLDS instead of
// also firing (docs/bugs/0129-empty-object-field-type-draws-two-diagnostics.md,
// Reading A / route (b)).
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS DOES NOT.
// `tests/empty-object-discriminator-field-withhold.test.ts` pins the exact
// diagnostic byte list at the `parseDoc` boundary. Neither that cell nor
// `tests/discriminator-field-classifier-brace-group.test.ts` observes the real
// discovery→registration path deciding whether a `.theta` carrying the subject
// shape becomes a slash command at all, nor the theta-system-note channel a
// real `SessionManager` settles with. This cell drives both through the
// shipped production composition root (`bootShippedExtension`, mirroring
// `tests/live/live-production-acceptance.test.ts` cell 78's sibling bug 0128
// live witness and `tests/live/quoted-inline-field-name-live-cell.test.ts`'s
// pattern), and asserts on real observables — the `theta-system-note` channel
// read off the settled `SessionManager`, and `driveSlashCaptureTurn`'s
// deterministic `text`/`systemNotes` — never on `prompt()` merely resolving.
//
//
//
// TWO HALVES:
//   (1) BAD — `schema Cat { kind: {}, name: string }` under an explicit
//       `by kind` union must NOT register (both codes in the pair are
//       `E`-severity, so either alone already refuses registration), and its
//       theta-system-note carries `theta/parse/empty-schema-body` naming
//       `'{}'` and must NOT also carry `theta/parse/nested-discriminator` —
//       the withhold is the fixed observable, distinguishing this cell from a
//       cell that would pass merely because the theta failed to register for
//       ANY reason.
//   (2) GOOD — the literal-discriminator sibling (`kind: "cat"` / `kind:
//       "dog"`) under the same `by kind` clause registers and DRIVES a real
//       turn to a task-question answer — the valid-discriminator control
//       that proves the withheld gate does not disturb a genuinely valid
//       explicit discriminator.
//
// SUBAGENT CHILD PINS: not required for the parse/registration observable —
// both thetas are `mode: prompt` and drive no `invoke` — but the harness sets
// both #subagent-child-pins at module scope regardless (`./harness`).
//
// Token cost: ONE live turn (the GOOD sibling's fixed-pair arithmetic answer).
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

/** Bug 0045's inline rule — the correct half of the pair, unchanged (E, parse). */
const EMPTY_SCHEMA_BODY_CODE = "theta/parse/empty-schema-body";
/** The withheld row — bug 0129 (E, parse). */
const NESTED_DISCRIMINATOR_CODE = "theta/parse/nested-discriminator";

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
 * BAD — the bug document's A2 fixture verbatim: `kind: {}` under an explicit
 * `by kind` union. Two `E`-severity codes would fire pre-fix
 * (`empty-schema-body` then `nested-discriminator`); the fix withholds the
 * second.
 */
const BAD = [
  "---",
  "mode: prompt",
  "---",
  "schema Cat { kind: {}, name: string }",
  'schema Dog { kind: "dog", name: string }',
  "schema Animal by kind = Cat | Dog",
  "let a = 1",
  "a",
  "",
].join("\n");

// Drive discriminators are ANSWERS to task questions over the theta's own
// computed text -- deterministic content a degraded plain-prompt run cannot
// produce. A verbatim-echo demand ("reply with exactly this") reads as prompt
// injection to current models and draws refusals: the sentinel-refusal class
// filed as bug 0243.
const GOOD_SENTINEL = "499";

/**
 * GOOD — the literal-discriminator sibling: `kind: "cat"` / `kind: "dog"`
 * under the same explicit `by kind` clause, mirroring
 * `live-production-acceptance.test.ts` cell 78's `literalByFieldTheta`. A
 * plain task-question prompt rather than a typed query over `Animal` — a
 * typed return keyed on the schema NAME `Animal` would register a second AJV
 * schema under a name the BAD document (parsed in the same extension host)
 * already declared, which is an unrelated collision this cell must not
 * introduce. Registers and drives, proving the withheld gate does not
 * disturb a genuinely valid explicit discriminator.
 */
const GOOD = [
  "---",
  "mode: prompt",
  "---",
  'schema Cat { kind: "cat", name: string }',
  'schema Dog { kind: "dog", name: string }',
  "schema Animal by kind = Cat | Dog",
  "@`What is 152 plus 347? Answer with the number only.`",
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

describe("bug 0129 live: an empty inline object field type under an explicit `by` clause withholds nested-discriminator, and the literal-discriminator sibling still registers and drives", () => {
  it('does not register `schema Cat { kind: {}, name: string }` under `by kind`, the theta-system-note channel carries empty-schema-body ALONE (not nested-discriminator), and the kind: "cat"/"dog" sibling under the same clause registers and drives to the live sentinel', async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): BAD carries exactly the withheld one-line disposition and
    // GOOD is clean, so neither live observable below can be produced by an
    // unrelated load failure.
    expect(
      parseDoc(BAD, "b0129livebad.theta").diagnostics.map((d) => d.code),
      "attribution: BAD must carry exactly one diagnostic, " + EMPTY_SCHEMA_BODY_CODE,
    ).toEqual([EMPTY_SCHEMA_BODY_CODE]);
    expect(
      parseDoc(GOOD, "b0129livegood.theta").diagnostics.map((d) => d.code),
      "attribution: GOOD must carry zero diagnostics — the fix must not disturb the " +
        "literal-discriminator good path",
    ).toEqual([]);

    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the same workspace, so an
      // absent BAD registration cannot be misattributed to a broken
      // workspace.
      {
        source: "project",
        stem: "b0129livectl",
        text: [
          "---",
          "mode: prompt",
          "---",
          "@`What is 176 plus 743? Answer with the number only.`",
          "",
        ].join("\n"),
      },
      { source: "project", stem: "b0129livebad", text: BAD },
      { source: "project", stem: "b0129livegood", text: GOOD },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b0129livectl"),
        "the precondition control did not register — a broken workspace, not the fixed gate, " +
          "would explain the BAD theta's absence too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: the load is refused (bug 0045's correct half
      // alone denies registration either way), so registration must be
      // absent regardless of the withhold — this alone does not distinguish
      // the fix from the pre-fix pair. The note-content assertion below is
      // what does.
      expect(
        handle.command("b0129livebad"),
        "`schema Cat { kind: {}, ... }` under `by kind` registered — the empty-schema-body " +
          "refusal did not fire. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b0129livebad");

      // The theta-system-note channel, read off the settled SessionManager —
      // the load-time diagnostic fires before any drive is attempted, so the
      // full entry list already carries it. THE FIXED OBSERVABLE: the
      // empty-schema-body fragment is present and the nested-discriminator
      // fragment is ABSENT — the withhold, not merely "some refusal fired".
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const expectedEmptyFragment = registryFragment(EMPTY_SCHEMA_BODY_CODE, { X: "{}" });
      const withheldNestedFragment = registryFragment(NESTED_DISCRIMINATOR_CODE, {
        field: "kind",
        X: "Animal",
      });
      expect(
        notes.some((note) => note.includes(expectedEmptyFragment)),
        "no theta-system-note entry named " +
          EMPTY_SCHEMA_BODY_CODE +
          " for the BAD declaration — the correct half of the pair did not fire. Notes: " +
          JSON.stringify(notes),
      ).toBe(true);
      expect(
        notes.some((note) => note.includes(withheldNestedFragment)),
        "a theta-system-note entry named " +
          NESTED_DISCRIMINATOR_CODE +
          " fired for the BAD declaration — the withhold (bug 0129, Reading A) did not take " +
          "effect and the pre-fix pair is still emitted. Notes: " +
          JSON.stringify(notes),
      ).toBe(false);

      // The literal-discriminator sibling is unaffected by the withhold: it
      // registers.
      expect(
        handle.command("b0129livegood"),
        '`kind: "cat"`/`kind: "dog"` under `by kind` failed to register — the withhold must ' +
          "not disturb the valid-discriminator good path. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // "still drives": one real live turn, proving the literal-discriminator
      // sibling's registration under the same explicit `by kind` clause the
      // withheld gate sits on completes a real drive, not merely a static
      // registration check.
      const driven = await driveSlashCaptureTurn(handle, "/b0129livegood");
      expect(
        driven.text,
        "the live model reply for the literal-discriminator sibling did not contain the " +
          "deterministic sentinel. Reply: " +
          JSON.stringify(driven.text),
      ).toContain(GOOD_SENTINEL);
      expect(
        driven.systemNotes,
        "the driven turn over the literal-discriminator sibling appended a theta-system-note " +
          "(a fail-closed ending) — the good path must drive clean. Notes: " +
          JSON.stringify(driven.systemNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
