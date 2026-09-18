import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import type { BrowserContext, Worker, Page } from 'playwright';
import { DEFAULT_RULES } from '../src/core';

export async function checkReplacements(context: BrowserContext, worker: Worker, popup: Page, root: string, checks: string[]) {
  await popup.evaluate(async rules => {
    await chrome.runtime.sendMessage({ type: 'saveSettings', settings: { enabled: false, collapse: true, photoTheme: 'zen' } });
    await chrome.runtime.sendMessage({ type: 'applyRules', rules });
  }, DEFAULT_RULES);
  await worker.evaluate(() => { (globalThis as any).analyzedTexts = []; });
  const feed = await context.newPage(); await feed.setViewportSize({ width: 900, height: 850 });
  await feed.goto('https://x.com/home');
  await feed.evaluate(() => {
    document.getElementById('feed')!.innerHTML = `<div data-testid="cellInnerDiv"><article data-testid="tweet" id="first"><div style="min-height:240px"><p data-testid="tweetText">Switch fixture: first matching post.</p><a href="/example/status/101">Original post</a></div></article></div><div id="neighbor" style="height:1000px">A kept post stays in exactly the same place.</div><div data-testid="cellInnerDiv"><article data-testid="tweet" id="later"><div style="min-height:280px"><p data-testid="tweetText">Switch fixture: later matching post.</p><a href="/example/status/102">Original post</a></div></article></div><div style="height:1000px"></div>`;
  });
  await feed.waitForFunction(() => document.querySelector('#later')?.getAttribute('data-fa-status') === 'waiting');
  const geometry = () => feed.evaluate(() => ({
    height: document.getElementById('first')!.getBoundingClientRect().height,
    nextTop: document.getElementById('neighbor')!.getBoundingClientRect().top + scrollY,
    scrollHeight: document.documentElement.scrollHeight,
  }));
  const before = await geometry();
  const setting = async (settings: object) => { await popup.evaluate(settings => chrome.runtime.sendMessage({ type: 'saveSettings', settings }), settings); };
  await setting({ enabled: true });
  await feed.waitForFunction(() => document.querySelector('#first')?.getAttribute('data-fa-replaced') === 'true');
  assert.deepEqual(await geometry(), before);
  assert.equal(await feed.locator('#first > div').isVisible(), false);
  assert.equal(await feed.locator('#first > div').evaluate((e: HTMLElement) => e.inert), true);
  assert.deepEqual(await worker.evaluate(() => (globalThis as any).analyzedTexts), ['Switch fixture: first matching post.']);
  await feed.waitForFunction(() => { const img = document.querySelector('feed-analysis-card')?.shadowRoot?.querySelector('img'); return img?.complete && img.naturalWidth > 0; });
  assert.equal(await feed.locator('feed-analysis-controls').count(), 0);
  await feed.screenshot({ path: resolve(root, 'artifacts/replacement-zen.png') });
  checks.push('Visible posts crossfade to bundled photos with identical post height, neighbor position and scroll height; offscreen posts make no calls');

  const calls = await worker.evaluate(() => (globalThis as any).calls);
  await popup.locator('#photo-theme').selectOption('cats');
  await feed.waitForFunction(() => document.querySelector('feed-analysis-card')?.shadowRoot?.querySelector('img')?.src.includes('/cat-'));
  await feed.waitForFunction(() => { const img = document.querySelector('feed-analysis-card')?.shadowRoot?.querySelector('img'); return img?.complete && img.naturalWidth > 0; });
  assert.deepEqual(await geometry(), before);
  assert.equal(await worker.evaluate(() => (globalThis as any).calls), calls);
  const photo = await feed.locator('feed-analysis-card img').getAttribute('src');
  await feed.getByRole('button', { name: 'Next photo' }).click();
  assert.notEqual(await feed.locator('feed-analysis-card img').getAttribute('src'), photo);
  await feed.locator('feed-analysis-card img').evaluate((img: HTMLImageElement) => img.decode());
  await feed.screenshot({ path: resolve(root, 'artifacts/replacement-cats.png') });
  await feed.getByRole('button', { name: 'Show original', exact: true }).click();
  assert.equal(await feed.locator('#first > div').isVisible(), true);
  assert.equal(await feed.locator('#first > div').evaluate((e: HTMLElement) => e.inert), false);
  assert.deepEqual(await geometry(), before);
  checks.push('Theme selection and next photo use no model calls; Show original restores visibility and keyboard access at the same height');

  await feed.locator('#later').scrollIntoViewIfNeeded();
  await feed.waitForFunction(() => document.querySelector('#later')?.getAttribute('data-fa-replaced') === 'true');
  assert.equal(await worker.evaluate(() => (globalThis as any).analyzedTexts.length), 2);
  const laterHeight = await feed.locator('#later').evaluate(e => e.getBoundingClientRect().height);
  await feed.evaluate(() => { const media = document.createElement('div'); media.style.height = '180px'; document.querySelector('#later')!.append(media); });
  await feed.waitForFunction(height => document.querySelector('#later')!.getBoundingClientRect().height === height + 180 && document.querySelector('#later feed-analysis-card')!.getBoundingClientRect().height === (document.querySelector('#later') as HTMLElement).clientHeight, laterHeight);
  await feed.evaluate(() => { document.querySelector('#later [data-testid="tweetText"]')!.textContent = 'A useful replacement post in a recycled X node.'; });
  await feed.waitForFunction(() => document.querySelector('#later')?.getAttribute('data-fa-score') === '0.03');
  assert.equal(await feed.locator('#later feed-analysis-card').count(), 0);
  assert.equal(await feed.locator('#later > div').first().isVisible(), true);
  checks.push('Scrolling checks the next post, late media keeps its natural height, and X node reuse restores a different post');

  await worker.evaluate(() => { (globalThis as any).waitPost = 'Switch fixture: delayed stale result.'; (globalThis as any).releasePost = undefined; (globalThis as any).postReady = new Promise<void>(resolve => { (globalThis as any).postStarted = resolve; }); });
  await feed.evaluate(() => { document.querySelector('#later [data-testid="tweetText"]')!.textContent = 'Switch fixture: delayed stale result.'; });
  await worker.evaluate(() => Promise.race([(globalThis as any).postReady, new Promise((_, reject) => setTimeout(() => reject(new Error('Delayed request did not start')), 5000))]));
  await feed.evaluate(() => { document.querySelector('#later [data-testid="tweetText"]')!.textContent = 'Another useful post after node recycling.'; });
  await worker.evaluate(() => { (globalThis as any).releasePost(); (globalThis as any).waitPost = ''; });
  await feed.waitForFunction(() => document.querySelector('#later')?.getAttribute('data-fa-score') === '0.03');
  assert.equal(await feed.locator('#later feed-analysis-card').count(), 0);
  checks.push('A late verdict cannot cover a recycled post with different text');

  await feed.emulateMedia({ reducedMotion: 'reduce' });
  await feed.evaluate(() => { document.querySelector('#later [data-testid="tweetText"]')!.textContent = 'Switch fixture: reduced motion.'; });
  await feed.waitForFunction(() => document.querySelector('#later')?.getAttribute('data-fa-replaced') === 'true');
  assert.equal(await feed.locator('feed-analysis-card').evaluate(e => e.getAnimations().length), 0);
  await setting({ enabled: false });
  await feed.waitForFunction(() => !document.querySelector('feed-analysis-card'));
  assert.equal(await feed.locator('#later > div').first().isVisible(), true);
  checks.push('Reduced motion skips transitions, and pause restores originals');
  await feed.emulateMedia({ reducedMotion: 'no-preference' });
  await setting({ enabled: true });
  await feed.waitForFunction(() => document.querySelector('#later')?.getAttribute('data-fa-replaced') === 'switching');
  await feed.locator('feed-analysis-card').evaluate(e => e.getAnimations().forEach(a => a.pause()));
  await setting({ enabled: false });
  await feed.waitForFunction(() => !document.querySelector('feed-analysis-card'));
  await feed.waitForTimeout(800);
  assert.equal(await feed.locator('feed-analysis-card').count(), 0);
  assert.equal(await feed.locator('#later > div').first().isVisible(), true);
  checks.push('Pausing mid-transition cancels even a frozen animation and its fallback timer');
  await feed.close();
  await setting({ enabled: true, photoTheme: 'zen' });
}
