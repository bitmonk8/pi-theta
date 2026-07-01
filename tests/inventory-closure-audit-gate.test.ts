import { describe, expect, it } from "vitest";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SDK_SURFACE_INVENTORY } from "../src/extension/sdk-inventory";
import {
  formatAuditRecordLine,
  runInventoryClosureAudit,
  type AuditRecord,
  type AuditResult,
} from "../src/extension/inventory-closure-audit";

// V18b — the `npm test`-side inventory-closure audit gate (the disk-walk driver
// + fail-closed `npm test` wiring the paired core `runInventoryClosureAudit`
// plugs into), per pi-integration-contract audit shards:
//
//   • audit-resolution.md §"Audit scope" — the `src/**/*.ts`-minus-exclusions
//     closed file set, case-sensitive `.ts` match, symlinks not followed.
//   • audit-wire-and-canary.md §"Wire serialisation" — line-delimited stdout,
//     four tab-delimited fields per record; §"Non-empty-scan canary" — exactly
//     one canary record per invocation, both counters `> 0` on a green run.
//   • inventory-audit-intro.md §"Inventory-closure audit" — the audit lands
//     GREEN on `main` (not a land-red gate), and RED against a seeded
//     off-inventory reference.
//
// The audit is unanchored by a numbered PREFIX-N REQ-ID (it mechanizes the
// PIC-15 / §"Inventory-closure audit" surface-set-closure MUST), so this gate
// asserts the observable green-on-main / red-on-seed Ships-when contract.

const TYPEBOX_NAMED_IMPORT_ALLOW_LIST = ["Type"] as const;
const TYPEBOX_MEMBER_ACCESS_ALLOW_LIST = ["Unsafe"] as const;

/** `audit/<class>/<family>/<symptom>` structural shape (audit-failures.md). */
const DISCRIMINATOR_SHAPE =
  /^audit\/(violation|infra|canary)\/[a-z0-9]+(-[a-z0-9]+)*\/[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Walk the *audited source tree* (audit-resolution.md §"Audit scope"): the
 * closed set matching `src/**\/*.ts`, minus co-located `*.test.ts` / `*.spec.ts`,
 * `*.d.ts` type stubs, any path under a `__tests__/` segment, and the
 * `src/extension/**\/*.assert.ts` brand-string module. Symlinks are opaque (not
 * followed); the `.ts` leaf suffix is matched case-sensitively.
 */
function walkAuditedSourceTree(): Map<string, string> {
  const files = new Map<string, string>();
  const visit = (dir: string): void => {
    for (const name of readdirSync(dir).sort()) {
      const abs = join(dir, name);
      const ls = lstatSync(abs);
      if (ls.isSymbolicLink()) continue; // opaque: not walked, target excluded
      const posix = abs.split("\\").join("/");
      if (ls.isDirectory()) {
        if (name === "__tests__") continue;
        visit(abs);
        continue;
      }
      if (!name.endsWith(".ts")) continue; // include glob is closed on bare `.ts`
      if (name.endsWith(".test.ts") || name.endsWith(".spec.ts") || name.endsWith(".d.ts")) {
        continue;
      }
      if (posix.startsWith("src/extension/") && name.endsWith(".assert.ts")) continue;
      files.set(posix, readFileSync(abs, "utf8"));
    }
  };
  visit("src");
  return files;
}

/**
 * The fail-closed audit driver: run the core over the walked file map, emit
 * every record as a line-delimited wire record on stdout (the sole
 * machine-parseable surface), and derive the non-zero-exit disposition. Any
 * throw before record emission is surfaced fail-closed as an `audit/infra/...`
 * record rather than a silent green (audit-wire-and-canary.md §"Infrastructure-
 * failure handling").
 */
function runAuditGate(files: Map<string, string>): {
  result: AuditResult;
  lines: string[];
  violations: AuditRecord[];
  canaryRecords: AuditRecord[];
} {
  let result: AuditResult;
  try {
    result = runInventoryClosureAudit({
      files,
      inventory: SDK_SURFACE_INVENTORY,
      typeboxNamedImportAllowList: TYPEBOX_NAMED_IMPORT_ALLOW_LIST,
      typeboxMemberAccessAllowList: TYPEBOX_MEMBER_ACCESS_ALLOW_LIST,
    });
  } catch (e: unknown) {
    // Fail-closed: an audit-internal throw before record emission surfaces as an
    // infrastructure-failure record and a hard test failure, never a silent pass.
    const detail = e instanceof Error ? e.message : "unknown";
    const infra: AuditRecord = {
      discriminator: "audit/infra/audit-crash/uncaught",
      path: "<n/a>",
      line: "<n/a>",
      symbol: "<n/a>",
      proposedResolution: `audit crashed before emission: ${detail}`,
    };
    process.stdout.write(`${formatAuditRecordLine(infra)}\n`);
    throw e;
  }
  const lines = result.records.map(formatAuditRecordLine);
  // Emit the line-delimited wire stream on stdout for a CI parser to consume.
  process.stdout.write(`${lines.join("\n")}\n`);
  const cls = (r: AuditRecord): string => r.discriminator.split("/")[1] ?? "";
  return {
    result,
    lines,
    violations: result.records.filter((r) => cls(r) === "violation"),
    canaryRecords: result.records.filter((r) => cls(r) === "canary"),
  };
}

describe("inventory-closure audit gate — lands green on main", () => {
  it("walks the audited source tree and emits zero violation records", () => {
    const files = walkAuditedSourceTree();
    // The canary guards against a no-op walk: the tree must be non-empty.
    expect(files.size).toBeGreaterThan(0);

    const { result, violations, canaryRecords, lines } = runAuditGate(files);

    // Land-green: no `main` source line surfaces as any of the five violation
    // families (inventory-audit-intro.md §"Inventory-closure audit").
    expect(violations, violations.map((v) => formatAuditRecordLine(v)).join("\n")).toHaveLength(0);

    // Exactly one canary record per invocation, and it is the green-path token
    // with both counters above their `> 0` floor.
    expect(canaryRecords).toHaveLength(1);
    expect(canaryRecords[0]!.discriminator).toBe("audit/canary/scan-floor/ok");
    expect(result.walked).toBeGreaterThan(0);
    expect(result.recognised).toBeGreaterThan(0);

    // Every emitted record obeys the four-field tab-delimited wire shape and the
    // `audit/<class>/<family>/<symptom>` discriminator shape.
    for (const line of lines) {
      const fields = line.split("\t");
      expect(fields).toHaveLength(4);
      expect(fields[0]).toMatch(DISCRIMINATOR_SHAPE);
    }
  });
});

describe("inventory-closure audit gate — reds against a seeded off-inventory reference", () => {
  it("a seeded off-inventory pi.<member> access flips the gate red with the family-(1) record", () => {
    const files = walkAuditedSourceTree();
    // Seed one off-inventory Pi-side reference into the walked tree.
    files.set(
      "src/__seed__/off-inventory.ts",
      [
        `import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"; // allow-pi-surface: PIC#sdk-capability-inventory — carrier`,
        `export default function seed(pi: ExtensionAPI): void {`,
        `  pi.definitelyNotAnInventoryMember("boom");`,
        `}`,
        ``,
      ].join("\n"),
    );

    const { violations } = runAuditGate(files);

    const seeded = violations.filter(
      (v) => v.discriminator === "audit/violation/pi-member/off-inventory",
    );
    expect(seeded.length).toBeGreaterThan(0);
    expect(seeded.some((v) => v.symbol === "definitelyNotAnInventoryMember")).toBe(true);
  });
});
