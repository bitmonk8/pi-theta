// Bug 0342 — a `.theta` enum value forwarded UP a multi-hop invoke chain is
// attributed to the IMMEDIATE callee, not to its declaring file. Bug 0337
// (fixed 0.305.0) keyed the invoke-return retag on the immediate callee's
// resolved path (`#validateInvokeReturn`'s `calleeResolvedPath`,
// `production-theta-producer.ts:4014`). That is correct for one hop. Across a
// subagent hop it is wrong: the PIC-59 envelope (`serializeOkEnvelope` =
// `JSON.stringify`, `subagent-envelope.ts:153`) collapses a boxed enum carrier
// to its bare wire string, so a value C declares but B forwards reaches the
// grandparent A tagged `<B>#Sev` rather than its declaring `<C>#Sev`. It then
// compares `valuesEqual` FALSE against a value obtained directly from C (false
// negative) and TRUE against B's own same-named enum (false positive), with the
// wire value preserved and no diagnostic
// (`docs/bugs/0342-multi-hop-subagent-chain-attributes-forwarded-enum-to-immediate-callee.md`).
//
// THE SEMANTICS UNDER TEST (0342 §Expected behaviour). A forwarded enum keeps
// its DECLARING file's identity at every hop: `runtime-value-model.md:29`
// binds the tag to "the declaring `.theta` file together with the declared
// name … including across an in-process `invoke` that carries a value out of
// its declaring file". For the value C declares, the declaring file is C at
// every hop — so A's forwarded value must carry `<C>#Sev`, compare `==` a value
// obtained directly from C, and compare `!=` the forwarding file B's own
// same-named enum.
//
// WHY THIS TIER (INTEGRATION, real spawned children, provider-free). The defect
// lives at the PIC-59 process boundary: `serializeOkEnvelope` drops the tag, so
// only a real subagent SPAWN of depth ≥ 2 exhibits it. An in-process (attach)
// chain keeps the boxed carrier intact and is NOT broken — the sibling offline
// control (`b0342-forwarded-enum-attach-control.test.ts`) pins that the attach
// leg already answers correctly, and this file pins that the subagent leg must
// come to agree with it. A unit tier cannot reach the envelope boundary through
// the real invoke path, and a hand-composed envelope round-trip would be frozen
// to today's seams and could not go GREEN once the fix threads the declaring
// key through — so a both-directions witness of the real invoke path must spawn.
//
// WHAT REDS AT THE FORK (pre-fix), AND WHY. The subagent-root TOP invokes a
// subagent B (`bs.theta`) that itself invokes a subagent C (`cs.theta`) and
// returns a composite `Pair { own: Sev.Low, fwd: <C's Sev.Low> }`. TOP also
// invokes C directly. At the fork the C→B→TOP double envelope retags BOTH Pair
// fields with B's path, so:
//   - `subOwnEqFwd` (B's own Sev.Low vs C's forwarded Sev.Low) is TRUE — must be
//     FALSE: they are different declaring files. FALSE-POSITIVE direction.
//   - `subFwdEqDirect` (C forwarded through B vs C obtained directly) is FALSE —
//     must be TRUE: both are C's declaration. FALSE-NEGATIVE direction.
//   - `legInvariant` (the subagent leg's `own==fwd` equals the in-process attach
//     leg's `own==fwd`) is FALSE — must be TRUE: the leg selects conversation
//     isolation, not enum identity. This is the field a PARTIAL fix that
//     repaired only one carriage still reds.
// `attOwnEqFwd` (the in-process attach leg, `bp.theta` forwarding `cp.theta`) is
// already FALSE at the fork and stays FALSE — the control the fix must not break
// and the reference the subagent leg is measured against.
//
// TOKENS: none. Every theta body here is a pure tail expression or a `let` chain
// ending in one; no callee issues a query, so no provider is contacted. The
// marshalled `--provider`/`--model` reference (PIC-62) only satisfies the launch
// argv shape.
//
// THE CHILD PINS (AGENTS.md #subagent-child-pins) are all three: `process.argv[1]`
// replaced by the repo's own pi CLI entry through the `ExecutableHost`,
// `PI_THETA_SUBAGENT_EXTENSION_PIN` set to this working tree's `extensions/`
// (inherited down to the grandchildren the depth-2 invokes spawn), and
// `parentPid` written beside it so the AUTHENTICATED control plane does not strip
// the pin. Without them the observation would name whatever ambient theta
// install the machine carries.
//
// FIXTURE-SHAPE CONSTRAINTS (from b0337 Cell 4 / invoke-prompt-cell-enum-return):
// no callee declares `params:`, and no body feeds `.keys()` into an `array<T>`
// sink — both make a spawned child exit 0 with no `theta_result` envelope
// (bugs 0178/0179, open). Every declaration a fixture needs is in its own body,
// and each caller uses the explicit `invoke<T>` annotation form.

