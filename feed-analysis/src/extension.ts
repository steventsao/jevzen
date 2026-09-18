import { DEFAULT_SETTINGS, MAX_RULES_LENGTH, TOPIC_LABELS, treatment, normalizeSettings } from './core';
import type { Post, Settings, Story, Topic } from './core';
import type { ProviderSelection } from './providers';

const extension = true;
const popup = true;
let settings: Settings = DEFAULT_SETTINGS;
let configured = false;
let local = false;
let provider: ProviderSelection = { provider: 'typesafe', accountId: '', gatewayId: '' };
let configuredProviders: string[] = [];
let posts: Post[] = [];
let stories: Story[] = [];
let selected = 'all';
let selectedStory: string | null = null;
let busy = false;
let grouping = false;
let activeTab: number | undefined;
let feedRefresh = 0;
let analysisGeneration = 0;
let applyingRules = false;
const reveals = new Set<string>();
const errors: string[] = [];
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const pct = (n: number) => `${Math.round(n * 100)}%`;
function preserveFocus(container: HTMLElement) {
  const active = document.activeElement;
  const key = active instanceof HTMLElement && container.contains(active) ? active.dataset.focusKey : undefined;
  return () => { if (key) container.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(key)}"]`)?.focus({ preventScroll: true }); };
}
async function rpc(message: Record<string, unknown>): Promise<any> {
  let response;
  try {
    response = extension ? await chrome.runtime.sendMessage(message) : await fetch('/api', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(message),
    }).then(r => r.json());
  } catch { throw new Error('Cannot connect to jevzen. Reload the extension and refresh your X tab.'); }
  if (!response?.ok) throw new Error(response?.error?.message || 'The request could not finish. Please retry.');
  return response;
}
function notice(message: string, error = false) {
  $('notice').textContent = message; $('notice').classList.toggle('error', error); $('notice').hidden = !message;
}
function rulesNotice(message: string, error = false) {
  $('rules-feedback').textContent = message; $('rules-feedback').classList.toggle('error', error); $('rules-feedback').hidden = !message;
}
const mark = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 8h20M6 16h15M6 24h9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';
const check = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 10 3 3 7-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
$('app').innerHTML = `
  <header class="masthead"><div class="brand">${mark}<span>jevzen</span></div><span id="connection" class="connection">Connecting…</span>${popup ? '' : '<a class="source-link" href="https://docs.typesafe.ai/primitives/noul" target="_blank" rel="noreferrer">Powered by Jev <span aria-hidden="true">↗</span></a>'}</header>
  <div class="workspace">
    <aside class="controls" aria-label="Feed controls">
      <div class="control-title"><h1>${popup ? 'Your feed, less noise.' : 'Turn down the noise.'}</h1><p>Keep the signal. Set the volume.</p></div>
      <form id="rules-form" class="rules-editor"><label for="rules">Your feed rules</label><p id="rules-help">Write what to turn down or keep. Change your mind whenever you like.</p><textarea id="rules" rows="7" maxlength="${MAX_RULES_LENGTH}" aria-describedby="rules-help rules-status" placeholder="Turn down ragebait. Keep thoughtful criticism." required></textarea><div class="rules-actions"><span id="rules-status" role="status">Applied</span><button id="apply-rules" class="button primary" type="submit">Apply</button></div><p id="rules-feedback" class="rules-feedback" role="status" hidden></p><details id="applied-rules"><summary>View applied rules</summary><p id="applied-rules-text"></p></details></form>
      <label class="switch-row main-switch"><span><strong>Filter the feed</strong><small id="enabled-copy">Scroll to check posts against your rules.</small></span><input id="enabled" type="checkbox" role="switch" aria-label="Filter the feed"></label>
      <section class="control-section"><label for="photo-theme"><strong>Replace with</strong></label><select id="photo-theme"><option value="zen">Zen scenes</option><option value="cats">Cat photos</option></select><p class="control-help">Photos are included in the extension. No image tracking or downloads while you scroll.</p></section><section class="control-section"><label class="range-label" for="strength"><strong>Fade strength</strong><output id="strength-value" for="strength"></output></label><input id="strength" type="range" min="0" max="90" step="1"><div class="range-ends"><span>Keep visible</span><span>Fade more</span></div><p class="control-help">Used when photo replacement is off. Hover over a faded post to read it.</p></section>
      <section class="control-section"><label class="switch-row"><strong>Switch matching posts</strong><input id="collapse" type="checkbox" role="switch"></label><label class="range-label compact" for="threshold"><span>Switch at</span><output id="threshold-value" for="threshold"></output></label><input id="threshold" type="range" min="75" max="100" step="1"><p class="control-help">Matches crossfade to a photo, keeping their original height. Show original switches back.</p></section>
      <section class="control-section topic-section"><div class="section-heading"><h2>Topic groups</h2><span id="topic-count" class="count"></span></div><div id="topics" class="topics"></div></section>
      <details id="story-section"><summary>Story groups</summary><p class="control-help">Group up to 24 posts from your open X feed, then focus a story there.</p><button id="group-stories" class="button secondary" disabled>Group loaded posts</button><button id="clear-group" class="text-button" hidden>Clear story filter</button><div id="story-list" class="story-groups"></div></details><details id="settings"><summary>Connection & privacy</summary><div class="settings-body"><p id="key-status"></p><form id="key-form"><label for="provider">Jev provider</label><select id="provider"><option value="typesafe">TypeSafe · direct Jev</option><option value="openrouter">OpenRouter · Jev</option><option value="cloudflare">Cloudflare · Jev</option></select><div id="cloudflare-fields" hidden><label for="account-id">Cloudflare account ID</label><input id="account-id" autocomplete="off" maxlength="32" placeholder="32-character account ID"><label for="gateway-id">Gateway ID (optional)</label><input id="gateway-id" autocomplete="off" maxlength="64" placeholder="Your default gateway"></div><label for="api-key">Provider API key</label><input type="password" id="api-key" autocomplete="off" spellcheck="false" placeholder="Paste your API key"><small id="provider-help"></small><button class="button primary" type="submit">Save connection</button></form><button class="text-button" id="forget-key">Forget this provider’s key</button><p class="privacy">Applying rules or analyzing posts sends your rules and visible post text to the selected provider and Jev. No DMs, cookies or author details. Keys stay in this browser’s extension storage and are never shared with X. Gateway logging follows your provider settings.</p><button id="clear-cache" class="text-button">Clear cached scores</button></div></details>
      <div class="extension-links"><button class="button secondary" id="open-x">Open X</button><button class="text-button" id="open-settings">Settings</button></div>
    </aside>
<main class="popup-status"><p id="feed-state">Reading your X feed…</p><button id="show-switched" class="text-button" hidden>Show original posts</button><button id="refresh-feed" class="text-button">Refresh feed counts</button></main>
  </div><div id="notice" class="notice" role="status" hidden></div>`;

