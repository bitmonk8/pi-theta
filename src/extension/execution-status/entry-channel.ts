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

/** PIC-71: the fixed `theta-progress-entry` custom-entry type literal. */
export const THETA_PROGRESS_ENTRY_TYPE = "theta-progress-entry";

export interface EntryChannelHandle {
  /** `true` iff both surfaces are present AND the renderer registered without throwing. */
  live(): boolean;
  /** `true` = delivered as an entry; `false` = caller falls back to `sendMessage`. */
  append(note: SystemNote): boolean;
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
  };
}

/**
 * The `theta-progress-entry` renderer (PIC-71: byte-identical lines to the
 * `theta-system-note` message renderer for the same note). It delegates to the
 * SAME body formatter the message renderer uses, so a note migrated onto this
 * channel renders the same lines it would have on the message channel — and
 * inherits that helper's PIC-56 width fitting and PIC-21 never-throw guard.
 */
export function createProgressEntryRenderer(): (
  entry: CustomEntry<SystemNote>,
  options: EntryRenderOptions,
  theme: unknown,
) => Component | undefined {
  return (entry, _options, _theme): Component | undefined => {
    // PIC-21 analogue: a malformed payload must not throw out of the renderer
    // invocation, so the fields are read defensively before formatting.
    const data = entry.data as Partial<SystemNote> | undefined;
    const content = typeof data?.content === "string" ? data.content : "";
    return renderSystemNoteBody(content, data?.display);
  };
}
