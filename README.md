# TokenMeter

TokenMeter is a lightweight LLM token-usage, cost-attribution, and context-budget analyzer. It combines a zero-build Vanilla JavaScript interface in `public/` with Python 3.12 Vercel Serverless Functions in `api/`.

## Features

- Deterministic, code-aware token estimation with separate system, history, prompt, and completion counts.
- Per-request input/output cost calculations using an editable model catalog.
- Context-window utilization, monthly burn projections, budget warnings, and optimization suggestions.
- Tenant/workflow sample attribution and a client-side offline calculator fallback.

## Deploy to Vercel

1. Import `kennedy-blip/token-meter` into Vercel.
2. Keep the project root as the repository root.
3. Use the Python runtime detected from `api/*.py`; no Node build command is required.
4. Deploy. The static app is served from `public/`, while `/api/pricing` and `/api/meter` are Python functions.

## Local development

Serve the static frontend with any static server and run the API functions with Vercel CLI (`vercel dev`) from the repository root. Opening `public/index.html` directly also enables the built-in offline calculator, although API-backed catalog and saved custom rates require the server.

## API

- `GET /api/pricing` — model catalog and sample usage logs.
- `POST /api/pricing` — add/update a custom model rate or monthly budget setting (in-memory for the running function instance; use a database for durable multi-instance persistence).
- `POST /api/meter` — estimate tokens, costs, monthly burn, context pressure, and optimization opportunities.

## Notes

Token counts are deterministic estimates, not tokenizer-exact counts. Actual provider billing can differ due to model-specific tokenization, cached tokens, tool calls, and provider accounting. Never use estimates as a substitute for provider usage records.
