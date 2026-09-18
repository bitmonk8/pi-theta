// Registry-backed message patterns, note-channel fixtures and settled diagnostic-row readers for live cells.

import { failLoudly, type LiveExtensionHandle, type PlantedTheta } from "../live/harness";
import { collectSystemNotes } from "./recording-system-note-channel";
import { normalisePath, normativeMessagePattern } from "./compose-workspace-harness";
import { readRegistry } from "./registry-oracle";

/** Bug 0139's row — already live, the note-channel precondition. */
export const CASE_CODE = "theta/parse/binding-case-mismatch";

/** A `mode: prompt` `.theta` whose body is the given lines. */
export function promptTheta(bodyLines: readonly string[]): string {
  return ["---", "description: d", "mode: prompt", "---", "", ...bodyLines].join("\n") + "\n";
}

/** The note-channel precondition: a parse fault that existed and fired before these live cells. */
export function noteChannelTheta(stem: string): PlantedTheta {
  return {
    source: "project",
    stem,
    text: promptTheta(["let P = 1", "@`hi`"]),
  };
}

/**
 * The row's normative *Message* (DIAG-4) as a regex with the `<placeholder>`
 * slots opened up. Fails loudly naming the registry page when the row is absent,
 * so registry drift can never degrade a presence assertion into a comparison
 * against `undefined`.
 */
export function liveRegistryMessagePattern(
  bugId: string,
  shard: "load" | "parse",
): (code: string) => RegExp {
  const registry = readRegistry([shard]);
  return (code) => normativeMessagePattern(registry, code, () => {
    failLoudly(
      `${bugId} live cell precondition unmet: ` +
        `docs/spec_topics/diagnostics/code-registry-${shard}.md carries no Message row for ` +
        `${code} — the DIAG-4 column is this cell's only message oracle, so a missing row ` +
        "is a harness failure, never a skip",
    );
  });
}

/** One rendered diagnostic line, split at the code marker `renderDiagnosticLine` writes. */
export interface RenderedRow {
  /** The leading location segment: the located file, separator-normalised. */
  readonly location: string;
  /** The registry *Message* the line carries. */
  readonly message: string;
}

/**
 * Every rendered line in the boot's notes carrying `code`. `renderDiagnosticLine`
 * (`src/diagnostics/diagnostic.ts`) writes `<file>:<line>:<col>: <code>:
 * <message>` for a located row, so splitting at the code marker separates WHERE
 * the row sits from WHAT it says. Hint and related lines are separate lines and
 * are passed over.
 */
export function renderedRows(handle: LiveExtensionHandle, code: string): readonly RenderedRow[] {
  const marker = `: ${code}: `;
  const rows: RenderedRow[] = [];
  for (const note of collectSystemNotes(handle.sessionManager.getEntries())) {
    for (const line of note.split("\n")) {
      const at = line.indexOf(marker);
      if (at < 0) continue;
      rows.push({
        location: normalisePath(line.slice(0, at)),
        message: line.slice(at + marker.length),
      });
    }
  }
  return rows;
}

/** Rows whose located file is the planted `<stem>.theta`. */
export function rowsLocatedAt(
  handle: LiveExtensionHandle,
  code: string,
  stem: string,
): readonly RenderedRow[] {
  return renderedRows(handle, code).filter((row) => row.location.includes(`/${stem}.theta`));
}

/** Render a row list for an assertion message. */
export function describeRows(rows: readonly RenderedRow[]): readonly string[] {
  return rows.map((row) => `${row.location}: ${row.message}`);
}

/** The boot put SOMETHING on the note channel, so an absence claim is not read off a dead channel. */
export function requireNoteChannel(handle: LiveExtensionHandle, half: string, bugId: string): void {
  if (collectSystemNotes(handle.sessionManager.getEntries()).length === 0) {
    failLoudly(
      `${bugId} live cell precondition unmet: the ${half} boot appended NO ` +
        "`theta-system-note` entries, so the shipped load-diagnostic channel is unobservable " +
        "here. Registered: " + JSON.stringify(handle.registeredNames()),
    );
  }
}
