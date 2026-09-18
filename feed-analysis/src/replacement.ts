import type { PhotoTheme } from './core';

const CATALOGS = {
  zen: [
    { file: 'zen-garden.png', label: 'A moment in the garden', alt: 'Moss and raked sand in a peaceful Japanese garden' },
    { file: 'zen-lake.png', label: 'A little room to breathe', alt: 'Morning mist over a still mountain lake' },
  ],
  cats: [
    { file: 'cat-tabby.png', label: 'An excellent use of your feed', alt: 'An orange tabby curled up on a soft cushion' },
    { file: 'cat-window.png', label: 'Nothing urgent here', alt: 'A fluffy cat resting beside a sunny window' },
  ],
} as const;

// Original children continue to determine the post's height. Only an absolute
// overlay changes visually, so X can keep measuring and recycling its own nodes.
export class Replacement {
  private host: HTMLElement | undefined;
  private animation: Animation | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;
  private sizeObserver: ResizeObserver | undefined;
  private theme: PhotoTheme = 'zen';
  private photo = 0;
  private children = new Map<HTMLElement, { inert: boolean; ariaHidden: string | null }>();
  shown = false;

  constructor(private article: HTMLElement, private reveal: () => void, private changed: () => void, seed: string) {
    for (const char of seed) this.photo = (this.photo * 31 + char.charCodeAt(0)) >>> 0;
  }

  show(theme: PhotoTheme, current: () => boolean) {
    if (!current()) return;
    if (this.host) { if (this.theme !== theme) { this.theme = theme; this.loadPhoto(); } this.coverChildren(); return; }
    this.theme = theme;
    const host = document.createElement('feed-analysis-card');
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>:host{display:block!important;position:absolute!important;inset:0!important;z-index:1!important;overflow:hidden!important;isolation:isolate;font:13px/1.4 system-ui,sans-serif;color:white;background:#d9e4dc}img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.shade{position:absolute;inset:0;background:linear-gradient(#0004,transparent 45%,#0007)}.top,.bottom{position:absolute;left:16px;right:16px;display:flex;align-items:center;justify-content:space-between;gap:12px}.top{top:12px}.bottom{bottom:12px}.badge{font-size:11px;font-weight:600;letter-spacing:.04em;text-shadow:0 1px 4px #0009}button{font:inherit;font-weight:600;color:#fff;border:1px solid #ffffff70;border-radius:999px;background:#17212b99;padding:7px 12px;cursor:pointer;white-space:nowrap}button:hover{background:#17212bdd}button:focus-visible{outline:2px solid white;outline-offset:3px}.caption{font-size:15px;text-shadow:0 1px 5px #0009}.next{font-size:12px;padding:5px 10px}:host([compact]) .bottom{display:none}:host([narrow]) .badge{display:none}</style><img><div class="shade"></div><div class="top"><span class="badge">A QUIETER MOMENT</span><button id="original">Show original</button></div><div class="bottom"><span class="caption"></span><button class="next" id="next" aria-label="Next photo">Next photo</button></div>`;
    host.addEventListener('click', e => e.stopPropagation());
    root.getElementById('original')!.onclick = e => { e.preventDefault(); this.reveal(); };
    root.getElementById('next')!.onclick = e => { e.preventDefault(); this.photo++; this.loadPhoto(); };
    this.host = host;
    this.loadPhoto();
    this.article.append(host);
    const fit = () => { host.toggleAttribute('compact', this.article.clientHeight < 130); host.toggleAttribute('narrow', this.article.clientWidth < 330); };
    this.sizeObserver = new ResizeObserver(fit); this.sizeObserver.observe(this.article); fit();
    this.coverChildren();
    this.article.dataset.faReplaced = 'switching';
    this.shown = true;
    const generation = ++this.generation;
    const finish = () => {
      if (generation !== this.generation) return;
      if (!current()) { this.restore(); return; }
      clearTimeout(this.timer);
      this.article.dataset.faReplaced = 'true';
      this.animation?.cancel(); this.animation = undefined;
    };
    if (document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches) finish();
    else {
      this.animation = host.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: 'ease-out', fill: 'forwards' });
      this.animation.finished.then(finish, () => {});
      this.timer = setTimeout(finish, 700);
    }
    this.changed();
  }

  sync() {
    if (!this.shown) return;
    if (this.host && !this.host.isConnected) this.article.append(this.host);
    this.coverChildren();
  }

  private coverChildren() {
    for (const [child, before] of this.children) {
      if (child.parentElement === this.article) continue;
      child.inert = before.inert;
      if (before.ariaHidden === null) child.removeAttribute('aria-hidden'); else child.setAttribute('aria-hidden', before.ariaHidden);
      this.children.delete(child);
    }
    for (const child of this.article.children) {
      if (!(child instanceof HTMLElement) || child === this.host) continue;
      if (!this.children.has(child)) this.children.set(child, { inert: child.inert, ariaHidden: child.getAttribute('aria-hidden') });
      child.inert = true; child.setAttribute('aria-hidden', 'true');
      for (const video of child.querySelectorAll('video')) video.pause();
    }
  }

  private loadPhoto() {
    if (!this.host) return;
    const catalog = CATALOGS[this.theme]; const photo = catalog[this.photo % catalog.length]!;
    const root = this.host.shadowRoot!;
    const img = root.querySelector('img')!;
    img.src = chrome.runtime.getURL(`photos/${photo.file}`); img.alt = photo.alt;
    root.querySelector('.caption')!.textContent = photo.label;
  }

  restore() {
    this.generation++; clearTimeout(this.timer);
    this.animation?.cancel(); this.animation = undefined;
    this.sizeObserver?.disconnect(); this.sizeObserver = undefined;
    this.host?.remove(); this.host = undefined;
    delete this.article.dataset.faReplaced;
    for (const [child, before] of this.children) {
      child.inert = before.inert;
      if (before.ariaHidden === null) child.removeAttribute('aria-hidden'); else child.setAttribute('aria-hidden', before.ariaHidden);
    }
    this.children.clear();
    const wasShown = this.shown; this.shown = false;
    if (wasShown) this.changed();
  }
}
