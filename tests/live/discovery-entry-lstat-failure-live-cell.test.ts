// H8a-T (bug 0075) — an entry-level `lstat` rejection during a settings
// `thetaPaths` glob's universe walk warns on the `theta-system-note` channel
// through the real production composition root.
//
// This is bug 0113's fix-record residual 1 / bug 0075's §Affected `listTree`
// site: `listTree` (src/discovery/discovery-walk.ts,
// src/discovery/package-discovery.ts:355-363) now classifies a per-entry
// `lstat` rejection by `.code` and carries any non-`ENOENT` path out in
// `TreeWalk.unreadable`, which `emitUniverseFailures` reports through the same
// `theta/load/unreadable-source` warning bug 0113's own H8a "cell 62" (this
// file's sibling, tests/live/live-production-acceptance.test.ts) already
// witnesses for a denied static-prefix ROOT (a `readdir` rejection). No live
// test in the tree exercises the sibling class this fix adds: a rejection on
// an individual ENTRY's `lstat` after its parent's `readdir` already
// succeeded and named it.
//
// PROVOCATION — why this file exists standalone and what it does instead of
// an ACL-free real-filesystem trick. Bug 0113's own "cell 62" plants a REGULAR
// FILE at the exact path a glob's static-prefix ROOT would occupy, so the real
// `fs.readdir` on that path rejects ENOTDIR — ACL-free and platform-neutral,
// because the failing call is a `readdir` on a path whose type is wrong. The
// entry-level case this cell targets is structurally different: the failing
// call is an `lstat` on `<parent>/<name>` where `<parent>`'s OWN `readdir`
// already succeeded and returned `<name>` as a member, which proves `<parent>`
// IS a directory. There is no non-final path component left to be the wrong
// type, so the ENOTDIR shape cell 62 uses has no equivalent one level down.
// Two further avenues were tried on this host (Windows, git-bash) and found
// closed, empirically, before this cell was written:
//   1. ACL denial on the entry itself (`icacls <file> /deny <user>:(F)`, and
//      narrowed to only `(RA)` — read attributes) does NOT fail
//      `fs.lstatSync`: Windows answers a plain attribute/metadata query
//      (`GetFileAttributesEx`-class, which is what `lstat` reduces to) without
//      requiring the access rights an explicit DACL deny withholds — only
//      `fs.readFileSync` on the same ACL-denied file rejects `EPERM`. This was
//      verified on this host: denying `(F)` or `(RA)` to the current user
//      left `lstat` succeeding, while `readFileSync` failed `EPERM`.
//   2. A genuine TOCTOU race (delete the entry between the `readdir` that
//      named it and the `lstat` that probes it) is real but non-deterministic
//      from outside the process, and this composition root builds its own
//      real `PiFileSystem` with no injectable seam — the same limitation cell
//      62's own comment names for the readdir case.
// What this cell does instead: a scoped, deterministic monkeypatch of
// `node:fs`'s `fs.promises.lstat` — the EXACT primitive `PiFileSystem.lstat`
// delegates to verbatim (`src/seams/pi-file-system.ts:114`,
// `return fsp.lstat(path);`) — rejecting with a named Node-style `.code` for
// exactly one absolute path, restored in a `finally` immediately after
// `bootShippedExtension` returns. Every layer above that one syscall —
// `PiFileSystem`, `listTree`, `emitUniverseFailures`, `sink.emitGroup`,
// `emitLoadNoteGroup`, the `SessionManager`, and the `theta-system-note`
// channel this cell asserts on — is the real, unmodified production
// composition root. This is disclosed rather than silently substituted for
// the ACL-free ideal per AGENTS.md's "assert on real observables" and the
// no-silent-skip rule: the assertion is not weakened, only the fault's
// injection point is a Node-level fake rather than a real-world fault.
//
// Registration-only: no slash command is invoked, so this cell spends zero
// tokens (the same profile as bug 0113's cell 62 and the bug 0070/0071/0077/
// 0079/0084/0110 registration-only cells it mirrors). ADDITIVE ONLY: a new
// standalone file: no existing live cell is weakened, reworded, reordered or
// deleted.

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { promises as fsp } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { bootShippedExtension, plantThetaWorkspace, requireLiveProvider } from "./harness";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../../tools/code-registry/index.js";

