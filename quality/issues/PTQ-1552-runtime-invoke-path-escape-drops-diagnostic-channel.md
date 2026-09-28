---
id: PTQ-1552
title: "#recheckCalleeContainment keeps only the Err half of recheckInvokePathAtRuntime's escape verdict and drops its theta/load/invoke-path-escape diagnostic, while the load-time containment path emits that diagnostic for the same escape"
lens: D6
status: open
verdict: confirmed
locations:
  - src/extension/invoke-machinery.ts:725-746
  - src/runtime/invocation.ts:236-253
  - src/extension/invoke-expr-call-surface.ts:209-233
sites: 3
fix_scope: module
d6_class: posture-divergence
d6_anchor: "INV-1 (docs/spec_topics/invocation.md:16) — \"a resolved path that escapes every active discovery root MUST surface on both channels: a `theta/load/invoke-path-escape` diagnostic on the diagnostics drain, and `Err(InvokeInfraError { cause: \"load_failure\", callee_path, ... })` to the parent\""
wave: qw20260928060032
reported_by: lens-d6-errorposture (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# #recheckCalleeContainment keeps only the Err half of recheckInvokePathAtRuntime's escape verdict and drops its theta/load/invoke-path-escape diagnostic, while the load-time containment path emits that diagnostic for the same escape

## Observation
`recheckInvokePathAtRuntime` (src/runtime/invocation.ts) returns an escape verdict that carries two things: a `theta/load/invoke-path-escape` `diagnostic` and an `InvokeInfraError { cause: "load_failure" }` `error`. Its comment says the escape "surfaces on both channels". Its only production caller, `#recheckCalleeContainment` in src/extension/invoke-machinery.ts, returns `verdict.error` and nothing else. The method's return type is `Promise<InvokeInfraError | undefined>`, so the diagnostic has no way out. The load-time sibling (`checkInvokePathAtLoad`, called from invoke-expr-call-surface.ts) handles the same escape by pushing `containment.diagnostic` onto the diagnostics list. The result: an escape caught at runtime reaches the parent as `Err`, but nothing reaches the diagnostics drain, even though the load-time path does report the same escape class there.

## Evidence
**Divergent side: runtime re-check caller drops the diagnostic.** src/extension/invoke-machinery.ts:725-746 (excerpt; lines 729-735 are the fs/root/baseDir setup):
```ts
  async #recheckCalleeContainment(
    theta: ConversationBindInput["theta"],
    calleePath: string,
  ): Promise<InvokeInfraError | undefined> {
  ...
    try {
      const verdict = await recheckInvokePathAtRuntime({
        deps: { fs: fileSystem },
        resolvedPath,
        literalPath: calleePath,
        activeRoots,
      });
      return verdict.kind === "escape" ? verdict.error : undefined;
```

**The verdict it receives builds both channels.** src/runtime/invocation.ts:236-253:
```ts
  if (within) {
    return { kind: "within", canonicalPath };
  }
  // An escape surfaces on both channels (invocation.md §Resolution / INV-1): the
  // `theta/load/invoke-path-escape` diagnostic on the drain AND
  // `Err(InvokeInfraError { cause: "load_failure", callee_path, ... })` to the
  // parent.
  return {
    kind: "escape",
    canonicalPath,
    diagnostic: invokePathEscapeDiagnostic(input.literalPath),
    error: {
      kind: "invoke_infra",
      message: invokePathEscapeMessage(input.literalPath),
      callee_path: input.resolvedPath,
      cause: "load_failure",
```

**Sibling side: load-time containment emits the diagnostic.** src/extension/invoke-expr-call-surface.ts:209-233 (excerpt):
```ts
    const containment = await checkInvokePathAtLoad({
      deps: { fs: deps.fs },
      resolvedPath,
      literalPath: invoke.path,
      activeRoots: deps.activeRoots,
    }).then(
      (value) => value,
      () => undefined,
    );
    ...
    if (containment.kind === "escape") {
      diagnostics.push({ ...containment.diagnostic, file: site.file, range: site.range });
      // An escaping callee cannot be opened for the arity check; move on.
      continue;
    }
```

**Why these are siblings.** Both paths run the same `checkInvokePathContainment` predicate (invocation.ts: `checkInvokePathAtLoad` and `recheckInvokePathAtRuntime` both call it) on the same input: a resolved `invoke` callee path checked against the active discovery-root union. Both receive a verdict whose `escape` arm carries a `diagnostic` built by the same `invokePathEscapeDiagnostic`, code `theta/load/invoke-path-escape`. The failure class is identical: the callee path escapes every active root. The load-time consumer routes that verdict's diagnostic to the drain. The runtime consumer drops it.

**Anchor (quoted verbatim from docs/spec_topics/invocation.md:16, INV-1):** "The load-time check (parent theta registration / `tools:` `.theta` entry registration) and the invocation-time re-check (the moment the runtime opens the callee for invocation) MUST apply the identical `realpath`-then-discovery-root-containment semantics … and a resolved path that escapes every active discovery root MUST surface on both channels: a `theta/load/invoke-path-escape` diagnostic on the diagnostics drain, and `Err(InvokeInfraError { cause: "load_failure", callee_path, ... })` to the parent." invocation.md:12 gives the reason for two channels: "The two-channel report is deliberate — operators reading the drain can detect escape attempts; the parent's `Err` cannot distinguish escape from deletion".

**Searches (run this session):**
- `grep -rn "recheckInvokePathAtRuntime(" src extensions | wc -l` → 2: the definition (invocation.ts:228) and the one caller (invoke-machinery.ts:740).
- `grep -rn "INVOKE_PATH_ESCAPE_CODE\|invokePathEscapeDiagnostic" src extensions | wc -l` → 5, all in src/runtime/invocation.ts (:44, :188, :197, :200, :246). Nothing outside the builder re-mints the code at runtime.
- `grep -rn "verdict.diagnostic" src extensions | wc -l` → 0.
- `grep -n "verdict\." src/extension/invoke-machinery.ts` → 2 lines: :746 (reads `.kind`/`.error`) and :898 (an unrelated `verdict.ok`).

## Why this is a problem
INV-1 is a MUST that pins the both-channels posture for this exact failure class, and the in-scope builder (`recheckInvokePathAtRuntime`) follows it. The fail-closed `Err` channel is honoured at runtime. The operator-facing drain channel is honoured at load time and silent at runtime. So a symlink swapped between load and invocation, or a hot-reload that removes the root, produces only a `load_failure` `Err`. The spec says that `Err` cannot tell escape from deletion, which is why it requires the drain report alongside it. The runtime path therefore delivers one of the two channels INV-1 requires, where the sibling consumer of the same verdict routes the diagnostic.

## Suggested direction (non-binding, optional)
Carry the escape verdict's `diagnostic` out of `#recheckCalleeContainment` alongside the `InvokeInfraError`, and route it to the invocation's diagnostics drain the way the load-time consumer routes `containment.diagnostic`. The drain choice belongs to the fix stage.

## False-positive check
- **EXST-9 / PIC-73 class check:** neither applies. The dropped value is not a sink or producer-hook throw at the execution-status bus, and `theta/load/invoke-path-escape` is not a degrade-silent optional capability. It is a registered diagnostic with a MUST-emit clause.
- **allow-broad-catch token check:** the catch at invoke-machinery.ts:747 (`// allow-broad-catch: ENOENT-on-absence only, re-raised below`) handles the realpath-rejection path, not the escape verdict. The divergence is on the non-throwing `escape` return at :746, so no catch token governs it.
- **Stated-rationale check:** no comment at invoke-machinery.ts:725-746 explains dropping the diagnostic. The method's own doc (:718-724) describes only "Returns the `load_failure` `InvokeInfraError` on escape". invocation.ts:239-242 states the both-channels intent. docs/bugs/0111-nested-callee-tools-entries-no-load-time-containment.md records this drop as a defect, not a design decision: at :685-690, "**`#recheckCalleeContainment` discarding `verdict.diagnostic`.** Verified … against `invocation.md:16`'s both-channels MUST … It is a defect of the runtime re-check on *both* call surfaces … and it is unfiled". At :1151-1155 (Residual 2), "`#recheckCalleeContainment` still discards `verdict.diagnostic` … Unchanged and unclaimed here … and remains unfiled."
- **Already-filed check:** `grep -rln "invoke-path-escape" quality/issues quality/intake` → 0 files other than this filing. `grep -rln "verdict\.diagnostic" docs quality` → only docs/bugs/0111 (the unfiled-residual note above). No PTQ or pending candidate in the brief's list covers this topic.
- **Sibling-reality check:** both sides are production paths. `#recheckCalleeContainment` is called from `#guardInvokeBoundary` (invoke-machinery.ts:592) on every runtime `invoke` open. `checkInvokePathAtLoad` has four production call sites (invoke-expr-call-surface.ts:209; production-composition.ts:3496, :3743, :4385), and the cited one pushes the diagnostic. Neither side is test-only or unreachable.

## Triage
verdict: confirmed — re-verified: invoke-machinery.ts:740-746 returns only `verdict.error` from `recheckInvokePathAtRuntime` (return type `InvokeInfraError | undefined`, so the escape arm's `diagnostic` (invocation.ts:243-252) cannot get out, even though an `emitDiagnostic` seam exists on `#input` at :440). The load-time sibling at invoke-expr-call-surface.ts:209-233 pushes `containment.diagnostic` for the same `checkInvokePathContainment` escape class. All four stated searches reproduce (2/5/0/2 lines). The anchor INV-1 (invocation.md:16) is a MUST that requires both channels, including the drain diagnostic at runtime open, and :12 says the two-channel report is deliberate. No rationale comment exists, and bug 0111 (:685-690, :1151-1155) records this as an unfiled defect. No PTQ or intake duplicate (triage: claude-opus-5-5)
