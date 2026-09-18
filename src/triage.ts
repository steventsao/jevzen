import { DecisionModel, DecisionQuery, DecisionSet } from "@effect-agent/ai-decision";
import { TypeSafeDecisionModel } from "@effect-agent/ai-typesafe";
import { Effect, Schema } from "effect";
import { AiError } from "effect/unstable/ai";
import { withRequestPolicy } from "./transport.js";

export const TicketAssessment = DecisionSet.make({
  input: Schema.Struct({ document: Schema.NonEmptyString }),
  questions: {
    category: DecisionQuery.choice({
      instructions: "What is the support ticket in `document` primarily about?",
      options: {
        billing: "Charges, invoices, payments, or refunds",
        technical: "Bugs, errors, or trouble using the product",
        other: "Anything outside billing and technical support",
      },
    }),
    // beta.107's probability helper widens optional fields under strict TS 7.
    urgent: {
      type: "probability",
      instructions: "Does the customer in `document` explicitly request immediate attention?",
    },
    frustration: DecisionQuery.score({
      instructions: "How frustrated does the customer in `document` sound?",
      levels: ["Calm or neutral", "Concerned or annoyed", "Very angry"],
    }),
  },
});

export type TicketInput = typeof TicketAssessment.input.Type;
export type Category = keyof typeof TicketAssessment.questions.category.criteria;

export const categoryPolicy = {
  version: "support.category-policy.v1",
  minConfidence: 0.85,
} as const;

export const assessTicket = Effect.fn("support.assessTicket")(function* (input: TicketInput) {
  const model = yield* DecisionModel.DecisionModel;
  const result = yield* withRequestPolicy(model.evaluate(TicketAssessment, input));
  const metadata = yield* Schema.decodeUnknownEffect(TypeSafeDecisionModel.ProviderMetadata)(
    result.providerMetadata?.typesafe,
  ).pipe(
    Effect.mapError(() => new AiError.AiError({
      module: "TicketAssessment",
      method: "assessTicket",
      reason: new AiError.InvalidOutputError({ description: "Missing TypeSafe confidence metadata" }),
    })),
  );

  const confidence = metadata.confidence.category;
  if (confidence === undefined) {
    return yield* new AiError.AiError({
      module: "TicketAssessment",
      method: "assessTicket",
      reason: new AiError.InvalidOutputError({ description: "Missing category confidence" }),
    });
  }

  const evidence = {
    confidence,
    probabilities: result.answers.category.probabilities,
    urgentProbability: result.answers.urgent.probability,
    frustration: result.answers.frustration.score,
    model: result.model,
    usage: result.usage,
    decisionVersion: "support.ticket-assessment.v1",
    policyVersion: categoryPolicy.version,
    minConfidence: categoryPolicy.minConfidence,
  } as const;

  if (confidence < categoryPolicy.minConfidence) {
    return {
      _tag: "ReviewRequired",
      candidate: result.answers.category.choice,
      reason: "Category confidence is below the configured threshold",
      evidence,
    } as const;
  }

  return { _tag: "Accepted", value: result.answers.category.choice, evidence } as const;
});

export type TicketOutcome = Effect.Success<ReturnType<typeof assessTicket>>;
