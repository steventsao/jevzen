import { DEFAULT_SETTINGS, isFeedUrl, TOPIC_LABELS, treatment } from './core';
import type { Analysis, Post, Settings, Topic } from './core';

let settings: Settings = DEFAULT_SETTINGS;
let configured = false;
let focusTopic: Topic | 'uncertain' | null = null;
let focusPostIds: string[] | null = null;
let analysisEpoch = 0;
let route = location.href;
let serial = 0;
type Entry = { article: HTMLElement; text: string; post: Post; analysis?: Analysis; revealed: boolean; host: HTMLElement; visible: boolean; running: boolean; retryAt: number };
const entries = new Map<HTMLElement, Entry>();
const rpc = (message: unknown) => chrome.runtime.sendMessage(message).catch(() => ({ ok: false, error: { message: 'Reload this tab to reconnect Feed Analysis.' } }));
const overlayStyle = `:host{display:block!important;font:12px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:inherit;margin:8px 16px;position:relative;z-index:1} .row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 0;border-top:1px solid color-mix(in srgb,currentColor 16%,transparent)} .score{font-variant-numeric:tabular-nums} button{font:inherit;font-weight:600;color:inherit;background:transparent;border:1px solid color-mix(in srgb,currentColor 28%,transparent);border-radius:6px;padding:4px 9px;cursor:pointer} button:hover{background:color-mix(in srgb,currentColor 10%,transparent)} button:focus-visible{outline:2px solid #5379ed;outline-offset:3px}.label{flex:1;min-width:150px}.detail{margin-top:6px;max-width:62ch} .brand{font-weight:650}`;

