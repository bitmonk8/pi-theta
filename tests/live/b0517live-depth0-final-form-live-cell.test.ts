// Bug 0517 live companion: real discovery/registration, production invoke
// child, and a real provider turn. The deterministic oracle is the child value
// in the OUTBOUND query, not prompt() resolving or the model's stochastic text.
// Approved contract: docs/bugs/0517 §Approved ruling; FN-5; grammar §Blocks.
import { describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  driveSlashCaptureTurn,
  plantThetaWorkspace,
  requireLiveProvider,
} from "./harness";

const cases = [
  { name: "healthy own-line control", suffix: '42\npure("a")' },
  { name: "continuation-joined alias final call", suffix: 'schema X = array<integer>\npure("a")' },
  { name: "same-source-line final call", suffix: '42 pure("a")' },
];

// All fixtures parse clean on HEAD: the defect silently returns null. An
// explicit null tag distinguishes it from infra/provider failure and Err.
// Typed nullable invoke preserves both the healthy string and the buggy null;
// untyped invoke intentionally discards the payload (invocation.md §Typed return).
const PROBE = [
  "---", "mode: prompt", "---",
  'let r = invoke<string | null>("./cellb0517child.theta")',
  'let tag = match r { Ok(v) => (v == null ? "NULL" : v), Err(e) => "INFRA" }',
  '@`Context tag b0517-value=${tag}. What is 263 plus 514? Answer with the number only.`',
].join("\n") + "\n";

describe("bug 0517 — final-form child value at live production load", () => {
  it.each(cases)("$name reaches the outbound query with v:a", async ({ suffix }) => {
    const provider = await requireLiveProvider(); // Missing model is a failure, never a skip.
    const workspace = plantThetaWorkspace([
      { source: "project", stem: "cellb0517probe", text: PROBE },
      {
        source: "project", stem: "cellb0517child",
        text: `---\nmode: subagent\n---\nfn pure(s: string): string { "v:" + s }\n${suffix}\n`,
      },
    ]);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(handle.command("cellb0517probe"), "caller must register").toBeDefined();
      expect(handle.command("cellb0517child"), "child must register; this is not a parse-refusal witness").toBeDefined();
      const turn = await driveSlashCaptureTurn(handle, "/cellb0517probe");
      expect(turn.systemNotes, "drive must finish without fail-closed or provider error notes").toEqual([]);
      const rendered = turn.userTexts.join("\n");
      expect(rendered, "invoke must not return an infrastructure error").not.toContain("b0517-value=INFRA");
      expect(
        rendered,
        "bug 0517: outbound query must carry child final-form value v:a, not NULL",
      ).toContain("b0517-value=v:a");
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