import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createProductionSpawnFn } from "../src/extension/production-subagent-host";
import { driveSubagentChild } from "../src/runtime/subagent-json-driver";
import {
  launchSubagentChild,
  SUBAGENT_EXTENSION_PIN_ENV,
  type ChildExitInfo,
  type ExecutableHost,
} from "../src/runtime/subagent-launcher";
import { WallClock } from "../src/seams/wall-clock";
import type { Diagnostic } from "../src/diagnostics/diagnostic";

/** The repo's pinned pi CLI entry — the SAME executable resolution rung 1 uses in production. */
const PI_CLI_ENTRY = fileURLToPath(
  new URL("../node_modules/@earendil-works/pi-coding-agent/dist/cli.js", import.meta.url),
);

/** This working tree's extension entry (the build under test). */
const EXTENSION_ENTRY = fileURLToPath(new URL("../extensions", import.meta.url));

/** The marshalled model reference riding the child argv (PIC-62). NEVER CONTACTED: no fixture issues a query. */
const CHILD_MODEL_PROVIDER = "anthropic";
const CHILD_MODEL_ID = "claude-fable-5";

const PROMPT_FM = "---\nmode: prompt\n---\n";
const SUBAGENT_FM = "---\nmode: subagent\n---\n";

/** The two-variant declaration every fixture reuses; explicit wire values so the collision is on the tag alone. */
const SEV_DECL = 'enum Sev { Low = "low", High = "high" }\n';

/** Fail loudly on a missing precondition — never a silent skip (*No silent test skipping*). */
function requirePath(path: string, what: string): void {
  if (!existsSync(path)) {
    throw new Error(
      `precondition unmet: ${what} not found at ${path} — the bug-0342 forwarded-enum ` +
        `witness needs the repo install (npm install); it never silently skips.`,
    );
  }
}

/** Declaring file C: tails its own `Sev.Low`. Reused at both the subagent (cs) and prompt (cp) depths. */
const C_BODY = SEV_DECL + "Sev.Low\n";

/**
 * Forwarding file B: declares its OWN `Sev` and a `Pair`, invokes C, and tails
 * `Pair { own: <B's Sev.Low>, fwd: <C's forwarded Sev.Low> }` — placing B's own
 * declaration and C's forwarded value side by side so one composite return
 * witnesses both the false-positive (`own == fwd`) and, against a direct-from-C
 * value, the false-negative direction.
 */
const B_BODY =
  SEV_DECL +
  "schema Pair { own: Sev, fwd: Sev }\n" +
  'let c = invoke<Sev>("./{C}.theta")?\n' +
  "Pair { own: Sev.Low, fwd: c }\n";

const CELL_FIXTURES: Readonly<Record<string, string>> = {
  // Subagent leg: cs → bs, both spawned, so the C→B→TOP forwarding crosses two
  // PIC-59 envelopes — the path the tag is dropped on.
  "cs.theta": SUBAGENT_FM + C_BODY,
  "bs.theta": SUBAGENT_FM + B_BODY.replace("{C}", "cs"),
  // Attach leg: cp → bp, both prompt, so the forwarding stays in-process inside
  // the spawned root — the control that is already correct at the fork.
  "cp.theta": PROMPT_FM + C_BODY,
  "bp.theta": PROMPT_FM + B_BODY.replace("{C}", "cp"),
};

/**
 * The subagent-root TOP. It threads `callerMode: "prompt"` (subagent-root
 * regime, PIC-58): a subagent-mode callee (`bs`, `cs`) is reached via the SPAWN
 * cell as a grandchild, and a prompt-mode callee (`bp`) via the ATTACH cell
 * in-process. Every `invoke` is reduced through `match` into report fields, so a
 * refused row is DATA rather than an unwind; `Sev.High` is the Err fallback so a
 * spurious Err surfaces as a wrong wire/equality rather than masking.
 */
