# Cactus ask endpoint (Cloudflare Worker)

`cactus-ask.js` is the serverless endpoint that powers the site's prompt bar.
It receives a question from the browser and proxies it to the Claude API,
keeping the `ANTHROPIC_API_KEY` secret server-side (never in the browser).

## Deploy (Cloudflare dashboard, no CLI)

1. Create a free account at https://dash.cloudflare.com
2. **Workers & Pages → Create → Workers →** start from Hello World, name it
   `cactus-ask`, **Deploy**.
3. **Edit code** → replace everything with the contents of `cactus-ask.js` →
   **Deploy**.
4. **Settings → Variables and Secrets → Add → type: Secret**, name it
   `ANTHROPIC_API_KEY`, paste your `sk-ant-...` key, **Save/Deploy**.
5. Copy the Worker URL (e.g. `https://cactus-ask.<subdomain>.workers.dev`).
   The website's prompt bar is pointed at this URL.

Visiting the URL in a browser returns `Use POST.` (405) — that's expected; it
only accepts `POST` requests from the allowed site origins.

## Notes
- `MODEL` defaults to Haiku 4.5 (cheap/fast). Swap to `claude-sonnet-5` for
  higher-quality answers.
- `ALLOWED_ORIGINS` locks the endpoint to the Cactus domain so other sites
  can't spend your credits.
- Recommended follow-up before heavy promotion: add KV-based per-IP rate
  limiting. The Anthropic monthly spend cap is the backstop until then.
