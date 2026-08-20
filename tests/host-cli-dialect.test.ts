// Host CLI dialect seam (change B1 — pi-integration-contract/subagent.md
// #subagent-launch-contract).
//
// The launch contract is intent-level, not a fixed flag list: Pi absorbs unknown
// flags into its `unknownFlags` map, while Oh-My-Pi REJECTS them (exit 2,
// "unknown flags: …") before the agent loop ever runs — so a Pi-spelled argv
// kills an omp child with no envelope for the parent to read. These tests pin
// the three halves of that seam:
//   - host identity → dialect (`resolveHostCliDialect`, from the host SDK's own
//     `CONFIG_DIR_NAME`), with the authored Pi dialect as the fallback so an
//     unrecognised host behaves exactly as it did before the seam existed;
//   - the ABSENCE of any env override (SPAWN-07): the host constant is the
//     selection's only input — pinned by arity and by setting the retired
//     `PI_THETA_HOST_DIALECT` variable and observing detection unmoved;
//   - `assembleSubagentArgv(input, dialect)` — the per-dialect spellings, the
//     ABSENCE of the other dialect's flags, and the host-invariant core.

import { describe, expect, it } from "vitest";
import { delimiter } from "node:path";
import {
  assembleSubagentArgv,
  OMP_CLI_DIALECT,
  PI_CLI_DIALECT,
  resolveHostCliDialect,
  type HostCliDialect,
  type SubagentArgvInput,
} from "../src/runtime/subagent-launcher";

/** A complete, minimal argv input; per-test overrides are spread over it. */
function baseInput(overrides: Partial<SubagentArgvInput> = {}): SubagentArgvInput {
  return {
    slug: "reviewer",
    thetaDirs: ["/repo/.pi/theta"],
    systemPrompt: "you are a reviewer",
    hostTools: ["read", "grep"],
    noHostTools: false,
    provider: "anthropic",
    model: "claude-sonnet-4",
    projectTrust: false,
    ...overrides,
  };
}

/**
 * The index of `tokens` as a contiguous run inside `argv`, or -1. Adjacency is
 * the contract for a flag+value pair (`--approval-mode always-ask`): splitting
 * or reordering the two tokens silently changes the child's approval mode
 * rather than failing, so membership alone is not enough to assert.
 */
function runIndex(argv: readonly string[], tokens: readonly string[]): number {
  for (let i = 0; i + tokens.length <= argv.length; i += 1) {
    if (tokens.every((token, offset) => argv[i + offset] === token)) {
      return i;
    }
  }
  return -1;
}

/** Every flag Pi spells that omp would reject outright (exit 2). */
const PI_ONLY_FLAGS = [
  "-ne",
  "--no-prompt-templates",
  "--no-themes",
  "--no-context-files",
  "--approve",
  "--no-approve",
] as const;

describe("B1 — resolveHostCliDialect host-identity selection", () => {
  it('".omp" selects the Oh-My-Pi dialect', () => {
    expect(resolveHostCliDialect(".omp")).toBe(OMP_CLI_DIALECT);
  });

  it('".pi" selects the authored Pi dialect', () => {
    expect(resolveHostCliDialect(".pi")).toBe(PI_CLI_DIALECT);
  });

  it("a host that states no identity falls back to the authored Pi dialect", () => {
    // A harness host (or an SDK predating the `CONFIG_DIR_NAME` export) supplies
    // no identity; the fallback must reproduce pre-seam behaviour exactly.
    expect(resolveHostCliDialect(undefined)).toBe(PI_CLI_DIALECT);
  });

  it("an unrecognised host identity falls back to the authored Pi dialect", () => {
    expect(resolveHostCliDialect(".claude")).toBe(PI_CLI_DIALECT);
    expect(resolveHostCliDialect("")).toBe(PI_CLI_DIALECT);
  });
});

