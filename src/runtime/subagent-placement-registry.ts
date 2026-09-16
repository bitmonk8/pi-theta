// RFC-0012 §5 — registered placement backends: the versioned `pi.events`
// discovery protocol and the per-instance registry it fills.
//
// A backend shipped by another extension reaches pi-theta over Pi's shared
// event bus in either direction, so registration is order-independent:
//
//   - DISCOVER (pi-theta → backends): at `session_start` and after each reload
//     pi-theta emits `pi-theta:subagent-placement:discover:v1` with
//     `{ apiVersion: 1, register(backend) }`; a listener calls `register`
//     synchronously.
//   - OFFER (backend → pi-theta): a backend that loads after pi-theta emits
//     `pi-theta:subagent-placement:offer:v1` with `{ apiVersion: 1, backend }`;
//     pi-theta subscribes in its factory body.
//
// Every candidate is validated structurally (`validatePlacementBackend`) —
// nothing is invoked at registration; `detect()` runs at selection time.
// Re-registering the IDENTICAL backend object under its name is a silent
// no-op (the expected shape of a listener answering every compose pass's
// discover); a malformed registration, or a DIFFERENT object under an
// already-registered name, is dropped with
// `theta/load/subagent-placement-invalid` (W) and the remaining backends
// stand. The bus is per process, so every subscription is released on
// `session_shutdown` (a stale handler from a removed package must not survive
// `/reload`). `pi.events` is an OPTIONAL capability (capability-probe.md):
// absent, the two channels do not exist, only `pipe` / `exec` are selectable,
// and nothing refuses to load.
//
// The pure half lives here (protocol constants, payload shapes, the registry);
// the extension layer binds it to the real `pi.events` (`production-composition.ts`).

import type { Diagnostic } from "../diagnostics/diagnostic";
import { validatePlacementBackend, type SubagentPlacementBackend } from "./subagent-placement";

/** The registration protocol version; a payload naming another is dropped. */
export const PLACEMENT_REGISTRATION_API_VERSION = 1;
/** pi-theta → backends: "register now". */
export const PLACEMENT_DISCOVER_CHANNEL = "pi-theta:subagent-placement:discover:v1";
/** backend → pi-theta: "here is a backend" (for a backend that loads after pi-theta). */
export const PLACEMENT_OFFER_CHANNEL = "pi-theta:subagent-placement:offer:v1";

/** `theta/load/subagent-placement-invalid` (W) — a malformed or duplicate registration, dropped. */
export const SUBAGENT_PLACEMENT_INVALID_CODE = "theta/load/subagent-placement-invalid";

/** The child outcome protocol version; consumers ignore a payload naming another. */
export const SUBAGENT_CHILD_OUTCOME_API_VERSION = 1;
/**
 * RFC 0012 §7 (0.478.0) — child → same-process subscribers: the terminal
 * PIC-59 envelope arm, mirrored onto the bus. Emitted once per child-side
 * subagent-root drive (`driveSubagentRootRegime`,
 * `src/extension/production-theta-producer.ts`); never emitted by a parent.
 */
export const SUBAGENT_CHILD_OUTCOME_CHANNEL = "pi-theta:subagent-child:outcome:v1";

/** The two outcome values — the PIC-59 envelope arms, one-to-one. */
export type SubagentChildOutcome = "ok" | "err";

/**
 * The payload emitted on the outcome channel. CLOSED at exactly these three
 * fields: widening is a new channel version (`:v2`), never an in-place edit —
 * consumers pin this shape byte-for-byte. No `label` field: the child knows
 * its own `--name`, and a subscriber in the child process can read it there.
 */
export interface SubagentChildOutcomePayload {
  readonly apiVersion: typeof SUBAGENT_CHILD_OUTCOME_API_VERSION;
  readonly outcome: SubagentChildOutcome;
  /** The marked root's slug (`theta.slashName`, no leading `/`). */
  readonly slug: string;
}

/** The payload pi-theta emits on the discover channel. */
export interface PlacementDiscoverPayload {
  readonly apiVersion: typeof PLACEMENT_REGISTRATION_API_VERSION;
  register(backend: SubagentPlacementBackend): void;
}

/** The payload a backend emits on the offer channel. */
export interface PlacementOfferPayload {
  readonly apiVersion: typeof PLACEMENT_REGISTRATION_API_VERSION;
  readonly backend: SubagentPlacementBackend;
}

/**
 * The `pi.events` surface the binding consumes (`EventBus` at the pin:
 * `emit(channel, data)`, `on(channel, handler) → unsubscribe`).
 */
export interface PlacementEventBus {
  emit(channel: string, data: unknown): void;
  on(channel: string, handler: (data: unknown) => void): () => void;
}

/**
 * The per-instance set of registered backends. Names are unique. The first
 * registration under a name stands; re-registering the IDENTICAL object
 * (`===`) under that name is a silent no-op, because discover fires on every
 * compose pass (initial and each hot-reload re-compose) while the registry
 * clears only at `session_shutdown`, so a listener that answers every
 * discover with its one backend object is the conformant shape, not a fault
 * (0.477.0). A DIFFERENT object under a registered name is dropped with the
 * invalid-registration diagnostic.
 */
