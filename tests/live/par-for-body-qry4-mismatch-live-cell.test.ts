// H8a live witness — bug 0240: without a `case "par-for"` arm in `rewriteExpr`
// (src/parser/query-schema-resolve.ts) a `ParForExpr` falls into that method's
// `default` arm and the whole subtree is returned unrewritten — `checkLetMismatch`
// (same file) is never reached for a body
// `let`, and `theta/parse/explicit-schema-mismatch`
// (docs/spec_topics/diagnostics/code-registry-parse.md:84) cannot fire anywhere
// inside a `par for` body. The fix adds that one arm, which makes the warning
// reachable there (docs/bugs/0240-query-schema-resolve-never-descends-par-for.md
// §Reproduction row D6, §Fix (a)/(c)).
//
// This file carries a literal lane token in its NAME rather than a numeric id
// from the existing H8a sequence: this lane's parent renumbers that sequence at
// merge, the same reason tests/live/par-for-body-return-live-cell.test.ts gives
// for its own naming.
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS DOES NOT.
// `tests/par-for.test.ts` cell (s6) pins the whole unfiltered diagnostic array
// at the `parseThetaDocument` boundary. It does not observe the shipped load
// path deciding what the AUTHOR is told: the load router delivers every
// error-severity diagnostic as its own pre-eval note and a group's
// warning-severity diagnostics as ONE `emitDiagnosticBatch` note on the same
// `theta-system-note` channel (src/extension/production-composition.ts:1462-1479),
// and registration is denied by the error alone
// (`const registered = !diagnostics.some((d) => d.severity === "error")`,
// `:1735`). So the QRY-4 warning's reachability is felt live on the note channel
// and nowhere else — which is precisely why bug 0240 is filed at S2 ("the one
// row whose divergence is visible on a channel the author reads").
//
// OBSERVABLE, per AGENTS.md §"Assert on real observables, not on `prompt()`
// resolving": the `theta-system-note` channel read off the settled in-memory
// `SessionManager` (`handle.sessionManager.getEntries()`), plus
// `handle.command` / `handle.registeredNames()` off the real `ExtensionRunner`
// after the real `session_start` → `resources_discover` → `pi.registerCommand`
// step. No drive is attempted and no `prompt()` resolution is asserted.
//
// SIBLING-CONTROL DISCIPLINE (the precedent's, twice over):
//   - a PLAIN-`for` spelling of the identical body draws the mismatch warning
//     ALONE and REGISTERS. Asserted FIRST: it proves this cell's detector can
//     see a warning note on this channel at all, so the subject's verdict is not
//     a dead detector (the liveness control of bug 0222's cell 83 in
//     tests/live/live-production-acceptance.test.ts);
//   - a QUERY-FREE `par for` sibling registers clean and puts no note on the
//     channel, so the subject's refusal is attributable to the body query and
//     not to the construct's mere presence (the control of
//     tests/live/par-for-body-return-live-cell.test.ts).
// Notes are scoped to the note that cites the subject's own planted filename
// before the subject is judged, because the liveness control's legitimate
// warning note is on the same channel (bug 0222 cell 83's scoping).
//
// DIAG-4: BOTH message halves are READ from the registry through `parseRegistry`
// / `registryMessage`, never written out here — QRY-4's mismatch warning
// (code-registry-parse.md:84) and CTRL-4's refusal, whose own row is
// code-registry-parse.md:75 (docs/reference/diagnostics.md:121 mirrors it). So
// each of the subject's two notes is pinned by its registered MESSAGE and not by
// its code string alone.
//
// Token cost: ZERO model turns. Registration and the load-phase note channel
// are both decided at load, so no slash command is invoked.
//
// SUBAGENT CHILD LAUNCH: not reached — every planted theta is `mode: prompt` and
// no turn runs, so no RFC-0006 child spawn occurs. `./harness` sets both
// `#subagent-child-pins` at module scope regardless, inherited by importing it.
//
// NO SILENT SKIPPING: a missing live provider/model fails loudly through
// `requireLiveProvider` (`failLoudly`); nothing here early-returns or skips.
//
// RED / GREEN (AGENTS.md §"Verify both directions"): the subject's mismatch
// assertion is falsifiable on this fixture from both sides. Replacing the
// subject's `@<integer>` ascription with `@<Owner>` (compatible with the
// annotation) leaves nothing for QRY-4 to warn about, so only the CTRL-4 refusal
// note arrives and the assertion reds; withholding `rewriteExpr`'s `par-for` arm
// leaves the body `let` unjudged by `checkLetMismatch` and reds it the same way.
// It therefore cannot pass vacuously. The subject's offline attribution guard
// is sequenced AFTER the subject's live assertions so that either neutralisation
// reds the live note-channel assertion this cell exists for, instead of aborting
// the run on an offline check of the same `parseThetaDocument` computation.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  bootShippedExtension,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";
import { parseDoc } from "../helpers/e2e-s1";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../../tools/code-registry/index.js";

