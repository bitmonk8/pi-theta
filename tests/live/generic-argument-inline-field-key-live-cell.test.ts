//
// H8a live witness — bug 0233: `walkType`'s `object` arm gates its whole
// raw-key loop on `!insideGenericArgument`
// (`src/parser/type-grammar.ts:1122`, the line
// `if (!insideGenericArgument && node.closingBraceSpelled) {`), and the
// `generic` arm sets that flag unconditionally for every argument subtree
// (`:1051`), so all four raw-key rows —
// `theta/parse/duplicate-inline-field-name` (`:1147`),
// `theta/parse/quoted-inline-field-name` (`:1165`),
// `theta/parse/renamed-inline-field-name` (`:1202`) and
// `theta/parse/inline-field-name-not-identifier` (`:1225`) — are withheld for
// every key of every inline object reached through `array<…>` or `Result<…,…>`,
// at every depth. `array<{a b: string}>` therefore loads with zero diagnostics
// and REGISTERS, while the byte-identical bare interior `{a b: string}` is
// refused. §Fix (a) route 1 drops `!insideGenericArgument` from that gate, so
// all six rules at the arm answer alike at every depth
// (docs/bugs/0233-generic-argument-inline-field-key-rules-withheld.md).
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS DOES NOT.
// `tests/generic-argument-inline-field-key-rules.test.ts` pins the diagnostic
// bytes, the lowerings and the `params:` frontmatter withhold at the
// `parseThetaDocument` boundary directly, over 76 diagnostic cells. No offline
// cell observes the real discovery->registration path deciding whether a
// `.theta` whose annotation carries `array<{a b: string}>` becomes a slash
// command at all, nor a sibling whose generic argument holds a CONFORMANT
// interior still registering and driving. This cell drives both through the
// shipped production composition root (`bootShippedExtension`), on the idioms
// bug 0228 shipped at this same parser leaf
// (`tests/live/inline-field-name-not-identifier-live-cell.test.ts`), and
// asserts on real observables — the `theta-system-note` channel read off the
// settled `SessionManager`, and `driveSlashCaptureTurn`'s deterministic
// `text` / `systemNotes` — never on `prompt()` merely resolving.
//
// TWO HALVES:
//   (1) BAD — `let r: array<{a b: string}> | null = null` must NOT register:
//       the raw-key row is E-severity, so `hasLoadParseError` denies
//       registration and the refusal lands on the theta-system-note channel
//       before any drive is attempted — no tokens spent. At HEAD this document
//       carries an EMPTY diagnostic list and registers, which is the whole
//       claim: the generic argument, not the spelling, is what silenced it.
//       The rendered subject is the RAW key `a b`, the same text the bare
//       spelling is already refused on.
//   (2) GOOD — the conformant generic sibling `array<{ab: string}>`, which
//       registers and DRIVES one real turn. This is §Reproduction (f) row f1's
//       no-move bound at the live face: route 1 must reach one disposition per
//       spelling by adding the refusal inside the generic argument, never by
//       refusing the position wholesale.
//
// THE `| null` ARM with a `null` initialiser conforms without a query, so no
// `theta/parse/let-rhs-type-mismatch` row can mask the subject (bug 0130,
// TYPE-5) — the same repair bugs 0154 / 0160 / 0228's live fixtures make.
//
// SUBAGENT CHILD PINS: not required for the parse/registration observable —
// both thetas are `mode: prompt` and drive no `invoke` — but the shared harness
// sets BOTH #subagent-child-pins plus the parent-pid carriage at module scope
// regardless (`./harness`), which is the AGENTS.md requirement for any
// in-process harness that can reach the RFC-0006 child launch.
//
// Token cost: ONE live turn (the conformant sibling's sentinel echo). The BAD
// half is registration-only.
//
// Bug 0030's file-scope `console.error` spy gates this file: the filtered
// capture (`thetaOwnedStderrLines`) must be empty.
//
// OFFLINE ATTRIBUTABLE GUARD: the attribution check runs BEFORE the live host
// is required, so an absent or neutralised fix reds here with zero tokens spent
// (per AGENTS.md's "prefer the offline-attributable guard"). At HEAD that guard
// is the first thing that reds, and it reds naming the missing refusal.

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

/** Bug 0228's raw-key row (code-registry-parse.md:101), fourth in precedence. */
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
 * and `<field>` renders the RAW pre-colon key (the row-scoped carve-out on
 * `placeholder-rendering-b.md` §"Source-derived placeholders"), which is why
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
 * BAD — the subject: an inline object whose field name spells two identifiers
 * separated by a space, reached through ONE generic argument. Query-free: the
 * refusal is at parse/load time, so no query need ever be constructed.
 */
