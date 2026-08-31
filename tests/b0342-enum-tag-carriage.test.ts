// Bug 0342 §Fix (D3 carriage) — offline unit cells for the new PIC-59 §D3
// `enum_tags` envelope sidecar (`src/runtime/subagent-envelope.ts`) and the
// two value-graph walks that populate/consume it
// (`src/runtime/enum-tag-carriage.ts`).
//
// These cells exercise the SIDECAR and the WALKS in isolation, offline — the
// real invoke path across a spawned subagent hop is covered by the
// integration witness (`tests/b0342-forwarded-enum-subagent-chain.test.ts`),
// which this file does not duplicate.

import { describe, expect, it } from "vitest";
import {
  parseEnvelopeLine,
  serializeOkEnvelope,
  type EnumTagEntry,
} from "../src/runtime/subagent-envelope";
import {
  collectForwardedEnumTags,
  retagForwardedEnums,
} from "../src/runtime/enum-tag-carriage";
import {
  brandSchemaValue,
  makeEnumValue,
  makeOk,
  schemaTagOf,
  defineRecordField,
  type ThetaValue,
} from "../src/runtime/value";
import type { EnumDecl, SchemaDecl } from "../src/parser/theta-document";
import { decodeInboundValue } from "../src/runtime/inbound-boundary";
import { lowerQueryResponseSchema } from "../src/runtime/query-schema-lowering";
import { AjvSchemaValidator, type LoweredSchema, type SchemaSlug } from "../src/seams/schema-validator";
import { parseDoc } from "./helpers/e2e-s1";

describe("bug 0342 §Fix — envelope enum_tags sidecar round-trip", () => {
  it("serializeOkEnvelope + parseEnvelopeLine round-trips the sidecar unchanged", () => {
    const tags: readonly EnumTagEntry[] = [
      { p: "/own", k: "/bs.theta#Sev" },
      { p: "/fwd", k: "/cs.theta#Sev" },
    ];
    const line = serializeOkEnvelope({ own: "low", fwd: "low" }, tags);
    const parse = parseEnvelopeLine(line.trimEnd());
    expect(parse.kind).toBe("ok");
    if (parse.kind === "ok") {
      expect(parse.enumTags).toEqual(tags);
    }
  });

  it("an enum-free Ok emits NO enum_tags field and byte-equals the pre-sidecar call form", () => {
    const withoutTagsArg = serializeOkEnvelope({ n: 1 });
    const withEmptyTags = serializeOkEnvelope({ n: 1 }, []);
    expect(withoutTagsArg).toBe(withEmptyTags);
    expect(withoutTagsArg.includes("enum_tags")).toBe(false);
  });

  it("a parsed envelope WITHOUT enum_tags yields kind:ok with enumTags undefined (version-skew/absent fallback)", () => {
    const line = serializeOkEnvelope({ n: 1 });
    const parse = parseEnvelopeLine(line.trimEnd());
    expect(parse.kind).toBe("ok");
    if (parse.kind === "ok") {
      expect(parse.enumTags).toBeUndefined();
    }
  });

  it.each([
    ["not an array", '{"theta_result":{"v":1,"ok":1,"enum_tags":"nope"}}'],
    ["element missing p", '{"theta_result":{"v":1,"ok":1,"enum_tags":[{"k":"x"}]}}'],
    ["element missing k", '{"theta_result":{"v":1,"ok":1,"enum_tags":[{"p":"/x"}]}}'],
    ["non-string p", '{"theta_result":{"v":1,"ok":1,"enum_tags":[{"p":1,"k":"x"}]}}'],
    ["non-string k", '{"theta_result":{"v":1,"ok":1,"enum_tags":[{"p":"/x","k":1}]}}'],
  ])("malformed enum_tags (%s) is ignored: parse stays kind:ok, enumTags undefined, no throw", (_label, line) => {
    const parse = parseEnvelopeLine(line);
    expect(parse.kind).toBe("ok");
    if (parse.kind === "ok") {
      expect(parse.enumTags).toBeUndefined();
    }
  });
});

