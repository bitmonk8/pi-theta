import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS architectural-check module, no type declarations.
import { findAmbientPrimitiveReferences } from "../tools/arch-checks/no-ambient-primitives.js";
import { createRuntimeRoot, RuntimeRoot } from "../src/runtime-root";
import type { RuntimeSeams } from "../src/runtime-root";
import type {
  Checkpoint,
  Clock,
  CompiledValidator,
  FileStat,
  FileSystem,
  FileWatcher,
  FileWatchEvent,
  IdSource,
  LoweredSchema,
  SchemaValidator,
  TimerHandle,
  TokenEstimator,
  Unsubscribe,
} from "../src/seams/index";

// H3a — dependency-injection seam skeleton. These assertions ARE the
// "constructs two independent runtime roots and asserts seam isolation and the
// ambient-access ban in its direct-reference form" surface the leaf's "Ships
// when" gate names: they construct two runtime roots from distinct seam sets
// and prove no shared mutable state, and they run the H3a identifier-keyed
// ambient-primitive scan against controlled fixtures and the real `src/**`
// production tree.

// --- minimal in-test seam fakes (test code is unrestricted) -----------------

// A FakeIdSource carries observable per-instance mutable state (a counter): if
// two runtime roots shared a seam graph, advancing one would leak into the
// other. Each root is constructed with its own instance, so they must not.
class FakeIdSource implements IdSource {
  #invocations = 0;
  #toolCalls = 0;
  constructor(private readonly tag: string) {}
  newInvocationId(): string {
    this.#invocations += 1;
    return `${this.tag}-inv-${this.#invocations}`;
  }
  newToolCallId(): string {
    this.#toolCalls += 1;
    return `${this.tag}-tool-${this.#toolCalls}`;
  }
}

const stubCheckpoint: Checkpoint = {
  before: async () => {},
};

const stubValidator: SchemaValidator = {
  compile: (_schema: LoweredSchema): CompiledValidator => ({
    validate: () => ({ ok: true }),
  }),
  invalidate: () => {},
};

const stubClock: Clock = {
  now: () => 0,
  wallNow: () => 0,
  setTimeout: (_fn: () => void, _ms: number): TimerHandle => ({}),
  clearTimeout: (_handle: TimerHandle) => {},
};

const stubStat: FileStat = {
  isDirectory: () => false,
  isFile: () => true,
  isSymbolicLink: () => false,
};

const stubFileSystem: FileSystem = {
  readText: async () => "",
  readBytes: async () => new Uint8Array(),
  writeText: async () => {},
  exists: async () => false,
  homedir: () => "/home/test",
  cwd: () => "/project",
  configDirName: () => ".pi",
  globalAgentDir: () => "/home/test/.pi/agent",
  readdir: async () => [],
  lstat: async () => stubStat,
  realpath: async (p: string) => p,
};

const stubFileWatcher: FileWatcher = {
  watch: (_roots: readonly string[], _handler: (event: FileWatchEvent) => void): Unsubscribe =>
    () => {},
};

const stubTokenEstimator: TokenEstimator = {
  estimate: () => 0,
};

function makeSeams(tag: string): RuntimeSeams {
  return {
    checkpoint: stubCheckpoint,
    schemaValidator: stubValidator,
    clock: stubClock,
    fileSystem: stubFileSystem,
    fileWatcher: stubFileWatcher,
    tokenEstimator: stubTokenEstimator,
    idSource: new FakeIdSource(tag),
  };
}

// --- Convention: No globals, statics, singletons — runtime-root isolation ---

