// Real checkout-pinned pi print hosts, real on-disk libraries, real provider
// turns. The deterministic oracles are theta-computed outbound user text and
// persisted settled system notes, never prompt() resolution or model arithmetic.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { parseDoc } from "../../helpers/e2e-s1";
import { requireLiveHost, spawnPiPrint } from "./harness";

const P = "---\nmode: prompt\n---\n";
const LIB = 'schema R6 { xs: array<string>, note: string }\nenum Sev { Low }\n';
const IMPORT = 'import { R6, Sev } from "./p6lib.thetalib"';
const VALUE = 'let r = R6 { xs: ["a", "b"], note: "init" }';
const QUESTION = " What is 263 plus 514? Answer with the number only.";
interface Message {
  readonly role?: string;
  readonly customType?: string;
  readonly content?: string | readonly { readonly text?: string }[];
  readonly stopReason?: string;
}
const textOf = (m: Message) => typeof m.content === "string" ? m.content : (m.content ?? []).map(p => p.text ?? "").join("");
interface Observation { readonly users: string[]; readonly notes: string[]; readonly diagnosticCodes: string[] }
function assertUsers(observed: Observation, expected: string[]) {
  expect(observed.users, "B0518 real host must send the exact theta-computed text").toEqual(expected);
}
function assertAbort(observed: Observation, name: string) {
  expect(observed.notes.filter(n => n.includes(`theta /${name} aborted`)), "B0518 non-array must produce a settled framed abort").toHaveLength(1);
  expect(observed.diagnosticCodes, "B0518 runtime belt must surface exactly its internal-error diagnostic").toEqual(["theta/runtime/internal-error"]);
}

let cwd: string;
let root: string;
async function drive(name: string, ending: "success" | "abort" = "success", invocation = `/${name}`, extraArgs: readonly string[] = []): Promise<Observation> {
  const session = join(cwd, `${name}-session.jsonl`);
  const result = await spawnPiPrint({ cwd, thetaDir: root, slashInvocation: invocation,
    extraArgs: ["--mode", "json", "--session", session, ...extraArgs],
  });
  writeFileSync(join(cwd, `${name}-result.json`), JSON.stringify(result, null, 2));
  console.log("B0518 RUNTIME HOST", JSON.stringify({ artifactDir: cwd, name, exitCode: result.exitCode, stderr: result.stderr }));
  const events = result.stdout.trim().split(/\r?\n/).map(line => JSON.parse(line) as { type?: string; message?: Message });
  expect(events.filter(e => "theta_result" in e), "complete JSONL has no foreign worker envelope").toEqual([]);
  const messages = events.flatMap(e => e.type === "message_end" && e.message ? [e.message] : []);
  const assistants = messages.filter(m => m.role === "assistant");
  expect(assistants.map(m => m.stopReason), "a real provider turn must complete successfully").toEqual(["stop"]);
  expect(textOf(assistants[0]!)).not.toBe("");
  // Runtime failures can resolve and host exit can be 0. Read the durable
  // transcript rather than assuming custom-note renderers stream to stdout.
  const transcript = readFileSync(session, "utf8");
  const entries = transcript.trim().split(/\r?\n/).map(line => JSON.parse(line) as {
    type?: string; customType?: string; content?: string;
    details?: { diagnostics?: { code: string }[] };
  });
  const noteEntries = entries.filter(e => e.type === "custom_message" && e.customType === "theta-system-note");
  const notes = noteEntries.map(e => e.content ?? "");
  const diagnosticCodes = noteEntries.flatMap(e => e.details?.diagnostics?.map(d => d.code) ?? []);
  const observed = { users: messages.filter(m => m.role === "user").map(textOf), notes, diagnosticCodes };
  // SLSH-3 print-mode failure surface requires exactly exit 1 plus the
  // rendered note and newline on stderr. This is NOT a provider failure:
  // above we require a completed provider stop; here the settled diagnostic
  // must be exactly the expected runtime belt, with no unrelated stderr.
  if (ending === "abort") {
    assertAbort(observed, name);
    expect(result.exitCode, "SLSH-3 non-array abort process surface").toBe(1);
    expect(result.stderr, "SLSH-3 mirrors only the exact settled abort note").toBe(notes.filter(n => n.includes(`theta /${name} aborted`))[0] + "\n");
  } else {
    expect(result.exitCode, "successful host/provider exit").toBe(0);
    expect(result.stderr).toBe("");
    expect(diagnosticCodes).toEqual([]);
  }
  expect(result.stdout + transcript).not.toContain("<withheld>");
  return observed;
}