describe("bug 0342 §Fix — collectForwardedEnumTags", () => {
  it("a scalar enum records one entry at the root pointer", () => {
    const value = makeEnumValue("/cs.theta#Sev", "low");
    expect(collectForwardedEnumTags(value as unknown as ThetaValue)).toEqual([
      { p: "", k: "/cs.theta#Sev" },
    ]);
  });

  it("a composite with two DIFFERENT declaring keys records both pointers", () => {
    const value: ThetaValue = {
      own: makeEnumValue("/bs.theta#Sev", "low") as unknown as ThetaValue,
      fwd: makeEnumValue("/cs.theta#Sev", "low") as unknown as ThetaValue,
    };
    const entries = collectForwardedEnumTags(value);
    expect(entries).toEqual(
      expect.arrayContaining([
        { p: "/own", k: "/bs.theta#Sev" },
        { p: "/fwd", k: "/cs.theta#Sev" },
      ]),
    );
    expect(entries.length).toBe(2);
  });

  it("an array element is addressed by index", () => {
    const value: ThetaValue = [makeEnumValue("/cs.theta#Sev", "low") as unknown as ThetaValue];
    expect(collectForwardedEnumTags(value)).toEqual([{ p: "/0", k: "/cs.theta#Sev" }]);
  });

  it("a Result-wrapped enum is NOT descended — mirrors rebuildInbound's isResultValue passthrough; widening this would be out of scope for bug 0342", () => {
    const wrapped = makeOk(makeEnumValue("/cs.theta#Sev", "low") as unknown as ThetaValue);
    expect(collectForwardedEnumTags(wrapped)).toEqual([]);
  });

  it("a __proto__-keyed object field carrying an enum is pointer-encoded without prototype pollution", () => {
    const record: Record<string, ThetaValue> = {};
    defineRecordField(record, "__proto__", makeEnumValue("/cs.theta#Sev", "low") as unknown as ThetaValue);
    const entries = collectForwardedEnumTags(record);
    expect(entries).toEqual([{ p: "/__proto__", k: "/cs.theta#Sev" }]);
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
  });
});

describe("bug 0342 §Fix — retagForwardedEnums", () => {
  it("applies per-position keys, restoring the declaring identity a stamped immediate-callee retag overwrote", () => {
    const decoded: ThetaValue = {
      own: makeEnumValue("/bs.theta#Sev", "low") as unknown as ThetaValue,
      fwd: makeEnumValue("/bs.theta#Sev", "low") as unknown as ThetaValue,
    };
    const tags: readonly EnumTagEntry[] = [{ p: "/fwd", k: "/cs.theta#Sev" }];
    const retagged = retagForwardedEnums(decoded, tags) as Record<string, unknown>;
    expect((retagged.own as { valueOf(): string }).valueOf()).toBe("low");
    expect((retagged.fwd as { valueOf(): string }).valueOf()).toBe("low");
    expect(collectForwardedEnumTags(retagged as ThetaValue)).toEqual(
      expect.arrayContaining([
        { p: "/own", k: "/bs.theta#Sev" },
        { p: "/fwd", k: "/cs.theta#Sev" },
      ]),
    );
  });

  it("preserves a sibling schema brand on the enclosing object", () => {
    const decoded = brandSchemaValue(
      { fwd: makeEnumValue("/bs.theta#Sev", "low") as unknown as ThetaValue },
      "Pair",
    ) as unknown as ThetaValue;
    const retagged = retagForwardedEnums(decoded, [{ p: "/fwd", k: "/cs.theta#Sev" }]);
    expect(schemaTagOf(retagged)).toBe("Pair");
  });

  it("leaves an unmapped box's tag alone", () => {
    const decoded: ThetaValue = { own: makeEnumValue("/bs.theta#Sev", "low") as unknown as ThetaValue };
    const retagged = retagForwardedEnums(decoded, [{ p: "/fwd", k: "/cs.theta#Sev" }]) as Record<
      string,
      unknown
    >;
    expect(collectForwardedEnumTags(retagged as ThetaValue)).toEqual([
      { p: "/own", k: "/bs.theta#Sev" },
    ]);
  });

  it("no-ops on an unknown pointer, never throwing", () => {
    const decoded: ThetaValue = "low";
    expect(() => retagForwardedEnums(decoded, [{ p: "/nowhere/at/all", k: "/x.theta#Sev" }])).not.toThrow();
    expect(retagForwardedEnums(decoded, [{ p: "/nowhere/at/all", k: "/x.theta#Sev" }])).toBe("low");
  });

  it("re-boxes a __proto__-keyed field via defineRecordField without polluting Object.prototype", () => {
    const record: Record<string, ThetaValue> = {};
    defineRecordField(record, "__proto__", makeEnumValue("/bs.theta#Sev", "low") as unknown as ThetaValue);
    const retagged = retagForwardedEnums(record, [{ p: "/__proto__", k: "/cs.theta#Sev" }]);
    expect(collectForwardedEnumTags(retagged)).toEqual([{ p: "/__proto__", k: "/cs.theta#Sev" }]);
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
  });
});

