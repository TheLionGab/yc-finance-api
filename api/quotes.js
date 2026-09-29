export const config = { runtime: "edge" };

const YAHOO = "https://query1.finance.yahoo.com/v8/finance/chart/";
const GROUPS = {
  global: [
    { sym: "^GSPC", name: "S&P 500" },
    { sym: "^IXIC", name: "NASDAQ" },
    { sym: "^DJI", name: "Dow Jones" },
    { sym: "^BVSP", name: "IBOV" },
    { sym: "^GDAXI", name: "DAX" },
    { sym: "^N225", name: "Nikkei 225" },
    { sym: "^FTSE", name: "FTSE 100" },
    { sym: "AAPL", name: "Apple" },
    { sym: "MSFT", name: "Microsoft" },
    { sym: "NVDA", name: "NVIDIA" },
    { sym: "GOOGL", name: "Alphabet" },
    { sym: "AMZN", name: "Amazon" },
    { sym: "META", name: "Meta" },
    { sym: "BRK-B", name: "Berkshire" },
    { sym: "JPM", name: "JPMorgan" },
    { sym: "DE", name: "John Deere" },
    { sym: "ADM", name: "ADM" }
  ],
  crypto: [
    { sym: "BTC-USD", name: "Bitcoin" },
    { sym: "ETH-USD", name: "Ethereum" }
  ],
  fx: [
    { sym: "BRL=X", name: "USD/BRL" },
    { sym: "EURBRL=X", name: "EUR/BRL" },
    { sym: "GC=F", name: "Ouro" },
    { sym: "BZ=F", name: "Brent" }
  ]
};

const memo = new Map();
const TTL = 30000;

async function fetchOne({ sym, name }) {
  const hit = memo.get(sym);
  if (hit && Date.now() - hit.t < TTL) return hit.v;
  const url = YAHOO + encodeURIComponent(sym) + "?interval=1d&range=2d";
  const r = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; YCFinance/1.0)",
      Accept: "application/json"
    }
  });
  if (!r.ok) throw new Error("Yahoo " + sym + " HTTP " + r.status);
  const j = await r.json();
  const meta = j && j.chart && j.chart.result && j.chart.result[0] && j.chart.result[0].meta;
  const price = meta && meta.regularMarketPrice;
  const prev = meta && (meta.chartPreviousClose || meta.previousClose);
  if (typeof price !== "number") throw new Error("Yahoo " + sym + " sem preco");
  const out = {
    symbol: sym,
    name: name,
    value: price,
    delta: prev ? ((price - prev) / prev) * 100 : 0,
    currency: (meta && meta.currency) || "USD",
    ts: meta && meta.regularMarketTime ? meta.regularMarketTime * 1000 : Date.now()
  };
  memo.set(sym, { t: Date.now(), v: out });
  return out;
}

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  const { searchParams } = new URL(req.url);
  const group = searchParams.get("group") || "global";
  const list = group === "all"
    ? GROUPS.global.concat(GROUPS.crypto, GROUPS.fx)
    : GROUPS[group];
  if (!list) {
    return new Response(JSON.stringify({ error: "grupo invalido" }), {
      status: 400,
      headers: { "content-type": "application/json" }
    });
  }
  const results = await Promise.allSettled(list.map(fetchOne));
  const data = results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : { symbol: list[i].sym, name: list[i].name, value: null, delta: 0, error: "falha" }
  );
  return new Response(JSON.stringify({ quotes: data, group: group, source: "yahoo-edge" }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, s-maxage=30, stale-while-revalidate=60"
    }
  });
}
