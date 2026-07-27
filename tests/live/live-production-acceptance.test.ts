// H8a-T — live production end-to-end acceptance (tests).
//
// An OPT-IN live-host acceptance suite, excluded from the default `npm test`
// and invoked by the dedicated `npm run test:live` runner (see
// `config/vitest/vitest.live.config.ts`). It loads the SHIPPED extension through its real
// `extensions/index.ts` entry (not the `H4a` in-memory fixture-supply),
// discovers a real `.theta` from a real on-disk discovery source, and drives it
// against a LIVE provider/model. It closes no new spec REQ-ID; it verifies the
// live composition the double-backed gates (`H4a`, `H7a`, `V18d`) never
// exercise and the manual real-host smoke covers only by hand.
//
// INTENDED-REASON RED (current state): the shipped production composition root
// (`src/extension/factory.ts` default export) supplies `fixtures: []` and runs
// no discovery walk, so no `.theta`-derived slash command is ever registered by
// the shipped extension. Each test below therefore reds on the MISSING COMMAND
// (or the absent turn that follows), not on a credential, network, setup, or
// harness throw — the discovery→registration precondition is asserted BEFORE any
// live model turn is driven, so the red state spends no tokens. The paired `H8a`
// implementation wires the production composition root and turns these green.
//
// Convention: conventions.md (phase categories — end-to-end harness; the
// live-host acceptance pair exception). Narrative spec references:
// extension-bootstrap-and-per-theta.md, registration-steps.md, discovery.md.

import { describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  driveSlashCaptureText,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";
import {
  AjvSchemaValidator,
  type LoweredSchema,
} from "../../src/seams/schema-validator";

/** A minimal prompt-mode `.theta` whose single untyped query names a deterministic sentinel. */
function promptTheta(sentinel: string): string {
  return [
    "---",
    "mode: prompt",
    "---",
    "@`Reply with exactly the token " + sentinel + " and nothing else.`",
    "",
  ].join("\n");
}

/**
 * A schema-typed `@`-query theta that echoes its validated value behind a
 * committed sentinel. Bug 0010: the typed forced respond turn is dispatched
 * off-session (pi-ai `complete()` with forced toolChoice) and never streams
 * into the transcript, so the pre-0010 whole-stream `JSON.parse` observation
 * channel is dead — the streamed deltas now carry only free-phase text. The
 * fixture therefore surfaces the AJV-validated value itself: the final untyped
 * query interpolates `answer` (QRY-18 compact JSON) behind the sentinel, and
 * the capture extracts the JSON after the sentinel. The sentinel can only
 * render if the typed binding resolved Ok (past AJV and past `?`).
 */
export const LIVE_TYPED_SENTINEL = "LIVE TYPED RESULT";

function typedQueryTheta(): string {
  return [
    "---",
    "mode: prompt",
    "---",
    "let answer: { ok: boolean, label: string } = @`Return an object describing whether the sky is blue.`?",
    "@`Reply with exactly this text and nothing else, no markdown, no code fences: " +
      LIVE_TYPED_SENTINEL +
      " ${answer}`?",
    "",
  ].join("\n");
}

/**
 * Extract the first balanced JSON object after the sentinel in a streamed
 * transcript (bug 0010: free-phase turns stream arbitrary text — possibly
 * containing brace pairs — so only the sentinel-anchored echo is trusted).
 */
function jsonAfterSentinel(transcript: string): unknown {
  const at = transcript.lastIndexOf(LIVE_TYPED_SENTINEL);
  if (at < 0) {
    throw new Error(
      `live typed capture: sentinel "${LIVE_TYPED_SENTINEL}" absent from the ` +
        `streamed transcript — the echo turn did not run (typed binding failed?). ` +
        `transcript: ${transcript}`,
    );
  }
  const rest = transcript.slice(at + LIVE_TYPED_SENTINEL.length);
  const start = rest.indexOf("{");
  if (start < 0) {
    throw new Error(
      `live typed capture: no JSON object after the sentinel. transcript: ${transcript}`,
    );
  }
  let depth = 0;
  for (let i = start; i < rest.length; i += 1) {
    const ch = rest[i];
    if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(rest.slice(start, i + 1));
      }
    }
  }
  throw new Error(
    `live typed capture: unbalanced JSON after the sentinel. transcript: ${transcript}`,
  );
}

/** A subagent-mode `.theta` whose one untyped query drives a private spawned session to completion. */
function subagentTheta(): string {
  return [
    "---",
    "mode: subagent",
    "---",
    "@`Reply with a short one-line greeting.`",
    "",
  ].join("\n");
}

/** The JSON-Schema the typed reply must structurally validate against (declared-schema lowering). */
const TYPED_REPLY_SCHEMA: LoweredSchema = {
  type: "object",
  properties: {
    ok: { type: "boolean" },
    label: { type: "string" },
  },
  required: ["ok", "label"],
  additionalProperties: false,
};

// ===========================================================================
// Tests bullet 1 — discovery → registration (Convention: live-host acceptance).
// A `.theta` written under the project discovery source `<cwd>/.pi/theta/`
// registers a live slash command named for its filename stem, exercising the
// real V10a walk over the real V8b PiFileSystem and the V9b `session_start` →
// `pi.registerCommand` step. Reds today: the shipped default export registers
// no discovered command.
// ===========================================================================

