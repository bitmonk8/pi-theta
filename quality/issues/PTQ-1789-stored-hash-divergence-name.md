---
id: PTQ-1789
title: The stored-hash test names an on-disk divergence that its body never creates.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/subagent-model-theta-tool.test.ts:608-621
  - tests/subagent-model-theta-tool.test.ts:623-630
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# The stored-hash test names an on-disk divergence that its body never creates.

## Observation
The test is named "marshals the STORED load-time closure hash even when the on-disk source diverged after load". Its body creates an in-memory theta, reads its existing hash, spawns through the fake launcher, and compares the recorded environment hash to that same expected string. Although a comment says to simulate an edit by overwriting on-disk bytes, no operation in the body performs that edit or supplies divergent bytes.

## Evidence
`tests/subagent-model-theta-tool.test.ts:608-621`:
```ts
  it("marshals the STORED load-time closure hash even when the on-disk source diverged after load", async () => {
    const { deps, launcher } = makeParentDeps({ calls: [] });
    // The frozen callable-set entry carries the hash captured at LOAD
    // (`parentTheta` stores `sha256:./child.theta`). Simulate an edit AFTER load
    // but BEFORE spawn by overwriting the on-disk bytes the callee would now
    // hash to — the launch MUST still marshal the stored load-time value, so the
    // child's own recompute-and-compare detects the divergence and refuses.
    const theta = parentTheta(queryBody());
    const loadTimeEntry = theta.callableSet!.entries.get("child")!;
    // Sanity: the stored hash is the load-captured value.
    expect((loadTimeEntry as { closureHash?: string }).closureHash).toBe(
      "sha256:./child.theta",
    );
    await deps.spawnSubagentConversation(parentBindInput(theta));
```

`tests/subagent-model-theta-tool.test.ts:623-630` (the remainder, apart from a blank line):
```ts
    // The marshalled hash is the STORED load value, NOT a value recomputed from
    // current disk bytes at spawn (the producer holds no spawn-time hash
    // resolver, so recomputation is structurally impossible — which is what
    // preserves the load-to-spawn divergence detection).
    expect(marshalledHashes(launcher.spawns[0]!.env)["child"]).toBe(
      "sha256:./child.theta",
    );
  });
```

Exact search `rg -n 'writeFile|writeFileSync|fileSystem|FakeFile|on-disk|diverged' tests/subagent-model-theta-tool.test.ts` returned two matching lines: 608 (the name) and 612 (the comment). The complete test body above contains no divergent-source setup.

## Why this is a problem
This is the D7 misleading-test-name class. A reader following "even when the on-disk source diverged after load" would infer that this cell stages two source states and discriminates the launch's response to that change. The body instead verifies ordinary forwarding of the stored hash from one in-memory snapshot into a recorded launch. That forwarding assertion can fail and is not challenged; it simply does not establish the scenario named by the test.

## False-positive check
- Gate-pin: this file is not a census/inventory gate; the expected hash string is a forwarding observable, not a disputed count pin.
- Recording-double: the launch recorder is legitimate, and its assertion is meaningful. The finding challenges only the name's claimed divergent-source scenario, not a negative witness.
- docs/bugs/ signature search: `rg -n 'teardownSawOpenChannel|marshals the STORED load-time closure hash|first compose dials|makeSchedulerRig|SchedulerRig|WatchdogRig' docs/bugs docs/reference/coverage-matrix.md` returned no matches. No documented correct-reason red pins this title.
- Coverage-matrix/bug-doc citation search: the file-name/title search across those documents found no coverage-matrix entry. Bug 0218 cites historical host-tool-allowlist tests by name; bug 0409 cites the missing-argument test; bug 0328 references the (B) harness. None cites this stored-hash test by name. This report proposes no merge, rename, or deletion of those cited tests or their harness.
- Prior-filing check: searching quality/intake, quality/issues, and quality/resolved for the full `marshals the STORED load-time` name before filing returned no matches. Existing reports mentioning this file concern other helpers, doubles, or production surfaces, not this name/body mismatch.
- History check: `git log -1 --format='%h %s' -- tests/subagent-model-theta-tool.test.ts` reports `de146127 Upgrade Pi build SDK to 1.3.0 and surface blocked bug workflows`; the current body and its edit-simulation comment were re-read together rather than inferring a runtime failure from historical prose.
- Coverage boundary: this finding does not claim that divergence lacks tests elsewhere or that an additional test should exist. It judges only the existing name against its complete current body and alleges no production defect.

## Triage
verdict: confirmed — The cited test and its helpers only forward an in-memory closureHash into recorded spawn env; no source edit or divergent bytes establish the title's after-load on-disk divergence, and no duplicate, resolved prescription, or D7 carve-out applies. (triage: claude-opus-5-5)
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
