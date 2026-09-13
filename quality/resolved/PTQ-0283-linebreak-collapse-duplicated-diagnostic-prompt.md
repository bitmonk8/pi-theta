---
id: PTQ-0283
title: normalisePromptTextLineBreaks (binder-system-prompt.ts) and normaliseLiteralValueLineBreaks (diagnostic.ts) are byte-identical function bodies
lens: D4                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/binder/binder-system-prompt.ts:99-137
  - src/diagnostics/diagnostic.ts:164-202
sites: 2                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone               # D4 only: clone | drift | parallel
wave: qw20260912204251
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-12
---

# normalisePromptTextLineBreaks (binder-system-prompt.ts) and normaliseLiteralValueLineBreaks (diagnostic.ts) are byte-identical function bodies

## Observation

`binder-system-prompt.ts`'s module-private `normalisePromptTextLineBreaks` and
`diagnostics/diagnostic.ts`'s exported `normaliseLiteralValueLineBreaks` both
collapse every whitespace run that contains at least one CR/LF (together with
its adjoining horizontal whitespace) to one U+0020, leave a break-free input
byte-unchanged, and then trim leading/trailing U+0020 from the result. The two
function bodies are byte-for-byte identical; only the function name and the
`export` keyword differ. Neither calls the other, and neither file imports
from the other's module for this purpose (binder-system-prompt.ts does not
import `normaliseLiteralValueLineBreaks`, despite three sibling files in the
same `src/binder/` directory — `provider-error-mapping.ts`,
`compact-transcript.ts`, `binder-model.ts` — already importing `Diagnostic`
from the very same `../diagnostics/diagnostic` module).

## Evidence

src/binder/binder-system-prompt.ts:99-137:

```ts
function normalisePromptTextLineBreaks(text: string): string {
  if (!/[\r\n]/.test(text)) {
    return text;
  }
  const n = text.length;
  let out = "";
  let i = 0;
  while (i < n) {
    const c = text[i] ?? "";
    if (c === " " || c === "\t" || c === "\r" || c === "\n") {
      let j = i;
      let sawBreak = false;
      while (j < n) {
        const wc = text[j] ?? "";
        if (wc !== " " && wc !== "\t" && wc !== "\r" && wc !== "\n") {
          break;
        }
        if (wc === "\r" || wc === "\n") {
          sawBreak = true;
        }
        j += 1;
      }
      out += sawBreak ? " " : text.slice(i, j);
      i = j;
      continue;
    }
    out += c;
    i += 1;
  }
  let start = 0;
  let end = out.length;
  while (start < end && out[start] === " ") {
    start += 1;
  }
  while (end > start && out[end - 1] === " ") {
    end -= 1;
  }
  return out.slice(start, end);
}
```

src/diagnostics/diagnostic.ts:164-202:

```ts
export function normaliseLiteralValueLineBreaks(text: string): string {
  if (!/[\r\n]/.test(text)) {
    return text;
  }
  const n = text.length;
  let out = "";
  let i = 0;
  while (i < n) {
    const c = text[i] ?? "";
    if (c === " " || c === "\t" || c === "\r" || c === "\n") {
      let j = i;
      let sawBreak = false;
      while (j < n) {
        const wc = text[j] ?? "";
        if (wc !== " " && wc !== "\t" && wc !== "\r" && wc !== "\n") {
          break;
        }
        if (wc === "\r" || wc === "\n") {
          sawBreak = true;
        }
        j += 1;
      }
      out += sawBreak ? " " : text.slice(i, j);
      i = j;
      continue;
    }
    out += c;
    i += 1;
  }
  let start = 0;
  let end = out.length;
  while (start < end && out[start] === " ") {
    start += 1;
  }
  while (end > start && out[end - 1] === " ") {
    end -= 1;
  }
  return out.slice(start, end);
}
```

Diff verdict: **identical** (`diff` on the two extracted bodies, signature
line excluded, returns zero differences). Not in the clone map: the map
reports "no clone groups" for both files — this pair sits below or across
whatever window/file-pairing the scanner used, exactly the class of
duplication the brief asks to hunt for by reading.

Both copies are live production code, not a dead twin: `normalisePromptTextLineBreaks`
is called at `binder-system-prompt.ts:402` and `:411` (the Description /
Argument-hint lines); `normaliseLiteralValueLineBreaks` is exported and called
at ~20 sites across `src/parser/frontmatter.ts`, `src/parser/params.ts`,
`src/parser/type-grammar.ts`, `src/parser/schema-declarations.ts`,
`src/parser/callable-set.ts`, and `src/runtime/err-note-render.ts`.

## Why this is a problem

This is the identical algorithm reimplemented rather than shared, and the
codebase's own later module explicitly intended the opposite. `diagnostic.ts`'s
doc comment for `normaliseLiteralValueLineBreaks` states its rationale for
existing as one function: "message ... must not forge the serialised content
format's hint / related-site / blank-line-block shapes ... so the transform
lives once here rather than once per call site" — and bug 0105's fix (which
introduced this function, commit `99bcfa9f`, v0.217.0) states its own intent
in the same terms: "the line-break transform lives in one shared renderer
every parse-time literal-value `<value>` interpolation on the load path
calls." Neither of those "one shared renderer" claims accounts for
`normalisePromptTextLineBreaks`, which bug 0103 had already placed in
`binder-system-prompt.ts` roughly 2.5 days earlier (commit `03c05b85`,
v0.131.0) implementing the exact same algorithm for a different channel
(the model-facing system prompt vs. the diagnostics channel).

