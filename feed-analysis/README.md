# jevzen

An MIT-licensed Chrome Manifest V3 demo extension that lets readers shape their feed with one natural-language rules document. Jev evaluates each post against those rules; the extension switches matching posts to calm photos without changing their height and groups related posts. Built in Effect TypeScript with `@effect/platform-browser`.

## Load the extension into Chrome

The installed extension works directly on X/Twitter. It needs a provider API key, but **no local server, Node.js, sample feed, or `.env` file**. The popup and Chrome settings page contain only your rules, display controls, provider setup, and groups from your open X feed.

For a source checkout, first build from this directory with Node 22.9+ and pnpm 9. Building needs no API key:

```sh
pnpm install --frozen-lockfile
pnpm build
```

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select this project's **dist** folder. If using the ZIP, extract it first and choose the folder containing `manifest.json`.
3. Open jevzen from Chrome's extension menu. Expand **Connection & privacy**.
4. Choose TypeSafe, OpenRouter or Cloudflare, paste that provider's API key, and save the connection. Cloudflare also needs its account ID and optionally a gateway ID.
5. Open or refresh an X/Twitter tab, then scroll the feed. Edit **Your feed rules** in the popup and click **Apply** to update the open feed. Only visible text posts are sent for evaluation; offscreen posts use the latest rules when they come into view.

Chrome cannot read your workspace `.env`; the extension needs its own BYOK setup. Keys are stored per provider in `chrome.storage.local`, restricted to trusted extension contexts. They are not synced, embedded in the package, or sent to the X page. A Chrome Web Store listing has not been published.

## Development preview (optional)

