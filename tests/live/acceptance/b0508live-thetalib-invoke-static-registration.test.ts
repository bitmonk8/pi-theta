// B0508 real pi host registration witness. A test-only observer extension
// reads the PUBLIC registered command list after session_start and exposes it
// as deterministic outbound user text. It does not replace discovery, parsing,
// imports, static checks, registration, provider or any production driver.
// Invalid theta bodies are never run: this specifically proves LOAD refusal,
// not the separate runtime safeguards/bugs 0505 or 0506.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { requireLiveHost, spawnPiPrint } from "./harness";

const P = "---\nmode: prompt\n---\n";
interface Message {
  readonly role?: string;
  readonly customType?: string;
  readonly content?: string | readonly { readonly text?: string }[];
  readonly stopReason?: string;
}
function textOf(message: Message): string {
  return typeof message.content === "string" ? message.content : (message.content ?? []).map(part => part.text ?? "").join("");
}

// Public API instrumentation only; all verdicts come from the real host's
// registry. The question is task-framed arithmetic, not an echo demand.
const OBSERVER = `export default function(pi) {
  pi.on("input", event => {
    if (event.text !== "B0508 registration observation") return { action: "continue" };
    const names = new Set(pi.getCommands().map(command => command.name));
    const verdict = ["b0508-direct", "b0508-library", "b0508-healthy"]
      .map(name => name + "=" + names.has(name)).join("; ");
    return { action: "transform", text: "Registration: " + verdict + ". What is 263 plus 514? Answer with the number only." };
  });
}\n`;

function question(libraryRegistered: boolean): string {
  return `Registration: b0508-direct=false; b0508-library=${libraryRegistered}; b0508-healthy=true. What is 263 plus 514? Answer with the number only.`;
}

describe("H9a B0508 library invoke load-time registration", () => {
  for (const healthy of [true, false]) {
    it(healthy ? "healthy-control" : "rejects-library-return-mismatch", async () => {
      await requireLiveHost(); // Missing provider/model is a hard failure, never a skip.
      const cwd = mkdtempSync(join(process.cwd(), ".pi", "tmp", "b0508-host-"));
      try {
        const root = join(cwd, "thetas");
        mkdirSync(root, { recursive: true });
        const observerPath = join(cwd, "observer.mjs");
        writeFileSync(observerPath, OBSERVER);
        writeFileSync(join(root, "child.theta"), P + '"string-child"\n');
        writeFileSync(join(root, "lib.thetalib"), `fn probe() { invoke<${healthy ? "string" : "integer"}>("./child.theta") }\n`);
        writeFileSync(join(root, "b0508-direct.theta"), P + 'invoke<integer>("./child.theta")?\n');
        writeFileSync(join(root, "b0508-library.theta"), P + 'import { probe } from "./lib.thetalib"\nprobe()?\n');
        writeFileSync(join(root, "b0508-healthy.theta"), P + 'invoke<string>("./child.theta")?\n');
        const result = await spawnPiPrint({
          cwd, thetaDir: root, slashInvocation: "B0508 registration observation",
          extraArgs: ["-e", observerPath, "--mode", "json", "--no-session"],
        });
        // Preserve complete stdout/stderr/provider evidence in the command log.
        // eslint-disable-next-line no-console
        console.log("B0508 HOST", JSON.stringify({ healthy, ...result }));
        expect(result.exitCode, "real host exits successfully; infra is not a witness").toBe(0);
        expect(result.stderr, "no host/provider stderr failure").toBe("");
        const events = result.stdout.trim().split(/\r?\n/).map(line => JSON.parse(line) as { readonly type?: string; readonly message?: Message });
        expect(events.filter(event => "theta_result" in event), "new outer host must not inherit worker subagent-root state").toEqual([]);
        const messages = events.flatMap(event => event.type === "message_end" && event.message !== undefined ? [event.message] : []);
        const users = messages.filter(message => message.role === "user").map(textOf);
        expect(users, "observer input transform ran rather than forwarding the raw probe marker").not.toContain("B0508 registration observation");
        const assistants = messages.filter(message => message.role === "assistant");
        expect(assistants.map(message => message.stopReason), "a real provider turn completed, without error/abort").toEqual(["stop"]);
        expect(textOf(assistants[0]!), "provider completed with nonempty text").not.toBe("");
        expect(messages.filter(message => message.customType === "theta-system-note").map(textOf), "observer has no fail-closed ending").toEqual([]);
        // The successful direct-refusal and healthy-registration directions
        // must hold BEFORE the bug assertion, preventing a wrong-root witness.
        expect(users).toHaveLength(1);
        expect(users[0]).toContain("b0508-direct=false;");
        expect(users[0]).toContain("b0508-healthy=true.");
        expect(users, "B0508 real-host library static refusal: registered command list").toEqual([question(healthy)]);
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    });
  }
});
