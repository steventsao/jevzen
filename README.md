# TypeSafe with Effect: working trial

A runnable support-ticket assessment built with the existing
`@effect-agent/ai-typesafe` and `@effect-agent/ai-decision` packages.
It asks category, urgency, and frustration questions together in one TypeSafe
request, validates the response, then applies an application-owned category policy.

## Feed Analysis Chrome extension

[Feed Analysis](feed-analysis/README.md) is a Chrome Manifest V3 extension built
with Effect and `@effect/platform-browser`. Write one natural-language rules
document, click Apply, and let Jev fade or collapse matching X/Twitter posts.
Topic and story controls focus posts in the open X tab. The popup and settings
contain controls only; the synthetic developer feed is excluded from the extension.

Build from this repository:

```sh
cd feed-analysis
pnpm install --frozen-lockfile
pnpm build
```

In `chrome://extensions`, enable Developer mode and **Load unpacked** from
`feed-analysis/dist`. Add a TypeSafe, OpenRouter, or Cloudflare key in the
extension's connection settings, then refresh X. The installed extension needs
no local server, Node.js process, or `.env` file. See the extension README for
provider configuration, privacy behavior, offline tests, and validation limits.

The original support-ticket example remains at the repository root; the commands
below run that example.

## Run

Requires Node.js 22.9+ and pnpm. Dependencies are installed and pinned in the lockfile.
The existing `.env` contains `TYPESAFE_API_KEY`; it is ignored by Git.
For a fresh checkout, copy `.env.example` to `.env` and supply your key.

```sh
pnpm install --frozen-lockfile
pnpm start
pnpm start "The export button crashes every time I click it."

# Offline checks; no API calls or API key needed.
pnpm typecheck
pnpm test

# Your original official-SDK example, retained as-is.
pnpm original
```

`pnpm start` makes a live, billable TypeSafe call. Ctrl+C cancels the request.
`TYPESAFE_API_URL` optionally overrides the versioned API root; the default is
`https://api.typesafe.ai/v1`.

## Use it with async/await

```ts
import { createTicketClient } from "./src/client.js";

const client = createTicketClient();
try {
  const outcome = await client.assess({
    document: "I was charged twice. Please fix this ASAP.",
  });

  if (outcome._tag === "Accepted") {
    console.log(outcome.value); // "billing" | "technical" | "other"
  } else {
    console.log(outcome.candidate, outcome.reason);
  }
} finally {
  await client.close();
}
```

Keep one client for the application's lifetime and close it on shutdown.
Pass `{ signal: abortController.signal }` as the second argument to cancel a call.
The Promise facade uses one managed Effect runtime; it shares the same assessment
and policies as the native Effect API.

## Use it inside Effect

```ts
import { Effect } from "effect";
import { assessTicket } from "./src/triage.js";
import { TypeSafeDecisionLive } from "./src/transport.js";

const program = assessTicket({ document: "The export button crashes." }).pipe(
  Effect.provide(TypeSafeDecisionLive),
);

const outcome = await Effect.runPromise(program);
```

The real package APIs are `DecisionSet.make`, `DecisionQuery.choice`,
`DecisionQuery.score`, `DecisionModel.evaluate`, and `TypeSafeDecisionModel.model`.
`createTicketClient`, `assessTicket`, and the acceptance policy are small local
application functions. There is no dependency named `typesafe-effect`.

## Behavior

- `TicketAssessment` defines a nonempty document schema and three independent questions.
- Choice answers preserve the literal union `"billing" | "technical" | "other"`.
- The package validates answer IDs, kinds, options, and probability distributions.
- Category confidence of at least `0.85` produces `Accepted`; lower confidence
  produces `ReviewRequired`, with its candidate and evidence preserved.
- Urgency is a yes-probability; frustration is a fractional score from 0 to 2.
  Neither changes the category acceptance policy in this demo.
- Network, rate-limit, and server failures have at most two retries with jittered
  exponential backoff. Authentication and invalid-data failures are not retried.
- Retry-After seconds and HTTP dates are honored. A 10-second deadline covers
  evaluation attempts and all retry waits. Cancellation propagates to fetch.
- Results include the returned model ID, token usage, and decision/policy versions.

The `0.85` threshold is an illustrative application policy, not an evaluated
production threshold. TypeSafe confidence summarizes its distribution; it is not
an accuracy guarantee. Repeating an uncertain judgment is not a retry strategy.

## Observed live results

Three synthetic tickets were evaluated on September 17, 2026. All returned
`jev-1.13.0` through the `jev-latest` alias. These are individual observed results,
not a benchmark or a guarantee of identical future outputs.

| Ticket | Outcome | Category | Confidence | Urgency probability | Frustration (0–2) |
| --- | --- | --- | --- | --- | --- |
| I was charged twice. Please fix this ASAP. | Accepted | billing | 1.00 | 0.97 | 1.07 |
| The export button crashes every time I click it. I can reproduce it in both Chrome and Safari. | Accepted | technical | 1.00 | 0.07 | 0.74 |
| My invoice page is blank and I cannot tell whether my payment went through. | Accepted | billing | 0.96 | 0.08 | 0.96 |

The invoice-page example contains both billing and technical cues but still
produced high confidence. Evaluate the rubric and threshold against labeled
tickets before relying on the policy. The review branch is covered by a simulated
low-confidence response in the offline tests; none of these three live calls used it.

## Verification and package findings

`pnpm typecheck` passes with strict mode, exact optional properties, and unchecked
index access enabled. Twelve offline tests exercise request batching and field
translation, answer inference, uncertainty, invalid input, malformed responses,
rate limits, retry limits, authentication, retry deadlines, and HTTP cancellation.
The tests use the real adapter and validators with an injected fetch implementation;
clock-based policy tests advance virtual time.

Pinned dependencies:

- `effect@4.0.0-rc.115`
- `@effect-agent/ai-typesafe@0.1.0-beta.107`
- `@effect-agent/ai-decision@0.1.0-beta.107`
- `@typesafe-ai/sdk@0.6.0` for the original example

Two small compatibility issues surfaced:

1. `DecisionQuery.probability` widens optional fields incompatibly with strict
   optional-property checking in this setup. The demo uses the supported raw
   probability-question object and retains all strict TypeScript settings.
2. The adapter retains Retry-After headers but does not populate the typed
   `AiError.retryAfter` field. The local retry policy decodes those headers.

These are prerelease packages. The result is a working prototype, with application
policies kept separate from provider integration.

References: [Effect Agent decision models](https://effect-agent.com/reference/decision-models),
[TypeSafe confidence](https://docs.typesafe.ai/confidence).
