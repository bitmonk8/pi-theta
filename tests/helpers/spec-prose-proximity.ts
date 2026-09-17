// Spec-prose proximity oracle, shared.
//
// `matchIndices`/`nearAll` find every regex match in a spec-page (or other
// corpus) string and test whether a set of tokens all occur within a character
// window of an anchor match — a proximity window stands in for "in the same
// clause" without demanding a sentence-splitting heuristic or a verbatim
// sentence. Several spec-conformance-oracle test files score prose this way
// (b0091, b0266, b0269, …); this module is their one shared copy so a fourth
// oracle imports rather than retypes.

/** Every index at which `needle` matches `text`. */
export function matchIndices(text: string, needle: RegExp): number[] {
  const re = new RegExp(
    needle.source,
    needle.flags.includes("g") ? needle.flags : `${needle.flags}g`,
  );
  const out: number[] = [];
  for (const m of text.matchAll(re)) out.push(m.index ?? 0);
  return out;
}

/**
 * True when some occurrence of `anchor` in `text` has every one of `tokens`
 * within `window` characters on either side. A proximity window stands in for
 * "in the same clause" without demanding a sentence-splitting heuristic or a
 * verbatim sentence.
 */
export function nearAll(
  text: string,
  anchor: RegExp,
  tokens: readonly RegExp[],
  window = 400,
): boolean {
  return matchIndices(text, anchor).some((at) => {
    const slice = text.slice(Math.max(0, at - window), at + window);
    return tokens.every((t) => t.test(slice));
  });
}

/** Slice prose from a required anchor up to the next matching boundary. */
export function sliceFrom(
  page: string,
  text: string,
  startAnchor: string,
  endPattern: RegExp,
): string {
  const start = text.indexOf(startAnchor);
  if (start < 0) {
    throw new Error(
      `harness: ${page} no longer contains the anchor ${JSON.stringify(startAnchor)}, so this cell cannot locate the sentence it governs — re-anchor the cell rather than letting it pass over an empty slice`,
    );
  }
  const rest = text.slice(start);
  const end = rest.slice(startAnchor.length).search(endPattern);
  return end < 0 ? rest : rest.slice(0, startAnchor.length + end);
}
