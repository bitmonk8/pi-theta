import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS architectural-check module, no type declarations.
import { findAmbientPrimitiveReferences } from "../tools/arch-checks/no-ambient-primitives.js";
import { WallClock } from "../src/seams/wall-clock";
import { CryptoIdSource } from "../src/seams/crypto-id-source";
import { FakeClock } from "./helpers/fake-clock";
import { FakeIdSource } from "./helpers/fake-id-source";
import { tsFiles } from "./helpers/ts-files";

// V8d-T — failing tests for the paired `V8d` `Clock` / `IdSource` seam
// implementations: the `WallClock` and `CryptoIdSource` production adapters and
// the `FakeClock` / `FakeIdSource` test fakes. The bullets trace to PIC-12 and
// PIC-20 (host-interfaces-services.md).
//
// These tests red because the V8d adapters and fakes are stubs that throw — the
// implementation under test is absent — and the architectural ambient-ban tests
// red because the stub adapters carry none of the `// allow-ambient:`-exempted
// delegations yet. Each assertion names the specific PIC-12 / PIC-20 behaviour
// it pins so the red is on the assertion, not a fixture or harness throw.

const TIMING_PRIMITIVES = [
  "Date.now",
  "performance.now",
  "Date.prototype.getTime",
  "setTimeout",
  "clearTimeout",
];

/** Canonical lowercase 8-4-4-4-12 hex UUID, per the §7 placeholder convention. */
const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Strip every same-line `// allow-ambient:` comment (keeps the code before it). */
function stripAllowAmbient(source: string): string {
  return source
    .split("\n")
    .map((line) => {
      const at = line.indexOf("// allow-ambient:");
      return at === -1 ? line : line.slice(0, at);
    })
    .join("\n");
}

const srcRoot = fileURLToPath(new URL("../src", import.meta.url));

function primitivesOf(refs: { primitive: string }[]): string[] {
  return refs.map((r) => r.primitive);
}

