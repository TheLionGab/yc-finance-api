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
    { sym: "CTZ26.NYB", name: "Algodão Dez/26", unit: "¢/lb", cur: "USc", dayChange: true },
    { sym: "CTZ27.NYB", name: "Algodão Dez/27", unit: "¢/lb", cur: "USc", dayChange: true },
    { sym: "CTZ28.NYB", name: "Algodão Dez/28", unit: "¢/lb", cur: "USc", dayChange: true },
    { sym: "ZSX26.CBT", name: "Soja Nov/26", unit: "¢/bu", cur: "USc", dayChange: true },
    { sym: "ZSH27.CBT", name: "Soja Mar/27", unit: "¢/bu", cur: "USc", dayChange: true },
    { sym: "ZSH28.CBT", name: "Soja Mar/28", unit: "¢/bu", cur: "USc", dayChange: true },
    { sym: "ZCZ26.CBT", name: "Milho Dez/26", unit: "¢/bu", cur: "USc", dayChange: true }
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
export const FRESH_MS = 60 * 60 * 1000;
const valid = (n) => typeof n === "number" && Number.isFinite(n) && n > 0;

// Endereço de cada consulta ao Yahoo:
// - "ref":  range=1d. chartPreviousClose é o fechamento anterior do próprio Yahoo
//           (com range maior ele volta para antes do intervalo inteiro);
// - "days": barras diárias do último mês, para achar o fechamento do dia anterior;
// - "h24":  barras de 15 min, para cripto (variação contra 24 h antes).
export function chartUrl(sym, mode) {
  const q = mode === "h24" ? "interval=15m&range=2d" : mode === "days" ? "interval=1d&range=1mo" : "interval=1d&range=1d";
  return "https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(sym) + "?" + q;
}

const result = (json) => json && json.chart && json.chart.result && json.chart.result[0];

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

const isStale = (t, nowMs) => nowMs - t * 1000 > STALE_DAYS * DAY * 1000;

// Hora local da bolsa (0 a 24) do instante t.
const localHour = (t, gmtoffset) => ((((t + gmtoffset) % DAY) + DAY) % DAY) / 3600;
export const DAY_SESSION = [6, 18];

// Referência de variação:
// - padrão (ação, índice, cripto fora, câmbio, ouro, Brent): fechamento anterior
//   do Yahoo (chartPreviousClose de range=1d), o mesmo número do site deles.
//   No câmbio o Yahoo troca a referência às 23:00 UTC; a página usa a
//   AwesomeAPI antes (dia brasileiro) e esta só entra como reserva;
// - contrato agrícola (spec.dayChange) cujo último negócio foi no pregão diurno
//   (06:00 a 18:00 na bolsa) e está parado há mais de 1 h: fechamento do dia
//   útil anterior nas barras diárias. Depois da liquidação o Yahoo troca a
//   referência e o algodão ficaria 0,00% horas depois de cair 4,8%. Negócio à
//   noite pertence ao pregão seguinte: aí vale a referência do Yahoo, parado
//   ou não;
// - cripto compara com 24 h antes; cotação com mais de STALE_DAYS dias: sem variação.
export function needsBars(json, spec, nowMs) {
  if (!spec.dayChange || spec.h24) return false;
  const meta = (result(json) || {}).meta || {};
  const t = meta.regularMarketTime;
  if (!valid(t) || isStale(t, nowMs) || nowMs - t * 1000 <= FRESH_MS) return false;
  const h = localHour(t, meta.gmtoffset || 0);
  return h >= DAY_SESSION[0] && h < DAY_SESSION[1];
}

// `json` é a resposta de chartUrl(sym, "ref") (ou "h24"); `daysJson`, quando
// needsBars(...) pede, é a de chartUrl(sym, "days"). Com barras e buraco na
// série a variação vem null: a referência do Yahoo, nesse momento, é a
// liquidação de hoje e daria perto de 0,00%.
export function normalize(json, spec, daysJson, nowMs) {
  const now = nowMs === undefined ? Date.now() : nowMs;
  const r = result(json);
  const meta = r && r.meta;
  if (!meta) throw new Error("sem resultado");
  const raw = meta.regularMarketPrice;
  const t = meta.regularMarketTime;
  if (!valid(raw) || !valid(t)) throw new Error("sem preco");
  const stale = isStale(t, now);
  let prev = null;
  if (!stale) {
    if (spec.h24) {
      const q = (r.indicators && r.indicators.quote && r.indicators.quote[0]) || {};
      prev = priceAgo(r.timestamp || [], q.open || [], t, DAY);
    } else if (needsBars(json, spec, now)) {
      const d = result(daysJson);
      const dq = (d && d.indicators && d.indicators.quote && d.indicators.quote[0]) || {};
      prev = d ? lastSessionClose(d.timestamp || [], dq.close || [], t, (d.meta && d.meta.gmtoffset) || meta.gmtoffset || 0) : null;
    } else prev = previousClose(meta);
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
