import { DEFAULT_SETTINGS, isFeedUrl, TOPIC_LABELS, treatment } from './core';
import type { Analysis, Post, Settings, Topic } from './core';
import { Replacement } from './replacement';
import { textOf } from './post-text';

let settings: Settings = DEFAULT_SETTINGS;
let configured = false;
let focusTopic: Topic | 'uncertain' | null = null;
let focusPostIds: string[] | null = null;
let analysisEpoch = 0;
let route = location.href;
let serial = 0;
let running = 0;
type Entry = { article: HTMLElement; text: string; url?: string; post: Post; analysis?: Analysis; revealed: boolean; visible: boolean; visibleSince: number; running: boolean; retryAt: number; replacement: Replacement };
const entries = new Map<HTMLElement, Entry>();
const undo: Entry[] = [];
const rpc = (message: unknown) => chrome.runtime.sendMessage(message).catch(() => ({ ok: false, error: { message: 'Reload this tab to reconnect jevzen.' } }));
const active = () => settings.enabled && configured && isFeedUrl(location.href);
const urlOf = (article: HTMLElement) => article.querySelector<HTMLAnchorElement>('a[href*="/status/"]')?.href;
const current = (entry: Entry) => entry.article.isConnected && entries.get(entry.article) === entry && textOf(entry.article) === entry.text && urlOf(entry.article) === entry.url;
function inView(entry: Entry) {
  const r = entry.article.getBoundingClientRect();
  return !document.hidden && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
}
function shouldReplace(entry: Entry) {
  if (!active() || entry.revealed || !entry.analysis || entry.analysis.rules !== settings.rules) return false;
  const topic = entry.analysis.topicConfidence >= .5 ? entry.analysis.topic : 'uncertain';
  return treatment(entry.analysis, settings).collapsed || Boolean((focusTopic && topic !== focusTopic) || (focusPostIds && !focusPostIds.includes(entry.post.id)));
}

const notice = document.createElement('feed-analysis-notice');
const shadow = notice.attachShadow({ mode: 'open' });
shadow.innerHTML = `<style>:host{position:fixed;right:20px;bottom:20px;z-index:2147483647;font:13px/1.4 system-ui,sans-serif;color:#f8fafc} :host([hidden]){display:none} .bar{display:flex;align-items:center;gap:12px;padding:12px 16px;background:#17212b;border:1px solid #344353;border-radius:14px;box-shadow:0 8px 30px #0003;max-width:calc(100vw - 72px);flex-wrap:wrap}button{font:inherit;font-weight:600;color:#a7f3d0;border:0;background:none;padding:4px;cursor:pointer}button:focus-visible{outline:2px solid #a7f3d0;outline-offset:3px;border-radius:3px}</style><div class="bar"><span role="status" aria-live="polite"></span><button id="undo">Undo last</button><button id="show">Show all</button><button id="retry">Retry</button></div>`;
notice.hidden = true;
document.documentElement.append(notice);
function updateNotice() {
  const hidden = [...entries.values()].filter(e => e.replacement.shown).length;
  const failures = [...entries.values()].filter(e => e.post.error).length;
  notice.hidden = !active() || (!hidden && !failures);
  shadow.querySelector('span')!.textContent = [hidden ? `${hidden} ${hidden === 1 ? 'post' : 'posts'} switched` : '', failures ? `Couldn't check ${failures} ${failures === 1 ? 'post' : 'posts'}` : ''].filter(Boolean).join(' · ');
  (shadow.getElementById('undo') as HTMLButtonElement).hidden = !hidden;
  (shadow.getElementById('show') as HTMLButtonElement).hidden = !hidden;
  (shadow.getElementById('retry') as HTMLButtonElement).hidden = !failures;
}
function showAll() {
  for (const entry of entries.values()) { if (shouldReplace(entry)) entry.revealed = true; render(entry); }
  undo.length = 0; updateNotice();
}
shadow.getElementById('show')!.onclick = showAll;
shadow.getElementById('undo')!.onclick = () => {
  let entry: Entry | undefined;
  while ((entry = undo.pop())) {
    if (current(entry) && entry.replacement.shown) { entry.revealed = true; render(entry); break; }
  }
  updateNotice();
};
shadow.getElementById('retry')!.onclick = () => {
  for (const entry of entries.values()) { entry.retryAt = 0; entry.post.error = undefined; }
  updateNotice(); schedule();
};

function render(entry: Entry) {
  const { article } = entry;
  article.dataset.fa = active() ? 'on' : 'off';
  article.dataset.faStatus = entry.analysis ? 'scored' : entry.post.error ? 'error' : entry.running ? 'reading' : 'waiting';
  if (entry.analysis) article.dataset.faScore = String(entry.analysis.turnDown); else delete article.dataset.faScore;
  // In replacement mode, kept posts retain their original appearance.
  const t = treatment(entry.analysis, { ...settings, enabled: active() }, entry.revealed);
  article.style.setProperty('--fa-opacity', String(settings.collapse ? 1 : t.opacity));
  article.style.setProperty('--fa-saturation', String(settings.collapse ? 1 : t.saturation));
  if (!shouldReplace(entry)) entry.replacement.restore();
  else if (entry.replacement.shown || (inView(entry) && !article.contains(document.activeElement))) {
    entry.replacement.show(settings.photoTheme, () => current(entry) && shouldReplace(entry));
  }
}

