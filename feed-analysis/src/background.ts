import { Effect, Layer, ManagedRuntime, Redacted } from 'effect';
import { cleanRules, cleanText, FeedError, isFeedUrl, normalizeSettings, RUBRIC_VERSION, safeError } from './core';
import type { Analysis, Settings } from './core';
import { ChromeStore, ChromeStoreLive } from './chrome-store';
import { BrowserTransportLive, DEFAULT_PROVIDER, DecisionProviderLive, failure, ProviderCredentials, validateSelection } from './providers';
import { FeedAnalysis, FeedAnalysisLive } from './feed-service';
import type { ProviderId, ProviderSelection } from './providers';

const CredentialsLive = Layer.effect(ProviderCredentials, Effect.gen(function*() {
  const store = yield* ChromeStore;
  return ProviderCredentials.of({ get: Effect.gen(function*() {
    const saved = yield* store.get('local', ['provider', 'credentials']);
    const selected = (saved.provider || DEFAULT_PROVIDER) as ProviderSelection;
    return { ...selected, apiKey: Redacted.make(saved.credentials?.[selected.provider] || '') };
  }) });
})).pipe(Layer.provide(ChromeStoreLive));
const services = FeedAnalysisLive.pipe(Layer.provide(DecisionProviderLive), Layer.provide(CredentialsLive), Layer.provide(BrowserTransportLive));
const runtime = ManagedRuntime.make(Layer.merge(services, ChromeStoreLive));
const store = {
  get: (area: 'local' | 'session', keys: string | string[]) => runtime.runPromise(ChromeStore.use(s => s.get(area, keys))),
  set: (area: 'local' | 'session', values: Record<string, unknown>) => runtime.runPromise(ChromeStore.use(s => s.set(area, values))),
  remove: (area: 'local' | 'session', keys: string | string[]) => runtime.runPromise(ChromeStore.use(s => s.remove(area, keys))),
};
type CacheEntry = { at: number; result: Analysis };
const pending = new Map<string, Promise<Analysis>>();
const controllers = new Map<string, AbortController>();
const cached = store.get('session', 'cache').then(s => (s.cache || {}) as Record<string, CacheEntry>);
let blockedUntil = 0;
let generation = 0;
let writeChain = Promise.resolve();
let mutations = Promise.resolve();
const extensionUrl = chrome.runtime.getURL('');
async function state() {
  const saved = await store.get('local', ['settings', 'provider', 'credentials']);
  const provider = (saved.provider || DEFAULT_PROVIDER) as ProviderSelection;
  return { settings: normalizeSettings(saved.settings), provider, configured: Boolean(saved.credentials?.[provider.provider]),
    configuredProviders: Object.keys(saved.credentials || {}), local: false };
}
async function clearCache() {
  generation++;
  for (const controller of controllers.values()) controller.abort();
  controllers.clear(); pending.clear();
  const cache = await cached; for (const key of Object.keys(cache)) delete cache[key];
  await writeChain; await store.remove('session', 'cache');
}
async function analyze(text: string, fromFeed: boolean, requestedRules?: unknown) {
  cleanText(text);
  const epoch = generation;
  const current = await state();
  if (epoch !== generation || (requestedRules !== undefined && requestedRules !== current.settings.rules)) throw new FeedError('SUPERSEDED', 'The rules changed. Retry with the applied rules.');
  if (fromFeed && !current.settings.enabled) throw new FeedError('PAUSED', 'Feed analysis is paused.');
  if (!current.configured) throw new FeedError('NO_KEY', 'Add a key for the selected provider in Connection & privacy.');
  const key = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([RUBRIC_VERSION, current.provider, current.settings.rules, text]))))).map(x => x.toString(16).padStart(2, '0')).join('');
  const cache = await cached;
  if (epoch !== generation) throw new FeedError('SUPERSEDED', 'The rules or connection changed. Retry this post.');
  if (cache[key] && Date.now() - cache[key].at < 86400000) return cache[key].result;
  if (pending.has(key)) return pending.get(key)!;
  if (pending.size >= 40) throw new FeedError('BUSY', 'The analysis queue is full. Retry after the current posts finish.');
  if (Date.now() < blockedUntil) throw new FeedError('COOLDOWN', 'Analysis is taking a short break after an API error. Retry in a minute.');
  const job = (async () => {
    const controller = new AbortController(); controllers.set(key, controller);
    try {
      const result = await runtime.runPromise(FeedAnalysis.use(s => s.analyze(text, current.settings.rules)), { signal: controller.signal });
      if (epoch !== generation) throw new FeedError('SUPERSEDED', 'The rules or connection changed. Retry this post.');
      if (epoch === generation && result.provider === current.provider.provider) {
        cache[key] = { at: Date.now(), result };
        for (const [old] of Object.entries(cache).sort((a, b) => b[1].at - a[1].at).slice(256)) delete cache[old];
        writeChain = writeChain.then(() => store.set('session', { cache })).catch(() => {});
      }
      return result;
    } catch (error) {
      if (controller.signal.aborted) throw new FeedError('CANCELLED', 'Analysis was cancelled.');
      if (['RATE_LIMIT', 'AUTH', 'PROVIDER', 'NETWORK'].includes(safeError(error).code)) blockedUntil = Date.now() + 60000;
      throw error;
    } finally { if (controllers.get(key) === controller) controllers.delete(key); }
  })();
  pending.set(key, job);
  try { return await job; } finally { if (pending.get(key) === job) pending.delete(key); }
}
async function cluster(posts: unknown) {
  const epoch = generation;
  const key = `cluster:${crypto.randomUUID()}`;
  const controller = new AbortController(); controllers.set(key, controller);
  try {
    const stories = await runtime.runPromise(FeedAnalysis.use(s => s.cluster(posts)), { signal: controller.signal });
    if (epoch !== generation) throw new FeedError('SUPERSEDED', 'The provider changed. Group the posts again with the new connection.');
    return stories;
  } catch (error) {
    if (controller.signal.aborted) throw new FeedError('CANCELLED', 'Story grouping was cancelled.');
    throw error;
  } finally { controllers.delete(key); }
}
async function broadcast(settings: Settings, configured: boolean, reset = false, rulesApplied = false) {
  const tabs = await chrome.tabs.query({});
  const message = { type: 'stateChanged', settings, configured, reset, rulesApplied };
  await Promise.all([...tabs.map(tab => tab.id ? chrome.tabs.sendMessage(tab.id, message).catch(() => {}) : undefined), chrome.runtime.sendMessage(message).catch(() => {})]);
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return false;
  const trusted = Boolean(sender.url?.startsWith(extensionUrl));
  const fromFeed = !trusted && Boolean(sender.url && isFeedUrl(sender.url)) && sender.frameId === 0;
  if (!trusted && !fromFeed) { respond({ ok: false, error: { code: 'SENDER', message: 'This page cannot use jevzen.' } }); return false; }
  (async () => {
    if (message.type === 'state') return state();
    if (message.type === 'analyze') return { analysis: await analyze(cleanText(message.text), fromFeed, message.rules) };
    if (!trusted) throw new FeedError('SENDER', 'Use the extension controls for this action.');
    if (message.type === 'saveSettings') {
      const update = mutations.then(async () => {
        const before = await state(); const settings = normalizeSettings({ ...before.settings, ...message.settings, rules: before.settings.rules });
        if (!settings.enabled) for (const controller of controllers.values()) controller.abort();
        await store.set('local', { settings }); await broadcast(settings, before.configured); return { ...before, settings };
      });
      mutations = update.then(() => {}, () => {}); return update;
    }
    if (message.type === 'applyRules') {
      const rules = cleanRules(message.rules);
      const update = mutations.then(async () => {
        const before = await state(); const settings = { ...before.settings, rules };
        await store.set('local', { settings }); await clearCache(); blockedUntil = 0;
        await broadcast(settings, before.configured, true, true);
        return { ...before, settings };
      });
      mutations = update.then(() => {}, () => {}); return update;
    }
    if (message.type === 'saveProvider') {
      const provider = await runtime.runPromise(validateSelection(message.provider).pipe(Effect.mapError(() => failure('CONFIG', 'Choose a supported provider and valid account details.'))));
      if (provider.provider === 'cloudflare' && !/^[a-f0-9]{32}$/i.test(provider.accountId)) throw new FeedError('CONFIG', 'Enter your 32-character Cloudflare account ID.');
      if (provider.gatewayId && !/^[a-zA-Z0-9_-]{1,64}$/.test(provider.gatewayId)) throw new FeedError('CONFIG', 'Use letters, numbers, underscores or hyphens for the gateway ID.');
      const saved = await store.get('local', 'credentials'); const credentials = saved.credentials || {};
      if (typeof message.key === 'string' && message.key.trim()) {
        if (message.key.trim().length < 8 || message.key.length > 512) throw new FeedError('KEY', 'Enter a valid provider API key.');
        credentials[provider.provider] = message.key.trim();
      }
      if (!credentials[provider.provider]) throw new FeedError('KEY', 'Enter a key for this provider.');
      await store.set('local', { provider, credentials }); blockedUntil = 0; await clearCache();
      const s = await state(); await broadcast(s.settings, s.configured, true); return s;
    }
    if (message.type === 'forgetKey') {
      const saved = await store.get('local', ['provider', 'credentials']); const credentials = saved.credentials || {};
      delete credentials[(saved.provider || DEFAULT_PROVIDER).provider as ProviderId];
      await store.set('local', { credentials }); await clearCache();
      const s = await state(); await broadcast(s.settings, s.configured, true); return s;
    }
    if (message.type === 'clearCache') { await clearCache(); return {}; }
    if (message.type === 'cluster') return { stories: await cluster(message.posts) };
    throw new FeedError('INPUT', 'Unknown action. Reload the extension.');
  })().then(data => respond({ ok: true, ...data }), error => respond({ ok: false, error: safeError(error) }));
  return true;
});
