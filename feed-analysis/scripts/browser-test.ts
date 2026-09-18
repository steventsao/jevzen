import { checkExtension } from './extension-checks';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { SAMPLES } from '../src/samples';
import { DEFAULT_RULES, TOPICS } from '../src/core';

const root = resolve(import.meta.dirname, '..');
await mkdir(resolve(root, 'artifacts'), { recursive: true });
const extensionPath = resolve(root, 'dist');
const context = await chromium.launchPersistentContext('', {
  channel: 'chromium', headless: true, viewport: { width: 1440, height: 1050 },
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}),
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
});
const checks: string[] = [];
const errors: string[] = [];
context.on('page', page => page.on('pageerror', e => errors.push(e.message)));
try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  await worker.evaluate(({ samples, topics }) => {
    const w = globalThis as any; w.originalFetch = globalThis.fetch; w.calls = 0; w.mode = 'fixture';
    globalThis.fetch = async (input, init) => {
      if (w.mode === 'live') return w.originalFetch(input, init);
      w.calls++;
      if (w.mode === 'unauthorized') return Response.json({ secret: 'NEVER DISPLAY THIS' }, { status: 401 });
      const body = JSON.parse(await new Response(init?.body).text()); const payload = body.input || body;
      if (payload.questions.story) {
        if (w.holdStory) {
          w.storyStarted = true;
          w.storyStart();
          await new Promise<void>((_resolve, reject) => {
            if (init?.signal?.aborted) { w.storyAborted = true; reject(new DOMException('Cancelled', 'AbortError')); }
            else init?.signal?.addEventListener('abort', () => { w.storyAborted = true; reject(new DOMException('Cancelled', 'AbortError')); }, { once: true });
          });
        }
        const keys = Object.keys(payload.questions.story.criteria);
        const match = payload.state.post.includes('Another look') ? 'story_0' : 'new_story';
        return Response.json({ model: 'fixture-jev', answers: { story: { type: 'choice', choice: match, confidence: 1, probabilities: Object.fromEntries(keys.map(k => [k, k === match ? 1 : 0])) } }, usage: { input_tokens: 100, output_tokens: 20 } });
      }
      if (w.holdRules && payload.state.readerRules === w.holdRules) {
        w.analysisStart();
        await new Promise<void>((_resolve, reject) => {
          if (init?.signal?.aborted) { w.analysisAborted = true; reject(new DOMException('Cancelled', 'AbortError')); }
          else init?.signal?.addEventListener('abort', () => { w.analysisAborted = true; reject(new DOMException('Cancelled', 'AbortError')); }, { once: true });
        });
      }
      const index = samples.findIndex(p => p.text === payload.state.post);
      const rage = index === 1 ? .98 : index === 2 ? .43 : String(payload.state.post).startsWith('Moderate fixture:') ? .72 : .03;
      const hype = index === 2 ? .99 : .03;
      const topic = index === 4 ? 'life' : index === 5 ? 'politics' : 'technology';
      const turnDown = payload.state.readerRules.startsWith('Turn down running updates.') ? (index === 4 ? .99 : .02) : Math.max(rage, hype);
      const result = { model: 'fixture-jev', answers: { turnDown: { type: 'noul', noul: turnDown }, topic: { type: 'choice', choice: topic, confidence: 1, probabilities: Object.fromEntries(topics.map(k => [k, k === topic ? 1 : 0])) } }, usage: { input_tokens: 100, output_tokens: 50 } };
      return Response.json(body.input ? { success: true, result } : result);
    };
  }, { samples: SAMPLES, topics: Object.keys(TOPICS) });
  const lab = await checkExtension(context, worker, id, root, checks);
  if (process.env.TYPESAFE_API_KEY) {
    await worker.evaluate(key => { (globalThis as any).mode = 'live'; return chrome.storage.local.set({ credentials: { typesafe: key }, provider: { provider: 'typesafe', accountId: '', gatewayId: '' } }); }, process.env.TYPESAFE_API_KEY);
    const result = await lab.evaluate(async () => chrome.runtime.sendMessage({ type: 'analyze', text: 'Live extension check: a measured software update with documented limitations.' }));
    assert.equal(result.ok, true); assert.equal(result.analysis.provider, 'typesafe');
    console.log(JSON.stringify({ liveExtension: { model: result.analysis.model, turnDown: result.analysis.turnDown } }));
    checks.push('Live Jev call succeeds from the installed extension service worker');
  }
  await worker.evaluate(() => chrome.storage.local.clear());
  assert.deepEqual(errors, []);
  await writeFile(resolve(root, 'artifacts/browser-results.json'), JSON.stringify({ at: new Date().toISOString(), checks, errors, fixture: 'Synthetic X DOM; not an authenticated live X timeline' }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, checks, errors }, null, 2));
} catch (error) {
  for (const page of context.pages()) if (page.url().startsWith('chrome-extension:')) console.log(await page.locator('body').innerText());
  console.log(JSON.stringify({ errors })); throw error;
} finally { await context.close(); }
