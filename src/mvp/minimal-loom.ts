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

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { LoomFixture } from "../extension/factory";

/** A single in-memory `.loom` source the minimal pipeline discovers. */
export interface MinimalLoomSource {
  /** The slash-command name this loom registers under (its filename stem). */
  readonly slashName: string;
  /** The raw `.loom` file content (frontmatter + body). */
  readonly source: string;
}

/** The minimal happy-path parse of a single-untyped-query prompt-mode loom. */
interface ParsedMinimalLoom {
  /** The frontmatter `mode:` value (the MVP happy path requires `prompt`). */
  readonly mode: string;
  /** The rendered text of the single untyped `` @`<literal>` `` body query. */
  readonly queryText: string;
}

/**
 * Parse the minimal `.loom` source shape the MVP happy path proves: a
 * `mode:`-only frontmatter block delimited by `---` fences and a body holding a
 * single untyped query of the form `` @`<literal>` ``.
 *
 * This is the narrowest parser the MVP vertical needs — full frontmatter,
 * lexing, and body parsing are deepened by the `V*` slices. It reads `mode:`
 * from the frontmatter and extracts the backtick-delimited literal of the
 * single `@`-query, returning the rendered query text verbatim.
 */
function parseMinimalLoom(source: string): ParsedMinimalLoom {
  const lines = source.split("\n");
  let mode = "";
  let queryText: string | undefined;
  let inFrontmatter = false;
  let frontmatterClosed = false;

  for (const line of lines) {
    if (line.trim() === "---") {
      if (!inFrontmatter && !frontmatterClosed) {
        inFrontmatter = true;
      } else if (inFrontmatter) {
        inFrontmatter = false;
        frontmatterClosed = true;
      }
      continue;
    }
    if (inFrontmatter) {
      const match = /^\s*mode\s*:\s*(\S+)\s*$/.exec(line);
      if (match !== null && match[1] !== undefined) {
        mode = match[1];
      }
      continue;
    }
    // Body: the single untyped `@`-query of the form `` @`<literal>` ``.
    const queryMatch = /^\s*@`([^`]*)`\s*$/.exec(line);
    if (queryMatch !== null && queryMatch[1] !== undefined) {
      queryText = queryMatch[1];
    }
  }

  if (queryText === undefined) {
    throw new Error(
      "minimal loom source has no untyped @-query of the form @`<literal>`",
    );
  }
  return { mode, queryText };
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
  const parsed = parseMinimalLoom(loom.source);
  return {
    slashName: loom.slashName,
    run: async (_args, ctx: ExtensionCommandContext) => {
      // Prompt mode: the single query is a turn the user sees in their session
      // (SLSH-2). Issue the rendered query text as one user turn and await the
      // streamed assistant response; the interpreter resumes only after the
      // turn goes idle, leaving exactly one appended prompt-mode turn.
      void parsed.mode;
      pi.sendUserMessage(parsed.queryText);
      await ctx.waitForIdle();
    },
  };
}
