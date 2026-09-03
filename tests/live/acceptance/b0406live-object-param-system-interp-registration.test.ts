// H9a live acceptance — bugs 0406 / 0407 / 0408: a subagent-mode theta whose
// `system:` interpolates an INLINE-OBJECT param field (`${cfg.addend}`) is
// spurious-refused at load before this fix (`toSystemParamType` mis-classifies
// the inline object type as `string`-kind, so the `.Ident` step draws
// `theta/parse/system-interp-bad-field`) and therefore never registers; under
// the fix it registers, and the interpolated object-field value reaches the
// spawned child's `--system-prompt` at the real launch boundary — proved
// END-TO-END through the real `pi -p` binary
// (docs/bugs/0406-object-typed-params-misclassified-string.md).
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESSES DO NOT.
// tests/b0406-object-typed-params-misclassified-string.test.ts (+ b0407/b0408)
// pin the classification/render over the in-process parser (`parseDoc`) +
// `renderSystemPrompt`. This file spawns the real `pi` binary in print mode
// over its own throwaway discovery root and observes the outcome through real
// extension auto-load, `--theta` discovery, the shipped composition root, the
// interpreter, AND the RFC-0006 subagent child-process launch that installs
// the rendered `system:` as the child's `--system-prompt` — the channel an
// operator actually sees. This is the registration/drive-outcome flip the
// offline witnesses cannot reach.
//
// WHY THE FLIP IS OBSERVED THROUGH `invoke`, NOT A PRINTED DIAGNOSTIC.
// On the shipped `session_start` path load diagnostics route to the
// `theta-system-note` channel, whose renderer output is NOT streamed to
// `pi -p` print-mode text stdout. invocation.md §Static resolution: a literal
// `invoke(...)` whose callee failed its own load checks surfaces at runtime as
// `Err(InvokeInfraError)`; a `match` over that Result turns the refusal into a
// POSITIVE, deterministic number on stdout (the prober answers 100), and the
// registered-and-driven direction answers 877 — the assertion reds by printing
// the opposite number, not by printing nothing.
//
// WHY A PROMPT PROBER INVOKING A SUBAGENT, WITH A COMPUTE-FROM-INLINE-VALUE
// DISCRIMINATOR. `system:` is subagent-mode only, so the child must be
// `mode: subagent`; a subagent transcript is private, so its answer is not on
// the outer `pi -p` stdout — a prompt prober `invoke<integer>`s it (the TYPED
// form, so the child's integer crosses the PIC-59 envelope) and computes over
// the returned number (compute-from-inline-value, AGENTS.md §"Assert on real
// observables"). The child's own answer is itself a compute-from-inline-value
// over the interpolated object field: its `system:` renders
// "add exactly 277" ONLY when `${cfg.addend}` resolves the inline-object
// param's field correctly at the spawn boundary, so the child computes
// 500 + 277 = 777 and the prober answers 777 + 100 = 877. A child the fix did
// not admit resolves `Err` → `d = 0` → the prober answers 100 and the
// assertion reds. The discriminator is an ANSWER to a task question, never a
// verbatim-echo demand (bug 0243 / AGENTS.md).
//
// WHY THE OBJECT ARRIVES SCHEMA-CONSTRUCTED. A bare object literal at an
// `invoke(...)` argument slot is `theta/parse/bare-object-literal`; the prober
// therefore declares its own `schema Cfg` and passes a named `Cfg { ... }`
// value, which the invoke-arg static resolution admits structurally against
// the child's inline-object param. The `system:` renders parent-side at launch
// from the invoke argument (SUBAG-1: `--system-prompt` installed at spawn), so
// the object VALUE must cross as that argument — a default would not reach this
// render.
//
// SUBAGENT CHILD PINS (AGENTS.md §"In-process harnesses…need the child pins"):
// the prober's `invoke` launches an RFC-0006 child. The shared harness supplies
// both pins at every spawn: `spawnPiPrint` sets
// `PI_THETA_SUBAGENT_EXTENSION_PIN` to this tree's `extensions/` and carries
// the parent-pid so the control plane authenticates, and the outer process runs
// `-ne -e <this tree's extensions>` — so the child binds exactly the build
// under test.
//
// SCOPE ISOLATION (bug 0030). This file is deliberately OUTSIDE the nine-area
// H9a manifest: it adds no `FeatureArea`, touches none of the committed
// fixtures under `./fixtures`, and uses its own temp discovery root. It does
// NOT call `assertStderrClean` and does NOT call `assertCodesSubsetOfPermitted`,
// so it needs NO entry in `tests/fixtures/h7a/permitted-codes.json` — the
// refusal routes to the system-note channel, not to stdout.
//
// Token-bounded: one `pi -p` spawn, one prober turn plus the invoked child's
// single typed-query turn.

import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { failLoudly, requireLiveHost, resolveAcceptanceHost, spawnPiPrint } from "./harness";
import { parseDoc } from "../../helpers/e2e-s1";
import type { Diagnostic } from "../../../src/diagnostics/diagnostic";

/** The registry code the mis-classification draws on the inline-object `.Ident` step at the fork. */
const FORK_REFUSAL_CODE = "theta/parse/system-interp-bad-field";

