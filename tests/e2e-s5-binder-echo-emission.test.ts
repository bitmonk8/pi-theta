// e2e-campaign S5 — binder echo-note emission through the PRODUCTION producer.
//
// CAND-2 pin-down (docs/e2e-campaign/test-plan.md §5): the baseline acceptance
// run observed no `bind_echo` success note (nor a failure note) on `pi -p`
// stdout for a binder off-session pass. This is a deterministic M2 conformance
// test of the SAME production emission surface the acceptance run exercised,
// with the live provider replaced by a scripted binder model:
//
//   ProductionThetaProducer.runBinder()
//     → off-session forced-tool `complete()` (MOCKED here; bug 0011 — the
//       binder call attaches the single `__theta_bind_<slug>` tool and forces
//       `options.toolChoice` to it, binder-inference.md)
//     → extract the envelope from the matching ToolCall's `arguments.envelope`
//       → AJV at the routing step → `ok`
//     → #emitBinderEchoNote()
//       → pi.sendMessage({customType:"theta-system-note", "Running /…"}, {triggerTurn:false})
//
// The existing S5 suite covers the echo RENDERER purely (argument-echo.test.ts,
// binder-system-note-determinism.test.ts) and the binder retry/model helpers,
// but NO test drives the production `runBinder()` with a scripted `ok` binder
// model and observes the actual `pi.sendMessage` delivery on the
// `theta-system-note` channel. This closes REQ-BINDER-21 (ok-arm production echo
// emission) + REQ-BINDER-36 (bind_echo:false suppression) as M2 conformance.
//
// Spec: binder/defaulting-system-note-echo.md §"Echo policy" (BND-1);
// binder/binder-bypass-and-envelope.md §binder-envelope (REQ-BINDER-21);
// binder/determinism-cancellation-failure.md §"Failure-mode templates"
// (REQ-BINDER-38 needs_info row). Method: M2 (production producer, no live model).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The scripted off-session binder reply. `vi.hoisted` so the `vi.mock` factory
// (hoisted above the imports) can close over a mutable holder each test sets.
// `replyFor` scripts the reply as a FUNCTION of the captured call so a ToolCall
// reply can name whatever binder tool production actually attached.
const scripted = vi.hoisted(() => ({
  replyFor: undefined as undefined | ((context: unknown) => unknown),
}));

// Replace ONLY the off-session `complete()` free function; every other pi-ai
// export (types, helpers) passes through unchanged.
vi.mock("@earendil-works/pi-ai/compat", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    complete: vi.fn(async (_model: unknown, context: unknown) =>
      scripted.replyFor?.(context),
    ),
  };
});

import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import {
  binderProducerWithCapture as producerWithCapture,
  noteChannelEntries,
  parse,
  scriptEnvelope,
} from "./helpers/scripted-live-session-harness";
import { ctxDouble } from "./helpers/tool-call-dispatch-harness";

const SYSTEM_NOTE_CHANNEL = "theta-system-note";

// A two-required-string-param theta (forces a genuine binder pass — not a
// no-params or single-string bypass — with NO defaulted fields, so the
// defaults-merge short-circuits without touching the filesystem seam).
const TWO_PARAM_THETA = [
  "---",
  "mode: prompt",
  "bind_model: binder-model",
  "params:",
  "  topic: string",
  "  audience: string",
  "---",
  "@`review ${topic} for ${audience}`",
  "",
].join("\n");

function twoParamTheta(overrides?: { readonly bindEcho?: boolean }): ThetaCompositionInput {
  const doc = parse(TWO_PARAM_THETA, "code-review.theta", "binder");
  const frontmatter =
    overrides?.bindEcho === undefined
      ? doc.frontmatter!
      : ({ ...doc.frontmatter!, bindEcho: overrides.bindEcho } as typeof doc.frontmatter);
  return {
    slashName: "code-review",
    sourcePath: "/theta/code-review.theta",
    frontmatter: frontmatter!,
    body: doc.body,
    binderModel: "binder-model",
  };
}

