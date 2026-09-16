# Surface

Standalone voice-first commerce concept using GPT-Live over WebRTC and a Responses backend. Catalog, images, reviews and need-fit scores are illustrative. No checkout.

## Views

`/`, `/search`, `/product/:id`, `/product/:id/intro`, `/product/:id/reviews?topic=quality`, `/product/:id/attributes`, `/compare`.

In-app navigation preserves the live peer connection. Review-topic filtering and need-based comparisons use the same pure commerce engine for voice, text, buttons and the optional WebMCP tool.

## Validation

`node scripts/check.mjs` checks filters, result diversity, invalid IDs, review topics and fit scores.
`node scripts/check.mjs --live` exercises seven GPT-Live turns with real audio output and graceful close.
`node scripts/check.mjs --live --currency` checks spoken currency in a fresh session.
`npx tsc --noEmit` and `npm run build` validate compilation.

The optional `show_commerce_surface` WebMCP registration is feature-detected. No supported browser modelContext validation session was available; this tool was not browser-verified. Its underlying state transition engine is tested. Browser visual QA was not requested.

OPENAI_API_KEY is a server-only runtime secret. Local `.dev.vars` is ignored. Site identity is in `.openai/hosting.json`.
