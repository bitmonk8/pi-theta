// H8a-T (bug 0078) — a `--theta` CLI operand whose FIRST character is a
// DISC-5 override prefix (`!`/`+`/`-`) carries no override meaning for the
// CLI source: it is a literal path, and when that literal path does not
// exist the CLI row's *Missing path* cell applies — `theta/load/missing-source`
// — through the real production composition root's `theta-system-note`
// channel, off the settled `SessionManager`.
//
// This is bug 0078's fix: the offline witness
// (tests/discovery-cli-entry-override-prefix.test.ts) pins the same contract
// against `discoverThetas` directly with a fake filesystem; no live cell in
// the tree exercises this fixed path through the real composition root and
// the real `theta-system-note` channel. Mirror: the family's registration
// observable (0113/0075 shape; tests/live/harness.ts,
// tests/live/discovery-entry-lstat-failure-live-cell.test.ts).
//
// PROVOCATION (bug 0078) — measured first, per the verification brief: an
// override-prefixed `--theta` operand naming an absent path needs NO ACL and
// NO fs patching. The CLI flag's value reaches
// `src/extension/production-composition.ts`'s `readThetaFlagPaths`, which
// trims each `path.delimiter`-split occurrence and returns it VERBATIM — a
// leading `!` is ordinary trimmed text, not stripped. So a bare
// `runner.setFlagValue("theta", "!" + absentPath)` before `session_start`
// fires reaches `discoverThetas`' real CLI arm with the override-prefixed
// operand exactly as an operator would type it: no monkeypatch, no denied
// ACL, no TOCTOU race — strictly cleaner than the `fs.promises.lstat` patch
// tests/live/discovery-entry-lstat-failure-live-cell.test.ts had to fall back
// to for its own (structurally different) provocation. This cell therefore
// uses the clean path and patches nothing.
//
// `bootShippedExtension`'s own workspace helper (`plantThetaWorkspace`) only
// wires the `--theta` flag from planted `cli`-source thetas, each of which
// gets a REAL directory on disk (source: cli). This cell wants a `--theta`
// operand that is override-prefixed AND names no real path at all, so it
// builds the workspace with a `project`-source registration-precondition
// control (a real, ordinary theta under `<cwd>/.pi/theta/`, unaffected by the
// CLI flag) and separately overrides `cliThetaDirs` before calling
// `bootShippedExtension`, so the flag `setFlagValue` step inside it joins
// exactly the one override-prefixed absent operand — no other layer of the
// real composition root (`PiFileSystem`, `listTree`, `discoverThetas`,
// `emitUniverseFailures`/the load-diagnostic sink, `SessionManager`, the
// `theta-system-note` channel) is touched or substituted.
//
// Registration-only: no slash command is invoked, so this cell spends zero
// tokens (same profile as the sibling cells it mirrors). ADDITIVE ONLY: a new
// standalone file; no existing live cell is weakened, reworded, reordered or
// deleted.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  plantThetaWorkspace,
  requireLiveProvider,
  type LiveWorkspace,
} from "./harness";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../../tools/code-registry/index.js";

/** `theta/load/missing-source`'s registered code (DIAG-4). */
const MISSING_SOURCE_CODE = "theta/load/missing-source";
/** `theta/load/unreadable-source`'s registered code (DIAG-4) — the code the
 *  bug document quotes as WRONGLY emitted before the fix. */
const UNREADABLE_SOURCE_CODE = "theta/load/unreadable-source";

/** The sharded registry page carrying both codes' rows. */
const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../../docs/spec_topics/diagnostics/code-registry-load.md", import.meta.url),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

/** `<code>: <message>` with `<descriptor>` substituted — DIAG-4: the message
 *  half is READ from the registry row, not transcribed. */
function fragment(code: string, descriptor: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `${code} has no registry row — DIAG-2's closed registry does not carry ` +
      "the code this cell asserts",
  ).toBeTypeOf("string");
  const message = (template as string).replaceAll("<descriptor>", descriptor);
  expect(
    message,
    `${code}: an unsubstituted <…> placeholder remains — the registry row's ` +
      "Message template changed shape and this substitution is stale",
  ).not.toMatch(/<[a-z-]+>/);
  return `${code}: ${message}`;
}

