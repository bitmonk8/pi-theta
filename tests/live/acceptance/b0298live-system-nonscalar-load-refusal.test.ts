// H9a live acceptance — bug 0298: a subagent-mode theta whose `system:` value
// is a YAML NON-SCALAR (a block sequence) REFUSES at load with
// theta/load/malformed-system-field, while a well-formed SCALAR-`system:`
// subagent theta still REGISTERS and DRIVES a real turn — both proved
// END-TO-END through the real `pi -p` binary
// (docs/bugs/0298-system-nonscalar-silent-drop-and-prompt-mode-suppression.md).
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS DOES NOT.
// tests/b0298-system-nonscalar-silent-drop-and-prompt-mode-suppression.test.ts
// pins the load disposition over the in-process production parser (`parseDoc`).
// This file spawns the real `pi` binary in print mode over its own throwaway
// discovery root and observes the outcomes through real extension auto-load,
// `--theta` discovery, the shipped composition root, and the interpreter — so
// the fix is proved through the same registration and drive channels an
// operator sees.
//
// WHY THE REFUSAL IS OBSERVED THROUGH `invoke`, NOT AS A PRINTED DIAGNOSTIC.
// On the shipped `session_start` path load diagnostics route to the
// `theta-system-note` channel, whose renderer output is NOT streamed to
// `pi -p` print-mode text stdout (the constraint the b0304 / b0315 cells
// document). invocation.md §Static resolution: a literal `invoke(...)` whose
// callee fails its own structural checks surfaces at runtime as
// `Err(InvokeInfraError)`; a `match` over that Result turns the refusal into a
// POSITIVE, deterministic sentinel on stdout — the assertion reds by printing
// the opposite sentinel, not by printing nothing.
//
// WHY THE CONTROL IS A SUBAGENT INVOKED FROM A PROMPT PROBER.
// `system:` is subagent-mode only, so the scalar-`system:` control must be
// `mode: subagent`. A subagent transcript is private, so its arithmetic answer
// is not on the outer `pi -p` stdout; a prompt prober invokes it and computes
// over the RETURNED number (compute-from-inline-value, AGENTS.md §"Assert on
// real observables"). A registered control returns 777, so the prober answers
// 877; a control the fix wrongly refused resolves `Err` → helper `"0"` → the
// prober answers 100 and the assertion reds. This proves the fix rejects the
// broken non-scalar shape WITHOUT breaking a correct scalar `system:`.
//
// OBSERVABLES (AGENTS.md §"Assert on real observables"): the two committed
// sentinels on `pi -p` stdout, the control's compute-from-inline-value answer,
// and each run's exit code. Drive discriminators are ANSWERS to task questions
// (extract-the-last-word / compute-from-inline-value), NEVER verbatim-echo
// demands — current models read an echo demand as prompt injection and refuse
// it (bug 0243 / AGENTS.md).
//
// SUBAGENT CHILD PINS (AGENTS.md §"In-process harnesses…need the child pins"):
// the control prober's prompt → subagent `invoke` launches an RFC-0006 child.
// The shared harness supplies both pins at every spawn: `spawnPiPrint` sets
// `PI_THETA_SUBAGENT_EXTENSION_PIN` to this tree's `extensions/` and carries
// the parent-pid so the control plane authenticates, and the outer process
// runs `-ne -e <this tree's extensions>` — so the child binds exactly the
// build under test.
//
// SCOPE ISOLATION (bug 0030). This file is deliberately OUTSIDE the nine-area
// H9a manifest: it adds no `FeatureArea`, touches none of the committed
// fixtures under `./fixtures`, and uses its own temp discovery root. It does
// NOT call `assertStderrClean` (bug 0030's empty-capture gate is scoped to the
// ten committed nine-area spawns and their recorded baseline) and it does NOT
// call `assertCodesSubsetOfPermitted`, so it needs NO entry in
// `tests/fixtures/h7a/permitted-codes.json` — the refusal routes to the
// system-note channel, not to stdout, so the captures carry no
// `theta/{load,parse,runtime}/*` code at all.
//
// Token-bounded: two `pi -p` spawns, one pinned single-turn each.

