// M / M-T — the minimal end-to-end `.loom` pipeline seam.
//
// `buildMinimalLoom` is the narrowest vertical the MVP phase proves: it takes a
// single in-memory `.loom` source (supplied by the `H4a` harness's in-memory
// fixture-supply mechanism — no ambient `src/**` filesystem read, no
// `FileSystem` seam), parses its `mode:` frontmatter and its single untyped
// `@`-query, and returns a `LoomFixture` whose `run` drives **one** prompt-mode
// turn against the caller's conversation: it issues the rendered query text as a
// user turn via `pi.sendUserMessage(...)` and awaits the streamed assistant
// response with `ctx.waitForIdle()`, leaving exactly one appended turn.
//
// This file is the seam the `M-T` tests pin and the `M` implementation fills
// in. Until `M` lands the parse + prompt-mode drive, the body below is an inert
// stub: it registers the command (so the harness can dispatch it) but drives no
// turn, so the `M-T` SLSH-2 assertions red on the absent prompt-mode pipeline —
// the intended-reason red for the tests task.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { LoomFixture } from "../extension/factory";

/** A single in-memory `.loom` source the minimal pipeline discovers. */
export interface MinimalLoomSource {
  /** The slash-command name this loom registers under (its filename stem). */
  readonly slashName: string;
  /** The raw `.loom` file content (frontmatter + body). */
  readonly source: string;
}

/**
 * Build the minimal end-to-end loom pipeline for one in-memory `.loom` source.
 *
 * The returned `LoomFixture` is supplied to the extension factory through the
 * `H4a` in-memory fixture-supply seam; its `run` drives one prompt-mode turn
 * against `pi` (for `sendUserMessage`) and the dispatched `ctx` (for
 * `waitForIdle`).
 *
 * `M` implements: parse `mode:` frontmatter (prompt mode), parse the single
 * untyped `` @`<literal>` `` body query, and on dispatch issue that rendered
 * literal as one user turn whose streamed assistant response appends as a
 * single prompt-mode turn.
 */
export function buildMinimalLoom(
  loom: MinimalLoomSource,
  pi: ExtensionAPI,
): LoomFixture {
  // Reference `pi` so the parameter the prompt-mode driver requires is part of
  // the pinned seam signature `M` implements against (the stub drives no turn).
  void pi;
  return {
    slashName: loom.slashName,
    run: async () => {
      // Inert until `M` lands the `mode:` parse + prompt-mode drive.
    },
  };
}
