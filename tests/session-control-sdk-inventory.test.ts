// RFC 0011 (V24a-T) — failing tests for the four new SDK_SURFACE_INVENTORY
// rows the session-control tools consume (the paired `V24a` implementation
// leaf), seam sheet §7.
//
// Spec: docs/rfcs/0011-session-control-tools.md §Compatibility;
// `.localpi/tmp/rfc-0011-seam-sheet.md` §7 (S5 — SDK inventory).
//
// Does NOT edit tests/sdk-inventory.test.ts (that file's assertions are
// untouched, per the builder contract). This file adds ONLY the four new
// rows' cells, plus the seam sheet's explicit "count pins that move: none"
// regression guards (`CAPABILITY_OBLIGATIONS.length === 7`,
// `OPTIONAL_UI_CAPABILITIES` length 5), asserted against the SAME imported
// constants `tests/sdk-inventory.test.ts` pins — so a future edit that moves
// either count reds in both files, not silently in neither.

import { describe, expect, it } from "vitest";
import {
  CAPABILITY_OBLIGATIONS,
  OPTIONAL_UI_CAPABILITIES,
  SDK_SURFACE_INVENTORY,
} from "../src/extension/sdk-inventory";
import { FACTORY_PROBED_SDK_MEMBERS } from "../src/extension/capability-probe";

// The four new rows (seam sheet §7).
const NEW_ROWS: readonly { readonly id: string; readonly kind: string }[] = [
  { id: "ctx.compact", kind: "ctx-member" },
  { id: "ctx.getContextUsage", kind: "ctx-member" },
  { id: "pi.setSessionName", kind: "pi-member" },
  { id: "pi.getSessionName", kind: "pi-member" },
];

describe("session-control-sdk-inventory (V24a-T) — the four new SDK_SURFACE_INVENTORY rows (§7)", () => {
  it("ctx.compact / ctx.getContextUsage / pi.setSessionName / pi.getSessionName each resolve with the pinned kind", () => {
    const byId = new Map(SDK_SURFACE_INVENTORY.map((e) => [e.id, e]));
    for (const row of NEW_ROWS) {
      const entry = byId.get(row.id);
      expect(entry, `SDK_SURFACE_INVENTORY row '${row.id}' must resolve`).toBeDefined();
      expect(entry?.kind, `row '${row.id}' kind`).toBe(row.kind);
    }
  });

  it("each new row is present exactly once (no duplicate-id row)", () => {
    for (const row of NEW_ROWS) {
      const rows = SDK_SURFACE_INVENTORY.filter((entry) => entry.id === row.id);
      expect(rows, `duplicate-id check for '${row.id}'`).toHaveLength(1);
    }
  });
});

describe("session-control-sdk-inventory (V24a-T) — count pins that move: none (§7)", () => {
  it("FACTORY_PROBED_SDK_MEMBERS is unchanged by the RFC 0011 rows", () => {
    // Seam sheet §3.3: "FACTORY_PROBED_SDK_MEMBERS is NOT widened (cell V9)".
    // Asserted here against the SAME imported constant `tests/capability-
    // probe.test.ts` pins, so this file and that one cannot silently diverge.
    expect(FACTORY_PROBED_SDK_MEMBERS.length).toBe(8);
  });

  it("CAPABILITY_OBLIGATIONS.length === 7 is unchanged (no eighth capability is minted)", () => {
    expect(CAPABILITY_OBLIGATIONS.length).toBe(7);
  });

  it("OPTIONAL_UI_CAPABILITIES stays the five-member list (unchanged)", () => {
    expect(OPTIONAL_UI_CAPABILITIES).toHaveLength(5);
  });
});
