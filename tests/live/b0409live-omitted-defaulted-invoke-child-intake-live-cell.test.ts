// H8a (live) — bug 0409: an `invoke(...)` that legally omits a trailing
// DEFAULTED param must recover the declared default at the parent binding site
// (`production-theta-producer.ts:4035`, `#driveCallee`) instead of fabricating
// `null`, so the marshalled `PI_THETA_PARAMS` the child validates carries the
// default (`{"p":"x"}`) rather than `{"p":null}` — which a non-nullable param's
// lowered schema refuses fail-closed at the child's intake
// (`subagent-params.ts` `intakeChildParams`,
// `theta/runtime/subagent-params-validation-failed`).
//
// WHY LIVE, AND WHY THIS SHAPE. The offline witness
// (`tests/b0409-omitted-defaulted-binds-default.test.ts`) drives the two
// producer seams over a FAKE child launcher, capturing the `--system-prompt`
// argv and `PI_THETA_PARAMS` env the parent forges. This cell adds the one
// thing the fake cannot: a REAL subagent child process, spawned through the
// shipped composition root, whose OWN `intakeChildParams` validates the
// marshalled record end to end. Pre-fix the omitted-defaulted invoke dies at
// that real intake and the `?` propagation cascades a fail-closed
// `theta-system-note` to the parent's slash boundary; post-fix the recovered
// default validates, the child runs, and the parent's own turn completes clean.
//
// THE OBSERVABLE. `theta-system-note` entries and assistant text read off the
// settled in-memory `SessionManager` via `driveSlashCaptureTurn` (AGENTS.md
// "Assert on real observables, not on `prompt()` resolving") — never on
// `prompt()` merely resolving. The omitted-arg parent uses `invoke(...)?`, so a
// child-intake refusal surfaces as a NON-EMPTY note channel and a missing
// answer; success leaves the channel empty and lets the parent's task query
// answer. The supplied-arg parent is the byte-identical control (the direction
// no fix may move): it drives clean before and after alike.
//
// DRIVE DISCRIMINATORS ARE ANSWERS TO TASK QUESTIONS, never a verbatim-echo
// demand: current models read "reply with exactly …" as prompt injection and
// refuse it, making the reply a coin flip rather than an observable (bug 0243).
// The child's `118 + 24` and the parents' `341 + 268` are task-framed.
//
// SUBAGENT CHILD PINS: required. The invoked callee is `mode: subagent`, which
// reaches the RFC-0006 child-process launch; `./harness` sets both
// #subagent-child-pins (the real pi CLI entry at `process.argv[1]` and
// `PI_THETA_SUBAGENT_EXTENSION_PIN` at this tree's `extensions/`, with the
// authenticated parent-pid carriage) at module scope, so the child resolves
// the build under test.
//
// Token cost: at most four live turns — each parent drive is one child turn
// (post-fix only) plus one parent turn. The omitted-arg parent's child turn
// does not run pre-fix (the intake refuses before the child spawns).
//
// NO SILENT SKIPPING: a missing live provider/model fails loudly through
// `requireLiveProvider` (`failLoudly`); nothing here early-returns or skips.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  driveSlashCaptureTurn,
  failLoudly,
  plantThetaWorkspace,
  requireLiveProvider,
  type LiveExtensionHandle,
  type LiveWorkspace,
  type PlantedTheta,
} from "./harness";

/**
 * The `mode: subagent` callee both parents name: one declared `params:` field
 * of type `string` carrying a DECLARED DEFAULT `"x"`. Its lowered schema is
 * `{"p":{"type":"string"}}, required: []` — so a marshalled `{"p":null}`
 * (the pre-fix fabrication) is refused at intake while `{"p":"x"}` (the
 * recovered default) validates. A defaulted field routes through the binder
 * arm at the child's OWN drive, but the child is never slash-driven here — only
 * invoked, whose marshalled path bypasses the binder (PIC-60) — so no binder
 * model is consulted.
 */
const CHILD = [
  "---",
  "mode: subagent",
  "params:",
  "  p: 'string = \"x\"'",
  "---",
  "@`What is 118 plus 24? Answer with the number only.`",
  "",
].join("\n");

// The parents' task-question answer: 341 + 268 = 609.
const PARENT_SENTINEL = "609";

/**
 * OMITTED — the reported direction: the trailing defaulted arg is not passed.
 * Pre-fix the parent marshals `{"p":null}`, the child's intake refuses it, and
 * the `?` cascades a fail-closed note; post-fix the recovered default `"x"` is
 * marshalled, the child runs, and the parent's own query answers.
 */
const OMITTED = [
  "---",
  "mode: prompt",
  "---",
  'invoke("./b0409livekid.theta")?',
  "@`What is 341 plus 268? Answer with the number only.`",
  "",
].join("\n");

