import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// b0436 — the shape-enumeration/summary sentences track the channel partition.
//
// Bug 0436 (docs/bugs/0436-shape-enumeration-sentences-stale.md) records a
// doc-internal inconsistency across two spec pages: the runtime event channel
// grew its `details` payload vocabulary (structural + recovery variants, the
// 0398 group-B operator-facing class, the 0401 no-`details` class, the 0404
// third content case) but two summary sentences were never widened, so each
// teaches a closed set the same corpus already falsifies.
//
// THE SETTLED FIX this file scores, from bug 0436 §Fix (two editorial edits, no
// runtime behaviour moves, both tolerated by the b0265/b0404 predicates):
//   (a) runtime-event-channel.md — the `details: { diagnostics }` bullet's HEAD
//       enumeration widens from "a parse / load / type / runtime-panic
//       diagnostic batch" to name the operator-facing-routed case its own tail
//       already carries (the BNDR-9 custom-type-unsafe rejection).
//   (b) diagnostic-shape.md — the "two `details` payload shapes" / "stays
//       closed to `{ diagnostics }` plus the … `{ event: RuntimeEvent }`"
//       summary sentences widen to name EVERY outer `details` shape the channel
//       partition carries, not just two.
//
// The channel partition is the single owner of the shape vocabulary, so the set
// of shapes cell (b) demands is DERIVED by reading the channel page's own
// four-shape bullets (never hard-coded as an unverified literal): whatever keys
// that partition carries are exactly the keys the sibling summary must name.
//
// Every prose match runs over a flattened physical line and every site is
// located BY CONTENT, never by a hard-coded line index — an editorial reflow or
// an unrelated insertion above must not move these cells. Derived line numbers
// appear in failure messages only, recomputed from the tree on every run.
//
// Two directions:
//   RED-now cells go GREEN after the fix — they assert the specified behaviour
//   (the head names the operator-facing-routed case; the sibling summary names
//   all four shapes), not the fork's behaviour.
//   The SPEC-TRUTH control cell is green at the fork AND after the fix — it
//   proves the gate reads real content by pinning the channel partition it
//   derives cell (b)'s demand from (four `details` shapes: diagnostics, event,
//   structural, recovery), which the editorial edits do not touch.
//
// Spec anchors (every line re-derived against this tree at fork b2cb3b15):
//   - runtime-event-channel.md line 20 — "the `details` field carries one of
//     four normative payload shapes".
//   - runtime-event-channel.md lines 22–25 — the four `- `details: { <key> }``
//     partition bullets (diagnostics / event / structural / recovery).
//   - runtime-event-channel.md line 22 — the `details: { diagnostics }` bullet
//     whose head enumeration cell (a) widens.
//   - diagnostic-shape.md line 20 — the "two `details` payload shapes are
//     disjoint by key" summary sentence.
//   - diagnostic-shape.md line 42 — the outer-`CustomMessage.details` "stays
//     closed to `{ diagnostics }` plus … `{ event: RuntimeEvent }`" sentence.

const repoFile = (rel: string): string =>
  fileURLToPath(new URL(`../${rel}`, import.meta.url));

/**
 * Read a corpus file. A missing or empty file is a HARNESS failure that names
 * the unmet precondition and throws — never a skip, never an early return, so
 * an absent page cannot let a cell pass vacuously (the b0265/b0404 `readCorpus`
 * pattern this file mirrors).
 */
function readCorpus(rel: string): string {
  let text: string;
  try {
    text = readFileSync(repoFile(rel), "utf8");
  } catch (cause) {
    throw new Error(
      `harness precondition unmet: ${rel} is unreadable, and it is a source for the bug 0436 surface this gate owns — a missing corpus file is a loud failure, never a skip (${String(cause)})`,
    );
  }
  if (text.trim() === "") {
    throw new Error(`harness precondition unmet: ${rel} is empty; nothing to score`);
  }
  return text;
}

/** Line splitting tolerates the page's CRLF terminators (both pages ship CRLF). */
const linesOf = (text: string): readonly string[] => text.split(/\r?\n/);

/** Line wrapping is editorial, so every prose match runs over a flattened run. */
const flatten = (text: string): string => text.replace(/\s+/g, " ").trim();

const RUNTIME_EVENT_CHANNEL =
  "docs/spec_topics/pi-integration-contract/runtime-event-channel.md";
const DIAGNOSTIC_SHAPE = "docs/spec_topics/diagnostics/diagnostic-shape.md";