import { describe, it } from "vitest";
import { expectOffenderControlRefusal } from "../../helpers/pi-print-fixture-harness";

/** The registry code the fix pushes for a present non-scalar `system:` field. */
const CODE = "theta/load/malformed-system-field";

/**
 * The offender: subagent-mode, `system:` over a block SEQUENCE — a present
 * non-scalar value. It refuses at load with CODE and does not register. Its
 * body carries NO query, so the pre-fix direction — where it silently loads and
 * `invoke` runs it — costs no model turn.
 */
const OFFENDER = [
  "---",
  "mode: subagent",
  "system:",
  "  - You are a reviewer",
  "---",
  '"B0298 OFFENDER BODY RAN"',
  "",
].join("\n");

/**
 * The offender prober: prompt-mode, invokes the offender; a refused callee
 * resolves `Err(InvokeInfraError)` and the `match` prints the REFUSED sentinel.
 */
const OFFENDER_PROBE = [
  "---",
  "mode: prompt",
  "---",
  'let r = invoke("./b0298offender.theta")',
  "let verdict = match r {",
  '  Ok(v) => "B0298 OFFENDER LOADED",',
  '  Err(e) => "B0298 OFFENDER REFUSED"',
  "}",
  "@`A load probe finished with verdict: ${verdict}. Extract the last word of the verdict and answer with that single uppercase word only.`",
  "",
].join("\n");

/**
 * The matched-pair control: subagent-mode with a well-formed SCALAR `system:`
 * — the only variable flipped from the offender. It must register and drive, so
 * the fix is proved to reject the NON-SCALAR shape specifically and not a
 * `system:` field generally. It drives a task-framed TYPED arithmetic query
 * (returning an integer) so the prober can carry the value back — untyped
 * `invoke(...)` returns `Result<null, …>` and discards the child value
 * (invocation.md §Typed return), so the control's final value crosses the
 * subagent boundary only under a typed `invoke<integer>`.
 */
const CONTROL = [
  "---",
  "mode: subagent",
  "system: You are a precise calculator. Reply with integers only.",
  "---",
  "let n: integer = @`What is 263 plus 514? Reply with the integer.`?",
  "n",
  "",
].join("\n");

/**
 * The control prober: prompt-mode; `invoke<integer>`s the subagent control
 * (the TYPED form, so the child's integer crosses the boundary) and computes
 * over the returned number (compute-from-inline-value, the b0307 pattern). A
 * registered control returns 777 so the prober answers 877; a control the fix
 * wrongly refused resolves `Err` → `d = 0` → the prober answers 100 and the
 * assertion reds.
 */
const CONTROL_PROBE = [
  "---",
  "mode: prompt",
  "---",
  'let res = invoke<integer>("./b0298control.theta")',
  "let d = match res {",
  "  Ok(v) => v,",
  "  Err(e) => 0",
  "}",
  "@`A calculator probe finished with code ${d}. What is ${d} plus 100? Answer with the number only.`",
  "",
].join("\n");

// Drive discriminators are ANSWERS to task questions, never verbatim-echo
// demands (bug 0243 / AGENTS.md).
const REFUSED = "REFUSED";
const LOADED = "LOADED";
const CONTROL_OK = "877";

describe("H9a live — bug 0298 non-scalar `system:` load refusal through the real `pi -p`", () => {
  it("refuses the non-scalar-`system:` subagent theta, and still registers and drives the scalar-`system:` control", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): the offender is un-registered by exactly this fix's pushed
    // CODE and the control is clean and registers, so neither live sentinel can
    // be produced by an unrelated failure. RED at the pre-fix tree — the parser
    // silently dropped the non-scalar `system:` and the offender read `[]`.
    await expectOffenderControlRefusal({
      slug: "b0298",
      offender: OFFENDER,
      offenderProbe: OFFENDER_PROBE,
      control: CONTROL,
      controlProbe: CONTROL_PROBE,
      code: CODE,
      refused: REFUSED,
      loaded: LOADED,
      controlOk: CONTROL_OK,
      offenderLabel: "non-scalar `system:`",
      controlLabel: "scalar-`system:`",
      unfixedBehavior: "a non-scalar `system:` loaded clean — bug 0298 unfixed",
    });
  });
});
