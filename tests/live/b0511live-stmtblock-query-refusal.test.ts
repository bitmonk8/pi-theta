// Bug 0511 — real SDK host, shipped extension entry, on-disk discovery,
// production parse/load gate and actual registered slash-command inventory.
// No mock composition root; no prompt()-resolved success claim. This is a
// registration-only bug observable, so no provider turn or child spawn is
// needed. requireLiveProvider still fails loudly on missing credentials/model.
// The offline companion pins the exact QRY-19 reason and QRY-2 schema fields.
// Contract: docs/bugs/0511 §Approved ruling (Resolution A).
import { describe, expect, it } from "vitest";
import { b0511Healthy, b0511ParQuery, b0511Prompt, b0511Rejected } from "../helpers/b0511-fixtures";
import { bootShippedExtension, plantThetaWorkspace, requireLiveProvider } from "./harness";

describe("bug 0511 — discarded StmtBlock queries cannot register at production load", () => {
  it("healthy controls register and already-diagnosed multi-form blocks are refused", async () => {
    const provider = await requireLiveProvider();
    const healthy = b0511Healthy.map((row) => ({ ...row, stem: `b0511-${row.name}` }));
    const rejected = b0511Rejected.map((row) => ({ ...row, stem: `b0511-${row.name}` }));
    const workspace = plantThetaWorkspace([
      ...[...healthy, ...rejected].map((row) => ({
        source: "project" as const, stem: row.stem, text: b0511Prompt(row.body),
      })),
      { source: "project", stem: "b0511-par-query", text: b0511Prompt(b0511ParQuery) },
    ]);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      for (const row of healthy) {
        expect(handle.command(row.stem), `healthy ${row.name} must register`).toBeDefined();
      }
      expect(handle.command("b0511-par-query"), "CTRL-4 still forbids a ParForBody query").toBeUndefined();
      // Prove the refusal direction of this SAME inventory assertion with a
      // known-red production parse shape before asserting the missing cases.
      for (const row of rejected.filter((r) => r.name.endsWith("let-newline") || r.name.endsWith("let-packed"))) {
        expect(handle.command(row.stem), `known QRY-19 ${row.name} must not register`).toBeUndefined();
      }
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });

  it("all bare StmtBlock tails are refused regardless of form count or preceding form", async () => {
    const provider = await requireLiveProvider();
    const rows = b0511Rejected.map((row) => ({ ...row, stem: `b0511-${row.name}` }));
    const workspace = plantThetaWorkspace([
      { source: "project", stem: "b0511-control", text: b0511Prompt("if true { let _ = @`q` }") },
      ...rows.map((row) => ({ source: "project" as const, stem: row.stem, text: b0511Prompt(row.body) })),
    ]);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(handle.command("b0511-control"), "explicit discard control must register").toBeDefined();
      const incorrectlyRegistered = rows.filter((row) => handle.command(row.stem) !== undefined).map((row) => row.name);
      expect(
        incorrectlyRegistered,
        "b0511 registration mismatch: QRY-19 must withhold every discarded StmtBlock query",
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
