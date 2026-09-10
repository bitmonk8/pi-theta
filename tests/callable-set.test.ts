import { describe, expect, it } from "vitest";
import {
  resolveCallableSet,
  type CallableSetDeps,
  type CallableSetResult,
  type ResolvedThetaCallee,
  type ResolvedPiTool,
  type ToolsField,
} from "../src/parser/callable-set";
import type { Diagnostic } from "../src/diagnostics/diagnostic";

// V6c-T — failing tests for the paired `V6c` "`tools` callable set and
// resolution snapshot" implementation.
//
// Spec: frontmatter/frontmatter-fields-a.md (§`tools` — the per-entry grammar,
// default-name / `as` rename rules, the five load-time rejections) and
// frontmatter/frontmatter-fields-b-and-templates.md (§YAML-shape — the two
// interchangeable spellings; §Resolution snapshot — the frozen per-theta table,
// no ambient inheritance).
//
// Diagnostic *Message* strings are sourced from the diagnostics registry
// (diagnostics/code-registry-load.md) per the *Diagnostic message anchors* rule.
//
// These tests red because the V6c resolver is absent: `resolveCallableSet` is an
// inert stub that registers an empty, unfrozen snapshot and raises no
// diagnostic. Each test reds on its own primary assertion (an absent expected
// diagnostic, a missing resolved entry, or an unfrozen snapshot) — not on a
// compile error, missing fixture, or harness throw.

/** The first diagnostic carrying `code`, if any. */
function withCode(diags: readonly Diagnostic[], code: string): Diagnostic | undefined {
  return diags.find((d) => d.code === code);
}

/** A resolved Pi-tool stand-in (the ToolDefinition is opaque to this seam). */
function piTool(name: string): ResolvedPiTool {
  return { kind: "pi-tool", toolDefinition: { name } };
}

/**
 * A resolved `.theta` callee stand-in with a given declared mode. The
 * `calleePath` is injected by the `deps` factory from the resolution-table key
 * (mirroring production: `resolveEntry` overwrites it from the entry `spec`).
 */
function thetaCallee(mode: "prompt" | "subagent"): Omit<ResolvedThetaCallee, "calleePath"> {
  return { kind: "theta", mode };
}

/**
 * Build `CallableSetDeps` from an explicit Pi-tool registry, a `.theta`
 * resolution table (keyed by the path literal as written), and reserved
 * top-level names. Anything absent resolves as unknown / unresolvable.
 */
function deps(opts?: {
  piTools?: readonly string[];
  thetaCallees?: Readonly<Record<string, Omit<ResolvedThetaCallee, "calleePath">>>;
  reservedNames?: readonly string[];
}): CallableSetDeps {
  const piTools = new Set(opts?.piTools ?? []);
  const thetaCallees = opts?.thetaCallees ?? {};
  return {
    resolvePiTool: (name) => (piTools.has(name) ? piTool(name) : undefined),
    resolveThetaCallee: (thetaPath) => {
      const callee = thetaCallees[thetaPath];
      return callee === undefined ? undefined : { ...callee, calleePath: thetaPath };
    },
    reservedNames: new Set(opts?.reservedNames ?? []),
  };
}

/** Resolve a comma-separated short-form `tools:` value. */
function resolveScalar(text: string, d: CallableSetDeps): CallableSetResult {
  const tools: ToolsField = { kind: "scalar", text };
  return resolveCallableSet({ file: "test.theta", tools, deps: d });
}

/** Resolve a YAML list-form `tools:` value. */
function resolveList(items: readonly string[], d: CallableSetDeps): CallableSetResult {
  const tools: ToolsField = { kind: "list", items };
  return resolveCallableSet({ file: "test.theta", tools, deps: d });
}

// --- frontmatter-fields-a.md §`tools` — unknown Pi tool -------------------

