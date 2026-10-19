import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import semver from "semver";

// Architectural tests for the H1a scaffold-and-toolchain leaf. Each block
// reads the real on-disk `package.json` and asserts a manifest invariant the
// downstream leaves rely on. Spec anchors are cited inline per the leaf's
// Tests bullets.

const manifestPath = fileURLToPath(new URL("../package.json", import.meta.url));
const pkg = JSON.parse(readFileSync(manifestPath, "utf8")) as {
  type?: string;
  scripts?: Record<string, string>;
  engines?: { node?: string };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  pi?: { extensions?: unknown };
};

// The Pi-SDK pin, transcribed inline from host-prerequisites.md §#pi-sdk-pin.
// The decided design splits the former single range into two literals: an OPEN
// peer floor and a TILDE dev/build pin. The four @earendil-works/*
// peerDependencies entries MUST literally equal the open floor `>=0.80.8` (the
// minimum-API-shape version; forward-compatible with newer minors); the four
// devDependencies entries MUST literally equal the dev/build pin `~1.3.0`
// (the ported build target). The two literals are distinct and no single value
// satisfies both gates.
const PEER_FLOOR = ">=0.80.8";
const DEV_PIN = "~1.3.0";
const PI_SDK_PACKAGES = [
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-ai",
  "@earendil-works/pi-tui",
] as const;

// Node floor, transcribed inline from capability-probe.md §(a) — an
// independently-sourced copy resident in this test (not read against
// package.json itself, which would be a vacuous tautology).
const NODE_FLOOR = ">=22.19.0";

// TypeScript build-toolchain floor, sourced from
// host-prerequisites.md §#tsc-toolchain-floor.
const TSC_FLOOR = ">=5.4.0";

describe("H1a scaffold — toolchain scripts (Convention: phase categories)", () => {
  it("declares build, test, and typecheck scripts", () => {
    const scripts = pkg.scripts ?? {};
    expect(scripts.build).toBeTypeOf("string");
    expect(scripts.test).toBeTypeOf("string");
    expect(scripts.typecheck).toBeTypeOf("string");
  });
});

describe("H1a scaffold — test runner (Convention: phase categories)", () => {
  it("declares vitest in devDependencies so every later leaf resolves one concrete runner", () => {
    const dev = pkg.devDependencies ?? {};
    expect(dev.vitest).toBeTypeOf("string");
  });
});

describe("H1a scaffold — lint toolchain (Convention: phase categories)", () => {
  it("declares eslint, @typescript-eslint/parser, and eslint-plugin-theta-local in devDependencies", () => {
    const dev = pkg.devDependencies ?? {};
    expect(dev.eslint).toBeTypeOf("string");
    expect(dev["@typescript-eslint/parser"]).toBeTypeOf("string");
    // eslint-plugin-theta-local: key present, relative/workspace (file:)
    // specifier accepted — no published registry version demanded.
    expect(dev["eslint-plugin-theta-local"]).toBeTypeOf("string");
  });
});

describe("H1a scaffold — Pi SDK peer-dep lock-step (PIC-33)", () => {
  it("PIC-33: the four @earendil-works/* peer deps share the single open Pi-SDK floor", () => {
    const peers = pkg.peerDependencies ?? {};
    for (const name of PI_SDK_PACKAGES) {
      expect(peers[name]).toBe(PEER_FLOOR);
    }
  });
});

describe("H1a scaffold — Pi SDK devDependencies provisioning (Convention: phase categories)", () => {
  it("declares the four @earendil-works/pi-* packages in devDependencies at the shared dev/build pin", () => {
    const dev = pkg.devDependencies ?? {};
    for (const name of PI_SDK_PACKAGES) {
      expect(dev[name]).toBe(DEV_PIN);
    }
  });
});

describe("H1a scaffold — typebox no-collapse (PIC-35)", () => {
  it("PIC-35: typebox is its own peerDependencies entry pinned \"*\", not folded into the tilde group", () => {
    const peers = pkg.peerDependencies ?? {};
    expect(peers.typebox).toBe("*");
    expect(peers.typebox).not.toBe(PEER_FLOOR);
    expect(peers.typebox).not.toBe(DEV_PIN);
  });
});

describe("H1a scaffold — extension manifest entry point", () => {
  it("pi.extensions equals [\"./extensions\"] (extension-bootstrap-and-per-theta.md §Extension entry point)", () => {
    expect(pkg.pi?.extensions).toEqual(["./extensions"]);
  });
});

describe("H1a scaffold — Node version floor", () => {
  it("engines.node equals the capability-probe.md §(a) floor (overview-and-orientation.md §Node version floor)", () => {
    expect(pkg.engines?.node).toBe(NODE_FLOOR);
  });
});

describe("H1a scaffold — TypeScript build-toolchain floor (host-prerequisites.md §tsc-toolchain-floor)", () => {
  it("typescript is declared in devDependencies and its range satisfies the >=5.4.0 floor", () => {
    const dev = pkg.devDependencies ?? {};
    const range = dev.typescript;
    expect(range).toBeTypeOf("string");
    // The declared range must be wholly contained within the spec floor.
    expect(semver.subset(range as string, TSC_FLOOR)).toBe(true);
  });
});

describe("H1a scaffold — ES-module declaration (extension-bootstrap-and-per-theta.md §Extension ES-module declaration)", () => {
  it("package.json#type equals \"module\"", () => {
    expect(pkg.type).toBe("module");
  });
});