describe("H9a B0518 real imported member runtime", () => {
  let healthy: Observation;
  beforeAll(async () => {
    await requireLiveHost(); // No model/credentials means fail, never skip.
    cwd = mkdtempSync(join(process.env.PI_THETA_TEST_ARTIFACT_DIR ?? tmpdir(), "b0518-live-runtime-"));
    root = join(cwd, "thetas"); mkdirSync(root);
    writeFileSync(join(root, "p6lib.thetalib"), LIB);
    const files: Record<string, string> = {
      "b0518-seq": `${IMPORT}\n${VALUE}\nlet mut out = ""\nlet mut count = 0\nfor x in r.xs { out = out + x\ncount += 1 }\n@\`B0518 seq out=\${out}; count=\${count}.${QUESTION}\`\n`,
      "b0518-par-run": `${IMPORT}\n${VALUE}\nlet results = par for x in r.xs { x }\nlet a = match results[0] { Ok(v) => v, Err(e) => "BAD" }\nlet b = match results[1] { Ok(v) => v, Err(e) => "BAD" }\n@\`B0518 par out=\${a + b}; count=\${results.length()}.${QUESTION}\`\n`,
    };
    for (const loop of ["for", "par for"]) {
      for (const [kind, iterand] of [["string", "r.note"], ["enum", "Sev.Low"]]) {
        const name = `b0518-${kind}-${loop === "for" ? "seq" : "par"}`;
        // Parallel workers cannot query the enclosing conversation. The
        // offline trace/lane control proves zero worker/body dispatch there;
        // the live counterpart checks the abort and absent post-loop send.
        const body = loop === "for" ? `let _ = @\`B0518 BODY ${name}.${QUESTION}\`` : "let seen = x";
        files[name] = `${IMPORT}\n${VALUE}\nlet _ = @\`B0518 started ${name}.${QUESTION}\`\n${loop} x in ${iterand} { ${body} }\n@\`B0518 SUCCESS ${name}.${QUESTION}\`\n`;
      }
    }
    for (const [name, body] of Object.entries(files)) {
      const path = join(root, name + ".theta");
      const source = P + body;
      expect(parseDoc(source, path).diagnostics, `${name} source must parse before live execution`).toEqual([]);
      writeFileSync(path, source);
    }
    healthy = await drive("b0518-seq");
    assertUsers(healthy, [`B0518 seq out=ab; count=2.${QUESTION}`]);
    expect(healthy.notes.filter(n => /aborted|returned Err:|cancelled/.test(n))).toEqual([]);
  });
  it("sequential imported array computes ab and exactly two iterations", () => {
    assertUsers(healthy, [`B0518 seq out=ab; count=2.${QUESTION}`]);
  });
  it("parallel imported array computes ordered Ok payloads and exactly two results", async () => {
    const observed = await drive("b0518-par-run");
    assertUsers(observed, [`B0518 par out=ab; count=2.${QUESTION}`]);
    expect(observed.notes.filter(n => /aborted|returned Err:|cancelled/.test(n))).toEqual([]);
  });
  for (const kind of ["string", "enum"]) {
    for (const loop of ["seq", "par"]) {
      it(`${kind} ${loop} registers, runs the first turn, then aborts without body/post-loop success text`, async () => {
        const name = `b0518-${kind}-${loop}`;
        const observed = await drive(name, "abort");
        assertUsers(observed, [`B0518 started ${name}.${QUESTION}`]);
        assertAbort(observed, name);
        // The exact same success oracle must reject this real abort capture.
        expect(() => assertUsers(observed, [`B0518 SUCCESS ${name}.${QUESTION}`])).toThrow(/B0518 real host must send/);
      });
    }
  }
  it("unknown imported variant and known local non-arrays remain refused at registration", async () => {
    const invalid = {
      "b0518-unknown-variant": `${IMPORT}\nlet x = Sev.Nope\nx\n`,
      "b0518-local-enum": "enum Sev { Low }\nfor x in Sev.Low { let seen = x }\n1\n",
      "b0518-local-string": 'schema R6 { note: string }\nlet r = R6 { note: "n" }\nfor x in r.note { let seen = x }\n1\n',
    };
    for (const [name, body] of Object.entries(invalid)) {
      const path = join(root, name + ".theta");
      expect(parseDoc(P + body, path).diagnostics.map(d => d.code)).toEqual(name === "b0518-unknown-variant" ? [] : ["theta/parse/non-array-iterand"]);
      writeFileSync(path, P + body);
    }
    const names = ["b0518-string-seq", "b0518-enum-par", ...Object.keys(invalid)];
    const marker = "B0518 runtime registration controls";
    const observer = join(cwd, "registry-observer.mjs");
    writeFileSync(observer, `export default function(pi) { pi.on("input", event => {
      if (event.text !== ${JSON.stringify(marker)}) return { action: "continue" };
      const commands = new Set(pi.getCommands().map(c => c.name));
      return { action: "transform", text: ${JSON.stringify(names)}.map(n => n + "=" + commands.has(n)).join("; ") + ${JSON.stringify(QUESTION)} };
    }); }\n`);
    const observed = await drive("registry", "success", marker, ["-e", observer]);
    assertUsers(observed, ["b0518-string-seq=true; b0518-enum-par=true; b0518-unknown-variant=false; b0518-local-enum=false; b0518-local-string=false" + QUESTION]);
  });
  it("red-direction: the abort oracle rejects the genuinely healthy runtime capture", () => {
    expect(() => assertAbort(healthy, "b0518-seq")).toThrow(/B0518 non-array must produce/);
    expect(() => assertUsers(healthy, [`B0518 seq out=; count=0.${QUESTION}`])).toThrow(/B0518 real host must send/);
  });
});