// cka-11 / V6c: the FRNT code-keyed obligation area's `tools` callable-set facet
// closes on V6c; the assertions in this file witness that facet against the
// shipped callable-set resolution.
describe("V6c-T — unknown Pi tool (theta/load/unknown-tool)", () => {
  it("theta/load/unknown-tool: a `tools:` entry naming a Pi tool absent from the registry is rejected at load time", () => {
    const r = resolveScalar("read, bogus_tool", deps({ piTools: ["read"] }));
    const dg = withCode(r.diagnostics, "theta/load/unknown-tool");
    expect(dg, "theta/load/unknown-tool for an unregistered Pi tool name").toBeDefined();
    expect(dg?.severity).toBe("error");
    // Message from code-registry-load.md.
    expect(dg?.message).toBe("unknown Pi tool 'bogus_tool'");
    expect(r.registered, "an unknown-tool theta is not registered").toBe(false);
  });

  it("theta/load/unknown-tool: every listed Pi tool present in the registry resolves cleanly", () => {
    const r = resolveScalar("read, grep", deps({ piTools: ["read", "grep"] }));
    expect(
      withCode(r.diagnostics, "theta/load/unknown-tool"),
      "no unknown-tool error when every Pi tool resolves",
    ).toBeUndefined();
    expect(r.registered).toBe(true);
    expect(r.callableSet?.entries.has("read")).toBe(true);
    expect(r.callableSet?.entries.has("grep")).toBe(true);
  });
});

// --- frontmatter-fields-a.md §`tools` — unresolvable `.theta` path ---------

describe("V6c-T — unresolvable `.theta` path (theta/load/unresolvable-theta-path)", () => {
  it("theta/load/unresolvable-theta-path: a `tools:` `.theta` entry whose path does not exist or is not readable is rejected at load time", () => {
    // No entry in the `.theta` resolution table → the path resolves to no file.
    const r = resolveList(["./missing.theta"], deps({}));
    const dg = withCode(r.diagnostics, "theta/load/unresolvable-theta-path");
    expect(dg, "theta/load/unresolvable-theta-path for a non-existent `.theta` path").toBeDefined();
    expect(dg?.severity).toBe("error");
    // Message from code-registry-load.md; `<path>` is the path literal as written.
    expect(dg?.message).toBe("cannot resolve .theta path './missing.theta'");
    expect(r.registered, "an unresolvable-`.theta` theta is not registered").toBe(false);
  });
});

// --- frontmatter-fields-a.md §`tools` — prompt-mode `.theta` callee --------

describe("V6c-T — prompt-mode callee (theta/load/prompt-mode-callable)", () => {
  it("theta/load/prompt-mode-callable: a prompt-mode `.theta` callee in `tools:` is rejected at load time", () => {
    const r = resolveList(
      ["./child.theta"],
      deps({ thetaCallees: { "./child.theta": thetaCallee("prompt") } }),
    );
    const dg = withCode(r.diagnostics, "theta/load/prompt-mode-callable");
    expect(dg, "theta/load/prompt-mode-callable for a prompt-mode `.theta` callee").toBeDefined();
    expect(dg?.severity).toBe("error");
    // Message from code-registry-load.md.
    expect(dg?.message).toBe(
      "'tools:' entry './child.theta' points at a prompt-mode theta; only subagent-mode thetas are permitted",
    );
    expect(r.registered, "a prompt-mode-callee theta is not registered").toBe(false);
  });

  it("theta/load/prompt-mode-callable: a subagent-mode `.theta` callee resolves cleanly (default name maps hyphens to underscores)", () => {
    const r = resolveList(
      ["./code-review.theta"],
      deps({ thetaCallees: { "./code-review.theta": thetaCallee("subagent") } }),
    );
    expect(
      withCode(r.diagnostics, "theta/load/prompt-mode-callable"),
      "no prompt-mode error for a subagent-mode callee",
    ).toBeUndefined();
    expect(r.registered).toBe(true);
    // `./code-review.theta` → default name `code_review` (hyphens → underscores).
    expect(r.callableSet?.entries.has("code_review")).toBe(true);
  });
});

// --- frontmatter-fields-a.md §`tools` — invalid `as` rename ---------------

