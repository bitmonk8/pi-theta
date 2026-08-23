//
// H8a live witness — bug 0236: `TypeParser.parsePrimary` has no arm for `[`,
// so a bracket group written as a generic type argument falls to that
// production's tolerant punctuation skip (the unconditional
// `// Unexpected punctuation: skip it to stay tolerant.` / `this.next();` /
// `return this.parsePrimary();` arm, `TypeParser.parsePrimary`,
// src/parser/type-grammar.ts — cited by symbol, since this fix moves those
// lines, docs/STYLE.md §Citations). Nothing puts the cursor past the group's
// `]`, so `TypeParser.parseGeneric`'s argument loop reads the group's own
// interior comma as an ARGUMENT separator and the application ends with ONE
// argument recorded. An over-applied `array` therefore MATCHES its declared
// arity of 1 and `array<enum["a","b"], string>` draws nothing at the `fn`
// parameter position, where the byte-neighbour `array<{a: integer}, string>`
// draws `theta/parse/generic-arity-mismatch`
// (docs/bugs/0236-bracket-group-generic-argument-truncates-list.md,
// §Reproduction (b) row b1). §Fix (a) route 1 consumes a CLOSED balanced
// bracket group whole in `parsePrimary`, so the argument list holds the two
// arguments the author wrote and the arity row fires.
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS DOES NOT.
// `tests/generic-argument-bracket-group-truncation.test.ts` pins the
// diagnostic bytes, the lowerings and the two lowering-side counters at the
// `parseThetaDocument` boundary directly, over 95 diagnostic cells. No offline
// cell observes the real discovery→registration path deciding whether a
// `.theta` whose `fn` parameter type over-applies `array` behind a bracket
// group becomes a slash command at all, nor a legal sibling still registering
// and driving. This cell drives both through the shipped production
// composition root (`bootShippedExtension`), on the idioms the sibling parser
// leaves ship (`tests/live/generic-argument-inline-field-key-live-cell.test.ts`),
// and asserts on real observables — the `theta-system-note` channel read off
// the settled `SessionManager`, and `driveSlashCaptureTurn`'s deterministic
// `text` / `systemNotes` — never on `prompt()` merely resolving.
//
// TWO HALVES:
//   (1) BAD — `fn f(p: array<enum["a","b"], string>): integer { 1 }` must NOT
//       register: `theta/parse/generic-arity-mismatch` is E-severity, so
//       `hasLoadParseError` denies registration and the refusal lands on the
//       theta-system-note channel before any drive is attempted — no tokens
//       spent. At HEAD this document carries an EMPTY diagnostic list and
//       registers, which IS the S1 face of the report: an arity-1 constructor
//       applied to two written arguments became a slash command. The rendered
//       count is `2` — the number the SOURCE spells (§Expected behaviour
//       element 1), not the `1` `parseGeneric` recorded.
//   (2) GOOD — the legal sibling `array<"a" | "b">`, the literal-union spelling
//       docs/spec_topics/schemas.md:93 directs authors to in place of an inline
//       `enum[…]`. It registers and DRIVES one real turn, so the refusal is
//       shown to be about the ARGUMENT COUNT and not about the position or the
//       enclosing constructor.
//
// The BAD theta's body is the literal `1` and its `fn` is never called, so no
// `theta/parse/fn-arg-type-mismatch` row can mask the subject: the arity row is
// the document's whole diagnostic list after the fix, which the offline
// attribution guard below asserts before any live host is required.
//
// SUBAGENT CHILD PINS: not required for the parse/registration observable —
// both thetas are `mode: prompt` and drive no `invoke` — but the shared harness
// sets BOTH #subagent-child-pins plus the parent-pid carriage at module scope
// regardless (`./harness`), which is the AGENTS.md requirement for any
// in-process harness that can reach the RFC-0006 child launch.
//
// Token cost: ONE live turn (the legal sibling's arithmetic answer). The BAD
// half is registration-only.
//
// The drive prompt is a task with a deterministic answer rather than a
// verbatim-echo demand: the echo spelling reads as prompt injection to current
// models and turned three H9a cells red at consecutive merge gates (commit
// 4a69995f), so the clean-sibling prompt asks an arithmetic question and the
// assertion expects its answer — content a degraded plain-prompt run cannot
// produce, which preserves the wrong-root vacuity guard.
//
// Bug 0030's file-scope `console.error` spy gates this file: the filtered
// capture (`thetaOwnedStderrLines`) must be empty.
//
// OFFLINE ATTRIBUTABLE GUARD: the attribution check runs BEFORE the live host
// is required, so an absent or neutralised fix reds here with zero tokens spent
// (per AGENTS.md's "prefer the offline-attributable guard"). At HEAD that guard
// is the first thing that reds, and it reds naming the missing arity refusal.
//
// This is the one live-axis cell bug 0236 earns — 

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

/** The arity row (code-registry-parse.md:65) — the row this report restores. */
const GENERIC_ARITY = "theta/parse/generic-arity-mismatch";

const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

/**
 * `generic type 'array' expects 1 type argument(s); got 2` — DIAG-4: the
 * message half is read from the registry row rather than copied, and `<actual>`
 * renders the count of type arguments the SOURCE spells
 * (`placeholder-rendering-a.md:106`), which is why the fill is `2` and not the
 * `1` `parseGeneric` records at HEAD.
 */
