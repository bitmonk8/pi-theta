// M / M-T — the minimal end-to-end `.theta` pipeline seam.
//
// `buildMinimalTheta` is the narrowest vertical the MVP phase proves: it takes a
// single in-memory `.theta` source (supplied by the `H4a` harness's in-memory
// fixture-supply mechanism — no ambient `src/**` filesystem read, no
// `FileSystem` seam), parses its single untyped `@`-query, and returns a
// `ThetaFixture` whose `run` drives **one** prompt-mode turn against the
// caller's conversation: it issues the rendered query text as a
// user turn via `pi.sendUserMessage(...)` and awaits the streamed assistant
// response with `ctx.waitForIdle()`, leaving exactly one appended turn.
//
// This file is the seam the `M-T` tests pin. `M-T` (tests-task) declared it and
// stubbed the body — it registered the command so the harness could dispatch it,
// but drove no turn; `M` (this leaf) implements the parse + prompt-mode drive
// the `M-T` SLSH-2 assertions pin.

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { ThetaFixture } from "../extension/factory";

/** A single in-memory `.theta` source the minimal pipeline discovers. */
export interface MinimalThetaSource {
  /** The slash-command name this theta registers under (its filename stem). */
  readonly slashName: string;
  /** The raw `.theta` file content (frontmatter + body). */
  readonly source: string;
}

/** The minimal happy-path parse of a single-untyped-query prompt-mode theta. */
interface ParsedMinimalTheta {
  /** The rendered text of the single untyped `` @`<literal>` `` body query. */
  readonly queryText: string;
}

/**
 * Parse the minimal `.theta` source shape the MVP happy path proves: a
 * `mode:`-only frontmatter block delimited by `---` fences and a body holding a
 * single untyped query of the form `` @`<literal>` ``.
 *
 * This is the narrowest parser the MVP vertical needs — full frontmatter,
 * lexing, and body parsing are deepened by the `V*` slices. It skips the fenced
 * frontmatter and extracts the backtick-delimited literal of the single
 * `@`-query, returning the rendered query text verbatim.
 */
function parseMinimalTheta(source: string): ParsedMinimalTheta {
  const lines = source.split("\n");
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
      // Frontmatter lines are not eligible as body queries.
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
      "minimal theta source has no untyped @-query of the form @`<literal>`",
    );
  }
  return { queryText };
}

/**
 * Build the minimal end-to-end theta pipeline for one in-memory `.theta` source.
 *
 * The returned `ThetaFixture` is supplied to the extension factory through the
 * `H4a` in-memory fixture-supply seam; its `run` drives one prompt-mode turn
 * against `pi` (for `sendUserMessage`) and the dispatched `ctx` (for
 * `waitForIdle`).
 *
 * `M` implements: parse the single untyped `` @`<literal>` `` body query, and
 * on dispatch issue that rendered literal as one user turn whose streamed
 * assistant response appends as a single prompt-mode turn.
 */
export function buildMinimalTheta(
  theta: MinimalThetaSource,
  pi: ExtensionAPI,
): ThetaFixture {
  const parsed = parseMinimalTheta(theta.source);
  return {
    slashName: theta.slashName,
    run: async (_args, ctx: ExtensionCommandContext) => {
      // Prompt mode: the single query is a turn the user sees in their session
      // (SLSH-2). Issue the rendered query text as one user turn and await the
      // streamed assistant response; the interpreter resumes only after the
      // turn goes idle, leaving exactly one appended prompt-mode turn.
      pi.sendUserMessage(parsed.queryText);
      await ctx.waitForIdle();
    },
  };
}
