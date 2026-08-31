// H8a live witness — bug 0342: a `.theta` enum value forwarded UP a depth-2
// subagent chain keeps its DECLARING file's identity, live. Bug 0337 keyed the
// invoke-return retag on the IMMEDIATE callee's resolved path
// (`#validateInvokeReturn`, `src/extension/production-theta-producer.ts:4014`);
// across a subagent hop that is wrong, because the PIC-59 envelope
// (`serializeOkEnvelope` = `JSON.stringify`,
// `src/runtime/subagent-envelope.ts:153`) collapses a boxed enum carrier to its
// bare wire string, so a value C declares but B forwards reaches the grandparent
// tagged `<B>#Sev` rather than its declaring `<C>#Sev`
// (`docs/bugs/0342-multi-hop-subagent-chain-attributes-forwarded-enum-to-immediate-callee.md`).
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │ THE ORCHESTRATOR RUNS THIS CELL under a live-provider lock in a later     │
// │ phase. It is NOT run in the tests-first phase, and it is excluded from    │
// │ the default `npm test` gate (it lives under `tests/live/**`,              │
// │ `config/vitest/vitest.live.config.ts`). It spends ONE live turn.          │
// └─────────────────────────────────────────────────────────────────────────┘
//
// TOPOLOGY. The `mode: prompt` parent TOP invokes a `mode: subagent` B
// (`b0342livesubb`) that itself invokes a `mode: subagent` C
// (`b0342livesubc`) and returns a composite `Pair { own: Sev.Low, fwd: <C's
// Sev.Low> }`, so the C→B→TOP forwarding crosses two envelopes — the path the
// declaring key is dropped on. TOP also invokes C directly. The two `==`
// comparisons TOP renders are the observable:
//   - `p.own == p.fwd` — B's OWN Sev.Low vs C's forwarded Sev.Low. They are
//     different declaring files, so this must be `false`. At the fork the double
//     envelope retags both Pair fields with B's path, so it reads `true`.
//   - `p.fwd == direct` — C forwarded through B vs C obtained directly. Same
//     declaration, so this must be `true`. At the fork the forwarded value
//     carries `<B>#Sev` and the direct value `<C>#Sev`, so it reads `false`.
// The fix must flip the rendered segment from `true/false` (fork) to
// `false/true` (expected). The comparisons are `boolean`, so QRY-18's boolean
// row renders them as the literal `true`/`false` — a marker-anchored,
// deterministic segment of `turn.userTexts`, independent of the model's reply.
//
// TASK-FRAMED DISCRIMINATOR, NOT VERBATIM ECHO (AGENTS.md §"Assert on real
// observables", bug 0243): the segment rides a fixed-pair arithmetic prompt
// (`What is 526 plus 142? …`) so a real turn runs; the observable is the
// rendered `RESULT=…|END` marker in `userTexts`, never the model's reply.
//
// TOKENS: one dispatched query in TOP; the B and C callees are pure tail
// expressions (zero turns), mirroring the provider-free depth-2 subagent chain
// in `tests/b0342-forwarded-enum-subagent-chain.test.ts`.
//
// SUBAGENT CHILD PINS (AGENTS.md #subagent-child-pins): `./harness` sets all
// three at module scope — `process.argv[1]` at the repo's pi CLI entry,
// `PI_THETA_SUBAGENT_EXTENSION_PIN` at this tree's `extensions/` (inherited down
// to the grandchild C that B spawns), and the parent-pid carriage that
// authenticates the pin — so importing it pins every spawned child to the build
// under test. This cell adds nothing beyond importing the harness.
//
// NO SILENT SKIPPING: a missing live provider/model fails loudly through
// `requireLiveProvider` (`failLoudly`); nothing here early-returns or skips.
//
// FIXTURE-SHAPE CONSTRAINTS (b0337 Cell 4 / invoke-prompt-cell-enum-return): no
// callee declares `params:`, no body feeds `.keys()` into an `array<T>` sink,
// and each caller uses the explicit `invoke<T>` annotation form.

import { describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  driveSlashCaptureTurn,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";

/** The two-variant declaration every fixture reuses; explicit wire values so the collision is on the tag alone. */
const SEV_DECL = 'enum Sev { Low = "low", High = "high" }';

/** Declaring file C: a `mode: subagent` callee whose tail is a bare `Sev.Low`. Zero turns. */
const SUB_C = ["---", "mode: subagent", "---", SEV_DECL, "Sev.Low", ""].join("\n");

/**
 * Forwarding file B: a `mode: subagent` callee that declares its OWN `Sev` and
 * `Pair`, invokes C, and tails `Pair { own: Sev.Low, fwd: <C's forwarded
 * value> }` — B's own declaration and C's forwarded value side by side. Zero
 * turns.
 */
const SUB_B = [
  "---",
  "mode: subagent",
  "---",
  SEV_DECL,
  "schema Pair { own: Sev, fwd: Sev }",
  'let c = invoke<Sev>("./b0342livesubc.theta")?',
  "Pair { own: Sev.Low, fwd: c }",
  "",
].join("\n");

/**
 * The `mode: prompt` parent TOP: invokes B (the forwarding subagent) and C
 * directly, then renders the two `==` comparisons between markers so the
 * rendered text — not the model's reply — is the observable.
 */
const TOP = [
  "---",
  "mode: prompt",
  "---",
  SEV_DECL,
  "schema Pair { own: Sev, fwd: Sev }",
  'let p = invoke<Pair>("./b0342livesubb.theta")?',
  'let direct = invoke<Sev>("./b0342livesubc.theta")?',
  "@`RESULT=${p.own == p.fwd}/${p.fwd == direct}|END What is 526 plus 142? Answer with the number only.`",
  "",
].join("\n");

/** The fail-closed markers a top-level theta drive lands on the `theta-system-note` channel. */
const FAIL_CLOSED_MARKERS = ["returned Err:", "cancelled", "aborted"] as const;

describe("bug 0342 live: a forwarded enum keeps its declaring file's identity across a depth-2 subagent chain", () => {
  it("the value C declares and B forwards renders `!=` B's own Sev.Low and `==` a direct-from-C value", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      { source: "project", stem: "b0342livesubc", text: SUB_C },
      { source: "project", stem: "b0342livesubb", text: SUB_B },
      { source: "project", stem: "b0342livetop", text: TOP },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition: the parent command must exist before a live turn is
      // driven, so a discovery/parse failure reds with zero tokens.
      expect(
        handle.command("b0342livetop"),
        "no bug-0342 forwarded-enum parent command to invoke — the .theta failed " +
          "discovery/parse. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      const turn = await driveSlashCaptureTurn(handle, "/b0342livetop");
      const outbound = turn.userTexts.join("\n");
      // Marker-anchored extraction of the rendered `${...}` segment — the exact
      // text theta code computed from the two forwarded-enum comparisons (fails
      // loudly when the query never rendered, e.g. an invoke Err'd).
      const anchored = /RESULT=([\s\S]*?)\|END/.exec(outbound);
      expect(
        anchored,
        "the parent query's rendered text (RESULT=…|END) is absent — an invoke did not " +
          "resolve Ok. Outbound user texts: " + JSON.stringify(turn.userTexts) +
          "; system notes: " + JSON.stringify(turn.systemNotes),
      ).not.toBeNull();

      // THE POST-0342 OBSERVABLE. runtime-value-model.md:29 — a forwarded enum
      // keeps its declaring file's identity at every hop, so B's own Sev.Low
      // (`p.own`) and C's forwarded Sev.Low (`p.fwd`) are different declarations
      // (`p.own == p.fwd` → false) while C forwarded through B and C obtained
      // directly are the same declaration (`p.fwd == direct` → true): the
      // segment reads `false/true`. At the fork the double envelope retags both
      // Pair fields with B's path, so it reads `true/false`.
      expect(
        anchored![1],
        "runtime-value-model.md:29 — a forwarded enum keeps its declaring file's identity: " +
          "B's own Sev.Low is `!=` C's forwarded Sev.Low (p.own == p.fwd → false) and C " +
          "forwarded through B is `==` C obtained directly (p.fwd == direct → true). " +
          "Rendered segment: " + JSON.stringify(anchored![1]),
      ).toBe("false/true");

      // No fail-closed ending of the drive (invoke infra errors and Err tails
      // land here — absence is part of the success observable).
      expect(
        turn.systemNotes.filter((note) =>
          FAIL_CLOSED_MARKERS.some((marker) => note.includes(marker)),
        ),
        "bug-0342: the forwarded-enum drive must end clean — a fail-closed theta-system-note " +
          "here means something broke despite a clean load. Notes: " +
          JSON.stringify(turn.systemNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