/** QRY-4's warning — the verdict this fix makes reachable in a `par for` body. */
const MISMATCH_CODE = "theta/parse/explicit-schema-mismatch";
/** CTRL-4's refusal (docs/spec_topics/control-flow.md:76), unmoved by this fix. */
const PAR_QUERY_IN_BODY = "theta/parse/par-query-in-body";

const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

/**
 * `theta/parse/explicit-schema-mismatch: <registered Message>` — DIAG-4: the
 * message half is read from the registry row. The row's one `<…>` token is the
 * literal `@<Schema>` source spelling, not an interpolation slot, so nothing is
 * substituted.
 */
function mismatchFragment(): string {
  const template = registryMessage(REGISTRY, MISMATCH_CODE) as string | undefined;
  expect(
    template,
    `${MISMATCH_CODE} has no registry row — the code this cell asserts is not registered (DIAG-2)`,
  ).toBeTypeOf("string");
  return `${MISMATCH_CODE}: ${template as string}`;
}

/**
 * `theta/parse/par-query-in-body: <registered Message>` — DIAG-4 for CTRL-4's
 * refusal, whose row (code-registry-parse.md:75) is as much a message oracle as
 * QRY-4's. Its Message carries no interpolation slot, so nothing is substituted.
 */
function parQueryFragment(): string {
  const template = registryMessage(REGISTRY, PAR_QUERY_IN_BODY) as string | undefined;
  expect(
    template,
    `${PAR_QUERY_IN_BODY} has no registry row — the code this cell asserts is not registered (DIAG-2)`,
  ).toBeTypeOf("string");
  return `${PAR_QUERY_IN_BODY}: ${template as string}`;
}

/**
 * The theta-system-note channel contents from the settled in-memory
 * `SessionManager`, read directly off `getEntries()` (AGENTS.md §"Assert on real
 * observables").
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
 * A whole `mode: prompt` theta declaring the one schema the mismatched binding
 * annotates against, so each planted file is a real discovery→parse of a real
 * file rather than a body fragment.
 */
function withOwnerSchema(lines: readonly string[]): string {
  return (
    ["---", "mode: prompt", "---", "schema Owner {", "  name: string", "}", ...lines].join("\n") +
    "\n"
  );
}

/** The mismatched body of §Reproduction row D6: annotation `Owner`, ascription `integer`. */
const MISMATCHED_BODY = ["  let o: Owner = @<integer>`who`", "  1"];

/**
 * SUBJECT — row D6's IN-CLASS spelling. The CTRL-4 refusal denies registration
 * either way; the fixed observable is the QRY-4 warning note beside it.
 */
const SUBJECT = withOwnerSchema([
  "let xs = par for i in [1, 2] {",
  ...MISMATCHED_BODY,
  "}",
  "xs",
]);

/**
 * LIVENESS CONTROL — row D6's CONTROL spelling: the identical body under a plain
 * `for`, which the statement-side recursion already descends
 * (`rewriteStmt`'s `case "for"` arm, src/parser/query-schema-resolve.ts). The
 * mismatch is warning-severity and nothing else fires, so this theta REGISTERS
 * and its warning note proves the channel delivers this code live.
 */
const FOR_CONTROL = withOwnerSchema(["for i in [1, 2] {", ...MISMATCHED_BODY, "}"]);

/**
 * ENCLOSURE CONTROL — the same `par for` construct with no query in the body, so
 * neither verdict has anything to judge. Bounds the subject's refusal to the
 * body query rather than to `par for` itself.
 */
const CLEAN_PAR_FOR =
  ["---", "mode: prompt", "---", "let xs = par for i in [1, 2] { i }", "xs"].join("\n") + "\n";

/** Precondition control: an ordinary theta, so an absent registration below is not a broken workspace. */
const WORKSPACE_CONTROL = ["---", "mode: prompt", "---", "let ok = 1", "ok"].join("\n") + "\n";

