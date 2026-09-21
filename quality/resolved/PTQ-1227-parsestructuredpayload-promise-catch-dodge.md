---
id: PTQ-1227
title: parseStructuredPayload wraps a synchronous JSON.parse in a Promise chain to route its throw through a rejection handler instead of the house allow-broad-catch try/catch, making a pure synchronous parse async
lens: D8
status: fixed
verdict: confirmed
locations:
  - src/runtime/typed-query-validation.ts:45-70
  - src/discovery/package-discovery.ts:552
  - src/runtime/subagent-result-frames.ts:98-103
  - tools/eslint-plugin-theta-local/index.js:52-57
  - src/extension/live-prompt-query-driver.ts:513
  - src/runtime/typed-query-validation.ts:309
sites: 2
fix_scope: module
d8_class: against-grain
d8_host: src/runtime/typed-query-validation.ts#parseStructuredPayload
wave: qw20260921183818
reported_by: lens-d8-simplification (anthropic/claude-fable-5)
date: 2026-09-21
---

# parseStructuredPayload wraps a synchronous JSON.parse in a Promise chain to route its throw through a rejection handler instead of the house allow-broad-catch try/catch, making a pure synchronous parse async

## Observation
`parseStructuredPayload` (src/runtime/typed-query-validation.ts:58-70) does purely
synchronous work — trim a string, slice out a `{...}` candidate, `JSON.parse` it —
yet returns `Promise<StructuredPayloadParse>`. The only reason for the Promise is
stated in its own doc comment: the parse "runs through a promise rejection handler
rather than a broad `catch`, honouring the specific-exception-types rule." A
Promise rejection handler is a broad catch by construction (it receives every
rejection reason, of any type), so the mechanism does not narrow the caught types;
it only moves the catch off the syntax the `no-broad-catch` lint rule inspects.
Both production callers sit in already-async code and must `await` the microtask
hop (typed-query-validation.ts:309; live-prompt-query-driver.ts:513). The same
dodge appears once more at src/discovery/package-discovery.ts:552 (outside this
shard).

## Evidence
The fighting use — src/runtime/typed-query-validation.ts:49-52 and 58-70 (doc
rationale plus body):

```
 * ... — never a thrown `JSON.parse` (which would escape the query as an uncaught
 * error) and never a silently-bound `null`. The parse runs through a promise
 * rejection handler rather than a broad `catch`, honouring the specific-
 * exception-types rule.
```
```
export function parseStructuredPayload(text: string): Promise<StructuredPayloadParse> {
  const trimmed = text.trim();
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  const candidate =
    first >= 0 && last > first ? trimmed.slice(first, last + 1) : trimmed;
  return Promise.resolve()
    .then(() => JSON.parse(candidate) as unknown)
    .then(
      (value): StructuredPayloadParse => ({ parsed: true, value }),
      (): StructuredPayloadParse => ({ parsed: false, raw: text }),
    );
}
```