function syncRules() {
  const draft = $<HTMLTextAreaElement>('rules').value.trim();
  $('rules-status').textContent = applyingRules ? 'Applying…' : draft !== settings.rules ? 'Unapplied changes' : 'Applied';
  $('applied-rules-text').textContent = settings.rules;
  $('applied-rules').hidden = draft === settings.rules;
  $<HTMLButtonElement>('apply-rules').disabled = applyingRules || !draft;
  $('apply-rules').textContent = applyingRules ? 'Applying…' : 'Apply';
}
function resetAnalysis() {
  analysisGeneration++; busy = false; grouping = false;
  posts.forEach(p => { delete p.analysis; delete p.error; }); stories = []; selectedStory = null; selected = 'all'; reveals.clear();
  renderStories();
}
function syncSettings() {
  $<HTMLSelectElement>('photo-theme').value = settings.photoTheme;
  for (const key of ['enabled', 'collapse'] as const) $<HTMLInputElement>(key).checked = settings[key];
  $<HTMLInputElement>('strength').value = String(Math.round(settings.strength * 100));
  $<HTMLInputElement>('threshold').value = String(Math.round(settings.threshold * 100));
  $('strength-value').textContent = pct(settings.strength); $('threshold-value').textContent = pct(settings.threshold);
  $<HTMLInputElement>('threshold').disabled = !settings.collapse;
  $('enabled-copy').textContent = settings.enabled ? 'Scroll to check posts against your rules.' : 'Paused. All posts remain fully visible.';
  $('connection').textContent = configured ? (settings.enabled ? 'Connected' : 'Paused') : 'Add API key';
  $('connection').classList.toggle('connected', configured && settings.enabled);
  $('key-status').textContent = local ? 'Connected locally using your workspace .env.' : configured ? `Connected to ${provider.provider === 'typesafe' ? 'TypeSafe' : provider.provider === 'openrouter' ? 'OpenRouter' : 'Cloudflare'}.` : 'Bring your own key to analyze your feed.';
  $('key-form').hidden = local;
  $('forget-key').hidden = local || !configured;
  if (local) document.querySelector('.privacy')!.textContent = 'Your applied rules and post text are sent to your configured provider through the local server. The key stays on this computer. Typing sends nothing; Apply evaluates the feed. Applied rules are saved locally.';
  syncRules();
  renderTopics();

}
let saveTimer: ReturnType<typeof setTimeout>;
function updateSettings(patch: Partial<Settings>) {
  settings = normalizeSettings({ ...settings, ...patch }); syncSettings();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { void rpc({ type: 'saveSettings', settings }).catch(e => notice(e.message, true)); }, 160);
}
$('photo-theme').addEventListener('change', () => updateSettings({ photoTheme: $<HTMLSelectElement>('photo-theme').value === 'cats' ? 'cats' : 'zen' }));
for (const key of ['enabled', 'collapse'] as const)
  $<HTMLInputElement>(key).addEventListener('change', e => updateSettings({ [key]: (e.target as HTMLInputElement).checked }));