describe("bug 0240 live: a QRY-4 mismatch inside a `par for` body reaches the theta-system-note channel beside CTRL-4's refusal", () => {
  it("carries BOTH par-query-in-body and explicit-schema-mismatch for the `par for` subject, where the plain-`for` sibling carries the warning alone and the query-free `par for` sibling registers clean", async () => {
    // ATTRIBUTION GUARD, offline and token-free, for the two directions the fix
    // must NOT move: the plain-`for` control's disposition is exactly the
    // warning, and the query-free `par for` sibling is silent. The subject's own
    // guard is deferred to below its live assertions — it is the direction the
    // fix opens, so asserting it here would abort the run before the controls
    // have proven the channel observable at all.
    expect(
      parseDoc(FOR_CONTROL, "b0240liveforctl.theta").diagnostics.map((d) => d.code),
      "attribution: the plain-`for` control must carry exactly " + MISMATCH_CODE,
    ).toEqual([MISMATCH_CODE]);
    expect(
      parseDoc(CLEAN_PAR_FOR, "b0240livecleanpf.theta").diagnostics.map((d) => d.code),
      "attribution: the query-free `par for` sibling must carry no diagnostic of any severity",
    ).toEqual([]);

    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      { source: "project", stem: "b0240livectl", text: WORKSPACE_CONTROL },
      { source: "project", stem: "b0240liveforctl", text: FOR_CONTROL },
      { source: "project", stem: "b0240livecleanpf", text: CLEAN_PAR_FOR },
      { source: "project", stem: "b0240livesubject", text: SUBJECT },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b0240livectl"),
        "the workspace precondition control did not register — a broken workspace, not the " +
          "CTRL-4 refusal, would explain the subject's absence too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // LIVENESS CONTROL, asserted FIRST: the plain-`for` spelling registers
      // (warning-only) and its warning reaches the channel, so a silent channel
      // cannot be mistaken for the subject's verdict.
      expect(
        handle.command("b0240liveforctl"),
        "the plain-`for` control did not register — the mismatch is warning-severity, so the " +
          "load gate must admit it. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      const fragment = mismatchFragment();
      const controlNotes = systemNoteContents(handle.sessionManager.getEntries()).filter((note) =>
        note.includes("b0240liveforctl.theta"),
      );
      expect(
        controlNotes.some((note) => note.includes(fragment)),
        "the plain-`for` control fired no " +
          MISMATCH_CODE +
          " note — this cell's detector cannot see that code on this channel, so the subject's " +
          "assertion below would be vacuous. Notes: " + JSON.stringify(controlNotes),
      ).toBe(true);

      // ENCLOSURE CONTROL: a query-free `par for` registers and says nothing, so
      // the subject's two notes are attributable to the body query.
      expect(
        handle.command("b0240livecleanpf"),
        "the query-free `par for` sibling did not register — the construct itself became " +
          "unloadable, which no part of bug 0240 licenses. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        systemNoteContents(handle.sessionManager.getEntries()).filter((note) =>
          note.includes("b0240livecleanpf.theta"),
        ),
        "the query-free `par for` sibling put a note on the channel — widening this pass's reach " +
          "must leave a clean `par for` exactly as silent as it is today (§Reproduction F2)",
      ).toEqual([]);

      // SUBJECT. The refusal is error-severity, so registration is denied —
      // unchanged by this fix, and asserted so a regression that ALSO stopped
      // refusing the body query cannot be mistaken for the fix under test.
      expect(
        handle.command("b0240livesubject"),
        "the `par for` subject registered — CTRL-4's refusal of a body `@`-query stopped denying " +
          "the load gate, which bug 0240 §Non-goals rules out. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();

      const subjectNotes = systemNoteContents(handle.sessionManager.getEntries()).filter((note) =>
        note.includes("b0240livesubject.theta"),
      );
      expect(
        subjectNotes.length > 0,
        "no theta-system-note entry cited b0240livesubject.theta at all, so this cell cannot " +
          "distinguish the subject's notes from the controls'. All notes: " +
          JSON.stringify(systemNoteContents(handle.sessionManager.getEntries())),
      ).toBe(true);
      expect(
        subjectNotes.some((note) => note.includes(parQueryFragment())),
        "no theta-system-note entry carried " +
          PAR_QUERY_IN_BODY +
          "'s registered Message (DIAG-4, code-registry-parse.md:75)" +
          " for the body query — CTRL-4's refusal is what makes the unresolved schema half " +
          "unreachable, and this cell must witness it firing. Notes: " +
          JSON.stringify(subjectNotes),
      ).toBe(true);
      // THE FIXED OBSERVABLE: the QRY-4 warning beside the refusal. Where the
      // body's statements do not reach `checkLetMismatch`, this note is absent
      // and the author learns the mismatch only on the next parse.
      expect(
        subjectNotes.some((note) => note.includes(fragment)),
        "no " +
          MISMATCH_CODE +
          " note fired beside CTRL-4's refusal for the `par for` body's mismatched `let` — " +
          "`rewriteExpr` (src/parser/query-schema-resolve.ts) is dropping the `par-for` node " +
          "into its `default` arm, so `checkLetMismatch` (same file) never judges the body " +
          "annotation, while the identical body under a plain `for` warns (the control above). " +
          "Notes: " + JSON.stringify(subjectNotes),
      ).toBe(true);

      // The subject's offline attribution guard is sequenced last, below every
      // live assertion above, because it reads the same `parseThetaDocument`
      // computation the pass's `par-for` arm decides: ahead of them it would be
      // the first statement to red under any neutralisation of that arm and the
      // note-channel assertion this cell exists to prove falsifiable would never
      // be reached. Behind them it still pins the subject's diagnostic shape —
      // CTRL-4's refusal followed by QRY-4's warning — without pre-empting them.
      expect(
        parseDoc(SUBJECT, "b0240livesubject.theta").diagnostics.map((d) => d.code),
        "attribution (bug 0240 §Expected behaviour D6): the `par for` subject must carry the " +
          "CTRL-4 refusal followed by the QRY-4 warning",
      ).toEqual([PAR_QUERY_IN_BODY, MISMATCH_CODE]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
