import { ManagedRuntime } from "effect";
import { assessTicket, type TicketInput } from "./triage.js";
import { TypeSafeDecisionLive } from "./transport.js";

export const createTicketClient = (layer = TypeSafeDecisionLive) => {
  const runtime = ManagedRuntime.make(layer);

  return {
    assess: (input: TicketInput, options?: { readonly signal?: AbortSignal }) =>
      runtime.runPromise(assessTicket(input), options),
    close: () => runtime.dispose(),
  };
};
