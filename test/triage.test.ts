import assert from "node:assert/strict";
import test from "node:test";
import { TypeSafeClient } from "@effect-agent/ai-typesafe";
import { Duration, Effect, Fiber, Layer, Redacted, Result } from "effect";
import { TestClock } from "effect/testing";
import { AiError } from "effect/unstable/ai";
import { FetchHttpClient } from "effect/unstable/http";
import { createTicketClient } from "../src/client.js";
import { assessTicket, TicketAssessment, type Category } from "../src/triage.js";
import { TypeSafeDecision, withRequestPolicy } from "../src/transport.js";

const input = { document: "I was charged twice. Please fix this ASAP." };

const response = () => ({
  model: "fixture-model",
  answers: {
    category: {
      type: "choice", choice: "billing", confidence: 0.95,
      probabilities: { billing: 0.96, technical: 0.03, other: 0.01 },
    },
    urgent: { type: "noul", noul: 0.97 },
    frustration: {
      type: "score", score: 1.1, confidence: 0.8,
      probabilities: { "0": 0.1, "1": 0.7, "2": 0.2 },
      legend: Object.fromEntries(TicketAssessment.questions.frustration.criteria.map((level, i) => [i, level])),
    },
  },
  usage: { input_tokens: 100, output_tokens: 20 },
});

const testLayer = (fetch: typeof globalThis.fetch) => TypeSafeDecision.pipe(
  Layer.provide(Layer.succeed(TypeSafeClient.Config, { apiKey: Redacted.make("test-only") })),
  Layer.provide(FetchHttpClient.layer.pipe(
    Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch)),
  )),
);

const run = (fetch: typeof globalThis.fetch) => Effect.runPromise(
  assessTicket(input).pipe(Effect.result, Effect.provide(testLayer(fetch))),
);

test("batches three questions, validates evidence, and keeps the choice union", async () => {
  let calls = 0;
  const result = await run(async (url, init) => {
    calls++;
    assert.equal(String(url), "https://api.typesafe.ai/v1/systemone");
    assert.equal(init?.method, "POST");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-only");
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body.state, input);
    assert.deepEqual(Object.keys(body.questions), ["category", "urgent", "frustration"]);
    assert.equal(body.questions.urgent.type, "noul");
    return Response.json(response());
  });
  assert.equal(calls, 1);
  assert.ok(Result.isSuccess(result));
  assert.equal(result.success._tag, "Accepted");
  if (result.success._tag === "Accepted") {
    const category: Category = result.success.value;
    assert.equal(category, "billing");
    // @ts-expect-error The inferred choice is a literal union, not an arbitrary string.
    const unrelated: "sales" = result.success.value;
    void unrelated;
  }
  assert.equal(result.success.evidence.urgentProbability, 0.97);
  assert.equal(result.success.evidence.frustration, 1.1);
  assert.equal(result.success.evidence.model, "fixture-model");
});

test("uncertainty returns ReviewRequired without a retry or accepted value", async () => {
  let calls = 0;
  const fixture = response();
  fixture.answers.category.confidence = 0.4;
  fixture.answers.category.probabilities = { billing: 0.45, technical: 0.45, other: 0.1 };
  const result = await run(async () => { calls++; return Response.json(fixture); });
  assert.ok(Result.isSuccess(result));
  assert.equal(result.success._tag, "ReviewRequired");
  assert.equal("value" in result.success, false);
  assert.equal(calls, 1);
});

test("invalid choices are rejected and never retried", async () => {
  let calls = 0;
  const fixture = response();
  fixture.answers.category.choice = "sales";
  const result = await run(async () => { calls++; return Response.json(fixture); });
  assert.ok(Result.isFailure(result));
  assert.ok(AiError.isAiError(result.failure));
  assert.equal(result.failure.reason._tag, "InvalidOutputError");
  assert.equal(calls, 1);
});

test("incomplete probability distributions are rejected", async () => {
  const fixture = response();
  const { other: _other, ...probabilities } = fixture.answers.category.probabilities;
  const result = await run(async () => Response.json({
    ...fixture,
    answers: { ...fixture.answers, category: { ...fixture.answers.category, probabilities } },
  }));
  assert.ok(Result.isFailure(result));
  assert.ok(AiError.isAiError(result.failure));
  assert.equal(result.failure.reason._tag, "InvalidOutputError");
});

