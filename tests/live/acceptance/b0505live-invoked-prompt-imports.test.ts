// Bug 0505 real-host witness: real pi -p, pinned working-tree extension,
// real discovery/registration, prompt attach, import resolution, and provider.
// Full JSONL is captured, including fail-closed notes and no theta_result leak.
// No mocks; missing credentials/provider fail loudly, never count as bug reds.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { requireLiveHost, spawnPiPrint } from "./harness";
import { parseDoc } from "../../helpers/e2e-s1";
import {
  B0505_CASES, B0505_LIBRARY, B0505_QUESTION, b0505Callee, b0505Caller,
} from "../../helpers/b0505-prompt-import-fixtures";

interface Message {
  readonly role?: string;
  readonly customType?: string;
  readonly content?: string | readonly { readonly text?: string }[];
  readonly stopReason?: string;
}

function textOf(message: Message): string {
  return typeof message.content === "string"
    ? message.content
    : (message.content ?? []).map((part) => part.text ?? "").join("");
}

describe("H9a bug 0505: invoked prompt callee retains materialised imports", () => {
  for (const cell of B0505_CASES) {
    for (const route of ["direct", "invoked"] as const) {
      it(`${cell.name} ${route}${route === "direct" ? " CONTROL" : ""}`, async () => {
        for (const [path, source] of [["callee.theta", b0505Callee(cell, true)], ["caller.theta", b0505Caller(true)]] as const) {
          expect(parseDoc(source, path).diagnostics, "live fixture parses before any tokens are spent").toEqual([]);
        }
        await requireLiveHost();
        const cwd = mkdtempSync(join(tmpdir(), "b0505-host-"));
        try {
          const root = join(cwd, "thetas");
          mkdirSync(root);
          writeFileSync(join(root, "lib.thetalib"), B0505_LIBRARY);
          writeFileSync(join(root, "callee.theta"), b0505Callee(cell, true));
          writeFileSync(join(root, "caller.theta"), b0505Caller(true));
          const slash = route === "direct" ? "/callee" : "/caller";
          const result = await spawnPiPrint({
            cwd, thetaDir: root, slashInvocation: slash,
            extraArgs: ["--mode", "json", "--no-session"],
          });
          // Preserve full host stream even when the following assertions red.
          // eslint-disable-next-line no-console
          console.log("B0505 HOST", JSON.stringify({ cell: cell.name, route, ...result }));
          const events = result.stdout.trim().split(/\r?\n/).map((line) => JSON.parse(line) as {
            readonly type?: string;
            readonly message?: Message;
          });
          expect(events.filter((event) => "theta_result" in event), "outer prompt host cannot inherit worker root state").toEqual([]);
          const messages = events.flatMap((event) => event.type === "message_end" && event.message !== undefined ? [event.message] : []);
          const userTexts = messages.filter((message) => message.role === "user").map(textOf);
          expect(userTexts, "slash must execute as a registered command, not a raw model prompt").not.toContain(slash);
          const assistants = messages.filter((message) => message.role === "assistant");
          expect(assistants.length, "real healthy provider turn must finish before evaluating bug evidence").toBeGreaterThan(0);
          expect(assistants.every((message) => message.stopReason === "stop"), "provider errors/aborts are not import bug evidence").toBe(true);
          expect(assistants.every((message) => textOf(message).length > 0), "provider produces nonempty text").toBe(true);
          // Primary deterministic oracle: the fn/enum failures arrive here on
          // HEAD, AFTER the caller's healthy preflight provider turn completed.
          expect(messages.filter((message) => message.customType === "theta-system-note").map(textOf), "B0505 real-host callee import resolution must not fail closed").toEqual([]);
          expect(result.exitCode, "real host must exit successfully").toBe(0);
          expect(result.stderr, "no unrelated load/host/stderr failure").toBe("");
          expect(userTexts, "computed callee value reaches child query and returns to caller").toEqual(route === "direct"
            ? [B0505_QUESTION]
            : ["What is 123 plus 321? Answer with the number only.", B0505_QUESTION, B0505_QUESTION]);
          expect(assistants.map((message) => message.stopReason), "every expected provider turn completes").toEqual(route === "direct" ? ["stop"] : ["stop", "stop", "stop"]);
        } finally {
          rmSync(cwd, { recursive: true, force: true });
        }
      });
    }
  }
});
