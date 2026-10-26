// Bug 0507 diagnosis: actual declaring file through lib-to-lib imports, plus
// a separate admission probe for a caller's bare .theta-callable in a lib body.
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkThetaImports } from "../src/extension/import-static-checks";
import { discoverAndComposeFixtures } from "../src/extension/production-composition";
import { parseThetaDocument } from "../src/parser/theta-document";
import { PiFileSystem } from "../src/seams/pi-file-system";
import { parseDeps } from "./helpers/e2e-s1";
import { dispatchTopLevelFixtures, errNote, hostPi, loadCtx, type RecordedMessage } from "./helpers/fixture-dispatch-harness";

const FM = "---\nmode: prompt\n---\n";

async function workspace(run: (cwd: string, dir: string) => Promise<void>) {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), "theta-b0507-reach-")));
  const dir = join(cwd, ".pi", "theta");
  mkdirSync(join(dir, "workers", "deep"), { recursive: true });
  writeFileSync(join(cwd, ".pi", "settings.json"), "{}");
  try { await run(cwd, dir); } finally { rmSync(cwd, { recursive: true, force: true }); }
}

describe("bug 0507 — library invocation-site reachability", () => {
  it("a lib-to-lib call names the innermost declaring library, not either importer", async () => {
    await workspace(async (cwd, dir) => {
      writeFileSync(join(dir, "caller.theta"), FM + 'import { outer } from "./workers/outer.thetalib"\nouter()?\n');
      writeFileSync(join(dir, "workers", "outer.thetalib"), 'import { inner } from "./deep/inner.thetalib"\nfn outer() { inner() }\n');
      const inner = join(dir, "workers", "deep", "inner.thetalib");
      writeFileSync(inner, '// inner residence, distinct from both importers\nfn inner() {\n  invoke("./child.theta")\n}\n');
      const child = join(dir, "workers", "deep", "child.theta");
      writeFileSync(child, FM + 'invoke("./missing.theta")?\n');
      const notes: RecordedMessage[] = [];
      const fixtures = await discoverAndComposeFixtures(hostPi(notes, "B0507 reachability must be provider-free"), loadCtx(cwd));
      await dispatchTopLevelFixtures(fixtures, cwd, ["caller"]);
      const note = errNote(notes, "caller");
      const leaf = "theta /caller returned Err: invoke of ./missing.theta failed (load_failure)";
      expect(note.startsWith(leaf), "the inner library's child really ran").toBe(true);
      expect(note.split(" invoked at ").length - 1).toBe(1);
      expect(note, "B0507 lib-chain actual-site pair").toBe(`${leaf} from ${child.replace(/\\/g, "/")} invoked at ${inner.replace(/\\/g, "/")}:3`);
    });
  });

  it("CONTROL: a caller tools name alone is not admitted as a free bare call in a library", async () => {
    await workspace(async (cwd, dir) => {
      const lib = join(dir, "workers", "bare.thetalib");
      writeFileSync(lib, "fn via_lib() {\n  worker()\n}\n");
      writeFileSync(join(dir, "worker.theta"), "---\nmode: subagent\n---\n42\n");
      const source = '---\nmode: prompt\ntools: ./worker.theta as worker\n---\n' +
        'import { via_lib } from "./workers/bare.thetalib"\nvia_lib()\n';
      const path = join(dir, "caller.theta");
      writeFileSync(path, source);
      const doc = parseThetaDocument({ path, bytes: new TextEncoder().encode(source) }, parseDeps());
      expect(doc.diagnostics, "caller source is legal before loading its library").toEqual([]);
      if (doc.frontmatter === null) throw new Error("caller has no frontmatter");
      const loaded = await checkThetaImports({ slashName: "caller", sourcePath: path, frontmatter: doc.frontmatter, body: doc.body },
        { fs: new PiFileSystem(cwd), parseDeps: parseDeps() });
      expect(loaded.diagnostics.map((d) => ({ code: d.code, file: d.file, line: d.range?.start.line, message: d.message })))
        .toEqual([{ code: "theta/parse/unknown-identifier", file: lib.replace(/\\/g, "/"), line: 2, message: "unknown identifier 'worker'" }]);
    });
  });
});
