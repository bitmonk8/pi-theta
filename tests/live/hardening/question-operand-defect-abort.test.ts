// Hardening lens: BUG-0019 DEFECT-GUARD ABORT FRAMING AT THE TOP-LEVEL SLASH
// (the fabricated-cancellation removal, end-to-end on the live axis).
//
// Bug 0019 (docs/bugs/0019-question-operand-bypasses-result-normalisation.md):
// `?` on a member operand whose inferred type is a `named` placeholder escapes
// the ERR-18 static gate (theta/parse/question-on-non-result), and pre-fix the
// blind `as ResultValue` cast in `evalTry` read `.ok` off the plain object —
// forging `Err(undefined)`, which `binding.surface`'s
// `execution.error ?? makeCancelledError()` laundered into a FABRICATED
// cancellation: the operator-facing `theta-system-note` said
// "theta /<name> cancelled" for a theta nobody cancelled (the exact STL-6
// violation the mapper's own comment forbids).
//
// FIXED CONTRACT pinned here END-TO-END through the shipped extension + real
// slash dispatch: `evalTry`'s brand guard throws `QuestionOperandDefectError`,
// the top-level slash catch (theta-composition-producer.ts runtime-defect
// surface) frames it via `surfaceUnexpectedThrow` as EXACTLY ONE
// `theta /<name> aborted with internal error: <detail>` note on the
// `theta-system-note` channel — the detail carries the offline message
// contract (names "ERR-18" and the parse gate code) — and NO
// `theta /<name> cancelled` note is emitted. The offline twin
// (tests/question-operand-defect.test.ts) pins the executeBody rejection and
// the message contract; this probe pins the live framing + channel.
//
// Method: plant the bug doc's m1 member fixture (a PURE body — the abort fires
// at `let v = o.r?`, before any query could dispatch, so the drive spends no
// model tokens beyond the envelope; the panic note itself is delivered with
// `triggerTurn: false`) and drive it as a real top-level slash invocation.
// All assertions read deterministic channels: `registeredNames` (the load
// precondition — "it registered" proves the partial static gate did not fire,
// which is exactly why the runtime guard is load-bearing) and the per-turn
// `systemNotes` (the settled in-memory SessionManager, per the harness
// header). Nothing here depends on the model's reply.

import { describe, it, expect } from "vitest";
import { requireLiveProvider, runProbe, turnAt } from "./probe-harness";
import type { PlantedFile } from "./probe-harness";

const provider = requireLiveProvider();

const F = (path: string, lines: string[]): PlantedFile => ({
  source: "project",
  path,
  text: lines.join("\n"),
});

describe("bug 0019 — `?` on a non-Result member operand aborts loudly at the top-level slash (never a fabricated cancellation)", () => {
  it(
    "BUG-0019 FIXED: the m1 drive lands ONE 'aborted with internal error' note naming the ERR-18 gate, and NO 'cancelled' note",
    { timeout: 120000 },
    async () => {
      const probe = await runProbe({
        provider,
        files: [
          F("bug0019m1.theta", [
            "---",
            "description: bug 0019 m1 member operand",
            "mode: prompt",
            "---",
            "schema Inner { a: number }",
            "schema Outer { r: Inner }",
            "let o = Outer { r: Inner { a: 1 } }",
            "let v = o.r?",
            "v",
          ]),
        ],
        drives: ["/bug0019m1"],
      });
      try {
        const t = turnAt(probe);
        console.log("BUG-0019 systemNotes:", JSON.stringify(t.systemNotes));
        console.log("BUG-0019 userTexts:", JSON.stringify(t.userTexts));
        console.log("BUG-0019 error:", t.error);
        // Load precondition (zero tokens): the fixture REGISTERED — the member
        // operand infers as a `named` placeholder, so the ERR-18 static gate
        // (even after the bug-0019 union/object widening) does not reject it
        // at load; the runtime brand guard is what must catch it.
        expect(probe.registeredNames).toContain("bug0019m1");
        // The witness: EXACTLY ONE runtime-defect abort note (the top-level
        // slash catch emits one framed note per error-model.md §"Runtime
        // panics"), carrying the offline message contract — the spec anchor
        // whose gate leaked and the parse gate code that should have rejected
        // the site.
        const abortNotes = t.systemNotes.filter((n) =>
          n.startsWith("theta /bug0019m1 aborted with internal error:"),
        );
        expect(
          abortNotes,
          `expected exactly one 'theta /bug0019m1 aborted with internal error:' note; systemNotes=${JSON.stringify(
            t.systemNotes,
          )} error=${t.error}`,
        ).toHaveLength(1);
        const note = abortNotes[0] ?? "";
        expect(note, "the framing names the spec anchor whose gate leaked").toContain("ERR-18");
        expect(note, "the framing names the parse gate that should have rejected the site").toContain(
          "theta/parse/question-on-non-result",
        );
        // The fabricated-cancellation removal: pre-fix this drive emitted
        // "theta /bug0019m1 cancelled" (the forged Err(undefined) tripping
        // `?? makeCancelledError()`); post-fix that signature is impossible
        // for a theta nobody cancelled.
        expect(
          t.systemNotes.some((n) => n.includes("theta /bug0019m1 cancelled")),
          `no fabricated cancellation note may appear; systemNotes=${JSON.stringify(t.systemNotes)}`,
        ).toBe(false);
        // The abort fires at `let v = o.r?`, BEFORE any query dispatch: no
        // user turn ever reaches the model (deterministic — the body is pure).
        expect(t.userTexts).toEqual([]);
        // The defect surfaces as the framed note, not as a throw escaping the
        // slash handler to the Pi host.
        expect(t.error).toBeUndefined();
      } finally {
        await probe.dispose();
      }
    },
  );
});
