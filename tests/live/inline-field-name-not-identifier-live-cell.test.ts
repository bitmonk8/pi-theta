//
// H8a live witness — bug 0228: at every `Type` position but `params:` the
// document rebuilds a type's source text by joining lexer token texts with no
// separator (`src/parser/theta-document.ts:3554`, `:4924`, `:5085`), so an
// inline object's interior loses the author's inter-token whitespace before any
// rule or lowerer sees it: `{a b: string}` arrives as `{ab:string}`, loads with
// zero diagnostics, and mints the wire property name `ab` the author never
// declared. §Fix (a) variant B slices the balanced brace group out of
// `this.bodyText` instead, and §Fix (b) mints
// `theta/parse/inline-field-name-not-identifier` (E, parse) for a raw inline
// key that is no `Ident` (`docs/spec_topics/lexical.md:13`), so the spelling is
// refused at load and registration is denied
// (docs/bugs/0228-inline-object-type-source-token-join-corrupts-field-keys.md).
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS DOES NOT.
// `tests/inline-object-type-source-capture.test.ts` pins the captured text, the
// lowered wire keys and the diagnostic bytes at the `parseThetaDocument`
// boundary directly. No offline cell observes the real discovery->registration
// path deciding whether a `.theta` whose annotation carries a space inside a
// field name becomes a slash command at all, nor a real typed query completing
// against its space-free sibling. This cell drives both through the shipped
// production composition root (`bootShippedExtension`), on the idioms bug 0160
// shipped at this same parser leaf
// (`tests/live/inline-object-wire-name-rename-live-cell.test.ts`), and asserts
// on real observables — the `theta-system-note` channel read off the settled
// `SessionManager`, and `driveSlashCaptureTurn`'s deterministic
// `text`/`systemNotes` — never on `prompt()` merely resolving.
//
// TWO HALVES:
//   (1) BAD — `let r: {a b: string} | null = null` must NOT register: the new
//       row is E-severity, so `hasLoadParseError` denies registration and the
//       refusal lands on the theta-system-note channel before any drive is
//       attempted — no tokens spent. The rendered subject is the RAW key `a b`,
//       which is the whole point of the fix: at HEAD the only text any rule can
//       see is the fused `ab`, a well-formed identifier no rule can refuse.
//   (2) GOOD — the space-free sibling `{ab: string}` registers and DRIVES a
//       real typed query to completion, its field addressed as `answer.ab`.
//       `ab` is exactly the property name the BAD spelling silently mints
//       today, so this half also shows what the author would have got: a wire
//       contract they never wrote. One live turn, sentinel-pinned.
//
// SUBAGENT CHILD PINS: not required for the parse/registration observable —
// both thetas are `mode: prompt` and drive no `invoke` — but the shared harness
// sets BOTH #subagent-child-pins plus the parent-pid carriage at module scope
// regardless (`./harness`), which is the AGENTS.md requirement for any
// in-process harness that can reach the RFC-0006 child launch.
//
// Token cost: ONE live turn (the space-free sibling's typed query + sentinel
// echo). The BAD half is registration-only.
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

/** The row bug 0228 §Fix (b) mints (E, parse). */
const NOT_IDENT = "theta/parse/inline-field-name-not-identifier";

const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

/**
 * `field name 'a b' within one inline object type is not an identifier` —
 * DIAG-4: the message half is read from the registry row rather than copied,
 * and `<field>` renders the RAW pre-colon key (the third row-scoped carve-out
 * on `placeholder-rendering-b.md` §"Source-derived placeholders"), which is why
 * the fill is `a b` and not an identifier.
 */
