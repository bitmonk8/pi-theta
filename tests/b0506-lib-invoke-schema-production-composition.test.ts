// Bug 0506 provider-free production-composition witness.
// Real filesystem, discovery, parsing, recursive import materialisation,
// production parseCalleeTheta, imported-fn execution, prompt attach, AJV, and
// slash failure-note rendering. Only the outer Pi host/context are doubles.
// This does NOT prove real-host dispatch, provider turns, or child transport;
// tests/live/acceptance/b0506live-lib-invoke-schema-declaring-scope.test.ts
// covers those separately and must not be silently skipped for missing auth.

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { composeExtensionInstance, discoverAndComposeFixtures } from "../src/extension/production-composition";
import { RendererGate } from "../src/extension/system-note-channel";
import { allDiagnostics, makeHost } from "./helpers/compose-workspace-harness";
import {
  dispatchTopLevelFixtures,
  hostPi,
  loadCtx,
  noteContents,
  type RecordedMessage,
} from "./helpers/fixture-dispatch-harness";

interface Cell {
  readonly name: string;
  readonly callerSchema: string;
  readonly good: boolean;
  readonly importedSchema?: boolean;
  readonly route?: "nested" | "reexport";
}

const routedCells: readonly Cell[] = (["nested", "reexport"] as const).flatMap<Cell>((route) => [
  { name: `${route} terminal library rejects bad value`, callerSchema: "", good: false, route },
  { name: `${route} terminal library ignores caller and facade conflicts`, callerSchema: "schema ROut { other: boolean }", good: true, route },
]);

const cells: readonly Cell[] = [
  { name: "missing caller schema rejects wrong shape", callerSchema: "", good: false },
  { name: "missing caller schema accepts library shape CONTROL", callerSchema: "", good: true },
  { name: "conflicting caller schema accepts library shape", callerSchema: "schema ROut { other: boolean }", good: true },
  { name: "conflicting caller schema rejects wrong shape CONTROL", callerSchema: "schema ROut { other: boolean }", good: false },
  { name: "matching caller schema rejects wrong shape CONTROL", callerSchema: "schema ROut { tag: string }", good: false },
  { name: "matching caller schema accepts library shape CONTROL", callerSchema: "schema ROut { tag: string }", good: true },
  { name: "library imported schema rejects wrong shape", callerSchema: "", good: false, importedSchema: true },
  { name: "library imported schema accepts library shape CONTROL", callerSchema: "", good: true, importedSchema: true },
  { name: "library imported schema ignores conflicting caller schema", callerSchema: "schema ROut { other: boolean }", good: true, importedSchema: true },
  { name: "library imported schema with conflicting caller rejects wrong shape CONTROL", callerSchema: "schema ROut { other: boolean }", good: false, importedSchema: true },
];

const FRONTMATTER = "---\nmode: prompt\n---\n";
const VALIDATION_NOTE = "theta /caller returned Err: invoke of ./child.theta failed (return_validation)";

