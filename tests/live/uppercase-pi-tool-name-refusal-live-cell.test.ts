// Bug 0108 — standalone live registration cell (the 0104/0065/0182
// standalone-live-file precedent; not a numbered live-production-acceptance
// cell).
//
// Additive H8a-T cell. The fixed surface is theta LOAD and REGISTRATION: a
// `tools:` entry naming a Pi tool whose HOST REGISTRY NAME is not
// lowercase-first (`WebSearch`) must be REFUSED at load under
// `theta/load/invalid-pi-tool-name`, and the theta must NOT register — where
// at HEAD (pre-fix) it registered with zero diagnostics and bound the callable
// verbatim (docs/bugs/0108-uppercase-pi-tool-name-mints-unspellable-callable.md).
// The refusal is applied by `resolveCallableSet` in `src/parser/callable-set.ts`,
// on the Pi-tool arm, at the merge point, immediately after the `.theta`
// derived-name arm and before the collision test.
//
// WHY THIS CELL NEEDS A SECOND EXTENSION. The refused input class is
// `[A-Z][A-Za-z0-9_]*` reaching the Pi-tool arm, and only ONE admission route
// can carry it: `resolveRegistryExtensionTool`
// (`src/extension/production-composition.ts`), whose whole predicate is an
// exact-string match of the entry spec against the `pi.getAllTools()`
// snapshot with no shape constraint. The other route,
// `builtinToolDefinition` in the same file, is a closed switch over seven
// lowercase names (`grep`, `read`, `find`, `ls`, `bash`, `edit`, `write`) and
// cannot publish a non-conforming name. `bootShippedExtension`
// (`tests/live/harness.ts`) boots with `noExtensions: true` and only the
// shipped theta entry, so the live `pi.getAllTools()` snapshot holds the seven
// built-ins and theta's own tools — every one of them lowercase-first. The
// fixed arm therefore had NO live reach at all before this cell. It is given
// reach here the only way the bug doc says the input is reachable at all: a
// THIRD-PARTY pi extension registering an uppercase-first tool name, planted
// into the throwaway workspace and loaded through the harness's new additive
// `extraExtensionPaths` option (appended after `SHIPPED_EXTENSION_ENTRY`;
// absent for every other caller, so inert for them).
//
// This cell proves the fix through the real shipped load path —
// `session_start` (→ `resources_discover`) → `composeExtensionInstance`, the
// shipped composition root — over a REAL on-disk `.pi/theta/` discovery walk
// driven by `bootShippedExtension`, against a REAL `AgentSession` whose real
// tool registry aggregates the throwaway extension's `pi.registerTool` calls
// (`AgentSession.getAllTools`). Registration-only: no live model turn is
// driven, so the cell spends no tokens beyond `requireLiveProvider`'s
// credential resolution — the same zero-token profile the bug 0070 / 0104
// registration cells carry.
//
// Observable per AGENTS.md "Assert on real observables, not on `prompt()`
// resolving": `handle.command(stem)` / `handle.registeredNames()`, read off
// the real `ExtensionRunner` after the real `session_start` →
// `pi.registerCommand` step — never a `prompt()` resolution, never assistant
// text. Three thetas, one observable each:
//   (a) `tools: WebSearch`               → must be ABSENT (the fix);
//   (b) `tools: WebSearch as websearch` → PRESENT (escape hatch);
//   (c) `tools: websearch`               → PRESENT (negative control).
// (c) is load-bearing as a PRECONDITION, not as decoration: it is the only
// thing that proves the throwaway extension's tools actually reached
// `pi.getAllTools()` through the extension-registry admission route, so that
// (a)'s absence is attributable to the NAME'S CASE rather than to the tool
// never having been resolvable at all. If (c) does not register the cell
// FAILS LOUDLY naming that unmet precondition — never a skip, never an early
// return.
//
// Subagent child-process launch: NOT reached. All three planted thetas are
// `mode: prompt` (never loaded as a subagent-mode `tools:` callee) and no
// command is ever invoked, so no query-time tool-call loop and no RFC-0006
// subagent-child spawn occurs. `tests/live/harness.ts` already carries the
// `#subagent-child-pins` module-scope setters (`process.argv[1]`,
// `PI_THETA_SUBAGENT_EXTENSION_PIN`, `PI_THETA_SUBAGENT_PARENT_PID`) for the
// cells that DO reach that launch; importing the harness inherits them.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";

/**
 * The uppercase-first host registry name. Distinctive suffix so it cannot
 * collide with an ambient tool of any installed extension .
 */
const UPPER_TOOL = "WebSearch";
/** The lowercase control name, published by the SAME throwaway extension . */
const LOWER_TOOL = "websearch";

/**
 * Source of the throwaway third-party pi extension. Plain ESM with no imports
 * so jiti loads it out of a temp directory with nothing to resolve. It
 * registers both tools at factory time, which is when `pi.registerTool` writes
 * into the extension's tool map — before the session's tool-registry refresh
 * and therefore before theta's `session_start` compose reads
 * `pi.getAllTools()`. The tools are never executed by this cell .
 */
