// H8a live witness — bug 0135 face 2: a `schema <lowercase>` declaration the
// case rule refuses (`theta/parse/schema-case-mismatch`, E,
// docs/spec_topics/diagnostics/code-registry-parse.md:20) must not decide a
// static check. The settled §Fix is Reading A applied at the READ seam,
// `resolveNamed` (src/parser/type-compat.ts:124–130): a name whose first
// character is not `A`–`Z` resolves to nothing, so `unfoldAlias` (`:179–196`)
// stops returning the refused declaration's right-hand side and
// `checkLetRhsCompat` loses the statically resolvable RHS its registered
// *Trigger* requires (`code-registry-parse.md:59`, "where the RHS type is
// statically resolvable").
//
// THE SUBJECT DOCUMENT is the report's c3 row: `schema index = string` plus
// `fn f(p: Nope) { let m: integer = p[0]  m }`. The index arm's fabricated name
// (src/parser/static-type-inference.ts:294) used to resolve through the refused
// declaration and supply `string` to the typed binding, so the document drew a
// SECOND code, `theta/parse/let-rhs-type-mismatch`, whose `<actual>` rendered
// the fabricated lowercase name — a token
// docs/spec_topics/diagnostics/placeholder-rendering-a.md:25 read with
// docs/spec_topics/lexical.md:15 does not admit at a type position.
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS DOES NOT.
// tests/index-sentinel-typeenv-case-fence.test.ts pins the exact diagnostic
// byte lists at the `parseDoc` boundary. It cannot observe the real
// discovery→registration path: whether the refused document becomes a slash
// command, and what the `theta-system-note` channel a settled `SessionManager`
// carries actually says about it. That channel is where an author meets this
// defect, and `hasLoadParseError`
// (src/extension/production-composition.ts:2220) is module-private, so the
// registration decision is only observable end to end. This cell drives the
// shipped production composition (`bootShippedExtension`) and asserts on real
// observables — `handle.command(...)`, `handle.registeredNames()`, and the note
// channel read off `handle.sessionManager.getEntries()` — never on `prompt()`
// merely resolving.
//
// TWO HALVES:
//   (a) REFUSED, and refused for exactly ONE reason — the c3 document must NOT
//       register, its note evidence must carry the registry *Message* of
//       `theta/parse/schema-case-mismatch`, and it must carry NO
//       `theta/parse/let-rhs-type-mismatch` anywhere: a declaration the case
//       rule refuses decides nothing, so the second code is the defect.
//   (b) REGISTERED (control) — an ordinary theta in the same workspace
//       registers and DRIVES a real turn to a fixture-pinned sentinel, so an
//       absent registration in (a) cannot be misread as a broken workspace or a
//       dead harness.
//
// DIAG-4 (docs/spec_topics/diagnostics/diagnostic-shape.md:74): every asserted
// message half is READ from docs/spec_topics/diagnostics/code-registry-parse.md
// through `parseRegistry` / `registryMessage` (tools/code-registry/index.js),
// never written out here.
//
// SUBAGENT CHILD PINS: not required for the parse/registration observable —
// both documents are `mode: prompt` and drive no `invoke` / subagent — but the
// harness sets both AGENTS.md #subagent-child-pins at module scope regardless
// (`./harness`).
//
// Token cost: ONE live turn (the registered control's task-question answer). Half (a)
// is registration-only, so no drive is attempted and no tokens are spent on it.
//
// NO SILENT SKIPPING: a missing live provider/model fails loudly through
// `requireLiveProvider` (`failLoudly`), naming the unmet precondition; nothing
// here early-returns or skips.
//
// Bug 0030's file-scope `console.error` spy gates this file: the filtered
// capture (`thetaOwnedStderrLines`) must be empty.
//
// FILENAME TOKEN: sibling lanes measure their own regions of the same type-layer
// boundary concurrently, so a standalone live cell under a plain descriptive
// basename risks a both-added collision at merge; this lane's merge token makes
// the file uniquely named and strippable by the parent — 

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

/** The casing refusal the lowercase declaration must draw (E, parse). */
const CASE_MISMATCH = "theta/parse/schema-case-mismatch";

/** The second code a refused declaration must NOT be able to decide (E, type). */
const LET_RHS_MISMATCH = "theta/parse/let-rhs-type-mismatch";

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
 * REFUSED — the report's c3 row. The declaration is refused for its casing, and
 * the typed binding's RHS is an index read on an unresolvable receiver, so
 * docs/spec_topics/type-system.md:48's deferral is the only correct disposition
 * for it.
 */
const REFUSED = [
  "---",
  "mode: prompt",
  "---",
  "schema index = string",
  "fn f(p: Nope) {",
  "  let m: integer = p[0]",
  "  m",
  "}",
  "1",
  "",
].join("\n");

