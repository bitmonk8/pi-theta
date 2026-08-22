// H8a live witness — bug 0229: `topLevelColon` (`src/parser/params.ts`) tracked
// a quoted region without honouring a backslash escape, while the split
// feeding it (`splitTopLevelSegments`) already did, so an inline object field
// whose wire-name string carries an escaped quote —
// `{a as "w\"x": string}` — had no top-level `:`, spelled no key, and was
// silently dropped by every consumer instead of being refused. §Fix (a) gives
// `topLevelColon` the same backslash arm its sibling split already has, and
// widens `INLINE_FIELD_RENAME`'s wire-name literal alternatives to admit the
// escaped interior, so the entry is refused here — the same
// `theta/parse/renamed-inline-field-name` row the unescaped spelling already
// draws
// (docs/bugs/0229-escaped-quote-wire-name-drops-inline-field.md).
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS DOES NOT.
// `tests/escaped-quote-inline-field-name-refusal.test.ts` pins the diagnostic
// bytes and the lowered artefact at the `parseThetaDocument` / direct-lowerer
// boundary. No offline cell observes the real discovery->registration path
// deciding whether a `.theta` whose annotation carries an escaped-quote inline
// rename becomes a slash command at all, nor a real typed query completing
// against its escape-free sibling. This cell drives both through the shipped
// production composition root (`bootShippedExtension`), on the idiom bug 0160
// shipped at this same parser leaf
// (`tests/live/inline-object-wire-name-rename-live-cell.test.ts`), and asserts
// on real observables — the `theta-system-note` channel read off the settled
// `SessionManager`, and `driveSlashCaptureTurn`'s deterministic
// `text`/`systemNotes` — never on `prompt()` merely resolving (bug 0229).
//
// TWO HALVES:
//   (1) BAD — `let r: {a as "w\"x": string} | null = null` must NOT register:
//       the row is E-severity, so `hasLoadParseError` denies registration and
//       the refusal lands on the theta-system-note channel before any drive is
//       attempted — no tokens spent. Pre-fix this spelling registered silently
//       with the field dropped from the lowered schema.
//   (2) GOOD — the escape-free sibling `{wire: string}` registers and DRIVES a
//       real typed query to completion, its field addressed as `answer.wire`.
//       One live turn, sentinel-pinned.
//
// SUBAGENT CHILD PINS: not required for the parse/registration observable —
// both thetas are `mode: prompt` and drive no `invoke` — but the shared harness
// sets BOTH #subagent-child-pins plus the parent-pid carriage at module scope
// regardless (`./harness`), which is the AGENTS.md requirement for any
// in-process harness that can reach the RFC-0006 child launch.
//
// Token cost: ONE live turn (the GOOD sibling's typed query + sentinel echo).
// The BAD half is registration-only.
//
// Bug 0030's file-scope `console.error` spy gates this file: the filtered
// capture (`thetaOwnedStderrLines`) must be empty.
//
// OFFLINE ATTRIBUTABLE GUARD: the attribution check runs BEFORE the live host
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

/** The row bug 0229 restores reach for the escaped-quote spelling (E, parse). */
const RENAMED_INLINE = "theta/parse/renamed-inline-field-name";

const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

/**
 * `wire-name rename on field 'a' within one inline object type` — DIAG-4: the
 * message half is read from the registry row rather than copied, and `<field>`
 * renders the THETA-SIDE identifier under the standard identifier rendering
 * (`placeholder-rendering-b.md` §"Source-derived placeholders"), which is why
 * the fill is `a` and not the raw key `a as "w\"x"`.
 */
function renamedInlineFragment(field: string): string {
  const template = registryMessage(REGISTRY, RENAMED_INLINE) as string | undefined;
  expect(
    template,
    `${RENAMED_INLINE} has no registry row -- the code this cell asserts is not registered (DIAG-2)`,
  ).toBeTypeOf("string");
  return `${RENAMED_INLINE}: ${(template as string).replace("<field>", field)}`;
}

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

/**
 * BAD — an inline object annotation on a `let` binding whose wire-name string
 * carries an escaped quote: `schemas.md` §"Wire-name renaming"'s clause, with
 * `lexical.md:13`'s string-literal escape inside the literal. Query-free: the
 * refusal is at parse/load time, so no query need ever be constructed. The
 * `| null` arm with a `null` initialiser conforms without a query, mirroring
 * bug 0160's own repair for the identical let-rhs-type-mismatch hazard (bug
 * 0130, TYPE-5).
 */
