---
id: PTQ-0994
title: proto-named-binder-write-sites.test.ts reads binder-inference.ts via raw readFileSync/fileURLToPath though the same file already imports and uses readCorpus for a sibling source read
lens: D7
status: open
verdict: confirmed
locations:
  - tests/proto-named-binder-write-sites.test.ts:1-2
  - tests/proto-named-binder-write-sites.test.ts:16
  - tests/proto-named-binder-write-sites.test.ts:317-321
  - tests/proto-named-binder-write-sites.test.ts:449-453
  - tests/helpers/corpus-reader.ts:29-40
sites: 1
fix_scope: localized
wave: qw20260918155535
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# proto-named-binder-write-sites.test.ts reads binder-inference.ts via raw readFileSync/fileURLToPath though the same file already imports and uses readCorpus for a sibling source read

## Observation
`tests/proto-named-binder-write-sites.test.ts` reads two different production
source files as text so its anchor-based statement checks can locate private
statements no offline seam otherwise reaches. One read
(`PRODUCTION_PRODUCER_SOURCE`, line 450) goes through the canonical
`readCorpus(rel, owner)` helper from `tests/helpers/corpus-reader.ts`, which
this file already imports (line 16). The other read
(`BINDER_INFERENCE_SOURCE`, lines 318-321) uses a raw
`readFileSync(fileURLToPath(new URL(...)))` call instead, importing
`readFileSync`/`fileURLToPath` at the top of the file (lines 1-2) solely for
this one site.

## Evidence

`tests/proto-named-binder-write-sites.test.ts:1-2, 16`:
```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
...
import { readCorpus } from "./helpers/corpus-reader";
```

`tests/proto-named-binder-write-sites.test.ts:317-321` (the raw, not-migrated read):
```ts
/** `src/binder/binder-inference.ts`, read as text (cell (2-SRC) only). */
const BINDER_INFERENCE_SOURCE = readFileSync(
  fileURLToPath(new URL("../src/binder/binder-inference.ts", import.meta.url)),
  "utf8",
);
```

`tests/proto-named-binder-write-sites.test.ts:449-453` (the migrated sibling
read, same file, further down):
```ts
/** `src/extension/production-theta-producer.ts`, read as text (group (3) only). */
const PRODUCTION_PRODUCER_SOURCE = readCorpus(
  "src/extension/production-theta-producer.ts",
  "group (3)'s source for the production echo read",
);
```

`tests/helpers/corpus-reader.ts:29-40` (the canonical helper, fail-loud on a
missing/empty file, already imported by this file):
```ts
export function readCorpus(rel: string, owner: string): string {
  let text: string;
  try {
    text = readFileSync(repoFile(rel), "utf8");
  } catch (cause) {
    throw new Error(
      `harness precondition unmet: ${rel} is unreadable, and it is ${owner} — a missing corpus file is a loud failure, never a skip (${String(cause)})`,
    );
  }
  if (text.trim() === "") {
    throw new Error(`harness precondition unmet: ${rel} is empty; nothing to score`);
  }
  return text;
}
```

Search: `grep -n "readFileSync\|readCorpus\|fileURLToPath" tests/proto-named-binder-write-sites.test.ts` returns exactly the two import lines (1-2), the `readCorpus` import (16), the raw call site (318), and the `readCorpus` call site (450) — one raw read and one migrated read, in the same file.

