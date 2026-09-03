import { describe, expect, it } from "vitest";
import { SDK_SURFACE_INVENTORY } from "../src/extension/sdk-inventory";
import {
  runInventoryClosureAudit,
  type AuditRecord,
  type AuditResult,
} from "../src/extension/inventory-closure-audit";

// V18b-T — failing tests for the build-time inventory-closure audit (paired
// V18b impl).
//
// Spec: pi-integration-contract audit shards — inventory-audit-intro.md
// §"Inventory-closure audit", audit-resolution.md, audit-recognised-shapes.md,
// audit-target-categories.md, audit-failures.md, audit-wire-and-canary.md.
//
// The audit is a post-1.0 hardening of the theta-1.0 *surface-set closure* MUST;
// its behaviour is unanchored by a numbered PREFIX-N REQ-ID (the surface it
// mechanizes is PIC-15 / §"Inventory-closure audit"), so these tests assert the
// observable Failure-surface contract rather than a coverage-matrix REQ-ID.
//
// Discriminator `<family>` / `<symptom>` tokens are implementation-owned
// (audit-failures.md §"Failure-surface contract"), so the tests key on the
// spec-pinned surfaces the leaf may NOT rename: the three-class `<class>`
// segment (violation / infra / canary), the per-family record-shape `symbol`
// values (family-(1) = bare member; family-(4) = the offending shape literal;
// family-(5) = the literal `<n/a>` sentinel), and the two canary counters.

const TYPEBOX_NAMED_IMPORT_ALLOW_LIST = ["Type"] as const;
const TYPEBOX_MEMBER_ACCESS_ALLOW_LIST = ["Unsafe"] as const;

/** The `audit/<class>/<family>/<symptom>` structural shape (audit-failures.md). */
const DISCRIMINATOR_SHAPE =
  /^audit\/(violation|infra|canary)\/[a-z0-9]+(-[a-z0-9]+)*\/[a-z0-9]+(-[a-z0-9]+)*$/;

/** The literal five-character `<n/a>` sentinel (audit-wire-and-canary.md). */
const NA = "<n/a>";

function audit(files: Record<string, string>): AuditResult {
  return runInventoryClosureAudit({
    files: new Map(Object.entries(files)),
    inventory: SDK_SURFACE_INVENTORY,
    typeboxNamedImportAllowList: TYPEBOX_NAMED_IMPORT_ALLOW_LIST,
    typeboxMemberAccessAllowList: TYPEBOX_MEMBER_ACCESS_ALLOW_LIST,
  });
}

/** 1-based line number of the first source line containing `needle`. */
function lineOf(src: string, needle: string): number {
  const lines = src.split("\n");
  const idx = lines.findIndex((l) => l.includes(needle));
  if (idx < 0) throw new Error(`fixture bug: '${needle}' not found in source`);
  return idx + 1;
}

function classOf(record: AuditRecord): string {
  // `audit/<class>/...` — segment index 1.
  return record.discriminator.split("/")[1] ?? "";
}

function recordsOfClass(res: AuditResult, cls: string): AuditRecord[] {
  return res.records.filter((r) => classOf(r) === cls);
}

describe("inventory-closure audit — family (1): off-inventory pi.<member>", () => {
  it("an off-inventory pi.<member> access fires a violation-class audit/<class>/<family>/<symptom> record naming the offending member; an in-inventory access does not", () => {
    // The canonical `pi: ExtensionAPI` carrier per audit-target-categories.md
    // (1). The `ExtensionAPI` type-only import resolves via its category-(2)
    // inventory row (so no marker is needed); `pi.registerCommand` resolves
    // (SDK_SURFACE_INVENTORY, rightmost-segment join key); `pi.notARealMember`
    // does not and must surface under family (1).
    const path = "src/extension/factory-family1.ts";
    const src = [
      // Bug 0374 §Fix: `ExtensionAPI` resolves as a category-(2) inventory entry,
      // so the carrier-type import needs no marker; a marker here would now be a
      // stale (s2) all-in-inventory violation per audit-failures.md.
      `import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";`,
      `export default function factory(pi: ExtensionAPI): void {`,
      `  pi.registerCommand("demo");`,
      `  pi.notARealMember("boom");`,
      `}`,
      ``,
    ].join("\n");

    const res = audit({ [path]: src });

    const violations = recordsOfClass(res, "violation");
    // Exactly the one off-inventory member is a violation.
    expect(violations).toHaveLength(1);

    const rec = violations[0]!;
    // Discriminator obeys the three-class structural shape, class `violation`.
    expect(rec.discriminator).toMatch(DISCRIMINATOR_SHAPE);
    expect(classOf(rec)).toBe("violation");
    // family-(1) record shape: symbol = the bare member; path/line locate it.
    expect(rec.symbol).toBe("notARealMember");
    expect(rec.path).toBe(path);
    expect(rec.line).toBe(String(lineOf(src, "pi.notARealMember")));
    // A proposed-resolution arm is always carried (never empty / `<n/a>` here).
    expect(rec.proposedResolution.length).toBeGreaterThan(0);
    expect(rec.proposedResolution).not.toBe(NA);

    // The in-inventory `pi.registerCommand` access produced no violation.
    expect(violations.some((v) => v.symbol === "registerCommand")).toBe(false);
  });
});

