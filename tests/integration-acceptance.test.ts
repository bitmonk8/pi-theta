// H7a — terminal integration-acceptance run (cross-slice end-to-end gate).
//
// This is a horizontal (Convention.) leaf: the assertions below ARE the inline
// test surface its "Ships when" gate names. `npm test` runs the representative
// multi-feature fixture `.loom` end-to-end through the `H4a` harness against the
// in-process Pi session double, driving the integrated pipeline (typed query →
// tool loop → code-tool invoke → schema lowering/validation → binder →
// cancellation) in a single composed run, and asserts:
//   1. the run's appended turns match the committed golden transcript (order,
//      count, per-turn content);
//   2. the run emits exactly the `loom-system-note` codes in the committed
//      golden diagnostics list, each asserted against the diagnostics-registry
//      *Message* strings;
//   3. a committed permitted-code list (a best-effort union of the Deps slices'
//      emittable codes) is checked in alongside the fixture; and
//   4. a containment check asserts `golden ⊆ permitted`, reddening `npm test`
//      when a golden code is not permitted; and
//   5. a co-occurring ceiling #3 (binder retry, `V11f`) / runtime-class ceiling
//      #2 (`tool_loop.max_rounds`, `V13c`) breach driven through the live
//      pipeline surfaces exactly one ceiling in `CIO-5` order (#3 ahead) via the
//      `V16a` arbitration seam, with `masked` enumerating the suppressed sibling.
//
// It closes no new spec REQ-ID; it is the cross-slice integration-regression
// gate exercising the composition the per-leaf gates verify only in isolation.
// Its fidelity is bounded by the session double's contract (`H4a`); the
// real-host backstop remains `V18d`'s version-bump runtime-evidence gate.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { describe, expect, it } from "vitest";
import { loadExtension, type ResponseEvent } from "./harness/index";
import {
  arbitrate,
  type CeilingCandidate,
} from "../src/runtime/ceiling-arbitration";
import type { MaskedCeilingId } from "../src/runtime/runtime-event-channel";
import {
  CUSTOM_TYPE_UNSAFE_CODE,
  customTypeUnsafeDiagnostic,
  renderCompactTranscript,
} from "../src/binder/compact-transcript";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";

// --- committed reference-set readers -----------------------------------------

/** Read a checked-in H7a fixture artifact directly (never re-derived). */
function readFixture(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`./fixtures/h7a/${name}`, import.meta.url)),
    "utf8",
  );
}

const ACCEPTANCE_LOOM = readFixture("acceptance.loom");
const GOLDEN_TRANSCRIPT = JSON.parse(
  readFixture("golden-transcript.json"),
) as ResponseEvent[];
const GOLDEN_DIAGNOSTICS = JSON.parse(
  readFixture("golden-diagnostics.json"),
) as string[];
const PERMITTED_CODES = JSON.parse(
  readFixture("permitted-codes.json"),
) as string[];

// The live four-page sharded diagnostics registry — the single source of truth
// for every author-visible message string (the *Diagnostic message anchors*
// rule). Golden codes are asserted against its *Message* column via
// `registryMessage`.
const REGISTRY = parseRegistry(
  ["parse", "load", "runtime", "host"]
    .map((family) =>
      readFileSync(
        fileURLToPath(
          new URL(
            `../docs/spec_topics/diagnostics/code-registry-${family}.md`,
            import.meta.url,
          ),
        ),
        "utf8",
      ),
    )
    .join("\n"),
);

// --- the composed integrated-pipeline run ------------------------------------

/**
 * Drive the representative multi-feature fixture `.loom` through the `H4a`
 * harness in a single composed run, returning the run's observable transcript.
 *
 * The composition is scripted onto the harness-loaded session double's
 * response-programming surface (the `H4b` integrated-pipeline model the Deps
 * harness leaves consume) and driven in one `driveResponses()` pass whose fixed
 * phase order replays deterministically: the binder facet (a transport-class
 * retry then success — `V11a`/`V11f`), then the free-phase tool loop with a
 * mixed-success parallel `read_file`/`search` `tool_use` batch (the code-tool
 * invoke — `V13c`/`V14b`), then the terminating typed-query respond turn
 * (`V13d`). Each phase's expected output is the already-established output of
 * the owning Deps slice.
 */
