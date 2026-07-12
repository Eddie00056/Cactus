# Cactus backend — Supabase

## `functions/ask` — the prompt endpoint

`functions/ask/index.ts` is the Edge Function that powers the site's prompt
bar. It receives a question from the browser and proxies it to the Claude API,
keeping `ANTHROPIC_API_KEY` secret server-side.

### Deploy (Supabase dashboard)

1. Go to https://supabase.com/dashboard and open (or create) your project.
2. **Edge Functions** (left sidebar) → **Create a function** → name it `ask`.
3. Paste the contents of `functions/ask/index.ts` → **Deploy**.
4. Add the secret: **Edge Functions → Secrets** (or **Project Settings → Edge
   Functions**) → add `ANTHROPIC_API_KEY` = your `sk-ant-...` key.
5. **Disable "Enforce JWT verification"** for this function (function settings),
   so the public prompt can call it without a login token. The function does its
   own origin check (`ALLOWED_ORIGINS`) instead.
6. The function URL is:
   `https://<project-ref>.supabase.co/functions/v1/ask`
   The website's prompt bar posts to this URL.

### Deploy (CLI alternative)

```
supabase functions deploy ask --no-verify-jwt
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

### Notes
- `MODEL` defaults to Haiku 4.5 (cheap/fast). Swap to `claude-sonnet-5` for
  higher-quality answers.
- `ALLOWED_ORIGINS` locks the endpoint to the Cactus domain so other sites
  can't spend your credits.
- Next data-layer step (why we picked Supabase): a `waitlist` table so the
  "Join our traders" signups are actually stored, not just kept in the
  visitor's browser.
