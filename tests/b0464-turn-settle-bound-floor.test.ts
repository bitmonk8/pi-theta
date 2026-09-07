// Bug 0464 — the on-session settle bound must stay production-scale.
//
// Bug 0288 made the turn-lifecycle waits bounded-and-loud; its 60 s end-phase
// total then failed EVERY legitimately long tool-loop turn (a reviewer reading
// a file shard, a fixer running an offline suite) as a transport expiry while
// the run was still healthily streaming — production-blocking for tool-heavy
// thetas, found by the /quality-loop dogfood run (bug 0464). The bound is a
// deliberate ceiling on one turn's settle phase: 30 minutes. This witness pins
// the exported value exactly so a regression back toward a test-scale total
// reds loudly; retuning the ceiling is deliberate and re-pins this value in
// the same commit. The loud-expiry behaviour itself (bound-agnostic, fake
// clock) stays pinned by the 0288 witness cells.

import { describe, expect, it } from "vitest";
import { TURN_END_SETTLE_BOUND_MS } from "../src/extension/production-theta-producer";

describe("bug 0464 — settle-phase bound floor", () => {
  it("the on-session settle bound is exactly 30 minutes", () => {
    expect(
      TURN_END_SETTLE_BOUND_MS,
      "the settle-phase ceiling is 30 min so multi-minute tool loops (review " +
        "shards, offline-suite gate runs) settle normally; a smaller value " +
        "re-introduces the bug-0464 failure — never lower this to make a " +
        "test convenient (the 0288 witnesses run on a fake clock and do not " +
        "need it small)",
    ).toBe(1_800_000);
  });
});