const TOP_ROOT = [
  "---",
  "mode: subagent",
  "---",
  'enum Sev { Low = "low", High = "high" }',
  "schema Pair { own: Sev, fwd: Sev }",
  "schema R {",
  "  psok: boolean, ppok: boolean, csok: boolean,",
  "  subOwnEqFwd: boolean, subFwdEqDirect: boolean,",
  "  attOwnEqFwd: boolean, legInvariant: boolean,",
  "  subOwnWire: Sev, subFwdWire: Sev, directWire: Sev, attFwdWire: Sev",
  "}",
  'let rps = invoke<Pair>("./bs.theta")',
  'let rpp = invoke<Pair>("./bp.theta")',
  'let rcs = invoke<Sev>("./cs.theta")',
  "let psok = match rps { Ok(v) => true, Err(e) => false }",
  "let ppok = match rpp { Ok(v) => true, Err(e) => false }",
  "let csok = match rcs { Ok(v) => true, Err(e) => false }",
  "let subOwn = match rps { Ok(v) => v.own, Err(e) => Sev.High }",
  "let subFwd = match rps { Ok(v) => v.fwd, Err(e) => Sev.High }",
  "let attOwn = match rpp { Ok(v) => v.own, Err(e) => Sev.High }",
  "let attFwd = match rpp { Ok(v) => v.fwd, Err(e) => Sev.High }",
  "let direct = match rcs { Ok(v) => v, Err(e) => Sev.High }",
  "let subOwnEqFwd = subOwn == subFwd",
  "let subFwdEqDirect = subFwd == direct",
  "let attOwnEqFwd = attOwn == attFwd",
  "let legInvariant = subOwnEqFwd == attOwnEqFwd",
  "R {",
  "  psok: psok, ppok: ppok, csok: csok,",
  "  subOwnEqFwd: subOwnEqFwd, subFwdEqDirect: subFwdEqDirect,",
  "  attOwnEqFwd: attOwnEqFwd, legInvariant: legInvariant,",
  "  subOwnWire: subOwn, subFwdWire: subFwd, directWire: direct, attFwdWire: attFwd",
  "}",
  "",
].join("\n");

/** Narrow the envelope's `Ok` payload to the report object, failing loudly when it is not one. */
function reportOf(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(
      `the driven root returned ${JSON.stringify(value)} instead of the R report object — ` +
        `the fixture set did not reach its tail expression, so no assertion below is meaningful`,
    );
  }
  return value as Record<string, unknown>;
}

