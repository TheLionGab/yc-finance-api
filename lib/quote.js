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
    { sym: "ZSX26.CBT", name: "Soja Nov/26", unit: "¢/bu", cur: "USc" },
    { sym: "ZSH27.CBT", name: "Soja Mar/27", unit: "¢/bu", cur: "USc" },
    { sym: "ZSH28.CBT", name: "Soja Mar/28", unit: "¢/bu", cur: "USc" },
    { sym: "ZCZ26.CBT", name: "Milho Dez/26", unit: "¢/bu", cur: "USc" }
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
export const STALE_DAYS = 5;
const valid = (n) => typeof n === "number" && Number.isFinite(n) && n > 0;

// Endereço de cada consulta ao Yahoo:
// - "days": barras diárias do último mês, para achar o fechamento do dia anterior;
// - "ref":  range=1d, onde chartPreviousClose é o fechamento anterior do próprio Yahoo
//           (com range maior ele volta para antes do intervalo inteiro);
// - "h24":  barras de 15 min, para cripto (variação contra 24 h antes).
export function chartUrl(sym, mode) {
  const q = mode === "h24" ? "interval=15m&range=2d" : mode === "ref" ? "interval=1d&range=1d" : "interval=1d&range=1mo";
  return "https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(sym) + "?" + q;
}

// Fechamento da barra do dia útil anterior ao dia da cotação (fuso da bolsa).
// A barra do próprio dia da cotação pode vir sem fechamento, com o preço atual
// ou como barra "ao vivo"; nenhuma conta. Se a barra anterior vier sem
// fechamento (buraco na série do Yahoo), devolve null em vez de pular para um
// dia mais antigo, que daria variação de dois dias.
export function lastSessionClose(stamps, closes, quoteTime, gmtoffset) {
  const day = (s) => Math.floor((s + gmtoffset) / DAY);
  const today = day(quoteTime);
  for (let i = stamps.length - 1; i >= 0; i--) {
    if (day(stamps[i]) < today) return valid(closes[i]) ? closes[i] : null;
  }
  return null;
}

// Fechamento anterior no critério do Yahoo (regularMarketPreviousClose).
export function previousClose(meta) {
  return valid(meta && meta.chartPreviousClose) ? meta.chartPreviousClose : null;
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

const result = (json) => json && json.chart && json.chart.result && json.chart.result[0];

// Variação do dia contra o fechamento do dia útil anterior. `refJson` (resposta
// de chartUrl(sym, "ref")) só entra quando a série diária não dá o anterior.
// Cotação com mais de STALE_DAYS dias (contrato sem negócio) sai sem variação.
export function normalize(json, spec, refJson, nowMs) {
  const r = result(json);
  const meta = r && r.meta;
  if (!meta) throw new Error("sem resultado");
  const raw = meta.regularMarketPrice;
  const t = meta.regularMarketTime;
  if (!valid(raw) || !valid(t)) throw new Error("sem preco");
  const q = (r.indicators && r.indicators.quote && r.indicators.quote[0]) || {};
  const stale = (nowMs === undefined ? Date.now() : nowMs) - t * 1000 > STALE_DAYS * DAY * 1000;
  let prev = null;
  if (!stale) {
    if (spec.h24) prev = priceAgo(r.timestamp || [], q.open || [], t, DAY);
    else {
      prev = lastSessionClose(r.timestamp || [], q.close || [], t, meta.gmtoffset || 0);
      if (prev == null && refJson) prev = previousClose(result(refJson) && result(refJson).meta);
    }
  }
  return {
    symbol: spec.sym,
    name: spec.name,
    value: raw,
    prev: prev,
    delta: prev == null ? null : (raw / prev - 1) * 100,
    currency: spec.cur || meta.currency || "USD",
    unit: spec.unit || null,
    stale: stale,
    ts: t * 1000
  };
}