function notIdentFragment(field: string): string {
  const template = registryMessage(REGISTRY, NOT_IDENT) as string | undefined;
  expect(
    template,
    `${NOT_IDENT} has no registry row -- the code this cell asserts is not registered (DIAG-2)`,
  ).toBeTypeOf("string");
  return `${NOT_IDENT}: ${(template as string).replace("<field>", field)}`;
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
 * BAD — an inline object annotation on a `let` binding whose field name spells
 * two identifiers separated by a space, which derives from no `Field`
 * (`grammar.md:101`, `schemas.md:17`, `lexical.md:13`). Query-free: the refusal
 * is at parse/load time, so no query need ever be constructed. The `| null`
 * arm with a `null` initialiser conforms without a query, so no
 * `theta/parse/let-rhs-type-mismatch` row can mask the subject (bug 0130,
 * TYPE-5) -- the same repair bug 0160's live fixtures make.
 */
const BAD = [
  "---",
  "mode: prompt",
  "---",
  "let r: {a b: string} | null = null",
  "r",
  "",
].join("\n");

const GOOD_SENTINEL = "INLINEFIELDNOTIDENT0228LIVEGOOD";

/**
 * GOOD — the space-free sibling: `{ab: string}` in place of `{a b: string}`.
 * Registers, drives a real typed query, and reads the returned field back as
 * `answer.ab` -- the property name the BAD spelling mints silently at HEAD.
 */
const GOOD = [
  "---",
  "mode: prompt",
  "---",
  "let answer: {ab: string} = @`Set the field ab to exactly the text " +
    GOOD_SENTINEL +
    " and return only that JSON object, nothing else.`?",
  "@`Reply with exactly this text and nothing else, no punctuation: ${answer.ab}`?",
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

describe("bug 0228 live: an inline field name spelling two identifiers is refused at registration, and the space-free sibling registers and drives", () => {
  it("does not register `let r: {a b: string} | null = null`, the theta-system-note channel carries theta/parse/inline-field-name-not-identifier naming the raw key `a b`, and `{ab: string}` still registers and drives to the live sentinel via `answer.ab`", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): BAD carries exactly the new code and GOOD is clean, so neither
    // live observable below can be produced by an unrelated load failure. This
    // reds a neutralised fix before any provider call is made.
    expect(
      parseDoc(BAD, "b0228livebad.theta").diagnostics.map((d) => d.code),
      "attribution: BAD must carry exactly one diagnostic, " + NOT_IDENT,
    ).toEqual([NOT_IDENT]);
    expect(
      parseDoc(GOOD, "b0228livegood.theta").diagnostics.map((d) => d.code),
      "attribution: GOOD must carry zero diagnostics -- the refusal must not disturb the " +
        "space-free inline spelling",
    ).toEqual([]);

    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the same workspace, so an
      // absent BAD registration cannot be misattributed to a broken workspace.
      {
        source: "project",
        stem: "b0228livectl",
        text: [
          "---",
          "mode: prompt",
          "---",
          "@`Reply with exactly the token bug 0228 CONTROL and nothing else.`",
          "",
        ].join("\n"),
      },
      { source: "project", stem: "b0228livebad", text: BAD },
      { source: "project", stem: "b0228livegood", text: GOOD },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b0228livectl"),
        "the precondition control did not register -- a broken workspace, not the new gate, " +
          "would explain the BAD theta's absence too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: a field name that is not an identifier is
      // refused, so the caller must NOT register.
      expect(
        handle.command("b0228livebad"),
        "`let r: {a b: string} | null = null` registered -- the " +
          "inline-field-name-not-identifier refusal did not fire, so the fused key `ab` reached " +
          "the wire. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b0228livebad");

      // The theta-system-note channel, read off the settled SessionManager --
      // the load-time diagnostic fires before any drive is attempted, so the
      // full entry list already carries it. The rendered subject is the RAW key
      // `a b`: a note naming `ab` instead would mean the capture is still
      // joined and the refusal is naming text the source does not contain.
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const expectedFragment = notIdentFragment("a b");
      expect(
        notes.some((note) => note.includes(expectedFragment)),
        "no theta-system-note entry named " +
          NOT_IDENT +
          " with the raw key `a b` for the BAD declaration -- the new gate did not fire, or it " +
          "fired on the token-joined text. Notes: " + JSON.stringify(notes),
      ).toBe(true);

      // The space-free sibling is unaffected: it registers.
      expect(
        handle.command("b0228livegood"),
        "`{ab: string}` failed to register -- the refusal must not disturb the space-free good " +
          "path. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // "still drives": one real live turn, proving the space-free sibling's
      // typed query completes against a live model and its field is addressed
      // as `answer.ab`.
      const driven = await driveSlashCaptureTurn(handle, "/b0228livegood");
      expect(
        driven.text,
        "the live model reply for the space-free sibling did not contain the deterministic " +
          "sentinel echoed through `answer.ab`. Reply: " + JSON.stringify(driven.text),
      ).toContain(GOOD_SENTINEL);
      expect(
        driven.systemNotes,
        "the driven turn over the space-free sibling appended a theta-system-note (a " +
          "fail-closed ending) -- the good path must drive clean. Notes: " +
          JSON.stringify(driven.systemNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
