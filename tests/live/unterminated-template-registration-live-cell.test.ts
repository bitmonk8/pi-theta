// Bug 0246 — `theta/parse/unterminated-template` emitted from the whole-file
// lexer's EOF exit, wired through the real discovery→load-diagnostic path
// (docs/bugs/0246-unterminated-query-template-registered-unfired.md, §Fix).
//
// Standalone live registration cell (the 0085 / 0093 / 0115 standalone-live-file
// precedent, `tests/live/empty-template-warning-registration-live-cell.test.ts`
// being the closest sibling): this lane's parent renumbers the H8a sequence of
// `tests/live/live-production-acceptance.test.ts` at merge, so this file carries
// no numeric id from that file's own cell sequence.
//
// TIER: H8a — the fixed surface is `lexTheta` (src/lexer/lexer.ts) and the
// observable is the author-visible load-diagnostic batch a real `session_start`
// discovery walk produces, plus what an ERROR-severity parse diagnostic does to
// registration.
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS DOES NOT.
// The offline witness counts the diagnostic inside `parseThetaDocument` over a
// string (the `unterminated-template-lexer-emission` file under `tests/`). This cell counts it
// where the author reads it: after the real `.pi/theta/` discovery walk and the
// shipped composition root's load-diagnostic delivery
// (src/extension/production-composition.ts), on the `theta-system-note`
// channel — and it pins the registration consequence, which no offline parse
// can show: `hasLoadParseError` (src/extension/production-composition.ts:2342–2349)
// treats any error-severity `theta/parse/*` row as un-registering, so the
// offending theta's slash command must be ABSENT once the row fires.
//
// OBSERVABLES (AGENTS.md §"Assert on real observables, not on `prompt()`
// resolving"): the `theta-system-note` channel read off the settled in-memory
// `SessionManager` (never off racy events); `handle.registeredNames()` read off
// the real `ExtensionRunner` after `session_start`; and, for the control, the
// deterministic `userTexts` outbound-render channel plus the absence of any
// fail-closed SLSH-3 note. No `prompt()` resolution alone is asserted.
//
// SUBAGENT CHILD PINS (AGENTS.md §"In-process harnesses…need the child pins"):
// not reached — both planted thetas are `mode: prompt` and neither invokes a
// subagent, so no RFC-0006 child launch occurs. The shared harness sets the
// pins at module scope regardless.
//
// NO SILENT SKIPPING: `requireLiveProvider` fails loudly when no live
// provider/model is configured, and the control theta's registration is
// asserted as a precondition before every claim about the offender.
//
// RED / GREEN (AGENTS.md §"Verify both directions"). Pre-fix the load batch
// carries ZERO `theta/parse/unterminated-template` lines for the offender and
// the offender registers; the diagnostic-presence assertion is ordered first so
// the pre-fix red is that one. Post-fix the batch carries the row and the
// offender is un-registered.
//
// WHY THE CHANNEL COUNT IS PINNED EXACTLY (post bug 0255). Pre-0255 the load
// path delivered a dropped theta's lex-phase diagnostics twice: `lexTheta`
// handed its own batch to the V7d seam (src/lexer/lexer.ts:128–132) and the
// composition root re-delivered the same rows through the drop group
// (`parseDiscoveredTheta` returns them in `dropped` at
// src/extension/production-composition.ts:2446, consumed by
// `sink.emitGroup(parsed.dropped)` at :757). Bug 0255's fix has
// `parseThetaDocument` name the already-delivered subset
// (`ThetaDocument.deliveredDiagnostics`, src/parser/theta-document.ts) and has
// the drop group exclude it by object identity before re-delivering, so this
// row now reaches the channel exactly once — the count below is exact, not a
// lower bound, and reds again if either delivery route regresses to
// double-delivery.
// The sibling `tests/live/params-default-unterminated-literal-live-cell.test.ts`
// still asserts presence rather than a count: its `theta/parse/unterminated-string`
// row is pushed by the frontmatter `params:` default parse (`parseParams`'s
// per-field default loop, `src/parser/params.ts`, bug 0239), never by
// `lexTheta`, so it only ever travelled the drop-group route and was never
// doubled — its presence assertion (that file's second `it`, the
// `notes.some(...)` check) is unaffected by bug 0255.
//
// Token-bounded: one live turn, a fixed-pair arithmetic question over the
// control theta (bug 0243 retired the verbatim-echo drive sentinel; the
// discriminator here is the rendered outbound template, not the model's reply).

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

/** The registry row bug 0246 wires (`docs/spec_topics/diagnostics/code-registry-parse.md`). */
const UNTERMINATED_TEMPLATE_CODE = "theta/parse/unterminated-template";

/** The sharded registry page carrying the row. */
const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

/**
 * The `<code>: <message>` fragment one emitted line carries. DIAG-4 makes the
 * registry *Message* column normative, so the text is READ from the row rather
 * than transcribed.
 */
function unterminatedTemplateFragment(): string {
  const message = registryMessage(REGISTRY, UNTERMINATED_TEMPLATE_CODE) as string | undefined;
  expect(
    message,
    `precondition unmet: ${UNTERMINATED_TEMPLATE_CODE} has no registry row — the code this ` +
      "cell counts is unregistered (DIAG-2)",
  ).toBeTypeOf("string");
  return `${UNTERMINATED_TEMPLATE_CODE}: ${message as string}`;
}

