---
id: PTQ-1353
title: The console.error prefix-filter harness (quiesce-line vs cascade-line split) is re-implemented in three test files
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/watcher-terminated-recovery.test.ts:186-201
  - tests/hot-reload-stale-quiesce-arms.test.ts:76-90
  - tests/hot-reload-stale-ctx-replacement.test.ts:337-357
sites: 3
fix_scope: module
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# The console.error prefix-filter harness (quiesce-line vs cascade-line split) is re-implemented in three test files

## Observation
All three files spy on `console.error`, collect the raw `unknown[][]` call args, then locally define a helper that maps to `args[0]`, narrows to `string`, and splits the result into "designed quiesce line" (starts with `STALE_QUIESCE_STDERR_PREFIX`) vs "delivery-failed cascade line" (starts with the `"system-note delivery failed:"` / `CASCADE_PREFIX` literal). The three implementations differ only in naming (`stderrLines`/`{quiesce,cascades}` vs `quiesceLines`/`cascadeLines` vs `quiesceLines`/`cascades`) and in whether the cascade prefix is hard-literalised or bound to an imported/local constant.

## Evidence
tests/watcher-terminated-recovery.test.ts:186-201
```ts
  function stderrLines(spyCalls: unknown[][]): {
    quiesce: string[];
    cascades: string[];
  } {
    const firsts = spyCalls
      .map((args) => args[0])
      .filter((first): first is string => typeof first === "string");
    return {
      quiesce: firsts.filter((line) =>
        line.startsWith(STALE_QUIESCE_STDERR_PREFIX),
      ),
      cascades: firsts.filter((line) =>
        line.startsWith("system-note delivery failed:"),
      ),
    };
  }
```

tests/hot-reload-stale-quiesce-arms.test.ts:76-90
```ts
    const quiesceLines = (): string[] =>
      calls
        .map((args) => args[0])
        .filter(
          (first): first is string =>
            typeof first === "string" &&
            first.startsWith(STALE_QUIESCE_STDERR_PREFIX),
        );
    const cascadeLines = (): string[] =>
      calls
        .map((args) => args[0])
        .filter(
          (first): first is string =>
            typeof first === "string" &&
            first.startsWith("system-note delivery failed:"),
        );
```

tests/hot-reload-stale-ctx-replacement.test.ts:337-357
```ts
  function cascades(containing?: string): string[] {
    return stderrCalls
      .map((args) => args[0])
      .filter(
        (first): first is string =>
          typeof first === "string" && first.startsWith(CASCADE_PREFIX),
      )
      .filter(
        (line) => containing === undefined || line.includes(containing),
      );
  }

  /** The designed PIC-67 stale-quiesce stderr lines (fail-loud-once witness). */
  function quiesceLines(): string[] {
    return stderrCalls
      .map((args) => args[0])
      .filter(
        (first): first is string =>
          typeof first === "string" && first.startsWith(QUIESCE_PREFIX),
      );
  }
```

Search run: `grep -rn "startsWith(STALE_QUIESCE_STDERR_PREFIX\|startsWith(CASCADE_PREFIX\|startsWith(QUIESCE_PREFIX\|startsWith(\"system-note delivery failed" tests/*.test.ts` — 3 files hit (the three above); no fourth site. `grep -rl "STALE_QUIESCE_STDERR_PREFIX\|quiesceLines\|stderrLines" tests/helpers/` — no output, confirming no canonical helper exists under `tests/helpers/`.

## Why this is a problem
The same three-step shape — spy on `console.error`, project `args[0]` to a typed string, and partition by two hard-known stderr prefixes belonging to the PIC-67 fail-loud-once contract — is written independently three times across files that all exercise the same `stale-ctx.ts` quiesce latch. Each copy diverges slightly in how it names the split and whether the cascade literal is a local constant, an import, or a re-typed string, which is exactly the drift shape boilerplate duplication produces: a future rename of the cascade prefix constant would need to be caught in three independent literal/identifier sites rather than one.

## Suggested direction (non-binding, optional)
A shared `tests/helpers/` harness for "console.error line capture, filtered by a caller-supplied prefix" would let the three PIC-67/bug-0018 witnesses converge on one implementation; naming it is a fix-stage decision, not this filing's.

## False-positive check
Gate-pin check: none of the three files match `*gate*.test.ts` or its named kin, so the census/pin-gate carve-out does not apply. Recording-double check: this is a stderr-capture harness, not a recording double witnessing a MUST-NOT-be-called assertion — the carve-out for negative-witness doubles does not apply (these lines are used to assert exact-one-line-count, not never-called). docs/bugs/ signature search: `grep -n "watcher-terminated-recovery" docs/bugs/0018-hot-reload-stale-ctx-after-session-replacement.md` shows the file cited as a witness at line 174; this filing does not propose merging, renaming, or deleting `tests/watcher-terminated-recovery.test.ts` (or either sibling file) — only that the local helper duplication is observed — so the pinned-by-citation rule is respected. coverage-matrix search: no coverage-matrix hit was needed since no test is proposed for removal. This claim is about existing helper code shape, not a coverage gap.

## Triage
verdict: confirmed — independently re-verified: all three excerpts match byte-for-byte at the cited lines (watcher-terminated-recovery 186-201, stale-quiesce-arms 76-90, stale-ctx-replacement 337-357), each is the same spy→args[0]→string-narrow→startsWith-prefix partition over `STALE_QUIESCE_STDERR_PREFIX` (src/extension/stale-ctx.ts:44) / `"system-note delivery failed:"`, no `tests/helpers/` canonical exists (grep for STALE_QUIESCE_STDERR_PREFIX|quiesceLines|stderrLines|system-note delivery failed → 0), all sites under tests/, D7 boilerplate-duplication class, no gate/recording-double/red-test carve-out and no test deletion/rename proposed (bug-0018/0021/0022/0030 citations untouched), not a dup of PTQ-1059 (HOST_STALE_MESSAGE constant) or PTQ-0546/1026 (live-cell spy setup blocks); two corrections: the candidate's own stated search returns 4 files not 3 — tests/system-note-channel.test.ts:394-402 holds a cascade-only partial copy (`terminalLines`) to fold in at fix time — and hot-reload-stale-ctx-replacement.test.ts:83-89 documents a deliberate reason for the literal `QUIESCE_PREFIX` (RED-at-HEAD re-proof must not fail at collection), so the shared helper must take the prefix as a caller argument rather than import the constant (triage: claude-fable-5-1)
