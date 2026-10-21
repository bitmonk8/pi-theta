// B0514 real-host witness: real pi -p, working-tree extension, discovery,
// parser, production query driver and live provider. No mocked runtime seams.
// The deterministic discriminator is the SECOND outbound prompt, generated
// only after match consumes the first query Result. Provider reply bytes are
// irrelevant; a provider error is a precondition failure, never this witness.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { requireLiveHost, spawnPiPrint } from "./harness";

interface Message {
  readonly role?: string;
  readonly customType?: string;
  readonly content?: string | readonly { readonly text?: string }[];
  readonly stopReason?: string;
}
function textOf(message: Message): string {
  return typeof message.content === "string" ? message.content : (message.content ?? []).map(part => part.text ?? "").join("");
}
const FIRST = "What is 263 plus 514? Answer with the number only.";
const LAST = "B0514 consumption=handled. What is 372 plus 215? Answer with the number only.";

// Direct binding and the fn with a bound-Result tail are healthy controls.
// The bare-query fn cases exercise the same assertion's red direction.
const cells = [
  ["healthy-direct", `let r = @\`${FIRST}\``],
  ["healthy-carried", `fn f() { let s = @\`${FIRST}\`\n s }\nlet r = f()`],
  ["single-form", `fn f() { @\`${FIRST}\` }\nlet r = f()`],
  ["multi-statement", `fn f() { let z = 1\n @\`${FIRST}\` }\nlet r = f()`],
] as const;

describe("H9a B0514 fn query Result call boundary", () => {
  for (const [name, source] of cells) {
    it(name, async () => {
      await requireLiveHost(); // Fail loudly if no provider/model; never skip.
      const cwd = mkdtempSync(join(process.cwd(), ".pi", "tmp", "b0514-host-"));
      try {
        const root = join(cwd, "thetas");
        mkdirSync(root);
        writeFileSync(join(root, "b0514.theta"), [
          "---", "mode: prompt", "---", source,
          'let consumed = match r { Ok(v) => "handled", Err(e) => "ERRARM" }',
          '@`B0514 consumption=${consumed}. What is 372 plus 215? Answer with the number only.`',
          "",
        ].join("\n"));
        const result = await spawnPiPrint({
          cwd, thetaDir: root, slashInvocation: "/b0514",
          extraArgs: ["--mode", "json", "--no-session"],
        });
        // Full child stdout/stderr is retained by the enclosing command log.
        // eslint-disable-next-line no-console
        console.log("B0514 HOST", JSON.stringify({ name, ...result }));
        const events = result.stdout.trim().split(/\r?\n/).map(line => JSON.parse(line) as { readonly type?: string; readonly message?: Message });
        expect(events.filter(event => "theta_result" in event), "prompt-mode outer host must not inherit a worker root").toEqual([]);
        const messages = events.flatMap(event => event.type === "message_end" && event.message !== undefined ? [event.message] : []);
        const users = messages.filter(message => message.role === "user").map(textOf);
        const assistants = messages.filter(message => message.role === "assistant");
        expect(users[0], "discovery and the fn query reached the real provider").toBe(FIRST);
        expect(assistants.length, "at least one real provider turn completed").toBeGreaterThan(0);
        expect(assistants.map(message => message.stopReason), "provider errors/aborts are not bug evidence").toEqual(assistants.map(() => "stop"));
        expect(assistants.every(message => textOf(message).length > 0), "provider returned nonempty text").toBe(true);
        const notes = messages.filter(message => message.customType === "theta-system-note").map(textOf);
        expect(notes, "B0514 real-host Result consumption must not abort with MatchError").toEqual([]);
        expect(result.exitCode, "handled Result must permit successful host exit").toBe(0);
        expect(result.stderr, "successful host must have clean stderr").toBe("");
        expect(users, "B0514 real-host match must reach the handled follow-up prompt").toEqual([FIRST, LAST]);
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    });
  }
});