describe("B1 — the dialect has no env override (SPAWN-07)", () => {
  it("resolveHostCliDialect takes the host constant as its ONLY input", () => {
    // The removed `PI_THETA_HOST_DIALECT` hatch could only ever weaken isolation,
    // and on a host that loads `<cwd>/.env` into the environment it was
    // repository-writable — an attacker lever, not an operator hatch. Arity is
    // the contract: a second parameter would reintroduce the override.
    expect(resolveHostCliDialect).toHaveLength(1);
  });

  it("ignores the retired PI_THETA_HOST_DIALECT variable even when it is set", () => {
    // The strongest form of the assertion: set the retired variable in the REAL
    // environment, pointing at the weaker direction, and confirm detection is
    // unmoved. Forcing the Pi dialect onto an omp host is the denial-of-service
    // direction; forcing omp onto Pi silently strips every ambient-isolation flag.
    process.env["PI_THETA_HOST_DIALECT"] = "pi";
    try {
      expect(resolveHostCliDialect(".omp")).toBe(OMP_CLI_DIALECT);
    } finally {
      delete process.env["PI_THETA_HOST_DIALECT"];
    }
    process.env["PI_THETA_HOST_DIALECT"] = "omp";
    try {
      expect(resolveHostCliDialect(".pi")).toBe(PI_CLI_DIALECT);
    } finally {
      delete process.env["PI_THETA_HOST_DIALECT"];
    }
  });
});

describe("SPAWN-04 — the --system-prompt value is forced to be read as text, not a path", () => {
  const promptOf = (argv: readonly string[]): string | undefined =>
    argv[argv.indexOf("--system-prompt") + 1];

  it("prefixes a newline so neither host can path-coerce the value", () => {
    // Pi runs `existsSync(value)` then `readFileSync`; Oh-My-Pi opens any
    // newline-free value with `Bun.file(value).text()`. The value is the theta's
    // `system:` text after `${param}` interpolation, and on the binder path those
    // params come from MODEL output — so without this guard the model can name a
    // file and have the child adopt its bytes as the child's system prompt, then
    // relay them back through the return envelope.
    for (const dialect of [PI_CLI_DIALECT, OMP_CLI_DIALECT]) {
      const argv = assembleSubagentArgv(
        baseInput({ systemPrompt: "/Users/victim/.ssh/id_ed25519" }),
        dialect,
      );
      const emitted = promptOf(argv);
      expect(emitted).toBe("\n/Users/victim/.ssh/id_ed25519");
      // The property that actually defeats the coercion, asserted directly: no
      // path that exists can contain a newline, and one host short-circuits to
      // the literal as soon as it sees one.
      expect(emitted).toContain("\n");
    }
  });

  it("preserves the prompt text verbatim after the prefix", () => {
    const prompt = "You are a reviewer.\nBe terse.";
    const argv = assembleSubagentArgv(baseInput({ systemPrompt: prompt }), PI_CLI_DIALECT);
    expect(promptOf(argv)).toBe(`\n${prompt}`);
    expect(promptOf(argv)?.endsWith(prompt)).toBe(true);
  });

  it("leaves an EMPTY prompt empty so the host default still applies", () => {
    // Both hosts treat a falsy value as "no CLI system prompt" and fall back to
    // their built-in default, which is what a theta declaring no `system:` wants.
    // Prefixing here would make the value truthy and install a one-blank-line
    // system prompt, silently discarding that default.
    for (const dialect of [PI_CLI_DIALECT, OMP_CLI_DIALECT]) {
      const argv = assembleSubagentArgv(baseInput({ systemPrompt: "" }), dialect);
      expect(promptOf(argv)).toBe("");
    }
  });
});