/** `theta/load/unreadable-source`'s registered code (DIAG-4). */
const UNREADABLE_SOURCE_CODE = "theta/load/unreadable-source";

/** The sharded registry page carrying `theta/load/unreadable-source`'s row. */
const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../../docs/spec_topics/diagnostics/code-registry-load.md", import.meta.url),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

/**
 * `theta/load/unreadable-source: discovery source is unreadable: <descriptor>`
 * with `<descriptor>` substituted — DIAG-4: the message half is READ from the
 * registry row, not transcribed, mirroring cell 62's
 * `unreadableSourceFragment`.
 */
function unreadableSourceFragment(descriptor: string): string {
  const template = registryMessage(REGISTRY, UNREADABLE_SOURCE_CODE) as string | undefined;
  expect(
    template,
    `${UNREADABLE_SOURCE_CODE} has no registry row — DIAG-2's closed registry ` +
      "does not carry the code this cell asserts",
  ).toBeTypeOf("string");
  const message = (template as string).replaceAll("<descriptor>", descriptor);
  expect(
    message,
    `${UNREADABLE_SOURCE_CODE}: an unsubstituted <…> placeholder remains — the ` +
      "registry row's Message template changed shape and this substitution is stale",
  ).not.toMatch(/<[a-z-]+>/);
  return `${UNREADABLE_SOURCE_CODE}: ${message}`;
}

/**
 * The `theta-system-note` channel contents from the settled in-memory
 * `SessionManager`, read directly off `getEntries()` (AGENTS.md §"Assert on
 * real observables"). Mirrors cell 62's `systemNoteContents` (unexported from
 * `./harness`, so each acceptance-style file restates it against the full
 * entry list — this diagnostic fires at LOAD time, before any drive).
 */