describe("bug 0342 — review-F1: a wire-renamed forwarded field does not misalign the sidecar pointer", () => {
  // Review round 1 (F1) raised a correctness concern: a WIRE-RENAMED
  // forwarded field (`fwd as "f": Sev`) might misalign
  // collectForwardedEnumTags' child-side pointers against
  // retagForwardedEnums' parent-side pointers, since both walks key by JSON
  // Pointer and a rename changes the wire key. The orchestrator disproved
  // this empirically: `serializeOkEnvelope` writes the callee's own
  // theta-side object via plain `JSON.stringify` (no wire translation runs on
  // the invoke-envelope leg), and `lowerQueryResponseSchema` — the lowering
  // the four inbound boundaries decode against — emits THETA-SIDE property
  // names, so the `as "f"` rename never reaches either walk. This cell locks
  // that invariant against silent regression: it drives a real rename-bearing
  // schema through collect -> envelope round-trip -> decode -> retag, and
  // fails if a future change ever makes either walk rename-aware.
  it("a schema-declared wire rename on the forwarded field leaves collect/retag pointer-aligned", () => {
    const src =
      '---\nmode: prompt\n---\n' +
      'enum Sev { Low = "low", High = "high" }\n' +
      'schema Pair { own: Sev, fwd as "f": Sev }\n' +
      "Pair { own: Sev.Low, fwd: Sev.Low }\n";
    const doc = parseDoc(src, "/theta/a.theta");
    const errors = doc.diagnostics.filter((d) => d.severity === "error");
    if (errors.length > 0) {
      // No silent skip: a parse error here means no assertion below is
      // actually driving the shipped lowering/decode path.
      throw new Error(`harness: fixture theta did not parse cleanly: ${JSON.stringify(errors)}`);
    }
    const schemaDecls = doc.body.statements.filter(
      (s): s is SchemaDecl => s.kind === "schema",
    );
    const enumDecls = doc.body.statements.filter((s): s is EnumDecl => s.kind === "enum");

    // The pre-serialisation, child-side value: `own` declared by B, `fwd`
    // forwarded from a value C originally produced — two DIFFERENT declaring
    // keys, so a collect/retag misalignment would be visible.
    const srcValue: ThetaValue = {
      own: makeEnumValue("/b.theta#Sev", "low") as unknown as ThetaValue,
      fwd: makeEnumValue("/c.theta#Sev", "low") as unknown as ThetaValue,
    };
    const tags = collectForwardedEnumTags(srcValue);
    expect(tags).toEqual([
      { p: "/own", k: "/b.theta#Sev" },
      { p: "/fwd", k: "/c.theta#Sev" },
    ]);

    const line = serializeOkEnvelope(srcValue, tags);
    const parsed = parseEnvelopeLine(line.trimEnd());
    if (parsed.kind !== "ok") {
      throw new Error(`harness: envelope round-trip did not parse as ok: ${JSON.stringify(parsed)}`);
    }

    const lowered = lowerQueryResponseSchema("Pair", schemaDecls, enumDecls);
    if (lowered === undefined) {
      // No silent skip: an undefined lowering means the fixture schema is not
      // reaching the seam this cell exists to lock.
      throw new Error("harness: 'Pair' did not lower");
    }

    const decoded = decodeInboundValue({
      lowered,
      annotation: "Pair",
      schemaNames: new Set(schemaDecls.map((s) => s.name)),
      enumNames: new Set(enumDecls.map((e) => e.name)),
      validated: parsed.value,
      schemaValidator: new AjvSchemaValidator({
        emit: (): void => {},
        slugOf: (schema: LoweredSchema): SchemaSlug => {
          const canonicalBytes = JSON.stringify(schema);
          return { slug: canonicalBytes, canonicalBytes };
        },
      }),
      enumDeclaringPath: "/a.theta",
    });

    // Premise: the lowered document — and so the decode — keys the forwarded
    // position "fwd", its THETA-side name, never "f", its wire name. If a
    // future change made the lowering (or the decode) rename-aware, this is
    // the assertion that would catch the pointer shift before the retag below
    // could mask it.
    expect(Object.keys(decoded as object)).toEqual(["own", "fwd"]);

    const retagged = retagForwardedEnums(decoded, parsed.enumTags ?? []);
    expect(collectForwardedEnumTags(retagged)).toEqual([
      { p: "/own", k: "/b.theta#Sev" },
      { p: "/fwd", k: "/c.theta#Sev" },
    ]);
  });
});
