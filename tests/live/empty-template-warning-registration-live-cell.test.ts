// Bug 0085 — QRY-6's parse-time `theta/parse/empty-template` warning, wired
// through the real discovery→registration→drive path
// (docs/bugs/0085-empty-template-warning-dead.md, §Fix disposition 1).
//
// Standalone live registration cell (the 0093 / 0104 / 0065 / 0115 / 0182
// standalone-live-file precedent, `tests/live/let-annotation-query-double-emission-live-cell.test.ts`
// being the closest sibling): this lane's parent renumbers the H8a sequence of
// `tests/live/live-production-acceptance.test.ts` at merge, so this file
// carries no numeric id from that file's own cell sequence. 
//
// TIER: H8a — the fixed surface is the parser (`BodyParser`'s query-template
// node, `src/parser/theta-document.ts`) and the observable is (a) the
// author-visible load diagnostic batch a real `session_start` load produces,
// and (b) that severity `W` does not deny registration — the degenerate theta
// still registers AND still drives (the runtime QRY-6 layer-two short-circuit
// still fires, at zero provider tokens, proving the theta is genuinely live
// and not merely parsed).
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS DOES NOT.
// `tests/empty-template-parse-warning.test.ts` counts the diagnostic inside
// `parseThetaDocument` over a string. This cell counts it where the author
// reads it: after the real `.pi/theta/` discovery walk, the shipped
// composition root's load-diagnostic delivery
// (`src/extension/production-composition.ts`'s warning-severity direct-batch
// arm) onto the `theta-system-note` channel, AND it drives the registered
// slash command for real, proving registration was not merely "the parser
// didn't error" but "the theta runs" — QRY-6's own runtime layer (the
// short-circuit) still fires and its SLSH-3 `theta-system-note` is still the
// author-visible surface, unaffected by the new parse-time warning existing
// alongside it.
//
// OBSERVABLES (AGENTS.md §"Assert on real observables, not on `prompt()`
// resolving"): `handle.registeredNames()` read off the real `ExtensionRunner`
// after `session_start`; the `theta-system-note` channel contents read off the
// settled in-memory `SessionManager`, both for the load-time batch (before any
// drive) and for the drive's own SLSH-3 note (after `prompt()` resolves); and
// `userTexts`, asserted EMPTY to prove the drive spent no provider turn (QRY-6
// layer two short-circuits before the model is ever reached). No `prompt()`
// resolution alone is asserted anywhere.
//
// SUBAGENT CHILD PINS (AGENTS.md §"In-process harnesses…need the child pins"):
// not reached. Both planted thetas are `mode: prompt`; the offender's query
// short-circuits before any provider turn and no slash command invokes a
// subagent, so no RFC-0006 child launch occurs. The shared harness sets the
// pins at module scope regardless, so the file is correct either way.
//
// NO SILENT SKIPPING: `requireLiveProvider` fails loudly when no live
// provider/model is configured; the control theta's registration is asserted
// as a precondition before every other assertion.
//
// RED / GREEN (AGENTS.md §"Verify both directions"). Pre-fix (the emitter
// unwired) the load batch carries ZERO `theta/parse/empty-template` lines for
// the offender file — the registration and drive assertions below still hold
// (severity W was never the blocker; the emitter was simply never called), so
// only the diagnostic-presence assertion reds pre-fix. Post-fix it carries
// exactly one.
//
// Token-bounded: the offender's query short-circuits before any provider
// turn (QRY-6 layer two); the control theta issues no query at all. This cell
// spends no tokens beyond `requireLiveProvider`'s credential resolution.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../../tools/code-registry/index.js";
import {
  bootShippedExtension,
  driveSlashCaptureTurn,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";

/** The registry code bug 0085 wires (`docs/spec_topics/diagnostics/code-registry-parse.md`). */
const EMPTY_TEMPLATE_CODE = "theta/parse/empty-template";

/** The sharded registry page carrying `theta/parse/empty-template`'s row. */
const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

/**
 * The `<code>: <message>` fragment one `theta/parse/empty-template` line
 * carries. DIAG-4 makes the registry *Message* column normative, so the text
 * is READ from the row rather than transcribed, mirroring
 * `emptySchemaBodyFragment` in the 0093 sibling cell.
 */
function emptyTemplateFragment(): string {
  const message = registryMessage(REGISTRY, EMPTY_TEMPLATE_CODE) as string | undefined;
  expect(
    message,
    `precondition unmet: ${EMPTY_TEMPLATE_CODE} has no registry row — the code this cell ` +
      "counts is unregistered (DIAG-2)",
  ).toBeTypeOf("string");
  return `${EMPTY_TEMPLATE_CODE}: ${message as string}`;
}

/**
 * The `theta-system-note` channel contents off the settled in-memory
 * `SessionManager`, read off the FULL entry list (the load diagnostic fires
 * before any drive). Mirrors the 0093 sibling cell's `systemNoteContents`.
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

/** The precondition control: a well-formed prompt theta issuing no query at all. */
const CONTROL = ["---", "mode: prompt", "---", '" CONTROL OK"', ""].join("\n");

/**
 * The bug-0085 subject: a written, closed `@`…`` template whose static body
 * is three spaces (ASCII-whitespace-only) — one of the r1–r4 fixtures the bug
 * doc's §Reproduction pins. Severity W (registry row) must NOT deny
 * registration; QRY-6 layer two (the runtime short-circuit) must still fire
 * when driven, unaffected by the new parse-time warning.
 */
const OFFENDER = ["---", "mode: prompt", "---", "let r = @`   `?", "r", ""].join("\n");

describe("bug 0085 — a degenerate `@`…`` template draws the parse-time warning, still registers, and still drives (Convention: live-host acceptance)", () => {
  it("the theta whose body is `let r = @`   `` registers, carries exactly ONE theta/parse/empty-template load note, and its drive short-circuits at zero provider tokens with the QRY-6 layer-two SLSH-3 note", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      { source: "project", stem: "cell0085ctl", text: CONTROL },
      { source: "project", stem: "cell0085offender", text: OFFENDER },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition: without a registering control, the assertions below
      // would hold vacuously over an extension that registered nothing at all.
      expect(
        handle.command("cell0085ctl"),
        "precondition unmet: the well-formed control theta did not register, so discovery " +
          "or registration regressed independently of bug 0085 and neither assertion below " +
          "witnesses anything. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The core claim severity W protects: the degenerate-template theta
      // registers. A wiring that raised the diagnostic to error severity, or
      // that mis-wired the guard onto an unrelated shape, would un-register it
      // here (`hasLoadParseError`, src/extension/production-composition.ts).
      expect(
        handle.registeredNames(),
        "the theta-0085 offender did not register — QRY-6's registry row is severity W " +
          "('the theta still loads'); a fix that raised the severity, or a guard that " +
          "misfired onto the closing-tick shape, would un-register it here. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toContain("cell0085offender");

      // The load-time diagnostic batch, on the channel the author reads.
      // `diagnostic-shape.md`'s persistent-diagnostics default batches a
      // file's warnings into ONE `theta-system-note` (no severity carve-out),
      // so the fragment is counted across the notes naming this file rather
      // than by counting notes.
      const notesBeforeDrive = systemNoteContents(handle.sessionManager.getEntries()).filter(
        (note) => note.includes("cell0085offender"),
      );
      expect(
        notesBeforeDrive.length,
        "precondition unmet: no theta-system-note entry names the offending file at all, so " +
          "the load batch never reached the channel the author reads. Notes: " +
          JSON.stringify(systemNoteContents(handle.sessionManager.getEntries())),
      ).toBeGreaterThan(0);

      const fragment = emptyTemplateFragment();
      const occurrences = notesBeforeDrive.reduce(
        (sum, note) => sum + countOccurrences(note, fragment),
        0,
      );
      expect(
        occurrences,
        `PRIMARY (bug 0085): parseThetaDocument must emit exactly one ${EMPTY_TEMPLATE_CODE} ` +
          "for the offender's degenerate template, delivered through the real load path onto " +
          "the theta-system-note channel. AT HEAD (pre-fix) the sole emitter " +
          "(emptyTemplateWarning, src/render/query-render.ts) has no src/ caller, so this " +
          `count is zero. Notes naming the file: ${JSON.stringify(notesBeforeDrive)}`,
      ).toBe(1);

      // Drive the registered offender for real: QRY-6 layer two (the runtime
      // short-circuit) fires before any provider turn is issued — the theta
      // "still registers and drives" (severity W denies nothing), and the
      // drive itself spends zero provider tokens, so this cell's live cost is
      // bounded to `requireLiveProvider`'s credential resolution.
      const driven = await driveSlashCaptureTurn(handle, "/cell0085offender");
      expect(
        driven.userTexts,
        "QRY-6 layer two short-circuits BEFORE the model is ever reached — no outbound " +
          "user-turn text should have been sent for the degenerate query. Observed: " +
          JSON.stringify(driven.userTexts),
      ).toEqual([]);
      expect(
        driven.systemNotes,
        "the drive did not surface the QRY-6 layer-two SLSH-3 note — either the theta failed " +
          "to run at all (contradicting registration) or the runtime short-circuit regressed. " +
          "Observed: " + JSON.stringify(driven.systemNotes),
      ).toEqual([
        "theta /cell0085offender returned Err: rendered query template was empty " +
          "\u2014 no provider turn was issued",
      ]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