describe("inventory-closure audit — recognised exemptions and typebox allow-lists pass", () => {
  it("a well-formed // allow-pi-surface: marker authorises an off-inventory surface: the reference is recognised and no violation is emitted", () => {
    const path = "src/extension/factory-exempt.ts";
    const src = [
      // Bug 0374 §Fix: the carrier-type import resolves via the inventory, so it
      // carries no marker (a marker would be a stale (s2) violation); the
      // off-inventory `pi.notARealMember` below is what the marker authorises.
      `import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";`,
      `export default function factory(pi: ExtensionAPI): void {`,
      `  pi.notARealMember("ok"); // allow-pi-surface: PIC#sdk-capability-inventory — intentional off-inventory touch`,
      `}`,
      ``,
    ].join("\n");

    const res = audit({ [path]: src });

    // No violation of any family — every reference resolved or is exempted.
    expect(recordsOfClass(res, "violation")).toHaveLength(0);
    // The exempted references were RECOGNISED (canary counter > 0), not silently
    // skipped — the marker authorises the surface, it does not hide it.
    expect(res.recognised).toBeGreaterThan(0);
    expect(res.walked).toBeGreaterThan(0);
  });

  it("the typebox { Type } named import and { Unsafe } member access resolve through the sibling allow-lists with no violation", () => {
    const path = "src/parser/typebox-use.ts";
    const src = [
      `import { Type } from "typebox";`,
      `export const schema = Type.Unsafe<string>({});`,
      ``,
    ].join("\n");

    const res = audit({ [path]: src });

    // `Type` (named-import allow-list) and `Type.Unsafe` (member-access
    // allow-list) both resolve; nothing surfaces as a family-(2) violation.
    expect(recordsOfClass(res, "violation")).toHaveLength(0);
    expect(res.recognised).toBeGreaterThan(0);
  });
});

describe("inventory-closure audit — non-empty-scan canary (fail-closed)", () => {
  it("a walk that recognises zero in-scope references fails the audit under a canary-class discriminator, disjoint from the theta/typecheck/* prefix", () => {
    // Files are walked, but they carry no in-scope Pi surface, so the
    // recognised-reference counter stays at its zero floor and the canary trips.
    const res = audit({
      "src/util/plain.ts": "export const answer = 42;\n",
    });

    const canaryReds = recordsOfClass(res, "canary");
    // The no-op-walker breakage surfaces as a canary-class record.
    expect(canaryReds.length).toBeGreaterThan(0);
    for (const rec of canaryReds) {
      expect(rec.discriminator).toMatch(DISCRIMINATOR_SHAPE);
    }

    // The recognised counter is at its zero floor (the tripped condition).
    expect(res.recognised).toBe(0);

    // Every emitted discriminator lives under the `audit/` namespace; the
    // `theta/typecheck/*` build-time brand-string prefix is disjoint and MUST
    // never appear as an audit record discriminator.
    for (const rec of res.records) {
      expect(rec.discriminator.startsWith("audit/")).toBe(true);
      expect(rec.discriminator.startsWith("theta/typecheck/")).toBe(false);
    }
  });
});

