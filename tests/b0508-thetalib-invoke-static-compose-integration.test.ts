// Production filesystem/load integration for complete graphs and shared-site
// decision vs delivery. Outer SDK host is doubled; companion H9a covers host.
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { allDiagnostics, runLoadPass, type RecordedNote } from "./helpers/compose-workspace-harness";
import { createThetaExtension } from "../src/extension/factory";
import { composeExtensionInstance, type ExtensionInstanceWiring } from "../src/extension/production-composition";
import { RELOAD_DEBOUNCE_WINDOW_MS } from "../src/extension/reload-debounce";
import type { FileWatchEvent, OnWatchTerminate, Unsubscribe } from "../src/seams/file-watcher";
import { FakeClock } from "./helpers/fake-clock";
import { FakeFileWatcher, waitFor } from "./helpers/fake-file-watcher";
import { makeHarness } from "./helpers/watch-arming-harness";

class RootScopedWatcher extends FakeFileWatcher {
  readonly watchCalls: string[][] = [];
  active = 0;
  override watch(roots: readonly string[], handler: (event: FileWatchEvent) => void, onTerminate?: OnWatchTerminate): Unsubscribe {
    this.watchCalls.push([...roots]); this.active++;
    const stop = super.watch(roots, handler, onTerminate);
    let stopped = false;
    return () => { if (stopped) return; stopped = true; this.active--; stop(); };
  }
  override emit(event: FileWatchEvent): void {
    if (this.watchCalls.at(-1)?.some(root => event.path === root || event.path.startsWith(root + "/"))) super.emit(event);
  }
}

const P = "---\nmode: prompt\n---\n";
async function workspace(files: Record<string, string>, run: (cwd: string, root: string) => Promise<void>) {
  const cwd = realpathSync(mkdtempSync(join(process.cwd(), ".pi", "tmp", "b0508-compose-")));
  const root = join(cwd, ".pi", "theta");
  try {
    mkdirSync(root, { recursive: true });
    writeFileSync(join(cwd, ".pi", "settings.json"), "{}\n");
    for (const [name, text] of Object.entries(files)) {
      const path = join(root, name); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text);
    }
    await run(cwd, root);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
}

