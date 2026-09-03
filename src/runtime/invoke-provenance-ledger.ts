// Bug 0088 (slash-invocation.md SLSH-5) — the invoke-hop provenance ledger.
// `recordInvocationProvenance` (`invoke-provenance.ts`) produces one
// `InvocationRecord` per executed `invoke` hop; nothing retains the record
// beside the `invoke_callee` wrapper it belongs to, so `emitTopLevelErrNote`'s
// two call sites have no `ChainHop[]` to build.
//
// This module is the retention seam: an instance-scoped ledger, keyed on the
// wrapper OBJECT ITSELF (a `WeakMap<InvokeCalleeError, ChainHop>`), so pairing a
// wrapper with its hop needs no field on the wrapper and no identifier scheme —
// the wrapper's own identity is the key. Instance-scoped (a factory return, no
// module-level state) per CLAUDE.md's no-globals/statics/singletons rule; the
// production composition root owns one instance per producer.
//
// The wrapper's `callee_path` field is the LITERAL callee path text
// (`expr.path`, e.g. `./child.theta`) — never `realpath`'d (see
// `runInvokeEffect` in `effectful-statement-host.ts`, which builds the wrapper
// from `child.calleePath`). SLSH-5's `<callee_path>` is the post-`realpath`
// absolute form, so `attach` canonicalises the callee path through the same
// shared `canonicalizePath` identity `recordInvocationProvenance` applies to
// the parent path: both placeholders of one rendered suffix are therefore in
// one identical form. The wrapper's own `callee_path` field is left untouched — it
// is theta-visible and the ledger reads it for nothing.
//
// WHICH WRAPPERS CARRY A HOP. The ledger records against `invoke_callee`
// wrappers. Three sites in `src/` construct one: the literal-`invoke` hop
// (`runInvokeEffect`, via `surfaceThetaCallableCalleeFailure`), the code-side
// `.theta`-callable bare-identifier call (`runToolCallEffect`'s theta-callable
// branch, also via `surfaceThetaCallableCalleeFailure`, recording a
// `theta_callable_bare` hop — bug 0349), and the `subagent fn` callee site
// (`subagentCalleeError` in `statement-executor.ts`). Every executed hop of
// these three shapes contributes to the SLSH-5 chain.
//
// Spec: slash-invocation.md SLSH-5. Producer: invoke-provenance.ts. Consumer:
// err-note-render.ts (`ChainHop`, `ErrNoteInput.chain`).

import type { FileSystem } from "../seams/file-system";
import type { ChainHop } from "./err-note-render";
import { isInvokeCalleeError } from "./err-note-render";
import type { InvokeCallSite } from "./invoke-provenance";
import { recordInvocationProvenance } from "./invoke-provenance";
import { canonicalizePath } from "./invocation";
import type { InvokeCalleeError, QueryError } from "./query-error";

/** Host dependencies the ledger needs to canonicalise a hop's callee path. */
export interface InvocationProvenanceLedgerDeps {
  /** The injected `FileSystem` seam; only `realpath` is consulted. */
  readonly fs: Pick<FileSystem, "realpath">;
}

/** One `invoke` hop's un-canonicalised inputs, as known at the call site. */
export interface InvokeHopInput {
  /** The parent theta's path as resolved at the call site (pre-`realpath`). */
  readonly parentPath: string;
  /** The callee path resolved against the parent's directory (pre-`realpath`). */
  readonly calleePath: string;
  /** The call-site token descriptor whose 1-indexed line is recorded. */
  readonly callSite: InvokeCallSite;
}

/**
 * The per-producer-instance ledger pairing each `invoke_callee` wrapper with
 * its `ChainHop`. `attach` runs once per executed `invoke` hop, immediately
 * after the wrapper is constructed; `chainFor` runs once per top-level `Err`,
 * at the slash-dispatch boundary.
 */
export interface InvocationProvenanceLedger {
  /**
   * Record one executed `invoke` hop's provenance against the wrapper it
   * produced: `recordInvocationProvenance` supplies `<parent_path>:<line>`,
   * and the callee path is canonicalised through the same `canonicalizePath`
   * identity so the stored `ChainHop.calleePath` is byte-identical to the
   * form SLSH-5 requires. Resolves for every input: a `realpath` that rejects
   * records no entry for the hop rather than propagating (see the body).
   */
  attach(wrapper: InvokeCalleeError, input: InvokeHopInput): Promise<void>;
  /**
   * Walk the `invoke_callee` wrapper chain from `error` OUTERMOST-first (the
   * order `ErrNoteInput.chain` documents), emitting the hop for each wrapper
   * this ledger has an entry for and SKIPPING a wrapper with none. A wrapper
   * rebuilt from JSON across the RFC-0006 subagent envelope is such a skip:
   * object identity, and with it the `WeakMap` key, does not cross the process
   * boundary, so that wrapper has no ledger identity, its hop is omitted, and
   * the chain for a cascade crossing that boundary is partial.
   */
  chainFor(error: QueryError): readonly ChainHop[];
}

/**
 * Build one producer-instance-scoped `InvocationProvenanceLedger`. No
 * module-level / static / global state: the `WeakMap` lives in this closure,
 * so two producer instances (e.g. two composition roots in one process, as
 * tests construct) never share entries.
 */
export function createInvocationProvenanceLedger(
  deps: InvocationProvenanceLedgerDeps,
): InvocationProvenanceLedger {
  const hops = new WeakMap<InvokeCalleeError, ChainHop>();
  return {
    async attach(wrapper, input) {
      // A provenance record is best-effort attribution for an error that is
      // already a returned VALUE the theta may `match` on. `realpath` rejects
      // when the parent or callee file is removed, renamed or made unreadable
      // while the callee runs, and letting that rejection out of `attach` would
      // convert the caller's `Err` value into a thrown abort. The same
      // rejection-to-`undefined` idiom `production-composition.ts` applies to
      // `readBytes` / `checkInvokePathAtLoad` keeps the failure local — never a
      // broad `catch` (CLAUDE.md) — and an unrecorded hop is exactly the entry
      // `chainFor` documents skipping, so the degrade is a shorter chain.
      const record = await recordInvocationProvenance(
        { fs: deps.fs },
        { parentPath: input.parentPath, callSite: input.callSite },
      ).then(
        (value) => value,
        () => undefined,
      );
      const calleePath = await canonicalizePath(deps.fs, input.calleePath).then(
        (value) => value,
        () => undefined,
      );
      if (record === undefined || calleePath === undefined) {
        return;
      }
      hops.set(wrapper, { calleePath, record });
    },
    chainFor(error) {
      const chain: ChainHop[] = [];
      let current: QueryError = error;
      while (isInvokeCalleeError(current)) {
        const hop = hops.get(current);
        if (hop !== undefined) {
          chain.push(hop);
        }
        current = current.inner;
      }
      return chain;
    },
  };
}
