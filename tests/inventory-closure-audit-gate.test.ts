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

// Bug 0373 §Fix: one negative-test fixture per family-(4) rebinding/laundering
// `<symptom>` token (audit-failures.md §"Failure-surface contract": at least one
// fixture per stable `<symptom>` token). Each seed is a single synthetic file
// carrying exactly one prohibited family-(4) shape; the audit MUST surface it
// under `audit/violation/out-of-scope-shape/<symptom>` (family (4) routes to
// step-2(b) branch (5) rewrite-shape, never an exemption marker), and the
// green-on-main tree above proves none of these shapes exist in `src/`.
function auditOneFile(src: string): AuditRecord[] {
  const result = runInventoryClosureAudit({
    files: new Map([["src/x.ts", src]]),
    inventory: SDK_SURFACE_INVENTORY,
    typeboxNamedImportAllowList: TYPEBOX_NAMED_IMPORT_ALLOW_LIST,
    typeboxMemberAccessAllowList: TYPEBOX_MEMBER_ACCESS_ALLOW_LIST,
  });
  return result.records.filter((r) => r.discriminator.startsWith("audit/violation/"));
}

const FAMILY_4_FIXTURES: ReadonlyArray<readonly [symptom: string, src: string]> = [
  ["computed-access", `function f(pi: ExtensionAPI){ return pi["x" as never]; }`],
  ["namespace-destructuring", `function f(ctx: ExtensionContext){ const { ui } = ctx; return ui; }`],
  ["captured-rebinding", `function f(pi: ExtensionAPI){ const reg = pi.registerCommand; return reg; }`],
  // Grouping / cast wrappers must not evade the capture check (review F1).
  ["captured-rebinding", `function f(pi: ExtensionAPI){ const reg = (pi.registerCommand); return reg; }`],
  ["captured-rebinding", `function f(ctx: ExtensionContext){ const c = (ctx as never); return c; }`],
  ["destructured-carrier", `function f({ ui }: ExtensionContext){ return ui; }`],
  ["wrapped-annotation", `function f(api: Readonly<ExtensionAPI>){ return api; }`],
  ["type-parameter-constraint", `function wrap<C extends ExtensionContext>(c: C){ return c; }`],
  ["subtype-creation", `interface MyCtx extends ExtensionContext { extra: number }`],
  ["non-parameter-binding", `class Theta { stashed!: ExtensionContext; }`],
  ["object-assign", `function f(pi: ExtensionAPI){ return Object.assign({}, pi); }`],
  ["keyof-typeof", `function f(pi: ExtensionAPI){ type K = keyof typeof pi; return ("x" as K); }`],
  ["cjs-require", `const sdk = require("@earendil-works/pi-coding-agent"); export default sdk;`],
  // `createRequire` reached through a `module` namespace import (review F3).
  ["cjs-require", `import * as M from "module"; const sdk = M.createRequire(import.meta.url)("@earendil-works/pi-ai"); export default sdk;`],
];

describe("inventory-closure audit gate — family-(4) rebinding/laundering shapes (bug 0373)", () => {
  it.each(FAMILY_4_FIXTURES)("reds a seeded %s shape under its own symptom token", (symptom, src) => {
    const violations = auditOneFile(src);
    const seeded = violations.filter(
      (v) => v.discriminator === `audit/violation/out-of-scope-shape/${symptom}`,
    );
    // (a) the record fires under the family-(4) discriminator with this symptom.
    expect(seeded.length, violations.map((v) => v.discriminator).join(",")).toBeGreaterThan(0);
    // (b) family (4) routes to step-2(b) branch (5) rewrite-shape (never an exemption marker).
    for (const v of seeded) {
      expect(v.discriminator).toMatch(DISCRIMINATOR_SHAPE);
      expect(v.proposedResolution).toContain("rewrite-into-recognised-shape");
    }
    // No family-(4) fixture launders its surface out of every family (the shape is caught).
    expect(violations.every((v) => v.discriminator.startsWith("audit/violation/out-of-scope-shape/"))).toBe(
      true,
    );
  });
});