const BAD = [
  "---",
  "mode: prompt",
  "---",
  'let r: {a as "w\\"x": string} | null = null',
  "r",
  "",
].join("\n");

const GOOD_SENTINEL = "ESCAPEDQUOTEINLINERENAME0229LIVEGOOD";

/**
 * GOOD — the escape-free sibling: `{wire: string}` in place of
 * `{a as "w\"x": string}`. Registers, drives a real typed query, and reads the
 * returned field back as `answer.wire`.
 */
const GOOD = [
  "---",
  "mode: prompt",
  "---",
  "let answer: {wire: string} = @`Set the field wire to exactly the text " +
    GOOD_SENTINEL +
    " and return only that JSON object, nothing else.`?",
  "@`Reply with exactly this text and nothing else, no punctuation: ${answer.wire}`?",
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
      "bug 0018's live verification observable for this suite is a 0-byte stderr capture; this " +
        "spy caught theta-owned stderr line(s) instead: " + JSON.stringify(offenders),
    ).toEqual([]);
  } finally {
    spy?.mockRestore();
    consoleErrorSpy = undefined;
  }
});

describe('bug 0229 live: an inline "as \\"w\\\\"x\\"" escaped-quote wire-name rename is refused at registration, and the escape-free sibling registers and drives', () => {
  it('does not register `let r: {a as "w\\"x": string} | null = null`, the theta-system-note channel carries theta/parse/renamed-inline-field-name, and `{wire: string}` still registers and drives to the live sentinel via `answer.wire`', async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): BAD carries exactly the new code and GOOD is clean, so neither
    // live observable below can be produced by an unrelated load failure. This
    // reds a neutralised fix before any provider call is made.
    expect(
      parseDoc(BAD, "b0229livebad.theta").diagnostics.map((d) => d.code),
      "attribution: BAD must carry exactly one diagnostic, " + RENAMED_INLINE,
    ).toEqual([RENAMED_INLINE]);
    expect(
      parseDoc(GOOD, "b0229livegood.theta").diagnostics.map((d) => d.code),
      "attribution: GOOD must carry zero diagnostics -- the refusal must not disturb the " +
        "escape-free inline spelling",
    ).toEqual([]);

    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the same workspace, so an
      // absent BAD registration cannot be misattributed to a broken workspace.
      {
        source: "project",
        stem: "b0229livectl",
        text: [
          "---",
          "mode: prompt",
          "---",
          "@`Reply with exactly the token bug 0229 CONTROL and nothing else.`",
          "",
        ].join("\n"),
      },
      { source: "project", stem: "b0229livebad", text: BAD },
      { source: "project", stem: "b0229livegood", text: GOOD },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b0229livectl"),
        "the precondition control did not register -- a broken workspace, not the new gate, " +
          "would explain the BAD theta's absence too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: the escaped-quote inline rename spelling is
      // refused, so the caller must NOT register.
      expect(
        handle.command("b0229livebad"),
        'let r: {a as "w\\"x": string} | null = null` registered -- the renamed-inline-field-name ' +
          "refusal did not fire (the escaped quote defeated the colon scan again). Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b0229livebad");

      // The theta-system-note channel, read off the settled SessionManager --
      // the load-time diagnostic fires before any drive is attempted, so the
      // full entry list already carries it. The rendered subject is the
      // theta-side identifier `a`, which is the standard `<field>` rendering
      // for this row.
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const expectedFragment = renamedInlineFragment("a");
      expect(
        notes.some((note) => note.includes(expectedFragment)),
        "no theta-system-note entry named " +
          RENAMED_INLINE +
          " for the BAD declaration -- the escaped-quote spelling still bypasses the refusal. " +
          "Notes: " + JSON.stringify(notes),
      ).toBe(true);

      // The escape-free sibling is unaffected: it registers.
      expect(
        handle.command("b0229livegood"),
        "`{wire: string}` failed to register -- the refusal must not disturb the escape-free " +
          "good path. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // "still drives": one real live turn, proving the escape-free sibling's
      // typed query completes against a live model and its field is addressed
      // as `answer.wire`.
      const driven = await driveSlashCaptureTurn(handle, "/b0229livegood");
      expect(
        driven.text,
        "the live model reply for the escape-free sibling did not contain the deterministic " +
          "sentinel echoed through `answer.wire`. Reply: " + JSON.stringify(driven.text),
      ).toContain(GOOD_SENTINEL);
      expect(
        driven.systemNotes,
        "the driven turn over the escape-free sibling appended a theta-system-note (a " +
          "fail-closed ending) -- the good path must drive clean. Notes: " +
          JSON.stringify(driven.systemNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
