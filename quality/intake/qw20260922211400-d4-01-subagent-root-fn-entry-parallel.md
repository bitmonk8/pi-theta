---
id: pending
title: Child-side subagent theta-root and fn-entry drives are parallel envelope-contract implementations
lens: D4
status: intake
verdict: pending
locations:
  - src/extension/production-theta-producer.ts:3049-3172
  - src/extension/production-theta-producer.ts:3270-3412
sites: 2
fix_scope: module
d4_class: parallel
wave: qw20260922211400
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-22
---

# Child-side subagent theta-root and fn-entry drives are parallel envelope-contract implementations

## Observation
`production-theta-producer.ts` contains two independent child-side subagent drives that both produce the single `theta_result` stdout envelope required by RFC-0006 PIC-58/59/60/62:

- `driveSubagentRootRegime` runs when the spawned child is launched for a `.theta` root (the `THETA_LAUNCH_ENTRY` path). After model confirmation, its theta-body branch intakes marshalled params, binds them, executes `theta.body`, surfaces the terminal value, runs the `tooDeep`/`nonRepresentable` checks, emits the `serializeOkEnvelope` or `serializeErrEnvelope`, emits the outcome event, and runs `teardown`/`finishInvocation`.
- `#driveSubagentFnEntry` runs when the spawned child is launched for a named `subagent fn` (`entry.kind === "fn"`). It resolves the fn declaration, intakes marshalled arguments by declared parameter name, binds them into an isolated scope, executes `fn.body`, surfaces the terminal value, runs the same `tooDeep`/`nonRepresentable` checks, emits the `serializeOkEnvelope` or `serializeErrEnvelope`, emits the outcome event, and runs `teardown`/`finishInvocation`.

The two paths are not token clones and therefore do not appear in the clone map, but they implement the same discriminated child-drive contract for two entry kinds.

## Evidence

Location 1 — theta-root body drive (`driveSubagentRootRegime` theta path), lines 3049-3172:

```typescript
    // PIC-60 (child-side): intake the marshalled params from the child env,
    // validate them against the callee's `params:` schema, and bind them DIRECTLY
    // (the binder is bypassed on the marshalled path). A parse / schema-validation
    // failure refuses the invocation fail-closed and reports it through the
    // envelope as Err(InvokeInfraError{cause:"validation"}).
    const intake = this.#intakeSubagentRootParams(theta);
    if (!intake.ok) {
      (this.#input.emitDiagnostic ?? ((): void => {}))(intake.diagnostic);
      emitErr({ ...intake.error, callee_path: calleePath } as unknown as QueryError, "mint");
      return;
    }
    const paramBindings =
      intake.params !== undefined && intake.params !== null
        ? bindParamsInbound({
            params: intake.params as Readonly<Record<string, unknown>>,
            lowered: theta.frontmatter.params?.loweredSchema as
              | Record<string, unknown>
              | undefined,
            body: theta.body,
            schemaValidator: this.#input.root.schemaValidator,
            ...(theta.sourcePath !== undefined
              ? { enumDeclaringPath: theta.sourcePath }
              : {}),
          })
        : new Map<string, ThetaValue>();
    const rootBindInput: ConversationBindInput = {
      ...bindInput,
      ...(paramBindings.size > 0 ? { paramBindings } : {}),
    };

    // PIC-58: drive the root theta against the child process's own host session
    const binding = this.bindPromptConversation(rootBindInput);
    try {
      const execution = await executeBody(theta.body, binding.executeDeps);
      const terminal = surfaceCalleeFinalValue(execution);
      if (terminal.ok) {
        const tooDeep = mapTooDeepReturnValue(terminal.value as unknown, calleePath);
        const nonRepresentable =
          tooDeep === undefined
            ? mapNonRepresentableReturnValue(terminal.value as unknown, calleePath)
            : undefined;
        if (tooDeep !== undefined) {
          emitErr(tooDeep, "mint");
        } else if (nonRepresentable !== undefined) {
          (this.#input.emitDiagnostic ?? ((): void => {}))(nonRepresentable.diagnostic);
          emitErr(nonRepresentable.error, "mint");
        } else {
          emitEnvelope(
            serializeOkEnvelope(
              terminal.value as unknown,
              collectForwardedEnumTags(terminal.value as ThetaValue),
            ),
          );
          emitOutcome("ok");
          this.#requestVisibleChildShutdown(ctx);
        }
      } else {
        emitErr(terminal.error as unknown as QueryError, "propagated");
      }
    } catch (thrown: unknown) {
      if (thrown instanceof HostFatal) {
        throw thrown;
      }
      const message = thrown instanceof Error ? thrown.message : String(thrown);
      emitErr(
        {
          kind: "invoke_infra",
          message: `internal error: ${message}`,
          callee_path: calleePath,
          cause: "internal_error",
        } as unknown as QueryError,
        "mint",
      );
    } finally {
      await binding.teardown?.();
      binding.finishInvocation?.();
    }
```

