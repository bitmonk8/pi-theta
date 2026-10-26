// Bug 0519: guard the production nodeSpawn convention, not arbitrary aliases,
// dynamic imports, native addons, or third-party placement implementations.
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { tsFiles } from "./helpers/ts-files";

function hasFinalWindowsHideTrue(options: ts.Expression | undefined): boolean {
  if (options === undefined || !ts.isObjectLiteralExpression(options)) return false;
  let hidden = false;
  for (const property of options.properties) {
    // An unknown later key or spread may overwrite windowsHide. A subsequent
    // explicit true assignment restores the guarantee, matching object order.
    if (ts.isSpreadAssignment(property) || ts.isComputedPropertyName(property.name)) {
      hidden = false;
    } else if ((ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) &&
      property.name.text === "windowsHide") {
      hidden = ts.isPropertyAssignment(property) && property.initializer.kind === ts.SyntaxKind.TrueKeyword;
    }
  }
  return hidden;
}

function scanSpawns(source: string, path: string): { calls: number; offenders: string[] } {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  let calls = 0;
  const offenders: string[] = [];
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "nodeSpawn") {
      calls++;
      if (!hasFinalWindowsHideTrue(node.arguments[2])) {
        const { line } = file.getLineAndCharacterOfPosition(node.getStart(file));
        offenders.push(`${path}:${line + 1}`);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return { calls, offenders };
}

describe("bug 0519 — source guard controls", () => {
  it.each([
    {
      name: "multiline call with nested arguments",
      source: 'nodeSpawn(resolve("node", { nested: true }), [arg(1, 2)], {\n  cwd,\n  windowsHide: true,\n});',
    },
    { name: "spread before final true", source: 'nodeSpawn(cmd, args, { ...base, windowsHide: true });' },
    { name: "computed key before final true", source: 'nodeSpawn(cmd, args, { [key]: false, windowsHide: true });' },
    { name: "quoted key and unrelated later property", source: 'nodeSpawn(cmd, args, { "windowsHide": true, shell: false });' },
    { name: "false overwritten by final true", source: 'nodeSpawn(cmd, args, { windowsHide: false, windowsHide: true });' },
  ])("accepts $name", ({ source }) => {
    expect(scanSpawns(source, "fixture.ts")).toEqual({ calls: 1, offenders: [] });
  });

  it("ignores comment and string decoys without inventing a call", () => {
    const source = '// nodeSpawn(cmd, args, { windowsHide: true });\nconst text = "nodeSpawn(cmd, args, {})";';
    expect(scanSpawns(source, "fixture.ts")).toEqual({ calls: 0, offenders: [] });
  });

  it.each([
    { name: "missing options", source: "nodeSpawn(cmd, args);" },
    { name: "missing key", source: "nodeSpawn(cmd, args, { shell: false });" },
    { name: "false", source: "nodeSpawn(cmd, args, { windowsHide: false });" },
    { name: "string true", source: 'nodeSpawn(cmd, args, { windowsHide: "true" });' },
    { name: "nonliteral options", source: "nodeSpawn(cmd, args, options);" },
    { name: "shorthand key", source: "nodeSpawn(cmd, args, { windowsHide });" },
    { name: "method key", source: "nodeSpawn(cmd, args, { windowsHide() { return true; } });" },
    { name: "later false duplicate", source: "nodeSpawn(cmd, args, { windowsHide: true, windowsHide: false });" },
    { name: "later quoted false duplicate", source: 'nodeSpawn(cmd, args, { windowsHide: true, "windowsHide": false });' },
    { name: "later escaped false duplicate", source: 'nodeSpawn(cmd, args, { windowsHide: true, windows\\u0048ide: false });' },
    { name: "later unknown spread", source: "nodeSpawn(cmd, args, { windowsHide: true, ...base });" },
    { name: "later computed override", source: "nodeSpawn(cmd, args, { windowsHide: true, [key]: false });" },
    { name: "computed true without direct assignment", source: 'nodeSpawn(cmd, args, { ["windowsHide"]: true });' },
    { name: "comment decoy in options", source: "nodeSpawn(cmd, args, { /* windowsHide: true */ shell: false });" },
    { name: "nested decoy", source: "nodeSpawn(cmd, args, { env: { windowsHide: true } });" },
  ])("rejects $name", ({ source }) => {
    expect(scanSpawns(source, "fixture.ts")).toEqual({ calls: 1, offenders: ["fixture.ts:1"] });
  });

  it("reports each bad call's own line even beside a good call", () => {
    const source = [
      "nodeSpawn(cmd, args, { windowsHide: true });",
      "nodeSpawn(cmd, args, {});",
      "nodeSpawn(cmd, args, { windowsHide: false });",
    ].join("\n");
    expect(scanSpawns(source, "fixture.ts")).toEqual({
      calls: 3, offenders: ["fixture.ts:2", "fixture.ts:3"],
    });
  });
});

it("all production nodeSpawn calls explicitly end with windowsHide: true", () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const srcRoot = fileURLToPath(new URL("../src", import.meta.url));
  let calls = 0;
  const offenders: string[] = [];
  for (const file of tsFiles(srcRoot)) {
    const scan = scanSpawns(readFileSync(file, "utf8"), relative(root, file));
    calls += scan.calls;
    offenders.push(...scan.offenders);
  }
  expect(calls, "non-vacuous inventory of at least the three established spawn sites").toBeGreaterThanOrEqual(3);
  expect(offenders, "production nodeSpawn calls must explicitly set windowsHide: true without a later unknown override").toEqual([]);
});