describe("B0508 compose preparation and delivery", () => {
  for (const reverse of [false, true]) {
    it(`all importers refuse a shared bad site despite delivery dedup; reverse=${reverse}`, async () => {
      const names = reverse ? ["b", "a"] : ["a", "b"];
      await workspace({
        ...Object.fromEntries(names.map(n => [`${n}.theta`, P + 'import { entry } from "./lib.thetalib"\n0\n'])),
        "healthy.theta": P + "0\n",
        "child.theta": P + '"ok"\n',
        "lib.thetalib": 'fn entry() { invoke<integer>("./child.theta") }\n',
      }, async (cwd, root) => {
        for (let passNumber = 0; passNumber < 2; passNumber++) {
          const pass = await runLoadPass({ cwd });
          expect(pass.notified).toEqual([]); expect(pass.offChannel).toEqual([]);
          expect([...pass.registered].sort()).toEqual(["child", "healthy"]);
          expect(allDiagnostics(pass.notes).map(d => [d.code, d.file])).toEqual([["theta/parse/invoke-return-type-mismatch", join(root, "lib.thetalib")]]);
        }
      });
    });
    it(`complete library A -> B -> A graph before either registration; reverse=${reverse}`, async () => {
      const entries = [
        ["a.theta", P + 'import { entry } from "./a.thetalib"\n0\n'],
        ["b.theta", P + 'import { entry } from "./b.thetalib"\n0\n'],
      ];
      await workspace({
        ...Object.fromEntries(reverse ? entries.reverse() : entries),
        "a.thetalib": 'fn entry() { invoke("./b.theta") }\n',
        "b.thetalib": 'fn entry() { invoke("./a.theta") }\n',
      }, async (cwd, root) => {
        const pass = await runLoadPass({ cwd });
        expect(pass.registered).toEqual([]);
        const rows = allDiagnostics(pass.notes);
        expect(rows.map(d => d.code)).toEqual(["theta/load/invocation-cycle", "theta/load/invocation-cycle"]);
        expect(rows.every(d => d.file === undefined && d.range === undefined && d.related === undefined)).toBe(true);
        writeFileSync(join(root, "b.thetalib"), "fn entry() { 0 }\n");
        const corrected = await runLoadPass({ cwd });
        expect(allDiagnostics(corrected.notes)).toEqual([]);
        expect([...corrected.registered].sort()).toEqual(["a", "b"]);
      });
    });
  }
  it("shared missing-callee warning delivers once but admits both importers", async () => {
    await workspace({
      "a.theta": P + 'import { entry } from "./lib.thetalib"\n0\n',
      "b.theta": P + 'import { entry } from "./lib.thetalib"\n0\n',
      "lib.thetalib": 'fn entry() { invoke("./missing.theta") }\n',
    }, async cwd => {
      const pass = await runLoadPass({ cwd });
      expect([...pass.registered].sort()).toEqual(["a", "b"]);
      expect(allDiagnostics(pass.notes).map(d => [d.code, d.severity])).toEqual([["theta/load/callee-has-errors", "warning"]]);
    });
  });
  it("refused out-of-root library remains watched; broken reload re-emits and corrected reload drops stale cycle edges", async () => {
    await workspace({
      "a.theta": P + 'import { entry } from "../lib/worker.thetalib"\n0\n',
      "b.theta": P + 'invoke("./a.theta")?\n',
      "../lib/worker.thetalib": 'fn entry() { invoke("../theta/b.theta") }\n',
    }, async (cwd, root) => {
      const watcher = new RootScopedWatcher(); const clock = new FakeClock();
      const notes: RecordedNote[] = [];
      const harness = makeHarness(cwd, {}, { sendMessage: message => notes.push(message) });
      let wiring: ExtensionInstanceWiring | undefined;
      createThetaExtension({ fixtures: [], composeInstance: async (pi, ctx, ownRegisteredNames) => {
        wiring = await composeExtensionInstance(pi, ctx, { fileWatcher: watcher, clock }, undefined, ownRegisteredNames);
        return wiring;
      } })(harness.pi);
      try {
        await harness.fireSessionStart();
        await waitFor(() => watcher.active === 1, "initial watcher arming");
        expect(wiring?.registry.get("a")).toBeUndefined(); expect(wiring?.registry.get("b")).toBeUndefined();
        expect(allDiagnostics(notes).map(d => d.code)).toEqual(["theta/load/invocation-cycle", "theta/load/invocation-cycle"]);
        const lib = join(root, "../lib/worker.thetalib");
        expect(watcher.watchCalls[0]).toContain(dirname(lib));
        // Still broken: fresh pass must not inherit graph/delivery decisions.
        const before = notes.length;
        writeFileSync(lib, 'fn entry() { if false { invoke("../theta/b.theta") } }\n');
        watcher.emit({ kind: "change", path: lib }); clock.advance(RELOAD_DEBOUNCE_WINDOW_MS);
        await waitFor(() => allDiagnostics(notes.slice(before)).length === 2, "broken reload diagnostic re-emission");
        expect(wiring?.registry.get("a")).toBeUndefined();
        writeFileSync(lib, "fn entry() { 0 }\n");
        watcher.emit({ kind: "change", path: lib }); clock.advance(RELOAD_DEBOUNCE_WINDOW_MS);
        await waitFor(() => wiring?.registry.get("a") !== undefined && wiring.registry.get("b") !== undefined, "corrected library reload registration");
        expect(watcher.watchCalls).toHaveLength(1); expect(watcher.active).toBe(1);
      } finally { await harness.fireSessionShutdown("quit"); }
      expect(watcher.active).toBe(0);
    });
  });
  it("decidable named-library annotation refuses at load, while unknown callee summaries retain runtime coverage", async () => {
    await workspace({
      "a.theta": P + 'schema ROut = string\nimport { entry } from "./lib.thetalib"\n0\n',
      "lib.thetalib": 'schema ROut { tag: string }\nfn entry() { invoke<ROut>("./child.theta") }\n',
      "child.theta": P + '"not-an-ROut"\n',
    }, async (cwd, root) => {
      const pass = await runLoadPass({ cwd });
      expect(pass.registered).not.toContain("a");
      expect(allDiagnostics(pass.notes).map(d => [d.code, d.file])).toEqual([["theta/parse/invoke-return-type-mismatch", join(root, "lib.thetalib")]]);
      writeFileSync(join(root, "child.theta"), P + 'fn payload() { "not-an-ROut" }\npayload()\n');
      const deferred = await runLoadPass({ cwd });
      expect(allDiagnostics(deferred.notes)).toEqual([]);
      expect(deferred.registered).toContain("a");
      // The existing 0506 composition/live tests dispatch this opaque-return
      // shape and retain their exact runtime return_validation assertions.
    });
  });
  it("schema-only exclusions do not exempt ordinary library parse/import checks", async () => {
    await workspace({
      "a.theta": P + 'import { T } from "./lib.thetalib"\n0\n',
      "lib.thetalib": 'schema T = string\nimport { Missing } from "./absent.thetalib"\nfn entry() { 0 }\n',
    }, async cwd => {
      const pass = await runLoadPass({ cwd });
      expect(pass.registered).toEqual([]);
      expect(allDiagnostics(pass.notes).map(d => d.code)).toContain("theta/load/unresolvable-thetalib-path");
    });
  });
});
