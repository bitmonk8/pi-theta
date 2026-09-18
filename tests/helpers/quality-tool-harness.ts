// Shared scratch-tree file writers and CLI runner for quality-tool tests.
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Bind a quality CLI script, reading the ambient env and scratch root per call. */
export function qualityToolRunner(script: string): (root: string, args: string[]) => SpawnSyncReturns<string> {
  return (root, args) => spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    env: { ...process.env, QUALITY_STORE_ROOT: root },
  });
}

/** Write a scratch-tree file, creating its parent directories first. */
export function writeFile(root: string, relPath: string, content: string): void {
  const abs = join(root, ...relPath.split("/"));
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, content);
}

/** Write one manifest path per line, retaining the trailing newline. */
export function writeManifest(root: string, relPath: string, files: string[]): string {
  writeFile(root, relPath, files.join("\n") + "\n");
  return relPath;
}