function systemNoteContents(entries: readonly unknown[]): readonly string[] {
  const notes: string[] = [];
  for (const entry of entries) {
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
  return notes;
}

/** A minimal subagent-mode `.theta` — the precondition control's body. */
function subagentTheta(): string {
  return ["---", "mode: subagent", "---", "@`Reply with a short one-line greeting.`", ""].join(
    "\n",
  );
}

describe(
  "H8a-T (bug 0075) — a settings thetaPaths glob universe entry whose lstat rejects " +
    "warns on the theta-system-note channel (bug 0113 residual 1 / bug 0075 §Affected listTree site)",
  () => {
    it(
      "(bug 0075) registers the precondition control, and the theta-system-note channel carries the " +
        "entry-lstat unreadable-source warning naming the settings descriptor, through the real " +
        "discovery→registration path",
      async () => {
        const provider = await requireLiveProvider();
        const workspace = plantThetaWorkspace([
          // Precondition control: an ordinary theta in the SAME workspace,
          // proving the workspace and discovery walk both work — without this,
          // a missing warning could be (wrongly) attributed to a broken
          // workspace rather than to a silent entry-level swallow.
          { source: "project", stem: "b113entryctl", text: subagentTheta() },
        ]);

        // The glob's static-prefix root `<cwd>/.pi/g` is a REAL, readable
        // directory holding one REAL subdirectory `sub`, so the parent
        // `readdir` succeeds and names `sub` — the precondition the entry-level
        // defect needs (contrast with cell 62, which denies the ROOT's own
        // `readdir`). `sub` holds a real `.theta` the pattern would otherwise
        // select, so the measured loss (guard below) matches the bug doc's
        // shape.
        const cwdPosix = workspace.cwd.replace(/\\/g, "/");
        const settingsBaseDir = `${cwdPosix}/.pi`;
        const deniedSub = `${settingsBaseDir}/g/sub`;
        mkdirSync(join(workspace.cwd, ".pi", "g", "sub"), { recursive: true });
        writeFileSync(
          join(workspace.cwd, ".pi", "g", "sub", "s.theta"),
          subagentTheta(),
          "utf8",
        );
        writeFileSync(
          join(workspace.cwd, ".pi", "settings.json"),
          JSON.stringify({ thetaPaths: ["g/**/*.theta"], thetaPathsBaseDir: settingsBaseDir }),
          "utf8",
        );

        // The scoped monkeypatch (see the file header): reject exactly the
        // `lstat` call for `deniedSub`, delegate every other path to the real
        // `fs.promises.lstat`. Restored in `finally` before this test's
        // `await` chain unwinds, so no later test in the live run (or this
        // one's own workspace teardown, which itself calls into the real
        // filesystem) ever observes the patched behaviour.
        const originalLstat = fsp.lstat;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Node's fs.promises.lstat overload set has no single assignable type for a same-shape passthrough wrapper; the cast is confined to this one assignment and its `finally` restore.
        (fsp as any).lstat = (path: unknown, ...rest: unknown[]) => {
          const normalized = typeof path === "string" ? path.replace(/\\/g, "/") : path;
          if (normalized === deniedSub) {
            const error: NodeJS.ErrnoException = new Error(
              `EACCES: permission denied, lstat '${deniedSub}'`,
            );
            error.code = "EACCES";
            return Promise.reject(error);
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- passthrough to the original, saved above with the same broad type.
          return (originalLstat as any).call(fsp, path, ...rest);
        };

        let handle: Awaited<ReturnType<typeof bootShippedExtension>> | undefined;
        try {
          handle = await bootShippedExtension({ workspace, provider });
        } finally {
          // Restore BEFORE any assertion or teardown touches the filesystem
          // again — `bootShippedExtension`'s own `session_start` discovery walk
          // is the only call this cell wants patched.
          fsp.lstat = originalLstat;
        }

        try {
          // Precondition: the control must register before the warning's
          // absence could be (wrongly) attributed to a broken workspace.
          expect(
            handle.command("b113entryctl"),
            "the precondition control did not register — precondition unmet. " +
              "Registered: " + JSON.stringify(handle.registeredNames()),
          ).toBeDefined();

          // Guard: the theta below the denied entry is absent either way —
          // the pin adds the diagnostic, it does not recover the path (mirrors
          // the offline witness's cell 1 guard,
          // tests/discovery-tree-walk-lstat-failure.test.ts).
          expect(
            handle.command("s"),
            "guard: the theta inside the denied entry registered despite the " +
              "denied lstat — the fixture does not isolate the defect",
          ).toBeUndefined();

          // The fixed observable: through the REAL production composition
          // root, the glob universe's `sub` entry cannot be `lstat`ed, and
          // discovery-sources.md:69 forbids silence for a traversal failure
          // inside a root that exists. The warning fires at LOAD time, before
          // any drive, so the full entry list is the delta (mirrors cell 62).
          const notes = systemNoteContents(handle.sessionManager.getEntries());
          // Bug 0461: the unreadable-source row renders `<descriptor>` in the
          // normative `<kind>:"<value>"` form — the settings value is the
          // offending `thetaPaths` entry text verbatim (placeholder-rendering-b.md §5).
          const expectedFragment = unreadableSourceFragment('settings:"g/**/*.theta"');
          expect(
            notes.some((note) => note.includes(expectedFragment)),
            "no theta-system-note entry named the entry-lstat unreadable-source " +
              "warning for the denied universe entry — listTree must classify the " +
              "non-ENOENT lstat rejection and carry the path out so " +
              "emitUniverseFailures reports it (discovery-sources.md:69 forbids " +
              "silence for a traversal failure inside a root that exists; bug 0113 " +
              "residual 1 / bug 0075 §Affected listTree site). Notes: " + JSON.stringify(notes),
          ).toBe(true);
        } finally {
          await handle.dispose();
          workspace.dispose();
        }
      },
    );
  },
);
