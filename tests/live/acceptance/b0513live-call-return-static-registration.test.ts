// H9a: real command registry, no semantic doubles. Invalid bodies never run.
// The observer only transforms input using the public command list. Both the
// dependency-pinned CLI and the operator's PATH pi host load this checkout.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EXTENSION_ENTRY, requireLiveHost, resolveAcceptanceHost, spawnPiPrint, type PiPrintResult } from "./harness";
import { topLevelThetaHostEnv } from "../../helpers/top-level-theta-env";
const P = "---\nmode: prompt\n---\n";
const names = ["b0513-direct", "b0513-library", "b0513-healthy", "b0513-unknown", "b0513-subagent", "b0513-body"];
const disposition = [false, false, true, true, true, true];
const question = " What is 263 plus 514? Answer with the number only.";
const expected = "Registration: " + names.map((n, i) => `${n}=${disposition[i]}`).join("; ") + "." + question;
const marker = "B0513 registry observation";
const observer = `export default function(pi) {
  pi.on("input", event => {
    if (event.text !== ${JSON.stringify(marker)}) return { action: "continue" };
    const commands = new Set(pi.getCommands().map(c => c.name));
    return { action: "transform", text: "Registration: " + ${JSON.stringify(names)}.map(n => n + "=" + commands.has(n)).join("; ") + "." + ${JSON.stringify(question)} };
  });
}\n`;
interface Message {
  readonly role?: string;
  readonly customType?: string;
  readonly content?: string | readonly { readonly text?: string }[];
  readonly stopReason?: string;
}
const textOf = (m: Message) => typeof m.content === "string" ? m.content : (m.content ?? []).map(p => p.text ?? "").join("");

// PATH pi may be a shell wrapper, so execute it as an executable (not a Node
// script). Closed stdin and a bounded tree deadline mirror the print harness.
async function operatorPrint(cwd: string, root: string, observerPath: string): Promise<PiPrintResult> {
  const host = await resolveAcceptanceHost();
  return new Promise((resolve, reject) => {
    const child = spawn("pi", ["-p", "-ne", "-e", EXTENSION_ENTRY, "--provider", host.provider, "--model", host.model,
      "--theta", root, "-e", observerPath, "--mode", "json", "--no-session", marker], {
      cwd, env: topLevelThetaHostEnv(process.env, EXTENSION_ENTRY, process.pid), stdio: ["ignore", "pipe", "pipe"], detached: true,
    });
    let stdout = ""; let stderr = ""; let expired = false;
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    child.stdout.on("data", data => { stdout += data; }); child.stderr.on("data", data => { stderr += data; });
    const timer = setTimeout(() => { expired = true; if (child.pid !== undefined) process.kill(-child.pid, "SIGKILL"); }, 90_000);
    child.on("error", error => { clearTimeout(timer); reject(error); });
    child.on("close", exitCode => { clearTimeout(timer); if (expired) reject(new Error(`operator host watchdog expired; stdout=${stdout}; stderr=${stderr}`));
      else resolve({ exitCode, stdout, stderr }); });
  });
}

describe("H9a B0513 known ordinary return refusal and genuine deferral", () => {
  for (const host of ["pinned", "operator"] as const) {
    it(`${host} host registry, successful provider turn and rejecting oracle direction`, async () => {
      await requireLiveHost();
      const cwd = mkdtempSync(join(process.cwd(), ".pi", "tmp", "b0513-host-"));
      try {
        const root = join(cwd, "thetas"); mkdirSync(root, { recursive: true });
        const observerPath = join(cwd, "observer.mjs"); writeFileSync(observerPath, observer);
        const files = {
          "child.theta": P + 'fn payload(): string { "value" }\npayload()\n',
          "lib.thetalib": 'fn probe() { invoke<integer>("./child.theta") }\n',
          "b0513-direct.theta": P + 'invoke<integer>("./child.theta")?\n',
          "b0513-library.theta": P + 'import { probe } from "./lib.thetalib"\nprobe()?\n',
          "b0513-healthy.theta": P + 'invoke<string>("./child.theta")?\n',
          "b0513-unknown.theta": P + 'fn g() { "value" }\nlet x: integer = g()\n1\n',
          "b0513-subagent.theta": P + 'subagent fn sf(): string { "value" }\nlet x: integer = sf()\n1\n',
          "b0513-body.theta": P + 'fn g(): string { "value" }\nsubagent fn sf(): string { g() }\n1\n',
        };
        for (const [file, source] of Object.entries(files)) writeFileSync(join(root, file), source);
        const result = host === "pinned" ? await spawnPiPrint({ cwd, thetaDir: root, slashInvocation: marker,
          extraArgs: ["-e", observerPath, "--mode", "json", "--no-session"] }) : await operatorPrint(cwd, root, observerPath);
        // eslint-disable-next-line no-console
        console.log("B0513 HOST", JSON.stringify({ host, ...result }));
        expect(result.exitCode, "host/provider failure is never a bug witness").toBe(0);
        expect(result.stderr).toBe("");
        const events = result.stdout.trim().split(/\r?\n/).map(line => JSON.parse(line) as { type?: string; message?: Message });
        expect(events.filter(e => "theta_result" in e), "no inherited outer worker envelope").toEqual([]);
        const messages = events.flatMap(e => e.type === "message_end" && e.message !== undefined ? [e.message] : []);
        const assistants = messages.filter(m => m.role === "assistant");
        expect(assistants.map(m => m.stopReason)).toEqual(["stop"]);
        expect(textOf(assistants[0]!)).not.toBe("");
        expect(messages.filter(m => m.customType === "theta-system-note").map(textOf)).toEqual([]);
        const users = messages.filter(m => m.role === "user").map(textOf);
        const assertRegistry = (actual: readonly string[]) => expect(actual, "B0513 real-host registry disposition").toEqual([expected]);
        assertRegistry(users);
        // Same exact oracle rejects the pre-fix known-call admission direction.
        // Uses the actual healthy stream; no second provider turn or production patch.
        expect(() => assertRegistry([expected.replace("b0513-direct=false", "b0513-direct=true")])).toThrow(/B0513 real-host registry disposition/);
      } finally { rmSync(cwd, { recursive: true, force: true }); }
    });
  }
});