Location 2 — `subagent fn` entry drive, lines 3270-3412:

```typescript
    const validator = this.#subagentFnParamsValidator(fn, fnName, loweredParams);
    const fs = this.#input.subagentParamsFs;
    const intake = intakeChildParams(this.#input.subagentParentEnv ?? {}, validator, {
      readFile: (path: string): string => {
        if (fs === undefined) {
          throw new Error("subagent params file channel unavailable: no params-fs seam wired");
        }
        return fs.readFile(path);
      },
      unlink: (path: string): void => {
        fs?.unlink(path);
      },
    });
    if (!intake.ok) {
      emitDiagnostic(intake.diagnostic);
      emitErr({ ...intake.error, callee_path: calleePath } as unknown as QueryError, "mint");
      return;
    }
    const received = (intake.params ?? {}) as Record<string, unknown>;
    const argValues: ThetaValue[] = fn.params.map((param, index) => {
      const wire = received[param.name] as unknown;
      const lowered = loweredParams[index];
      if (lowered === undefined) {
        return wire as ThetaValue;
      }
      return decodeInboundValue({
        lowered: lowered as unknown as Record<string, unknown>,
        annotation: param.type,
        schemaNames,
        enumNames,
        validated: wire,
        schemaValidator: this.#input.root.schemaValidator,
        ...(declaringPath !== undefined ? { enumDeclaringPath: declaringPath } : {}),
      });
    });

    const configured = this.#applySubagentFnConfig(theta, fn.sessionConfig ?? {}, ctx);
    const binding = this.bindPromptConversation({
      ...bindInput,
      theta: configured.theta,
      ctx: configured.ctx,
    });
    try {
      const bodyEnv = binding.executeDeps.env;
      const moduleEnv = bodyEnv.resolve(fnName).moduleEnv;
      const scope = (moduleEnv ?? bodyEnv).spawnIsolatedScope();
      fn.params.forEach((param, index) => {
        scope.defineLocal(param.name, argValues[index] ?? null, false);
      });
      const execution = await executeBody(fn.body, { ...binding.executeDeps, env: scope });
      if (execution.outcome !== "success") {
        const surfaced = surfaceCalleeFinalValue(execution);
        emitErr(
          (surfaced.ok ? makeCancelledError() : surfaced.error) as unknown as QueryError,
          "propagated",
        );
        return;
      }
      const value = execution.result.value ?? null;
      const tail: FnTail | undefined = isResultValue(value) ? (value.ok ? "ok" : "err") : undefined;
      if (isResultValue(value) && !value.ok) {
        emitErr(value.error as unknown as QueryError, "propagated", "err");
        return;
      }
      const payload = isResultValue(value) && value.ok ? value.value : value;
      const tooDeep = mapTooDeepReturnValue(payload as unknown, calleePath);
      const nonRepresentable =
        tooDeep === undefined ? mapNonRepresentableReturnValue(payload as unknown, calleePath) : undefined;
      if (tooDeep !== undefined) {
        emitErr(tooDeep, "mint");
      } else if (nonRepresentable !== undefined) {
        emitDiagnostic(nonRepresentable.diagnostic);
        emitErr(nonRepresentable.error, "mint");
      } else {
        emitEnvelope(
          serializeOkEnvelope(payload as unknown, collectForwardedEnumTags(payload as ThetaValue), tail),
        );
        emitOutcome("ok");
        this.#requestVisibleChildShutdown(ctx);
      }
    } catch (thrown: unknown) {
      if (thrown instanceof HostFatal) {
        throw thrown;
      }
      const message = thrown instanceof Error ? thrown.message : String(thrown);
      mintInfra(message, isThetaPanic(thrown) ? "panic" : "internal_error");
    } finally {
      await binding.teardown?.();
      binding.finishInvocation?.();
    }
```

Diff verdict: the two paths are structurally parallel (same child-drive phase order) but not token-identical; they use different params-intake validators (`#intakeSubagentRootParams` vs `#subagentFnParamsValidator`), different binding mechanisms (`bindParamsInbound` vs `decodeInboundValue` into an isolated scope), and slightly different panic classification (`"internal_error"` only vs `"panic"`/`"internal_error"` split). No clone-map group id applies.

## Why this is a problem
This is load-bearing parallel truth, not incidental similarity. Both paths must implement the same stdout-envelope contract (PIC-58/59/60/62): the parent parses the same `theta_result` JSONL line regardless of whether the child was launched for a theta root or for a `subagent fn`. When one path gains a child-drive concern, the other must too. Counted against the theta-root path's phases, the fn-entry path covers 8 of 9 structural phases:

