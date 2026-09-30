import test from "node:test";
import assert from "node:assert/strict";
import { ALL, GROUPS, normalize, lastSessionClose, priceAgo } from "../lib/quote.js";

const chart = (meta, timestamp, close, open) => ({
  chart: { result: [{ meta, timestamp, indicators: { quote: [{ close, open: open || [] }] } }] }
});
const near = (a, b, eps = 0.005) => assert.ok(Math.abs(a - b) < eps, a + " != " + b);

// Formato real medido em 29/09/2026 (Yahoo v8 chart).
test("ação dos EUA: barra do dia sem fechamento não vira pregão anterior", () => {
  const j = chart(
    { regularMarketPrice: 329.4, regularMarketTime: 1790712000, gmtoffset: -14400, currency: "USD" },
    [1790343000, 1790602200, 1790688600],
    [341.07, 338.4, null]
  );
  const q = normalize(j, { sym: "AAPL", name: "Apple" });
  assert.equal(q.prev, 338.4);
  near(q.delta, -2.6596);
  assert.equal(q.ts, 1790712000000);
});

test("B3: barra do dia já com o preço atual é ignorada", () => {
  const j = chart(
    { regularMarketPrice: 42.3, regularMarketTime: 1790719577, gmtoffset: -10800, currency: "BRL" },
    [1790341200, 1790600400, 1790686800],
    [42.13, 41.71, 42.3]
  );
  const q = normalize(j, { sym: "ITUB4.SA", name: "Itaú" });
  assert.equal(q.prev, 41.71);
  near(q.delta, 1.4145);
});

test("futuro: barra ao vivo e barra do dia nula; soja sai em US$/bu", () => {
  const j = chart(
    { regularMarketPrice: 1296.25, regularMarketTime: 1790728273, gmtoffset: -14400, currency: "USX" },
    [1790395200, 1790568000, 1790654400, 1790728273],
    [1319.0, 1288.25, null, 1296.25]
  );
  const q = normalize(j, { sym: "ZSX26.CBT", name: "Soja Nov/26", unit: "US$/bu", cur: "USD", div: 100 });
  near(q.value, 12.9625);
  near(q.prev, 12.8825);
  near(q.delta, 0.6210, 0.01);
  assert.equal(q.currency, "USD");
  assert.equal(q.unit, "US$/bu");
});

test("fechamento zero ou nulo no meio da série é pulado", () => {
  const stamps = [1000000, 1086400, 1172800, 1259200];
  const closes = [10, 0, null, 12];
  // cotação no dia da última barra (gmtoffset 0): prev é o 10, nunca 0 ou null
  assert.equal(lastSessionClose(stamps, closes, 1259200, 0), 10);
});

test("sem pregão anterior válido: delta e prev nulos, não zero", () => {
  const j = chart(
    { regularMarketPrice: 50, regularMarketTime: 1790728273, gmtoffset: 0, currency: "USD" },
    [1790728273],
    [50]
  );
  const q = normalize(j, { sym: "X", name: "X" });
  assert.equal(q.delta, null);
  assert.equal(q.prev, null);
});

test("cripto: variação contra o preço de 24 h antes, pela abertura da barra", () => {
  const t = 1790728912;
  const stamps = [t - 90000, t - 86400 - 900, t - 86400 + 900, t - 900];
  const opens = [80000, 84000, 83900, 83500];
  const q = normalize(
    chart({ regularMarketPrice: 83506.49, regularMarketTime: t, gmtoffset: 0, currency: "USD" }, stamps, [], opens),
    { sym: "BTC-USD", name: "Bitcoin", h24: true }
  );
  assert.equal(q.prev, 84000);
  near(q.delta, -0.5875, 0.001);
  assert.equal(priceAgo([], [], t, 86400), null);
});

test("resposta sem resultado ou sem preço falha", () => {
  assert.throws(() => normalize({ chart: { result: null } }, { sym: "X", name: "X" }), /sem resultado/);
  assert.throws(
    () => normalize(chart({ regularMarketTime: 1 }, [], []), { sym: "X", name: "X" }),
    /sem preco/
  );
});

test("universo: sem símbolo repetido e todo item com nome", () => {
  const syms = ALL.map((s) => s.sym);
  assert.equal(new Set(syms).size, syms.length);
  for (const s of ALL) assert.ok(s.sym && s.name);
  for (const g of ["global", "b3", "agro", "crypto", "fx"]) assert.ok(GROUPS[g].length > 0);
});