interface Site {
  /** What the site is, for the failure message. */
  readonly what: string;
  /** 1-based line number, re-derived on every run. */
  readonly line: number;
  /** The site's own text, flattened. */
  readonly text: string;
}

/**
 * Locate one site by content in `rel`. Exactly one match is required: zero means
 * the page moved out from under the cell (a loud harness failure, since a
 * silently-absent site would score vacuously), and more than one means the
 * predicate no longer identifies a single line.
 */
function locateSite(rel: string, what: string, matches: (line: string) => boolean): Site {
  const lines = linesOf(readCorpus(rel));
  const hits: Site[] = [];
  lines.forEach((line, index) => {
    if (matches(line)) hits.push({ what, line: index + 1, text: flatten(line) });
  });
  if (hits.length !== 1) {
    throw new Error(
      `harness precondition unmet: ${rel} carries ${hits.length} lines matching the ${what} site, expected exactly one — bug 0436 names this site, so a cell that cannot find it must fail loudly rather than pass vacuously${hits.length > 1 ? ` (found at lines ${hits.map((h) => h.line).join(", ")})` : ""}`,
    );
  }
  return hits[0] as Site;
}

/**
 * The channel partition's payload-shape keys, DERIVED by reading the four
 * `- `details: { <key> … }`` partition bullets on the channel page (the single
 * owner of the shape vocabulary). Order-preserving and de-duplicated. This is
 * the set of shapes cell (b) demands the sibling summary name — never a
 * hard-coded literal, so it tracks the partition automatically.
 */
function channelPartitionKeys(): readonly string[] {
  const keyOfBullet = /^-\s+`details:\s*\{\s*([A-Za-z]+)/;
  const keys: string[] = [];
  for (const line of linesOf(readCorpus(RUNTIME_EVENT_CHANNEL))) {
    const m = keyOfBullet.exec(line);
    if (m && !keys.includes(m[1] as string)) keys.push(m[1] as string);
  }
  if (keys.length === 0) {
    throw new Error(
      `harness precondition unmet: ${RUNTIME_EVENT_CHANNEL} carries no \`- \`details: { <key> }\`\` partition bullets — the shape vocabulary cell (b) derives its demand from cannot be located, so the sibling-summary cell would score vacuously`,
    );
  }
  return keys;
}

/** The `details: { diagnostics }` partition bullet (single physical line). */
function diagnosticsBullet(): Site {
  // Located by the b0265/b0404-shared predicate so the three oracles agree on
  // which line this is; cell (a) only reads it and adds a requirement, never one
  // that would force dropping the `startsWith` prefix or "runtime-panic case".
  return locateSite(
    RUNTIME_EVENT_CHANNEL,
    "`details: { diagnostics: Diagnostic[] }` partition bullet",
    (l) =>
      l.startsWith("- `details: { diagnostics: Diagnostic[] }`") &&
      l.includes("runtime-panic case"),
  );
}

/**
 * The head enumeration of the diagnostics bullet: the `… — a <enum> diagnostic
 * batch` span. Extracting the head span (rather than scanning the whole line)
 * keeps cell (a) off the bullet's TAIL, which already names the operator-facing
 * case in prose — the bug is that the HEAD's closed enumeration omits it.
 */
function diagnosticsBulletHeadEnum(): string {
  const bullet = diagnosticsBullet();
  const m = /\u2014\s*a\s+(.+?)\s+diagnostic batch/.exec(bullet.text);
  if (!m) {
    throw new Error(
      `harness precondition unmet: the diagnostics bullet at ${RUNTIME_EVENT_CHANNEL} line ${bullet.line} carries no "— a <enum> diagnostic batch" head span, so cell (a) cannot read the head enumeration it scores. Bullet head: ${bullet.text.slice(0, 200)}`,
    );
  }
  return m[1] as string;
}

/**
 * The diagnostic-shape.md shape-summary region: the two sentences bug 0436 (b)
 * widens, located by stable subjects that survive the editorial edit (the
 * enumeration inside them is what changes, not these clauses). Returned as the
 * two flattened physical lines joined, so a match against it finds a key
 * whether the enumeration is the fork's two-shape form or the fixed four-shape
 * form.
 */
