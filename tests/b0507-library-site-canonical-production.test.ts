// Additive production-composition controls. Real disk/imports/ledger, recording
// host; no provider or real child process. Real CLI is covered separately.
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { discoverAndComposeFixtures } from "../src/extension/production-composition";
import { dispatchTopLevelFixtures, errNote, hostPi, loadCtx, type RecordedMessage } from "./helpers/fixture-dispatch-harness";

const FM = "---\nmode: prompt\n---\n";
const LEAF = "theta /caller returned Err: invoke of ./missing.theta failed (load_failure)";
async function workspace(run: (cwd: string, dir: string, put: (file: string, source: string) => string) => Promise<void>) {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), "theta-b0507-canonical-")));
  const dir = join(cwd, ".pi", "theta");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(cwd, ".pi", "settings.json"), "{}");
  const put = (file: string, source: string) => {
    const path = join(dir, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, source);
    return path.replace(/\\/g, "/");
  };
  try { await run(cwd, dir, put); } finally { rmSync(cwd, { recursive: true, force: true }); }
}
async function note(cwd: string) {
  const notes: RecordedMessage[] = [];
  const fixtures = await discoverAndComposeFixtures(hostPi(notes, "B0507 canonical controls must not issue provider turns"), loadCtx(cwd));
  await dispatchTopLevelFixtures(fixtures, cwd, ["caller"]);
  return errNote(notes, "caller");
}

describe("bug 0507 — canonical declaring-site production controls", () => {
  it("a library symlink reports the canonical target file, not the link or caller", async () => {
    await workspace(async (cwd, dir, put) => {
      put("caller.theta", FM + 'import { via } from "./link.thetalib"\nvia()?\n');
      const lib = put("workers/actual.thetalib", 'fn via() {\n  invoke("./child.theta")\n}\n');
      const child = put("workers/child.theta", FM + 'invoke("./missing.theta")?\n');
      // Unsupported symlink creation is a loud fixture failure, never a skip.
      symlinkSync(join(dir, "workers", "actual.thetalib"), join(dir, "link.thetalib"));
      expect(realpathSync(join(dir, "link.thetalib")).replace(/\\/g, "/")).toBe(lib);
      expect(await note(cwd), "B0507 canonical symlink site").toBe(`${LEAF} from ${child} invoked at ${lib}:2`);
    });
  });

  it("renamed re-exports preserve the terminal declaring library/token", async () => {
    await workspace(async (cwd, _dir, put) => {
      put("caller.theta", FM + 'import { forwarded as local } from "./hub.thetalib"\nlocal()?\n');
      put("hub.thetalib", 'export { via as forwarded } from "./workers/actual.thetalib"\n');
      const lib = put("workers/actual.thetalib", '// declaring body\nfn via() {\n  invoke("./child.theta")\n}\n');
      const child = put("workers/child.theta", FM + 'invoke("./missing.theta")?\n');
      expect(await note(cwd), "B0507 re-export actual site").toBe(`${LEAF} from ${child} invoked at ${lib}:3`);
    });
  });

  it("mixed library/theta invoke hops retain exact leaf-first order and theta bytes", async () => {
    await workspace(async (cwd, _dir, put) => {
      put("caller.theta", FM + 'import { via } from "./workers/lib.thetalib"\nvia()?\n');
      const lib = put("workers/lib.thetalib", 'fn via() {\n  invoke("./middle.theta")\n}\n');
      // Imported code remains in the directly dispatched caller; the invoked
      // middle theta has no imports (does not exercise unrelated bug 0505).
      const middle = put("workers/middle.theta", FM + '// theta token line differs\ninvoke("./child.theta")?\n');
      const child = put("workers/child.theta", FM + 'invoke("./missing.theta")?\n');
      expect(await note(cwd), "B0507 mixed complete leaf-first suffix").toBe(`${LEAF} from ${child} invoked at ${middle}:5 from ${middle} invoked at ${lib}:2`);
    });
  });
});