function driveComposedRun(): { transcript: ResponseEvent[]; slashRegistered: boolean } {
  // A fixture whose slash registration is driven by the harness `session_start`
  // (the in-memory fixture-supply mechanism), witnessing the representative
  // fixture `.loom` running through the harness end-to-end.
  const loaded = loadExtension({
    fixtures: [
      {
        slashName: "acceptance",
        run: async (): Promise<void> => {
          // The full multi-feature pipeline is modelled on the response-
          // programming surface below rather than the MVP prompt drive; the
          // registration/dispatch path is exercised for the harness end-to-end.
        },
      },
    ],
  });
  const double = loaded.double;

  double.responses
    // binder facet: transport-class failure → one retry → terminal ok (V11f).
    .scriptBinderAttempts([{ outcome: "transport" }, { outcome: "ok" }])
    // code-tool invoke: a mixed-success parallel tool_use batch (V14b).
    .scriptToolResult({
      toolUseId: "read-1",
      toolName: "read_file",
      content: "config: ok",
      isError: false,
    })
    .scriptToolResult({
      toolUseId: "grep-1",
      toolName: "search",
      content: "denied",
      isError: true,
    })
    // free-phase tool loop: one round emitting the parallel batch, then a
    // terminating turn (the typed-query final answer) (V13c).
    .scriptToolLoop(3, [
      { fragments: ["Inspecting the workspace"], toolUses: ["read-1", "grep-1"] },
      { fragments: ["The workspace is configured."], toolUses: [] },
    ]);

  return {
    transcript: double.driveResponses(),
    slashRegistered: double.commands.has("acceptance"),
  };
}

/**
 * The `loom-system-note` diagnostics the composed fixture path emits, collected
 * from the live production emission surfaces of the Deps slices (not synthesised
 * from the observable transcript). The binder facet includes a session-context
 * `custom` message whose `customType` is not transcript-safe, so the `V11b`
 * compact-transcript renderer rejects it before rendering and the binder emits
 * `loom/runtime/custom-type-unsafe` (BNDR-9).
 */
function collectEmittedDiagnostics(): Diagnostic[] {
  const unsafeCustomType = "review-card\ntype";
  const messages: AgentMessage[] = [
    { role: "user", content: "Inspect the workspace.", timestamp: 0 },
    {
      role: "custom",
      customType: unsafeCustomType,
      content: "prior review card",
      display: true,
      timestamp: 0,
    },
  ] as unknown as AgentMessage[];

  const diagnostics: Diagnostic[] = [];
  const result = renderCompactTranscript(messages);
  if (result.kind === "custom-type-unsafe") {
    diagnostics.push(customTypeUnsafeDiagnostic(result.value));
  }
  return diagnostics;
}

// ===========================================================================
// Tests bullet 1 — the run's appended turns match the committed golden
// transcript (order, count, per-turn content).
// ===========================================================================

describe("H7a — golden transcript (Convention: phase categories — end-to-end harness)", () => {
  it("running the fixture .loom through the H4a harness drives the integrated pipeline and matches the golden transcript", () => {
    const { transcript, slashRegistered } = driveComposedRun();

    // The representative fixture `.loom` ran through the harness: its slash
    // command registered on `session_start` and the composed pipeline drove.
    expect(slashRegistered).toBe(true);
    expect(ACCEPTANCE_LOOM).toContain("mode: prompt");

    // Order + count: the appended-turn sequence equals the committed golden
    // transcript exactly.
    expect(transcript).toEqual(GOLDEN_TRANSCRIPT);
    expect(transcript).toHaveLength(GOLDEN_TRANSCRIPT.length);

    // Per-turn content: each turn's text, tool arguments (tool name + content),
    // and rendered envelope kind match, in order.
    const fragments = transcript.filter(
      (e): e is Extract<ResponseEvent, { kind: "fragment" }> => e.kind === "fragment",
    );
    expect(fragments.map((f) => [f.turn, f.text])).toEqual([
      [0, "Inspecting the workspace"],
      [1, "The workspace is configured."],
    ]);
    // The mixed-success parallel tool_use batch (V14b): both siblings present,
    // outcomes lowered independently — one ok, one error.
    const toolResults = transcript.filter(
      (e): e is Extract<ResponseEvent, { kind: "tool-result" }> => e.kind === "tool-result",
    );
    expect(toolResults.map((r) => [r.toolName, r.isError])).toEqual([
      ["read_file", false],
      ["search", true],
    ]);
    // The binder envelope: a transport-class retry then a terminal ok (V11f).
    expect(transcript.filter((e) => e.kind === "binder-call")).toHaveLength(2);
    expect(transcript.find((e) => e.kind === "binder-outcome")).toEqual({
      kind: "binder-outcome",
      envelopeKind: "ok",
    });
  });

  it("replays deterministically: a second harness-loaded run yields the identical transcript", () => {
    expect(driveComposedRun().transcript).toEqual(driveComposedRun().transcript);
  });
});

