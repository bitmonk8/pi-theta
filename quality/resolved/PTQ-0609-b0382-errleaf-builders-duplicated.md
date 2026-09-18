---
id: PTQ-0609
title: b0382's transport/modelTool/codeTool QueryError leaf builders are redeclared byte-identically from tests/err-note-render.test.ts
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/b0382-slsh3-note-line-discipline.test.ts:66-92
  - tests/err-note-render.test.ts:56-96
  - tests/e2e-s5-slsh-chain-suffix.test.ts:64-88
sites: 3
fix_scope: module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0382's transport/modelTool/codeTool QueryError leaf builders are redeclared byte-identically from tests/err-note-render.test.ts

## Observation
tests/b0382-slsh3-note-line-discipline.test.ts declares three `QueryError`
leaf-builder functions — `transport`, `modelTool`, `codeTool` — under a
section comment reading "Leaf factories (mirror tests/err-note-render.test.ts)".
All three function bodies are byte-identical to the same-named functions in
tests/err-note-render.test.ts, and `transport`/`modelTool` are also
byte-identical in a third file, tests/e2e-s5-slsh-chain-suffix.test.ts.
Neither file imports these from `tests/helpers/`.

## Evidence
tests/b0382-slsh3-note-line-discipline.test.ts:66-92:
```ts
function transport(message: string): TransportError {
  return {
    kind: "transport",
    message,
    http_status: null,
    provider: "anthropic-messages",
    retryable: true,
  };
}

function modelTool(tool_name: string, message: string): ModelToolError {
  return {
    kind: "model_tool",
    message,
    tool_name,
    tool_call_id: "toolu_1",
    raw_response: null,
  };
}

function codeTool(
  tool_name: string,
  cause: CodeToolError["cause"],
  message: string,
): CodeToolError {
  return { kind: "code_tool", message, tool_name, cause };
}
```

tests/err-note-render.test.ts:56-96 (the same three functions, byte-identical
at the shared function bodies; this file additionally carries
`contextOverflow`/`cancelled`/`toolLoopExhausted`, which b0382 does not need):
```ts
function transport(message: string): TransportError {
  return {
    kind: "transport",
    message,
    http_status: null,
    provider: "anthropic-messages",
    retryable: true,
  };
}

function modelTool(tool_name: string, message: string): ModelToolError {
  return {
    kind: "model_tool",
    message,
    tool_name,
    tool_call_id: "toolu_1",
    raw_response: null,
  };
}
...
function codeTool(
  tool_name: string,
  cause: CodeToolError["cause"],
  message: string,
): CodeToolError {
  return { kind: "code_tool", message, tool_name, cause };
}
```

tests/e2e-s5-slsh-chain-suffix.test.ts:64-88 (`modelTool`/`transport`,
byte-identical again):
```ts
function modelTool(tool_name: string, message: string): ModelToolError {
  return {
    kind: "model_tool",
    message,
    tool_name,
    tool_call_id: "toolu_1",
    raw_response: null,
  };
}
...
function transport(message: string): TransportError {
  return {
    kind: "transport",
    message,
    http_status: null,
    provider: "anthropic-messages",
    retryable: true,
  };
}
```

Exact search: `grep -rl "^function transport(message: string): TransportError"
tests/*.test.ts` returns exactly these three files. `diff` runs performed
during this review (`diff <(sed -n '56,74p' err-note-render.test.ts)
<(sed -n '66,84p' b0382-...test.ts)`) confirm zero output for the
`transport`/`modelTool` bodies and the `codeTool` body.

## Why this is a problem
This is the "Boilerplate duplication" class: three small but structurally
identical `QueryError`-leaf factory functions are redeclared as a unit across
three files rather than imported once, and b0382's own section comment names
the file ("mirror tests/err-note-render.test.ts") it copied them from. The
independent byte match in a third file (e2e-s5-slsh-chain-suffix.test.ts,
which credits neither file directly) shows the same code has now been
retyped a third time. `tests/helpers/` holds no module exporting these
`QueryError`-leaf builders any of the three files could import instead.

## Suggested direction (non-binding, optional)
A shared `tests/helpers/` module exporting the `transport`/`modelTool`/
`codeTool` (and related) `QueryError`-leaf builders would sit beside the
suite's existing `fake-*.ts` convention and is the home the credited "mirror"
comment already points at.

## False-positive check
- Gate-pin check: none of the three cited files match `*gate*.test.ts` or the
  named gate kin; none of the cited code is a pinned count or inventory
  assertion.
- Recording-double check: `transport`/`modelTool`/`codeTool` are plain value
  builders, not recording doubles; no "never called" witness is built on
  them, so the carve-out is not applicable and nothing here challenges one.
- docs/bugs/ signature search: docs/bugs/0382-slsh3-err-note-renders-raw-breaks-forged-second-note.md
  exists and is the open bug b0382 is the RED/GREEN witness for; this finding
  does not contest b0382's redness or behaviour, only the duplicated leaf-
  builder code every cell in the file depends on regardless of resolution.
  tests/err-note-render.test.ts and tests/e2e-s5-slsh-chain-suffix.test.ts are
  unrelated to bug 0382 and pass at HEAD.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0382-slsh3-note-line-discipline\|err-note-render.test.ts\|e2e-s5-slsh-chain-suffix"
  docs/reference/coverage-matrix.md` returns no hits. This finding proposes no
  merge, rename, or deletion of any cited file.
- Coverage-drift check: the claim is about repeated builder-function
  DEFINITIONS that exist today, not a missing test path.

## Triage
verdict: confirmed — independently re-verified: `transport`/`modelTool` bodies are byte-identical across all three cited files and `codeTool` across b0382 and err-note-render (own `diff` of the cited ranges is empty; exact-signature grep over tests/ returns exactly those files, codeTool in two), b0382's own section comment credits the source file, `tests/helpers/` exports no QueryError leaf builders (sole TransportError hit in scripted-live-session-harness.ts is a doc-comment), no cited file is a gate test or coverage-matrix-cited, the bug-0382 witness listing is untouched by a helper extraction, and no existing PTQ/intake tracks this root cause — in-scope D7 boilerplate duplication with a mechanical dedupe (triage: claude-fable-5-1)
