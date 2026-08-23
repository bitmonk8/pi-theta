// H8a live witness — bug 0241: `docs/spec_topics/grammar.md:221`'s fourth sink
// bullet, "the element type of an array-typed sink that this literal is itself
// an element of (recursive descent)", must reach the NESTED array literal, so a
// rule-3 union written one level down admits through the real
// discovery→registration path. Two consequences are observable there and
// nowhere in the offline witness:
//   - the nested-sink theta — a spec-legal source
//     (`docs/spec_topics/expressions.md:228`: two different named schemas yield
//     `array<A | B>` "only if some sink in scope expects a union", and
//     `let xs: array<array<A | B>> = [[A { … }, B { … }]]` writes exactly such
//     a sink for the inner literal by `grammar.md:221`'s fourth bullet) —
//     REGISTERS as a slash command and drives a real turn, where an
//     `E`-severity `theta/parse/array-no-common-type` on the INNER literal
//     refuses it absent this fix;
//   - the REFUSED control, a nested literal whose element genuinely violates
//     the declared `A | B` element type, is still refused, and its refusal
//     lands on the `theta-system-note` channel a real `SessionManager` settles
//     — so the harness is proven able to detect a refusal, and the admitted
//     half's registration is not a harness that stopped measuring.
// (docs/bugs/0241-nested-array-element-sink-descent-unwired.md, §Reproduction
// rows A1 and A6, and §Expected.)
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS DOES NOT.
// `tests/nested-array-element-sink-descent.test.ts` pins the exact diagnostic
// byte lists at the `parseDoc` boundary. It does not observe the real
// discovery→registration path deciding whether a `.theta` carrying either shape
// becomes a slash command, nor the note channel the settled `SessionManager`
// carries — which is where the registration consequence of an `E`-severity code
// is felt (`hasLoadParseError`, src/extension/production-composition.ts). This
// cell drives both through the shipped production composition root
// (`bootShippedExtension`), mirroring
// `tests/live/fn-param-sink-array-literal-live-cell.test.ts`, and asserts on
// real observables — the `theta-system-note` channel read off the settled
// `SessionManager`, and `driveSlashCaptureTurn`'s deterministic
// `text`/`systemNotes` — never on `prompt()` merely resolving.
//
// TWO HALVES:
//   (1) ADMITTED — `let xs: array<array<A | B>> = [[A { a: 1 }, B { b: "x" }]]`
//       registers and DRIVES a real turn to a task-question answer. Absent the fix the
//       theta is refused outright (the inner literal takes `walkExpr`'s
//       sink-less array route), so the drive is the direction the fix opens.
//       This half is expected RED before the fix lands.
//   (2) REFUSED — the same nested literal with a `C` element under the same
//       declared `A | B` element type must NOT register, and its note must
//       carry `theta/parse/array-element-type-mismatch` with the registry
//       *Message* naming index 1 — rule 1 (`expressions.md:226`) at the inner
//       level, the verdict the flat twin already gives. Before the fix this
//       document is refused too, but under `theta/parse/array-no-common-type`,
//       so the refusal-detection half of this cell exercises the note channel
//       on every run while its CODE assertion is the misattribution row 0241
//       corrects.
//
// DIAG-4: every asserted message half is READ from
// docs/spec_topics/diagnostics/code-registry-parse.md through `parseRegistry` /
// `registryMessage` (tools/code-registry/index.js), never written out here.
//
// SUBAGENT CHILD PINS: not required for the parse/registration observable —
// both thetas are `mode: prompt` and drive no `invoke` — but the harness sets
// both #subagent-child-pins at module scope regardless (`./harness`).
//
// Token cost: ONE live turn (the admitted theta's task-question answer). The refused
// half is registration-only, so no drive is attempted and no tokens are spent
// on it.
//
// NO SILENT SKIPPING: a missing live provider/model fails loudly through
// `requireLiveProvider` (`failLoudly`); nothing here early-returns or skips.
//
// Bug 0030's file-scope `console.error` spy gates this file: the filtered
// capture (`thetaOwnedStderrLines`) must be empty.
//
// The planted theta stems are unique to this cell across the live
// workspace. Slash names are matched by `SLASH_NAME` in
// src/discovery/discovery-walk.ts (`[a-z0-9][a-z0-9_-]*`), so the stems
// stay inside that alphabet.

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

/** Rule 1's code — the verdict the nested violation is owed (expressions.md:226). */
const ELEMENT_CODE = "theta/parse/array-element-type-mismatch";
/**
 * The sink-LESS refusal. `grammar.md:221` puts a sink in scope for the inner
 * literal in BOTH planted documents, so this code must appear on neither: its
 * registered *Trigger* (code-registry-parse.md:44) reads "and no sink to narrow
 * against".
 */
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

/** The three planted stems, unique to this cell across the live workspace. */
const STEM_CONTROL = "b0241live-ctl";
const STEM_REFUSED = "b0241live-ref";
const STEM_ADMITTED = "b0241live-adm";