function throwawayExtensionSource(): string {
  const tool = (name: string): string =>
    [
      "  pi.registerTool({",
      `    name: ${JSON.stringify(name)},`,
      `    label: ${JSON.stringify(name)},`,
      '    description: "bug 0108 live cell throwaway tool; never executed",',
      '    parameters: { type: "object", properties: { query: { type: "string" } }, required: [] },',
      "    execute: async () => {",
      '      throw new Error("bug 0108 live cell throwaway tool must never execute");',
      "    },",
      "  });",
    ].join("\n");
  return (
    [
      "export default function (pi) {",
      tool(UPPER_TOOL),
      tool(LOWER_TOOL),
      "}",
      "",
    ].join("\n")
  );
}

/** A `mode: prompt` `.theta` whose `tools:` sequence holds the one given entry. */
function toolsTheta(entry: string): string {
  return ["---", "mode: prompt", "tools:", `  - ${entry}`, "---", "@`hi`"].join("\n") + "\n";
}

describe("bug 0108 live cell — an uppercase-first Pi-tool registry name is refused at live production load ", () => {
  it("un-registers the `- WebSearch` theta while its `as`-renamed sibling and the lowercase control both register", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // (a) The refused shape: the host registry name verbatim, no `as`.
      { source: "project", stem: "upperpitool", text: toolsTheta(UPPER_TOOL) },
      // (b) The escape hatch the refusal Message points the author at.
      {
        source: "project",
        stem: "upperrenamed",
        text: toolsTheta(`${UPPER_TOOL} as ${LOWER_TOOL}`),
      },
      // (c) The negative control: the SAME extension's lowercase tool, through
      // the SAME extension-registry admission route. Its registration is what
      // makes (a)'s absence attributable to the name's case.
      { source: "project", stem: "lowercontrol", text: toolsTheta(LOWER_TOOL) },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const extensionPath = join(workspace.cwd, "bug0108-throwaway-extension.mjs");
    writeFileSync(extensionPath, throwawayExtensionSource(), "utf8");
    const handle = await bootShippedExtension({
      workspace,
      provider,
      extraExtensionPaths: [extensionPath],
    });
    try {
      // Precondition 0 — the throwaway extension loaded and its two tools are
      // in the REAL session tool registry, the snapshot
      // `resolveRegistryExtensionTool` matches against. Without this, every
      // `tools:` entry below would fall to `theta/load/unknown-tool` and the
      // refusal assertion would pass vacuously.
      const hostToolNames = handle.session.getAllTools().map((t) => t.name);
      expect(
        hostToolNames,
        "bug-0108 live cell precondition unmet: the throwaway third-party extension's " +
          "uppercase-first tool did not reach the live `pi.getAllTools()` snapshot, so the " +
          "refused input class was never supplied. Host tools: " + JSON.stringify(hostToolNames),
      ).toContain(UPPER_TOOL);
      expect(
        hostToolNames,
        "bug-0108 live cell precondition unmet: the throwaway extension's lowercase control " +
          "tool is absent from the live `pi.getAllTools()` snapshot. Host tools: " +
          JSON.stringify(hostToolNames),
      ).toContain(LOWER_TOOL);

      // Precondition 1 — cell (c). The lowercase control MUST register: it
      // proves the extension-registry admission route is live end-to-end
      // (host registry → `resolveRegistryExtensionTool` → callable set →
      // `pi.registerCommand`), so the only difference between it and (a) is
      // the registry name's case.
      expect(
        handle.command("lowercontrol"),
        "bug-0108 live cell precondition unmet: the lowercase extension-tool control " +
          `(\`tools: ${LOWER_TOOL}\`) did not register, so the extension-registry admission ` +
          "route did not reach theta's callable set and the refusal assertion below cannot " +
          "witness anything. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // Precondition 2 — cell (b), the escape hatch. Same host tool, same
      // route, only an `as` clause added; it must still register under the
      // renamed callable, bounding the refusal to the DEFAULT name source.
      expect(
        handle.command("upperrenamed"),
        "bug-0108 live cell: the `as`-renamed sibling " +
          `(\`tools: ${UPPER_TOOL} as ${LOWER_TOOL}\`) did not register — the fix over-reached ` +
          "and refused the escape hatch its own Message points the author at. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable — cell (a). Real observable off the settled
      // `ExtensionRunner`, never a `prompt()` resolution (no turn is driven in
      // this cell at all).
      expect(
        handle.command("upperpitool"),
        `bug-0108 live cell: a \`tools: ${UPPER_TOOL}\` theta registered through the real ` +
          "discovery→registration path — `theta/load/invalid-pi-tool-name` did not fire and " +
          "the uppercase-first host registry name was bound verbatim as a callable, the " +
          "state bug 0108 reports. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "bug-0108 live cell: the uppercase-first Pi-tool theta's slash name must not appear " +
          "in the registered set.",
      ).not.toContain("upperpitool");
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
