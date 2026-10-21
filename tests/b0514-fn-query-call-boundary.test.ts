// B0514: production parser -> production producer/binding -> executeBody ->
// prompt query driver -> settled session -> caller Result consumption.
// Only the surrounding pi session/model and clock are doubles (instant settle).
// This deterministic composition test is complemented by the real pi host
// witness in tests/live/acceptance/b0514live-fn-query-call-boundary.test.ts.
// QRY-1/QRY-8 and FN-3/FN-5 require the value-position call to carry Result.
import { describe, expect, it } from "vitest";
import { parseThetaDocument } from "../src/parser/theta-document";
import { parseDeps } from "./helpers/e2e-s1";
import { makeBeltProbes } from "./helpers/runtime-belt-probe-harness";

const probes = makeBeltProbes((body) => {
  const doc = parseThetaDocument({
    path: "b0514.theta",
    bytes: new TextEncoder().encode("---\nmode: prompt\n---\n" + body),
  }, parseDeps());
  expect(doc.diagnostics.filter(d => d.severity === "error"), "fixture loads without errors").toEqual([]);
  return doc;
}, "b0514");

const consume = '\nmatch r { Ok(v) => "OK:" + v, Err(e) => "ERRARM" }';

async function assertConsumed(body: string): Promise<void> {
  const probe = await probes.driveInterp(body);
  expect(probe.sent, "real production query driver sent the rendered query").toEqual(["q 1"]);
  const observed = probe.kind === "threw"
    ? { outcome: "panic", value: String(probe.thrown) }
    : { outcome: probe.outcome, value: probe.value };
  expect(observed, "B0514 fn-call Result consumption must yield OK:settled-reply, not MatchError").toEqual({
    outcome: "success", value: "OK:settled-reply",
  });
}

describe("B0514 production composition", () => {
  it("healthy direct query binding", async () => {
    await assertConsumed('let r = @`q 1`' + consume);
  });

  it("healthy fn carrying an already bound query Result", async () => {
    await assertConsumed('fn f(n: number) { let s = @`q ${n}`\n s }\nlet r = f(1)' + consume);
  });

  for (const [name, fn] of [
    ["single-form tail", 'fn f(n: number) { @`q ${n}` }'],
    ["multi-statement tail", 'fn f(n: number) { let z = 1\n @`q ${n}` }'],
    ["explicit return", 'fn f(n: number) { let z = 1\n return @`q ${n}` }'],
  ]) {
    it(`value-position ${name} preserves query Result`, async () => {
      await assertConsumed(fn + '\nlet r = f(1)' + consume);
    });
  }

  it("healthy terminal fn call retains raw payload at the theta boundary", async () => {
    const probe = await probes.driveInterp('fn f(n: number) { let z = 1\n @`q ${n}` }\nf(1)');
    expect(probe).toEqual({ kind: "rendered", sent: ["q 1"], outcome: "success", value: "settled-reply" });
  });
});
