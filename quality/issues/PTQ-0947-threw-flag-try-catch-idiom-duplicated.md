---
id: PTQ-0947
title: the let-threw-false/try-catch/expect(threw).toBe(false) idiom is repeated five times, four within par-for.test.ts and once in subagent-fn.test.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/par-for.test.ts:2604-2613
  - tests/par-for.test.ts:2647-2656
  - tests/par-for.test.ts:2719-2728
  - tests/par-for.test.ts:3035-3044
  - tests/subagent-fn.test.ts:1060-1069
sites: 5
fix_scope: cross-module       # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918092852
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# the let-threw-false/try-catch/expect(threw).toBe(false) idiom is repeated five times, four within par-for.test.ts and once in subagent-fn.test.ts

## Observation
`tests/par-for.test.ts` declares the identical six-line sequence — `let threw = false;` / `let exec: Awaited<ReturnType<typeof executeBody>> | undefined;` / a `try { exec = await executeBody(...) } catch { threw = true; }` block / `expect(threw, "...").toBe(false)` — four times in its own body (ERR-20 panic downgrade, ERR-20 defect downgrade, ERR-20 no-invoke panic, NOCEIL-5 width throttle). `tests/subagent-fn.test.ts` declares the same sequence a fifth time, over the same `executeBody` entry point. No `tests/helpers/` module exports a "drive `executeBody`, capture whether it threw, and assert it did not" helper.

## Evidence
`tests/par-for.test.ts:2604-2613`:
```ts
    let threw = false;
    let exec: Awaited<ReturnType<typeof executeBody>> | undefined;
    try {
      exec = await executeBody(body, execDeps(body, host));
    } catch {
      threw = true;
    }
    expect(
      threw,
      "ERR-20: a per-iteration panic must NOT abort the theta (the iteration boundary is a panic-downgrade point)",
```

`tests/par-for.test.ts:2647-2656`:
```ts
    let threw = false;
    let exec: Awaited<ReturnType<typeof executeBody>> | undefined;
    try {
      exec = await executeBody(body, execDeps(body, host));
    } catch {
      threw = true;
    }
    expect(
      threw,
      "ERR-20: an unexpected iteration throw must NOT abort the theta (it is downgraded)",
```

`tests/par-for.test.ts:2719-2728` (the same idiom with an inline object-spread wrapping `execDeps`, otherwise identical):
```ts
    let threw = false;
    let exec: Awaited<ReturnType<typeof executeBody>> | undefined;
    try {
      exec = await executeBody(body, {
        ...execDeps(body, host),
        file: "enclosing.theta",
      });
    } catch {
      threw = true;
    }
```

`tests/par-for.test.ts:3035-3044`:
```ts
    let threw = false;
    let exec: Awaited<ReturnType<typeof executeBody>> | undefined;
    try {
      exec = await executeBody(body, execDeps(body, host));
    } catch {
      threw = true;
    }
    expect(
      threw,
      "NOCEIL-5: exceeding the width throttle must not throw a ceiling breach",
```

`tests/subagent-fn.test.ts:1060-1069`:
```ts
    let threw = false;
    let exec: Awaited<ReturnType<typeof executeBody>> | undefined;
    try {
      exec = await executeBody(body, execDeps(body, host));
    } catch {
      threw = true;
    }
    expect(
      threw,
      "FN-6: a panic inside a subagent fn body must NOT crash the caller — the subagent boundary downgrades it",
```

Exact search run: `grep -rn "let threw = false" tests/*.ts` → 3 files (`tests/par-for.test.ts`, `tests/session-shutdown-wiring.test.ts`, `tests/subagent-fn.test.ts`); `tests/session-shutdown-wiring.test.ts:130` is a differently-shaped spy-armed flag (not this try/catch-around-`executeBody` idiom) and is excluded; the remaining two files carry the cited five occurrences of the identical `try { exec = await executeBody(...) } catch { threw = true; }` / `expect(threw,...).toBe(false)` shape.

## Why this is a problem
The same "drive `executeBody`, capture whether the call threw, and assert it did not" sequence is retyped five times across two files with no shared helper. Each of the four `tests/par-for.test.ts` copies differs only in the fixture/message strings; the `tests/subagent-fn.test.ts` copy differs only in swapping `SubagentFnHost` in for `ParForHost`. A `tests/helpers/` module exporting a single `driveWithoutThrowing(body, deps)` (or equivalent) function returning `{ threw, exec }` would let each of the five call sites assert its own one line rather than retype the six-line try/catch scaffold.

## Suggested direction (non-binding, optional)
Naming the natural home as observation only: a small `tests/helpers/` function that wraps `await executeBody(...)` in the identical try/catch and returns `{ threw, exec }` would let each call site keep its own fixture and message while dropping the six-line scaffold; the fix stage owns whether and how to do this.

## False-positive check
Gate-pin check: `tests/par-for.test.ts` and `tests/subagent-fn.test.ts` do not match `*gate*.test.ts` or any of the named gate-kin filenames — the pinned-count carve-out does not apply. Recording-double check: `threw`/`exec` are local booleans/promises captured per-call, not a recording double whose calls are read as a MUST-NOT witness — the negative-witness carve-out does not apply (the `expect(threw).toBe(false)` is a genuine, failable assertion on a real observable, not the subject of this finding — the finding is about the repeated scaffolding around it, not its vacuousness). docs/bugs/ signature search: `grep -rl "let threw = false" docs/bugs/*.md` → 0 hits; no documented correct-reason red matches this shape. coverage-matrix/bug-doc citation search: `grep -n "par-for.test.ts\|subagent-fn.test.ts" docs/reference/coverage-matrix.md` → 0 hits; this finding proposes no merge/rename/delete of any test, so no citation-pin applies. Duplicate check against the already-filed store: searched for "threw" and "executeBody.*catch" shaped titles across the already-filed list and the ParForHost/registry/messagesFor findings already tracked for this file (PTQ-0483, PTQ-0823, PTQ-0857, fixed PTQ-0708) — none of them cite this try/catch idiom or these line ranges.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all five excerpts reproduce at exactly the cited lines (par-for.test.ts:2604-2613, :2647-2656, :2719-2731, :3035-3044; subagent-fn.test.ts:1060-1069); mktemp `diff` of the extracted spans shows each copy differs from the first only in the `expect` message string (site 3 additionally spreads `execDeps` with `file: "enclosing.theta"`), so the `let threw`/`let exec`/`try { exec = await executeBody(...) } catch { threw = true }`/`expect(threw, …).toBe(false)` scaffold is byte-identical across all five; the stated `grep -rn "let threw = false"` reproduces (6 hits; session-shutdown-wiring:130 is a spy-armed one-shot flag with no try/catch, correctly excluded); no tests/helpers export takes `(body, deps)` and captures the throw — runtime-belt-probe-harness.ts:226-230 `probeSource` has the same catch shape but only over `(src)` + production binding, so it cannot serve these custom-host sites; docs/bugs → 0 and coverage-matrix → 0 reproduce; both files under tests/, D7 boilerplate-duplication class, no gate/recording-double/red-test carve-out applies; store search for `threw` hits only PTQ-0848 (ctor-tests drive harness, different files/root cause) and none of the par-for/subagent-fn filings (PTQ-0483/0629/0692/0704-0709/0823/0857) cite this idiom — mechanical dedupe into one `{ threw, exec }`-returning helper (triage: claude-fable-5-1)
