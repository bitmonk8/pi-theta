// H8a (live) — bug 0177: a non-string `QueryError` payload field at the
// SLSH-3 slash-dispatch boundary renders through `summariseErrorField`
// (compact `JSON.stringify`), not through bare template substitution.
//
// Spec: docs/bugs/0177-err-note-render-string-coercion-on-record-error-fields.md
// §Reproduction (c) row 1 (the source below parses with `[]` diagnostics),
// §Fix (b)(1) (the chosen rendering rule: compact `JSON.stringify`).
//
// WHY LIVE, AND WHY THIS SHAPE. Every offline witness for this bug
// (`tests/err-note-render.test.ts`'s bug-0177 block,
// `tests/effectful-statement-host.test.ts`'s bug-0177 block) drives the
// renderer's shipped entry points directly with a synthetic `QueryError`
// object. Neither drives a REAL theta source through the REAL production
// pipeline — discovery, load, slash-dispatch, the `tools:`-routed
// `.theta`-callable return boundary, terminal-`Err` propagation via `?`,
// `emitTopLevelErrNote` — to the note that actually lands in a user's
// session.
//
// SHAPE, mirroring the nearest existing live cell at this exact seam
// (`tests/live/live-production-acceptance.test.ts`'s bug-0187 cell, "H8a-T —
// bug 0187 … through a REAL spawned subagent child, spending zero model
// turns"): a `mode: subagent` kid whose sole statement is a top-level
// `Err(E { kind: I { n: "x" }, message: "m" })` — `I`/`E` an author-declared
// schema pair placing a RECORD, not a string, at the SNK-k `kind` field
// (bug 0177 §Reproduction (c) row 1) — and a `mode: prompt` parent that
// names the kid under `tools:` and whose sole statement is the bare
// `.theta`-callable call with `?`, `b0177kid()?`. Neither fixture issues an
// `@`-query, so — per the bug-0187 cell's own measured header comment — this
// cell spends ZERO MODEL TURNS: `AgentSession.prompt(text)` returns once the
// registered command handler settles, sending nothing to the model unless
// the theta itself calls `pi.sendUserMessage`/`sendMessage` (neither fixture
// does). A prior attempt at a bare top-level `Err(...)` literal with no
// `tools:`/`invoke` at all (no callee, no subagent spawn) produced an
// EMPTY `theta-system-note` slice and an empty settled-entries slice under
// this same harness — this `tools:`-routed shape is the nearest MEASURED
// live-working precedent for a zero-query top-level `Err` this suite has,
// so it is the one this cell mirrors rather than inventing an unproven
// dispatch shape.
//
// A REAL RFC-0006 CHILD PROCESS IS SPAWNED for the `mode: subagent` kid —
// this file's imported `./harness` sets all three `#subagent-child-pins` at
// module scope (`process.argv[1]`, `SUBAGENT_EXTENSION_PIN_ENV`,
// `SUBAGENT_PARENT_PID_ENV = String(process.ppid)`), the same pins every
// other subagent-spawning cell in `live-production-acceptance.test.ts`
// relies on.
//
// THE OBSERVABLE. Read off the settled in-memory `SessionManager` via
// `driveSlashCaptureTurn`'s per-turn `systemNotes` (AGENTS.md "Assert on
// real observables, not on `prompt()` resolving"). Pre-fix, the record at
// `kind` either coerces to `[object Object]` (a plain-prototype record — the
// shape the kid's own construction mints, before any inbound rebuild) or
// throws `TypeError: Cannot convert object to primitive value` (a
// null-prototype record, if one is minted crossing the envelope) — either
// way NOT the compact-JSON note asserted below.
//
// NO SILENT SKIPPING. `requireLiveProvider` fails loudly naming the unmet
// precondition when no live provider/model resolves — this file never
// silently skips.

import { realpathSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  driveSlashCaptureTurn,
  failLoudly,
  plantThetaWorkspace,
  requireLiveProvider,
} from "./harness";

/** The slash-command stem the parent theta registers under. */
const PARENT_STEM = "b0177liveparent";

/** The `.theta`-callable kid's stem (referenced from the parent's `tools:`). */
const KID_STEM = "b0177livekid";

/**
 * The `mode: subagent` kid. `schema I { n: string }` / `schema E { kind: I,
 * message: string }` / `Err(E { kind: I { n: "x" }, message: "m" })` — bug
 * 0177 §Reproduction (c) row 1, re-verified offline (parses with `[]`
 * diagnostics) before this file was added. `kind`'s runtime value is a
 * record, not a string, so `renderLeafKindNote`'s `default:` (SNK-k) arm is
 * the one that renders it — the unlisted-`kind` catch-all row, over a
 * non-string `kind`.
 */
function kidTheta(): string {
  return [
    "---",
    "mode: subagent",
    "---",
    "schema I { n: string }",
    "schema E { kind: I, message: string }",
    'Err(E { kind: I { n: "x" }, message: "m" })',
    "",
  ].join("\n");
}

/**
 * The `mode: prompt` parent: `tools:` names the kid, and the SOLE statement
 * is the bare `.theta`-callable call with `?` — no `let` binding, no `@`
 * query anywhere, mirroring the bug-0187 live cell's own parent shape.
 */