describe("B1 — assembleSubagentArgv under the Oh-My-Pi dialect", () => {
  it("carries the omp isolation spellings and NONE of the Pi-only flags", () => {
    const argv = assembleSubagentArgv(
      baseInput({ projectTrust: true, extensionPinDir: "/repo/dist/extension.js" }),
      OMP_CLI_DIALECT,
    );
    expect(argv).toContain("--no-skills");
    expect(argv).toContain("--no-rules");
    expect(argv).toContain("--no-extensions");
    // omp exits 2 on ANY unknown flag before the agent loop starts, so a single
    // leaked Pi flag kills the child; absence is the whole point of the dialect.
    for (const flag of PI_ONLY_FLAGS) {
      expect(argv).not.toContain(flag);
    }
  });

  it("leaves the host-invariant core of the launch contract unchanged", () => {
    const argv = assembleSubagentArgv(
      baseInput({ slug: "auditor", thetaDirs: ["/a/theta", "/b/theta"] }),
      OMP_CLI_DIALECT,
    );
    expect(runIndex(argv, ["--theta", ["/a/theta", "/b/theta"].join(delimiter)])).toBe(0);
    expect(runIndex(argv, ["--mode", "json"])).toBeGreaterThan(0);
    expect(runIndex(argv, ["-p", "/auditor"])).toBeGreaterThan(0);
    expect(argv).toContain("--no-session");
    // Newline-prefixed per SPAWN-04; the flag+value pair must still be adjacent.
    expect(runIndex(argv, ["--system-prompt", "\nyou are a reviewer"])).toBeGreaterThan(0);
    expect(runIndex(argv, ["--tools", "read,grep"])).toBeGreaterThan(0);
    expect(runIndex(argv, ["--provider", "anthropic"])).toBeGreaterThan(0);
    expect(runIndex(argv, ["--model", "claude-sonnet-4"])).toBeGreaterThan(0);
  });

  it("maps an empty callable set to --no-tools on omp too (empty is not omission)", () => {
    const argv = assembleSubagentArgv(
      baseInput({ hostTools: [], noHostTools: true }),
      OMP_CLI_DIALECT,
    );
    expect(argv).toContain("--no-tools");
    expect(argv).not.toContain("--tools");
  });
});

describe("B1 — project-trust intent maps per dialect", () => {
  // Pi's `--approve` / `--no-approve` is NOT tool approval: pi's own
  // dist/cli/args.js sets `projectTrustOverride`, help text "Trust
  // project-local files for this run". Oh-My-Pi has no CLI flag for that
  // control at all, so the intent is INEXPRESSIBLE there and the dialect's
  // trust groups are empty — exactly like its absent theme and
  // prompt-template opt-outs. Mapping it onto omp's `--auto-approve`
  // (tools.approvalMode yolo — blanket tool auto-approval) or
  // `--approval-mode always-ask` (which denies write+exec outright in a
  // headless child) would conflate two unrelated security controls.
  it("Pi spells project trust --approve / --no-approve", () => {
    const trusted = assembleSubagentArgv(baseInput({ projectTrust: true }), PI_CLI_DIALECT);
    const untrusted = assembleSubagentArgv(baseInput({ projectTrust: false }), PI_CLI_DIALECT);
    expect(trusted).toContain("--approve");
    expect(trusted).not.toContain("--no-approve");
    expect(untrusted).toContain("--no-approve");
    expect(untrusted).not.toContain("--approve");
  });

  it("omp emits NO trust flag in either direction — and no approval-mode flag either", () => {
    for (const projectTrust of [true, false]) {
      const argv = assembleSubagentArgv(baseInput({ projectTrust }), OMP_CLI_DIALECT);
      // The Pi spellings would be unknown flags (exit 2); the omp approval
      // spellings are a DIFFERENT control and must never be substituted in.
      expect(argv).not.toContain("--approve");
      expect(argv).not.toContain("--no-approve");
      expect(argv).not.toContain("--auto-approve");
      expect(argv).not.toContain("--approval-mode");
      expect(argv).not.toContain("always-ask");
    }
  });

  it("the omp argv is identical whether project trust is inferred or not", () => {
    // An inexpressible intent must not leak into any other control: flipping
    // the trust inference may change NOTHING about the omp child's argv.
    expect(assembleSubagentArgv(baseInput({ projectTrust: true }), OMP_CLI_DIALECT)).toEqual(
      assembleSubagentArgv(baseInput({ projectTrust: false }), OMP_CLI_DIALECT),
    );
  });

  it("Pi never emits omp's approval spellings", () => {
    for (const projectTrust of [true, false]) {
      const argv = assembleSubagentArgv(baseInput({ projectTrust }), PI_CLI_DIALECT);
      expect(argv).not.toContain("--approval-mode");
      expect(argv).not.toContain("always-ask");
      expect(argv).not.toContain("--auto-approve");
    }
  });

  it("the trust group is the argv TAIL on Pi, and absent entirely on omp", () => {
    // Documented assembly order ends `<ambient-isolation> <trust>`. On omp the
    // trust group contributes nothing, so ambient isolation is the tail — which
    // also proves the empty group appends no stray token (e.g. an empty string
    // argv element, which omp would read as a positional user message).
    const pi = assembleSubagentArgv(baseInput({ projectTrust: true }), PI_CLI_DIALECT);
    expect(pi.slice(-5)).toEqual([
      "--no-skills",
      "--no-prompt-templates",
      "--no-themes",
      "--no-context-files",
      "--approve",
    ]);
    const omp = assembleSubagentArgv(baseInput({ projectTrust: true }), OMP_CLI_DIALECT);
    expect(omp.slice(-2)).toEqual(["--no-skills", "--no-rules"]);
    expect(omp).not.toContain("");
  });
});

