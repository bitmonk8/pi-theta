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
import { discoverAndComposeFixtures } from "../src/extension/production-composition";
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
}

const cells: readonly Cell[] = [
  { name: "missing caller schema rejects wrong shape", callerSchema: "", good: false },
  { name: "missing caller schema accepts library shape CONTROL", callerSchema: "", good: true },
  { name: "conflicting caller schema accepts library shape", callerSchema: "schema ROut { other: boolean }", good: true },
  { name: "conflicting caller schema rejects wrong shape CONTROL", callerSchema: "schema ROut { other: boolean }", good: false },
  { name: "matching caller schema rejects wrong shape CONTROL", callerSchema: "schema ROut { tag: string }", good: false },
  { name: "matching caller schema accepts library shape CONTROL", callerSchema: "schema ROut { tag: string }", good: true },
  { name: "library imported schema rejects wrong shape", callerSchema: "", good: false, importedSchema: true },
  { name: "library imported schema accepts library shape CONTROL", callerSchema: "", good: true, importedSchema: true },
];

const FRONTMATTER = "---\nmode: prompt\n---\n";
const VALIDATION_NOTE = "theta /caller returned Err: invoke of ./child.theta failed (return_validation)";

describe("bug 0506 — declaring schema at production composition boundary", () => {
  for (const cell of cells) {
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
        writeFileSync(join(root, "caller.theta"), [
          FRONTMATTER.trimEnd(),
          'import { via_lib } from "./workers/lib.thetalib"',
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
