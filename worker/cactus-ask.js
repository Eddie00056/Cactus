/**
 * Cactus "ask" endpoint — Cloudflare Worker
 * -----------------------------------------
 * Receives a question from the website's prompt bar and proxies it to the
 * Claude API, keeping the API key server-side (never exposed to the browser).
 *
 * Deploy: paste this into a Cloudflare Worker, then add a SECRET named
 *   ANTHROPIC_API_KEY  (your sk-ant-... key) in the Worker's settings.
 *
 * The site calls this with:  POST { "question": "How do options work?" }
 * and gets back:             { "answer": "..." }
 */

// Only these origins may call the endpoint (blocks other sites from using your key).
const ALLOWED_ORIGINS = [
  "https://cactusfinancialtechnologies.com",
  "https://www.cactusfinancialtechnologies.com",
];

// Cheapest/fastest model — good for concise market Q&A.
// Swap to "claude-sonnet-5" for higher-quality answers (costs more).
const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT =
  "You are Cactus, a concise assistant on the Cactus Trading website for active traders. " +
  "Answer questions about markets, trading, and finance clearly and briefly — 2 to 4 sentences " +
  "unless the user asks for more. You do NOT have live market data yet, so if asked for real-time " +
  "prices or quotes, say live data is coming soon and give general context instead. " +
  "Never give personalized financial advice or tell anyone to buy or sell a specific security; " +
  "when relevant, add a short reminder that this is not financial advice.";

const MAX_QUESTION_CHARS = 500;
const MAX_ANSWER_TOKENS = 400;

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return json({ error: "Use POST." }, 405, cors);
    if (!ALLOWED_ORIGINS.includes(origin)) return json({ error: "Forbidden origin." }, 403, cors);

    let body;
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400, cors); }

    const question = (body && typeof body.question === "string") ? body.question.trim() : "";
    if (!question) return json({ error: "Empty question." }, 400, cors);
    if (question.length > MAX_QUESTION_CHARS) return json({ error: "Question too long." }, 400, cors);

    let upstream;
    try {
      upstream = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: MAX_ANSWER_TOKENS,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: question }],
        }),
      });
    } catch (e) {
      return json({ error: "Could not reach the model." }, 502, cors);
    }

    if (!upstream.ok) {
      const detail = (await upstream.text()).slice(0, 300);
      return json({ error: "Model error.", detail }, 502, cors);
    }

    const data = await upstream.json();
    const answer = (data.content && data.content[0] && data.content[0].text) || "";
    return json({ answer }, 200, cors);
  },
};

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", ...cors },
  });
}