let scheduled: ReturnType<typeof setTimeout> | undefined;
function schedule() {
  clearTimeout(scheduled);
  scheduled = setTimeout(pump, 140);
}
function pump() {
  if (!active()) return;
  for (const entry of entries.values()) {
    if (running >= 2) break;
    if (!entry.visible || !inView(entry) || !current(entry) || entry.running || entry.analysis || Date.now() < entry.retryAt) continue;
    if (Date.now() - entry.visibleSince < 120) { schedule(); continue; }
    void analyze(entry);
  }
}
async function analyze(entry: Entry) {
  entry.running = true; entry.post.error = undefined; running++; render(entry);
  const epoch = analysisEpoch;
  try {
    const response = await rpc({ type: 'analyze', text: entry.text, rules: settings.rules });
    if (!current(entry) || epoch !== analysisEpoch) return;
    if (response.ok) { entry.analysis = response.analysis; entry.post.analysis = response.analysis; }
    else { entry.post.error = response.error?.message || 'Could not analyze. Retry later.'; entry.retryAt = Date.now() + 60000; }
  } finally {
    entry.running = false; running--;
    if (current(entry)) render(entry);
    updateNotice(); schedule();
  }
}
const observer = new IntersectionObserver(records => {
  for (const record of records) {
    const entry = entries.get(record.target as HTMLElement); if (!entry) continue;
    const visible = record.isIntersecting && record.intersectionRect.height > 0;
    if (visible && !entry.visible) entry.visibleSince = Date.now();
    entry.visible = visible;
    if (visible) render(entry);
  }
  schedule();
}, { threshold: 0 });
function remove(entry: Entry) {
  observer.unobserve(entry.article); entry.replacement.restore();
  for (let i = undo.length - 1; i >= 0; i--) if (undo[i] === entry) undo.splice(i, 1);
  delete entry.article.dataset.fa; delete entry.article.dataset.faStatus; delete entry.article.dataset.faScore;
  entry.article.style.removeProperty('--fa-opacity'); entry.article.style.removeProperty('--fa-saturation');
  entries.delete(entry.article);
}
function scan() {
  if (!isFeedUrl(location.href)) { if (entries.size) analysisEpoch++; for (const entry of entries.values()) remove(entry); updateNotice(); return; }
  for (const entry of entries.values()) if (!entry.article.isConnected) remove(entry);
  for (const article of document.querySelectorAll<HTMLElement>('article[data-testid="tweet"]')) {
    const text = textOf(article); const url = urlOf(article); const before = entries.get(article);
    if (before?.text === text && before.url === url) { before.replacement.sync(); continue; }
    if (before) remove(before);
    if (!text || text.length > 8000) continue;
    const entry: Entry = { article, text, url, post: { id: `post-${++serial}`, text, ...(url && isFeedUrl(url) ? { url } : {}) },
      revealed: false, visible: false, visibleSince: 0, running: false, retryAt: 0,
      replacement: new Replacement(article, () => { entry.revealed = true; render(entry); }, () => { if (entry.replacement.shown) { const index = undo.indexOf(entry); if (index !== -1) undo.splice(index, 1); undo.push(entry); } updateNotice(); }, text) };
    entries.set(article, entry); observer.observe(article); render(entry);
  }
  updateNotice(); schedule();
}
let scanTimer: ReturnType<typeof setTimeout> | undefined;
new MutationObserver(() => {
  if (scanTimer) return;
  scanTimer = setTimeout(() => { scanTimer = undefined; scan(); }, 120);
}).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['href', 'data-testid'] });
// X uses client-side navigation and recycles article nodes while scrolling.
setInterval(() => { if (route !== location.href) { route = location.href; focusTopic = null; focusPostIds = null; scan(); for (const e of entries.values()) render(e); } }, 600);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { for (const e of entries.values()) render(e); schedule(); } });
document.addEventListener('focusout', () => { setTimeout(() => { for (const e of entries.values()) if (e.visible) render(e); }, 0); });
chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message.type === 'stateChanged') {
    if (message.reset || !message.settings.enabled || !message.configured) analysisEpoch++;
    settings = message.settings; configured = message.configured;
    if (message.reset) { focusTopic = null; focusPostIds = null; undo.length = 0; }
    for (const entry of entries.values()) {
      if (message.reset) { entry.analysis = undefined; entry.post.analysis = undefined; entry.post.error = undefined; entry.revealed = false; entry.retryAt = 0; }
      render(entry);
    }
    updateNotice(); schedule(); respond({ ok: true });
  }
  if (message.type === 'snapshot') respond({ supported: isFeedUrl(location.href), posts: Array.from(entries.values()).filter(e => e.article.isConnected).slice(0, 100).map(e => e.post), switched: [...entries.values()].filter(e => e.replacement.shown).length, focusTopic, focusPostIds });
  if (message.type === 'showAll') { showAll(); respond({ ok: true }); }
  if (message.type === 'focusTopic') { focusPostIds = null; focusTopic = message.topic === 'uncertain' || Object.hasOwn(TOPIC_LABELS, message.topic) ? message.topic : null; for (const entry of entries.values()) render(entry); respond({ ok: true }); }
  if (message.type === 'focusPosts') { focusTopic = null; focusPostIds = Array.isArray(message.ids) ? message.ids.filter((id: unknown) => typeof id === 'string').slice(0, 24) : null; for (const entry of entries.values()) render(entry); respond({ ok: true }); }
  return false;
});
void rpc({ type: 'state' }).then(response => { if (response.ok) { settings = response.settings; configured = response.configured; } scan(); });