export class PlacementRegistry {
  readonly #backends = new Map<string, SubagentPlacementBackend>();

  /**
   * Register one candidate. Re-registering the identical backend object
   * under its already-registered name is a no-op (the first stands, no
   * diagnostic). Returns the `theta/load/subagent-placement-invalid`
   * diagnostic when the candidate is dropped, else `undefined`.
   */
  register(candidate: unknown): Diagnostic | undefined {
    const verdict = validatePlacementBackend(candidate);
    if (!verdict.ok) {
      return invalidRegistration(verdict.name, verdict.reason);
    }
    const existing = this.#backends.get(verdict.backend.name);
    if (existing !== undefined) {
      return existing === verdict.backend
        ? undefined
        : invalidRegistration(
            verdict.backend.name,
            "a different backend is already registered under this name",
          );
    }
    this.#backends.set(verdict.backend.name, verdict.backend);
    return undefined;
  }

  /** The registered backends in registration order. */
  snapshot(): readonly SubagentPlacementBackend[] {
    return [...this.#backends.values()];
  }

  get(name: string): SubagentPlacementBackend | undefined {
    return this.#backends.get(name);
  }

  clear(): void {
    this.#backends.clear();
  }
}

/** Render the `theta/load/subagent-placement-invalid` row (registry Message, DIAG-4). */
export function invalidRegistration(name: string, reason: string): Diagnostic {
  return {
    severity: "warning",
    code: SUBAGENT_PLACEMENT_INVALID_CODE,
    message: `ignoring subagent placement registration '${name}': ${reason}`,
    hint: "Fix the registering extension; the offer payload shape is { apiVersion: 1, backend }.",
  };
}

/** What `bindPlacementRegistration` returns: the discover trigger and the release. */
export interface PlacementRegistrationBinding {
  /** Emit the discover event (at `session_start` and after each reload). */
  discover(): void;
  /** Release the offer subscription (`session_shutdown`). Idempotent. */
  unsubscribe(): void;
}

/**
 * Bind the protocol to an event bus: subscribe to offers, and expose the
 * discover emission. `events` undefined (a host without `pi.events`) yields a
 * binding whose members are no-ops — built-ins only, no diagnostic.
 *
 * Both handlers are defended: a listener's throw from inside `register` (a
 * backend's own bug) or a malformed offer payload is reported through
 * `emitDiagnostic` as an invalid registration and never propagates into the
 * compose pass or the emitting extension.
 */
export function bindPlacementRegistration(
  events: PlacementEventBus | undefined,
  registry: PlacementRegistry,
  emitDiagnostic: (diagnostic: Diagnostic) => void,
): PlacementRegistrationBinding {
  if (events === undefined) {
    return { discover: (): void => {}, unsubscribe: (): void => {} };
  }
  const accept = (candidate: unknown): void => {
    const dropped = registry.register(candidate);
    if (dropped !== undefined) {
      emitDiagnostic(dropped);
    }
  };
  const onOffer = (data: unknown): void => {
    if (typeof data !== "object" || data === null) {
      emitDiagnostic(invalidRegistration("<unnamed>", "offer payload is not an object"));
      return;
    }
    const payload = data as Partial<PlacementOfferPayload>;
    if (payload.apiVersion !== PLACEMENT_REGISTRATION_API_VERSION) {
      emitDiagnostic(
        invalidRegistration(
          nameOf(payload.backend),
          `offer apiVersion ${String(payload.apiVersion)} is not ${PLACEMENT_REGISTRATION_API_VERSION}`,
        ),
      );
      return;
    }
    accept(payload.backend);
  };
  let unsubscribeOffer: (() => void) | undefined = events.on(PLACEMENT_OFFER_CHANNEL, onOffer);
  return {
    discover: (): void => {
      const payload: PlacementDiscoverPayload = {
        apiVersion: PLACEMENT_REGISTRATION_API_VERSION,
        register: accept,
      };
      try {
        events.emit(PLACEMENT_DISCOVER_CHANNEL, payload);
      } catch (listenerError: unknown) { // allow-broad-catch: RFC-0012 §5 — a foreign discover listener's throw is reported, never propagated, pi-integration-contract/subagent.md
        emitDiagnostic(
          invalidRegistration(
            "<unnamed>",
            `a discover listener threw: ${listenerError instanceof Error ? listenerError.message : String(listenerError)}`,
          ),
        );
      }
    },
    unsubscribe: (): void => {
      unsubscribeOffer?.();
      unsubscribeOffer = undefined;
    },
  };
}

function nameOf(candidate: unknown): string {
  if (typeof candidate === "object" && candidate !== null) {
    const name = (candidate as Record<string, unknown>)["name"];
    if (typeof name === "string") {
      return name;
    }
  }
  return "<unnamed>";
}