// Bug 0374 §Fix: one fixture per family-(5) `<symptom>` token — the six
// grammar clauses (a)-(g minus contextual e), the placement clause (e), the
// family-(4)-line clause (h), and the two stale sub-kinds (s1)/(s2)
// (audit-failures.md: ten family-(5) tokens, one fixture each, no collapsing).
// Each family-(5) record carries the `<n/a>` symbol sentinel and routes to
// step-2(b) branch (4) stale-rewrite.
const FAMILY_5_FIXTURES: ReadonlyArray<readonly [token: string, src: string]> = [
  ["missing-colon", `function f(pi: ExtensionAPI){ return pi.zzzOff(); } // allow-pi-surface PIC#audit — justification here`],
  ["bad-citation", `function f(pi: ExtensionAPI){ return pi.zzzOff(); } // allow-pi-surface: not_a_citation — justification here`],
  // A valid citation PREFIX with trailing junk is clause (b), not (c) (review F2).
  ["bad-citation", `function f(pi: ExtensionAPI){ return pi.zzzOff(); } // allow-pi-surface: REQ-12x — justification here`],
  ["bad-separator", `function f(pi: ExtensionAPI){ return pi.zzzOff(); } // allow-pi-surface: PIC#audit – justification here`],
  ["bad-justification", `function f(pi: ExtensionAPI){ return pi.zzzOff(); } // allow-pi-surface: PIC#audit — ok`],
  ["non-lowercase-keyword", `function f(pi: ExtensionAPI){ return pi.zzzOff(); } // Allow-Pi-Surface: PIC#audit — justification here`],
  ["block-comment-form", `function f(pi: ExtensionAPI){ return pi.zzzOff(); } /* allow-pi-surface: PIC#audit — justification here */`],
  ["marker-on-non-exemptible-family-4-line", `function f(ctx: ExtensionContext){ const c = ctx; return c; } // allow-pi-surface: PIC#audit — justification here`],
  [
    "off-originating-line",
    `function f(ctx: ExtensionContext){\n  return ctx\n    .zzzOff(); // allow-pi-surface: PIC#audit — justification here\n}`,
  ],
  ["no-surface-on-line", `// allow-pi-surface: PIC#audit — orphan marker, no surface on this line\nexport const y = 1;`],
  ["all-in-inventory", `function f(pi: ExtensionAPI){ return pi.getFlag("x"); } // allow-pi-surface: PIC#audit — stale, getFlag resolves`],
];

describe("inventory-closure audit gate — family-(5) stale/malformed marker tokens (bug 0374)", () => {
  it.each(FAMILY_5_FIXTURES)("routes a seeded %s marker to its own family-(5) token", (token, src) => {
    const violations = auditOneFile(src);
    const fam5 = violations.filter(
      (v) => v.discriminator === `audit/violation/stale-or-malformed-marker/${token}`,
    );
    expect(fam5.length, violations.map((v) => v.discriminator).join(",")).toBeGreaterThan(0);
    for (const v of fam5) {
      expect(v.discriminator).toMatch(DISCRIMINATOR_SHAPE);
      expect(v.symbol).toBe("<n/a>"); // family (5) carries no underlying named symbol
      expect(v.proposedResolution).toContain("bump-step-2b-stale-rewrite"); // branch (4)
    }
  });
});

// Bug 0374 §Fix: one fixture per multi-line surface-placement shape
// (audit-failures.md), exercising the per-shape originating-line rule — a marker
// on the originating line AUTHORISES its off-inventory surface (zero violations).
const PLACEMENT_FIXTURES: ReadonlyArray<readonly [shape: string, src: string]> = [
  // Rule (i): a `pi.<member>` split originates on the property line.
  ["cat-1-property-line", `function f(pi: ExtensionAPI){\n  return pi\n    .zzzOff(); // allow-pi-surface: PIC#audit — justification here\n}`],
  // Rule (iii): a `ctx`-rooted chain originates on the `ctx` identifier line.
  ["cat-3-ctx-line", `function f(ctx: ExtensionContext){\n  return ctx // allow-pi-surface: PIC#audit — justification here\n    .zzzOff();\n}`],
  // Rule (ii): a marker on the `import`-keyword line authorises every symbol.
  ["cat-2-import-keyword", `import { // allow-pi-surface: PIC#audit — justification here\n  ZzzOff,\n} from "@earendil-works/pi-coding-agent";\nexport const z = ZzzOff;`],
  // Rule (iv): a marker on an individual specifier line authorises that symbol.
  ["cat-2-per-symbol", `import {\n  ZzzOff, // allow-pi-surface: PIC#audit — justification here\n} from "@earendil-works/pi-coding-agent";\nexport const z = ZzzOff;`],
];

describe("inventory-closure audit gate — multi-line originating-line placement (bug 0374)", () => {
  it.each(PLACEMENT_FIXTURES)("a marker on the originating line of a %s surface authorises it", (_shape, src) => {
    const violations = auditOneFile(src);
    expect(violations.map((v) => `${v.discriminator} ${v.path}:${v.line} ${v.symbol}`).join("\n")).toBe("");
  });
});

describe("inventory-closure audit gate — reds against a seeded off-inventory reference", () => {
  it("a seeded off-inventory pi.<member> access flips the gate red with the family-(1) record", () => {
    const files = walkAuditedSourceTree();
    // Seed one off-inventory Pi-side reference into the walked tree. The
    // `ExtensionAPI` carrier import resolves via the inventory (no marker — a
    // marker would now be a stale (s2) all-in-inventory record, bug 0374).
    files.set(
      "src/__seed__/off-inventory.ts",
      [
        `import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";`,
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
