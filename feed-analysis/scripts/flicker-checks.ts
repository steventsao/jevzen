import assert from 'node:assert/strict';
import type { BrowserContext, Worker, Page } from 'playwright';

export async function checkFlicker(context: BrowserContext, worker: Worker, popup: Page, checks: string[]) {
  const feed = await context.newPage();
  await feed.goto('https://x.com/home');
  await feed.evaluate(() => {
    document.getElementById('feed')!.innerHTML = `<article data-testid="tweet" id="multiline"><div style="min-height:280px"><div data-testid="tweetText"><span>Switch fixture: a multiline post.</span><br><span>A second line with an emoji </span><img alt="🐈" src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="><div>A block paragraph.</div></div><aside><div data-testid="tweetText"><span>Quoted line one.</span><br><span>Quoted line two.</span></div></aside><a href="/example/status/1001">Original post</a></div></article>`;
    const article = document.getElementById('multiline')!;
    const w = globalThis as any;
    w.replacementStates = [];
    new MutationObserver(records => {
      for (const record of records) if (record.attributeName === 'data-fa-replaced') w.replacementStates.push(article.getAttribute('data-fa-replaced'));
    }).observe(article, { attributes: true });
  });
  await feed.waitForFunction(() => document.querySelector('#multiline')?.getAttribute('data-fa-replaced') === 'true');
  const originalCard = await feed.locator('feed-analysis-card').elementHandle();
  const calls = await worker.evaluate(() => (globalThis as any).calls);
  const expected = 'Switch fixture: a multiline post.\nA second line with an emoji 🐈\nA block paragraph.\n\nQuoted post:\nQuoted line one.\nQuoted line two.';
  const texts = await worker.evaluate(() => (globalThis as any).analyzedTexts as string[]);
  assert.equal(texts.at(-1), expected);
  // Mimic unrelated live timeline updates so scans repeatedly revisit the same post.
  await feed.evaluate(async () => {
    for (let i = 0; i < 8; i++) {
      const tick = document.createElement('span'); tick.textContent = String(i); document.body.append(tick);
      await new Promise(resolve => setTimeout(resolve, 160)); tick.remove();
    }
  });
  assert.equal(await feed.locator('#multiline').getAttribute('data-fa-replaced'), 'true');
  assert.equal(await originalCard!.evaluate(e => e.isConnected), true);
  assert.equal(await worker.evaluate(() => (globalThis as any).calls), calls);
  assert.deepEqual(await feed.evaluate(() => (globalThis as any).replacementStates), ['switching', 'true']);
  checks.push('Multiline text, paragraphs, emoji and quotes stay stable after hiding; repeated timeline scans never reveal or recreate the photo');

  await feed.getByRole('button', { name: 'Show original', exact: true }).click();
  await feed.evaluate(() => { document.body.append(document.createElement('div')); });
  await feed.waitForTimeout(300);
  assert.equal(await feed.locator('feed-analysis-card').count(), 0);
  assert.equal(await feed.locator('#multiline > div').isVisible(), true);
  assert.equal(await worker.evaluate(() => (globalThis as any).calls), calls);
  await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'saveSettings', settings: { enabled: false } }));
  await feed.close();
  await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'saveSettings', settings: { enabled: true } }));
  checks.push('Show original on a multiline post remains revealed through subsequent rescans');
}