describe("B0506 module collision registration refusal", () => {
  for (const crossSpecifier of [false, true]) {
    it(`${crossSpecifier ? "cross-specifier" : "alias-sibling"} collision refuses registration with one delivered row`, async () => {
      const cwd = realpathSync(mkdtempSync(join(process.cwd(), ".pi", "tmp", "b0506-collision-")));
      try {
        const root = join(cwd, ".pi", "theta");
        mkdirSync(root, { recursive: true });
        writeFileSync(join(cwd, ".pi", "settings.json"), "{}\n");
        writeFileSync(join(root, "types.thetalib"), "schema Detail { n: integer }\nschema Wrapper { detail: Detail }\n");
        writeFileSync(join(root, "other.thetalib"), "schema Detail { s: string }\nschema Other { detail: Detail }\n");
        writeFileSync(join(root, "lib.thetalib"), [
          crossSpecifier ? 'import { Wrapper } from "./types.thetalib"' : 'import { Wrapper as Detail } from "./types.thetalib"',
          ...(crossSpecifier ? ['import { Other } from "./other.thetalib"'] : []),
          "fn one() { null }", "fn two() { null }", "",
        ].join("\n"));
        writeFileSync(join(root, "caller.theta"), FRONTMATTER + 'import { one, two } from "./lib.thetalib"\none()\n');
        // discoverAndComposeFixtures reports load errors via its toast sink,
        // not the runtime theta-system-note recorder. Exercise the shipped
        // composition/channel wiring to assert the actual delivered row.
        const host = makeHost(cwd);
        const wiring = await composeExtensionInstance(host.pi, host.ctx, {}, new RendererGate());
        expect(wiring.thetas.map((f) => f.slashName)).not.toContain("caller");
        const collisions = allDiagnostics(host.notes).filter(diagnostic => diagnostic.code === "theta/load/imported-type-name-collision");
        expect(collisions).toHaveLength(1);
        expect(collisions[0]!.message).toContain("imported type name 'Detail' is claimed by two different declarations");
        expect(collisions[0]!.file).toBe(join(root, "lib.thetalib"));
        const rendered = host.notes.map(note => note.content).join("\n");
        expect(rendered.match(/theta\/load\/imported-type-name-collision/g)).toHaveLength(1);
        expect(rendered).toContain("lib.thetalib");
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    });
  }
});

describe("bug 0506 — declaring schema at production composition boundary", () => {
  for (const cell of [...cells, ...routedCells]) {
    it(cell.name, async () => {
      const cwd = realpathSync(mkdtempSync(join(process.cwd(), ".pi", "tmp", "b0506-compose-")));
      try {
        const root = join(cwd, ".pi", "theta");
        const workers = join(root, "workers");
        mkdirSync(workers, { recursive: true });
        writeFileSync(join(cwd, ".pi", "settings.json"), "{}\n");
        writeFileSync(join(workers, "types.thetalib"), "schema ROut { tag: string }\n");
        writeFileSync(join(workers, "lib.thetalib"), [
          cell.importedSchema ? 'import { ROut } from "./types.thetalib"' : "schema ROut { tag: string }",
          'fn via_lib() { invoke<ROut>("./child.theta") }',
          "",
        ].join("\n"));
        writeFileSync(join(workers, "child.theta"), FRONTMATTER + (cell.good
          ? 'schema ROut { tag: string }\nROut { tag: "x" }\n'
          : '"not-an-ROut"\n'));
        if (cell.route !== undefined) {
          writeFileSync(join(workers, "facade.thetalib"), cell.route === "nested"
            ? 'import { via_lib as inner } from "./lib.thetalib"\nschema ROut { facade: boolean }\nfn via_lib() { inner() }\n'
            : 'export { via_lib as via_lib } from "./lib.thetalib"\nschema ROut { facade: boolean }\n');
        }
        writeFileSync(join(root, "caller.theta"), [
          FRONTMATTER.trimEnd(),
          cell.route !== undefined
            ? 'import { via_lib } from "./workers/facade.thetalib"'
            : 'import { via_lib } from "./workers/lib.thetalib"',
          cell.callerSchema,
          "via_lib()?",
          "",
        ].join("\n"));

        const notes: RecordedMessage[] = [];
        const pi = hostPi(notes, "bug 0506 offline fixture unexpectedly requested a provider turn");
        const fixtures = await discoverAndComposeFixtures(pi, loadCtx(cwd));
        expect(fixtures.map((fixture) => fixture.slashName), "caller registers through real discovery/import/load gates").toContain("caller");
        expect(noteContents(notes), "no load/parse diagnostics can masquerade as the runtime witness").toEqual([]);
        notes.length = 0;
        await dispatchTopLevelFixtures(fixtures, cwd, ["caller"]);
        const actual = noteContents(notes);
        // eslint-disable-next-line no-console
        console.log("B0506 COMPOSITION", JSON.stringify({ cell: cell.name, actual }));
        expect(actual, "B0506 declaring-scope return-validation note").toEqual(cell.good ? [] : [VALIDATION_NOTE]);
      } finally {
        // Remove only this test's freshly-created workspace.
        rmSync(cwd, { recursive: true, force: true });
      }
    });
  }
});