function textOf(article: HTMLElement) {
  return Array.from(article.querySelectorAll<HTMLElement>('[data-testid="tweetText"]')).map(el => el.innerText || el.textContent || '').join('\n\nQuoted post:\n').trim();
}
function render(entry: Entry) {
  const { article, analysis, host } = entry;
  const active = settings.enabled && configured && isFeedUrl(location.href);
  const t = treatment(analysis, { ...settings, enabled: active }, entry.revealed);
  article.dataset.fa = active ? 'on' : 'off';
  const topic = analysis && analysis.topicConfidence >= 0.5 ? analysis.topic : 'uncertain';
  const outsideGroup = analysis && ((focusTopic && topic !== focusTopic) || (focusPostIds && !focusPostIds.includes(entry.post.id)));
  article.dataset.faCollapsed = String(t.collapsed || Boolean(active && !entry.revealed && outsideGroup));
  article.style.setProperty('--fa-opacity', String(t.opacity));
  article.style.setProperty('--fa-saturation', String(t.saturation));
  host.hidden = !active;
  if (!active) return;
  const root = host.shadowRoot!;
  let row = root.querySelector('.row');
  if (!row) {
    const style = document.createElement('style'); style.textContent = overlayStyle;
    row = document.createElement('div'); row.className = 'row'; root.append(style, row);
  }
  row.replaceChildren();
  const label = document.createElement('span'); label.className = 'label score';
  if (analysis) label.textContent = `Turn down ${Math.round(analysis.turnDown * 100)}% · ${analysis.topicConfidence < 0.5 ? 'Topic uncertain' : TOPIC_LABELS[analysis.topic]}`;
  else label.textContent = entry.post.error || (entry.running ? 'Feed Analysis · Reading this post…' : 'Feed Analysis · Waiting');
  row.append(label);
  if (analysis) {
    const toggle = document.createElement('button'); toggle.textContent = entry.revealed ? 'Apply filter' : 'Show anyway';
    toggle.setAttribute('aria-expanded', String(entry.revealed || article.dataset.faCollapsed !== 'true'));
    toggle.onclick = e => { e.stopPropagation(); e.preventDefault(); entry.revealed = !entry.revealed; render(entry); };
    const why = document.createElement('button'); why.textContent = 'Why?';
    why.onclick = e => {
      e.stopPropagation(); e.preventDefault();
      const old = root.querySelector('.detail'); if (old) { old.remove(); return; }
      const p = document.createElement('p'); p.className = 'detail';
      p.textContent = `Jev estimates a ${Math.round(analysis.turnDown * 100)}% chance your applied rules call for turning down this post. Applied rules: ${analysis.rules}\n\nFade strength ${Math.round(settings.strength * 100)}%; collapse at ${Math.round(settings.threshold * 100)}%. Text only; images and linked pages are not analyzed. Model: ${analysis.model}. This is a model judgment.`;
      root.append(p);
    };
    row.append(toggle, why);
  } else if (entry.post.error) {
    const retry = document.createElement('button'); retry.textContent = 'Retry';
    retry.onclick = e => { e.stopPropagation(); entry.retryAt = 0; void analyze(entry); };
    row.append(retry);
  }
}
async function analyze(entry: Entry) {
  if (!settings.enabled || !configured || !entry.visible || entry.running || entry.analysis || Date.now() < entry.retryAt || !isFeedUrl(location.href)) return;
  entry.running = true; entry.post.error = undefined; render(entry);
  const currentText = entry.text;
  const epoch = analysisEpoch;
  const response = await rpc({ type: 'analyze', text: currentText, rules: settings.rules });
  if (entry.text !== currentText || !entry.article.isConnected || entries.get(entry.article) !== entry) return;
  entry.running = false;
  if (epoch !== analysisEpoch) { render(entry); if (settings.enabled && configured) void analyze(entry); return; }
  if (response.ok) { entry.analysis = response.analysis; entry.post.analysis = response.analysis; }
  else { entry.post.error = response.error?.message || 'Could not analyze. Retry later.'; entry.retryAt = Date.now() + 60000; }
  render(entry);
}
const observer = new IntersectionObserver(records => {
  for (const record of records) {
    const entry = entries.get(record.target as HTMLElement); if (!entry) continue;
    entry.visible = record.isIntersecting;
    if (entry.visible) void analyze(entry);
  }
}, { threshold: 0.05 });
function remove(entry: Entry) {
  observer.unobserve(entry.article); entry.host.remove();
  delete entry.article.dataset.fa; delete entry.article.dataset.faCollapsed;
  entry.article.style.removeProperty('--fa-opacity'); entry.article.style.removeProperty('--fa-saturation');
  entries.delete(entry.article);
}
function scan() {
  if (!isFeedUrl(location.href)) { if (entries.size) analysisEpoch++; for (const entry of entries.values()) remove(entry); return; }
  for (const entry of entries.values()) if (!entry.article.isConnected) remove(entry);
  for (const article of document.querySelectorAll<HTMLElement>('article[data-testid="tweet"]')) {
    const text = textOf(article);
    const before = entries.get(article);
    if (before?.text === text) { if (!before.host.isConnected) article.append(before.host); continue; }
    if (before) remove(before);
    if (!text || text.length > 8000) continue;
    const host = document.createElement('feed-analysis-controls'); host.attachShadow({ mode: 'open' }); article.append(host);
    const href = article.querySelector<HTMLAnchorElement>('a[href*="/status/"]')?.href;
    const entry: Entry = { article, text, post: { id: `post-${++serial}`, text, ...(href && isFeedUrl(href) ? { url: href } : {}) },
      revealed: false, host, visible: false, running: false, retryAt: 0 };
    entries.set(article, entry); observer.observe(article); render(entry);
  }
}
let scheduled = false;
new MutationObserver(records => {
  if (records.every(record => record.target instanceof Element && record.target.closest('feed-analysis-controls'))) return;
  if (!scheduled) { scheduled = true; setTimeout(() => { scheduled = false; scan(); }, 180); }
}).observe(document.body, { childList: true, subtree: true, characterData: true });
// X uses client-side navigation and recycles article nodes while scrolling.
setInterval(() => { if (route !== location.href) { route = location.href; focusTopic = null; focusPostIds = null; scan(); for (const e of entries.values()) render(e); } }, 600);
chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message.type === 'stateChanged') {
    if (message.reset || !message.settings.enabled || !message.configured) analysisEpoch++;
    settings = message.settings; configured = message.configured;
    if (message.reset) { focusTopic = null; focusPostIds = null; }
    for (const entry of entries.values()) { if (message.reset) { entry.analysis = undefined; entry.post.analysis = undefined; entry.post.error = undefined; entry.revealed = false; entry.retryAt = 0; entry.host.shadowRoot?.querySelector('.detail')?.remove(); } render(entry); if (entry.visible) void analyze(entry); }
    respond({ ok: true });
  }
  if (message.type === 'snapshot') respond({ supported: isFeedUrl(location.href), posts: Array.from(entries.values()).filter(e => e.article.isConnected).slice(0, 100).map(e => e.post), focusTopic, focusPostIds });
  if (message.type === 'focusTopic') { focusPostIds = null; focusTopic = message.topic === 'uncertain' || Object.hasOwn(TOPIC_LABELS, message.topic) ? message.topic : null; for (const entry of entries.values()) render(entry); respond({ ok: true }); }
  if (message.type === 'focusPosts') { focusTopic = null; focusPostIds = Array.isArray(message.ids) ? message.ids.filter((id: unknown) => typeof id === 'string').slice(0, 24) : null; for (const entry of entries.values()) render(entry); respond({ ok: true }); }
  return false;
});
void rpc({ type: 'state' }).then(response => { if (response.ok) { settings = response.settings; configured = response.configured; } scan(); });
