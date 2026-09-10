// RFC 0010 (execution-status.md EXST-8; runtime-event-channel.md PIC-71/72) —
// the entry channel: `pi.appendEntry` / `pi.registerEntryRenderer` for the
// three migrated operator note classes (batch / structural / recovery).
//
// The channel is best-effort under the optional-capability class (PIC-73):
// both members are `typeof`-probed, the factory-time renderer registration is
// per-call guarded, and the FIRST hard failure of either — an absent member, a
// throwing registration, a throwing `appendEntry` — marks the channel dead for
// the session so PIC-72's message-channel fallback owns all later delivery.
// Every degrade is silent (no diagnostic; the registries are closed, DIAG-2).
//
// Spec: docs/spec_topics/execution-status.md EXST-8;
// docs/spec_topics/pi-integration-contract/runtime-event-channel.md PIC-71/72.

import type { Component } from "@earendil-works/pi-tui";
import type { CustomEntry, EntryRenderOptions, ExtensionAPI } from "@earendil-works/pi-coding-agent"; // allow-pi-surface: PIC#71 — CustomEntry/EntryRenderOptions are the theta-progress-entry renderer's own SDK carrier types, not yet SDK_SURFACE_INVENTORY-promoted (analyst's par. 1 sdk-inventory.ts edit)
import type { SystemNote } from "../system-note-channel";
import { renderSystemNoteBody } from "../system-note-renderer";
import type { ProgressMilestone } from "./types";

/** PIC-71: the fixed `theta-progress-entry` custom-entry type literal. */
export const THETA_PROGRESS_ENTRY_TYPE = "theta-progress-entry";

export interface EntryChannelHandle {
  /** `true` iff both surfaces are present AND the renderer registered without throwing. */
  live(): boolean;
  /** `true` = delivered as an entry; `false` = caller falls back to `sendMessage`. */
  append(note: SystemNote): boolean;
  /** L3 (EXST-14/PIC-71): one durable milestone entry. Same live()/degrade
   *  rules as `append` — `false` means "skipped silently", NEVER a
   *  `sendMessage` fallback (EXST-14: milestones never fall back). */
  appendMilestone(m: ProgressMilestone): boolean;
}

/**
 * Construct the entry channel: presence-probe `pi.appendEntry` /
 * `pi.registerEntryRenderer` (PIC-73, `typeof`-only, never calls either
 * member at probe time), then attempt the factory-time renderer
 * registration. A throw there marks the channel permanently dead for the
 * session (PIC-71 / Erratum A) — silently, no diagnostic.
 */
export function createEntryChannel(pi: ExtensionAPI): EntryChannelHandle {
  const present =
    typeof pi.appendEntry === "function" && typeof pi.registerEntryRenderer === "function";
  let dead = !present;
  if (present) {
    try {
      pi.registerEntryRenderer(THETA_PROGRESS_ENTRY_TYPE, createProgressEntryRenderer());
    } catch { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
      // PIC-71 / Erratum A: a throwing registration marks the channel ABSENT
      // for the session — an entry is never appended without its renderer.
      dead = true;
    }
  }

  return {
    live(): boolean {
      return !dead;
    },
    append(note: SystemNote): boolean {
      if (dead) {
        return false;
      }
      try {
        // PIC-72: no dedup on this channel — a re-scan re-appends.
        pi.appendEntry(THETA_PROGRESS_ENTRY_TYPE, note);
        return true;
      } catch { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
        // EXST-8 / PIC-72: the first append failure permanently degrades the
        // channel; this note and every later one fall back to `sendMessage`.
        dead = true;
        return false;
      }
    },
    appendMilestone(m: ProgressMilestone): boolean {
      if (dead) {
        return false;
      }
      try {
        // PIC-71: the milestone shares the SAME `theta-progress-entry` custom-
        // entry type as the migrated-note payload; the renderer discriminates
        // on the `milestone` key (par. 6 of the L3 seam-sheet addendum).
        pi.appendEntry(THETA_PROGRESS_ENTRY_TYPE, { milestone: m });
        return true;
      } catch { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
        // EXST-14: no `sendMessage` fallback for milestones — the channel
        // simply degrades dead, same as the note-append arm above.
        dead = true;
        return false;
      }
    },
  };
}

/**
 * One pre-fitted milestone line. A CLASS (not the note arm's closure-captured
 * object literal) so the rendered line is an own enumerable property: the
 * milestone template is then inspectable on the returned `Component` without
 * a render pass, which is how the L3 suite pins the template. `render`
 * hard-clips rather than wraps — a milestone is one line by contract (par. 6
 * of the L3 seam sheet) — and never throws (PIC-21).
 */
class MilestoneLineComponent implements Component {
  readonly lines: readonly string[];

  constructor(line: string) {
    this.lines = [line];
  }

  render(width: number): string[] {
    return this.lines.map((line) =>
      width > 0 && line.length > width ? `${line.slice(0, Math.max(0, width - 1))}…` : line,
    );
  }

  invalidate(): void {}
}

/**
 * PIC-71's milestone template (par. 6 of the L3 seam sheet, exact):
 * `progress[ /<theta>][ <scope>]: <message>[ (<done>/<total>)][ (+<n> dropped)]`
 * — absent parts omitted. The fields are read defensively: the payload has
 * already been clamped at the emitter, but a renderer must not depend on it.
 */
function renderMilestoneLine(milestone: Record<string, unknown>): string {
  const theta = typeof milestone.theta === "string" ? ` /${milestone.theta}` : "";
  const scope = typeof milestone.scope === "string" ? ` ${milestone.scope}` : "";
  const message = typeof milestone.message === "string" ? milestone.message : "";
  const done = milestone.done;
  const total = milestone.total;
  const counts =
    typeof done === "number" && typeof total === "number" ? ` (${done}/${total})` : "";
  const dropped = milestone.dropped;
  const droppedSegment =
    typeof dropped === "number" && dropped > 0 ? ` (+${dropped} dropped)` : "";
  return `progress${theta}${scope}: ${message}${counts}${droppedSegment}`;
}

/**
 * The `theta-progress-entry` renderer. Two arms discriminated on the
 * `milestone` key (both payload classes share the one custom-entry type,
 * PIC-71):
 *
 *   - a MIGRATED OPERATOR NOTE delegates to the SAME body formatter the
 *     `theta-system-note` message renderer uses, so it renders byte-identical
 *     lines on either channel and inherits that helper's PIC-56 width fitting
 *     and PIC-21 never-throw guard;
 *   - an L3 MILESTONE (EXST-14) draws the PIC-71 template line.
 */
export function createProgressEntryRenderer(): (
  entry: CustomEntry<SystemNote>,
  options: EntryRenderOptions,
  theme: unknown,
) => Component | undefined {
  return (entry, _options, _theme): Component | undefined => {
    // PIC-21 analogue: a malformed payload must not throw out of the renderer
    // invocation, so the fields are read defensively before formatting.
    const data = entry.data as Record<string, unknown> | undefined;
    const milestone = data?.milestone;
    if (milestone !== undefined) {
      if (typeof milestone !== "object" || milestone === null) {
        return undefined; // malformed milestone payload: render nothing, never throw
      }
      return new MilestoneLineComponent(
        renderMilestoneLine(milestone as Record<string, unknown>),
      );
    }
    const content = typeof data?.content === "string" ? data.content : "";
    const display = typeof data?.display === "boolean" ? data.display : undefined;
    return renderSystemNoteBody(content, display);
  };
}
