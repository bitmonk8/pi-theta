import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// b0419 — the reversed-belt-design gate over bug 0366's witness header.
//
// Bug 0419 (docs/bugs/0419-b0366-header-asserts-reversed-belt-design.md)
// records that tests/b0366-join-element-laundered-belt.test.ts's header block
// asserts, as present-tense fact with a quote and a line-cite, the PRE-0394
// runtime-belt design: "the belt does not consult `params` — arity is its only
// concern", "so no element-kind belt exists". Bug 0394 (0.397.0) REVERSED that
// design — the three member dispatchers now run `assertStdlibArgumentKinds`
// immediately after the arity check, reading the same `params` descriptors the
// parse gate uses — and rewrote the `StdlibMemberSignature` doc comment at the
// exact cited lines to say so. The header was left byte-exact through that fix
// and through 0402/0405, each recording the debt as a residual; this gate is
// the filed follow-on. The house pattern for a superseded design quote is the
// b0394 header's own "pre-fix: … — superseded post-fix: …" framing, which this
// gate uses one file over as its green control.
//
// THE SETTLED FIX this gate scores, from bug 0419 §Fix (Option 1, Recommended;
// comment-only, no verdict/assertion/fixture in b0366 moves): the belt block is
// re-framed historically — the pre-0394 quote is kept but marked pre-0394, the
// present-tense "no element-kind belt exists" becomes past ("existed"), and the
// block adds that post-0394 the same belt reads `params` for kind too, cited in
// symbol form (`assertStdlibArgumentKinds`) per docs/STYLE.md §Citations.
//
// Two directions, as the sibling b0405 / b0404 oracles score:
//
//   SPEC-TRUTH cell is green at the fork AND after the fix. It locks the reversal
//   the header must reflect, by content over the two runtime files — so if a
//   later edit un-reverses the belt (moving the fact out from under the gate),
//   it reds here before the header re-frame is scored against a moved target.
//
//   RE-FRAME cells are RED at the fork and GREEN after the fix. Each asserts the
//   SPECIFIED end state (the block carries a pre-0394 historical marker and names
//   the post-0394 `assertStdlibArgumentKinds` belt; it no longer asserts the
//   reversed design in present tense), not the fork's bytes.
//
//   GREEN-CONTROL cell is green at the fork AND after the fix. It proves the gate
//   reads real content: the correctly-framed b0394 sibling header keeps its
//   "superseded post-fix" framing byte-for-byte through this fix.

const repoFile = (rel: string): string =>
  fileURLToPath(new URL(`../${rel}`, import.meta.url));

/**
 * Read a corpus file. A missing or empty file is a HARNESS failure that names
 * the unmet precondition and throws — never a skip, never an early return, so
 * an absent source cannot let a cell pass vacuously (the b0405 `readCorpus`
 * pattern this file mirrors).
 */
function readCorpus(rel: string): string {
  let text: string;
  try {
    text = readFileSync(repoFile(rel), "utf8");
  } catch (cause) {
    throw new Error(
      `harness precondition unmet: ${rel} is unreadable, and it is a source this oracle scores for the bug 0419 header re-frame — a missing corpus file is a loud failure, never a skip (${String(cause)})`,
    );
  }
  if (text.trim() === "") {
    throw new Error(`harness precondition unmet: ${rel} is empty; nothing to score`);
  }
  return text;
}

/** Line splitting tolerates a CRLF terminator. */
const linesOf = (text: string): readonly string[] => text.split(/\r?\n/);