// Drive discriminators are ANSWERS to task questions over the theta's own
// computed text -- deterministic content a degraded plain-prompt run cannot
// produce. A verbatim-echo demand ("reply with exactly this") reads as prompt
// injection to current models and draws refusals: the sentinel-refusal class
// filed as bug 0243.
const CONTROL_SENTINEL = "587";

/**
 * REGISTERED (control) — a clean theta in the same workspace, driven to the
 * answer of a fixed-pair arithmetic question. A plain task-question prompt
 * rather than a typed query, so no AJV schema is registered under a name the
 * other planted document declares.
 */
const CONTROL = [
  "---",
  "mode: prompt",
  "---",
  "@`What is 405 plus 182? Answer with the number only.`",
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

describe("bug 0135 live: a `schema <lowercase>` declaration is refused for its casing and decides no other check, while the clean control registers and drives", () => {
  it("refuses the lowercase-declaration document with the casing code alone — no let-rhs mismatch on the note channel — while the clean control registers and drives to the live sentinel", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): the refused document carries exactly the one-code disposition
    // the fence produces, so the note-channel observable below cannot be
    // produced by an unrelated load failure — and the "no let-rhs mismatch"
    // half below cannot pass merely because the document failed earlier for
    // some other reason.
    expect(
      parseDoc(REFUSED, "b0135livref.theta").diagnostics.map((d) => d.code),
      "attribution: bug 0135 §Fix Reading A — the lowercase-declaration document must carry exactly " +
        CASE_MISMATCH,
    ).toEqual([CASE_MISMATCH]);
    // The control's guard is asked here too, beside the refused one, rather than
    // deferred to its own live assertions: both documents share one planted
    // extension host below, so a regression in either shape invalidates the
    // whole cell's attribution, and failing before the provider is required
    // spends no tokens on a run whose observables could no longer be attributed.
    expect(
      parseDoc(CONTROL, "b0135livctl.theta").diagnostics.map((d) => d.code),
      "attribution: the clean control document must carry zero diagnostics",
    ).toEqual([]);

    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      { source: "project", stem: "b0135livctl", text: CONTROL },
      { source: "project", stem: "b0135livref", text: REFUSED },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // (b) REGISTERED (control) first: it is the precondition for reading (a)'s
      // absence as a refusal rather than as a broken workspace.
      expect(
        handle.command("b0135livctl"),
        "the clean control did not register — a broken workspace, not the load refusal, " +
          "would explain the refused document's absence too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // (a) REFUSED — the casing refusal is `E`, so `hasLoadParseError`
      // (src/extension/production-composition.ts:2220) denies registration.
      expect(
        handle.command("b0135livref"),
        "the lowercase-declaration document registered — code-registry-parse.md:20 carries E " +
          "severity, so it must be denied. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();

      // The theta-system-note channel, read off the settled SessionManager. The
      // load-time diagnostics fire before any drive is attempted, so the full
      // entry list already carries them.
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const casingFragment = registryFragment(CASE_MISMATCH, {});
      expect(
        notes.some((note) => note.includes(casingFragment)),
        "no theta-system-note entry named " +
          CASE_MISMATCH +
          " for the lowercase-declaration document — the casing refusal did not reach the note " +
          "channel, so this harness cannot witness a refusal at all and the absence asserted " +
          "next proves nothing. Notes: " +
          JSON.stringify(notes),
      ).toBe(true);

      // THE SUBJECT ASSERTION. Only two documents are planted and the control is
      // clean, so any `let-rhs-type-mismatch` on this channel was decided by the
      // refused declaration — which is the defect.
      expect(
        notes.filter((note) => note.includes(LET_RHS_MISMATCH)),
        "bug 0135 §Fix Reading A — a declaration the case rule refuses reached " +
          "`resolveNamed` (src/parser/type-compat.ts:124–130) and supplied a statically " +
          "resolvable RHS to the typed binding, so " +
          LET_RHS_MISMATCH +
          " fired outside its registered trigger (code-registry-parse.md:59) and rendered a " +
          "type name placeholder-rendering-a.md:25 does not admit. Notes: " +
          JSON.stringify(notes),
      ).toEqual([]);

      // (b) continued — the control DRIVES a real turn, so this harness is
      // proven able to witness the positive direction too.
      const driven = await driveSlashCaptureTurn(handle, "/b0135livctl");
      expect(
        driven.text,
        "the live model reply for the clean control did not contain the deterministic " +
          "sentinel. Reply: " + JSON.stringify(driven.text),
      ).toContain(CONTROL_SENTINEL);
      expect(
        driven.systemNotes,
        "the driven turn over the clean control appended a theta-system-note (a fail-closed " +
          "ending) — the clean path must drive clean. Notes: " +
          JSON.stringify(driven.systemNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
