// Bug 0506: real pi -p discovery -> imported library fn -> production invoke
// -> AJV return boundary. imports.md:16 and invocation.md:28 require the
// annotation to resolve in its declaring library, independently of the caller.
// No parser, loader, invoke driver, validator, provider, or child is mocked.
// Every result is consumed in-body and exposed in the exact outbound user text;
// assistant completion and fail-closed channels are checked separately.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { requireLiveHost, resolveAcceptanceHost, spawnPiPrint } from "./harness";
import { assertB0506ProbeParses, b0506ProbeSource } from "../../helpers/b0506-live-fixture";

interface Cell {
  readonly name: string;
  readonly callerSchema: string;
  readonly good: boolean;
  readonly expected: "accepted-valid" | "return_validation";
  readonly mode?: "prompt" | "subagent";
  readonly importedSchema?: boolean;
  readonly enumWire?: "yes" | "invalid";
}

const enumCells: readonly Cell[] = (["prompt", "subagent"] as const).flatMap<Cell>((mode) => [
  { name: `${mode} imported enum rejects invalid wire`, callerSchema: "", good: true, expected: "return_validation", mode, enumWire: "invalid" },
  { name: `${mode} imported enum accepts valid wire despite caller conflict`, callerSchema: "schema ROut { other: boolean }", good: true, expected: "accepted-valid", mode, enumWire: "yes" },
]);

const cells: readonly Cell[] = [
  { name: "missing caller schema rejects wrong shape", callerSchema: "", good: false, expected: "return_validation" },
  { name: "missing caller schema accepts library shape CONTROL", callerSchema: "", good: true, expected: "accepted-valid" },
  { name: "conflicting caller schema accepts library shape", callerSchema: "schema ROut { other: boolean }", good: true, expected: "accepted-valid" },
  { name: "conflicting caller schema rejects wrong shape CONTROL", callerSchema: "schema ROut { other: boolean }", good: false, expected: "return_validation" },
  { name: "matching caller schema rejects wrong shape CONTROL", callerSchema: "schema ROut { tag: string }", good: false, expected: "return_validation" },
  { name: "matching caller schema accepts library shape CONTROL", callerSchema: "schema ROut { tag: string }", good: true, expected: "accepted-valid" },
  { name: "library imported schema rejects wrong shape", callerSchema: "", good: false, expected: "return_validation", importedSchema: true },
  { name: "library imported schema accepts library shape CONTROL", callerSchema: "", good: true, expected: "accepted-valid", importedSchema: true },
  { name: "library imported schema ignores conflicting caller schema", callerSchema: "schema ROut { other: boolean }", good: true, expected: "accepted-valid", importedSchema: true },
  { name: "subagent child missing caller schema rejects wrong shape", callerSchema: "", good: false, expected: "return_validation", mode: "subagent" },
  { name: "subagent child conflicting caller schema accepts library shape", callerSchema: "schema ROut { other: boolean }", good: true, expected: "accepted-valid", mode: "subagent" },
  // Same real transport and validator as the red child cells: distinguish
  // scope substitution from a child launch/envelope failure, in both directions.
  { name: "subagent child matching caller schema rejects wrong shape CONTROL", callerSchema: "schema ROut { tag: string }", good: false, expected: "return_validation", mode: "subagent" },
  { name: "subagent child matching caller schema accepts library shape CONTROL", callerSchema: "schema ROut { tag: string }", good: true, expected: "accepted-valid", mode: "subagent" },
  // Exercise the library's own import closure across the real child boundary,
  // not only a same-file library schema or an in-process prompt attach.
  { name: "subagent child library imported schema rejects wrong shape", callerSchema: "", good: false, expected: "return_validation", mode: "subagent", importedSchema: true },
  { name: "subagent child library imported schema ignores conflicting caller schema", callerSchema: "schema ROut { other: boolean }", good: true, expected: "accepted-valid", mode: "subagent", importedSchema: true },
  { name: "subagent child library imported schema matching caller rejects wrong shape CONTROL", callerSchema: "schema ROut { tag: string }", good: false, expected: "return_validation", mode: "subagent", importedSchema: true },
  { name: "subagent child library imported schema matching caller accepts library shape CONTROL", callerSchema: "schema ROut { tag: string }", good: true, expected: "accepted-valid", mode: "subagent", importedSchema: true },
];

interface Message {
  readonly role?: string;
  readonly customType?: string;
  readonly content?: string | readonly { readonly type?: string; readonly text?: string }[];
  readonly stopReason?: string;
  readonly errorMessage?: string;
}

