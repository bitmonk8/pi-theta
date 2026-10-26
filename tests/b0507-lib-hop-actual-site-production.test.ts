// Bug 0507 §Approved ruling: library file + library invocation-token line.
// E2E production composition: real disk, discovery, parser/import loader,
// prompt attach, hop ledger/realpath and top-level renderer. Host UI/session
// are doubles; no provider or child process is claimed here. The companion
// H9a file exercises real pi dispatch and the print-mode failure surface.
import { describe, expect, it } from "vitest";
import { discoverAndComposeFixtures } from "../src/extension/production-composition";
import { B0507_LEAF, plantB0507Workspace } from "./helpers/b0507-provenance-workspace";
import { dispatchTopLevelFixtures, errNote, hostPi, loadCtx, type RecordedMessage } from "./helpers/fixture-dispatch-harness";

async function drive(libraryLine: number, callerPadding: number, direct = false): Promise<void> {
  const ws = plantB0507Workspace(libraryLine, callerPadding, direct);
  try {
    // Line L exists in both files but is not the caller-side fn call site.
    expect(ws.libSource.split("\n")[libraryLine - 1]).toContain("invoke(");
    expect(ws.callerSource.split("\n")[libraryLine - 1]).toBeDefined();
    expect(ws.callerLine).not.toBe(libraryLine);
    const notes: RecordedMessage[] = [];
    const pi = hostPi(notes, "B0507 fixture unexpectedly issued a provider turn");
    const fixtures = await discoverAndComposeFixtures(pi, loadCtx(ws.cwd));
    await dispatchTopLevelFixtures(fixtures, ws.cwd, ["caller"]);
    const note = errNote(notes, "caller");
    expect(note.startsWith(B0507_LEAF), "B0507 child body ran and propagated its own deliberate load_failure").toBe(true);
    expect(note.split(" invoked at ").length - 1, "B0507 exactly one callee-returned hop").toBe(1);
    expect(note, "B0507 actual-site file/line pair (complete note)").toEqual(ws.expectedNote);
  } finally {
    ws.dispose();
  }
}

describe("bug 0507 — complete SLSH-5 actual-site pair through production composition", () => {
  it("CONTROL: ordinary theta-body invoke keeps caller file and token line", async () => {
    await drive(2, 0, true);
  });
  it.each([
    { libraryLine: 2, callerPadding: 0 },
    { libraryLine: 4, callerPadding: 0 },
    { libraryLine: 2, callerPadding: 3 },
  ])("library line $libraryLine, caller padding $callerPadding names the library token", async ({ libraryLine, callerPadding }) => {
    await drive(libraryLine, callerPadding);
  });
});
