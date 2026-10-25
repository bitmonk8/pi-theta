// Focused dispatch-parse contract: observe the production factory input without
// replacing it, then call its real parseCallee seam without executing a body.
// The e2e/live witnesses separately prove the user-visible consequence.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as producer from "../src/extension/production-theta-producer";
import { discoverAndComposeFixtures } from "../src/extension/production-composition";
import { checkThetaImports } from "../src/extension/import-static-checks";
import { PiFileSystem } from "../src/seams/pi-file-system";
import { parseDeps, parseDoc } from "./helpers/e2e-s1";
import { hostPi, loadCtx, type RecordedMessage } from "./helpers/fixture-dispatch-harness";
import { B0505_CASES, B0505_LIBRARY, b0505Callee, b0505Caller } from "./helpers/b0505-prompt-import-fixtures";

const READ_TOOL = {
  name: "read", description: "read control", parameters: { type: "object", properties: {} },
  exposure: "direct" as const,
  sourceInfo: { path: "builtin:read", source: "builtin", scope: "user" as const, origin: "top-level" as const },
};
afterEach(() => { vi.restoreAllMocks(); });

async function withParseSeam(
  source: string,
  check: (parse: NonNullable<Parameters<typeof producer.createProductionProducerDeps>[0]["parseCallee"]>, caller: string, callee: string) => Promise<void>,
): Promise<void> {
  const cwd = mkdtempSync(join(tmpdir(), "b0505-unit-"));
  try {
    const root = join(cwd, ".pi", "theta");
    mkdirSync(root, { recursive: true });
    const caller = join(root, "caller.theta");
    const callee = join(root, "callee.theta");
    writeFileSync(join(root, "lib.thetalib"), B0505_LIBRARY);
    writeFileSync(callee, source);
    writeFileSync(caller, b0505Caller());
    const notes: RecordedMessage[] = [];
    const pi = hostPi(notes, "unit parse must not drive a provider");
    pi.getAllTools = () => [READ_TOOL];
    pi.getActiveTools = () => ["read"];
    const spy = vi.spyOn(producer, "createProductionProducerDeps"); // call-through, no mock implementation
    const fixtures = await discoverAndComposeFixtures(pi, loadCtx(cwd));
    expect(fixtures.map((fixture) => fixture.slashName).sort()).toEqual(["callee", "caller"]);
    expect(notes).toEqual([]);
    expect(spy).toHaveBeenCalledTimes(1);
    const parse = spy.mock.calls[0]![0].parseCallee;
    expect(parse, "production must provide its real dispatch parser").toBeTypeOf("function");
    if (parse === undefined) throw new Error("missing production parseCallee");
    await check(parse, caller, callee);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

describe("bug 0505 dispatch parse runtime import carriage", () => {
  for (const tools of ["", "tools: [read]\n"] as const) {
    for (const cell of B0505_CASES.slice(0, 3)) {
      it(`${cell.name} survives structural check ${tools === "" ? "without tools" : "with tools"}`, async () => {
        const source = b0505Callee(cell).replace("mode: prompt\n", `mode: prompt\n${tools}`);
        await withParseSeam(source, async (parse, caller, callee) => {
          const doc = parseDoc(source, callee);
          expect(doc.diagnostics).toEqual([]);
          if (doc.frontmatter === null) throw new Error("fixture frontmatter missing");
          const importCheck = await checkThetaImports({
            slashName: "callee", sourcePath: callee, frontmatter: doc.frontmatter, body: doc.body,
          }, { fs: new PiFileSystem(), parseDeps: parseDeps(), claimDelivery: false });
          expect(importCheck.diagnostics).toEqual([]);
          expect(importCheck.undelivered).toEqual([]);
          expect(importCheck.imports.map(({ name, kind }) => ({ name, kind }))).toEqual([
            cell.name === "imported fn" ? { name: "via_lib", kind: "fn" }
              : cell.name === "imported enum" ? { name: "Color", kind: "enum" }
                : { name: "Payload", kind: "schema" },
          ]);
          // Repeated dispatches must both carry materialisation, not merely a
          // cached structural verdict with runtime channels omitted.
          for (let dispatch = 0; dispatch < 2; dispatch++) {
            const parsed = await parse(caller, "./callee.theta");
            expect(parsed?.kind).toBe("ok");
            if (parsed?.kind !== "ok") throw new Error("callee rejected before carriage assertion");
            expect(parsed.input.callableSet?.entries.size).toBe(tools === "" ? 0 : 1);
            if (cell.name !== "imported fn") {
              expect(parsed.input.importedTypeDecls?.[cell.name === "imported enum" ? "enums" : "schemas"]).toHaveLength(1);
            }
            expect(parsed.input.imports, "B0505 dispatch input must retain materialised runtime imports").toEqual(importCheck.imports);
          }
        });
      });
    }
    it(`no-import CONTROL ${tools === "" ? "without tools" : "with tools"}`, async () => {
      const source = b0505Callee(B0505_CASES[3]).replace("mode: prompt\n", `mode: prompt\n${tools}`);
      await withParseSeam(source, async (parse, caller) => {
        for (let dispatch = 0; dispatch < 2; dispatch++) {
          const parsed = await parse(caller, "./callee.theta");
          expect(parsed?.kind).toBe("ok");
          if (parsed?.kind !== "ok") throw new Error("same-file control rejected");
          expect(Object.hasOwn(parsed.input, "imports"), "empty imports stay absent, not undefined or []").toBe(false);
          expect(parsed.input.callableSet?.entries.size).toBe(tools === "" ? 0 : 1);
        }
      });
    });
  }
});