describe("H3a — runtime-root isolation (Convention: No globals, statics, singletons)", () => {
  it("constructing two runtime roots yields two isolated seam graphs sharing no mutable state", () => {
    const seamsA = makeSeams("A");
    const seamsB = makeSeams("B");
    const rootA = createRuntimeRoot(seamsA);
    const rootB = createRuntimeRoot(seamsB);

    // Distinct graphs.
    expect(rootA).toBeInstanceOf(RuntimeRoot);
    expect(rootB).toBeInstanceOf(RuntimeRoot);
    expect(rootA).not.toBe(rootB);

    // Each root threads exactly its own injected seam — no shared instance.
    expect(rootA.idSource).toBe(seamsA.idSource);
    expect(rootB.idSource).toBe(seamsB.idSource);
    expect(rootA.idSource).not.toBe(rootB.idSource);

    // Advancing one root's stateful seam does not leak into the other: the
    // counters are independent, proving no shared mutable state.
    expect(rootA.idSource.newInvocationId()).toBe("A-inv-1");
    expect(rootA.idSource.newInvocationId()).toBe("A-inv-2");
    expect(rootB.idSource.newInvocationId()).toBe("B-inv-1");
    expect(rootA.idSource.newToolCallId()).toBe("A-tool-1");
    expect(rootB.idSource.newToolCallId()).toBe("B-tool-1");
  });

  it("threads every host seam onto the runtime root", () => {
    const seams = makeSeams("C");
    const root = createRuntimeRoot(seams);
    expect(root.checkpoint).toBe(seams.checkpoint);
    expect(root.schemaValidator).toBe(seams.schemaValidator);
    expect(root.clock).toBe(seams.clock);
    expect(root.fileSystem).toBe(seams.fileSystem);
    expect(root.fileWatcher).toBe(seams.fileWatcher);
    expect(root.tokenEstimator).toBe(seams.tokenEstimator);
    expect(root.idSource).toBe(seams.idSource);
  });
});

// --- Convention: No globals, statics, singletons — ambient-access ban -------

function primitives(refs: { primitive: string }[]): string[] {
  return refs.map((r) => r.primitive);
}

describe("H3a — ambient-primitive scan (Convention: No globals, statics, singletons)", () => {
  it("flags each banned primitive in its direct-reference form", () => {
    const code = [
      "const a = process.env.HOME;",
      "const b = process.cwd();",
      "const c = crypto.randomUUID();",
      "const d = Date.now();",
      "const e = performance.now();",
      "const f = new Date().getTime();",
      "const g = setTimeout(() => {}, 0);",
      "clearTimeout(g);",
    ].join("\n");
    expect(primitives(findAmbientPrimitiveReferences(code))).toEqual(
      expect.arrayContaining([
        "process.env",
        "process.cwd",
        "crypto.randomUUID",
        "Date.now",
        "performance.now",
        "Date.prototype.getTime",
        "setTimeout",
        "clearTimeout",
      ]),
    );
  });

  it("does NOT flag a direct reference at an exempt ambient site (same-line `// allow-ambient:` comment)", () => {
    const code = [
      "function wallNow(): number {",
      "  return Date.now(); // allow-ambient: Date.now — WallClock",
      "}",
      "function mintId(): string {",
      "  return crypto.randomUUID(); // allow-ambient: crypto.randomUUID — IdSource",
      "}",
      "function later(fn: () => void): unknown {",
      "  return setTimeout(fn, 0); // allow-ambient: setTimeout — WallClock",
      "}",
    ].join("\n");
    expect(findAmbientPrimitiveReferences(code)).toHaveLength(0);
  });

  it("recognises the exemption by the same-line comment alone (an off-line comment does not exempt)", () => {
    const code = [
      "// allow-ambient: Date.now — WallClock",
      "const t = Date.now();",
    ].join("\n");
    expect(primitives(findAmbientPrimitiveReferences(code))).toContain("Date.now");
  });

  it("does NOT flag a `setTimeout` member access — only the bare-identifier global form (the injected Clock seam is allowed)", () => {
    const code = [
      "function f(clock: { setTimeout(fn: () => void, ms: number): unknown }): unknown {",
      "  return clock.setTimeout(() => {}, 0);",
      "}",
    ].join("\n");
    expect(findAmbientPrimitiveReferences(code)).toHaveLength(0);
  });

  it("does NOT flag a binding named `setTimeout` or an unrelated identifier", () => {
    const code = [
      "function f(): number {",
      "  const total = 1;",
      "  return total;",
      "}",
    ].join("\n");
    expect(findAmbientPrimitiveReferences(code)).toHaveLength(0);
  });
});

describe("H3a — ambient-primitive scan holds over the real production tree", () => {
  const srcRoot = fileURLToPath(new URL("../src", import.meta.url));

  function tsFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        out.push(...tsFiles(full));
      } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
        out.push(full);
      }
    }
    return out;
  }

  it("no src/** production file directly references a banned ambient primitive (no exempt site exists yet)", () => {
    for (const file of tsFiles(srcRoot)) {
      const refs = findAmbientPrimitiveReferences(readFileSync(file, "utf8"));
      expect(refs, `${file} directly references a banned ambient primitive: ${JSON.stringify(refs)}`).toHaveLength(0);
    }
  });
});
