// B0508: real filesystem -> discovery -> shipped composition/load gates ->
// delivered diagnostics and registered slash set. Only the outer SDK host is
// doubled; no parser, import loader, resolver or invoke check is mocked.
// This does NOT prove real-host command registration/provider/child transport;
// the companion H9a test proves registration in a real pi host separately.
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { allDiagnostics, runLoadPass } from "./helpers/compose-workspace-harness";

const P = "---\nmode: prompt\n---\n";
// One required string is binder-bypass eligible: no missing binder model can
// obscure a static-check witness. No test requests a provider turn.
const PARAM_CHILD = "---\nmode: prompt\nparams:\n  x: string\n---\nx\n";
const cells = [
  { name: "cycle", code: "theta/load/invocation-cycle", bad: 'invoke("./caller.theta")', good: 'invoke("./child.theta")', child: P + '"ok"\n' },
  { name: "escape", code: "theta/load/invoke-path-escape", bad: 'invoke("../../outside.theta")', good: 'invoke("./child.theta")', child: P + '"ok"\n' },
  { name: "too-many", code: "theta/parse/invoke-arity-too-many", bad: 'invoke("./child.theta", "x", "y")', good: 'invoke("./child.theta", "x")', child: PARAM_CHILD },
  { name: "too-few", code: "theta/parse/invoke-arity-too-few", bad: 'invoke("./child.theta")', good: 'invoke("./child.theta", "x")', child: PARAM_CHILD },
  { name: "arg-type", code: "theta/parse/invoke-arg-type-mismatch", bad: 'invoke("./child.theta", 7)', good: 'invoke("./child.theta", "x")', child: PARAM_CHILD },
  { name: "return-type", code: "theta/parse/invoke-return-type-mismatch", bad: 'invoke<integer>("./child.theta")', good: 'invoke<string>("./child.theta")', child: P + '"ok"\n' },
] as const;

describe("B0508 imported fn invoke static checks through production composition", () => {
  for (const cell of cells) {
    for (const route of ["direct-control", "library", "healthy-control"] as const) {
      it(`${cell.name} ${route}`, async () => {
        const cwd = realpathSync(mkdtempSync(join(process.cwd(), ".pi", "tmp", "b0508-load-")));
        try {
          const root = join(cwd, ".pi", "theta");
          mkdirSync(root, { recursive: true });
          writeFileSync(join(cwd, ".pi", "settings.json"), "{}\n");
          writeFileSync(join(cwd, "outside.theta"), P + '"outside"\n');
          writeFileSync(join(root, "child.theta"), cell.child);
          const expression = route === "healthy-control" ? cell.good : cell.bad;
          writeFileSync(join(root, "lib.thetalib"), `fn probe() { ${expression} }\n`);
          writeFileSync(join(root, "caller.theta"), P + (route === "direct-control"
            ? `${expression}?\n`
            : 'import { probe } from "./lib.thetalib"\nprobe()?\n'));
          const pass = await runLoadPass({ cwd });
          const rows = allDiagnostics(pass.notes);
          const actual = { codes: rows.map(d => d.code), callerRegistered: pass.registered.includes("caller") };
          // Full diagnostics let a future fixture/parse error be distinguished
          // from the missing-walk defect, rather than accepting any nonzero.
          // eslint-disable-next-line no-console
          console.log("B0508 LOAD", JSON.stringify({ cell: cell.name, route, actual, rows, registered: pass.registered }));
          expect(pass.notified, "no fallback UI/infra failure").toEqual([]);
          expect(pass.offChannel, "diagnostics stay on the production channel").toEqual([]);
          expect(pass.registered, "healthy callee registers without binder/model prerequisites").toContain("child");
          expect(actual, `B0508 ${cell.name} ${route}: static diagnostic and registration disposition`).toEqual(route === "healthy-control"
            ? { codes: [], callerRegistered: true }
            : { codes: [cell.code], callerRegistered: false });
        } finally {
          rmSync(cwd, { recursive: true, force: true });
        }
      });
    }
  }

  it("declaring library residence wins over an incompatible caller-side decoy CONTROL", async () => {
    const cwd = realpathSync(mkdtempSync(join(process.cwd(), ".pi", "tmp", "b0508-residence-")));
    try {
      const root = join(cwd, ".pi", "theta");
      mkdirSync(join(root, "workers"), { recursive: true });
      writeFileSync(join(cwd, ".pi", "settings.json"), "{}\n");
      writeFileSync(join(root, "child.theta"), P + '"wrong caller-side type"\n');
      writeFileSync(join(root, "workers", "child.theta"), P + "42\n");
      writeFileSync(join(root, "workers", "lib.thetalib"), 'fn probe() { invoke<integer>("./child.theta") }\n');
      writeFileSync(join(root, "caller.theta"), P + 'import { probe } from "./workers/lib.thetalib"\nprobe()?\n');
      const pass = await runLoadPass({ cwd });
      expect(allDiagnostics(pass.notes)).toEqual([]);
      expect(pass.registered).toContain("caller");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