`diagnostic.ts`'s doc comment does attempt one disclaimer — "This is unlike
bug 0103's binder-prompt collapse, which is deliberately NOT shared with this
one: that collapse answers the system prompt's own per-field line-shape
sentence, a different contract" — but that description does not fit the
function bug 0103 actually shipped. "Per-field line-shape" and a
"different contract" (a string-literal quote-escape arm) describe
`normaliseParamLineBreaks` (binder-system-prompt.ts:308-370, bug 0060's item-4
per-field-line collapse, itself the subject of the clone map's G010/G050
groups against `normalisePromptTextLineBreaks` in the *same* file) — not
`normalisePromptTextLineBreaks` (items 2/3, no quote arm, one Description line
and one Argument-hint line, never "per-field"). Bug 0103's own document never
mentions `diagnostic.ts` or `normaliseLiteralValueLineBreaks` anywhere, and bug
0105's document never mentions `binder-system-prompt.ts` or
`normalisePromptTextLineBreaks` anywhere — the two fixes were adjudicated in
isolation from each other, and the one comment that later tries to explain the
non-sharing names the wrong sibling.

Because there is no shared implementation, a fix to the algorithm in one copy
has no mechanical path to the other. Both copies currently agree (verified by
`diff`), but nothing enforces that: the ASCII whitespace set `{" ", "\t",
"\r", "\n"}` is spelled out twice, the trim loop is spelled out twice, and a
future correction to either (for example, widening or narrowing the
whitespace class) is exactly as likely to land in only one file as bug 0105's
own author was to miss the existing twin when writing this one.

## Suggested direction (non-binding, optional)

`diagnostics/diagnostic.ts` is the natural shared home (hypothesis): it is
already exported, already the target of ~20 call sites, and already imported
(type-only) by three sibling files inside `src/binder/` itself
(`provider-error-mapping.ts`, `compact-transcript.ts`, `binder-model.ts`), so a
value import of `normaliseLiteralValueLineBreaks` from
`binder-system-prompt.ts` would follow an existing dependency direction rather
than open a new one.

## False-positive check

- Body diff: `sed`-extracted bodies (binder-system-prompt.ts:100-137 vs.
  diagnostic.ts:165-202, signature lines excluded) piped through `diff` —
  zero output, i.e. byte-identical.
- Both-live check: `normalisePromptTextLineBreaks` has 2 production call sites
  in its own file (:402, :411); `normaliseLiteralValueLineBreaks` is exported
  and has ~20 call sites across `src/parser/*.ts` and
  `src/runtime/err-note-render.ts` (grep-counted) — neither is a dead copy.
- Clone-map re-check: the shard's map lists "(no clone groups)" for both
  `src/binder/binder-system-prompt.ts` and `src/diagnostics/diagnostic.ts`;
  this pairing is not one of the map's reported groups (G010/G050 are a
  different, intra-file pairing against `normaliseParamLineBreaks` — see that
  group's own disposition in this wave's notes).
- Git-history intent check: `git log -S` on each function name resolves to
  two different, non-cross-referencing bug fixes — `03c05b85` (bug 0103,
  v0.131.0, introduces `normalisePromptTextLineBreaks`) and `99bcfa9f` (bug
  0105, v0.217.0, introduces `normaliseLiteralValueLineBreaks`), ~2.5 days
  apart. `grep -rn "diagnostic.ts\|normaliseLiteralValueLineBreaks"
  docs/bugs/0103-*.md` and `grep -rn "binder-system-prompt\|normalisePromptTextLineBreaks"
  docs/bugs/0105-*.md` each return zero hits — neither fix's record
  acknowledges the other's near-identical function.
- Quality-log overlap check: searched `quality/` for both function names and
  for `renderBinderFailureRow`/`runBinderWithRetries`/`walkSessionContext`/
  `renderCompactTranscript`; no existing intake, resolved, or issues file
  addresses this specific pair (PTQ-0089 and PTQ-0115 touch the same file
  region for unrelated reasons — a header count and a dead field — not this
  duplication).

## Triage

verdict: confirmed — bodies verified byte-identical (diff/md5sum) at both cited ranges, both copies are live (multiple non-test call sites each), and re-running clone-scan.mjs confirms diagnostic.ts is in none of the tool's 103 whole-repo groups while binder-system-prompt.ts's only groups (G010/G050) are the separate, already-ratified intra-file mirror against normaliseParamLineBreaks — a genuine scanner-missed clone, not incidental, further evidenced by diagnostic.ts's own disclaimer comment misattributing bug 0060's per-field/quote-escape rationale to bug 0103 (verified against both bug docs and the source) (triage: claude-opus-5)
