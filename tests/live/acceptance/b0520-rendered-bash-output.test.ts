// Bug 0520 / approved Option A: the code-side value is rendered host text,
// not exact stdout. This real-host control intentionally preserves the existing
// runtime behavior. The remaining defect is the undocumented author contract;
// do not turn the empty-output case into an expectation of an empty string.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { requireLiveHost, spawnPiPrint } from "./harness";

const SUBJECT = [
  "---",
  "mode: prompt",
  "tools: bash",
  "---",
  'let empty = bash({ command: "true" })?',
  'let healthy = bash({ command: "printf healthy-0520" })?',
  'let literal = bash({ command: "printf \'(no output)\'" })?',
  'let sentinel = bash({ command: "true; printf __B0520_END__" })?',
  '@`B0520 empty=[${empty}]; empty_is_empty=${empty == ""}; trimmed_is_empty=${empty.trim() == ""}; healthy=[${healthy}]; literal=[${literal}]; sentinel=[${sentinel}]. What is 263 plus 514? Answer with the number only.`',
  "",
].join("\n");

const EXPECTED_USER = "B0520 empty=[(no output)]; empty_is_empty=false; trimmed_is_empty=false; healthy=[healthy-0520]; literal=[(no output)]; sentinel=[__B0520_END__]. What is 263 plus 514? Answer with the number only.";
interface Message {
  readonly role?: string;
  readonly customType?: string;
  readonly content?: string | readonly { readonly text?: string }[];
  readonly stopReason?: string;
}
function textOf(message: Message): string {
  return typeof message.content === "string" ? message.content : (message.content ?? []).map(part => part.text ?? "").join("");
}
function assertRenderedValues(users: readonly string[]): void {
  expect(users, "B0520 real-host rendered bash values and emptiness comparisons").toEqual([EXPECTED_USER]);
}

describe("H9a B0520 approved rendered-text pass-through", () => {
  it("real host preserves empty placeholder, literal output and caller sentinel; oracle rejects normalization", async () => {
    await requireLiveHost(); // Missing provider/model must fail, never skip.
    // Keep the source and host evidence inside this checkout for investigation.
    const cwd = mkdtempSync(join(process.cwd(), ".pi", "tmp", "b0520-host-"));
    const root = join(cwd, "thetas");
    mkdirSync(root);
    writeFileSync(join(root, "b0520-rendered.theta"), SUBJECT);
    const result = await spawnPiPrint({
      cwd, thetaDir: root, slashInvocation: "/b0520-rendered",
      extraArgs: ["--mode", "json", "--no-session"],
    });
    console.log("B0520 HOST", JSON.stringify({ cwd, ...result }));
    expect(result.exitCode, "host/provider failure is not a bug witness").toBe(0);
    expect(result.stderr, "real host stderr must be empty").toBe("");
    const events = result.stdout.trim().split(/\r?\n/).map(line => JSON.parse(line) as { readonly type?: string; readonly message?: Message });
    expect(events.filter(event => "theta_result" in event), "prompt-mode host must not inherit a worker return envelope").toEqual([]);
    const messages = events.flatMap(event => event.type === "message_end" && event.message !== undefined ? [event.message] : []);
    expect(messages.filter(message => message.customType === "theta-system-note").map(textOf), "no fail-closed theta ending").toEqual([]);
    const assistants = messages.filter(message => message.role === "assistant");
    expect(assistants.map(message => message.stopReason), "one successful real provider turn").toEqual(["stop"]);
    expect(textOf(assistants[0]!).trim(), "task-framed arithmetic control").toBe("777");
    const users = messages.filter(message => message.role === "user").map(textOf);
    assertRenderedValues(users);
    // Exercise the exact oracle's red direction without modifying production
    // or spending another provider turn. This is assertion-sensitivity evidence,
    // not an independent runtime failure or a substitute for the missing docs.
    expect(() => assertRenderedValues([EXPECTED_USER.replace("empty=[(no output)]", "empty=[]")])).toThrow(/B0520 real-host rendered bash values and emptiness comparisons/);
    expect(() => assertRenderedValues([EXPECTED_USER.replace("empty_is_empty=false", "empty_is_empty=true")])).toThrow(/B0520 real-host rendered bash values and emptiness comparisons/);
    expect(() => assertRenderedValues([EXPECTED_USER.replace("sentinel=[__B0520_END__]", "sentinel=[(no output)]")])).toThrow(/B0520 real-host rendered bash values and emptiness comparisons/);

    // Run-local Astra decision a57eeef8: only after the real-host controls
    // succeed, check the two author-facing contract regions in this checkout.
    const { readFileSync } = await import("node:fs");
    const regions = [
      {
        name: "tool-calls",
        path: "docs/spec_topics/tool-calls.md",
        start: "**Return type.**",
        end: "**Failures.**",
      },
      {
        name: "host-interfaces-core",
        path: "docs/spec_topics/pi-integration-contract/host-interfaces-core.md",
        start: '<a id="tool-execution-from-theta-code"></a>',
        end: '<a id="agentsession-interface"></a>',
      },
    ].map(region => {
      const document = readFileSync(join(process.cwd(), region.path), "utf8");
      const start = document.indexOf(region.start);
      const end = document.indexOf(region.end, start + region.start.length);
      expect(start, `B0520 ${region.name} documentation start boundary`).toBeGreaterThanOrEqual(0);
      expect(end, `B0520 ${region.name} documentation end boundary`).toBeGreaterThan(start);
      return { name: region.name, text: document.slice(start, end) };
    });
    const predicates: readonly [string, string, (text: string) => boolean][] = [
      ["empty placeholder", "(no output)", text => text.includes("(no output)")],
      ["presentation channel", "model-facing", text => /model-facing/i.test(text)],
      ["pass-through", "verbatim", text => /verbatim/i.test(text)],
      ["not raw capture", "not raw", text => /not (?:exact|raw)/i.test(text)],
      ["truncation", "truncation", text => /truncat/i.test(text)],
      ["caller mitigation", "sentinel", text => /sentinel|structured marker/i.test(text)],
    ];
    const assertWarning = (text: string, region: string, name: string, predicate: (text: string) => boolean): void => {
      expect(predicate(text.replace(/\s+/g, " ")), `B0520 ${region} rendered bash warning: ${name}`).toBe(true);
    };
    // Explicitly synthetic test-only editorial fixture: this proves both
    // oracle directions, not a source-document or production red witness.
    const syntheticWarning = predicates.map(([, marker]) => marker).join("\n");
    for (const [name, marker, predicate] of predicates) {
      assertWarning(syntheticWarning, "synthetic-control", name, predicate);
      expect(() => assertWarning(syntheticWarning.replace(marker, ""), "synthetic-control", name, predicate))
        .toThrow(`B0520 synthetic-control rendered bash warning: ${name}`);
    }
    console.log("B0520 documentation-oracle controls passed: all six markers accepted and independently rejected when removed");
    // Bounded coverage checks only; independent review must still establish
    // that the actual prose honestly documents the approved semantics.
    for (const region of regions) {
      for (const [name, , predicate] of predicates) {
        assertWarning(region.text, region.name, name, predicate);
      }
    }
  });
});