function shapeSummaryRegion(): { readonly text: string; readonly lines: readonly Site[] } {
  const summaryA = locateSite(
    DIAGNOSTIC_SHAPE,
    'the "two `details` payload shapes" summary sentence',
    (l) => l.includes("channel also carries operator-facing runtime failure events"),
  );
  const summaryB = locateSite(
    DIAGNOSTIC_SHAPE,
    'the outer-`CustomMessage.details` "stays closed to …" summary sentence',
    (l) => l.includes("not on the outer `CustomMessage.details`"),
  );
  return { text: `${summaryA.text}\n${summaryB.text}`, lines: [summaryA, summaryB] };
}

describe("bug 0436 — shape-enumeration/summary sentences track the channel partition", () => {
  // =========================================================================
  // SPEC-TRUTH control. Green at the fork AND after the fix — it proves the
  // gate reads real content and pins the partition cell (b)'s demand derives
  // from. The editorial edits do not touch the partition, so it never moves.
  // =========================================================================

  it("control (SPEC-TRUTH) — the channel page lists exactly five `details` payload shapes", () => {
    const keys = channelPartitionKeys();
    // The channel intro sentence pins the count word "five" (re-derived: line 20;
    // widened by bug 0432's fifth `shutdown` shape, composed at the 0436 merge).
    const fourShapeIntro = locateSite(
      RUNTIME_EVENT_CHANNEL,
      "the `details` field carries one of five normative payload shapes sentence",
      (l) => l.includes("carries one of five normative payload shapes"),
    );
    expect(
      keys,
      `control: the channel partition's payload keys, read from the \`- \`details: { <key> }\`\` bullets at ${RUNTIME_EVENT_CHANNEL} (intro at line ${fourShapeIntro.line}), must be exactly [diagnostics, event, structural, recovery, shutdown] — this is the vocabulary cell (b) derives its demand from. Read: [${keys.join(", ")}]`,
    ).toEqual(["diagnostics", "event", "structural", "recovery", "shutdown"]);
  });

  // =========================================================================
  // RED-at-fork cells. Bug 0436 §Fix makes these green.
  // =========================================================================

  it("cell (a) (RED-now) — the `details: { diagnostics }` bullet HEAD enumeration names the operator-facing-routed case", () => {
    const bullet = diagnosticsBullet();
    const headEnum = diagnosticsBulletHeadEnum();
    // bug 0436 §Fix (a): the head widens from "parse / load / type /
    // runtime-panic" to also name the operator-facing-routed diagnostic batch
    // its own tail already carries (the BNDR-9 custom-type-unsafe rejection). At
    // the fork the head omits it, so a reader classifying by the head wrongly
    // concludes that note mis-ships (bug 0436 §Summary, instance (a)).
    expect(
      /operator-facing/i.test(headEnum),
      `cell (a): the head enumeration of the diagnostics bullet at ${RUNTIME_EVENT_CHANNEL} line ${bullet.line} must name the operator-facing-routed case (bug 0436 §Fix widens it to "… / runtime-panic / operator-facing-routed diagnostic batch"). At the fork the head names only "parse / load / type / runtime-panic" while the bullet's own tail already carries the operator-facing routed-diagnostic case. Head enumeration read: "${headEnum}"`,
    ).toBe(true);
  });

  it("cell (b) (RED-now) — diagnostic-shape.md's shape-summary sentences name every `details` shape the channel partition carries", () => {
    const channelKeys = channelPartitionKeys();
    const region = shapeSummaryRegion();
    // bug 0436 §Fix (b): the summary widens to enumerate every outer `details`
    // shape (or defer wholesale to the channel page); the settled fix enumerates
    // them. Derived, not literal: whatever keys the channel partition carries
    // are exactly the keys this sibling summary must name.
    const missing = channelKeys.filter((key) => !region.text.includes(key));
    expect(
      missing,
      `cell (b): diagnostic-shape.md's shape-summary region (lines ${region.lines
        .map((l) => l.line)
        .join(", ")}) must name every \`details\` shape the channel partition carries [${channelKeys.join(
        ", ",
      )}]. Missing at the fork: [${missing.join(
        ", ",
      )}] — the "two \`details\` payload shapes" / "stays closed to \`{ diagnostics }\` plus … \`{ event }\`" sentences predate the structural + recovery variants and close the set at two, invalidating two shipped production note shapes on the same outer field (bug 0436 §Summary, instance (b)).\nRegion:\n${region.lines
        .map((l) => `  line ${l.line}: ${l.text.slice(0, 160)}`)
        .join("\n")}`,
    ).toEqual([]);
  });
});
