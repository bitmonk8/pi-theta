import { describe, expect, it } from "vitest";
import { parseDocBytes, codes, hasCode, findCode } from "./helpers/e2e-s1";

// Bug 0410 — the UTF-8 encoding gate is unreachable on the production
// whole-document parse path.
//
// `parseThetaDocument` decodes `source.bytes` with a NON-FATAL TextDecoder
// (theta-document.ts §parseThetaDocument `decodeSource(source.bytes)`), which
// silently substitutes U+FFFD for invalid sequences BEFORE any validation.
// The lexer's UTF-8 validator (firstInvalidUtf8Offset / gate at lexer.ts:101)
// is then fed RE-ENCODED, always-valid bytes, so `theta/load/invalid-encoding`
// can never fire on the shipped pipeline (`parseViaPassCache` →
// `parseThetaDocument`). The lexer-seam gate
// (tests/e2e-s1-lexer-intake.test.ts, REQ-LEX-3) witnesses only the direct
// `lexTheta(rawBytes)` path, which no production caller exercises.
//
// These witnesses drive the WHOLE-DOCUMENT path via `parseDocBytes`
// (= shipped `parseThetaDocument`) — deliberately NOT `lexBytes`, since the
// lexer seam already validates. Spec: docs/spec_topics/lexical.md §Encoding
// (lexical.md:5). Cases mirror bug 0410 §Reproduction (a) and (c) plus the
// leading-UTF-8-BOM control that the future gate must not over-fire on
// (bug 0410 §Fix constraint iii).

/** Concatenate byte chunks into one Uint8Array. */
function concat(...chunks: (Uint8Array | number[])[]): Uint8Array {
  const parts = chunks.map((c) => (c instanceof Uint8Array ? c : Uint8Array.from(c)));
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/** UTF-8-encode a string to bytes. */
function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

describe("bug 0410 — whole-document path must run the encoding gate", () => {
  it("(a) an invalid 0xFF byte inside a string literal faults at byte offset 31, not clean load", () => {
    // Prefix `---\nmode: prompt\n---\nlet s = "a` is 31 bytes; the 0xFF lands
    // at zero-based offset 31, inside the string literal. Per lexical.md:5 the
    // document must be refused with `theta/load/invalid-encoding` naming that
    // offset — instead the non-fatal decode substitutes U+FFFD and the file
    // loads with ZERO diagnostics, silently binding mojibake.
    const b = concat(utf8('---\nmode: prompt\n---\nlet s = "a'), [0xff], utf8('b"\ns\n'));
    const diags = parseDocBytes(b).diagnostics;

    const diag = findCode(diags, "theta/load/invalid-encoding");
    expect(
      diag,
      `bug 0410(a): expected theta/load/invalid-encoding on the document path; got codes [${codes(diags).join(",")}] (bypassed gate loads clean with U+FFFD mojibake)`,
    ).toBeDefined();
    expect(
      diag?.message,
      "bug 0410(a): invalid-encoding message must report the first-invalid byte offset 31 (pre-normalisation bytes)",
    ).toContain("byte offset 31");
  });

  it("(c) a UTF-16LE file faults at byte offset 0, not a wall of parse errors", () => {
    // A Notepad-style UTF-16 save: BOM 0xFF 0xFE then the body in UTF-16LE.
    // `Buffer.from(str,'utf16le')` is deterministic and offline. 0xFF is not a
    // valid UTF-8 lead byte, so the gate must fault at offset 0 (lexical.md:5
    // "for a non-UTF-8 BOM the reported offset is 0"). Instead the laundered
    // decode reaches the parser, which emits ~49 unsupported-feature /
    // unknown-identifier errors about stray NUL-adjacent characters.
    const bom = Uint8Array.from([0xff, 0xfe]);
    const bodyUtf16 = Uint8Array.from(Buffer.from("---\nmode: prompt\n---\nlet x = 1\n", "utf16le"));
    const b = concat(bom, bodyUtf16);
    const diags = parseDocBytes(b).diagnostics;

    const diag = findCode(diags, "theta/load/invalid-encoding");
    expect(
      diag,
      `bug 0410(c): expected theta/load/invalid-encoding at offset 0 on the document path; got codes [${codes(diags).join(",")}] (UTF-16 draws a parse-error wall instead)`,
    ).toBeDefined();
    expect(
      diag?.message,
      "bug 0410(c): a non-UTF-8 BOM must report byte offset 0",
    ).toContain("byte offset 0");
    // The gate must PRE-EMPT the parser: no downstream parse noise from the
    // laundered mojibake stream.
    expect(
      hasCode(diags, "theta/parse/unsupported-feature"),
      "bug 0410(c): a refused UTF-16 document must not reach the parser (no unsupported-feature errors)",
    ).toBe(false);
    expect(
      hasCode(diags, "theta/parse/unknown-identifier"),
      "bug 0410(c): a refused UTF-16 document must not reach the parser (no unknown-identifier errors)",
    ).toBe(false);
  });

  it("(control) a valid UTF-8 doc with a leading UTF-8 BOM is accepted (gate must not over-fire)", () => {
    // lexical.md:5 / bug 0410 §Fix constraint (iii): a leading UTF-8 BOM is
    // valid and stripped. This control must stay GREEN before AND after the
    // fix — it proves the future gate does not misjudge a valid BOM as
    // non-UTF-8.
    const b = concat([0xef, 0xbb, 0xbf], utf8("---\nmode: prompt\n---\nlet x = 1\n"));
    const diags = parseDocBytes(b).diagnostics;

    expect(
      hasCode(diags, "theta/load/invalid-encoding"),
      `bug 0410 control: a valid leading UTF-8 BOM must NOT emit invalid-encoding; got codes [${codes(diags).join(",")}]`,
    ).toBe(false);
  });
});
