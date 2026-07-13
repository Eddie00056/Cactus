// Cactus "markets" endpoint — Supabase Edge Function (Deno)
// -----------------------------------------------------------
// Returns delayed quotes + a ~2-day intraday sparkline series + previous close
// for the market cards: S&P 500, Nasdaq, BTC, Gold/USD, 10Y. Free/keyless
// (Yahoo Finance chart JSON). Cached in-memory ~60s.
//
// Site calls:  GET  ->  { items: [ {key,label,unit,price,prevClose,changePct,series[]}, ... ],
//                         asOf, delayed: true }

const ALLOWED_ORIGINS = [
  "https://cactusfinancialtechnologies.com",
  "https://www.cactusfinancialtechnologies.com",
];

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const INSTRUMENTS: Array<
  { key: string; label: string; yahoo: string; unit?: string; isYield?: boolean }
> = [
  { key: "spx",   label: "S&P 500",  yahoo: "^GSPC" },
  { key: "ndq",   label: "Nasdaq",   yahoo: "^IXIC" },
  { key: "btc",   label: "BTC",      yahoo: "BTC-USD", unit: "$" },
  { key: "xau",   label: "Gold/USD", yahoo: "GC=F",    unit: "$" },
  { key: "us10y", label: "10Y",      yahoo: "^TNX",    unit: "%", isYield: true },
];

const TWO_DAYS = 2 * 24 * 3600; // seconds
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

// fetch a chart and return meta + parallel {t, c} points (nulls dropped)
async function yahoo(symbol: string, qs: string) {
  const url =
    "https://query1.finance.yahoo.com/v8/finance/chart/" +
    encodeURIComponent(symbol) + "?" + qs;
  const r = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json" } });
  if (!r.ok) return null;
  const j = await r.json();
  const res = j?.chart?.result?.[0];
  if (!res) return null;
  const ts: number[] = res.timestamp ?? [];
  const closes: unknown[] = res.indicators?.quote?.[0]?.close ?? [];
  const points: Array<{ t: number; c: number }> = [];
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (typeof c === "number" && isFinite(c)) points.push({ t: ts[i], c });
  }
  return { meta: res.meta, points };
}

async function quoteWithSpark(inst: typeof INSTRUMENTS[number]) {
  try {
    // 5 days of 15m bars, then slice to the most recent ~2 days (robust over weekends)
    let data = await yahoo(inst.yahoo, "interval=15m&range=5d");
    if (!data || data.points.length < 2) {
      const alt = await yahoo(inst.yahoo, "interval=30m&range=1mo");
      if (alt && alt.points.length >= 2) data = alt;
    }
    if (!data || !data.points.length) return null;

    const meta = data.meta;
    const lastT = data.points[data.points.length - 1].t;
    let series = data.points.filter((p) => p.t >= lastT - TWO_DAYS).map((p) => p.c);
    if (series.length < 2) series = data.points.map((p) => p.c);

    let price = Number(meta.regularMarketPrice);
    if (!isFinite(price) && series.length) price = series[series.length - 1];
    let prev = Number(meta.chartPreviousClose ?? meta.previousClose);
    if (!isFinite(price) || !isFinite(prev) || prev === 0) return null;

    // ^TNX sometimes comes back as yield x10 (42.3 == 4.23%); normalize everywhere.
    if (inst.isYield) {
      const fix = (v: number) => (v > 20 ? v / 10 : v);
      price = fix(price); prev = fix(prev); series = series.map(fix);
    }

    // downsample to <= 80 points and round to keep the payload small
    if (series.length > 80) {
      const step = Math.ceil(series.length / 80);
      const ds: number[] = [];
      for (let i = 0; i < series.length; i += step) ds.push(series[i]);
      if (ds[ds.length - 1] !== series[series.length - 1]) ds.push(series[series.length - 1]);
      series = ds;
    }
    series = series.map((v) => Math.round(v * 100) / 100);

    const changePct = ((price - prev) / prev) * 100;
    return {
      key: inst.key, label: inst.label, unit: inst.unit ?? "",
      price, prevClose: prev, changePct, series,
    };
  } catch {
    return null;
  }
}

async function buildPayload(): Promise<string> {
  const results = await Promise.all(INSTRUMENTS.map(quoteWithSpark));
  const items = results.filter(Boolean);
  return JSON.stringify({ items, asOf: new Date().toISOString(), delayed: true });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") || "";
  const cors = corsHeaders(origin);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response("Use GET.", { status: 405, headers: cors });
  }
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
