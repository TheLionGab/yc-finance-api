export const GROUPS = {
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
  b3: [
    { sym: "ITUB4.SA", name: "Itaú" },
    { sym: "BBDC4.SA", name: "Bradesco" },
    { sym: "BBAS3.SA", name: "Banco do Brasil" },
    { sym: "PETR4.SA", name: "Petrobras" },
    { sym: "VALE3.SA", name: "Vale" },
    { sym: "WEGE3.SA", name: "WEG" },
    { sym: "ABEV3.SA", name: "Ambev" },
    { sym: "B3SA3.SA", name: "B3" },
    { sym: "PRIO3.SA", name: "Prio" },
    { sym: "SLCE3.SA", name: "SLC Agrícola" },
    { sym: "SUZB3.SA", name: "Suzano" }
  ],
  agro: [
    { sym: "CTZ26.NYB", name: "Algodão Dez/26", unit: "¢/lb", cur: "USc" },
    { sym: "CTZ27.NYB", name: "Algodão Dez/27", unit: "¢/lb", cur: "USc" },
    { sym: "CTZ28.NYB", name: "Algodão Dez/28", unit: "¢/lb", cur: "USc" },
    { sym: "ZSX26.CBT", name: "Soja Nov/26", unit: "US$/bu", cur: "USD", div: 100 },
    { sym: "ZSH27.CBT", name: "Soja Mar/27", unit: "US$/bu", cur: "USD", div: 100 },
    { sym: "ZSH28.CBT", name: "Soja Mar/28", unit: "US$/bu", cur: "USD", div: 100 },
    { sym: "ZCZ26.CBT", name: "Milho Dez/26", unit: "US$/bu", cur: "USD", div: 100 }
  ],
  crypto: [
    { sym: "BTC-USD", name: "Bitcoin", h24: true },
    { sym: "ETH-USD", name: "Ethereum", h24: true }
  ],
  fx: [
    { sym: "BRL=X", name: "USD/BRL" },
    { sym: "EURBRL=X", name: "EUR/BRL" },
    { sym: "GC=F", name: "Ouro", unit: "US$/oz" },
    { sym: "BZ=F", name: "Brent", unit: "US$/bbl" }
  ]
};

export const ALL = [].concat(GROUPS.global, GROUPS.b3, GROUPS.agro, GROUPS.crypto, GROUPS.fx);

const DAY = 86400;
const valid = (n) => typeof n === "number" && Number.isFinite(n) && n > 0;

// Último fechamento de um pregão anterior ao dia (no fuso da bolsa) da cotação.
// A barra do dia corrente pode vir sem fechamento, com o preço atual ou como
// barra "ao vivo"; nenhuma delas conta como pregão anterior.
export function lastSessionClose(stamps, closes, quoteTime, gmtoffset) {
  const day = (s) => Math.floor((s + gmtoffset) / DAY);
  const today = day(quoteTime);
  for (let i = stamps.length - 1; i >= 0; i--) {
    if (valid(closes[i]) && day(stamps[i]) < today) return closes[i];
  }
  return null;
}

// Preço de aproximadamente 24 h antes (abertura da barra mais recente que
// começou até esse instante). Para ativos que negociam sem parar.
export function priceAgo(stamps, opens, quoteTime, seconds) {
  const target = quoteTime - seconds;
  for (let i = stamps.length - 1; i >= 0; i--) {
    if (stamps[i] <= target && valid(opens[i])) return opens[i];
  }
  return null;
}

export function normalize(json, spec) {
  const r = json && json.chart && json.chart.result && json.chart.result[0];
  const meta = r && r.meta;
  if (!meta) throw new Error("sem resultado");
  const raw = meta.regularMarketPrice;
  const t = meta.regularMarketTime;
  if (!valid(raw) || !valid(t)) throw new Error("sem preco");
  const q = (r.indicators && r.indicators.quote && r.indicators.quote[0]) || {};
  const stamps = r.timestamp || [];
  const prev = spec.h24
    ? priceAgo(stamps, q.open || [], t, DAY)
    : lastSessionClose(stamps, q.close || [], t, meta.gmtoffset || 0);
  const div = spec.div || 1;
  return {
    symbol: spec.sym,
    name: spec.name,
    value: raw / div,
    prev: prev == null ? null : prev / div,
    delta: prev == null ? null : (raw / prev - 1) * 100,
    currency: spec.cur || meta.currency || "USD",
    unit: spec.unit || null,
    ts: t * 1000
  };
}