/** A comment run flattened to one line: `//` markers dropped, whitespace collapsed. */
const flattenComments = (lines: readonly string[]): string =>
  lines
    .map((l) => l.replace(/^\s*\/\/\s?/, ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

const B0366 = "tests/b0366-join-element-laundered-belt.test.ts";
const B0394 = "tests/b0394-stdlib-wrong-kind-args-belt.test.ts";
const STDLIB_ARRAY = "src/runtime/stdlib-array.ts";
const STDLIB_STRING = "src/runtime/stdlib-string.ts";

// The symbol-form the settled §Fix (Option 1) requires the re-frame to adopt —
// the belt entry point bug 0394 inserted after the arity check.
const KIND_BELT_SYMBOL = "assertStdlibArgumentKinds";

// A historical framing marker: the pre-0394 / post-0394 / superseded shape the
// b0394 header models and Option 1 mirrors. Bounds the pre-0394 quote so it
// cannot stand as a bare present-tense claim.
const HISTORICAL_MARKER = /pre-0394|post-0394|superseded|no longer|used to|at the time/i;

/** The 1-based indices of the only comment line matching `matches`, over `lines`. */
function soleCommentLine(
  rel: string,
  what: string,
  lines: readonly string[],
  matches: (line: string) => boolean,
): number {
  const hits: number[] = [];
  lines.forEach((line, index) => {
    if (line.startsWith("//") && matches(line)) hits.push(index);
  });
  if (hits.length !== 1) {
    throw new Error(
      `harness precondition unmet: ${rel} carries ${hits.length} comment lines matching the ${what} anchor, expected exactly one${hits.length > 1 ? ` (lines ${hits.map((h) => h + 1).join(", ")})` : ""} — bug 0419 names this block, so a cell that cannot bound it must fail loudly rather than score vacuously`,
    );
  }
  return hits[0] as number;
}

/**
 * The b0366 belt-description block, flattened. Bounded by content anchors that
 * survive the fix ("bug-0315 arity belt" head, "element-kind belt" tail), so
 * the gate locates the same block before and after the re-frame — never by a
 * hard-coded line index.
 */
function b0366BeltBlock(): string {
  const lines = linesOf(readCorpus(B0366));
  const start = soleCommentLine(
    B0366,
    "belt-block head (`bug-0315 arity belt`)",
    lines,
    (l) => l.includes("bug-0315 arity belt"),
  );
  const end = soleCommentLine(
    B0366,
    "belt-block tail (`element-kind belt`)",
    lines,
    (l) => l.includes("element-kind belt"),
  );
  if (end < start) {
    throw new Error(
      `harness precondition unmet: ${B0366} belt-block tail (line ${end + 1}) precedes its head (line ${start + 1}) — the block cannot be bounded`,
    );
  }
  return flattenComments(lines.slice(start, end + 1));
}

/** The b0394 header comment run (its leading contiguous `//` block), flattened. */
function b0394Header(): string {
  const lines = linesOf(readCorpus(B0394));
  const run: string[] = [];
  for (const line of lines) {
    if (!line.startsWith("//")) break;
    run.push(line);
  }
  if (run.length === 0) {
    throw new Error(
      `harness precondition unmet: ${B0394} has no leading comment header to score as the green control`,
    );
  }
  return flattenComments(run);
}

describe("bug 0419 — b0366's witness header re-frames the reversed pre-0394 belt design historically", () => {
  // =========================================================================
  // SPEC-TRUTH cell. Green at the fork AND after the fix — it locks the 0394
  // reversal the header must reflect, so an un-reversal reds here first.
  // =========================================================================

  it("cell A (SPEC-TRUTH) — the shipped belt reads `params` for kind: stdlib-array runs `assertStdlibArgumentKinds` after the arity check, stdlib-string's doc records both concerns", () => {
    const arraySrc = readCorpus(STDLIB_ARRAY);
    const stringSrc = readCorpus(STDLIB_STRING);
    expect(
      arraySrc.includes(`${KIND_BELT_SYMBOL}(member, signature, args)`),
      `cell A: ${STDLIB_ARRAY} must call \`${KIND_BELT_SYMBOL}\` in the member dispatcher — this is the post-0394 kind belt the b0366 header must reflect. If it is gone the reversal was undone and the header re-frame is scored against a moved fact.`,
    ).toBe(true);
    expect(
      /arity and kind are its two concerns/.test(stringSrc),
      `cell A: ${STDLIB_STRING}'s \`StdlibMemberSignature\` doc must state "arity and kind are its two concerns" — the sentence at the header's own cited lines that reversed "arity is its only concern".`,
    ).toBe(true);
  });

  // =========================================================================
  // RE-FRAME cells. RED at the fork; bug 0419 §Fix (Option 1) makes each green.
  // =========================================================================

  it("cell B (RE-FRAME-RED) — the belt block adopts the corrected end state: a pre-0394 historical marker AND the post-0394 `assertStdlibArgumentKinds` belt", () => {
    const block = b0366BeltBlock();
    // Positive, content-anchored end state (not a bytes snapshot): the settled
    // Option-1 re-frame keeps the pre-0394 quote under a historical marker and
    // adds that the same belt now reads `params` for kind, cited in symbol form.
    // Both tokens are absent at the fork, where the block asserts the reversed
    // design as current fact.
    expect(
      HISTORICAL_MARKER.test(block),
      `cell B: the b0366 belt block must carry a historical framing marker (${HISTORICAL_MARKER}) so its pre-0394 quote reads as superseded design, mirroring the b0394 header. At the fork the block has none — it states "arity is its only concern" / "no element-kind belt exists" as present fact.\nBlock: ${block}`,
    ).toBe(true);
    expect(
      block.includes(KIND_BELT_SYMBOL),
      `cell B: the b0366 belt block must name the post-0394 kind belt \`${KIND_BELT_SYMBOL}\` (symbol form per STYLE.md §Citations) — the belt that reads \`params\` for kind immediately upstream of the join arm this file exercises. At the fork the block names no kind belt and asserts none exists.\nBlock: ${block}`,
    ).toBe(true);
  });

  it("cell C (RE-FRAME-RED) — the belt block no longer asserts the reversed design in present tense", () => {
    const block = b0366BeltBlock();
    // The present-tense negative claim the fix removes/pasts ("existed"): at the
    // fork this exact string is present, so the assertion reds; the Option-1
    // re-frame drops it.
    expect(
      block.includes("no element-kind belt exists"),
      `cell C: the b0366 belt block must not assert "no element-kind belt exists" in present tense — a kind belt (\`${KIND_BELT_SYMBOL}\`) DOES exist post-0394 and runs immediately upstream of the join arm this file locks. The Option-1 re-frame pasts or drops this clause.\nBlock: ${block}`,
    ).toBe(false);
    // The pre-0394 quote may survive, but only as a historically-marked quote —
    // never as a bare present-tense claim. quote-present implies marker-present.
    const quotesPreDesign = block.includes("arity is its only concern");
    const historicallyFramed = HISTORICAL_MARKER.test(block);
    expect(
      !quotesPreDesign || historicallyFramed,
      `cell C: if the b0366 belt block keeps the pre-0394 quote "arity is its only concern" it must sit under a historical framing marker (${HISTORICAL_MARKER}), not stand as current fact. At the fork the quote stands unframed.\nBlock: ${block}`,
    ).toBe(true);
  });

  // =========================================================================
  // GREEN-CONTROL cell. Green at the fork AND after the fix — proves the gate
  // reads real content and that the mirror model stays correctly framed.
  // =========================================================================

  it("cell D (GREEN-CONTROL) — the b0394 sibling header keeps its `pre-fix … superseded post-fix` framing of the same quote", () => {
    const header = b0394Header();
    expect(
      /pre-fix:/.test(header) && /superseded post-fix:/.test(header),
      `cell D: ${B0394}'s header must keep its "pre-fix: … — superseded post-fix: …" framing — the house pattern bug 0419 §Fix mirrors, and the proof this gate reads real content.\nHeader head: ${header.slice(0, 320)}`,
    ).toBe(true);
    expect(
      header.includes("reads `params` for kind too"),
      `cell D: ${B0394}'s header must keep recording that the belt "reads \`params\` for kind too" — the corrected claim the b0366 header must converge onto.`,
    ).toBe(true);
  });
});
