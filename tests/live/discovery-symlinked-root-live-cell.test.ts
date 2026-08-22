// H8a (bug 0075 headline) — a discovery root that IS a Windows directory
// junction (Node reports it as a symlink) registers the theta beneath it,
// and NO `theta/load/wrong-type-source` note lands, through the real shipped
// production composition root.
//
// GOVERNING SPEC / FIX: docs/bugs/0075-symlinked-root-classified-wrong-type.md
// §Fix Option B (as shipped): `classifyPath` (src/discovery/discovery-walk.ts)
// probes the candidate with `readdir` first (which follows a link/junction and
// proves the target a directory); only on rejection does it fall back to
// `lstat` and, for a symlink/junction, resolve the target via
// `realpath`+`lstat` and classify by what THAT finds.
//
// PROVOCATION. No fault injection is needed or wanted here — the provocation
// is ACL-free: a real Windows directory junction, created the default-privilege
// way (`fs.symlinkSync(target, link, "junction")` — `fs.symlink` for a
// directory needs elevation on Windows, a junction does not), is planted as
// the PROJECT discovery root (`<cwd>/.pi/theta`) itself, pointing at a real
// directory holding one real `.theta`. No `node:fs` primitive is patched.
//
// Registration-only: no slash command is invoked, so this cell spends zero
// tokens and never reaches the RFC-0006 subagent child-process launch, so no
// child pins are owed (the harness's module-scope pins are set regardless,
// as with every H8a-T file). ADDITIVE ONLY: a new standalone file; no existing
// live cell is weakened, reworded, reordered or deleted.

import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bootShippedExtension, requireLiveProvider, type LiveWorkspace } from "./harness";

/** A minimal subagent-mode `.theta` — registration-only, spends no tokens. */
function subagentTheta(): string {
  return ["---", "mode: subagent", "---", "@`Reply with a short one-line greeting.`", ""].join(
    "\n",
  );
}

/**
 * A workspace whose PROJECT discovery root (`<cwd>/.pi/theta`) is itself a
 * real directory junction pointing at a real directory holding the planted
 * `.theta`, rather than an ordinary directory (mirrors `plantThetaWorkspace`'s
 * shape/dispose contract; built by hand because the shared helper always
 * `mkdirSync`s the project root as an ordinary directory).
 */
function plantJunctionRootWorkspace(stem: string): LiveWorkspace {
  const cwd = mkdtempSync(join(tmpdir(), "theta-live-junc-"));
  const target = mkdtempSync(join(tmpdir(), "theta-live-junc-target-"));
  writeFileSync(join(target, `${stem}.theta`), subagentTheta(), "utf8");
  mkdirSync(join(cwd, ".pi"), { recursive: true });
  const link = join(cwd, ".pi", "theta");
  // The default-privilege junction form — no elevation, no ACL, no `node:fs`
  // patch: this IS the real host behaviour bug 0075 names.
  symlinkSync(target, link, "junction");
  return {
    cwd,
    cliThetaDirs: [],
    dispose(): void {
      rmSync(cwd, { recursive: true, force: true });
      rmSync(target, { recursive: true, force: true });
    },
  };
}

describe(
  "H8a (bug 0075 headline) — a junction-rooted project discovery source registers its theta " +
    "and emits no wrong-type-source note",
  () => {
    it(
      "registers the theta beneath a real Windows directory junction project root, with no " +
        "theta/load/wrong-type-source note on the theta-system-note channel",
      async () => {
        const provider = await requireLiveProvider();
        const workspace = plantJunctionRootWorkspace("junctionrootcelle2");

        let handle: Awaited<ReturnType<typeof bootShippedExtension>> | undefined;
        try {
          handle = await bootShippedExtension({ workspace, provider });

          // The fixed observable: the theta beneath the junction root REGISTERS.
          // Under the pre-fix `classifyPath` (candidate probed with `lstat`
          // alone), the junction answers `isDirectory() === false` on `lstat`,
          // the root classifies `wrong-type`, and this command is absent.
          expect(
            handle.command("junctionrootcelle2"),
            "the theta beneath the junction-rooted project discovery root did not " +
              "register — classifyPath still classifies a link/junction candidate " +
              "wrong-type instead of resolving it. Registered: " +
              JSON.stringify(handle.registeredNames()),
          ).toBeDefined();

          // No wrong-type-source note landed on the theta-system-note channel —
          // this diagnostic fires at LOAD time (before any drive), so the full
          // entry list is the delta.
          const notes: string[] = [];
          for (const entry of handle.sessionManager.getEntries()) {
            const e = entry as { customType?: string; content?: unknown };
            if (e.customType !== "theta-system-note") continue;
            if (typeof e.content === "string") notes.push(e.content);
            else if (Array.isArray(e.content)) {
              for (const part of e.content) {
                const t = (part as { text?: string }).text;
                if (typeof t === "string") notes.push(t);
              }
            }
          }
          expect(
            notes.some((note) => note.includes("theta/load/wrong-type-source")),
            "a theta/load/wrong-type-source note landed on the theta-system-note " +
              "channel for a junction-rooted project discovery source — the fix " +
              "must resolve the candidate through readdir/realpath+lstat before " +
              "falling to the wrong-type arm. Notes: " + JSON.stringify(notes),
          ).toBe(false);
        } finally {
          if (handle !== undefined) {
            await handle.dispose();
          }
          workspace.dispose();
        }
      },
    );
  },
);