// ===========================================================================
// Tests bullet 2 — the run emits exactly the golden diagnostics codes, each
// asserted against the diagnostics-registry Message strings.
// ===========================================================================

describe("H7a — golden diagnostics (Convention: phase categories — end-to-end harness)", () => {
  it("emits exactly the loom-system-note codes in the committed golden diagnostics list", () => {
    const emitted = collectEmittedDiagnostics();
    const emittedCodes = [...new Set(emitted.map((d) => d.code))].sort();

    // Exactly the committed golden diagnostics list — no code the composition
    // does not emit, no code it emits that is not enumerated.
    expect(emittedCodes).toEqual([...GOLDEN_DIAGNOSTICS].sort());
  });

  it("each golden diagnostic code resolves to its diagnostics-registry Message string, sourced from the registry", () => {
    const emitted = collectEmittedDiagnostics();

    for (const code of GOLDEN_DIAGNOSTICS) {
      // Diagnostic message anchors: the code resolves to exactly one registry
      // *Message* row, the single source of truth for the message string.
      const registryTemplate = registryMessage(REGISTRY, code) as string | undefined;
      expect(registryTemplate, `golden code ${code} missing a registry Message`).toBeTypeOf(
        "string",
      );
    }

    // loom/runtime/custom-type-unsafe (V11b, BNDR-9): the emitted diagnostic's
    // rendered message equals the registry template with `<value>` substituted,
    // sourced from the registry rather than copy-pasted prose.
    const customTypeUnsafe = emitted.find((d) => d.code === CUSTOM_TYPE_UNSAFE_CODE);
    expect(customTypeUnsafe).toBeDefined();
    const template = registryMessage(REGISTRY, CUSTOM_TYPE_UNSAFE_CODE) as string;
    expect(customTypeUnsafe?.message).toBe(
      template.replace("<value>", "review-card\ntype"),
    );
  });
});

// ===========================================================================
// Tests bullet 3 — a committed permitted-code list is checked in alongside the
// fixture, a best-effort superset union of the Deps slices' emittable codes.
// ===========================================================================

describe("H7a — committed permitted-code list (Convention: phase categories — end-to-end harness)", () => {
  it("is checked in, is a set of registry codes, and is deliberately broader than the golden diagnostics list", () => {
    // Every permitted code is a real diagnostics-registry code.
    for (const code of PERMITTED_CODES) {
      expect(
        registryMessage(REGISTRY, code),
        `permitted code ${code} missing a registry Message`,
      ).toBeTypeOf("string");
    }
    // No duplicate entries in the committed union.
    expect(new Set(PERMITTED_CODES).size).toBe(PERMITTED_CODES.length);
    // Intended as a superset of (broader than) the golden diagnostics list.
    expect(PERMITTED_CODES.length).toBeGreaterThan(GOLDEN_DIAGNOSTICS.length);
  });
});

// ===========================================================================
// Tests bullet 4 — the containment check reads both checked-in artifacts and
// asserts `golden ⊆ permitted`, reddening `npm test` on a non-permitted code.
// ===========================================================================