beforeEach(() => {
  scripted.replyFor = undefined;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("e2e-s5 CAND-2 — binder echo note emission through the production producer", () => {
  it("REQ-BINDER-21 (ok arm): a scripted `ok` binder reply emits the `Running /…` echo note on the theta-system-note channel", async () => {
    // The off-session binder returns a well-formed `ok` envelope.
    scriptEnvelope(scripted, { kind: "ok", args: { topic: "async", audience: "team" } });
    const { deps, notes } = producerWithCapture();

    const result = await deps.runBinder({
      theta: twoParamTheta(),
      args: "the async module for the team",
      ctx: ctxDouble(),
    });

    // The binder bound and the theta will run.
    expect(result.bound, "an `ok` envelope binds and the theta runs").toBe(true);
    expect(result.args).toEqual({ topic: "async", audience: "team" });

    // CAND-2: the production echo note IS emitted on the theta-system-note channel.
    const channelNotes = noteChannelEntries(notes);
    expect(
      channelNotes,
      "exactly one theta-system-note (the success echo) is emitted on the `ok` arm",
    ).toHaveLength(1);
    const echo = channelNotes[0]!;
    expect(echo.customType).toBe(SYSTEM_NOTE_CHANNEL);
    expect(echo.display, "the echo note is display:true").toBe(true);
    expect(echo.content).toBe("Running /code-review: topic=async, audience=team");
  });

  it("REQ-BINDER-36: `bind_echo: false` suppresses the echo note — the binder still binds, no note is emitted", async () => {
    scriptEnvelope(scripted, { kind: "ok", args: { topic: "async", audience: "team" } });
    const { deps, notes } = producerWithCapture();

    const result = await deps.runBinder({
      theta: twoParamTheta({ bindEcho: false }),
      args: "the async module for the team",
      ctx: ctxDouble(),
    });

    expect(result.bound, "the theta still binds with bind_echo:false").toBe(true);
    expect(
      noteChannelEntries(notes),
      "bind_echo:false suppresses the `Running /…` echo note entirely",
    ).toHaveLength(0);
  });

  it("REQ-BINDER-21/38 (needs_info arm): a `needs_info` envelope emits the failure note and does NOT bind", async () => {
    scriptEnvelope(scripted, { kind: "needs_info", message: "which repository?" });
    const { deps, notes } = producerWithCapture();

    const result = await deps.runBinder({
      theta: twoParamTheta(),
      args: "review it",
      ctx: ctxDouble(),
    });

    expect(result.bound, "a needs_info envelope does not bind — the theta does not run").toBe(false);
    const channelNotes = noteChannelEntries(notes);
    expect(channelNotes, "exactly one failure note is emitted").toHaveLength(1);
    // determinism-cancellation-failure.md §"Failure-mode templates" — needs_info
    // row `theta /<name>: argument binding needs more info — <message>` (U+2014).
    expect(channelNotes[0]!.content).toBe(
      "theta /code-review: argument binding needs more info \u2014 which repository?",
    );
    expect(channelNotes[0]!.display).toBe(true);
  });

  it("determinism: a second identical `ok` pass emits a byte-identical echo note", async () => {
    const okEnvelope = { kind: "ok", args: { topic: "async", audience: "team" } };

    scriptEnvelope(scripted, okEnvelope);
    const first = producerWithCapture();
    await first.deps.runBinder({ theta: twoParamTheta(), args: "x", ctx: ctxDouble() });

    scriptEnvelope(scripted, okEnvelope);
    const second = producerWithCapture();
    await second.deps.runBinder({ theta: twoParamTheta(), args: "x", ctx: ctxDouble() });

    expect(noteChannelEntries(first.notes).map((n) => n.content)).toEqual(
      noteChannelEntries(second.notes).map((n) => n.content),
    );
  });
});