describe("bug 0342 — a forwarded enum keeps its declaring file's identity across a depth-2 subagent chain", () => {
  it(
    "the value C declares and B forwards compares `==` a direct-from-C value and `!=` B's own same-named enum, on the subagent leg as on the attach leg",
    async () => {
      requirePath(PI_CLI_ENTRY, "the pi CLI entry (node_modules/@earendil-works/pi-coding-agent)");
      requirePath(EXTENSION_ENTRY, "this working tree's extension entry (extensions/)");

      const scratchDir = mkdtempSync(join(tmpdir(), "pi-theta-bug0342-"));
      const thetaDir = join(scratchDir, "thetas");
      mkdirSync(thetaDir, { recursive: true });
      for (const [name, source] of Object.entries(CELL_FIXTURES)) {
        writeFileSync(join(thetaDir, name), source);
      }
      writeFileSync(join(thetaDir, "top.theta"), TOP_ROOT);

      const host: ExecutableHost = {
        argv1: PI_CLI_ENTRY,
        execPath: process.execPath,
        fileExists: (p: string): boolean => existsSync(p),
        isGenericRuntime: (): boolean => false,
      };

      const diagnostics: Diagnostic[] = [];
      const emitDiagnostic = (d: Diagnostic): void => {
        diagnostics.push(d);
      };

      // The REAL production spawn path with ALL THREE child pins: the executable
      // (host.argv1 → PI_CLI_ENTRY), the extension identity
      // (SUBAGENT_EXTENSION_PIN_ENV → this tree's extensions/, which inherits down
      // to the grandchildren the depth-2 invokes spawn), and parentPid (which
      // AUTHENTICATES the pin at each level — omitting it strips the pin silently).
      const launch = launchSubagentChild(
        {
          argv: {
            slug: "top",
            thetaDirs: [thetaDir],
            systemPrompt: "",
            hostTools: [],
            noHostTools: true,
            provider: CHILD_MODEL_PROVIDER,
            model: CHILD_MODEL_ID,
            projectTrust: false,
          },
          cwd: scratchDir,
          parentEnv: { ...process.env, [SUBAGENT_EXTENSION_PIN_ENV]: EXTENSION_ENTRY },
          parentPid: process.pid,
          invokeDepth: 0,
          host,
        },
        { spawn: createProductionSpawnFn(), emitDiagnostic },
      );
      expect(launch.ok, `launch failed: ${JSON.stringify(diagnostics)}`).toBe(true);
      if (!launch.ok) {
        return;
      }
      const child = launch.child;

      const exitPromise = new Promise<ChildExitInfo>((resolve) => child.onExit(resolve));

      try {
        // In-test watchdog BELOW the vitest timeout: on a stall (the root child or
        // any grandchild making no progress) kill the tree so the drive settles
        // fail-closed and the assertions report loudly, rather than hanging to the
        // outer timeout.
        let killedByWatchdog = false;
        const watchdog = setTimeout(() => {
          killedByWatchdog = true;
          child.kill();
        }, 100_000);

        const result = await driveSubagentChild({
          child,
          thetaAbort: new AbortController(),
          calleePath: join(thetaDir, "top.theta"),
          emitDiagnostic,
          clock: new WallClock(),
        });
        clearTimeout(watchdog);

        expect(
          killedByWatchdog,
          "the driven root made no progress within 100s — the depth-2 subagent chain did not settle",
        ).toBe(false);
        expect(
          result.ok,
          `the driven root resolved fail-closed instead of Ok: ${JSON.stringify(result)} ` +
            `diagnostics: ${JSON.stringify(diagnostics)}`,
        ).toBe(true);
        if (!result.ok) {
          return;
        }
        const report = reportOf(result.value);

        // Preconditions: every leg's invoke returned Ok. A false here would make
        // the equality/wire fields read from the `Sev.High` fallback, so the
        // assertions below could pass for the wrong reason. Soft so one run names
        // every failing leg.
        expect.soft(report.psok, "(psok) subagent leg bs returns Ok").toBe(true);
        expect.soft(report.ppok, "(ppok) attach leg bp returns Ok").toBe(true);
        expect.soft(report.csok, "(csok) direct subagent invoke cs returns Ok").toBe(true);

        // PRIMARY — FALSE-POSITIVE direction. B's own Sev.Low and C's forwarded
        // Sev.Low are DIFFERENT declaring files, so they must compare unequal.
        // RED at fork: the C→B→TOP double envelope retags both Pair fields with
        // B's path, so both carry `<bs>#Sev` and this reads TRUE.
        expect.soft(
          report.subOwnEqFwd,
          "(subOwnEqFwd) B's own Sev.Low and C's forwarded Sev.Low are different declaring files → must be unequal (0342 §Expected)",
        ).toBe(false);

        // PRIMARY — FALSE-NEGATIVE direction. C's value forwarded through B and
        // C's value obtained directly are the SAME declaration, so they must
        // compare equal. RED at fork: the forwarded value carries `<bs>#Sev` and
        // the direct value `<cs>#Sev`, so this reads FALSE.
        expect.soft(
          report.subFwdEqDirect,
          "(subFwdEqDirect) C forwarded through B equals C obtained directly → must be equal (0342 §Expected)",
        ).toBe(true);

        // CONTROL — the in-process attach leg is already correct and must stay so:
        // the boxed carrier survives in-process, keeping cp's declaring key, so
        // bp's own Sev.Low and cp's forwarded Sev.Low compare unequal at the fork
        // AND after the fix. This is the reference the subagent leg is measured
        // against.
        expect.soft(
          report.attOwnEqFwd,
          "(attOwnEqFwd) the attach leg already distinguishes B' own from C' forwarded → stays unequal (control)",
        ).toBe(false);

        // MODE INVARIANCE — the leg does not change the observable: the subagent
        // leg's `own == fwd` result must equal the attach leg's. RED at fork
        // (subagent TRUE, attach FALSE → disagree) and — the field a PARTIAL fix
        // that repaired only one carriage still reds — GREEN only once the
        // subagent leg agrees with the attach leg (both FALSE).
        expect.soft(
          report.legInvariant,
          "(legInvariant) the subagent and attach legs agree on forwarded-enum inequality (mode invariance)",
        ).toBe(true);

        // Wire preserved on every leg: the identity differs but the value does
        // not — each Sev position still prints the bare "low".
        expect.soft(report.subOwnWire, "(subOwnWire) subagent leg own wire preserved").toBe("low");
        expect.soft(report.subFwdWire, "(subFwdWire) subagent leg forwarded wire preserved").toBe("low");
        expect.soft(report.directWire, "(directWire) direct-from-C wire preserved").toBe("low");
        expect.soft(report.attFwdWire, "(attFwdWire) attach leg forwarded wire preserved").toBe("low");

        // The misattribution is silent on the diagnostic channel: an empty drain
        // is part of the signature; a non-empty one means the run failed for a
        // different reason.
        expect.soft(
          diagnostics,
          `the drive emitted diagnostics: ${JSON.stringify(diagnostics)}`,
        ).toEqual([]);

        // PIC-59: one invocation per process — after the envelope the child self-exits 0.
        const exit = await exitPromise;
        expect(exit.code).toBe(0);
        expect(exit.signal).toBeNull();
      } finally {
        child.kill();
        let reapTimer: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([
          exitPromise,
          new Promise<void>((resolve) => {
            reapTimer = setTimeout(resolve, 5_000);
          }),
        ]);
        clearTimeout(reapTimer);
        try {
          rmSync(scratchDir, { recursive: true, force: true });
        } catch {
          // Best-effort scratch cleanup; never mask the primary test failure.
        }
      }
    },
    180_000,
  );
});