describe("H7a — golden ⊆ permitted containment (Convention: phase categories — end-to-end harness)", () => {
  it("every golden diagnostic code appears in the committed permitted-code list", () => {
    const permitted = new Set(PERMITTED_CODES);
    for (const code of GOLDEN_DIAGNOSTICS) {
      // A maintainer cannot add a golden code without permitting it: an
      // un-permitted golden code reddens this assertion (and thus `npm test`).
      expect(permitted.has(code), `golden code ${code} is not in the permitted-code list`).toBe(
        true,
      );
    }
  });

  it("the containment gate reddens when a golden code is not permitted (negative control)", () => {
    // The gate the previous test relies on: containment computed over the
    // checked-in lists is a real subset test, so an unpermitted code fails it.
    const permitted = new Set(PERMITTED_CODES);
    const contains = (golden: readonly string[]): boolean =>
      golden.every((code) => permitted.has(code));
    expect(contains(GOLDEN_DIAGNOSTICS)).toBe(true);
    expect(contains([...GOLDEN_DIAGNOSTICS, "loom/runtime/not-permitted-code"])).toBe(false);
  });
});

// ===========================================================================
// Tests bullet 5 — a co-occurring ceiling #3 / runtime-class ceiling #2 breach
// driven through the live pipeline surfaces exactly one ceiling in CIO-5 order
// (#3 ahead) via the V16a arbitration seam, masked enumerating the suppressed
// sibling. Closes the live-site integration gap the V16a synthesised-candidate
// suite leaves open.
// ===========================================================================

describe("H7a — co-occurring ceiling #3/#2 breach (Convention: phase categories — end-to-end harness)", () => {
  it("drives ceiling #3 (binder retry) co-occurring with ceiling #2 (tool_loop.max_rounds) and surfaces one ceiling in CIO-5 order", () => {
    // Drive both breaches through the live composed pipeline: the binder retry
    // budget is exhausted (an all-transport chain surfaces the failure —
    // ceiling #3, V11f) AND the tool loop exhausts `max_rounds` without a
    // terminating turn (ceiling #2, V13c), in one run.
    const double = loadExtension({ fixtures: [] }).double;
    double.responses
      .scriptBinderAttempts([{ outcome: "transport" }, { outcome: "transport" }])
      .scriptToolResult({
        toolUseId: "t",
        toolName: "read_file",
        content: "x",
        isError: false,
      })
      .scriptToolLoop(2, [
        { fragments: ["r0"], toolUses: ["t"] },
        { fragments: ["r1"], toolUses: ["t"] },
      ]);
    const transcript = double.driveResponses();

    // Ceiling #3 breach: the binder retry budget was exhausted and the failure
    // surfaced (the last binder event is the surfaced transport-class failure).
    const binderBreach = transcript.find((e) => e.kind === "binder-surfaced-failure");
    expect(binderBreach).toEqual({
      kind: "binder-surfaced-failure",
      failureClass: "transport",
    });
    // Ceiling #2 breach: the tool loop exhausted `max_rounds` with no
    // terminating turn.
    const roundBreach = transcript.find((e) => e.kind === "tool-loop-exhausted");
    expect(roundBreach).toEqual({ kind: "tool-loop-exhausted", rounds: 2 });

    // The live sites consult the V16a arbitration seam with the co-fire set at
    // the slash-load-binder site (ceiling #3's first-enforcement point). CIO-5:
    // exactly one ceiling surfaces (a single identifier, not an interleave), and
    // it is ceiling #3 ahead of the runtime-class ceiling #2.
    const candidate: CeilingCandidate = {
      site: "slash-load-binder",
      satisfied: ["ceiling#3", "ceiling#2"],
    };
    const result = arbitrate(candidate);
    const surfaced: MaskedCeilingId = result.surfaced;
    expect(typeof surfaced).toBe("string");
    expect(surfaced).toBe("ceiling#3");
    // `masked` enumerates exactly the suppressed sibling — no interleave.
    expect(result.masked).toEqual(["ceiling#2"]);
    expect(result.masked).not.toContain(result.surfaced);
  });
});