for (const key of ['strength', 'threshold'] as const)
  $<HTMLInputElement>(key).addEventListener('input', e => updateSettings({ [key]: Number((e.target as HTMLInputElement).value) / 100 }));
$<HTMLTextAreaElement>('rules').value = settings.rules;
$('rules').addEventListener('input', () => { syncRules(); rulesNotice(''); });
$('rules-form').addEventListener('submit', async e => {
  e.preventDefault(); if (applyingRules) return;
  const rules = $<HTMLTextAreaElement>('rules').value.trim();
  applyingRules = true; syncRules(); rulesNotice('Applying rules…');
  try {
    const result = await rpc({ type: 'applyRules', rules });
    settings = result.settings; configured = result.configured;
    resetAnalysis(); syncSettings();
    const message = !configured ? 'Rules saved. Add a provider key to analyze the feed.' : !settings.enabled ? 'Rules applied. Filtering is paused; posts stay visible.' : 'Rules applied.';
    if (popup) {
      const hasFeed = await refreshFeed();
      rulesNotice(configured && settings.enabled ? hasFeed ? 'Rules applied to your open X feed.' : 'Rules saved. They’ll apply when you open an X feed.' : message);
    } else {
      rulesNotice(message);
    }
  } catch (error) { rulesNotice((error as Error).message, true); }
  finally { applyingRules = false; syncRules(); }
});
$('key-form').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const selection = { provider: $<HTMLSelectElement>('provider').value, accountId: $<HTMLInputElement>('account-id').value.trim(), gatewayId: $<HTMLInputElement>('gateway-id').value.trim() };
    const result = await rpc({ type: 'saveProvider', provider: selection, key: $<HTMLInputElement>('api-key').value });
    configured = result.configured; provider = result.provider; configuredProviders = result.configuredProviders;
    $<HTMLInputElement>('api-key').value = ''; resetAnalysis();
    syncSettings(); providerHelp(); notice('Connection saved. Open X and scroll to analyze posts.');
  } catch (e) { notice((e as Error).message, true); }
});
function providerHelp() {
  const id = $<HTMLSelectElement>('provider').value;
  $('cloudflare-fields').hidden = id !== 'cloudflare';
  $<HTMLInputElement>('api-key').placeholder = configuredProviders.includes(id) ? 'Saved key · leave blank to keep' : 'Paste this provider’s API key';
  $('provider-help').textContent = id === 'openrouter' ? 'Uses OpenRouter’s alpha Decisions API with Jev 1.13. Requires OpenRouter credits.' : id === 'cloudflare' ? 'Use an API token with Workers AI Read permission and funded AI Gateway billing.' : 'Uses Jev directly at api.typesafe.ai.';
}
$('provider').addEventListener('change', () => { $<HTMLInputElement>('api-key').value = ''; providerHelp(); });
$('forget-key').onclick = async () => { try { await rpc({ type: 'forgetKey' }); configured = false; syncSettings(); notice('Key removed from this browser.'); } catch (e) { notice((e as Error).message, true); } };
$('clear-cache').onclick = async () => { try { await rpc({ type: 'clearCache' }); notice('Cached scores cleared. Existing decisions stay until you apply rules again or reload the page.'); } catch (e) { notice((e as Error).message, true); } };

