// Cactus "markets" endpoint — Supabase Edge Function (Deno)
// -----------------------------------------------------------
// Returns a small set of delayed index/asset quotes for the ticker carousel.
// Free sources, no API keys: Yahoo Finance chart JSON (indices/gold/10Y) +
// CoinGecko (BTC). Results are cached in-memory ~60s so many visitors don't
// hammer the upstream free APIs.
//
// Site calls:  GET  ->  { items: [ {key,label,price,changePct,unit}, ... ],
//                         asOf, delayed: true }

const ALLOWED_ORIGINS = [
  "https://cactusfinancialtechnologies.com",
  "https://www.cactusfinancialtechnologies.com",
];

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// key/label + upstream symbol. `yield: true` marks the 10Y (shown as a %).
const INSTRUMENTS: Array<
  { key: string; label: string; yahoo?: string; coingecko?: string; unit?: string; isYield?: boolean }
> = [
  { key: "spx",   label: "S&P 500",  yahoo: "^GSPC" },
  { key: "ndq",   label: "Nasdaq",   yahoo: "^IXIC" },
  { key: "btc",   label: "BTC",      coingecko: "bitcoin", unit: "$" },
  { key: "xau",   label: "Gold/USD", yahoo: "GC=F", unit: "$" },
  { key: "us10y", label: "10Y",      yahoo: "^TNX", unit: "%", isYield: true },
];

const TTL_MS = 60_000;
let cache: { at: number; body: string } | null = null;

function corsHeaders(origin: string): Record<string, string> {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

async function yahooQuote(symbol: string): Promise<{ price: number; changePct: number } | null> {
  try {
    const url =
      "https://query1.finance.yahoo.com/v8/finance/chart/" +
      encodeURIComponent(symbol) + "?interval=1d&range=5d";
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json" } });
    if (!r.ok) return null;
    const j = await r.json();
    const meta = j?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const price = Number(meta.regularMarketPrice);
    const prev = Number(meta.chartPreviousClose ?? meta.previousClose);
    if (!isFinite(price) || !isFinite(prev) || prev === 0) return null;
    return { price, changePct: ((price - prev) / prev) * 100 };
  } catch {
    return null;
  }
}

async function coingeckoQuote(id: string): Promise<{ price: number; changePct: number } | null> {
  try {
    const url =
      "https://api.coingecko.com/api/v3/simple/price?ids=" + id +
      "&vs_currencies=usd&include_24hr_change=true";
    const r = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!r.ok) return null;
    const j = await r.json();
    const row = j?.[id];
    if (!row) return null;
    const price = Number(row.usd);
    const changePct = Number(row.usd_24h_change);
    if (!isFinite(price)) return null;
    return { price, changePct: isFinite(changePct) ? changePct : 0 };
  } catch {
    return null;
  }
}

async function buildPayload(): Promise<string> {
  const results = await Promise.all(
    INSTRUMENTS.map(async (inst) => {
      const q = inst.coingecko
        ? await coingeckoQuote(inst.coingecko)
        : inst.yahoo
        ? await yahooQuote(inst.yahoo)
        : null;
      if (!q) return null;
      let price = q.price;
      // ^TNX sometimes comes back as yield x10 (e.g. 42.3 == 4.23%); normalize.
      if (inst.isYield && price > 20) price = price / 10;
      return {
        key: inst.key,
        label: inst.label,
        price,
        changePct: q.changePct,
        unit: inst.unit ?? "",
      };
    })
  );
  const items = results.filter(Boolean);
  return JSON.stringify({ items, asOf: new Date().toISOString(), delayed: true });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") || "";
  const cors = corsHeaders(origin);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "GET" && req.method !== "POST") return new Response("Use GET.", { status: 405, headers: cors });
  if (!ALLOWED_ORIGINS.includes(origin)) {
    return new Response(JSON.stringify({ error: "Forbidden origin." }), {
      status: 403, headers: { "content-type": "application/json", ...cors },
    });
  }

  const now = Date.now();
  if (!cache || now - cache.at > TTL_MS) {
    cache = { at: now, body: await buildPayload() };
  }

  return new Response(cache.body, {
    headers: { "content-type": "application/json", "cache-control": "public, max-age=60", ...cors },
  });
});
