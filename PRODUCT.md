# jevzen

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

User-confirmed: Effect TypeScript and @effect/platform-browser, with provider-neutral business services and replaceable provider layers. Chrome Manifest V3, ordinary HTML/CSS and esbuild. BYOK for direct TypeSafe, OpenRouter Decisions and Cloudflare Jev. No hosted backend is needed for personal use.

## Users

The user wants to shape an X/Twitter feed with their own natural-language rules and inspect groups of related tweets. Ragebait and hype are starter examples, not the fixed product scope.

## Product Purpose

Give the reader one editable rules text box. Apply saves the rules and reevaluates visible posts through Jev. Matching posts crossfade to a chosen zen or cat photo while preserving their height; the reader can reveal any original. Optional fading remains available.

## Operating Context

Chrome desktop and public X/Twitter feed posts. The installed extension uses BYOK directly and requires no local server. The user explicitly wants no test-content feed inside the extension: popup and settings show rules and real feed controls only. Keep the synthetic developer preview outside the extension package, using the workspace .env for local verification.

## Capabilities and Constraints

One persistent, free-form rules document with an explicit Apply action; no model calls while typing; independent draft and applied states; one turn-down probability per post; adjustable fade strength and photo-switch threshold; reversible reveal; topic and story groups; live API calls; clear loading and error states. Rules support keep exceptions and ordinary language. Applying rules cancels outdated work and updates visible feed posts. Keys never enter the page or source bundles. Rules and visible post text go to the selected provider; no DMs, cookies, or author metadata. No account mute, block, like, or posting actions.

## Brand Commitments

Product name: jevzen, as chosen by the user.

## Product Principles

- The reader owns the final decision and can reveal any post.
- Probability means model belief, not a factual verdict about the author.
- Group by declared topics without claiming unsupervised topic discovery.
- Keep unscored and failed posts readable.

## Open decisions

Chrome Web Store publication and a hosted multi-user service are outside the current local working prototype.