The synthetic feed is a developer tool in **dev-dist/**. It is excluded from **dist/** and the extension ZIP. There is no lab link, sample-post view, or test composer in the installed extension.

From this directory, with Node 22.9+ and pnpm 9:

```powershell
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

For the optional live preview, copy the repository root's `.env.example` to `.env` and set `TYPESAFE_API_KEY` before running `pnpm start`. Open http://127.0.0.1:4318. The start command reads `../.env`. Edit **Your feed rules** and click **Apply** to analyze six synthetic posts. You can also paste your own post. Calls use your provider account. The key never enters the page or build output. Applied lab rules and display settings persist in the gitignored `.local-settings.json` file.

The local lab defaults to direct TypeSafe. Set `FEED_PROVIDER=openrouter` with `OPENROUTER_API_KEY`, or `FEED_PROVIDER=cloudflare` with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. `CLOUDFLARE_GATEWAY_ID` is optional. These variables belong in the parent `.env` or your shell; do not commit them.

## How filtering works

The main control is one free-form rules text box (up to 4,000 characters). Ragebait and hype are merely editable starter text. For example:

> Turn down running updates, except recovery milestones. Keep posts about returning to pain-free running.

Or:

> Keep detailed engineering write-ups and thoughtful criticism. Turn down launch hype, engagement bait, and sports spoilers.

Typing makes no API calls and leaves the applied rules and feed unchanged. **Apply** saves the text, cancels old requests, clears cached scores, resets per-post overrides and group selections, and reevaluates the loaded lab or visible X posts. Applying unchanged rules explicitly reevaluates too. Other extension windows receive the applied version without losing unfinished drafts. Blank rules are rejected. Use the filtering switch to pause.

Each post gets one request with two independent questions: the probability the reader's rules call for turning it down, and its topic. The full rules are sent unchanged as reader policy, with the post in a separate data field. Jev interprets natural language, keep exceptions, combinations, and exclusions. No JavaScript or regular-expression rule syntax is required. No hidden ragebait or hype category overrides custom rules. A bare category or phrase is interpreted as content to turn down.

The turn-down probability drives the display policy. With **Switch matching posts** enabled (the default), a post at or above **Switch at** (94% by default) crossfades to a photo in 320 ms. Kept posts keep their original appearance; they have no extra score strip. Choose **Zen scenes** or **Cat photos** under **Replace with**. Each collection includes two bundled images, and **Next photo** cycles through them without a model call or an external image request.

The card is an absolute overlay. The original post remains in the document flow and determines its height, including later media-size changes. Its covered children are hidden from view, pointer input, keyboard focus and assistive technology; its videos are paused. X's timeline cells are never removed or collapsed. **Show original**, **Undo last**, **Show all**, or pausing filtering restores the original content. Applying rules resets those per-post overrides. Reduced-motion preferences skip the transition.

An IntersectionObserver queues only posts entering the viewport, with a short 120 ms dwell and at most two pending content-script requests. Posts already offscreen when the queue runs are skipped. Late decisions wait until the post comes back into view before switching it. Text and status-link identity checks reject stale results when X recycles an article. Failed and unscored posts remain readable. This never invokes X mute/block/account actions.

Turning off photo replacement enables the optional fade behavior: `opacity = 1 - fadeStrength * probability`. Hover or keyboard focus restores faded content. Topic/story focus also uses the same height-preserving photo cards on X.

Noul's percentage is the model's probability that a proposition is true. Here the proposition is whether your rules call for turning down this post. It is not a severity score or a factual verdict about an author's intent. The popup shows your applied rules. Natural-language interpretations may vary; include concrete exceptions when needed. Topic confidence is a separate statistic; uncertain topics are labeled accordingly. Images, videos and linked pages are not analyzed.

## Groups

- **Topic groups** use eight declared subject categories and can focus the loaded feed.
- **Story groups → Group loaded posts**, in the popup or settings page, compares up to 24 posts from your open X feed using additional Jev Choice calls. Select a group to focus its posts directly on X; **Clear story filter** restores the full feed. A match requires both at least 70% choice probability and 50% confidence. Ambiguous matches remain separate. Group labels are excerpts of real loaded posts, not generated claims. The online grouping algorithm is order dependent. No author metadata is sent to the model.

## Effect architecture

```text
DOM / Chrome messages / local HTTP
            ↓ ManagedRuntime (one per entry point)
       FeedAnalysis service
       analyze · cluster
            ↓
       DecisionProvider service
       schemas · concurrency · retry · timeout
            ↓
 TypeSafe | OpenRouter Decisions | Cloudflare AI
            ↓
 @effect/platform-browser BrowserHttpClient.layerFetch
```

`src/feed-service.ts` owns the feed questions and story policy. It asks the `DecisionProvider` service for decisions without knowing the host, credentials, endpoint or envelope. `src/providers.ts` isolates provider encoding and normalization. `ProviderCredentials` injects the selected connection using redacted keys. `ChromeStore` wraps Chrome's async storage in Effect; service workers do not have `localStorage`, so using `BrowserKeyValueStore.layerLocalStorage` there would be incorrect.

The matching `effect` and `@effect/platform-browser` packages are pinned to `4.0.0-rc.115`. Adding another Jev host requires a provider adapter plus an explicit manifest host permission and CSP entry; the extension does not accept arbitrary API URLs.

Effect manages a two-request semaphore, one retry on eligible transient errors, Retry-After waits, an 18-second total evaluation deadline, cancellation through fetch, and a two-minute story-grouping deadline. Schema validation checks probabilities, answer kinds, requested IDs, declared choices and distribution completeness. Provider error bodies and request headers are never surfaced. Pausing or changing providers cancels pending scoring and story grouping; stale responses cannot restore old provider results.

The extension caches up to 256 hashed-text results in session storage, namespaced by rules, rubric and connection; it does not persist raw posts. The applied rules are stored locally and sent with each evaluation to the selected provider. The local lab holds only a bounded in-memory score cache. All extension code is bundled locally under Manifest V3 CSP; the server binds to loopback, validates Host/Origin and serves an explicit file allowlist.

## Provider contracts and official sources

| Provider | Endpoint | Model / envelope |
|---|---|---|
| TypeSafe | `https://api.typesafe.ai/v1/systemone` | `jev-latest`, state + typed questions |
| OpenRouter | `https://openrouter.ai/api/alpha/decisions` | `typesafe/jev-1.13`, state + typed questions |
| Cloudflare | `https://api.cloudflare.com/client/v4/accounts/{account}/ai/run` | `typesafe/jev`, `{ model, input: { state, questions } }` |

Cloudflare requires a token with **Workers AI Read** and suitable AI Gateway credits. The optional gateway ID becomes `cf-aig-gateway-id`; requests set `cf-aig-collect-log: false`. Account and provider retention rules still apply. Credentials never fall back automatically across providers.

Official references checked September 18, 2026:

- [TypeSafe introduction: atomic questions composed in code](https://docs.typesafe.ai/introduction)
- [Noul: a yes/no probability](https://docs.typesafe.ai/primitives/noul)
- [Choice: categories and distributions](https://docs.typesafe.ai/primitives/choice)
- [Confidence is different from probability](https://docs.typesafe.ai/confidence)
- [TypeSafe architectural patterns](https://docs.typesafe.ai/patterns)
- [OpenRouter official Decisions SDK endpoint](https://github.com/OpenRouterTeam/typescript-sdk/blob/main/src/funcs/alphaDecisionsCreate.ts)
- [OpenRouter Decisions response types](https://github.com/OpenRouterTeam/typescript-sdk/blob/main/src/models/decisionsresponse.ts)
- [Cloudflare Jev model and request examples](https://developers.cloudflare.com/ai/models/typesafe/jev/)
- [Cloudflare API authentication, gateway headers and envelopes](https://developers.cloudflare.com/ai-gateway/usage/rest-api/)
- [Chrome extension cross-origin requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)

OpenRouter's Decisions endpoint is alpha. Both gateway adapters have offline contract tests; direct TypeSafe has been exercised live using the supplied key. Do not treat the gateway mocks as live account verification.

## Verification

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:browser
pnpm test:live
```

The browser suite loads the exact production **dist/** into isolated Chromium and tests its service worker, popup, settings, provider selection, story grouping and real content-script injection on a synthetic X-shaped page. Localhost is blocked during these checks. Package assertions verify there is no lab page or synthetic post data in the extension bundle. Test content exists only in the test harness and developer preview. It uses fixture API replies by default. To also exercise a live API call from the extension worker:

```powershell
node --env-file=../.env --import tsx scripts/browser-test.ts
```

An existing Chromium binary can be selected with `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. The temporary test browser is isolated from your normal profile and is closed afterward; the test clears credentials before closing.

Live synthetic results and screenshots are saved under `artifacts/`. With `jev-1.13.0`, the running post scored 3% under the starter rules, 96% under a rule turning down running updates, and 13% after adding a recovery-milestone exception. A ragebait sample scored 11% under an explicit rule to keep everything except running updates. Two substantive benchmark posts were grouped together. These are smoke-test examples, not a labeled accuracy benchmark.

A manual X timeline demo is shown in the [recording](../docs/demo/jevzen.mp4). Automated browser checks use synthetic X-shaped pages; OpenRouter with a real key and Cloudflare with a funded account remain unverified. X can change its DOM selectors, so the detector may need maintenance. The test fixtures cover viewport-only scoring, unchanged height and scroll geometry, late media, theme switching, reveal, recycled nodes, stale results, reduced motion and messages navigation, but cannot prove every future X layout.

## Photo assets

The four images in `public/photos/` were generated with the built-in imagegen tool for this project. They are bundled into `dist/photos/` and exposed only to X/Twitter pages. Full generation prompts and filenames are recorded in [public/photos/PROMPTS.md](public/photos/PROMPTS.md).

The scan/judge/act split was inspired by [realZachi/typesafe-adblock](https://github.com/realZachi/typesafe-adblock). This extension's action is a reversible photo crossfade with preserved timeline geometry.

## License

Original code, documentation, and generated photos are [MIT licensed](../LICENSE).
Builds include `LICENSE` and `THIRD-PARTY-NOTICES.txt`; dependencies retain their
own licenses. Third-party content shown in the demo recording is not relicensed.
