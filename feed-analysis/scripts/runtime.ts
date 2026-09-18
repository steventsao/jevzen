import { Effect, Layer, ManagedRuntime, Redacted } from 'effect';
import { FeedAnalysisLive } from '../src/feed-service';
import { BrowserTransportLive, DEFAULT_PROVIDER, DecisionProviderLive, ProviderCredentials } from '../src/providers';
import type { ProviderId } from '../src/providers';

export function environmentConfig() {
  const provider = (process.env.FEED_PROVIDER || 'typesafe') as ProviderId;
  if (!['typesafe', 'openrouter', 'cloudflare'].includes(provider)) throw new Error('FEED_PROVIDER must be typesafe, openrouter, or cloudflare.');
  return { ...DEFAULT_PROVIDER, provider, accountId: process.env.CLOUDFLARE_ACCOUNT_ID || '', gatewayId: process.env.CLOUDFLARE_GATEWAY_ID || '',
    apiKey: Redacted.make((provider === 'typesafe' ? process.env.TYPESAFE_API_KEY : provider === 'openrouter' ? process.env.OPENROUTER_API_KEY : process.env.CLOUDFLARE_API_TOKEN) || '') };
}
export function createRuntime() {
  const config = environmentConfig();
  return ManagedRuntime.make(FeedAnalysisLive.pipe(
    Layer.provide(DecisionProviderLive),
    Layer.provide(Layer.succeed(ProviderCredentials, { get: Effect.succeed(config) })),
    Layer.provide(BrowserTransportLive),
  ));
}
