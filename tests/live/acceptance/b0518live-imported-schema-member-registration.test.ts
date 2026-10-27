// Real pi -p, checkout-pinned extension, real filesystem imports and public
// command registry. The observer only reads pi.getCommands() and transforms
// input; it replaces no theta parser, loader, driver or provider. No rejected
// body is executed. This proves registration, NOT runtime iteration/child
// execution or the broader load-phase materialisation alternative in bug 0518.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { requireLiveHost, spawnPiPrint } from "./harness";

const P = "---\nmode: prompt\n---\n";
const SCHEMA = "schema R6 { xs: array<string>, ran: boolean, note: string }";
const IMPORT = 'import { R6 } from "./p6lib.thetalib"';
const VALUE = 'let r = R6 { xs: ["a", "b"], ran: false, note: "init" }';
const QUESTION = " What is 263 plus 514? Answer with the number only.";
const NAMES = ["b0518-for", "b0518-par", "b0518-local", "b0518-workaround", "b0518-invalid"];
const MARKER = "B0518 registration observation";
const OBSERVER = `export default function(pi) {
  pi.on("input", event => {
    if (event.text !== ${JSON.stringify(MARKER)}) return { action: "continue" };
    const commands = new Set(pi.getCommands().map(c => c.name));
    return { action: "transform", text: "Registration: " + ${JSON.stringify(NAMES)}.map(n => n + "=" + commands.has(n)).join("; ") + "." + ${JSON.stringify(QUESTION)} };
  });
}\n`;
interface Message {
  readonly role?: string;
  readonly customType?: string;
  readonly content?: string | readonly { readonly text?: string }[];
  readonly stopReason?: string;
}
const textOf = (m: Message) => typeof m.content === "string" ? m.content : (m.content ?? []).map(p => p.text ?? "").join("");
function assertRegistered(actual: string, name: string) {
  expect(actual, `B0518 real-host imported array member must register ${name}=true`).toContain(`${name}=true;`);
}

describe("H9a B0518 imported-schema member registration", () => {
  let observed: string;
  beforeAll(async () => {
    await requireLiveHost(); // Missing credentials/model is a hard precondition failure.
    const cwd = mkdtempSync(join(process.env.PI_THETA_TEST_ARTIFACT_DIR ?? tmpdir(), "b0518-host-"));
    const root = join(cwd, "thetas"); mkdirSync(root);
    const observerPath = join(cwd, "observer.mjs"); writeFileSync(observerPath, OBSERVER);
    const files = {
      "p6lib.thetalib": SCHEMA + "\n",
      "b0518-for.theta": P + `${IMPORT}\n${VALUE}\nfor x in r.xs { let seen = x }\n1\n`,
      "b0518-par.theta": P + `${IMPORT}\n${VALUE}\npar for x in r.xs { let seen = x }\n1\n`,
      "b0518-local.theta": P + `${SCHEMA}\n${VALUE}\nfor x in r.xs { let seen = x }\n1\n`,
      "b0518-workaround.theta": P + `${IMPORT}\n${VALUE}\nlet mut xs2: array<string> = []\nxs2 = r.xs\nfor x in xs2 { let seen = x }\n1\n`,
      "b0518-invalid.theta": P + `${SCHEMA}\n${VALUE}\nfor x in r.note { let seen = x }\n1\n`,
    };
    for (const [file, source] of Object.entries(files)) writeFileSync(join(root, file), source);
    const result = await spawnPiPrint({ cwd, thetaDir: root, slashInvocation: MARKER,
      extraArgs: ["-e", observerPath, "--mode", "json", "--no-session"],
    });
    writeFileSync(join(cwd, "result.json"), JSON.stringify(result, null, 2));
    // Preserve host/provider evidence in the enclosing command log, too.
    console.log("B0518 HOST", JSON.stringify({ artifactDir: cwd, ...result }));
    expect(result.exitCode, "host/provider failure is not a bug witness").toBe(0);
    expect(result.stderr, "no host/provider stderr failure").toBe("");
    const events = result.stdout.trim().split(/\r?\n/).map(line => JSON.parse(line) as { type?: string; message?: Message });
    expect(events.filter(e => "theta_result" in e), "complete stream has no inherited worker envelope").toEqual([]);
    const messages = events.flatMap(e => e.type === "message_end" && e.message !== undefined ? [e.message] : []);
    const assistants = messages.filter(m => m.role === "assistant");
    expect(assistants.map(m => m.stopReason), "real provider turn completes successfully").toEqual(["stop"]);
    expect(textOf(assistants[0]!)).not.toBe("");
    expect(messages.filter(m => m.customType === "theta-system-note").map(textOf), "observer turn does not fail closed").toEqual([]);
    const users = messages.filter(m => m.role === "user").map(textOf);
    expect(users).toHaveLength(1);
    observed = users[0]!;
    expect(observed).toMatch(/^Registration: b0518-for=(true|false); b0518-par=(true|false); b0518-local=true; b0518-workaround=true; b0518-invalid=false\./);
    expect(observed).toContain(QUESTION);
    expect(result.stdout, "internal withheld marker never leaks").not.toContain("<withheld>");
  });
  it("healthy controls register local/workaround but reject genuine string iterand", () => {
    expect(observed).toContain("b0518-local=true; b0518-workaround=true; b0518-invalid=false.");
  });
  it("red-direction control: the identical registry oracle rejects an actually absent command", () => {
    expect(() => assertRegistered(observed, "b0518-invalid")).toThrow(/B0518 real-host imported array member must register b0518-invalid=true/);
  });
  for (const name of ["b0518-for", "b0518-par"]) {
    it(`witness: ${name} imported array member registers`, () => {
      assertRegistered(observed, name);
    });
  }
});