/**
 * The `theta-system-note` channel contents off the settled in-memory
 * `SessionManager`, read over the FULL entry list (the load batch fires before
 * any drive).
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

/** Occurrences of `needle` in `haystack` — the control's zero-count claim needs a count, not a test for presence. */
function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/** The arithmetic drive question — task-framed, no verbatim-echo demand (bug 0243). */
const CONTROL_QUESTION = "What is 263 plus 514? Answer with the number only.";

/**
 * The precondition control: a well-formed, CLOSED `@`…`` template. It proves
 * discovery and registration are healthy, that a live turn really runs, and —
 * the §Fix constraint 1 trap on the live axis — that a well-formed `@`-query
 * draws NO unterminated-template line.
 */
const CONTROL = [
  "---",
  "mode: prompt",
  "---",
  `let r = @\`${CONTROL_QUESTION}\`?`,
  "r",
  "",
].join("\n");

/**
 * The bug-0246 subject: an opening backtick with no closing one, EOF inside the
 * template body — the registry *Trigger* verbatim.
 */
const OFFENDER = [
  "---",
  "mode: prompt",
  "---",
  "let r = @`this query template is never closed",
  "",
].join("\n");

describe("bug 0246 — an unterminated `@`…`` template draws the lex-phase row on the real load path and un-registers the theta (Convention: live-host acceptance)", () => {
  it("the theta whose body is `let r = @`…` at EOF carries a theta/parse/unterminated-template load note and does not register, while the closed control registers and drives", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      { source: "project", stem: "b0246livectl", text: CONTROL },
      { source: "project", stem: "b0246liveoffender", text: OFFENDER },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition: without a registering control the assertions below would
      // hold vacuously over an extension that registered nothing at all.
      expect(
        handle.command("b0246livectl"),
        "precondition unmet: the closed-template control theta did not register, so discovery " +
          "or registration regressed independently of bug 0246 and nothing below witnesses " +
          "anything. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      const allNotes = systemNoteContents(handle.sessionManager.getEntries());
      const fragment = unterminatedTemplateFragment();
      const occurrences = allNotes.reduce(
        (sum, note) => sum + countOccurrences(note, fragment),
        0,
      );
      expect(
        occurrences,
        `PRIMARY (bug 0246): lexTheta must push ${UNTERMINATED_TEMPLATE_CODE} at its EOF ` +
          "exit, reaching the theta-system-note channel through the real load path. AT HEAD " +
          "(pre-0246-fix) the main loop falls out of `while (i < n)` with `inTemplateProse` " +
          "still set and nothing tests it, so this count is zero. Post bug 0255 the count is " +
          "exact, not a lower bound: `parseThetaDocument` names the subset `lexTheta` already " +
          "delivered through the V7d seam (src/lexer/lexer.ts:128–132), and the drop group " +
          "(src/extension/production-composition.ts:2446 → :757) excludes that subset by " +
          "object identity before re-delivering, so this row reaches the channel exactly once. " +
          "Notes: " + JSON.stringify(allNotes),
      ).toBe(1);

      // The emission is located: the line the author reads names the offending
      // file, so a batch that reported the row against the wrong theta reds.
      expect(
        allNotes.filter((note) => countOccurrences(note, fragment) > 0).join("\n"),
        "the emitted line must name the offending file — a theta/parse/* row is a located site. " +
          "Notes: " + JSON.stringify(allNotes),
      ).toContain("b0246liveoffender");

      // The registration consequence of severity E: `hasLoadParseError` treats
      // any error-severity `theta/parse/*` row as un-registering, so the
      // offender's slash command must be absent once the row fires. The
      // closed-template control in the same workspace shows the walk itself is
      // unaffected.
      expect(
        handle.registeredNames(),
        "the registry row's severity is E, and an error-severity theta/parse/* diagnostic " +
          "un-registers the theta — the offender must not present a slash command an author " +
          "could run. Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b0246liveoffender");

      // The §Fix constraint 1 trap on the live axis: `lexQueryTemplate`'s
      // `terminated` flag is false for every well-formed template because its
      // callers pass the interior slice, so a fix forwarding that array would
      // put the row on the control's load batch too.
      const controlOccurrences = allNotes
        .filter((note) => note.includes("b0246livectl"))
        .reduce((sum, note) => sum + countOccurrences(note, fragment), 0);
      expect(
        controlOccurrences,
        "a CLOSED template must draw no unterminated-template line. Notes naming the control: " +
          JSON.stringify(allNotes.filter((note) => note.includes("b0246livectl"))),
      ).toBe(0);

      // Drive the control for real: its rendered template is the deterministic
      // outbound observable (the model's arithmetic reply is not asserted), and
      // the absence of a fail-closed SLSH-3 note is what proves the theta ran
      // rather than merely parsed.
      const driven = await driveSlashCaptureTurn(handle, "/b0246livectl");
      expect(
        driven.userTexts.join("\n"),
        "the control's QRY-18 rendered template is the deterministic outbound-render channel; " +
          "its absence means the query never reached the provider. Observed: " +
          JSON.stringify(driven.userTexts),
      ).toContain(CONTROL_QUESTION);
      expect(
        driven.systemNotes,
        "a fail-closed ending of a top-level drive lands on the theta-system-note channel; the " +
          "closed-template control must end cleanly. Observed: " +
          JSON.stringify(driven.systemNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