/** The `theta-system-note` channel contents from the settled in-memory
 *  `SessionManager`, read directly off `getEntries()` (AGENTS.md §"Assert on
 *  real observables"). This diagnostic fires at LOAD time, before any drive. */
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
  "H8a-T (bug 0078) — an override-prefixed --theta operand naming no path warns " +
    "missing-source, not unreadable-source, on the theta-system-note channel (bug 0078)",
  () => {
    it(
      "(bug 0078) registers the precondition control, and the theta-system-note channel " +
        "carries the literal-path missing-source warning naming the cli-flag descriptor — never " +
        "unreadable-source — through the real discovery→registration path",
      async () => {
        const provider = await requireLiveProvider();
        // Precondition control: an ordinary theta in the SAME workspace,
        // proving the workspace and discovery walk both work — without this,
        // a missing warning could be (wrongly) attributed to a broken
        // workspace rather than to the CLI arm's handling of the operand.
        const baseWorkspace = plantThetaWorkspace([
          { source: "project", stem: "b078ctl", text: subagentTheta() },
        ]);

        // The clean provocation (see file header): an override-prefixed
        // operand naming an absent path, substituted for the workspace's
        // (empty) cli directory list so `bootShippedExtension` wires exactly
        // this one `--theta` component and nothing else.
        const absentOperand = `!${baseWorkspace.cwd.replace(/\\/g, "/")}/nope-078/deep`;
        const workspace: LiveWorkspace = { ...baseWorkspace, cliThetaDirs: [absentOperand] };

        let handle: Awaited<ReturnType<typeof bootShippedExtension>> | undefined;
        try {
          handle = await bootShippedExtension({ workspace, provider });

          // Precondition: the control must register before the warning's
          // shape could be (wrongly) attributed to a broken workspace.
          expect(
            handle.command("b078ctl"),
            "the precondition control did not register — precondition unmet. " +
              "Registered: " + JSON.stringify(handle.registeredNames()),
          ).toBeDefined();

          // Guard: nothing spurious registered from the override-prefixed
          // operand — it names no path, so the registered set is exactly the
          // control's command.
          expect(
            handle.registeredNames(),
            "guard: the override-prefixed operand registered something — it " +
              "names no real path, so nothing should. Registered: " +
              JSON.stringify(handle.registeredNames()),
          ).toEqual(["b078ctl"]);

          // The fixed observable: through the REAL production composition
          // root, an override-prefixed CLI operand naming no path is a
          // literal path that does not exist, so the CLI row's Missing cell
          // fires — `theta/load/missing-source` — and NOT the
          // `theta/load/unreadable-source` code the bug document quotes as
          // the pre-fix symptom (DISC-2's clean-leaf ancestor walk asking
          // about relative-looking prefix segments the operator never typed
          // as directories).
          const notes = systemNoteContents(handle.sessionManager.getEntries());
          // Bug 0461: the failure-mode rows render `<descriptor>` in the
          // normative `<kind>:"<value>"` form — a cli-flag value is `--theta`
          // followed by the operand as passed (placeholder-rendering-b.md §5).
          const cliDescriptor = `cli-flag:"--theta ${absentOperand}"`;
          const expectedMissing = fragment(MISSING_SOURCE_CODE, cliDescriptor);
          const bannedUnreadable = fragment(UNREADABLE_SOURCE_CODE, cliDescriptor);
          expect(
            notes.some((note) => note.includes(expectedMissing)),
            "no theta-system-note entry named the literal-path missing-source " +
              "warning for the override-prefixed operand (bug 0078's fix; " +
              "discovery-sources.md's CLI row Missing cell). Notes: " +
              JSON.stringify(notes),
          ).toBe(true);
          expect(
            notes.some((note) => note.includes(bannedUnreadable)),
            "bug 0078's pre-fix symptom: an override-prefixed operand's absence " +
              "must NOT be reported as unreadable-source. Notes: " +
              JSON.stringify(notes),
          ).toBe(false);
        } finally {
          if (handle !== undefined) {
            await handle.dispose();
          }
          baseWorkspace.dispose();
        }
      },
    );
  },
);