const BAD = [
  "---",
  "mode: prompt",
  "---",
  "let r: array<{a b: string}> | null = null",
  "r",
  "",
].join("\n");

const GOOD_SENTINEL = "GENERICARGKEY0233LIVEGOOD";

/**
 * GOOD — the conformant generic sibling: `array<{ab: string}>` in place of
 * `array<{a b: string}>`. Registers and drives one pinned turn, so route 1's
 * refusal is shown to be about the KEY and not about the position.
 */
const GOOD = [
  "---",
  "mode: prompt",
  "---",
  "let ok: array<{ab: string}> | null = null",
  "@`Reply with exactly this text and nothing else, no punctuation: " + GOOD_SENTINEL + "`",
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

describe("bug 0233 live: an inline field key inside a generic argument is refused at registration, and the conformant generic sibling registers and drives", () => {
  it("does not register `let r: array<{a b: string}> | null = null`, the theta-system-note channel carries theta/parse/inline-field-name-not-identifier naming the raw key `a b`, and `array<{ab: string}>` still registers and drives to the live sentinel", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): BAD carries exactly the raw-key row and GOOD is clean, so
    // neither live observable below can be produced by an unrelated load
    // failure. At HEAD this guard is what reds first, with BAD's actual list
    // EMPTY -- the missing-refusal symptom bug 0233 reports.
    expect(
      parseDoc(BAD, "b0233livebad.theta").diagnostics.map((d) => d.code),
      "attribution: BAD must carry exactly one diagnostic, " +
        NOT_IDENT +
        " -- an EMPTY list here IS bug 0233's symptom (the raw-key gate withheld the row inside " +
        "the generic argument)",
    ).toEqual([NOT_IDENT]);
    expect(
      parseDoc(GOOD, "b0233livegood.theta").diagnostics.map((d) => d.code),
      "attribution: GOOD must carry zero diagnostics -- widening the raw-key gate must not " +
        "refuse a conformant interior inside a generic argument (§Reproduction (f) row f1)",
    ).toEqual([]);

    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the same workspace, so an
      // absent BAD registration cannot be misattributed to a broken workspace.
      {
        source: "project",
        stem: "b0233livectl",
        text: [
          "---",
          "mode: prompt",
          "---",
          "@`Reply with exactly the token bug 0233 CONTROL and nothing else.`",
          "",
        ].join("\n"),
      },
      { source: "project", stem: "b0233livebad", text: BAD },
      { source: "project", stem: "b0233livegood", text: GOOD },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b0233livectl"),
        "the precondition control did not register -- a broken workspace, not the widened gate, " +
          "would explain the BAD theta's absence too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: a raw key that is no `Ident` is refused wherever
      // the grammar admits the `ObjectType` holding it (grammar.md:109,
      // type-system.md:15), so the caller must NOT register.
      expect(
        handle.command("b0233livebad"),
        "`let r: array<{a b: string}> | null = null` registered -- the raw-key rules are still " +
          "withheld inside a generic argument, so an input the grammar derives from no " +
          "`ObjectType` became a slash command. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b0233livebad");

      // The theta-system-note channel, read off the settled SessionManager --
      // the load-time diagnostic fires before any drive is attempted, so the
      // full entry list already carries it. The rendered subject is the RAW key
      // `a b`, exactly as at the bare spelling: one disposition per spelling is
      // the claim, and a note naming anything else would mean the widened rule
      // is naming text the source does not contain.
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const expectedFragment = notIdentFragment("a b");
      expect(
        notes.some((note) => note.includes(expectedFragment)),
        "no theta-system-note entry named " +
          NOT_IDENT +
          " with the raw key `a b` for the BAD declaration -- the raw-key gate is still " +
          "withholding inside the generic argument. Notes: " + JSON.stringify(notes),
      ).toBe(true);

      // The conformant generic sibling is unaffected: it registers.
      expect(
        handle.command("b0233livegood"),
        "`array<{ab: string}>` failed to register -- the widened gate must refuse the KEY, not " +
          "the position. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // "still drives": one real live turn, proving the conformant generic
      // sibling completes against a live model.
      const driven = await driveSlashCaptureTurn(handle, "/b0233livegood");
      expect(
        driven.text,
        "the live model reply for the conformant generic sibling did not contain the " +
          "deterministic sentinel. Reply: " + JSON.stringify(driven.text),
      ).toContain(GOOD_SENTINEL);
      expect(
        driven.systemNotes,
        "the driven turn over the conformant generic sibling appended a theta-system-note (a " +
          "fail-closed ending) -- the good path must drive clean. Notes: " +
          JSON.stringify(driven.systemNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