describe("V6c-T — invalid `as` rename (theta/load/invalid-tool-rename)", () => {
  it("theta/load/invalid-tool-rename: a `tools:` `as` rename target that is not theta-identifier-shaped (e.g. `as MyTool`) is rejected at load time", () => {
    const r = resolveList(
      ["./summarise.theta as MyTool"],
      deps({ thetaCallees: { "./summarise.theta": thetaCallee("subagent") } }),
    );
    const dg = withCode(r.diagnostics, "theta/load/invalid-tool-rename");
    expect(dg, "theta/load/invalid-tool-rename for a non-lowercase-first `as` target").toBeDefined();
    expect(dg?.severity).toBe("error");
    // Message from code-registry-load.md; both `<name>` placeholders render the target.
    expect(dg?.message).toBe(
      "'as MyTool' rename target must be lowercase-first; got 'MyTool'",
    );
    expect(r.registered, "an invalid-rename theta is not registered").toBe(false);
  });

  it("theta/load/invalid-tool-rename: a lowercase-first `as` target resolves under the renamed name", () => {
    const r = resolveList(
      ["read as file_read"],
      deps({ piTools: ["read"] }),
    );
    expect(
      withCode(r.diagnostics, "theta/load/invalid-tool-rename"),
      "no invalid-rename error for a lowercase-first `as` target",
    ).toBeUndefined();
    expect(r.registered).toBe(true);
    // The renamed name is bound; the verbatim Pi-tool name is not.
    expect(r.callableSet?.entries.has("file_read")).toBe(true);
    expect(r.callableSet?.entries.has("read")).toBe(false);
  });
});

// --- frontmatter-fields-a.md §`tools` — name collision --------------------

describe("V6c-T — name collision (theta/load/tool-name-collision)", () => {
  it("theta/load/tool-name-collision: two `tools:` entries resolving to the same name fire the collision", () => {
    // `read` (verbatim) and `./read.theta` (default name `read`) both resolve to `read`.
    const r = resolveList(
      ["read", "./read.theta"],
      deps({
        piTools: ["read"],
        thetaCallees: { "./read.theta": thetaCallee("subagent") },
      }),
    );
    const dg = withCode(r.diagnostics, "theta/load/tool-name-collision");
    expect(dg, "theta/load/tool-name-collision for two entries resolving to the same name").toBeDefined();
    expect(dg?.severity).toBe("error");
    // Message from code-registry-load.md.
    expect(dg?.message).toBe(
      "tool name 'read' collides with another 'tools:' entry, top-level fn, or import",
    );
    expect(r.registered, "a colliding-name theta is not registered").toBe(false);
  });

  it("theta/load/tool-name-collision: a name colliding with a top-level fn or import fires the collision", () => {
    const r = resolveScalar(
      "read",
      deps({ piTools: ["read"], reservedNames: ["read"] }),
    );
    const dg = withCode(r.diagnostics, "theta/load/tool-name-collision");
    expect(dg, "theta/load/tool-name-collision for a name colliding with a top-level fn/import").toBeDefined();
    expect(dg?.message).toBe(
      "tool name 'read' collides with another 'tools:' entry, top-level fn, or import",
    );
    expect(r.registered).toBe(false);
  });

  it("theta/load/tool-name-collision: an `as` rename resolves the collision — both callables bind", () => {
    const r = resolveList(
      ["read", "./read.theta as read_child"],
      deps({
        piTools: ["read"],
        thetaCallees: { "./read.theta": thetaCallee("subagent") },
      }),
    );
    expect(
      withCode(r.diagnostics, "theta/load/tool-name-collision"),
      "an `as` rename disambiguates the colliding name — no collision fires",
    ).toBeUndefined();
    expect(r.registered).toBe(true);
    expect(r.callableSet?.entries.has("read")).toBe(true);
    expect(r.callableSet?.entries.has("read_child")).toBe(true);
  });
});

// --- frontmatter-fields-b-and-templates.md §Resolution snapshot -----------
//     (frozen set, no ambient inheritance) + §YAML-shape (both spellings)