The documented intent of the rule being dodged — tools/eslint-plugin-theta-local/index.js:52-57
(the rule's own description and message, verbatim):

```
        "Forbid broad catch clauses (catch (e), catch (e: unknown|any|Error), bare catch) unless the same line carries a // allow-broad-catch: comment.",
...
      broadCatch:
        "Broad catch is forbidden: bind a specific exception subtype or let it propagate. Exempt a mandated Pi-SDK-boundary / spec-mandated site with a same-line `// allow-broad-catch: <token> — <spec-page>` comment.",
```

The house facility for the identical case (JSON.parse of untrusted text, failure
tolerated) — used in this same shard, src/runtime/subagent-result-frames.ts:98-103:

```
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch (parseError: unknown) { // allow-broad-catch: RFC-0012 result channel — a non-JSON frame is a tolerated stray line, pi-integration-contract/subagent.md
    void parseError;
    return { kind: "ignored" };
  }
```

Search evidence: `grep -n "JSON.parse(" src/` shows 16 production parse sites; 14
use direct `try/catch` (each carrying an `allow-broad-catch:` citation where the
binding is broad, e.g. subagent-envelope.ts:316, subagent-launch-file.ts:204,
child-tap.ts:104); exactly 2 use the `Promise.resolve().then(() => JSON.parse(...))`
form — this function and src/discovery/package-discovery.ts:552.

Second fighting occurrence (same pattern, out of this shard's file list, cited for
the count) — src/discovery/package-discovery.ts:552:

```
    .then(() => JSON.parse(manifestText) as unknown)
```

Call sites paying the asyncness: src/runtime/typed-query-validation.ts:309
(`const parse = await parseStructuredPayload(reply);`) and
src/extension/live-prompt-query-driver.ts:513
(`const parse = await parseStructuredPayload(text);`) — both already inside async
drivers; neither needs the parse itself to be async.

## Why this is a problem
The rule's documented remedy for a site that must tolerate an arbitrary throw is
the same-line `// allow-broad-catch: <token> — <spec-page>` exemption — an
auditable marker the closing gate resolves against coverage-matrix.md. The Promise
route achieves exactly a broad catch (the rejection handler discards every reason
unexamined, typed-query-validation.ts:68) while escaping that audit surface, so
the stated rationale ("honouring the specific-exception-types rule") is
demonstrably not what the mechanism does — it honours the rule's regex, not its
intent. The cost side of the ratio: a synchronous three-line classification gains
a Promise allocation and a microtask hop per parse, an async signature that
propagates `await` into two production call sites, and a shape that diverges from
the 14 sibling JSON.parse sites, one of them in this very shard doing the
identical tolerated-parse job with the sanctioned idiom.

## Suggested direction (non-binding, optional)
Unproven hypothesis: a synchronous `parseStructuredPayload` using `try/catch`
with an `allow-broad-catch:` citation (the subagent-result-frames.ts:101 shape;
a plausible citation is the QRY-22/QRY-11 respond-parse tolerance the doc comment
already names) returns `StructuredPayloadParse` directly; both callers drop one
`await`. Behaviour (non-JSON → `{parsed:false, raw}`, never a throw, never a
bound `null`) is unchanged. The package-discovery.ts:552 twin would be a separate
follow-up outside this shard.

## False-positive check
- Spec check: no docs/spec_topics/ clause requires the parse to be asynchronous;
  the pinned behaviour (raw-text fallback so AJV reports the mismatch, no throw,
  no fabricated null — query-failure-and-repair.md) is preserved identically by a
  synchronous try/catch. No `challenges_spec` needed.
- Stated-rationale check (D2 precedent: a stated rationale is a design decision
  unless demonstrably false): the stated rationale is that the promise route
  honours the specific-exception-types rule; verified false in substance — the
  rejection handler at :68 binds no type and discards every reason, i.e. it IS
  the broad catch the rule forbids, minus the audit marker; the rule's own
  message names the exemption comment as the sanctioned escape.
- Liveness: two production callers (typed-query-validation.ts:309,
  live-prompt-query-driver.ts:513) — not dead, not test-only; no demotion to
  test-only reachability is proposed.
- Exemption check: no D8 exemption exists for typed-query-validation.ts or this
  function; the host's band-exempt status covers D9 breakdown only.
- Duplicate check: scanned the issue list — PTQ-0432/PTQ-0644 (test-substrate
  mirrors), PTQ-1117 (respond-repair switch clone), PTQ-1137 (provider gates
  parallel) touch this module's neighbourhood but none names this function or
  this pattern.

## Triage
verdict: questionable — accounting verified with corrections: every excerpt reproduces byte-exact (typed-query-validation.ts:45-70/:309, live-prompt-query-driver.ts:513, package-discovery.ts:551-556, subagent-result-frames.ts:98-103, eslint rule :52-57), both callers are live production `await`s, the quoted lint intent is real, no D8 exemption covers the host and no spec clause requires the parse to be async; but the sibling census is off — `src/discovery/settings.ts:250-258` is a THIRD `Promise.resolve().then(() => JSON.parse)` route the filing's grep missed, and production-composition.ts:4562 / subagent-child-hash-verify.ts:84 carry no catch at all (they propagate), so it is ~9 sanctioned `try/catch // allow-broad-catch:` sites vs 3 promise-route sites, not 14 vs 2; the root cause stands (a rejection handler discarding every reason is a broad catch in substance, outside the closing-gate token audit) but the doc comment is a stated, recurring design choice whose letter-vs-intent reading, and the sync-signature change, need a human ruling (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-21): confirmed - SCOPE WIDENED per triage census correction: the fix covers ALL THREE Promise.resolve().then(() => JSON.parse) dodge routes (typed-query-validation.ts, package-discovery.ts:551-556, and the undisclosed sibling src/discovery/settings.ts:250-258), replacing each with the house synchronous try/catch pattern sanctioned by the eslint rule's allowance.
