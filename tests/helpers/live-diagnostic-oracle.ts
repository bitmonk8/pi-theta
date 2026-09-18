// Registry-backed messages, fixtures, registration assertions and settled diagnostic-row readers for live cells.

import { expect } from "vitest";
import { failLoudly, type DrivenTurn, type LiveExtensionHandle, type PlantedTheta } from "../live/harness";
import { collectSystemNotes } from "./recording-system-note-channel";
import { normalisePath, normativeMessagePattern } from "./compose-workspace-harness";
import { readRegistry } from "./registry-oracle";

/** Bug 0139's row — already live, the note-channel precondition. */
export const CASE_CODE = "theta/parse/binding-case-mismatch";

/** A `mode: prompt` `.theta` whose body is the given lines. */
export function promptTheta(bodyLines: readonly string[]): string {
  return ["---", "description: d", "mode: prompt", "---", "", ...bodyLines].join("\n") + "\n";
}

/** A `mode: prompt` `.theta` whose `tools:` field is the given lines, body names no callable. */
export function toolsTheta(toolsLines: readonly string[]): string {
  return ["---", "mode: prompt", ...toolsLines, "---", "@`hi`"].join("\n") + "\n";
}

interface RegisteredControl {
  readonly stem: string;
  /** Failure rationale ending in `Registered: `; the helper appends the live names. */
  readonly message: string;
}

/**
 * Assert controls first so an empty registered set cannot satisfy a refusal
 * vacuously, then check both real registration observables for the subject.
 * Keep each cell's failure rationale and read the settled handle at each assert.
 */
export function expectRegisteredControlThenAbsentSubject(
  handle: Pick<LiveExtensionHandle, "command" | "registeredNames">,
  controls: readonly [RegisteredControl, ...RegisteredControl[]],
  subject: {
    readonly stem: string;
    /** Failure rationale ending in `Registered: `; the helper appends the live names. */
    readonly commandMessage: string;
    readonly registeredNamesMessage: string;
  },
): void {
  for (const control of controls) {
    expect(
      handle.command(control.stem),
      control.message + JSON.stringify(handle.registeredNames()),
    ).toBeDefined();
  }
  expect(
    handle.command(subject.stem),
    subject.commandMessage + JSON.stringify(handle.registeredNames()),
  ).toBeUndefined();
  expect(handle.registeredNames(), subject.registeredNamesMessage).not.toContain(subject.stem);
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
 * An unrelated, import-free, `tools:`-free theta present in BOTH workspaces. It
 * is the per-boot vacuity guard: a boot in which it fails to register has a
 * discovery or registration regression, and no absence claim below means
 * anything. It is never driven, so it spends no tokens.
 */
export function vacuityGuardTheta(stem: string): PlantedTheta {
  return {
    source: "project",
    stem,
    text: ["---", "mode: prompt", "---", "@`ping`", ""].join("\n"),
  };
}

/** Require the unrelated clean command before reading any refusal in this boot. */
export function requireVacuityGuardRegistered(
  handle: LiveExtensionHandle,
  stem: string,
  half: string,
  bugId: string,
): void {
  expect(
    handle.command(stem),
    `${bugId} live cell precondition unmet: the unrelated clean theta did not register in ` +
      `the ${half} boot, so discovery or registration regressed independently of ${bugId.replace("-", " ")} ` +
      "and every absence claim below would hold vacuously. Registered: " + JSON.stringify(handle.registeredNames()),
  ).toBeDefined();
}

/**
 * The two summands the root adds in code. Their sum is rendered into the
 * outbound template, so the deterministic drive channel carries a value only the
 * theta's own evaluation could have produced — the compute-from-inline-value
 * discriminator, not a verbatim-echo demand (bug 0243).
 */
const LEFT_SUMMAND = 263;
const RIGHT_SUMMAND = 514;
const COMPUTED_SUM = String(LEFT_SUMMAND + RIGHT_SUMMAND);

/** The task-framed arithmetic question, over the number the theta computed. */
const DRIVE_QUESTION_PREFIX = `The prior step produced the number ${COMPUTED_SUM}.`;

/**
 * The root, identical in both workspaces: `mode: prompt`, one `tools:` `.theta`
 * entry naming the subagent-mode child, and one `@`…`` query over a computed
 * value so the healthy half has a real turn to drive.
 */
export function toolsChainRootSource(childStem: string): string {
  return [
    "---",
    "mode: prompt",
    "tools:",
    `  - ./${childStem}.theta as child`,
    "---",
    `let n = ${LEFT_SUMMAND} + ${RIGHT_SUMMAND}`,
    "let r = @`The prior step produced the number ${n}. " +
      "What is that number plus 100? Answer with the number only.`?",
    "r",
    "",
  ].join("\n");
}

/** A subagent-mode child with a clean body and one `tools:` entry naming the grandchild. */
export function toolsChainChildSource(
  grandchildStem: string,
  description: string,
  alias: string,
): string {
  return [
    "---",
    "mode: subagent",
    `description: ${description}`,
    "tools:",
    `  - ./${grandchildStem}.theta as ${alias}`,
    "---",
    "let a = 1",
    "",
  ].join("\n");
}

/** Require the computed outbound render and no fail-closed note, never the model's reply. */
export function expectToolsChainTurn(
  driven: Pick<DrivenTurn, "userTexts" | "systemNotes">,
  rootLabel: "grandparent" | "root",
): void {
  expect(
    driven.userTexts.join("\n"),
    `the ${rootLabel}'s QRY-18 rendered template must carry the sum the theta computed; its ` +
      "absence means either the query never reached the provider or the computed value " +
      "never reached the prompt. Observed: " + JSON.stringify(driven.userTexts),
  ).toContain(DRIVE_QUESTION_PREFIX);
  expect(
    driven.systemNotes,
    "every fail-closed ending of a top-level drive lands on the theta-system-note channel " +
      "(the SLSH-3 err note, the cancelled note, the panic framings); the healthy " +
      `${rootLabel} must end with none. Observed: ` + JSON.stringify(driven.systemNotes),
  ).toEqual([]);
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