describe("inventory-closure audit — family (4): non-exemptible out-of-scope shapes", () => {
  // Each prohibited shape must fire a violation-class family-(4) record whose
  // `symbol` is the offending shape literal (the per-family record-shape table:
  // family (4) `symbol` = the verbatim single-line source of the offending
  // expression). A family-(4) record's `symbol` is therefore never the `<n/a>`
  // sentinel that identifies a family-(5) record.
  function familyFourRecords(res: AuditResult): AuditRecord[] {
    return recordsOfClass(res, "violation").filter((r) => r.symbol !== NA);
  }

  it("import * as pi fires a non-exemptible family-(4) shape record", () => {
    const path = "src/extension/star-import.ts";
    const src = `import * as pi from "@earendil-works/pi-coding-agent";\n`;
    const res = audit({ [path]: src });

    const shapeRecs = familyFourRecords(res);
    expect(shapeRecs.length).toBeGreaterThan(0);
    const rec = shapeRecs[0]!;
    expect(rec.discriminator).toMatch(DISCRIMINATOR_SHAPE);
    expect(classOf(rec)).toBe("violation");
    expect(rec.symbol).toContain("import * as pi");
    // family (4) is not exemptible — its proposed-resolution is a rewrite-shape
    // arm, never an `// allow-pi-surface:` marker suggestion.
    expect(rec.proposedResolution).not.toContain("allow-pi-surface");
  });

  it("a dynamic import() of a peer package fires a family-(4) shape record", () => {
    const path = "src/extension/dynamic-import.ts";
    const src = `export const load = () => import("@earendil-works/pi-coding-agent");\n`;
    const res = audit({ [path]: src });

    const shapeRecs = familyFourRecords(res);
    expect(shapeRecs.length).toBeGreaterThan(0);
    expect(shapeRecs[0]!.symbol).toContain("import(");
  });

  it("an aliased-import rebinding import { Foo as Bar } fires a family-(4) shape record", () => {
    const path = "src/extension/aliased-import.ts";
    const src = `import { SessionShutdownEvent as SSE } from "@earendil-works/pi-coding-agent";\n`;
    const res = audit({ [path]: src });

    const shapeRecs = familyFourRecords(res);
    expect(shapeRecs.length).toBeGreaterThan(0);
    expect(shapeRecs[0]!.symbol).toContain("as SSE");
  });

  it("an off-canonical-name ExtensionContext parameter fires a family-(4) shape record", () => {
    // The `ctx` parameter name is reserved for ExtensionContext /
    // ExtensionCommandContext carriers; a differently-named parameter typed
    // ExtensionContext is a prohibited off-canonical-name shape.
    const path = "src/extension/off-name-ctx.ts";
    const src = [
      // The `ExtensionContext` carrier type resolves via its category-(2)
      // inventory row, so no marker is needed (a marker would be a stale (s2)).
      `import type { ExtensionContext } from "@earendil-works/pi-coding-agent";`,
      `export function handler(context: ExtensionContext): void { void context; }`,
      ``,
    ].join("\n");
    const res = audit({ [path]: src });

    const shapeRecs = familyFourRecords(res);
    expect(shapeRecs.length).toBeGreaterThan(0);
    expect(shapeRecs.some((r) => r.line === String(lineOf(src, "context: ExtensionContext")))).toBe(
      true,
    );
  });

  it("an off-canonical-annotation ctx parameter (ctx: any) fires a family-(4) shape record", () => {
    // A parameter NAMED `ctx` whose annotation is not the ExtensionContext /
    // ExtensionCommandContext literal (here `any`) is a prohibited
    // off-canonical-annotation shape.
    const path = "src/extension/off-annotation-ctx.ts";
    const src = [`export function handler(ctx: any): void { void ctx; }`, ``].join("\n");
    const res = audit({ [path]: src });

    const shapeRecs = familyFourRecords(res);
    expect(shapeRecs.length).toBeGreaterThan(0);
    expect(shapeRecs[0]!.line).toBe(String(lineOf(src, "ctx: any")));
  });

  it("a family-(4) line carrying an // allow-pi-surface: marker surfaces a family-(5) <n/a> marker record AND still fires the family-(4) shape record (the marker does not suppress it)", () => {
    // audit-resolution.md §Exemption mechanism / malformed-marker clause (h):
    // a marker on a non-exemptible family-(4) line is itself malformed and
    // routes to family (5) under the dual-emission rule, while the family-(4)
    // shape discriminator fires independently on the same run.
    const path = "src/extension/star-import-marked.ts";
    const src =
      `import * as pi from "@earendil-works/pi-coding-agent"; // allow-pi-surface: PIC#sdk-capability-inventory — attempted (invalid) exemption\n`;
    const res = audit({ [path]: src });

    const violations = recordsOfClass(res, "violation");
    const markerLine = String(lineOf(src, "import * as pi"));

    // family-(5) record: `symbol` is the `<n/a>` sentinel (no underlying named
    // symbol), on the marked line.
    const familyFive = violations.filter((r) => r.symbol === NA && r.line === markerLine);
    expect(familyFive.length).toBeGreaterThan(0);
    expect(familyFive[0]!.discriminator).toMatch(DISCRIMINATOR_SHAPE);
    expect(classOf(familyFive[0]!)).toBe("violation");

    // family-(4) record STILL fires on the same line — the marker did not
    // suppress it (symbol = the shape literal, not `<n/a>`).
    const familyFour = violations.filter(
      (r) => r.symbol !== NA && r.symbol.includes("import * as pi") && r.line === markerLine,
    );
    expect(familyFour.length).toBeGreaterThan(0);
    // family (4) remains non-exemptible: no exemption-marker resolution offered.
    expect(familyFour[0]!.proposedResolution).not.toContain("allow-pi-surface");
  });
});
