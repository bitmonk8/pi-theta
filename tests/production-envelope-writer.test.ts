// RFC-0006 (PIC-59) — the production child-side return-envelope writer must
// reach fd 1, NOT Pi's rerouted `process.stdout.write`.
//
// FINDING (latent 0.9.0 bug the RFC-0006 prototype exposed): in `--mode json` /
// `-p` / rpc Pi calls `takeOverStdout()` (core/output-guard.js, from main.js) at
// startup, which REASSIGNS `process.stdout.write` to route to STDERR so stray
// extension stdout cannot corrupt the `--mode json` event channel. Extension
// code loads AFTER that takeover, so the previous `process.stdout.write(line)`
// envelope emission would land on stderr in a REAL child and the parent's stdout
// scan (the child's fd-1 pipe) would NEVER see the `theta_result` envelope. The
// fix writes fd 1 directly (`fs.writeSync(1, line)`), bypassing the reassignment.
//
// These offline pins assert the chosen mechanism as far as fakes allow: the
// writer forwards verbatim to the injected fd writer, and the DEFAULT writer
// does NOT route through `process.stdout.write` (the reroute target).
//
// Spec: pi-integration-contract/subagent.md PIC-59; .prototype-hld README
// CONSTRAINT 2 ("json-mode owns stdout").

import { describe, expect, it, vi } from "vitest";
import { createProductionEnvelopeWriter } from "../src/extension/production-subagent-host";

describe("RFC-0006 PIC-59 — production envelope writer reaches fd 1", () => {
  it("forwards the envelope line VERBATIM to the injected fd writer", () => {
    const written: string[] = [];
    const writer = createProductionEnvelopeWriter((line) => written.push(line));
    const line = `${JSON.stringify({ theta_result: { v: 1, ok: "x" } })}\n`;
    writer(line);
    expect(written).toEqual([line]);
  });

  it("the DEFAULT writer bypasses process.stdout.write (Pi's --mode json reroute target)", () => {
    // Simulate `takeOverStdout()`: reassign `process.stdout.write` to a spy that,
    // in a real child, would route to STDERR. The default envelope writer MUST
    // NOT go through it — it targets fd 1 directly via `fs.writeSync`.
    const original = process.stdout.write.bind(process.stdout);
    const spy = vi.fn((): boolean => true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.stdout as unknown as { write: unknown }).write = spy;
    try {
      const writer = createProductionEnvelopeWriter();
      // A newline-terminated JSONL line to fd 1 (one atomic syscall).
      writer(`${JSON.stringify({ theta_result: { v: 1, ok: "fd1-probe" } })}\n`);
    } finally {
      (process.stdout as unknown as { write: unknown }).write = original;
    }
    // The reassigned (reroute) write was never used — the envelope bypassed it.
    expect(spy).not.toHaveBeenCalled();
  });
});