function arityFragment(ctor: string, expected: string, actual: string): string {
  const template = registryMessage(REGISTRY, GENERIC_ARITY) as string | undefined;
  expect(
    template,
    `${GENERIC_ARITY} has no registry row -- the code this cell asserts is not registered (DIAG-2)`,
  ).toBeTypeOf("string");
  return `${GENERIC_ARITY}: ${(template as string)
    .replace("<ctor>", ctor)
    .replace("<expected>", expected)
    .replace("<actual>", actual)}`;
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
 * BAD — the subject: an arity-1 constructor applied to TWO written type
 * arguments, the first of them a closed bracket group. Query-free: the refusal
 * is at parse/load time, so no query need ever be constructed.
 */
const BAD = [
  "---",
  "mode: prompt",
  "---",
  'fn f(p: array<enum["a","b"], string>): integer { 1 }',
  "1",
  "",
].join("\n");

const GOOD_SENTINEL = "623";

/**
 * GOOD — the legal sibling: the literal-union spelling schemas.md:93 directs
 * authors to, applied as the ONE argument `array` declares. Registers and
 * drives one pinned turn, so route 1's refusal is shown to be about the
 * argument COUNT and not about the position.
 */
const GOOD = [
  "---",
  "mode: prompt",
  "---",
  'fn g(p: array<"a" | "b">): integer { 1 }',
  "@`What is 407 plus 216? Answer with the number only.`",
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

describe("bug 0236 live: an over-applied array behind a bracket group is refused at registration, and its legal literal-union sibling registers and drives — ", () => {
  it("does not register `fn f(p: array<enum[\"a\",\"b\"], string>): integer { 1 }`, the theta-system-note channel carries theta/parse/generic-arity-mismatch naming the count the source spells, and `array<\"a\" | \"b\">` still registers and drives to the live answer", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): BAD carries exactly the arity row and GOOD is clean, so
    // neither live observable below can be produced by an unrelated load
    // failure. At HEAD this guard is what reds first, with BAD's actual list
    // EMPTY -- the missing-refusal symptom bug 0236 reports (§Reproduction (b)
    // row b1).
    expect(
      parseDoc(BAD, "b0236livebad.theta").diagnostics.map((d) => d.code),
      "attribution: BAD must carry exactly one diagnostic, " +
        GENERIC_ARITY +
        " -- an EMPTY list here IS bug 0236's S1 symptom (the bracket group truncated the " +
        "argument list, so the over-applied `array` matched its declared arity of 1)",
    ).toEqual([GENERIC_ARITY]);
    expect(
      parseDoc(GOOD, "b0236livegood.theta").diagnostics.map((d) => d.code),
      "attribution: GOOD must carry zero diagnostics -- consuming the bracket group must not " +
        "refuse a correctly-applied constructor (§Reproduction (d) row d2's no-move bound at " +
        "the live face)",
    ).toEqual([]);

    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the same workspace, so an
      // absent BAD registration cannot be misattributed to a broken workspace.
      {
        source: "project",
        stem: "b0236livectl",
        text: [
          "---",
          "mode: prompt",
          "---",
          "@`What is 100 plus 5? Answer with the number only.`",
          "",
        ].join("\n"),
      },
      { source: "project", stem: "b0236livebad", text: BAD },
      { source: "project", stem: "b0236livegood", text: GOOD },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b0236livectl"),
        "the precondition control did not register -- a broken workspace, not the restored arity " +
          "row, would explain the BAD theta's absence too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: grammar.md:107 fixes `array`'s arity at 1 and
      // states that applying a constructor with any other type-argument count
      // is `theta/parse/generic-arity-mismatch`, so the caller must NOT
      // register.
      expect(
        handle.command("b0236livebad"),
        '`fn f(p: array<enum["a","b"], string>): integer { 1 }` registered -- the bracket group ' +
          "still truncates the argument list, so an arity-1 constructor applied to two written " +
          "arguments became a slash command. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b0236livebad");

      // The theta-system-note channel, read off the settled SessionManager --
      // the load-time diagnostic fires before any drive is attempted, so the
      // full entry list already carries it. The rendered count is `2`, the
      // number the source spells: a note naming `got 1` would mean the
      // truncation is still deciding the message even if the refusal landed.
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const expectedFragment = arityFragment("array", "1", "2");
      expect(
        notes.some((note) => note.includes(expectedFragment)),
        "no theta-system-note entry named " +
          GENERIC_ARITY +
          " with the count the source spells (2) for the BAD declaration -- either the row is " +
          "still withheld, or it fired with the truncated count. Notes: " + JSON.stringify(notes),
      ).toBe(true);

      // The legal sibling is unaffected: it registers.
      expect(
        handle.command("b0236livegood"),
        '`array<"a" | "b">` failed to register -- consuming the bracket group must refuse the ' +
          "COUNT, not the position. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // "still drives": one real live turn, proving the legal sibling completes
      // against a live model.
      const driven = await driveSlashCaptureTurn(handle, "/b0236livegood");
      expect(
        driven.text,
        "the live model reply for the legal sibling did not contain the deterministic answer. " +
          "Reply: " + JSON.stringify(driven.text),
      ).toContain(GOOD_SENTINEL);
      expect(
        driven.systemNotes,
        "the driven turn over the legal sibling appended a theta-system-note (a fail-closed " +
          "ending) -- the good path must drive clean. Notes: " +
          JSON.stringify(driven.systemNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
