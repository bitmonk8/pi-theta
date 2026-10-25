// Downstream controls explain the two different failure surfaces without
// changing production. Omission here is explicit fault injection, NOT a new
// end-to-end witness; the dispatch-carriage unit test pins the actual defect.
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { executeBody } from "../src/runtime/statement-executor";
import { buildBoundEnvironment } from "../src/extension/callable-lowering";
import { InterpolatedResultPanic, NullMemberAccessPanic } from "../src/runtime/runtime-panics";
import { bindImportedBody } from "./helpers/thetalib-load-harness";
import { B0505_CASES, B0505_LIBRARY } from "./helpers/b0505-prompt-import-fixtures";

async function bind(cell: typeof B0505_CASES[number], query = false) {
  return bindImportedBody([
    cell.declarations,
    `let answer = ${cell.expression}`,
    ...(query ? ["@`Computed value: ${answer}. What is that value plus 0? Answer with the number only.`?"] : []),
    "answer",
  ].join("\n"), { "/proj/lib.thetalib": B0505_LIBRARY }, {} as ModelRegistry);
}

describe("bug 0505 downstream runtime isolation controls", () => {
  for (const cell of B0505_CASES) {
    it(`${cell.name}: materialised imports execute to the exact value CONTROL`, async () => {
      const { app, check, binding } = await bind(cell);
      try {
        expect(app.diagnostics).toEqual([]);
        expect(check.diagnostics).toEqual([]);
        expect(await executeBody(app.body, binding.executeDeps)).toEqual({ outcome: "success", result: { present: true, value: 777 } });
      } finally { binding.finishInvocation?.(); }
    });
  }

  it("omitted fn import returns unknown_tool, then live-style interpolation panics CONTROL", async () => {
    for (const query of [false, true]) {
      const { app, check, binding } = await bind(B0505_CASES[0], query);
      try {
        expect(app.diagnostics).toEqual([]);
        expect(check.diagnostics).toEqual([]);
        expect(check.imports).toHaveLength(1);
        const env = buildBoundEnvironment(app.body, undefined, undefined, [], "/proj/app.theta");
        expect(env.resolve("via_lib")).toEqual({ arm: "unresolved" });
        const run = executeBody(app.body, { ...binding.executeDeps, env });
        if (query) {
          await expect(run).rejects.toBeInstanceOf(InterpolatedResultPanic);
          expect(env.resolve("answer")).toMatchObject({ arm: "local", value: { ok: false, error: { kind: "code_tool", cause: "unknown_tool" } } });
        } else {
          expect(await run).toMatchObject({ outcome: "success", result: { present: true, value: { ok: false, error: { kind: "code_tool", cause: "unknown_tool" } } } });
        }
      } finally { binding.finishInvocation?.(); }
    }
  });

  it("omitted enum import raises null member access before any query CONTROL", async () => {
    const { app, check, binding } = await bind(B0505_CASES[1]);
    try {
      expect(app.diagnostics).toEqual([]);
      expect(check.diagnostics).toEqual([]);
      const env = buildBoundEnvironment(app.body, undefined, undefined, [], "/proj/app.theta");
      expect(env.resolve("Color")).toEqual({ arm: "unresolved" });
      expect(env.resolveEnumVariant("Color", "Red")).toBeUndefined();
      await expect(executeBody(app.body, { ...binding.executeDeps, env })).rejects.toBeInstanceOf(NullMemberAccessPanic);
    } finally { binding.finishInvocation?.(); }
  });

  it("omitted schema import still permits a constructor field read CONTROL, not a claimed red", async () => {
    const { app, check, binding } = await bind(B0505_CASES[2]);
    try {
      expect(app.diagnostics).toEqual([]);
      expect(check.diagnostics).toEqual([]);
      const env = buildBoundEnvironment(app.body, undefined, undefined, [], "/proj/app.theta");
      expect(env.resolveSchema("Payload")).toBeUndefined();
      expect(await executeBody(app.body, { ...binding.executeDeps, env })).toEqual({ outcome: "success", result: { present: true, value: 777 } });
    } finally { binding.finishInvocation?.(); }
  });
});
