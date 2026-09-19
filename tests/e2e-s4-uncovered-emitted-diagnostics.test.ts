import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { parseDoc } from "./helpers/e2e-s1";

// S4 e2e campaign — coverage for registry diagnostic codes that ARE emitted by
// the shipped parser but had no shape-asserting test (DIAG "UNCOVERED-emitted",
// per docs/e2e-campaign/execution/s4-errors-diagnostics-results.md). Each test
// drives the production offline pipeline (parseThetaDocument →
// src/parser/theta-document.ts:563) and asserts the emitted code + severity +
// message match the closed registry (DIAG-1/2/4). Expected message strings are
// sourced from the registry Message column (docs/spec_topics/diagnostics/
// code-registry-{parse,load}.md) with `<…>` placeholders interpolated.

function parse(src: string): readonly Diagnostic[] {
  return parseDoc(src).diagnostics;
}

function find(src: string, code: string): Diagnostic | undefined {
  return parse(src).find((d) => d.code === code);
}

describe("S4 — UNCOVERED-emitted load-phase frontmatter diagnostics", () => {
  it("theta/load/unknown-mode-value — an out-of-set mode: value (REQ-DIAG-132)", () => {
    const d = find("---\nmode: banana\n---\nhi", "theta/load/unknown-mode-value");
    expect(d).toBeDefined();
    expect(d?.severity).toBe("error");
    expect(d?.message).toBe(
      "unknown 'mode:' value 'banana'; expected 'prompt' or 'subagent'",
    );
  });

  it("theta/load/unknown-methodology-value — bad respond_repair.methodology (REQ-DIAG-133)", () => {
    const d = find(
      "---\nmode: prompt\nrespond_repair:\n  methodology: banana\n---\nhi",
      "theta/load/unknown-methodology-value",
    );
    expect(d).toBeDefined();
    expect(d?.severity).toBe("error");
    expect(d?.message).toBe(
      "unknown 'respond_repair.methodology:' value 'banana'; expected 'validator_error', 'schema_repeat', or 'none'",
    );
  });

  it("theta/load/unknown-bind-context-value — bad bind_context value (REQ-DIAG-134)", () => {
    const d = find(
      "---\nmode: prompt\nbind_context: banana\n---\nhi",
      "theta/load/unknown-bind-context-value",
    );
    expect(d).toBeDefined();
    expect(d?.severity).toBe("error");
    expect(d?.message).toBe(
      "unknown 'bind_context:' value 'banana'; expected 'none' or 'session'",
    );
  });

  it("theta/load/params-null — params: null is rejected (REQ-DIAG-129)", () => {
    const d = find("---\nmode: prompt\nparams: null\n---\nhi", "theta/load/params-null");
    expect(d).toBeDefined();
    expect(d?.severity).toBe("error");
    expect(d?.message).toBe(
      "'params: null' is not permitted; omit 'params:' or use 'params: {}'",
    );
  });
});

describe("S4 — UNCOVERED-emitted parse-phase diagnostics", () => {
  it("theta/parse/import-non-thetalib-extension — import path not ending in .thetalib (REQ-DIAG-28)", () => {
    const d = find('import { x } from "./y.theta"', "theta/parse/import-non-thetalib-extension");
    expect(d).toBeDefined();
    expect(d?.severity).toBe("error");
    expect(d?.message).toBe("import path './y.theta' does not end in .thetalib");
  });

  it("theta/parse/system-on-prompt-mode — system: on a prompt-mode theta (REQ-DIAG-106)", () => {
    const d = find("---\nmode: prompt\nsystem: hello\n---\nhi", "theta/parse/system-on-prompt-mode");
    expect(d).toBeDefined();
    expect(d?.severity).toBe("error");
    expect(d?.message).toBe("'system:' is not permitted on a mode: prompt theta");
  });

  it("theta/parse/system-interp-not-path — non-path system: interpolation body (REQ-DIAG-107)", () => {
    const d = find(
      "---\nmode: subagent\nparams:\n  a: string\nsystem: x ${1 + 2}\n---\nhi",
      "theta/parse/system-interp-not-path",
    );
    expect(d).toBeDefined();
    expect(d?.severity).toBe("error");
    expect(d?.message).toBe("'system:' interpolation body must be a bare identifier path");
  });

  it("theta/parse/system-interp-unknown-param — unknown param in system: interpolation (REQ-DIAG-108)", () => {
    const d = find(
      "---\nmode: subagent\nsystem: hello ${nope}\n---\nhi",
      "theta/parse/system-interp-unknown-param",
    );
    expect(d).toBeDefined();
    expect(d?.severity).toBe("error");
    expect(d?.message).toBe("'system:' interpolation references unknown param 'nope'");
  });
});
