import { TypeSafeClient, TypeSafeDecisionModel } from "@effect-agent/ai-typesafe";
import { DateTime, Duration, Effect, Layer, Result, Schedule, Schema } from "effect";
import type { AiError } from "effect/unstable/ai";
import { FetchHttpClient } from "effect/unstable/http";

export const TypeSafeDecision = TypeSafeDecisionModel.model("jev-latest").pipe(
  Layer.provide(TypeSafeClient.layer),
);

export const TypeSafeDecisionLive = TypeSafeDecision.pipe(
  Layer.provide(TypeSafeClient.Config.layer),
  Layer.provide(FetchHttpClient.layer),
);

const decodeRetryAfter = Schema.decodeUnknownResult(Schema.Union([
  Schema.FiniteFromString.check(Schema.isGreaterThanOrEqualTo(0)),
  Schema.DateFromString,
]));

const retryDelay = Effect.fnUntraced(function* (error: AiError.AiError, fallback: Duration.Duration) {
  if (error.retryAfter !== undefined) return error.retryAfter;
  const reason = error.reason;
  if (reason._tag !== "RateLimitError" && reason._tag !== "InternalProviderError") return fallback;

  // beta.107 retains HTTP headers but doesn't populate AiError.retryAfter.
  const parsed = decodeRetryAfter(reason.http?.response?.headers["retry-after"]);
  if (Result.isFailure(parsed)) return fallback;
  if (typeof parsed.success === "number") return Duration.seconds(parsed.success);
  const now = yield* DateTime.now;
  return Duration.millis(Math.max(0, parsed.success.getTime() - DateTime.toEpochMillis(now)));
});

const backoff = Schedule.exponential("250 millis").pipe(
  Schedule.jittered,
  Schedule.setInputType<AiError.AiError>(),
  Schedule.modifyDelay(({ input, duration }) => retryDelay(input, duration)),
);

export const withRequestPolicy = <A, R>(request: Effect.Effect<A, AiError.AiError, R>) =>
  request.pipe(
    Effect.retry({
      times: 2,
      schedule: backoff,
      while: (error) => error.isRetryable && (
        error.reason._tag === "NetworkError" ||
        error.reason._tag === "RateLimitError" ||
        error.reason._tag === "InternalProviderError"
      ),
    }),
    Effect.timeout("10 seconds"),
  );