function topicFor(post: Post) { return post.analysis && post.analysis.topicConfidence >= 0.5 ? post.analysis.topic : 'uncertain'; }
function renderTopics() {
  const container = $('topics'); const restoreFocus = preserveFocus(container); container.replaceChildren();
  const counts = new Map<string, number>();
  for (const post of posts) if (post.analysis) { const topic = topicFor(post); counts.set(topic, (counts.get(topic) || 0) + 1); }
  $('topic-count').textContent = `${counts.size}`;
  const options = [['all', posts.length], ...Array.from(counts.entries()).sort((a, b) => b[1] - a[1])] as [string, number][];
  for (const [topic, count] of options) {
    const button = document.createElement('button'); button.className = 'topic-button';
    button.dataset.focusKey = `topic-${topic}`;
    button.setAttribute('aria-pressed', String(selected === topic));
    const label = document.createElement('span'); label.textContent = topic === 'all' ? 'All posts' : topic === 'uncertain' ? 'Topic uncertain' : TOPIC_LABELS[topic as Topic];
    const number = document.createElement('span'); number.className = 'topic-number'; number.textContent = String(count);
    button.append(label, number); button.onclick = async () => {
      selected = topic; selectedStory = null; renderTopics(); renderStories();
      if (popup && activeTab) { try { await chrome.tabs.sendMessage(activeTab, { type: 'focusTopic', topic: topic === 'all' ? null : topic }); } catch { notice('Refresh the X tab, then try again.', true); } }
      else notice('Open an X feed to select a topic.');
    }; container.append(button);
  }
  if (!counts.size) { const p = document.createElement('p'); p.className = 'control-help'; p.textContent = popup ? 'Groups appear as visible posts are analyzed.' : 'Analyze the feed to find its topics.'; container.append(p); }
  restoreFocus();
}
async function refreshFeed() {
  if (!extension) return false;
  const refresh = ++feedRefresh;
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    tabs.sort((a, b) => Number(b.active) - Number(a.active));
    let snapshot: any; let tabId: number | undefined;
    for (const tab of tabs) {
      if (!tab.id) continue;
      const result = await chrome.tabs.sendMessage(tab.id, { type: 'snapshot' }).catch(() => null);
      if (result?.supported) { tabId = tab.id; snapshot = result; break; }
    }
    if (refresh !== feedRefresh) return activeTab !== undefined;
    if (!snapshot) throw new Error('No X feed');
    if (activeTab !== tabId) { analysisGeneration++; stories = []; selectedStory = null; grouping = false; }
    activeTab = tabId;
    posts = snapshot.posts || [];
    selected = snapshot.focusTopic || 'all'; renderTopics(); renderStories();
    $('show-switched').hidden = !snapshot.switched;
    $('clear-group').hidden = !snapshot.focusPostIds;
    $('feed-state').textContent = posts.length ? `${posts.filter(p => p.analysis).length} of ${posts.length} loaded posts checked · ${snapshot.switched || 0} switched. Scroll to check more.` : 'No text posts found yet. Scroll your X feed to begin.';
    return true;
  } catch { if (refresh !== feedRefresh) return activeTab !== undefined; $('show-switched').hidden = true; posts = []; activeTab = undefined; selected = 'all'; stories = []; renderTopics(); renderStories(); $('clear-group').hidden = true; $('feed-state').textContent = 'Open X or Twitter, then scroll your feed. If the extension was just installed, refresh that tab.'; return false; }
}
function renderStories() {
  const list = $('story-list'); const restore = preserveFocus(list); list.replaceChildren();
  $<HTMLButtonElement>('group-stories').disabled = !configured || !activeTab || posts.length < 2 || grouping;
  $('group-stories').textContent = grouping ? 'Grouping…' : 'Group loaded posts';
  for (const story of stories) {
    const button = document.createElement('button'); button.className = 'story-button'; button.dataset.focusKey = story.id;
    button.textContent = `${story.postIds.length} ${story.postIds.length === 1 ? 'post' : 'posts'} · ${story.representative.slice(0, 90)}`;
    button.setAttribute('aria-pressed', String(selectedStory === story.id));
    button.onclick = async () => {
      if (!activeTab) return;
      try {
        selectedStory = selectedStory === story.id ? null : story.id; selected = 'all';
        await chrome.tabs.sendMessage(activeTab, { type: 'focusPosts', ids: selectedStory ? story.postIds : null });
        $('clear-group').hidden = !selectedStory; renderTopics(); renderStories();
      } catch { notice('Refresh your X tab and try again.', true); }
    };
    list.append(button);
  }
  restore();
}
void rpc({ type: 'state' }).then(result => {
  const pristine = $<HTMLTextAreaElement>('rules').value === settings.rules;
  settings = result.settings; configured = result.configured; local = result.local; provider = result.provider || provider; configuredProviders = result.configuredProviders || [];
  if (pristine) $<HTMLTextAreaElement>('rules').value = settings.rules;
  $<HTMLSelectElement>('provider').value = provider.provider; $<HTMLInputElement>('account-id').value = provider.accountId; $<HTMLInputElement>('gateway-id').value = provider.gatewayId;
  syncSettings(); providerHelp();
  if (!configured || location.hash === '#settings') $<HTMLDetailsElement>('settings').open = true;
  if (popup) void refreshFeed();
}).catch(e => { notice(e.message, true); syncSettings(); });
if (extension) chrome.runtime.onMessage.addListener(message => {
  if (message.type !== 'stateChanged') return false;
  const pristine = $<HTMLTextAreaElement>('rules').value.trim() === settings.rules;
  settings = message.settings; configured = message.configured;
  if (pristine) $<HTMLTextAreaElement>('rules').value = settings.rules;
  if (message.reset) resetAnalysis();
  syncSettings();
  if (popup) void refreshFeed();

  return false;
});