describe("B1 — the extension pin leads the argv in both dialects", () => {
  it("Pi pins with `-ne -e <path>` as the argv PREFIX", () => {
    const argv = assembleSubagentArgv(
      baseInput({ extensionPinDir: "/repo/dist/extension.js" }),
      PI_CLI_DIALECT,
    );
    expect(argv.slice(0, 3)).toEqual(["-ne", "-e", "/repo/dist/extension.js"]);
    // Position is the contract: the pin must precede `--theta` and the rest.
    expect(argv.indexOf("--theta")).toBe(3);
  });

  it("omp pins with `--no-extensions -e <path>` as the argv PREFIX", () => {
    const argv = assembleSubagentArgv(
      baseInput({ extensionPinDir: "/repo/dist/extension.js" }),
      OMP_CLI_DIALECT,
    );
    expect(argv.slice(0, 3)).toEqual(["--no-extensions", "-e", "/repo/dist/extension.js"]);
    expect(argv.indexOf("--theta")).toBe(3);
  });

  it("no pin emits neither no-discovery flag nor `-e` in either dialect", () => {
    for (const dialect of [PI_CLI_DIALECT, OMP_CLI_DIALECT]) {
      const argv = assembleSubagentArgv(baseInput(), dialect);
      expect(argv).not.toContain("-e");
      expect(argv).not.toContain("-ne");
      expect(argv).not.toContain("--no-extensions");
      expect(argv[0]).toBe("--theta");
    }
  });
});

describe("B1 — the dialect constants are immutable shared state", () => {
  const dialects: ReadonlyArray<readonly [string, HostCliDialect]> = [
    ["PI_CLI_DIALECT", PI_CLI_DIALECT],
    ["OMP_CLI_DIALECT", OMP_CLI_DIALECT],
  ];

  for (const [name, dialect] of dialects) {
    it(`${name} and every intent group it holds are frozen`, () => {
      // Both dialects are process-wide singletons handed to every spawn; a
      // mutable intent array would let one caller corrupt every later child.
      // Checked over Object.values rather than named fields so a newly added
      // intent group cannot be introduced unfrozen without failing here.
      expect(Object.isFrozen(dialect)).toBe(true);
      const groups = Object.values(dialect);
      expect(groups.length).toBeGreaterThan(0);
      for (const group of groups) {
        expect(Array.isArray(group)).toBe(true);
        expect(Object.isFrozen(group)).toBe(true);
      }
    });
  }

  it("assembling an argv does not alias the dialect's arrays into the result", () => {
    // The assembled argv is caller-owned and mutable; it must be a copy, so
    // sorting or splicing it cannot reach back into the shared dialect.
    const argv = assembleSubagentArgv(baseInput({ projectTrust: true }), OMP_CLI_DIALECT);
    expect(Object.isFrozen(argv)).toBe(false);
    argv.length = 0;
    expect(OMP_CLI_DIALECT.ambientIsolation).toEqual(["--no-skills", "--no-rules"]);
    expect(OMP_CLI_DIALECT.noExtensionDiscovery).toEqual(["--no-extensions"]);
  });
});