## Why this is a problem
The canonical `readCorpus` helper (built, per its own file header, specifically
to replace hand-rolled `readFileSync`/`fileURLToPath` source-text reads that
were "redefined, byte-for-byte apart from the bug number named inside the
thrown message, in several ... test files") is not merely available — it is
already imported and already used for the second of this file's two
source-text reads. The first read (`BINDER_INFERENCE_SOURCE`) restates the
exact `readFileSync(fileURLToPath(new URL(...)))` idiom `readCorpus` exists to
replace, in the same file, a few hundred lines above the migrated call, and
that read's own failure mode is silent by comparison: a `readFileSync` on an
absent/renamed `binder-inference.ts` throws Node's raw `ENOENT`, naming
neither the owning cell nor the precondition, where `readCorpus` names both.

## Suggested direction (non-binding, optional)
Replace the raw `readFileSync(fileURLToPath(new URL("../src/binder/binder-inference.ts", import.meta.url)), "utf8")` call with `readCorpus("src/binder/binder-inference.ts", "cell (2-SRC)'s source for the inliner's copy walk")`, matching the pattern already used a few hundred lines below in the same file.

## False-positive check
- Gate-pin carve-out: the file does not match `*gate*.test.ts` or a named gate
  kin; the cited lines are a source-text-reading constant declaration, not a
  pinned count or inventory assertion.
- Recording-double carve-out: `BINDER_INFERENCE_SOURCE` is a static read of
  production source text consumed by later regex/anchor searches, not a
  recording double or a "never called" MUST-NOT witness; not applicable.
- docs/bugs/ signature search: `grep -n "BINDER_INFERENCE_SOURCE\|readCorpus"
  docs/bugs/0214-defaulting-and-inference-drop-the-proto-named-key.md` → 0
  hits; the bug doc discusses the `__proto__`-drop defect at write site (2),
  not this text-reading idiom, and gives no rationale for reading one source
  file raw while reading the other through `readCorpus`.
- coverage-matrix/bug-doc citation search: `grep -n
  "proto-named-binder-write-sites" docs/reference/coverage-matrix.md` → 0
  hits. This finding proposes no merge, rename, or deletion of any
  `it()`/`describe()` block or of the cell (2-SRC) RED-pin assertion — only
  that the source-text-reading constant call the helper already imported in
  the same file.
- Prior-filing search: `grep -rl "BINDER_INFERENCE_SOURCE"
  quality/issues quality/intake quality/resolved` returns only the resolved
  PTQ-0936, which tracks the (now-fixed) cross-file duplication of the
  `PRODUCTION_PRODUCER_SOURCE` raw-`readFileSync` idiom between this file and
  `proto-named-record-write-sites.test.ts` — that duplication's fix is what
  left this file's `PRODUCTION_PRODUCER_SOURCE` read migrated to `readCorpus`
  while `BINDER_INFERENCE_SOURCE` (which PTQ-0936's own triage note flags,
  as an aside, as using the same imports "not for this sole purpose") was
  left on the old idiom; no filing tracks this remaining, single, in-file
  not-migrated site as its own root cause.
- Coverage check: the claim is about which reading idiom a text constant
  uses, not a missing test path; cell (2-SRC) exercises the raw-read constant
  successfully at HEAD.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all excerpts reproduce verbatim (imports :1-2/:16, raw `readFileSync(fileURLToPath(new URL("../src/binder/binder-inference.ts", …)))` at :318-321, `readCorpus(...)` at :450-453, helper at tests/helpers/corpus-reader.ts:29-40); the in-file grep returns exactly the five cited lines plus the constant's sole live consumer at :331 (`inlineDefsRefsCopyWrite` regex exec), so `readFileSync`/`fileURLToPath` are imported for this one site only; docs/bugs/0214 → 0, coverage-matrix → 0 and the prior-filing grep → only resolved PTQ-0936 all reproduce; PTQ-0936's fix commit 0da4cad7 migrated only `PRODUCTION_PRODUCER_SOURCE` (its filed scope) and left this read on the old idiom with no rationale comment, and PTQ-0936's triage note mentions `BINDER_INFERENCE_SOURCE` only as an import-count aside, so this is not a duplicate; `sites: 1` is accurate for the stated root cause (the two other raw `../src/` readers, inline-object-nested-lowering:1642 and match-arm-scope-inference-pass:1231, do not import corpus-reader); not a gate kin, no recording-double/red-test carve-out applies, file green (9/9); the fix is a mechanical one-call swap plus dropping two imports (triage: claude-fable-5-1)
