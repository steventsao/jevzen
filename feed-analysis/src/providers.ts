import { Context, DateTime, Duration, Effect, Layer, Predicate, Redacted, Schedule, Schema, Semaphore } from 'effect';
import { BrowserHttpClient } from '@effect/platform-browser';
import { HttpClient, HttpClientRequest } from 'effect/unstable/http';

export type ProviderId = 'typesafe' | 'openrouter' | 'cloudflare';
export const PROVIDER_LABELS = { typesafe: 'TypeSafe · direct Jev', openrouter: 'OpenRouter · Jev', cloudflare: 'Cloudflare · Jev' } as const;
export interface ProviderSelection { provider: ProviderId; accountId: string; gatewayId: string }
export const DEFAULT_PROVIDER: ProviderSelection = { provider: 'typesafe', accountId: '', gatewayId: '' };
export interface ProviderConfig extends ProviderSelection { apiKey: Redacted.Redacted<string> }
export class DecisionError extends Schema.TaggedError<DecisionError>()('DecisionError', {
  code: Schema.String, message: Schema.String, retryable: Schema.Boolean, retryAfterMs: Schema.Number,
}) {}
export const failure = (code: string, message: string, retryable = false, retryAfterMs = 0) => new DecisionError({ code, message, retryable, retryAfterMs });
export class ProviderCredentials extends Context.Service<ProviderCredentials, {
  readonly get: Effect.Effect<ProviderConfig, DecisionError>;
}>()('feed/ProviderCredentials') {}
export interface Question { type: 'noul' | 'choice'; instructions: unknown; criteria?: Readonly<Record<string, unknown>> }
export interface DecisionRequest { state: unknown; questions: Readonly<Record<string, Question>> }
export const Probability = Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 1 }));
const Answer = Schema.Union([
  Schema.Struct({ type: Schema.Literal('noul'), noul: Probability }),
  Schema.Struct({ type: Schema.Literal('choice'), choice: Schema.String, confidence: Probability, probabilities: Schema.Record(Schema.String, Probability) }),
]);
const Response = Schema.Struct({
  model: Schema.NonEmptyString.check(Schema.isMaxLength(100)), answers: Schema.Record(Schema.String, Answer),
  usage: Schema.Struct({ input_tokens: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)), output_tokens: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)) }),
});
export type DecisionResponse = typeof Response.Type & { readonly provider: ProviderId };
export class DecisionProvider extends Context.Service<DecisionProvider, {
  readonly evaluate: (request: DecisionRequest) => Effect.Effect<DecisionResponse, DecisionError>;
}>()('feed/DecisionProvider') {}