/** Resolve a real macrotask turn so a delegated `setTimeout` callback can fire. */
function realDelay(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// PIC-12 — `WallClock` production adapter behaviour.
// ---------------------------------------------------------------------------

describe("V8d-T — WallClock production adapter (PIC-12)", () => {
  it("PIC-12: now() returns monotonic milliseconds (a non-decreasing number)", () => {
    const clock = new WallClock();
    const a = clock.now();
    const b = clock.now();
    expect(typeof a).toBe("number");
    expect(typeof b).toBe("number");
    expect(b).toBeGreaterThanOrEqual(a);
  });

  it("PIC-12: wallNow() returns Unix epoch milliseconds (wall-clock time)", () => {
    const clock = new WallClock();
    const t = clock.wallNow();
    expect(typeof t).toBe("number");
    // A real epoch-ms value is well past 2020-01-01 (1577836800000).
    expect(t).toBeGreaterThan(1577836800000);
  });

  it("PIC-12: setTimeout schedules a callback that fires and returns a handle", async () => {
    const clock = new WallClock();
    let fired = false;
    const handle = clock.setTimeout(() => {
      fired = true;
    }, 1);
    expect(handle).not.toBeUndefined();
    expect(fired).toBe(false); // not fired synchronously
    await realDelay(10);
    expect(fired).toBe(true);
  });

  it("PIC-12: clearTimeout cancels a scheduled callback before it fires", async () => {
    const clock = new WallClock();
    let fired = false;
    const handle = clock.setTimeout(() => {
      fired = true;
    }, 5);
    clock.clearTimeout(handle);
    await realDelay(20);
    expect(fired).toBe(false);
  });

  it("PIC-12: Clock is per-runtime — two WallClock instances are independent, each functional", () => {
    const a = new WallClock();
    const b = new WallClock();
    expect(a).not.toBe(b);
    expect(typeof a.now()).toBe("number");
    expect(typeof b.now()).toBe("number");
  });
});

// ---------------------------------------------------------------------------
// PIC-12 — `FakeClock` test-fake semantics (the conformance vehicle).
// ---------------------------------------------------------------------------

describe("V8d-T — FakeClock test-fake semantics (PIC-12)", () => {
  it("PIC-12: advance(ms) synchronously fires timers whose deadline elapsed, in deadline order", () => {
    const clock = new FakeClock();
    const order: string[] = [];
    clock.setTimeout(() => order.push("late"), 100);
    clock.setTimeout(() => order.push("early"), 10);
    clock.advance(50);
    expect(order).toEqual(["early"]); // only the 10ms timer is due at t=50
    clock.advance(100);
    expect(order).toEqual(["early", "late"]);
  });

  it("PIC-12: advance(0) fires a 0-ms timer (the loop-iter macrotask-yield vehicle)", () => {
    const clock = new FakeClock();
    let fired = false;
    clock.setTimeout(() => {
      fired = true;
    }, 0);
    clock.advance(0);
    expect(fired).toBe(true);
  });

  it("PIC-12: equal-deadline timers fire in registration order", () => {
    const clock = new FakeClock();
    const order: string[] = [];
    clock.setTimeout(() => order.push("first"), 10);
    clock.setTimeout(() => order.push("second"), 10);
    clock.advance(10);
    expect(order).toEqual(["first", "second"]);
  });

  it("PIC-12: clearTimeout cancels a pending timer and is a no-op for an already-fired handle", () => {
    const clock = new FakeClock();
    let firedB = false;
    const a = clock.setTimeout(() => {}, 5);
    clock.advance(5); // `a` fires
    const b = clock.setTimeout(() => {
      firedB = true;
    }, 5);
    clock.clearTimeout(a); // no-op for already-fired handle (must not throw)
    clock.clearTimeout(b); // cancels the pending timer
    clock.advance(100);
    expect(firedB).toBe(false);
  });

  it("PIC-12: now() returns accumulated time and is not implicitly advanced; wallNow() returns the injected epoch", () => {
    const clock = new FakeClock({ now: 0, wallEpoch: 1700000000000 });
    expect(clock.now()).toBe(0);
    expect(clock.wallNow()).toBe(1700000000000);
    clock.advance(250);
    expect(clock.now()).toBe(250); // advanced only by advance()
    expect(clock.wallNow()).toBe(1700000000000); // wall epoch not implicitly advanced
  });

  it("PIC-12: Clock is per-runtime — two FakeClock instances have independent timer queues", () => {
    const a = new FakeClock();
    const b = new FakeClock();
    let firedB = false;
    b.setTimeout(() => {
      firedB = true;
    }, 10);
    a.advance(100); // advancing A must not fire B's timer
    expect(firedB).toBe(false);
    b.advance(10);
    expect(firedB).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PIC-12 — ambient-timing ban: WallClock is the sole exempt timing site.
// ---------------------------------------------------------------------------

describe("V8d-T — ambient-timing ban (PIC-12)", () => {
  it("PIC-12: the WallClock adapter delegates each timing primitive at a same-line `// allow-ambient: <primitive> — Clock` exempt site, and is the ONLY src/** timing site", () => {
    const wallClockPath = path.join(srcRoot, "seams", "wall-clock.ts");
    const source = readFileSync(wallClockPath, "utf8");

    // (a) The delegations exist: stripping the allow-ambient comments re-exposes
    // each timing primitive to the scan — proving the adapter actually reaches
    // performance.now / Date.now / global setTimeout / clearTimeout.
    const exposed = primitivesOf(findAmbientPrimitiveReferences(stripAllowAmbient(source)));
    expect(exposed).toEqual(
      expect.arrayContaining(["performance.now", "Date.now", "setTimeout", "clearTimeout"]),
    );

    // (b) Each delegation is exempted by its own same-line comment: with the
    // comments intact the scan flags nothing in the adapter.
    expect(findAmbientPrimitiveReferences(source)).toHaveLength(0);

    // (c) Sole site: no OTHER src/** module references a timing primitive.
    for (const file of tsFiles(srcRoot)) {
      if (file === wallClockPath) continue;
      const timingRefs = findAmbientPrimitiveReferences(readFileSync(file, "utf8")).filter(
        (r: { primitive: string }) => TIMING_PRIMITIVES.includes(r.primitive),
      );
      expect(
        timingRefs,
        `${file} references a timing primitive outside the WallClock adapter: ${JSON.stringify(timingRefs)}`,
      ).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------
// PIC-20 — `CryptoIdSource` production adapter behaviour.
// ---------------------------------------------------------------------------

describe("V8d-T — CryptoIdSource production adapter (PIC-20)", () => {
  it("PIC-20: newInvocationId() returns a canonical lowercase 8-4-4-4-12 hex UUID", () => {
    const ids = new CryptoIdSource();
    expect(ids.newInvocationId()).toMatch(CANONICAL_UUID);
  });

  it("PIC-20: newToolCallId() returns a canonical lowercase 8-4-4-4-12 hex UUID body", () => {
    const ids = new CryptoIdSource();
    expect(ids.newToolCallId()).toMatch(CANONICAL_UUID);
  });

  it("PIC-20: both members mint a fresh UUID per call (delegating to crypto.randomUUID)", () => {
    const ids = new CryptoIdSource();
    const minted = [
      ids.newInvocationId(),
      ids.newInvocationId(),
      ids.newToolCallId(),
      ids.newToolCallId(),
    ];
    expect(new Set(minted).size).toBe(4); // all distinct
    for (const id of minted) {
      expect(id).toMatch(CANONICAL_UUID);
    }
  });
});

// ---------------------------------------------------------------------------
// PIC-20 — `FakeIdSource` test-fake semantics.
// ---------------------------------------------------------------------------

describe("V8d-T — FakeIdSource test-fake semantics (PIC-20)", () => {
  it("PIC-20: hands out the configured sequence in order across newInvocationId/newToolCallId", () => {
    const ids = new FakeIdSource(["id-1", "id-2", "id-3"]);
    expect(ids.newInvocationId()).toBe("id-1");
    expect(ids.newToolCallId()).toBe("id-2");
    expect(ids.newInvocationId()).toBe("id-3");
  });

  it("PIC-20: IdSource is per-runtime — two FakeIdSource instances draw independent sequences", () => {
    const a = new FakeIdSource(["a-1", "a-2"]);
    const b = new FakeIdSource(["b-1", "b-2"]);
    expect(a.newInvocationId()).toBe("a-1");
    expect(b.newInvocationId()).toBe("b-1"); // B's sequence untouched by A's draw
    expect(a.newInvocationId()).toBe("a-2");
    expect(b.newInvocationId()).toBe("b-2");
  });
});

// ---------------------------------------------------------------------------
// PIC-20 — ambient crypto ban: CryptoIdSource is the sole crypto.randomUUID site.
// ---------------------------------------------------------------------------

describe("V8d-T — ambient crypto.randomUUID ban (PIC-20)", () => {
  it("PIC-20: the CryptoIdSource adapter delegates both members to crypto.randomUUID at same-line `// allow-ambient: crypto.randomUUID — IdSource` exempt sites, and is the ONLY src/** crypto.randomUUID site", () => {
    const idSourcePath = path.join(srcRoot, "seams", "crypto-id-source.ts");
    const source = readFileSync(idSourcePath, "utf8");

    // (a) Both delegations exist: stripping the allow-ambient comments re-exposes
    // exactly two crypto.randomUUID references (one per member).
    const exposed = primitivesOf(findAmbientPrimitiveReferences(stripAllowAmbient(source))).filter(
      (p) => p === "crypto.randomUUID",
    );
    expect(exposed).toEqual(["crypto.randomUUID", "crypto.randomUUID"]);

    // (b) Each delegation is exempted by its own same-line comment: with the
    // comments intact the scan flags nothing in the adapter.
    expect(findAmbientPrimitiveReferences(source)).toHaveLength(0);

    // (c) Sole site: no OTHER src/** module references crypto.randomUUID.
    for (const file of tsFiles(srcRoot)) {
      if (file === idSourcePath) continue;
      const cryptoRefs = findAmbientPrimitiveReferences(readFileSync(file, "utf8")).filter(
        (r: { primitive: string }) => r.primitive === "crypto.randomUUID",
      );
      expect(
        cryptoRefs,
        `${file} references crypto.randomUUID outside the CryptoIdSource adapter: ${JSON.stringify(cryptoRefs)}`,
      ).toHaveLength(0);
    }
  });
});
