// H8a-T — live production end-to-end acceptance (tests).
//
// An OPT-IN live-host acceptance suite, excluded from the default `npm test`
// and invoked by the dedicated `npm run test:live` runner (see
// `vitest.live.config.ts`). It loads the SHIPPED extension through its real
// `extensions/index.ts` entry (not the `H4a` in-memory fixture-supply),
// discovers a real `.loom` from a real on-disk discovery source, and drives it
// against a LIVE provider/model. It closes no new spec REQ-ID; it verifies the
// live composition the double-backed gates (`H4a`, `H7a`, `V18d`) never
// exercise and the manual real-host smoke covers only by hand.
//
// INTENDED-REASON RED (current state): the shipped production composition root
// (`src/extension/factory.ts` default export) supplies `fixtures: []` and runs
// no discovery walk, so no `.loom`-derived slash command is ever registered by
// the shipped extension. Each test below therefore reds on the MISSING COMMAND
// (or the absent turn that follows), not on a credential, network, setup, or
// harness throw — the discovery→registration precondition is asserted BEFORE any
// live model turn is driven, so the red state spends no tokens. The paired `H8a`
// implementation wires the production composition root and turns these green.
//
// Convention: conventions.md (phase categories — end-to-end harness; the
// live-host acceptance pair exception). Narrative spec references:
// extension-bootstrap-and-per-loom.md, registration-steps.md, discovery.md.

import { describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  driveSlashCaptureText,
  plantLoomWorkspace,
  requireLiveProvider,
  type PlantedLoom,
} from "./harness";
import {
  AjvSchemaValidator,
  type LoweredSchema,
} from "../../src/seams/schema-validator";

/** A minimal prompt-mode `.loom` whose single untyped query names a deterministic sentinel. */
function promptLoom(sentinel: string): string {
  return [
    "---",
    "mode: prompt",
    "---",
    "@`Reply with exactly the token " + sentinel + " and nothing else.`",
    "",
  ].join("\n");
}

/** A schema-typed `@`-query loom: a single small object schema lowered and validated (V5d). */
function typedQueryLoom(): string {
  return [
    "---",
    "mode: prompt",
    "---",
    "let answer: { ok: bool, label: string } = @`Return an object describing whether the sky is blue.`",
    "@`${answer.label}`",
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
// A `.loom` written under the project discovery source `<cwd>/.pi/looms/`
// registers a live slash command named for its filename stem, exercising the
// real V10a walk over the real V8b PiFileSystem and the V9b `session_start` →
// `pi.registerCommand` step. Reds today: the shipped default export registers
// no discovered command.
// ===========================================================================

describe("H8a-T — discovery → registration (Convention: live-host acceptance)", () => {
  it("registers a live slash command for a project-source .loom via the real discovery walk", async () => {
    const provider = requireLiveProvider();
    const looms: PlantedLoom[] = [
      { source: "project", stem: "greetlive", text: promptLoom("LOOM-LIVE-OK") },
    ];
    const workspace = plantLoomWorkspace(looms);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // The shipped extension, loaded through its real entry, discovered the
      // on-disk `.loom` and registered a slash command named for its stem.
      expect(
        handle.command("greetlive"),
        "no .loom-derived slash command registered — the shipped production " +
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
    const provider = requireLiveProvider();
    const sentinel = "LOOM-LIVE-OK";
    const workspace = plantLoomWorkspace([
      { source: "project", stem: "sentinel", text: promptLoom(sentinel) },
    ]);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition (the intended-reason red): the command must exist before a
      // live turn is driven, so the red spends no tokens.
      expect(
        handle.command("sentinel"),
        "no command to invoke — shipped composition root registers no discovered loom. Registered: " +
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
// acceptance). A `.loom` discovered via a second real source — the `--loom
// <dir>` CLI source (V10a/V10c over PiFileSystem) — also registers a live slash
// command, proving discovery is source-general, not wired to a single
// hardcoded path. Reds today: no discovered command from any source.
// ===========================================================================

describe("H8a-T — alternate discovery source (Convention: live-host acceptance)", () => {
  it("registers a live slash command for a --loom CLI-source .loom (discovery is source-general)", async () => {
    const provider = requireLiveProvider();
    const workspace = plantLoomWorkspace([
      { source: "cli", stem: "clisource", text: promptLoom("LOOM-CLI-OK") },
    ]);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("clisource"),
        "no .loom-derived command from the --loom CLI source — the shipped " +
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
    const provider = requireLiveProvider();
    const workspace = plantLoomWorkspace([
      { source: "project", stem: "typed", text: typedQueryLoom() },
    ]);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition (the intended-reason red): the typed-query command must
      // exist before the live structured-output turn is driven.
      expect(
        handle.command("typed"),
        "no typed-query command to invoke — shipped composition root registers " +
          "no discovered loom. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // Post-H8a: drive the typed query against a live structured-output model;
      // the binder-resolved reply must be STRUCTURALLY valid against the
      // declared, lowered schema (V5d) — not an exact-content match.
      const reply = await driveSlashCaptureText(handle.session, "/typed");
      const value: unknown = JSON.parse(reply);
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
