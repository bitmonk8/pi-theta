// A shared "drive the real `checkThetaImports` over an in-memory `.thetalib`
// tree" load harness (PTQ-0232).
//
// WHY THIS FILE EXISTS. tests/b0333-transitive-lib-reexport-edge.test.ts,
// tests/b0334-reexport-multisource-collision.test.ts and
// tests/b0335-own-import-shadows-own-declaration.test.ts each independently
// redeclared the same three-piece bundle: a `fakeThetaLibFs` double that
// derives a directory listing from a flat path→content map and serves only
// `readdir`/`readBytes`, a three-field `LoadResult` shape, and an `async`
// driver that parses the importing theta (against a shared frontmatter),
// asserts the parse succeeded, drives the real `checkThetaImports`, and
// reshapes its output. This module centralises that bundle so the three
// files import it rather than redeclare it.
//
// TIER: unit, offline, deterministic, provider-free — the same tier as every
// file that imports this module.

import { expect } from "vitest";
import type { Diagnostic } from "../../src/diagnostics/diagnostic";
import { checkThetaImports } from "../../src/extension/import-static-checks";
import type { ThetaCompositionInput } from "../../src/extension/theta-composition-producer";
import type { ParsedFrontmatter } from "../../src/parser/frontmatter";
import { parseThetaDocument } from "../../src/parser/theta-document";
import type { FileSystem } from "../../src/seams/file-system";
import { parseDeps } from "./e2e-s1";

/** The importing `.theta` frontmatter every fixture in this family shares. */
const APP_FRONTMATTER = ["---", 'model: "sonnet"', "mode: prompt", "---"].join("\n");

/**
 * An in-memory `.thetalib` filesystem double: `readdir` / `readBytes` answer
 * from a flat path→content map (a directory listing is derived from the map's
 * own keys); every other `FileSystem` member rejects loudly so an unexpected
 * call reds rather than returning a silent default.
 */
export function fakeThetaLibFs(files: Record<string, string>): FileSystem {
  const dirs = new Map<string, string[]>();
  for (const path of Object.keys(files)) {
    const slash = path.lastIndexOf("/");
    const parent = path.slice(0, slash);
    const entries = dirs.get(parent) ?? [];
    entries.push(path.slice(slash + 1));
    dirs.set(parent, entries);
  }
  const reject = (): Promise<never> =>
    Promise.reject(new Error("filesystem member not exercised by this test"));
  return {
    readText: reject,
    writeText: reject,
    exists: reject,
    homedir: (): string => "/home",
    cwd: (): string => "/proj",
    configDirName: (): string => ".pi",
    globalAgentDir: (): string => "/home/.pi/agent",
    lstat: reject,
    realpath: reject,
    readdir: (path: string): Promise<readonly string[]> => {
      const entries = dirs.get(path);
      return entries === undefined
        ? Promise.reject(new Error(`ENOENT: ${path}`))
        : Promise.resolve(entries);
    },
    readBytes: (path: string): Promise<Uint8Array> => {
      const content = files[path];
      return content === undefined
        ? Promise.reject(new Error(`ENOENT: ${path}`))
        : Promise.resolve(new TextEncoder().encode(content));
    },
  } as FileSystem;
}

/** The reshaped result of one `checkThetaImports` load over a fake `.thetalib` tree. */
export interface LoadResult {
  readonly appParseCodes: string[];
  readonly diagnostics: readonly Diagnostic[];
  readonly diagLines: string[];
}

/**
 * Parse `/proj/app.theta` (given only its body — the shared frontmatter above
 * is prepended) and run the real `checkThetaImports` over `libs`, returning
 * the load pass's diagnostics rendered as `severity code: message`.
 *
 * The importing theta's frontmatter is asserted to parse — if it did not the
 * load pass would read nothing and a later red would be a harness fault rather
 * than the missing diagnostic under witness.
 */
export async function loadThetaLibDiags(
  appBody: string,
  libs: Record<string, string>,
): Promise<LoadResult> {
  const app = parseThetaDocument(
    { path: "/proj/app.theta", bytes: new TextEncoder().encode(`${APP_FRONTMATTER}\n${appBody}`) },
    parseDeps(),
  );
  expect(
    app.frontmatter,
    `the importing theta's frontmatter must parse or the load pass reads nothing; diagnostics: ${JSON.stringify(
      app.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
    )}`,
  ).not.toBeNull();
  const frontmatter = app.frontmatter as ParsedFrontmatter;
  const input: ThetaCompositionInput = {
    slashName: "app",
    sourcePath: "/proj/app.theta",
    frontmatter,
    body: app.body,
  };
  const check = await checkThetaImports(input, {
    fs: fakeThetaLibFs(libs),
    parseDeps: parseDeps(),
  });
  return {
    appParseCodes: app.diagnostics.map((d) => d.code),
    diagnostics: check.diagnostics,
    diagLines: check.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
  };
}