export function wireRequest(config: ProviderConfig, request: DecisionRequest) {
  switch (config.provider) {
    case 'typesafe': return { url: 'https://api.typesafe.ai/v1/systemone', body: { ...request, model: 'jev-latest' }, headers: {} };
    case 'openrouter': return { url: 'https://openrouter.ai/api/alpha/decisions', body: { ...request, model: 'typesafe/jev-1.13' }, headers: { 'X-OpenRouter-Title': 'Feed Analysis' } };
    case 'cloudflare': return { url: `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai/run`, body: { model: 'typesafe/jev', input: request },
      headers: { 'cf-aig-collect-log': 'false', ...(config.gatewayId ? { 'cf-aig-gateway-id': config.gatewayId } : {}) } };
  }
}
export const validateSelection = Schema.decodeUnknownEffect(Schema.Struct({
  provider: Schema.Literals(['typesafe', 'openrouter', 'cloudflare']),
  accountId: Schema.String.check(Schema.isMaxLength(64)), gatewayId: Schema.String.check(Schema.isMaxLength(64)),
}));
export const validateResponse = Effect.fn('DecisionProvider.validate')(function*(raw: unknown, request: DecisionRequest, provider: ProviderId) {
  let value = raw;
  if (provider === 'cloudflare' && Predicate.isObject(value) && Predicate.hasProperty(value, 'result')) {
    if (Predicate.hasProperty(value, 'success') && value.success !== true) return yield* failure('PROVIDER', 'Cloudflare could not complete this evaluation.');
    value = value.result;
  }
  const decoded = yield* Schema.decodeUnknownEffect(Response)(value).pipe(Effect.mapError(() => failure('RESPONSE', 'The provider returned incomplete decisions. Your post stays visible.')));
  const ids = Object.keys(request.questions);
  if (Object.keys(decoded.answers).length !== ids.length) return yield* failure('RESPONSE', 'The provider returned unexpected answers.');
  for (const id of ids) {
    const answer = decoded.answers[id]; const question = request.questions[id];
    if (!answer || answer.type !== question.type) return yield* failure('RESPONSE', 'The provider returned a different answer type.');
    if (answer.type === 'choice') {
      const options = Object.keys(question.criteria || {});
      if (!options.includes(answer.choice) || options.length !== Object.keys(answer.probabilities).length ||
        !options.every(key => Object.hasOwn(answer.probabilities, key)) ||
        Math.abs(Object.values(answer.probabilities).reduce((a, b) => a + b, 0) - 1) > 0.03)
        return yield* failure('RESPONSE', 'The provider returned an invalid choice distribution.');
    }
  }
  return { ...decoded, provider };
});
const retrySchedule = Schedule.exponential('300 millis').pipe(
  Schedule.setInputType<DecisionError>(),
  Schedule.modifyDelay(({ input, duration }) => Effect.succeed(input.retryAfterMs > 0 ? Duration.millis(input.retryAfterMs) : duration)),
);
export const withPolicy = <A, R>(effect: Effect.Effect<A, DecisionError, R>) => effect.pipe(
  Effect.retry({ times: 1, schedule: retrySchedule, while: e => e.retryable }),
  Effect.timeout('18 seconds'), Effect.catchTag('TimeoutError', () => Effect.fail(failure('TIMEOUT', 'Analysis took too long. Your post stays visible; retry when ready.'))),
);
export const DecisionProviderLive = Layer.effect(DecisionProvider, Effect.gen(function*() {
  const http = yield* HttpClient.HttpClient;
  const credentials = yield* ProviderCredentials;
  const permits = yield* Semaphore.make(2);
  const evaluate = Effect.fn('DecisionProvider.evaluate')(function*(request: DecisionRequest) {
    const config = yield* credentials.get;
    if (!Redacted.value(config.apiKey).trim()) return yield* failure('NO_KEY', 'Add a key for the selected provider in Connection & privacy.');
    if (config.provider === 'cloudflare' && !/^[a-f0-9]{32}$/i.test(config.accountId)) return yield* failure('CONFIG', 'Enter your 32-character Cloudflare account ID.');
    if (config.gatewayId && !/^[a-zA-Z0-9_-]{1,64}$/.test(config.gatewayId)) return yield* failure('CONFIG', 'Use letters, numbers, underscores or hyphens for the gateway ID.');
    const wire = wireRequest(config, request);
    const attempt = Effect.gen(function*() {
      const response = yield* http.execute(HttpClientRequest.post(wire.url).pipe(
        HttpClientRequest.bearerToken(config.apiKey), HttpClientRequest.acceptJson,
        HttpClientRequest.setHeaders(wire.headers), HttpClientRequest.bodyJsonUnsafe(wire.body),
      )).pipe(Effect.mapError(() => failure('NETWORK', 'Cannot reach the selected provider. Check your connection and retry.', true)));
      if (response.status < 200 || response.status >= 300) {
        // Drain the body inside the request scope, without retaining provider errors or headers.
        yield* response.text.pipe(Effect.ignore);
        if (response.status === 401 || response.status === 403) return yield* failure('AUTH', 'The provider rejected this key. Check Connection & privacy.');
        if (response.status === 402) return yield* failure('CREDITS', 'The provider needs credits. Check your provider account.');
        const now = yield* DateTime.now;
        const header = response.headers['retry-after'];
        const seconds = Number(header);
        const delay = !header ? 0 : Number.isFinite(seconds) ? seconds * 1000 : Math.max(0, Date.parse(header) - DateTime.toEpochMillis(now));
        const wait = Number.isFinite(delay) ? Math.max(0, delay) : 0;
        if (response.status === 429) return yield* failure('RATE_LIMIT', 'The provider is rate limiting requests. Wait a minute and retry.', true, wait);
        return yield* failure('PROVIDER', 'The provider could not complete this evaluation. Your post stays visible.', response.status >= 500, wait);
      }
      const json = yield* response.json.pipe(Effect.mapError(() => failure('RESPONSE', 'The provider returned an unreadable response.')));
      return yield* validateResponse(json, request, config.provider);
    }).pipe(Effect.scoped);
    return yield* withPolicy(attempt);
  });
  return DecisionProvider.of({ evaluate: request => permits.withPermit(evaluate(request)) });
}));
export const BrowserTransportLive = BrowserHttpClient.layerFetch.pipe(Layer.provide(Layer.succeed(BrowserHttpClient.RequestInit, {
  credentials: 'omit', redirect: 'error', cache: 'no-store',
})));