function parentTheta(): string {
  return ["---", "mode: prompt", "tools:", `  - ./${KID_STEM}.theta`, "---", `${KID_STEM}()?`, ""].join(
    "\n",
  );
}

/**
 * The exact SNK-k rendering under bug 0177's chosen law (rule 4: compact JSON)
 * — the note PREFIX, the 0177 subject, unchanged by bug 0349.
 *
 * Post-0349 the `.theta`-callable branch of `runToolCallEffect` cascades a
 * callee-returned `Err` through `InvokeCalleeError` and records a
 * `theta_callable_bare` SLSH-5 hop (bug 0349, tool-calls.md:38), so the landed
 * note GAINS the SLSH-5 chain suffix naming the kid (the §SLSH-5 worked
 * example, slash-invocation.md:59). That suffix carries per-run temp-dir absolute
 * paths, so the full suffixed note is reconstructed in-body from the planted
 * workspace; this const stays the path-free prefix.
 */
const EXPECTED_NOTE = `theta /${PARENT_STEM} returned Err: {"n":"x"} \u2014 m`;

describe("bug 0177 (live) — a record at the SNK-k `kind` field renders as compact JSON at the real slash-dispatch boundary, through a REAL spawned subagent child", () => {
  it("the tools:-routed call's Err propagates through `?` and the slash-dispatch boundary emits the exact compact-JSON SLSH-3 note", async () => {
    const provider = await requireLiveProvider();
    const workspace = plantThetaWorkspace([
      { source: "project", stem: KID_STEM, text: kidTheta() },
      { source: "project", stem: PARENT_STEM, text: parentTheta() },
    ]);
    // The landed note is the 0177 prefix plus the SLSH-5 chain suffix
    // ` from <kidAbs> invoked at <parentAbs>:<line>`. Both paths are the
    // canonicalizePath form the ledger stores: realpath THEN forward-slash
    // (invocation.md:12; bug 0391), so `fwd` drops the join-native separators
    // here — a byte-identical no-op on POSIX.
    // `<line>` is CALL_SITE_LINE — the `${KID_STEM}()?` callee-name token line
    // in the parent (line 1 `---`, 2 `mode: prompt`, 3 `tools:`,
    // 4 `  - ./<kid>.theta`, 5 `---`, 6 the call). Reconstructed here because
    // the temp dir is per-run.
    const CALL_SITE_LINE = 6;
    const fwd = (p: string): string => p.replace(/\\/g, "/");
    const kidAbs = fwd(realpathSync(join(workspace.cwd, ".pi", "theta", `${KID_STEM}.theta`)));
    const parentAbs = fwd(realpathSync(join(workspace.cwd, ".pi", "theta", `${PARENT_STEM}.theta`)));
    const EXPECTED_NOTE_SUFFIXED = `${EXPECTED_NOTE} from ${kidAbs} invoked at ${parentAbs}:${CALL_SITE_LINE}`;
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      if (handle.command(PARENT_STEM) === undefined) {
        failLoudly(
          `live precondition unmet: discovery registered no \`/${PARENT_STEM}\` ` +
            `command (registered: ${JSON.stringify(handle.registeredNames())}). The ` +
            "bug-0177 cell cannot dispatch anything if this precondition is unmet.",
        );
      }

      const turn = await driveSlashCaptureTurn(handle, `/${PARENT_STEM}`);

      // Zero model turns: no `@` anywhere in either fixture.
      expect(
        turn.userTexts,
        "no `@` query appears anywhere in either fixture; userTexts must " +
          "stay empty — observed: " + JSON.stringify(turn.userTexts),
      ).toEqual([]);

      // Pre-fix this either (a) renders `theta /b0177liveparent returned
      // Err: [object Object] — m` (plain-prototype record) or (b) never
      // reaches the note channel at all because the renderer THREW
      // `TypeError: Cannot convert object to primitive value` and the outer
      // catch reclassified the failure as `theta/runtime/internal-error`
      // (`theta /b0177liveparent aborted with internal error: Cannot
      // convert object to primitive value`) — the two measured pre-fix
      // signatures this obligation exists to distinguish from the fixed
      // rendering below.
      expect(
        turn.systemNotes,
        "bug 0177: the SLSH-3 note's PREFIX for a record-valued `kind` field " +
          `must be exactly ${JSON.stringify(EXPECTED_NOTE)} — compact ` +
          "JSON.stringify, not `[object Object]` and not a " +
          "`theta/runtime/internal-error` abort framing from a coercion " +
          "TypeError. Post-0349 the code-call leg wraps the callee-returned " +
          "`Err` (invoke_callee cascade) and records a `theta_callable_bare` " +
          "SLSH-5 hop, so the note carries the chain suffix naming the kid " +
          "(bug 0349, slash-invocation.md:59 §SLSH-5, tool-calls.md:38); the " +
          `full landed note is ${JSON.stringify(EXPECTED_NOTE_SUFFIXED)}. ` +
          "observed systemNotes: " + JSON.stringify(turn.systemNotes),
      ).toEqual([EXPECTED_NOTE_SUFFIXED]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
