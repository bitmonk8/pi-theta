// Bug 0516 approved option (a), real shipped load/registration witness.
// Same source conflict as the frontend E2E: number early return versus array
// final par-for must be rejected by FN-3. Healthy non-final/StmtBlock cases
// must register. Explicit return is an already-rejected negative control.
// Real SDK session_start -> discovery -> composition -> registerCommand;
// no scripted parser/type layer. No command execution, provider turns or
// child spawning: those are not necessary to observe this load-time defect.
import { describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  plantThetaWorkspace,
  requireLiveProvider,
} from "./harness";

const PAR = "par for m in [1] max 2 { 42 }";
function source(last: string): string {
  return `---\nmode: prompt\n---\nfn wrap(n: number) { if n < 0 { return 1 }\n ${last} }\nwrap(1)\n`;
}

function expectRefused(command: unknown): void {
  expect(command,
    "0516 FN-3: incompatible final par-for array must not register a slash command",
  ).toBeUndefined();
}

describe("bug 0516 — final par-for at real shipped registration", () => {
  it("refuses the incompatible final array while preserving non-final and StmtBlock controls", async () => {
    const provider = await requireLiveProvider(); // Missing provider/model fails, never skips.
    const workspace = plantThetaWorkspace([
      { source: "project", stem: "cellb0516final", text: source(PAR) },
      { source: "project", stem: "cellb0516nonfinal", text: source(`${PAR}\n 1`) },
      { source: "project", stem: "cellb0516stmt", text: source(`if n > 0 { ${PAR} }\n n`) },
      { source: "project", stem: "cellb0516explicit", text: source(`return ${PAR}`) },
    ]);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(handle.command("cellb0516nonfinal"), "non-final control must register").toBeDefined();
      expect(handle.command("cellb0516stmt"), "discarded StmtBlock control must register").toBeDefined();
      expectRefused(handle.command("cellb0516explicit"));
      // Same assertion must catch a registered healthy control (red direction).
      expect(() => expectRefused(handle.command("cellb0516nonfinal"))).toThrowError(
        "0516 FN-3: incompatible final par-for array must not register a slash command",
      );
      expectRefused(handle.command("cellb0516final"));
      expect(handle.registeredNames()).not.toContain("cellb0516final");
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
