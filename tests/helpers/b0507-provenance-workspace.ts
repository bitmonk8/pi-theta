// Bug 0507 fixture only: production code supplies every hop and rendered byte.
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FRONTMATTER = "---\nmode: prompt\n---\n";
export const B0507_LEAF = "theta /caller returned Err: invoke of ./missing.theta failed (load_failure)";

export function plantB0507Workspace(libraryLine = 2, callerPadding = 0, direct = false) {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), "theta-b0507-")));
  const thetaDir = join(cwd, ".pi", "theta");
  const workers = join(thetaDir, "workers");
  mkdirSync(workers, { recursive: true });
  writeFileSync(join(cwd, ".pi", "settings.json"), "{}");
  const callerPath = join(thetaDir, "caller.theta");
  const libPath = join(workers, "lib.thetalib");
  const childPath = join(workers, "child.theta");
  const callerSource = FRONTMATTER + 'import { via_lib } from "./workers/lib.thetalib"\n' +
    "// move only the caller call site\n".repeat(callerPadding) +
    (direct ? 'invoke("./workers/child.theta")?\n' : "via_lib()?\n");
  const libSource = "// move only the library invoke token\n".repeat(libraryLine - 2) +
    'fn via_lib() {\n  invoke("./child.theta")\n}\n';
  writeFileSync(callerPath, callerSource);
  writeFileSync(libPath, libSource);
  // Deliberate language-level load_failure, NOT a missing test executable or
  // infrastructure failure. Only this child names missing.theta, proving it ran.
  writeFileSync(childPath, FRONTMATTER + 'invoke("./missing.theta")?\n');
  const fwd = (path: string): string => path.replace(/\\/g, "/");
  return {
    cwd, thetaDir, workers, callerSource, libSource, libraryLine,
    callerLine: 5 + callerPadding,
    expectedNote: B0507_LEAF + ` from ${fwd(childPath)} invoked at ${fwd(direct ? callerPath : libPath)}:${direct ? 5 + callerPadding : libraryLine}`,
    dispose: (): void => rmSync(cwd, { recursive: true, force: true }),
  };
}
