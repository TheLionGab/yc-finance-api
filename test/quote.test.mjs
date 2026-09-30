import test from "node:test";
import assert from "node:assert/strict";
import { ALL, GROUPS, normalize, previousClose, priceAgo } from "../lib/quote.js";

const chart = (meta, timestamp, open) => ({
  chart: { result: [{ meta, timestamp: timestamp || [], indicators: { quote: [{ open: open || [], close: [] }] } }] }
});
const near = (a, b, eps = 0.005) => assert.ok(Math.abs(a - b) < eps, a + " != " + b);

// Metadados reais medidos em 29/09/2026 (Yahoo v8 chart, interval=1d&range=1d).
test("ação dos EUA: variação contra o fechamento anterior do Yahoo", () => {
  const q = normalize(
    chart({ regularMarketPrice: 329.4, regularMarketTime: 1790712000, chartPreviousClose: 338.4, currency: "USD" }),
    { sym: "AAPL", name: "Apple" }
  );
  assert.equal(q.prev, 338.4);
  near(q.delta, -2.6596);
  assert.equal(q.ts, 1790712000000);
});

test("B3: ITUB4 +1,41% e PETR4 +0,78%", () => {
  const mk = (p, c) => chart({ regularMarketPrice: p, regularMarketTime: 1790719577, chartPreviousClose: c, currency: "BRL" });
  near(normalize(mk(42.3, 41.71), { sym: "ITUB4.SA", name: "Itaú" }).delta, 1.4145);
  near(normalize(mk(49.1, 48.72), { sym: "PETR4.SA", name: "Petrobras" }).delta, 0.78, 0.01);
});

test("futuro de soja: centavos por bushel viram US$/bu, incluindo o anterior", () => {
  const q = normalize(
    chart({ regularMarketPrice: 1295.5, regularMarketTime: 1790728273, chartPreviousClose: 1297.75, currency: "USX" }),
    { sym: "ZSX26.CBT", name: "Soja Nov/26", unit: "US$/bu", cur: "USD", div: 100 }
  );
  near(q.value, 12.955);
  near(q.prev, 12.9775);
  near(q.delta, -0.1734, 0.001);
  assert.equal(q.currency, "USD");
  assert.equal(q.unit, "US$/bu");
});

test("algodão fica em ¢/lb, sem dividir", () => {
  const q = normalize(
    chart({ regularMarketPrice: 78.86, regularMarketTime: 1790705931, chartPreviousClose: 82.86, currency: "USX" }),
    { sym: "CTZ26.NYB", name: "Algodão Dez/26", unit: "¢/lb", cur: "USc" }
  );
  assert.equal(q.value, 78.86);
  near(q.delta, -4.8272, 0.001);
  assert.equal(q.currency, "USc");
});

test("sem fechamento anterior válido: delta e prev nulos, nunca zero", () => {
  for (const cpc of [undefined, null, 0, NaN, "5"]) {
    const q = normalize(
      chart({ regularMarketPrice: 50, regularMarketTime: 1790728273, chartPreviousClose: cpc }),
      { sym: "X", name: "X" }
    );
    assert.equal(q.delta, null);
    assert.equal(q.prev, null);
  }
  assert.equal(previousClose({}), null);
});

test("cripto: variação contra o preço de 24 h antes, pela abertura da barra", () => {
  const t = 1790728912;
  const q = normalize(
    chart(
      { regularMarketPrice: 83506.49, regularMarketTime: t, chartPreviousClose: 83624.79 },
      [t - 90000, t - 86400 - 900, t - 86400 + 900, t - 900],
      [80000, 84000, 83900, 83500]
    ),
    { sym: "BTC-USD", name: "Bitcoin", h24: true }
  );
  assert.equal(q.prev, 84000);
  near(q.delta, -0.5875, 0.001);
  assert.equal(priceAgo([], [], t, 86400), null);
});

test("resposta sem resultado ou sem preço falha", () => {
  assert.throws(() => normalize({ chart: { result: null } }, { sym: "X", name: "X" }), /sem resultado/);
  assert.throws(() => normalize(chart({ regularMarketTime: 1 }), { sym: "X", name: "X" }), /sem preco/);
  assert.throws(() => normalize(chart({ regularMarketPrice: 1 }), { sym: "X", name: "X" }), /sem preco/);
});

test("universo: sem símbolo repetido e todo item com nome", () => {
  const syms = ALL.map((s) => s.sym);
  assert.equal(new Set(syms).size, syms.length);
  for (const s of ALL) assert.ok(s.sym && s.name);
  for (const g of ["global", "b3", "agro", "crypto", "fx"]) assert.ok(GROUPS[g].length > 0);
});
