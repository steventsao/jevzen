import { Context, Effect, Layer } from 'effect';
import { failure, type DecisionError } from './providers';
type Area = 'local' | 'session';
export class ChromeStore extends Context.Service<ChromeStore, {
  readonly get: (area: Area, keys: string | string[]) => Effect.Effect<Record<string, any>, DecisionError>;
  readonly set: (area: Area, values: Record<string, unknown>) => Effect.Effect<void, DecisionError>;
  readonly remove: (area: Area, keys: string | string[]) => Effect.Effect<void, DecisionError>;
}>()('feed/ChromeStore') {}
const storageError = () => failure('STORAGE', 'Browser storage is unavailable. Reload the extension and try again.');
export const ChromeStoreLive = Layer.effect(ChromeStore, Effect.gen(function*() {
  yield* Effect.tryPromise({ try: () => Promise.all([
    chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
    chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
  ]), catch: storageError });
  return ChromeStore.of({
    get: Effect.fn('ChromeStore.get')((area: Area, keys: string | string[]) => Effect.tryPromise({ try: () => chrome.storage[area].get(keys), catch: storageError })),
    set: Effect.fn('ChromeStore.set')((area: Area, values: Record<string, unknown>) => Effect.tryPromise({ try: () => chrome.storage[area].set(values), catch: storageError })),
    remove: Effect.fn('ChromeStore.remove')((area: Area, keys: string | string[]) => Effect.tryPromise({ try: () => chrome.storage[area].remove(keys), catch: storageError })),
  });
}));