$('open-x').onclick = () => { void chrome.tabs.create({ url: 'https://x.com/home' }); };
$('open-settings').onclick = () => { void chrome.runtime.openOptionsPage(); };
$('refresh-feed').onclick = () => { void refreshFeed(); };
if (document.body.dataset.surface === 'settings') { $('open-settings').hidden = true; $<HTMLDetailsElement>('settings').open = true; }
$('group-stories').onclick = async () => {
  if (grouping || !await refreshFeed()) return;
  const epoch = analysisGeneration; const tabId = activeTab;
  grouping = true; renderStories(); notice('Grouping up to 24 loaded posts. This makes additional Jev calls.');
  try {
    const result = await rpc({ type: 'cluster', posts: posts.slice(0, 24).map(({ id, text }) => ({ id, text })) });
    if (epoch !== analysisGeneration || tabId !== activeTab) return;
    stories = result.stories; selectedStory = null; renderStories(); notice('Choose a story to focus its posts on X.');
  } catch (error) { if (epoch === analysisGeneration) notice((error as Error).message, true); }
  finally { if (epoch === analysisGeneration) { grouping = false; renderStories(); } }
};
$('clear-group').onclick = async () => {
  if (activeTab) await chrome.tabs.sendMessage(activeTab, { type: 'focusPosts', ids: null }).catch(() => {});
  selectedStory = null; $('clear-group').hidden = true; renderStories();
};

$('show-switched').onclick = async () => {
  if (activeTab) await chrome.tabs.sendMessage(activeTab, { type: 'showAll' }).catch(() => {});
  void refreshFeed();
};
