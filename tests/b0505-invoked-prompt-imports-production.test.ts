// Bug 0505: real filesystem -> discovery -> production composition ->
// parseCalleeTheta -> prompt attach -> lexical import resolution -> slash notes.
// Only the outer Pi host/context are doubles. This deterministic composition
// witness does NOT prove real Pi dispatch, provider turns or child transport;
// tests/live/acceptance/b0505live-invoked-prompt-imports.test.ts supplies the
// real-host/live coverage. No subagent child is involved in prompt -> prompt.
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { discoverAndComposeFixtures } from "../src/extension/production-composition";
import {
  dispatchTopLevelFixtures, hostPi, loadCtx, noteContents, type RecordedMessage,
} from "./helpers/fixture-dispatch-harness";
import {
  B0505_CASES, B0505_LIBRARY, b0505Callee, b0505Caller,
} from "./helpers/b0505-prompt-import-fixtures";

describe("bug 0505 production composition: callee keeps its own imports", () => {
  for (const cell of B0505_CASES) {
    for (const route of ["direct", "invoked"] as const) {
      it(`${cell.name} ${route}${route === "direct" ? " CONTROL" : ""}`, async () => {
        const cwd = realpathSync(mkdtempSync(join(tmpdir(), "b0505-compose-")));
        try {
          const root = join(cwd, ".pi", "theta");
          mkdirSync(root, { recursive: true });
          writeFileSync(join(cwd, ".pi", "settings.json"), "{}\n");
          writeFileSync(join(root, "lib.thetalib"), B0505_LIBRARY);
          writeFileSync(join(root, "callee.theta"), b0505Callee(cell));
          writeFileSync(join(root, "caller.theta"), b0505Caller());
          const notes: RecordedMessage[] = [];
          const pi = hostPi(notes, "B0505 offline witness unexpectedly requested a provider turn");
          const ctx = loadCtx(cwd);
          const loadMessages: string[] = [];
          ctx.ui.notify = (message): void => { loadMessages.push(message); };
          const fixtures = await discoverAndComposeFixtures(pi, ctx);
          expect(fixtures.map((fixture) => fixture.slashName).sort(), "both files pass actual registration gates").toEqual(["callee", "caller"]);
          expect(loadMessages, "no load diagnostic can masquerade as the import-runtime failure").toEqual([]);
          expect(noteContents(notes), "clean load channel").toEqual([]);
          await dispatchTopLevelFixtures(fixtures, cwd, [route === "direct" ? "callee" : "caller"]);
          const actual = noteContents(notes);
          // Preserve exact observable, including unknown_tool/panic and provenance.
          // eslint-disable-next-line no-console
          console.log("B0505 COMPOSITION", JSON.stringify({ cell: cell.name, route, actual }));
          expect(actual, "B0505 callee import resolution must not fail closed").toEqual([]);
        } finally {
          rmSync(cwd, { recursive: true, force: true });
        }
      });
    }
  }
});
