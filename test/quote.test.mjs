import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/quotes.js";
import { ALL, GROUPS, STALE_DAYS, chartUrl, lastSessionClose, normalize, previousClose, priceAgo } from "../lib/quote.js";

const chart = (meta, timestamp, close, open) => ({
  chart: { result: [{ meta, timestamp: timestamp || [], indicators: { quote: [{ close: close || [], open: open || [] }] } }] }
});
const near = (a, b, eps = 0.005) => assert.ok(Math.abs(a - b) < eps, a + " != " + b);
const NOW = 1790728800 * 1000; // 30/09/2026 00:40 UTC

// Formas reais medidas em 29/09/2026 (Yahoo v8 chart).
test("ação dos EUA: barra do dia sem fechamento não vira dia anterior", () => {
  const j = chart(
    { regularMarketPrice: 329.4, regularMarketTime: 1790712000, gmtoffset: -14400, chartPreviousClose: 341.07 },
    [1790343000, 1790602200, 1790688600],
    [341.07, 338.4, null]
  );
  const q = normalize(j, { sym: "AAPL", name: "Apple" }, null, NOW);
  assert.equal(q.prev, 338.4);
  near(q.delta, -2.6596);
  assert.equal(q.ts, 1790712000000);
  assert.equal(q.stale, false);
});

test("B3: barra do dia já com o preço atual é ignorada", () => {
  const j = chart(
    { regularMarketPrice: 42.3, regularMarketTime: 1790719577, gmtoffset: -10800 },
    [1790341200, 1790600400, 1790686800],
    [42.13, 41.71, 42.3]
  );
  const q = normalize(j, { sym: "ITUB4.SA", name: "Itaú" }, null, NOW);
  assert.equal(q.prev, 41.71);
  near(q.delta, 1.4145);
});

test("algodão CTZ26: Yahoo já virou a referência para o próprio preço; o dia caiu 4,83%", () => {
  const j = chart(
    { regularMarketPrice: 78.86, regularMarketTime: 1790705931, gmtoffset: -14400, chartPreviousClose: 78.86 },
    [1790395200, 1790568000, 1790654400, 1790705931],
    [83.31, 82.86, null, 78.86]
  );
  const q = normalize(j, { sym: "CTZ26.NYB", name: "Algodão Dez/26", unit: "¢/lb", cur: "USc" }, null, NOW);
  assert.equal(q.prev, 82.86);
  near(q.delta, -4.8272, 0.001);
  assert.equal(q.value, 78.86);
  assert.equal(q.currency, "USc");
});

test("soja em ¢/bu, sem escala; variação contra a barra do dia anterior", () => {
  const j = chart(
    { regularMarketPrice: 1295.5, regularMarketTime: 1790728273, gmtoffset: -14400 },
    [1790395200, 1790568000, 1790654400, 1790728273],
    [1319.0, 1288.25, null, 1295.5]
  );
  const q = normalize(j, { sym: "ZSX26.CBT", name: "Soja Nov/26", unit: "¢/bu", cur: "USc" }, null, NOW);
  assert.equal(q.value, 1295.5);
  assert.equal(q.prev, 1288.25);
  near(q.delta, 0.5628, 0.001);
  assert.equal(q.unit, "¢/bu");
});

test("buraco na série (Nikkei): não pula para dois dias atrás, usa a referência do Yahoo", () => {
  const j = chart(
    { regularMarketPrice: 66367.15, regularMarketTime: 1790728170, gmtoffset: 32400 },
    [1790467200, 1790553600, 1790640000, 1790726400],
    [65000, 65877.6, null, 66367.15]
  );
  // Sem referência: sem variação, nunca a de dois dias.
  const sem = normalize(j, { sym: "^N225", name: "Nikkei" }, null, NOW);
  assert.equal(sem.prev, null);
  assert.equal(sem.delta, null);
  const ref = chart({ regularMarketPrice: 66367.15, regularMarketTime: 1790728170, chartPreviousClose: 65481.27 });
  const com = normalize(j, { sym: "^N225", name: "Nikkei" }, ref, NOW);
  assert.equal(com.prev, 65481.27);
  near(com.delta, 1.3527, 0.001);
});