/**
 * REFUSED — §Reproduction row A6: the nested literal's second element is a `C`
 * where the descended element sink declares `A | B`, so rule 1
 * (`expressions.md:226`) must NAME it. The document stays refused either way,
 * which is what makes the admitted half's registration a measurement.
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
  "schema C {",
  "  c: boolean",
  "}",
  "let xs: array<array<A | B>> = [[A { a: 1 }, C { c: true }]]",
  "xs",
  "",
].join("\n");

// The answer to the admitted drive's fixed-pair arithmetic question (316 +
// 261). Drive discriminators are ANSWERS to task questions over the theta's
// own computed text -- deterministic content a degraded plain-prompt run
// cannot produce. A verbatim-echo demand ("reply with exactly this") reads as
// prompt injection to current models and draws refusals: the sentinel-refusal
// class filed as bug 0243.
const ADMITTED_SENTINEL = "577";

/**
 * ADMITTED — §Reproduction row A1: the binding annotation's element type
 * `array<A | B>` is the inner literal's sink under `grammar.md:221`'s fourth
 * bullet, so rule 3's union is admitted one level down exactly as it is flat. A
 * plain task-question prompt rather than a typed query, so no AJV schema is
 * registered under a name this extension host's other document also declares.
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
  'let xs: array<array<A | B>> = [[A { a: 1 }, B { b: "x" }]]',
  "xs",
  "@`What is 316 plus 261? Answer with the number only.`",
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

describe("bug 0241 live: the nested element sink admits its rule-3 literal so the theta registers and drives, while the nested element VIOLATION stays refused under rule 1", () => {
  it("registers the nested `array<array<A | B>>` binding and drives it to the live sentinel, while the nested `C` violation does not register and carries rule 1's refusal on the theta-system-note channel", async () => {
    // ATTRIBUTION GUARD for the REFUSED half (offline, token-free, runs BEFORE
    // the live host is required): the violating document carries exactly rule
    // 1's one-code disposition, so its live observable below cannot be produced
    // by an unrelated load failure. The ADMITTED half's guard is deliberately
    // deferred to directly above its own live assertions: it is the half this
    // fix opens, so asserting it here would abort the run before the refusal
    // half has proven the harness can witness a refusal at all.
    expect(
      parseDoc(REFUSED, `${STEM_REFUSED}.theta`).diagnostics.map((d) => d.code),
      "attribution: the nested-violation document must carry exactly " +
        ELEMENT_CODE +
        " — rule 1 at the inner level (expressions.md:226), the verdict its flat twin already gives",
    ).toEqual([ELEMENT_CODE]);

    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the same workspace, so an
      // absent refused-document registration cannot be misattributed to a
      // broken workspace.
      {
        source: "project",
        stem: STEM_CONTROL,
        text: [
          "---",
          "mode: prompt",
          "---",
          "@`What is 617 plus 392? Answer with the number only.`",
          "",
        ].join("\n"),
      },
      { source: "project", stem: STEM_REFUSED, text: REFUSED },
      { source: "project", stem: STEM_ADMITTED, text: ADMITTED },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command(STEM_CONTROL),
        "the precondition control did not register — a broken workspace, not the load " +
          "refusal, would explain the refused document's absence too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // (2) REFUSED — the direction the fix must not open, asserted FIRST so
      // the harness's ability to observe a refusal is established before the
      // admitted half's registration is read as meaningful.
      expect(
        handle.command(STEM_REFUSED),
        "the nested `C` violation registered — rule 1 stopped denying the load gate for an " +
          "element that violates the declared `A | B` element type. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();

      // The theta-system-note channel, read off the settled SessionManager. The
      // load-time diagnostics fire before any drive is attempted, so the full
      // entry list already carries them.
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const elementFragment = registryFragment(ELEMENT_CODE, {
        i: "1",
        expected: "A | B",
        actual: "C",
      });
      expect(
        notes.some((note) => note.includes(elementFragment)),
        "no theta-system-note entry named " +
          ELEMENT_CODE +
          " at index 1 for the nested-violation document — either the refusal did not reach " +
          "the note channel (so this harness cannot witness a refusal at all and the admitted " +
          "half's registration proves nothing) or the violation is still misattributed to the " +
          "sink-less row. Notes: " + JSON.stringify(notes),
      ).toBe(true);
      expect(
        notes.some((note) => note.includes(NO_COMMON_CODE)),
        "a theta-system-note entry named " +
          NO_COMMON_CODE +
          " fired — both planted documents write an in-scope element sink for their inner " +
          "literal (grammar.md:221), and that row's registered Trigger requires 'no sink to " +
          "narrow against'. Notes: " + JSON.stringify(notes),
      ).toBe(false);

      // (1) ADMITTED — the direction the fix opens: a spec-legal rule-3 source
      // one level down becomes a slash command. Its attribution guard runs
      // here rather than at the top of the test, so the refusal half above is
      // exercised live on every run.
      expect(
        parseDoc(ADMITTED, `${STEM_ADMITTED}.theta`).diagnostics.map((d) => d.code),
        "attribution: the nested-sink document must carry zero diagnostics — a spec-legal " +
          "source the fix stops refusing (grammar.md:221, expressions.md:228)",
      ).toEqual([]);
      expect(
        handle.command(STEM_ADMITTED),
        "`let xs: array<array<A | B>> = [[A { a: 1 }, B { b: \"x\" }]]` failed to register — the " +
          "element sink still does not descend into the nested literal and the source is " +
          "refused. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // "and drives": one real live turn, proving the newly-admitted document
      // completes a drive rather than merely passing a static registration
      // check.
      const driven = await driveSlashCaptureTurn(handle, `/${STEM_ADMITTED}`);
      expect(
        driven.text,
        "the live model reply for the nested-sink document did not contain the arithmetic " +
          "answer to the drive's task question. Reply: " + JSON.stringify(driven.text),
      ).toContain(ADMITTED_SENTINEL);
      expect(
        driven.systemNotes,
        "the driven turn over the nested-sink document appended a theta-system-note (a " +
          "fail-closed ending) — the admitted path must drive clean. Notes: " +
          JSON.stringify(driven.systemNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