function textOf(message: Message): string {
  return typeof message.content === "string"
    ? message.content
    : (message.content ?? []).map((part) => part.text ?? "").join("");
}

function question(outcome: string): string {
  return `Validation outcome: ${outcome}. What is 263 plus 514? Answer with the number only.`;
}

describe("H9a bug 0506 — library invoke annotation uses declaring scope", () => {
  for (const cell of [...cells, ...enumCells]) {
    it(cell.name, async () => {
      const probeSource = b0506ProbeSource(cell);
      assertB0506ProbeParses(probeSource);
      // Missing credentials/models fail loudly; never skip or treat as a witness.
      await requireLiveHost();
      const host = await resolveAcceptanceHost();
      const cwd = mkdtempSync(join(process.cwd(), ".pi", "tmp", "b0506-host-"));
      const roots = join(cwd, "thetas");
      const workers = join(roots, "workers");
      mkdirSync(workers, { recursive: true });
      try {
        writeFileSync(join(workers, "types.thetalib"), 'schema ROut { tag: string }\nenum Choice { Yes = "yes", No = "no" }\n');
        writeFileSync(join(workers, "lib.thetalib"), [
          ...(cell.enumWire !== undefined
            ? ['import { Choice } from "./types.thetalib"', "schema ROut { tag: string, choice: Choice }"]
            : [cell.importedSchema ? 'import { ROut } from "./types.thetalib"' : "schema ROut { tag: string }"]),
          'fn via_lib() { invoke<ROut>("./child.theta") }',
          "",
        ].join("\n"));
        writeFileSync(join(workers, "child.theta"), [
          "---",
          `mode: ${cell.mode ?? "prompt"}`,
          `model: ${host.provider}/${host.model}`,
          "---",
          // Preserve runtime AJV coverage after B0508's earlier load refusal:
          // the current engine defers a plain function-call return summary
          // (0513). Both valid and invalid payloads take this identical path;
          // no gate or existing full-stream/provider/outcome assertion changes.
          ...(cell.enumWire !== undefined
            ? ["schema ROut { tag: string, choice: string }", `fn payload() { ROut { tag: "x", choice: "${cell.enumWire}" } }`]
            : cell.good ? ["schema ROut { tag: string }", 'fn payload() { ROut { tag: "x" } }'] : ['fn payload() { "not-an-ROut" }']),
          "payload()",
          "",
        ].join("\n"));
        writeFileSync(join(roots, "b0506-probe.theta"), probeSource);

        const result = await spawnPiPrint({
          cwd,
          thetaDir: roots,
          // The non-recursive discovery walk must also discover the child.
          extraThetaDirs: [workers],
          slashInvocation: "/b0506-probe",
          extraArgs: ["--mode", "json", "--no-session"],
        });
        // Capture the FULL real-host evidence in the invoking command's log.
        // eslint-disable-next-line no-console
        console.log("B0506 HOST", JSON.stringify({ cell: cell.name, host, ...result }));
        expect(result.exitCode, "real host exits successfully; provider/infra errors are not bug evidence").toBe(0);
        expect(result.stderr, "real host has no stderr failure/diagnostic").toBe("");
        const events = result.stdout.trim().split(/\r?\n/).map((line) => JSON.parse(line) as {
          readonly type?: string;
          readonly message?: Message;
        });
        expect(events.filter((event) => "theta_result" in event), "B0506 outer host must not inherit another invocation's subagent-root regime").toEqual([]);
        const messages = events.flatMap((event) => event.type === "message_end" && event.message !== undefined ? [event.message] : []);
        const userTexts = messages.filter((message) => message.role === "user").map(textOf);
        expect(userTexts, "B0506 dispatch prerequisite: the probe must execute, not reach the model as a raw slash command").not.toContain("/b0506-probe");
        const assistants = messages.filter((message) => message.role === "assistant");
        expect(assistants.length, "a real provider turn completed, not merely prompt() resolving").toBeGreaterThan(0);
        expect(assistants.map((message) => message.stopReason), "provider errors/aborts cannot witness schema scope").toEqual(["stop"]);
        expect(textOf(assistants[0]!), "provider returned nonempty assistant text").not.toBe("");
        expect(messages.filter((message) => message.customType === "theta-system-note").map(textOf), "no fail-closed theta ending").toEqual([]);
        expect(userTexts, "B0506 declaring-scope outcome in real-host user turn").toEqual([question(cell.expected)]);
      } finally {
        // Only this test's freshly-created scratch workspace is removed.
        rmSync(cwd, { recursive: true, force: true });
      }
    });
  }
});
