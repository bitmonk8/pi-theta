// Active-set recording double: the first `setActiveTools` call is the step-2
// install; every later call is a step-4 restore. The throw schedule can model
// a transient or persistent restore failure, or a PIC-19 setup failure.

import type { ActiveSetPi } from "../../src/runtime/tool-registration";

export type GateMode =
  | "healthy"
  | "throw-get" // step-1 snapshot throws (PIC-19 setup failure)
  | "throw-restore-once" // transient: first restore throws, the retry succeeds
  | "throw-restore-always" // persistent: both restore attempts throw
  | "throw-install"; // step-2 install throws (PIC-19 setup failure)

/** A configurable double of the `pi` snapshot/restore surface. */
export class FakeActiveSetPi implements ActiveSetPi {
  readonly setCalls: string[][] = [];
  getCalls = 0;
  #installed = false;
  #restoreAttempts = 0;

  constructor(
    readonly snapshot: readonly string[],
    readonly mode: GateMode = "healthy",
    private readonly errorPrefix = "setActiveTools",
  ) {}

  getActiveTools(): string[] {
    this.getCalls += 1;
    if (this.mode === "throw-get") throw new Error("getActiveTools SDK-shape drift");
    return [...this.snapshot];
  }

  setActiveTools(names: string[]): void {
    this.setCalls.push([...names]);
    if (!this.#installed) {
      this.#installed = true;
      if (this.mode === "throw-install") {
        throw new Error(`${this.errorPrefix} install drift`);
      }
      return;
    }
    this.#restoreAttempts += 1;
    if (this.mode === "throw-restore-always") {
      throw new Error(`${this.errorPrefix} restore failure`);
    }
    if (this.mode === "throw-restore-once" && this.#restoreAttempts === 1) {
      throw new Error(`${this.errorPrefix} transient restore failure`);
    }
  }

  /** Step-2 install vector — the first `setActiveTools` call. */
  get installVectorSeen(): string[] | undefined {
    return this.setCalls[0];
  }

  /** Step-4 restore attempts — every `setActiveTools` call after the install. */
  get restoreAttempts(): string[][] {
    return this.setCalls.slice(1);
  }
}