describe("V6c-T — resolution snapshot (frozen, no ambient inheritance) and both YAML spellings", () => {
  it("the resolved callable set is frozen (no post-load mutation widens it)", () => {
    const r = resolveScalar("read", deps({ piTools: ["read"] }));
    expect(r.registered).toBe(true);
    expect(r.callableSet, "a registered theta carries its resolution snapshot").toBeDefined();
    expect(
      Object.isFrozen(r.callableSet),
      "the resolution snapshot is frozen",
    ).toBe(true);
  });

  it("no ambient inheritance: only explicitly-listed callables appear in the set", () => {
    // Registry offers `read`, `grep`, `bash`; the theta lists only `read`.
    const r = resolveScalar("read", deps({ piTools: ["read", "grep", "bash"] }));
    expect(r.registered).toBe(true);
    expect(r.callableSet?.entries.size, "only the one listed callable is present").toBe(1);
    expect(r.callableSet?.entries.has("read")).toBe(true);
    expect(r.callableSet?.entries.has("grep"), "an ambient tool is not inherited").toBe(false);
  });

  it("absent / empty `tools:` yields the empty callable set", () => {
    const rAbsent = resolveCallableSet({
      file: "test.theta",
      tools: { kind: "absent" },
      deps: deps({ piTools: ["read"] }),
    });
    expect(rAbsent.registered).toBe(true);
    // The empty callable set is still a frozen snapshot (no ambient inheritance,
    // no post-load widening) — the frozen assertion reds on the absent V6c body.
    expect(
      Object.isFrozen(rAbsent.callableSet),
      "the empty callable set is a frozen snapshot",
    ).toBe(true);
    expect(rAbsent.callableSet?.entries.size, "absent `tools:` → empty callable set").toBe(0);
  });

  it("both YAML spellings parse to the same callable set", () => {
    const d = deps({ piTools: ["read", "grep", "bash"] });
    const scalar = resolveScalar("read, grep, bash", d);
    const list = resolveList(["read", "grep", "bash"], d);
    expect(scalar.registered).toBe(true);
    expect(list.registered).toBe(true);
    const scalarNames = [...(scalar.callableSet?.entries.keys() ?? [])].sort();
    const listNames = [...(list.callableSet?.entries.keys() ?? [])].sort();
    expect(scalarNames, "the short form parses all three Pi tools").toEqual(["bash", "grep", "read"]);
    expect(listNames, "both spellings parse to the same callable set").toEqual(scalarNames);
  });
});

// --- Gap-2: the frozen `.theta` entry carries its authoritative callee path ----
//     so the runtime resolves the callee by presented name (shared by the
//     code-driven `<name>(args)` path and the model-driven `.theta` adapter),
//     instead of re-deriving it from the basename — which dropped renamed
//     (`as foo`) and hyphenated (`code_review`) callees, silently omitting them.

describe("Gap-2 — snapshot `.theta` entry carries the authoritative calleePath", () => {
  /** The `calleePath` on the resolved `.theta` entry bound under `name`. */
  function calleePathOf(r: CallableSetResult, name: string): string | undefined {
    const entry = r.callableSet?.entries.get(name);
    return entry !== undefined && entry.kind === "theta" ? entry.calleePath : undefined;
  }

  it("a bare-basename callee: presented name `child` carries calleePath `./child.theta`", () => {
    const r = resolveList(
      ["./child.theta"],
      deps({ thetaCallees: { "./child.theta": thetaCallee("subagent") } }),
    );
    expect(r.registered).toBe(true);
    expect(r.callableSet?.entries.has("child")).toBe(true);
    expect(calleePathOf(r, "child"), "the entry carries the path as written").toBe("./child.theta");
  });

  it("a HYPHENATED callee `./my-tool.theta` → presented `my_tool` STILL carries calleePath `./my-tool.theta`", () => {
    // The presented name applies the hyphen→underscore rewrite; the calleePath
    // must remain the real hyphenated path (a basename re-derivation of
    // `my_tool` would look for the nonexistent `./my_tool.theta` and drop it).
    const r = resolveList(
      ["./my-tool.theta"],
      deps({ thetaCallees: { "./my-tool.theta": thetaCallee("subagent") } }),
    );
    expect(r.registered).toBe(true);
    expect(r.callableSet?.entries.has("my_tool")).toBe(true);
    expect(
      calleePathOf(r, "my_tool"),
      "the hyphenated real path is retained under the underscore-presented name",
    ).toBe("./my-tool.theta");
  });

  it("a RENAMED callee `./c.theta as foo` carries calleePath `./c.theta` under `foo`", () => {
    // `foo` does not end in `.theta`; a basename `.endsWith('.theta')` match would
    // never find it and drop the renamed callable.
    const r = resolveList(
      ["./c.theta as foo"],
      deps({ thetaCallees: { "./c.theta": thetaCallee("subagent") } }),
    );
    expect(r.registered).toBe(true);
    expect(r.callableSet?.entries.has("foo")).toBe(true);
    expect(calleePathOf(r, "foo"), "the renamed entry carries the real path").toBe("./c.theta");
  });
});