test("invalid input fails before any HTTP request", async () => {
  let calls = 0;
  const result = await Effect.runPromise(assessTicket({ document: "" }).pipe(
    Effect.result,
    Effect.provide(testLayer(async () => { calls++; return Response.json(response()); })),
  ));
  assert.ok(Result.isFailure(result));
  assert.ok(AiError.isAiError(result.failure));
  assert.equal(result.failure.reason._tag, "InvalidRequestError");
  assert.equal(calls, 0);
});

test("429 is retried and a later successful response is accepted", async () => {
  let calls = 0;
  const result = await run(async () => ++calls === 1
    ? Response.json({ error: "Try again" }, { status: 429, headers: { "retry-after": "0" } })
    : Response.json(response()));
  assert.ok(Result.isSuccess(result));
  assert.equal(calls, 2);
});

test("persistent server failures stop after two retries", async () => {
  let calls = 0;
  const result = await run(async () => {
    calls++;
    return Response.json({ error: "Unavailable" }, { status: 503 });
  });
  assert.ok(Result.isFailure(result));
  assert.ok(AiError.isAiError(result.failure));
  assert.equal(result.failure.reason._tag, "InternalProviderError");
  assert.equal(calls, 3);
});

test("authentication failures are not retried", async () => {
  let calls = 0;
  const result = await run(async () => {
    calls++;
    return Response.json({ error: "Invalid key" }, { status: 401 });
  });
  assert.ok(Result.isFailure(result));
  assert.ok(AiError.isAiError(result.failure));
  assert.equal(result.failure.reason._tag, "AuthenticationError");
  assert.equal(calls, 1);
});

test("the total deadline includes Retry-After backoff", async () => {
  let attempts = 0;
  const result = await Effect.runPromise(Effect.gen(function* () {
    const request = Effect.suspend(() => {
      attempts++;
      return Effect.fail(new AiError.AiError({
        module: "test", method: "evaluate",
        reason: new AiError.RateLimitError({ retryAfter: Duration.seconds(30) }),
      }));
    });
    const fiber = yield* withRequestPolicy(request).pipe(Effect.result, Effect.forkChild);
    yield* TestClock.adjust("10 seconds");
    return yield* Fiber.join(fiber);
  }).pipe(Effect.provide(TestClock.layer())));
  assert.ok(Result.isFailure(result));
  assert.equal(result.failure._tag, "TimeoutError");
  assert.equal(attempts, 1);
});

for (const header of ["30", "Thu, 01 Jan 1970 00:00:30 GMT"]) {
  test(`HTTP Retry-After ${header} is respected within the total deadline`, async () => {
    let attempts = 0;
    const result = await Effect.runPromise(Effect.gen(function* () {
      const request = Effect.suspend(() => {
        attempts++;
        return Effect.fail(new AiError.AiError({
          module: "test", method: "evaluate",
          reason: AiError.reasonFromHttpStatus({
            status: 429,
            http: {
              request: { method: "POST", url: "https://example.test", urlParams: [], headers: {} },
              response: { status: 429, headers: { "retry-after": header } },
            },
          }),
        }));
      });
      const fiber = yield* withRequestPolicy(request).pipe(Effect.result, Effect.forkChild);
      yield* TestClock.adjust("10 seconds");
      return yield* Fiber.join(fiber);
    }).pipe(Effect.provide(TestClock.layer())));
    assert.ok(Result.isFailure(result));
    assert.equal(result.failure._tag, "TimeoutError");
    assert.equal(attempts, 1);
  });
}

test("the Promise client forwards cancellation to the HTTP request", async () => {
  const started = Promise.withResolvers<void>();
  let aborted = false;
  const controller = new AbortController();
  const client = createTicketClient(testLayer(async (_url, init) => {
    started.resolve();
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        aborted = true;
        reject(new DOMException("Cancelled", "AbortError"));
      }, { once: true });
    });
  }));
  try {
    const pending = client.assess(input, { signal: controller.signal });
    const rejected = assert.rejects(pending);
    await started.promise;
    controller.abort();
    await rejected;
    assert.equal(aborted, true);
  } finally {
    await client.close();
  }
});
