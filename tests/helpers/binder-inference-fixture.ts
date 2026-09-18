// Shared single-arm envelope and complete-call input for binder inference tests.

import type { Api, Model, ProviderResponse } from "@earendil-works/pi-ai";
import type { BinderEnvelopeSchema } from "../../src/binder/binder-envelope";
import type { BinderCompleteCallInput } from "../../src/binder/binder-inference";

export const envelope: BinderEnvelopeSchema = {
  anyOf: [
    {
      type: "object",
      properties: { kind: { const: "ok" } },
      required: ["kind"],
    },
  ],
};

/**
 * A minimal `Model<Api>` fixture with only `.api`, so no id-scoped temperature
 * placement row can match. Each call gets a fresh abort signal and callback.
 */
export function callInput(api: string, seed = 7): BinderCompleteCallInput {
  return {
    model: { api } as unknown as Model<Api>,
    systemPrompt: "You are the binder.",
    envelopeSchema: envelope,
    slug: "triage",
    seed,
    signal: new AbortController().signal,
    onResponse: (_response: ProviderResponse, _model: Model<Api>) => {},
  };
}