/**
 * SUPPLIED — the control: byte-identical to OMITTED apart from the explicitly
 * passed argument. It marshals `{"p":"x"}` before and after the fix alike, so
 * it drives clean in both directions — the fence the fix must not move.
 */
const SUPPLIED = [
  "---",
  "mode: prompt",
  "---",
  'invoke("./b0409livekid.theta", "x")?',
  "@`What is 341 plus 268? Answer with the number only.`",
  "",
].join("\n");

/** A plain theta in the same workspace: a broken workspace must not read as a refusal. */
const WORKSPACE_CONTROL = [
  "---",
  "mode: prompt",
  "---",
  "@`What is 483 plus 466? Answer with the number only.`",
  "",
].join("\n");

let workspace: LiveWorkspace;
let handle: LiveExtensionHandle;

beforeAll(async () => {
  const provider = await requireLiveProvider();
  const thetas: PlantedTheta[] = [
    { source: "project", stem: "b0409livectl", text: WORKSPACE_CONTROL },
    { source: "project", stem: "b0409livekid", text: CHILD },
    { source: "project", stem: "b0409liveomit", text: OMITTED },
    { source: "project", stem: "b0409livesup", text: SUPPLIED },
  ];
  workspace = plantThetaWorkspace(thetas);
  handle = await bootShippedExtension({ workspace, provider });
});

afterAll(async () => {
  await handle.dispose();
  workspace.dispose();
});

describe("bug 0409 live: an omitted trailing defaulted `invoke(...)` arg recovers the declared default so the real child intake accepts it", () => {
  it("registration preconditions — the workspace and both parents register, so nothing below measures a broken workspace", () => {
    // The callee `b0409livekid` is INVOKED, not slash-dispatched: its defaulted
    // `params:` field routes it to the binder arm (classifyBinderBypass requires
    // `!hasDefault` for the single-string bypass), so it registers no standalone
    // slash command without a binder model — yet it stays discoverable and
    // invokable, which the two drives below assert directly. Only the
    // slash-dispatched parents and the workspace control are required here.
    for (const stem of ["b0409livectl", "b0409liveomit", "b0409livesup"]) {
      if (handle.command(stem) === undefined) {
        failLoudly(
          `live precondition unmet: discovery registered no \`/${stem}\` command ` +
            `(registered: ${JSON.stringify(handle.registeredNames())}). This cell cannot ` +
            "witness the invoke path if this precondition is unmet.",
        );
      }
    }
  });

  it("SUPPLIED control — the explicit-arg twin drives clean in both directions", async () => {
    const driven = await driveSlashCaptureTurn(handle, "/b0409livesup");
    expect(
      driven.systemNotes,
      "the explicit-arg control appended a theta-system-note — a fail-closed ending, so the " +
        "marshalling/child-intake boundary this cell exercises is broken independent of the " +
        "omitted-default fix. Notes: " + JSON.stringify(driven.systemNotes),
    ).toEqual([]);
    expect(
      driven.text,
      "the explicit-arg control's reply did not answer the parent's task question, so its " +
        "turn did not run to completion and the omitted-arg comparison below has no clean " +
        "baseline. Reply: " + JSON.stringify(driven.text),
    ).toContain(PARENT_SENTINEL);
  });

  it("OMITTED (reported) — the omitted-defaulted invoke recovers the default, the child intake accepts it, and the parent turn completes clean", async () => {
    const driven = await driveSlashCaptureTurn(handle, "/b0409liveomit");
    // Post-fix: the parent recovered the declared default `"x"` and marshalled
    // `{"p":"x"}`, which the child's real intake accepts — no fail-closed note.
    // Pre-fix this channel carries
    // `theta/runtime/subagent-params-validation-failed` (the child refused the
    // fabricated `{"p":null}`), cascaded to the parent by `invoke(...)?`.
    expect(
      driven.systemNotes,
      "the omitted-defaulted invoke appended a theta-system-note: the child's intake refused " +
        "the marshalled params (pre-fix `{\"p\":null}`), and `invoke(...)?` cascaded it fail-" +
        "closed to the parent — a spec-legal call (invocation.md:50 admits the omission) died " +
        "at the child boundary. Notes: " + JSON.stringify(driven.systemNotes),
    ).toEqual([]);
    expect(
      driven.text,
      "the omitted-defaulted parent's reply did not answer its task question, so the `?`-" +
        "propagated invoke did not complete and the parent's own query never ran — the " +
        "recovered default did not reach the child intake. Reply: " + JSON.stringify(driven.text),
    ).toContain(PARENT_SENTINEL);
  });
});
