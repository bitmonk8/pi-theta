// V8d — sequence-driven `FakeIdSource` conforming `IdSource` seam (PIC-20).
//
// The constructor takes the sequence of ids it should hand out; both
// `newInvocationId()` and `newToolCallId()` return the next configured id on
// each call, so a conformance test drives minted ids at known boundaries
// instead of matching nondeterministic UUIDs. Exhausting the sequence throws
// loudly rather than silently returning undefined (a skipped check is a lie).
//
// Spec: host-interfaces-services.md PIC-20.

import type { IdSource } from "../../src/seams/id-source";

export class FakeIdSource implements IdSource {
  readonly #ids: readonly string[];
  #index = 0;

  constructor(ids: readonly string[]) {
    this.#ids = ids;
  }

  #next(): string {
    const id = this.#ids[this.#index];
    if (id === undefined) {
      throw new Error(
        `FakeIdSource exhausted: ${this.#ids.length} id(s) configured, requested more`,
      );
    }
    this.#index++;
    return id;
  }

  newInvocationId(): string {
    return this.#next();
  }

  newToolCallId(): string {
    return this.#next();
  }
}
