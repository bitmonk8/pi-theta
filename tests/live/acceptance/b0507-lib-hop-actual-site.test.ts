// Bug 0507: real pi -p -> discovery/import -> prompt invoke attach -> ledger
// -> SLSH-5 note -> print-mode stderr. No production seam is mocked.
// Like the existing SLSH-5 live cell, this path requires a configured live
// provider but deliberately ends before any provider request (zero tokens).
// It does NOT claim to exercise subagent envelope provenance across a process.
import { describe, expect, it } from "vitest";
import { B0507_LEAF, plantB0507Workspace } from "../../helpers/b0507-provenance-workspace";
import { requireLiveHost, spawnPiPrint } from "./harness";

describe("H9a bug 0507 — real-host SLSH-5 invocation file/line", () => {
  for (const direct of [true, false]) {
    it(direct ? "CONTROL: theta-body invoke retains its caller file and line" : "library-body invoke names its library file and line", async () => {
      await requireLiveHost(); // Missing provider/model is a failure, never a skip.
      const ws = plantB0507Workspace(2, 0, direct);
      try {
        const result = await spawnPiPrint({
          cwd: ws.cwd,
          thetaDir: ws.thetaDir,
          extraThetaDirs: [ws.workers],
          slashInvocation: "/caller",
          extraArgs: ["--mode", "json", "--no-session"],
        });
        // Full subprocess evidence is preserved in the invoking command log.
        console.log("B0507 HOST", JSON.stringify({ direct, ...result }));
        expect(result.exitCode, "B0507 expected language Err marks print-mode failure").toBe(1);
        const events = result.stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as {
          readonly type?: string;
          readonly message?: { readonly role?: string; readonly customType?: string; readonly content?: unknown };
        });
        expect(events.filter((event) => "theta_result" in event), "outer host is not an inherited subagent root").toEqual([]);
        const messages = events.flatMap((event) => event.type === "message_end" && event.message !== undefined ? [event.message] : []);
        expect(messages.filter((message) => ["user", "assistant", "toolResult"].includes(message.role ?? "")), "no provider turn, raw slash fallback, or provider error witnesses this path").toEqual([]);
        expect(result.stderr.startsWith(B0507_LEAF), "child body ran and returned the deliberate missing-callee leaf").toBe(true);
        expect(result.stderr.split(" invoked at ").length - 1, "exactly one invocation hop reached real stderr").toBe(1);
        expect(result.stderr, "B0507 real-host actual-site file/line pair (complete stderr)").toEqual(ws.expectedNote + "\n");
      } finally {
        ws.dispose();
      }
    });
  }
});
