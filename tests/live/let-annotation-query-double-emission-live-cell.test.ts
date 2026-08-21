// Bug 0093 — the `` live cell: a `let` annotation over a bare-query
// initialiser must reach the author's diagnostic batch ONCE
// (docs/bugs/0093-let-annotation-query-position-double-emission.md).
//
// Standalone live registration cell (the 0104 / 0065 / 0115 / 0182 standalone-
// live-file precedent, `tests/live/reassign-rhs-type-mismatch-live-cell.test.ts`
// being the closest sibling): this lane's parent renumbers the H8a sequence of
// `tests/live/live-production-acceptance.test.ts` at merge, so this file carries
// the literal token `` in its strings rather than a numeric id from that
// file's existing cell sequence.
//
// TIER: H8a — the fixed surface is the parse/type layer, and the observable is
// the author-visible diagnostic batch a real `session_start` load produces.
// H8a is the half that reaches that batch through the shipped composition root
// (`bootShippedExtension`, tests/live/harness.ts) while still exposing the
// batch itself: on the shipped load path the batch routes to the
// `theta-system-note` channel, whose renderer output H9a's `pi -p` print-mode
// stdout does NOT stream (measured and recorded in
// `tests/live/acceptance/ctor-unresolved-load-refusal.test.ts`'s observation
// note), so the count this cell asserts is not a black-box observable at the
// H9a tier at all.
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS DOES NOT.
// `tests/let-annotation-query-double-emission.test.ts` counts emissions inside
// `parseThetaDocument` over a string. This cell counts them where the author
// reads them: after the real `.pi/theta/` discovery walk, the shipped
// composition root's load-diagnostic delivery, and
// `diagnostic-shape.md:65`'s one-`pi.sendMessage`-per-file batching — the step
// that turns two collected diagnostics into two lines in one transcript entry.
//
// OBSERVABLES (AGENTS.md §"Assert on real observables, not on `prompt()`
// resolving"): `handle.registeredNames()` / `handle.command(stem)` read off the
// real `ExtensionRunner` after `session_start`, and the `theta-system-note`
// channel contents read off the settled in-memory `SessionManager`. No
// `prompt()` resolution is asserted anywhere; no drive is issued at all.
//
// SUBAGENT CHILD PINS (AGENTS.md §"In-process harnesses…need the child pins"):
// not reached. Both planted thetas are `mode: prompt`, no slash command is
// invoked, so no query-time tool-call loop and no RFC-0006 child launch occurs.
// The shared harness sets the pins at module scope regardless (executable,
// extension identity, parent-pid carriage), so the file is correct either way.
//
// NO SILENT SKIPPING: `requireLiveProvider` fails loudly when no live
// provider/model is configured, the control theta's registration is asserted as
// a precondition before the count assertion, and the count is asserted as an
// exact number — never `.some` / `.toContain`, which cannot tell one line from
// two.
//
// RED / GREEN (AGENTS.md §"Verify both directions"). Pre-fix the batch carries
// TWO lines for the one written `{}` and the count assertion reds at 2;
// post-fix it carries one. A repair that withheld the occurrence entirely
// instead of its duplicate reds at 0, and a repair that also stopped refusing
// the theta reds on the non-registration assertion above it.
//
// Token-bounded: registration-only, zero model turns, so this cell spends no
// tokens beyond `requireLiveProvider`'s credential resolution.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../../tools/code-registry/index.js";
import {
  bootShippedExtension,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";

/** The registry code whose emission count is the `` subject. */
const EMPTY_SCHEMA_BODY_CODE = "theta/parse/empty-schema-body";

/** The sharded registry page carrying `theta/parse/empty-schema-body`'s row (`:91`). */
const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

/**
 * The code-prefixed fragment one `theta/parse/empty-schema-body` line carries
 * for an empty inline object. DIAG-4 makes the registry *Message* column
 * normative, so the text is READ from the row rather than transcribed (this
 * file's sibling cells' `emptySchemaBodyFragment` / `invokePathEscapeFragment`
 * discipline), and the `<code>: <message>` join mirrors `renderDiagnosticLine`
 * (src/diagnostics/diagnostic.ts), which is what the note content carries.
 */
function emptySchemaBodyFragment(): string {
  const template = registryMessage(REGISTRY, EMPTY_SCHEMA_BODY_CODE) as string | undefined;
  expect(
    template,
    `: ${EMPTY_SCHEMA_BODY_CODE} has no registry row — the code this cell counts is ` +
      "unregistered (DIAG-2), so the count below would be vacuously zero",
  ).toBeTypeOf("string");
  const message = (template as string).replaceAll("<X>", "{}");
  expect(
    message,
    `: ${EMPTY_SCHEMA_BODY_CODE}'s Message template left an unsubstituted <…> ` +
      "placeholder — this cell's substitution is stale against the registry row",
  ).not.toMatch(/<[a-zA-Z]+>/);
  return `${EMPTY_SCHEMA_BODY_CODE}: ${message}`;
}

/**
 * The `theta-system-note` channel contents off the settled in-memory
 * `SessionManager` (AGENTS.md §"Assert on real observables"), read off the FULL
 * entry list rather than a per-drive slice: the diagnostic under test fires at
 * LOAD time, before any drive. Mirrors `./harness`'s unexported
 * `collectSystemNotes` and the same reader in
 * `tests/live/live-production-acceptance.test.ts`.
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

/** Occurrences of `needle` in `haystack` — the count IS the claim, so it is counted. */
function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/**
 * The offender: one written `{}` in a `let` annotation over a bare-query
 * initialiser, the bug doc's §Reproduction subject. Error-severity
 * `theta/parse/*` denies registration either way, so the theta never runs and
 * its query never reaches a model — this cell spends no tokens on it.
 */
const OFFENDER = ["---", "mode: prompt", "---", "let r: {} = @`hi`", "r", ""].join("\n");

/** The precondition control: a well-formed prompt theta in the same workspace. */
const CONTROL = ["---", "mode: prompt", "---", '" CONTROL OK"', ""].join("\n");

describe("bug 0093 — a propagated `let` annotation reaches the author's diagnostic batch once (Convention: live-host acceptance)", () => {
  it(": the theta whose body is `let r: {} = @`hi`` is refused, and the theta-system-note batch carries exactly ONE empty-schema-body line for it, through the real discovery→registration path", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      { source: "project", stem: "cellcctl", text: CONTROL },
      { source: "project", stem: "cellcoffender", text: OFFENDER },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition: without a registering control, an empty registered set
      // and an empty note channel would satisfy the assertions below
      // vacuously.
      expect(
        handle.command("cellcctl"),
        " precondition unmet: the well-formed control theta did not register, so " +
          "discovery or registration regressed independently of bug 0093 and neither " +
          "assertion below witnesses anything. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The offender carries an error-severity `theta/parse/*` diagnostic
      // whichever count the batch holds, so `hasLoadParseError`
      // (src/extension/production-composition.ts) un-registers it before and
      // after the fix alike. Asserted so the count below is read off a batch
      // that actually denied the load, rather than off a theta that quietly
      // registered.
      expect(
        handle.registeredNames(),
        ": the theta whose annotation is an empty inline object registered — the " +
          "empty-schema-body refusal stopped denying the load, so the batch this cell counts " +
          "is no longer the author-visible refusal batch. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).not.toContain("cellcoffender");

      // The count, on the channel the author reads. `diagnostic-shape.md:65`
      // batches the whole collected list into one `pi.sendMessage` per file, so
      // both entries of a doubling pair land in the same note; the fragment is
      // therefore counted across the notes naming this file rather than by
      // counting notes.
      const notes = systemNoteContents(handle.sessionManager.getEntries()).filter((note) =>
        note.includes("cellcoffender"),
      );
      expect(
        notes.length,
        " precondition unmet: no theta-system-note entry names the offending file at " +
          "all, so the load batch never reached the channel the author reads and the count " +
          "below would be vacuously zero. Notes: " +
          JSON.stringify(systemNoteContents(handle.sessionManager.getEntries())),
      ).toBeGreaterThan(0);

      const fragment = emptySchemaBodyFragment();
      const occurrences = notes.reduce(
        (total, note) => total + countOccurrences(note, fragment),
        0,
      );
      expect(
        occurrences,
        ": the author-visible batch must carry exactly ONE empty-schema-body line for " +
          "the one written `{}`. A count of 2 is bug 0093's double emission surviving into " +
          "the delivered batch — `parseLet` propagated the annotation onto the query and both " +
          "walk arms reported it. A count of 0 means the repair withheld the occurrence " +
          "itself rather than its duplicate, leaving the author with no diagnostic for an " +
          "unvalidatable empty schema. Notes: " +
          JSON.stringify(notes),
      ).toBe(1);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
