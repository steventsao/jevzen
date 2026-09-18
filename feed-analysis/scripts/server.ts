import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { Redacted } from 'effect';
import { FeedAnalysis } from '../src/feed-service';
import { cleanRules, DEFAULT_SETTINGS, FeedError, normalizeSettings, RUBRIC_VERSION, safeError } from '../src/core';
import type { Analysis } from '../src/core';
import { createRuntime, environmentConfig } from './runtime';

const runtime = createRuntime();
const config = environmentConfig();
const port = Number(process.env.PORT || 4318);
const origin = `http://127.0.0.1:${port}`;
let settings = DEFAULT_SETTINGS;
const settingsPath = resolve(import.meta.dirname, '..', '.local-settings.json');
try { settings = normalizeSettings(JSON.parse(await readFile(settingsPath, 'utf8'))); }
catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Cannot read local feed settings. Check .local-settings.json.'); }
let generation = 0;
let mutations = Promise.resolve();
const active = new Set<AbortController>();
const invalidate = () => { generation++; for (const c of active) c.abort(); active.clear(); cache.clear(); pending.clear(); };
const cache = new Map<string, Analysis>();
const pending = new Map<string, Promise<Analysis>>();
const files: Record<string, [string, string]> = {
  '/': ['lab.html', 'text/html'], '/lab.html': ['lab.html', 'text/html'],
  '/ui.js': ['ui.js', 'text/javascript'], '/ui.css': ['ui.css', 'text/css'],
};
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'");
  if (req.headers.host !== `127.0.0.1:${port}` || (req.headers.origin && req.headers.origin !== origin)) { res.writeHead(403).end('Forbidden origin'); return; }
  const controller = new AbortController(); res.on('close', () => { if (!res.writableEnded) controller.abort(); });
  const json = (value: unknown, status = 200) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); };
  try {
    if (req.url === '/api' && req.method === 'POST') {
      if (!req.headers['content-type']?.startsWith('application/json')) { json({ ok: false }, 415); return; }
      let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 220000) { json({ ok: false, error: { message: 'Request is too large.' } }, 413); return; } }
      const message = JSON.parse(body);
      const publicState = () => ({ settings, provider: { provider: config.provider, accountId: config.accountId, gatewayId: config.gatewayId }, configured: Boolean(Redacted.value(config.apiKey)), configuredProviders: [config.provider], local: true });
      if (message.type === 'state') { json({ ok: true, ...publicState() }); return; }
      if (message.type === 'saveSettings' || message.type === 'applyRules') {
        const rules = message.type === 'applyRules' ? cleanRules(message.rules) : undefined;
        const update = mutations.then(async () => {
          const next = rules === undefined ? normalizeSettings({ ...settings, ...message.settings, rules: settings.rules }) : { ...settings, rules };
          await writeFile(settingsPath, JSON.stringify(next, null, 2));
          settings = next;
          if (rules !== undefined || !settings.enabled) invalidate();
        });
        mutations = update.then(() => {}, () => {}); await update;
        json({ ok: true, ...publicState() }); return;
      }
      if (message.type === 'clearCache') { invalidate(); json({ ok: true }); return; }
      if (message.type === 'analyze') {
        if (typeof message.text !== 'string' || !message.text.trim() || message.text.length > 8000) { json({ ok: false, error: { message: 'Use between 1 and 8,000 characters.' } }, 400); return; }
        const epoch = generation; const rules = settings.rules;
        if (message.rules !== undefined && message.rules !== rules) throw new FeedError('SUPERSEDED', 'The rules changed. Reload to use the latest applied rules.');
        const hash = createHash('sha256').update(JSON.stringify([RUBRIC_VERSION, rules, message.text])).digest('hex');
        if (!cache.has(hash)) {
          if (pending.size > 40) { json({ ok: false, error: { message: 'Too many pending requests.' } }, 429); return; }
          if (!pending.has(hash)) { active.add(controller); pending.set(hash, runtime.runPromise(FeedAnalysis.use(s => s.analyze(message.text, rules)), { signal: controller.signal })); }
          const job = pending.get(hash)!;
          try {
            const result = await job;
            if (epoch !== generation) throw new FeedError('SUPERSEDED', 'The rules changed. Retry this post.');
            cache.set(hash, result); if (cache.size > 256) cache.delete(cache.keys().next().value!);
          } finally { active.delete(controller); if (pending.get(hash) === job) pending.delete(hash); }
        }
        json({ ok: true, analysis: cache.get(hash) }); return;
      }
      if (message.type === 'cluster') {
        active.add(controller);
        try { json({ ok: true, stories: await runtime.runPromise(FeedAnalysis.use(s => s.cluster(message.posts)), { signal: controller.signal }) }); }
        finally { active.delete(controller); }
        return;
      }
      json({ ok: false, error: { message: 'This local lab reads provider credentials from .env. Configure BYOK in the extension.' } }, 400); return;
    }
    if (req.method !== 'GET') { res.writeHead(405).end(); return; }
    const file = files[(req.url || '/').split('?')[0]];
    if (!file) { res.writeHead(404).end('Not found'); return; }
    const content = await readFile(resolve(import.meta.dirname, '..', 'dev-dist', file[0]));
    res.writeHead(200, { 'content-type': `${file[1]}; charset=utf-8` }); res.end(content);
  } catch (error) { if (!res.headersSent) json({ ok: false, error: safeError(error) }, 400); }
});
server.listen(port, '127.0.0.1', () => console.log(`Feed Analysis is ready at ${origin} (provider: ${config.provider}; key ${Redacted.value(config.apiKey) ? 'configured' : 'missing'})`));
const shutdown = () => { server.close(); void runtime.dispose().then(() => process.exit(0)); };
process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