describe("H8a-T — discovery → registration (Convention: live-host acceptance)", () => {
  it("registers a live slash command for a project-source .theta via the real discovery walk", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      { source: "project", stem: "greetlive", text: promptTheta("THETA-LIVE-OK") },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // The shipped extension, loaded through its real entry, discovered the
      // on-disk `.theta` and registered a slash command named for its stem.
      expect(
        handle.command("greetlive"),
        "no .theta-derived slash command registered — the shipped production " +
          "composition root supplies no discovered fixtures (fixtures: []) and " +
          "runs no discovery walk. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Tests bullet 2 — prompt-mode turn against a live model (Convention:
// live-host acceptance). Invoking the registered command drives exactly one
// real prompt-mode turn against a live provider/model and the assistant
// response contains the fixture's deterministic sentinel — M's prompt-mode
// drive against a real model. Reds today: no command exists to invoke.
// ===========================================================================

describe("H8a-T — prompt-mode turn against a live model (Convention: live-host acceptance)", () => {
  it("drives one live prompt-mode turn whose assistant response contains the deterministic sentinel", async () => {
    const provider = await requireLiveProvider();
    const sentinel = "THETA-LIVE-OK";
    const workspace = plantThetaWorkspace([
      { source: "project", stem: "sentinel", text: promptTheta(sentinel) },
    ]);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition (the intended-reason red): the command must exist before a
      // live turn is driven, so the red spends no tokens.
      expect(
        handle.command("sentinel"),
        "no command to invoke — shipped composition root registers no discovered theta. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // Post-H8a: one real prompt-mode turn against the live model; the
      // streamed assistant response carries the sentinel.
      const response = await driveSlashCaptureText(handle.session, "/sentinel");
      expect(response).toContain(sentinel);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Tests bullet 3 — alternate discovery source (Convention: live-host
// acceptance). A `.theta` discovered via a second real source — the `--theta
// <dir>` CLI source (V10a/V10c over PiFileSystem) — also registers a live slash
// command, proving discovery is source-general, not wired to a single
// hardcoded path. Reds today: no discovered command from any source.
// ===========================================================================

describe("H8a-T — alternate discovery source (Convention: live-host acceptance)", () => {
  it("registers a live slash command for a --theta CLI-source .theta (discovery is source-general)", async () => {
    const provider = await requireLiveProvider();
    const workspace = plantThetaWorkspace([
      { source: "cli", stem: "clisource", text: promptTheta("THETA-CLI-OK") },
    ]);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("clisource"),
        "no .theta-derived command from the --theta CLI source — the shipped " +
          "composition root walks no discovery source. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Tests bullet 4 — typed-query lowering, bounded (Convention: live-host
// acceptance). A single small schema-typed `@`-query resolves through the real
// binder-model resolver (V11a) and a live structured-output model and yields a
// value that validates against its declared schema (V5d schema
// lowering/validation — structural validity, not exact content). Reds today:
// no command exists to invoke.
// ===========================================================================

describe("H8a-T — typed-query lowering, bounded (Convention: live-host acceptance)", () => {
  it("resolves one schema-typed @-query through the live binder and validates the reply against its declared schema", async () => {
    const provider = await requireLiveProvider();
    const workspace = plantThetaWorkspace([
      { source: "project", stem: "typed", text: typedQueryTheta() },
    ]);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition (the intended-reason red): the typed-query command must
      // exist before the live structured-output turn is driven.
      expect(
        handle.command("typed"),
        "no typed-query command to invoke — shipped composition root registers " +
          "no discovered theta. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // Post-H8a: drive the typed query against a live structured-output model;
      // the binder-resolved reply must be STRUCTURALLY valid against the
      // declared, lowered schema (V5d) — not an exact-content match.
      const reply = await driveSlashCaptureText(handle.session, "/typed");
      // Bug 0010: the validated value arrives via the fixture's sentinel echo,
      // not as a streamed raw-JSON respond turn (that channel no longer exists).
      const value: unknown = jsonAfterSentinel(reply);
      const validator = new AjvSchemaValidator({
        emit: () => undefined,
        slugOf: (schema) => {
          const canonicalBytes = JSON.stringify(schema);
          return { slug: canonicalBytes, canonicalBytes };
        },
      });
      const outcome = validator.compile(TYPED_REPLY_SCHEMA).validate(value);
      expect(
        outcome.ok,
        outcome.ok ? "" : "typed reply failed schema validation: " + JSON.stringify(outcome.errors),
      ).toBe(true);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Tests bullet 5 — subagent-mode drive to a success terminal (Convention:
// live-host acceptance). A `mode: subagent` theta spawns an isolated
// AgentSession, drives one real turn to completion, and reaches a success
// terminal outcome — the path the H8a production driver previously made
// unreachable by self-cancelling every subagent query. The fixed driver wires
// V9i's `awaitTerminalAgentEnd` + `extractSubagentQueryResult`, so the
// invocation resolves cleanly rather than forcing `Err(cancelled)`.
// ===========================================================================

describe("H8a-T — subagent-mode drive against a live model (Convention: live-host acceptance)", () => {
  it("drives a subagent-mode theta's spawned session to a success terminal without a forced cancel", async () => {
    const provider = await requireLiveProvider();
    const workspace = plantThetaWorkspace([
      { source: "project", stem: "subrun", text: subagentTheta() },
    ]);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("subrun"),
        "no subagent-mode command to invoke — shipped composition root registers " +
          "no discovered theta. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed subagent driver spawns, drives the private session to its
      // terminal `agent_end`, extracts the result, and tears the session down;
      // the invocation resolves cleanly (no forced mid-stream cancel). The
      // spawned session is private, so no user-session assistant text streams —
      // the observable here is a clean drive-to-completion, not stdout content.
      await expect(driveSlashCaptureText(handle.session, "/subrun")).resolves.toBeDefined();
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