test("lastSessionClose: fechamento zero ou nulo na barra anterior devolve null", () => {
  assert.equal(lastSessionClose([1000000, 1086400, 1172800], [10, 0, 12], 1172800, 0), null);
  assert.equal(lastSessionClose([1000000, 1086400, 1172800], [10, 11, 12], 1172800, 0), 11);
  assert.equal(lastSessionClose([], [], 1172800, 0), null);
});

test("contrato sem negócio há mais de STALE_DAYS: sem variação e marcado", () => {
  const t = 1789579920; // 16/09/2026
  const j = chart(
    { regularMarketPrice: 77.09, regularMarketTime: t, gmtoffset: -14400, chartPreviousClose: 76.2 },
    [t - 86400 * 2, t],
    [76.92, null]
  );
  const q = normalize(j, { sym: "CTZ28.NYB", name: "Algodão Dez/28" }, null, NOW);
  assert.equal(q.stale, true);
  assert.equal(q.delta, null);
  assert.equal(q.prev, null);
  assert.equal(q.value, 77.09);
  assert.equal(normalize(j, { sym: "X", name: "X" }, null, t * 1000 + (STALE_DAYS - 1) * 86400000).stale, false);
});

test("cripto: variação contra o preço de 24 h antes, pela abertura da barra", () => {
  const t = 1790728912;
  const q = normalize(
    chart({ regularMarketPrice: 83506.49, regularMarketTime: t, gmtoffset: 0 }, [t - 90000, t - 86400 - 900, t - 86400 + 900, t - 900], [], [80000, 84000, 83900, 83500]),
    { sym: "BTC-USD", name: "Bitcoin", h24: true },
    null,
    NOW
  );
  assert.equal(q.prev, 84000);
  near(q.delta, -0.5875, 0.001);
  assert.equal(priceAgo([], [], t, 86400), null);
});

test("previousClose e resposta sem resultado ou sem preço", () => {
  assert.equal(previousClose({ chartPreviousClose: 5 }), 5);
  for (const bad of [undefined, null, 0, NaN, "5"]) assert.equal(previousClose({ chartPreviousClose: bad }), null);
  assert.equal(previousClose(undefined), null);
  assert.throws(() => normalize({ chart: { result: null } }, { sym: "X", name: "X" }), /sem resultado/);
  assert.throws(() => normalize(chart({ regularMarketTime: 1 }), { sym: "X", name: "X" }), /sem preco/);
  assert.throws(() => normalize(chart({ regularMarketPrice: 1 }), { sym: "X", name: "X" }), /sem preco/);
});

test("chartUrl: janela certa por modo (range errado troca a referência sem quebrar nada)", () => {
  assert.match(chartUrl("AAPL", "days"), /interval=1d&range=1mo$/);
  assert.match(chartUrl("AAPL", "ref"), /interval=1d&range=1d$/);
  assert.match(chartUrl("BTC-USD", "h24"), /interval=15m&range=2d$/);
  assert.match(chartUrl("^GSPC", "days"), /chart\/%5EGSPC\?/);
});

test("grupo inexistente ou herdado do Object devolve 400", async () => {
  for (const g of ["__proto__", "toString", "constructor", "nada"]) {
    const res = await handler(new Request("http://x/api/quotes?group=" + g));
    assert.equal(res.status, 400, g);
  }
});

test("universo: sem símbolo repetido, todo item com nome, sem escala escondida", () => {
  const syms = ALL.map((s) => s.sym);
  assert.equal(new Set(syms).size, syms.length);
  for (const s of ALL) {
    assert.ok(s.sym && s.name);
    assert.equal(s.div, undefined, s.sym);
  }
  for (const g of ["global", "b3", "agro", "crypto", "fx"]) assert.ok(GROUPS[g].length > 0);
});
