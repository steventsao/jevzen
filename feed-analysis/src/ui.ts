import { DEFAULT_SETTINGS, MAX_RULES_LENGTH, TOPIC_LABELS, treatment, normalizeSettings } from './core';
import type { Post, Settings, Story, Topic } from './core';
import { SAMPLES } from './samples';
import type { ProviderSelection } from './providers';

const extension = typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id);
const popup = document.body.dataset.surface === 'popup';
let settings: Settings = DEFAULT_SETTINGS;
let configured = false;
let local = false;
let provider: ProviderSelection = { provider: 'typesafe', accountId: '', gatewayId: '' };
let configuredProviders: string[] = [];
let posts: Post[] = popup ? [] : SAMPLES.map(p => ({ ...p }));
let stories: Story[] = [];
let selected = 'all';
let selectedStory: string | null = null;
let busy = false;
let grouping = false;
let activeTab: number | undefined;
let sampleMode = true;
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
  } catch { throw new Error('Cannot connect to jevzen. Reload this page or restart the local preview.'); }
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
      <label class="switch-row main-switch"><span><strong>Filter the feed</strong><small id="enabled-copy">Your applied rules shape the feed.</small></span><input id="enabled" type="checkbox" role="switch" aria-label="Filter the feed"></label>
      <section class="control-section"><label class="range-label" for="strength"><strong>Fade strength</strong><output id="strength-value" for="strength"></output></label><input id="strength" type="range" min="0" max="90" step="1"><div class="range-ends"><span>Keep visible</span><span>Fade more</span></div><p class="control-help">The higher Jev’s probability, the more the post fades. Hover to read it.</p></section>
      <section class="control-section"><label class="switch-row"><strong>Collapse very high scores</strong><input id="collapse" type="checkbox" role="switch"></label><label class="range-label compact" for="threshold"><span>Collapse at</span><output id="threshold-value" for="threshold"></output></label><input id="threshold" type="range" min="75" max="100" step="1"><p class="control-help">Nothing is deleted. “Show anyway” always brings a post back.</p></section>
      <section class="control-section topic-section"><div class="section-heading"><h2>Topic groups</h2><span id="topic-count" class="count"></span></div><div id="topics" class="topics"></div></section>
      <details id="settings"><summary>Connection & privacy</summary><div class="settings-body"><p id="key-status"></p><form id="key-form"><label for="provider">Jev provider</label><select id="provider"><option value="typesafe">TypeSafe · direct Jev</option><option value="openrouter">OpenRouter · Jev</option><option value="cloudflare">Cloudflare · Jev</option></select><div id="cloudflare-fields" hidden><label for="account-id">Cloudflare account ID</label><input id="account-id" autocomplete="off" maxlength="32" placeholder="32-character account ID"><label for="gateway-id">Gateway ID (optional)</label><input id="gateway-id" autocomplete="off" maxlength="64" placeholder="Your default gateway"></div><label for="api-key">Provider API key</label><input type="password" id="api-key" autocomplete="off" spellcheck="false" placeholder="Paste your API key"><small id="provider-help"></small><button class="button primary" type="submit">Save connection</button></form><button class="text-button" id="forget-key">Forget this provider’s key</button><p class="privacy">Applying rules or analyzing posts sends your rules and visible post text to the selected provider and Jev. No DMs, cookies or author details. Keys stay in this browser’s extension storage and are never shared with X. Gateway logging follows your provider settings.</p><button id="clear-cache" class="text-button">Clear cached scores</button></div></details>
      ${popup ? '<button class="button secondary open-lab" id="open-lab">Open feed lab</button>' : '<p class="rail-foot">A softer feed. Still your call.</p>'}
    </aside>
    ${popup ? '<main class="popup-status"><p id="feed-state">Reading this tab…</p><button id="refresh-feed" class="text-button">Refresh feed counts</button></main>' : `<main class="feed-area"><div class="feed-heading"><div><h2 id="feed-title">A quieter way to read.</h2><p id="feed-subtitle">Six synthetic posts. Real Jev analysis.</p></div><button class="button primary" id="analyze">${check}Analyze feed</button></div><div id="notice" class="notice" role="status" hidden></div><div class="feed-toolbar"><div id="summary">Ready when you are.</div><div class="toolbar-actions"><button id="group-stories" class="text-button" disabled>Group by story</button><button id="reset-samples" class="text-button">Reset samples</button></div></div><div id="story-groups" class="story-groups" hidden></div><div id="posts" class="posts"></div><section class="composer"><h3>Try your own text</h3><p>Paste a post to see how Jev reads it.</p><form id="add-post"><label class="sr-only" for="post-text">Post text</label><textarea id="post-text" maxlength="8000" rows="3" placeholder="Something from your feed…" required></textarea><div class="composer-actions"><span>Text only · 8,000 characters max</span><button class="button secondary" type="submit">Add & analyze</button></div></form></section><div class="feed-footer"><p>Probabilities are model judgments, not verdicts about people.<br>Images, videos and linked pages aren’t analyzed.</p>${extension ? '<button class="text-button" id="import-feed">Bring in posts from an X tab</button>' : '<span class="local-note">Local lab · API key loaded from .env</span>'}</div></main>`}
  </div>${popup ? '<div id="notice" class="notice" role="status" hidden></div>' : ''}`;

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
  if (!popup) { $('group-stories').textContent = 'Group by story'; renderStories(); }
}
function syncSettings() {
  for (const key of ['enabled', 'collapse'] as const) $<HTMLInputElement>(key).checked = settings[key];
  $<HTMLInputElement>('strength').value = String(Math.round(settings.strength * 100));
  $<HTMLInputElement>('threshold').value = String(Math.round(settings.threshold * 100));
  $('strength-value').textContent = pct(settings.strength); $('threshold-value').textContent = pct(settings.threshold);
  $<HTMLInputElement>('threshold').disabled = !settings.collapse;
  $('enabled-copy').textContent = settings.enabled ? 'Your applied rules shape the feed.' : 'Paused. All posts remain fully visible.';
  $('connection').textContent = configured ? (settings.enabled ? 'Connected' : 'Paused') : 'Add API key';
  $('connection').classList.toggle('connected', configured && settings.enabled);
  $('key-status').textContent = local ? 'Connected locally using your workspace .env.' : configured ? `Connected to ${provider.provider === 'typesafe' ? 'TypeSafe' : provider.provider === 'openrouter' ? 'OpenRouter' : 'Cloudflare'}.` : 'Bring your own key to analyze your feed.';
  $('key-form').hidden = local;
  $('forget-key').hidden = local || !configured;
  if (local) document.querySelector('.privacy')!.textContent = 'Your applied rules and post text are sent to your configured provider through the local server. The key stays on this computer. Typing sends nothing; Apply evaluates the feed. Applied rules are saved locally.';
  syncRules();
  renderTopics();
  if (!popup) renderPosts();
}
let saveTimer: ReturnType<typeof setTimeout>;
function updateSettings(patch: Partial<Settings>) {
  settings = normalizeSettings({ ...settings, ...patch }); syncSettings();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { void rpc({ type: 'saveSettings', settings }).catch(e => notice(e.message, true)); }, 160);
}
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
      rulesNotice(message); if (configured) void analyzePosts(posts);
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
    syncSettings(); providerHelp(); notice('Connection saved. Analyze a post to test it.');
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
$('clear-cache').onclick = async () => { try { await rpc({ type: 'clearCache' }); notice('Cached scores cleared. Existing labels stay until the page is reloaded.'); } catch (e) { notice((e as Error).message, true); } };

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
      selected = topic; selectedStory = null; renderTopics(); if (!popup) renderStories();
      if (popup && activeTab) { try { await chrome.tabs.sendMessage(activeTab, { type: 'focusTopic', topic: topic === 'all' ? null : topic }); } catch { notice('Refresh the X tab, then try again.', true); } }
      else renderPosts();
    }; container.append(button);
  }
  if (!counts.size) { const p = document.createElement('p'); p.className = 'control-help'; p.textContent = popup ? 'Groups appear as visible posts are analyzed.' : 'Analyze the feed to find its topics.'; container.append(p); }
  restoreFocus();
}
function renderPosts() {
  const container = $('posts'); const restoreFocus = preserveFocus(container);
  const openDetails = new Set(Array.from(container.querySelectorAll<HTMLDetailsElement>('details[open]')).map(d => d.dataset.postId));
  container.replaceChildren();
  const story = stories.find(s => s.id === selectedStory);
  const visible = posts.filter(p => (selected === 'all' || topicFor(p) === selected) && (!story || story.postIds.includes(p.id)));
  const analyzed = posts.filter(p => p.analysis).length;
  const collapsed = posts.filter(p => treatment(p.analysis, settings, reveals.has(p.id)).collapsed).length;
  $('summary').textContent = analyzed ? `${analyzed} of ${posts.length} analyzed · ${collapsed} collapsed` : `${posts.length} posts · Not analyzed yet`;
  $('feed-subtitle').textContent = sampleMode ? 'Synthetic posts. Real Jev analysis.' : 'Your text. Real Jev analysis.';
  $<HTMLButtonElement>('group-stories').disabled = busy || grouping || posts.length < 2 || posts.length > 24 || !configured;
  $<HTMLButtonElement>('analyze').disabled = busy || !configured || posts.length === 0;
  $('analyze').textContent = busy ? 'Analyzing…' : analyzed === posts.length ? 'All posts analyzed' : 'Analyze feed';
  if (analyzed === posts.length && !busy) $<HTMLButtonElement>('analyze').disabled = true;
  for (const post of visible) {
    const article = document.createElement('article'); article.className = 'post'; article.dataset.id = post.id;
    const t = treatment(post.analysis, settings, reveals.has(post.id));
    article.classList.toggle('collapsed', t.collapsed);
    article.style.setProperty('--post-opacity', String(t.opacity)); article.style.setProperty('--post-saturation', String(t.saturation));
    const body = document.createElement('div'); body.className = 'post-body';
    const head = document.createElement('div'); head.className = 'post-head';
    const avatar = document.createElement('span'); avatar.className = 'avatar'; avatar.textContent = (post.author || 'Your post').split(' ').map(s => s[0]).slice(0, 2).join(''); avatar.setAttribute('aria-hidden', 'true');
    const name = document.createElement('strong'); name.textContent = post.author || 'Your post';
    const context = document.createElement('span'); context.className = 'post-context'; context.textContent = post.id.startsWith('sample-') ? 'Sample post' : 'Text analysis';
    head.append(avatar, name, context);
    const text = document.createElement('p'); text.className = 'post-text'; text.textContent = post.text;
    body.append(head, text);
    const footer = document.createElement('div'); footer.className = 'post-analysis';
    if (post.analysis) {
      const a = post.analysis;
      const scores = document.createElement('div'); scores.className = 'scores';
      for (const [label, p] of [['Turn down', a.turnDown]] as const) {
        const score = document.createElement('div'); score.className = 'score';
        const caption = document.createElement('span'); caption.textContent = `${label} `;
        const value = document.createElement('b'); value.textContent = pct(p); caption.append(value);
        const track = document.createElement('span'); track.className = 'score-track';
        const fill = document.createElement('span'); fill.style.width = pct(p); track.append(fill); score.append(caption, track); scores.append(score);
      }
      const controls = document.createElement('div'); controls.className = 'post-actions';
      const tag = document.createElement('span'); tag.className = 'topic-tag'; tag.textContent = a.topicConfidence < 0.5 ? 'Topic uncertain' : TOPIC_LABELS[a.topic];
      const reveal = document.createElement('button'); reveal.className = 'text-button'; reveal.textContent = reveals.has(post.id) ? 'Apply filter' : 'Show anyway';
      reveal.dataset.focusKey = `reveal-${post.id}`;
      reveal.setAttribute('aria-expanded', String(!t.collapsed));
      reveal.onclick = () => { reveals.has(post.id) ? reveals.delete(post.id) : reveals.add(post.id); renderPosts(); };
      const why = document.createElement('details'); why.className = 'explanation';
      why.dataset.postId = post.id; why.open = openDetails.has(post.id);
      const summary = document.createElement('summary'); summary.textContent = 'Why?';
      summary.dataset.focusKey = `why-${post.id}`;
      const p = document.createElement('p'); p.textContent = `Jev estimates a ${pct(a.turnDown)} chance your applied rules call for turning down this post. At ${pct(settings.strength)} fade strength, this post is ${pct(t.opacity)} visible. Topic confidence: ${pct(a.topicConfidence)}. Model: ${a.model}. These are model judgments.`;
      const applied = document.createElement('p'); applied.className = 'applied-rule-copy'; applied.textContent = `Applied rules: ${a.rules}`;
      why.append(summary, p, applied); controls.append(tag, reveal); footer.append(scores, controls, why);
      if (t.collapsed) { const label = document.createElement('div'); label.className = 'collapsed-label'; label.textContent = 'Turned down for you'; article.append(label); }
    } else {
      const status = document.createElement('span'); status.className = post.error ? 'post-error' : 'unscored'; status.textContent = post.error || (busy ? 'Waiting for Jev…' : 'Not analyzed'); footer.append(status);
    }
    article.append(body, footer); container.append(article);
  }
  if (!visible.length) { const p = document.createElement('p'); p.className = 'empty'; p.textContent = 'No posts in this group yet. Choose All posts to return to the feed.'; container.append(p); }
  restoreFocus();
}
async function analyzePosts(targets: Post[]) {
  if (busy) return;
  busy = true; notice('Reading your posts with Jev…'); renderPosts(); errors.length = 0;
  const generation = analysisGeneration;
  const todo = targets.filter(p => !p.analysis);
  const worker = async () => { while (todo.length && generation === analysisGeneration) {
    const post = todo.shift()!;
    try { const result = await rpc({ type: 'analyze', text: post.text, rules: settings.rules }); if (generation !== analysisGeneration || result.analysis.rules !== settings.rules) return; post.analysis = result.analysis; delete post.error; }
    catch (e) { if (generation !== analysisGeneration) return; post.error = (e as Error).message; errors.push(post.error); }
    renderTopics(); renderPosts();
  } };
  await Promise.all([worker(), worker()]);
  if (generation !== analysisGeneration) return;
  busy = false; renderPosts();
  notice(errors.length ? `${errors.length} post${errors.length === 1 ? '' : 's'} could not be analyzed. ${errors[0]}` : 'Analysis complete. Adjust the controls to see your feed change.', errors.length > 0);
}
function renderStories() {
  const container = $('story-groups'); const restoreFocus = preserveFocus(container); container.replaceChildren(); container.hidden = !stories.length;
  for (const story of stories) {
    const button = document.createElement('button'); button.className = 'story-button';
    button.dataset.focusKey = `story-${story.id}`;
    button.setAttribute('aria-pressed', String(selectedStory === story.id));
    const count = document.createElement('b'); count.textContent = `${story.postIds.length} ${story.postIds.length === 1 ? 'post' : 'posts'}`;
    const text = document.createElement('span'); text.textContent = story.representative.slice(0, 100) + (story.representative.length > 100 ? '…' : '');
    button.append(count, text); button.onclick = () => { selectedStory = selectedStory === story.id ? null : story.id; selected = 'all'; renderStories(); renderTopics(); renderPosts(); }; container.append(button);
  }
  restoreFocus();
}
async function refreshFeed() {
  if (!extension) return false;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); activeTab = tab?.id;
    if (!activeTab) throw new Error('No active tab');
    const snapshot = await chrome.tabs.sendMessage(activeTab, { type: 'snapshot' }); posts = snapshot.posts || [];
    selected = snapshot.focusTopic || 'all'; renderTopics();
    $('feed-state').textContent = posts.length ? `${posts.filter(p => p.analysis).length} of ${posts.length} loaded posts analyzed. Scroll your feed to read more.` : 'No text posts found yet. Scroll your X feed to begin.';
    return true;
  } catch { $('feed-state').textContent = 'Open X or Twitter to filter your feed. Use the feed lab to try it here.'; return false; }
}
if (popup) {
  $('open-lab').onclick = () => { void chrome.tabs.create({ url: chrome.runtime.getURL('lab.html') }); };
  $('refresh-feed').onclick = () => { void refreshFeed(); };
} else {
  $('analyze').onclick = () => { void analyzePosts(posts); };
  $('reset-samples').onclick = () => {
    if (busy || grouping) return;
    posts = SAMPLES.map(p => ({ ...p })); stories = []; sampleMode = true; selected = 'all'; selectedStory = null; reveals.clear(); notice('Samples reset. Click Analyze feed to start again.'); renderStories(); renderTopics(); renderPosts();
  };
  $('group-stories').onclick = async () => {
    grouping = true; renderPosts(); $('group-stories').textContent = 'Grouping…'; notice('Jev is comparing the posts for shared stories. This makes additional API calls.');
    const generation = analysisGeneration;
    try {
      const result = await rpc({ type: 'cluster', posts: posts.map(p => ({ id: p.id, text: p.text })) });
      if (generation !== analysisGeneration) return;
      stories = result.stories; selectedStory = null; renderStories(); notice(`Found ${stories.length} story groups. Select one to read related posts together.`);
    }
    catch (e) { if (generation === analysisGeneration) notice((e as Error).message, true); }
    finally { if (generation === analysisGeneration) { grouping = false; $('group-stories').textContent = 'Group by story'; renderPosts(); } }
  };
  $('add-post').addEventListener('submit', async e => {
    e.preventDefault(); if (busy || grouping) return;
    const textarea = $<HTMLTextAreaElement>('post-text'); const text = textarea.value.trim(); if (!text) return;
    const post: Post = { id: crypto.randomUUID(), text, author: 'Your post' }; posts.unshift(post); textarea.value = ''; selected = 'all'; selectedStory = null; stories = []; sampleMode = false;
    renderStories(); renderTopics(); renderPosts(); await analyzePosts([post]);
  });
  if (extension) $('import-feed').onclick = async () => {
    if (busy || grouping) return;
    try {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (!tab.id) continue;
        const snapshot = await chrome.tabs.sendMessage(tab.id, { type: 'snapshot' }).catch(() => null);
        if (snapshot?.posts?.length) {
          posts = snapshot.posts.slice(0, 24); stories = []; selected = 'all'; selectedStory = null; sampleMode = false; reveals.clear(); renderStories(); renderTopics(); renderPosts(); notice('Loaded up to 24 posts from your X tab.'); return;
        }
      }
      notice('No X posts found. Open an X tab and scroll the feed first.', true);
    } catch (e) { notice((e as Error).message, true); }
  };
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
  else if (message.rulesApplied && !applyingRules && configured) void analyzePosts(posts);
  return false;
});
if (!popup) renderPosts();