/**
 * The child: a subagent whose `system:` interpolates the INLINE-OBJECT param
 * field `${cfg.addend}`. Before the fix `toSystemParamType` classes the inline
 * object type as `string`-kind, the `.Ident` step draws FORK_REFUSAL_CODE and
 * the theta never registers. Under the fix it registers and its `system:`
 * renders "add exactly 277" from the invoke-argument `cfg`. `<BIND_MODEL>` is
 * rewritten to the resolved live host so the params theta's load-time
 * binder-model resolves (the binder is bypassed at runtime on the marshalled
 * invoke path, PIC-60 — this line only clears the load check).
 */
const CHILD_TEMPLATE = [
  "---",
  "mode: subagent",
  "bind_model: <BIND_MODEL>",
  "system: 'You are a calculator. Add exactly ${cfg.addend} to any number you are given in the request, then reply with only the single resulting integer.'",
  "params:",
  "  cfg: '{addend: integer, note: string}'",
  "---",
  "let n: integer = @`The number is 500. Apply your standing instruction and reply with only the single resulting integer.`?",
  "n",
  "",
].join("\n");

/**
 * The prober: prompt-mode; declares its own `schema Cfg` (a bare object literal
 * at the invoke slot is `theta/parse/bare-object-literal`), constructs
 * `Cfg { addend: 277, note: "seed" }`, `invoke<integer>`s the child with it, and
 * computes over the returned integer. A registered-and-driven child returns 777
 * so the prober answers 877; a child the fix did not admit resolves `Err` →
 * `d = 0` → the prober answers 100 and the assertion reds.
 */
const PROBE = [
  "---",
  "mode: prompt",
  "---",
  "schema Cfg { addend: integer, note: string }",
  'let c = Cfg { addend: 277, note: "seed" }',
  'let res = invoke<integer>("./b0406child.theta", c)',
  "let d = match res {",
  "  Ok(v) => v,",
  "  Err(e) => 0",
  "}",
  "@`A calculator probe finished with code ${d}. What is ${d} plus 100? Answer with the number only.`",
  "",
].join("\n");

/** The registered-and-driven answer (777 from the child + 100 from the prober). */
const REGISTERED_OK = "877";
/** The answer the prober prints when the child failed to register (d = 0). */
const REFUSED_ANSWER = "100";

/** The error-severity load/parse codes `parseDoc` attributes to one source. */
function errorCodes(thetaText: string, thetaPath: string): readonly string[] {
  return parseDoc(thetaText, thetaPath)
    .diagnostics.filter((d: Diagnostic) => d.severity === "error")
    .map((d: Diagnostic) => d.code)
    .sort();
}

describe("H9a live — bugs 0406/0407/0408 object-param `system:` interpolation registers and drives through the real `pi -p`", () => {
  it("registers the inline-object-`system:` subagent and carries its interpolated object field into the spawned child's system prompt", async () => {
    const host = await resolveAcceptanceHost();
    const child = CHILD_TEMPLATE.replace("<BIND_MODEL>", `${host.provider}/${host.model}`);

    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): under the fix the child registers with NO error and the prober
    // registers clean. At the fork the inline-object `${cfg.addend}` step draws
    // FORK_REFUSAL_CODE (offline witness b0406 W1), so a green live answer can
    // only come from this fix — no unrelated failure produces 877.
    expect(
      errorCodes(child, "/proj/b0406child.theta"),
      "attribution: under the fix the inline-object-`system:` child carries no error and registers",
    ).toEqual([]);
    expect(
      parseDoc(child, "/proj/b0406child.theta").frontmatter,
      "attribution: the child registers under the fix (frontmatter non-null); at the fork it does NOT (system-interp-bad-field)",
    ).not.toBeNull();
    expect(
      parseDoc(child, "/proj/b0406child.theta").frontmatter?.system,
      "attribution: the child's `system:` template is built (the interpolation is admitted, not refused)",
    ).toBeDefined();
    expect(
      errorCodes(PROBE, "/proj/b0406probe.theta"),
      "attribution: the prober (schema-constructed invoke argument) registers clean",
    ).toEqual([]);

    // Live-host precondition — fails loudly naming the unmet precondition; never
    // a skip or early return.
    const { modelId } = await requireLiveHost();
    if (modelId.length === 0) {
      failLoudly(
        "live-host precondition unmet: the shared live-suite model resolver returned an empty model id.",
      );
    }

    const thetaDir = mkdtempSync(join(tmpdir(), "theta-b0406-"));
    const probeCwd = mkdtempSync(join(tmpdir(), "theta-b0406-cwd-"));
    try {
      writeFileSync(join(thetaDir, "b0406child.theta"), child, "utf8");
      writeFileSync(join(thetaDir, "b0406probe.theta"), PROBE, "utf8");

      const probe = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/b0406probe",
        cwd: probeCwd,
      });
      expect(
        probe.exitCode,
        `probe: expected a no-error exit (0), got ${String(probe.exitCode)}. stderr: ${probe.stderr}`,
      ).toBe(0);
      expect(
        probe.stdout,
        `probe: the inline-object-\`system:\` child must register and DRIVE — its ` +
          `\`system:\` renders "add exactly 277" from the invoke-argument \`cfg.addend\`, so it ` +
          `returns 500 + 277 = 777 and the prober computes 777 + 100 = ${REGISTERED_OK}. A child ` +
          `the fix did not admit (fork: ${FORK_REFUSAL_CODE}) resolves Err → d = 0 → the prober ` +
          `answers ${REFUSED_ANSWER}. stdout: ${probe.stdout} stderr: ${probe.stderr}`,
      ).toContain(REGISTERED_OK);
    } finally {
      rmSync(thetaDir, { recursive: true, force: true });
      rmSync(probeCwd, { recursive: true, force: true });
    }
  });
});