| Phase | theta-root (3049-3172) | fn-entry (3270-3412) |
|-------|------------------------|----------------------|
| 1. Params intake from child env | `#intakeSubagentRootParams` | `intakeChildParams` + `#subagentFnParamsValidator` |
| 2. Params validation failure → envelope | yes (emitErr "mint") | yes (emitErr "mint") |
| 3. Bind inbound params into execution scope | `bindParamsInbound` | `decodeInboundValue` + `spawnIsolatedScope().defineLocal` |
| 4. Build prompt-mode binding | `this.bindPromptConversation(rootBindInput)` | `this.bindPromptConversation({...configured})` |
| 5. Execute body | `executeBody(theta.body, ...)` | `executeBody(fn.body, {env: scope})` |
| 6. Surface terminal + tooDeep/nonRepresentable | yes | yes |
| 7. Emit Ok envelope / outcome / shutdown | `serializeOkEnvelope` + `emitOutcome("ok")` + `#requestVisibleChildShutdown` | same |
| 8. Emit Err envelope on body/return failure | yes | yes |
| 9. Panic catch + teardown/finishInvocation | yes ("internal_error" only) | yes ("panic"/"internal_error" split) |

The divergence in phase 9 is itself a drift risk: a `ThetaPanic` from a theta-root child is stamped `cause: "internal_error"`, while the same panic from an fn-entry child is stamped `cause: "panic"`. The RFC-0006 contract does not obviously require this distinction, and an `invoke` parent sees different `InvokeInfraCause` values for the same failure mode depending on which subagent entry kind was used. Phase 3 also diverges in binding mechanics (full `bindParamsInbound` vs per-param `decodeInboundValue`), risking inconsistent enum-tag/schema-brand restoration between the two entry kinds.

## Suggested direction (non-binding, optional)
The natural shared home is a single child-side drive helper parameterized by entry kind, params-intake strategy, and body-execution input. The helper would own the common envelope-contract phase order (PIC-58/59/60/62), leaving only the params-shape and scope-opening details to the two call sites. This is a hypothesis; the fix stage owns the design.

## False-positive check
- Clone map re-verified: `src/extension/production-theta-producer.ts` has no clone groups, so this parallel was not detected by token clone scanning.
- Both copies live: `driveSubagentRootRegime` is exported/public on `ProductionThetaProducer` and is the child-root dispatch entry; `#driveSubagentFnEntry` is called from it on the `entry.kind === "fn"` branch.
- Deliberate-mirror check: the doc comments explicitly state both implement RFC-0006 child-side drive mechanics, so the mirror is intentional. The rationale is not demonstrably false; the finding is filed as parallel truth, not as a copy to eliminate.
- Not tests/: both locations are under `src/extension` production code.
- Not dead code: `isSubagentRootFor` gates the only call site of `driveSubagentRootRegime`, and the fn branch inside it is reached from the `subagentControlPlane.entry` shape.
- Not spec-normative vector table: the similarity is imperative implementation, not a repeated spec enumeration.

## Triage
verdict: questionable — accounting verified: both excerpts match at the cited ranges (theta-root arm 3049-3172 inside `driveSubagentRootRegime`, `#driveSubagentFnEntry` 3270-3412), clone-scan map for the file reports `(no clone groups)` so the parallel is correctly filed outside the token map, both copies are live (`driveSubagentRootRegime` dispatches to `#driveSubagentFnEntry` at 3047 on `entry.kind === "fn"`), and the 9-phase table reproduces phase-for-phase (intake→Err mint, bind, `bindPromptConversation`, `executeBody`, `mapTooDeepReturnValue`/`mapNonRepresentableReturnValue`, `serializeOkEnvelope`+`emitOutcome("ok")`+`#requestVisibleChildShutdown`, propagated Err, catch+`teardown`/`finishInvocation`); the phase-9 divergence is real — the theta-root catch (3159-3167) stamps every non-HostFatal throw `cause: "internal_error"` while the fn-entry catch (3410) splits `isThetaPanic → "panic"`, and the spec itself pulls both ways (subagent.md:159 "panics routed as internal-error" vs invocation.md:99 / error-model.md:103 `cause: "panic"` through the child envelope), so which side is right and whether a shared drive helper is the home are design decisions for a human; minor prose slip ("8 of 9" vs a 9/9 table) does not block; no D4 duplicate — PTQ-1192 and PTQ-1204 are D9 breakdown filings on each host individually, PTQ-1285 is the file-level D9 (triage: claude-fable-5-1)
