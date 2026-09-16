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

## Live model comparison and measurements

The existing commerce state machine, catalog, routes, and transitions are retained. The additional model tabs select `gpt-live-1`, `gemini-3.8-live`, or `gemini-3.8-live-extended-thinking` (HIGH thinking). Switching closes the previous transport, keeps shopping state, and opens a new session. GPT retains the original GPT-5.6 Terra Responses delegation; Gemini calls the same browser capability handler directly. This architectural difference is disclosed in the panel.

Set `OPENAI_API_KEY` and `GEMINI_API_KEY` in ignored `.dev.vars` locally and as server-side Sites secrets in production. Gemini uses a one-use, short-lived token; the permanent key never reaches the browser. No provider substitution is performed on failure.

`show_commerce_surface` is the existing WebMCP entry point. It shares the same `execute` handler used by live calls and buttons. The demo has no cart or checkout; none is invented by this layer. Browsers without WebMCP can still use voice and the existing controls. Every call records arguments, result/error, timestamps, and success.

Measurement JSON is stored in the Sites R2 binding `METRICS`, isolated by a hash of a browser-held random access token. IndexedDB holds unsent revisions for retry; it is not the authoritative archive. The panel exports all loaded turns and supports history by model. Clearing browser storage loses that browser's access token, not the server records. Microphone audio is not stored.

The five latency values use a shared browser clock. Local RMS/VAD estimates speech boundaries (500 ms silence confirmation, 65 ms start confirmation); playback is observed separately from transcript arrival. Values are estimates affected by device scheduling and audio buffering. Visible action is recorded two frames after state commit, not after the full decorative animation. Missing values remain null; overlapping actions may be negative. Click/text turns use submission time and are explicitly labelled. Tool RTT includes completion of the visible state update. All call RTTs are exported; the large value shows the last call. Charts show the last ten turns per model.

Interruption retention is evaluated separately, blind to provider identity, after a turn finishes. It can be retained/lost/uncertain and supports a manual override. It is an automated judgement, not ground truth. Full transcripts, results, and raw timing stamps remain available for later analysis.

Additional validation: `node scripts/check-measurements.mjs`. Live audio, microphone permissions, Gemini credentials/model entitlements, and barge-in behavior require an end-to-end voice check in the target browser.
