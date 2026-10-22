// Bug 0517: the approved forms reading makes a ThetaBody's final call its
// return value even after a continuation-joined alias or on a packed line.
// Real pi child, shipped extension, production launcher and JSON result driver;
// no queries, scripted executor, mocked parser, or provider calls.
import { describe, expect, it } from "vitest";
import {
  CHILD_MODEL_ID,
  CHILD_MODEL_PROVIDER,
  EXTENSION_ENTRY,
  requireRealSubagentPathsFor,
  runDrivenSubagentFixtureCell,
} from "./helpers/real-subagent-spawn";
import { resetTopLevelThetaControlPlane } from "./helpers/top-level-theta-env";

resetTopLevelThetaControlPlane(process.env, EXTENSION_ENTRY, process.ppid);
const requirePaths = requireRealSubagentPathsFor("bug 0517 requires the real pi CLI and checkout extension");
const PURE = 'fn pure(s: string): string { "v:" + s }';

const cases = [
  { name: "healthy own-line control", suffix: '42\npure("a")' },
  { name: "continuation-joined alias final call", suffix: 'schema X = array<integer>\npure("a")' },
  { name: "same-source-line final call", suffix: '42 pure("a")' },
];

describe("bug 0517 — depth-0 final-form value through a real child", () => {
  it.each(cases)("$name returns v:a in theta_result", async ({ suffix }) => {
    requirePaths();
    await runDrivenSubagentFixtureCell({
      tmpPrefix: "pi-theta-b0517-",
      fixtures: {},
      rootSource: `---\nmode: subagent\n---\n${PURE}\n${suffix}\n`,
      provider: CHILD_MODEL_PROVIDER,
      model: CHILD_MODEL_ID,
      watchdogMs: 20_000,
      async body({ result, killedByWatchdog, diagnostics, exitPromise }) {
        expect(killedByWatchdog, "real child must complete, not hit the infrastructure watchdog").toBe(false);
        expect(diagnostics, "production launch/result driver must emit no diagnostics").toEqual([]);
        expect(result.ok, `real child must return Ok, not infrastructure failure: ${JSON.stringify(result)}`).toBe(true);
        const exit = await exitPromise;
        expect(exit, "real child must self-exit successfully after its envelope").toEqual({ code: 0, signal: null });
        if (!result.ok) throw new Error(`child failed: ${JSON.stringify(result)}`);
        expect(
          result.value,
          "bug 0517: final expression form must return v:a, not discarded-call null",
        ).toBe("v:a");
      },
    });
  }, 30_000);
});
