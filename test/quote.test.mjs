import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/quotes.js";
import { ALL, GROUPS, FRESH_MS, SETTLE_HOUR, STALE_DAYS, chartUrl, lastSessionClose, needsBars, normalize, previousClose, priceAgo } from "../lib/quote.js";

const chart = (meta, timestamp, close, open) => ({
  chart: { result: [{ meta, timestamp: timestamp || [], indicators: { quote: [{ close: close || [], open: open || [] }] } }] }
});
const near = (a, b, eps = 0.005) => assert.ok(Math.abs(a - b) < eps, a + " != " + b);
const sec = (iso) => Date.parse(iso) / 1000;
const NOW = Date.parse("2026-09-30T01:12:00Z"); // noite de 29/09 em Nova York

// Formas reais medidas em 29/09/2026 (Yahoo v8 chart).
test("ação: referência é o fechamento anterior do Yahoo; não pede barras", () => {
  const ref = chart({ instrumentType: "EQUITY", regularMarketPrice: 329.4, regularMarketTime: sec("2026-09-29T20:00:00Z"), chartPreviousClose: 338.4 });
  const spec = { sym: "AAPL", name: "Apple" };
  assert.equal(needsBars(ref, spec, NOW), false);
  const q = normalize(ref, spec, null, NOW);
  assert.equal(q.prev, 338.4);
  near(q.delta, -2.6596);
  assert.equal(q.stale, false);
  assert.equal(q.ts, sec("2026-09-29T20:00:00Z") * 1000);
});

test("índice com buraco na série diária (Nikkei) usa só a referência do Yahoo", () => {
  const ref = chart({ instrumentType: "INDEX", regularMarketPrice: 66135.77, regularMarketTime: sec("2026-09-30T01:00:00Z"), chartPreviousClose: 65481.27 });
  const q = normalize(ref, { sym: "^N225", name: "Nikkei" }, null, NOW);
  assert.equal(q.prev, 65481.27);
  near(q.delta, 0.9989, 0.001);
});

test("algodão parado desde a liquidação: variação do dia contra o fechamento de ontem (-4,83%)", () => {
  const t = sec("2026-09-29T18:18:00Z");
  const ref = chart({ instrumentType: "FUTURE", regularMarketPrice: 78.86, regularMarketTime: t, gmtoffset: -14400, chartPreviousClose: 78.86 });
  const days = chart(
    { gmtoffset: -14400 },
    [sec("2026-09-24T04:00:00Z"), sec("2026-09-25T04:00:00Z"), sec("2026-09-28T04:00:00Z"), t],
    [83.31, 82.71, 82.86, 78.86]
  );
  const spec = { sym: "CTZ26.NYB", name: "Algodão Dez/26", unit: "¢/lb", cur: "USc", dayChange: true };
  assert.equal(needsBars(ref, spec, NOW), true);
  const q = normalize(ref, spec, days, NOW);
  assert.equal(q.prev, 82.86);
  near(q.delta, -4.8272, 0.001);
  assert.equal(q.value, 78.86);
  assert.equal(q.currency, "USc");
});

test("algodão logo depois da liquidação (14:18 ET): +5, +30 e +59 min já usam barras, não ~0,00%", () => {
  const t = sec("2026-09-29T18:18:00Z");
  const ref = chart({ instrumentType: "FUTURE", regularMarketPrice: 78.86, regularMarketTime: t, gmtoffset: -14400, chartPreviousClose: 78.86 });
  const days = chart({ gmtoffset: -14400 }, [sec("2026-09-25T04:00:00Z"), sec("2026-09-28T04:00:00Z"), t], [82.71, 82.86, 78.86]);
  const spec = { sym: "CTZ26.NYB", name: "Algodão Dez/26", dayChange: true };
  for (const min of [5, 30, 59, 61, 300]) {
    const now = t * 1000 + min * 60000;
    assert.equal(needsBars(ref, spec, now), true, min + " min");
    near(normalize(ref, spec, days, now).delta, -4.8272, 0.001);
  }
});

test("negócio de manhã (10:00 ET): recente usa a referência do Yahoo, parado há mais de 1 h usa barras", () => {
  const t = sec("2026-09-29T14:00:00Z");
  const ref = chart({ instrumentType: "FUTURE", regularMarketPrice: 1300, regularMarketTime: t, gmtoffset: -14400, chartPreviousClose: 1290 });
  const spec = { sym: "ZSX26.CBT", name: "Soja Nov/26", dayChange: true };
  assert.equal(needsBars(ref, spec, t * 1000 + 30 * 60000), false);
  assert.equal(needsBars(ref, spec, t * 1000 + FRESH_MS), false);
  assert.equal(needsBars(ref, spec, t * 1000 + FRESH_MS + 1), true);
  assert.equal(SETTLE_HOUR, 14);
});

test("soja em sessão noturna (negócio há minutos): contra a liquidação de terça, não contra segunda", () => {
  const t = sec("2026-09-30T01:02:00Z");
  const ref = chart({ instrumentType: "FUTURE", regularMarketPrice: 1295.75, regularMarketTime: t, gmtoffset: -14400, chartPreviousClose: 1297.75 });
  const spec = { sym: "ZSX26.CBT", name: "Soja Nov/26", unit: "¢/bu", cur: "USc", dayChange: true };
  assert.equal(needsBars(ref, spec, NOW), false);
  const q = normalize(ref, spec, null, NOW);
  assert.equal(q.value, 1295.75);
  assert.equal(q.prev, 1297.75);
  near(q.delta, -0.1541, 0.001);
  assert.equal(q.unit, "¢/bu");
});

test("futuro à noite: ouro e Brent também contra a liquidação (não contra dois pregões)", () => {
  const t = sec("2026-09-30T01:02:00Z");
  const mk = (px, prev) => chart({ instrumentType: "FUTURE", regularMarketPrice: px, regularMarketTime: t, gmtoffset: -14400, chartPreviousClose: prev });
  near(normalize(mk(4211.4, 4179.7), { sym: "GC=F", name: "Ouro" }, null, NOW).delta, 0.7584, 0.001);
  near(normalize(mk(96.22, 96.16), { sym: "BZ=F", name: "Brent" }, null, NOW).delta, 0.0624, 0.001);
});

test("contrato agrícola parado com buraco na série: variação null, não a liquidação de hoje (~0%)", () => {
  const t = sec("2026-09-29T17:37:00Z");
  const ref = chart({ instrumentType: "FUTURE", regularMarketPrice: 1272.75, regularMarketTime: t, gmtoffset: -14400, chartPreviousClose: 1271 });
  const days = chart({ gmtoffset: -14400 }, [sec("2026-09-25T04:00:00Z"), sec("2026-09-28T04:00:00Z"), t], [1282.75, null, 1272.75]);
  const q = normalize(ref, { sym: "ZSH28.CBT", name: "Soja Mar/28", dayChange: true }, days, NOW);
  assert.equal(q.prev, null);
  assert.equal(q.delta, null);
  assert.equal(q.value, 1272.75);
  // sem a resposta das barras (falha de rede) também fica null
  assert.equal(normalize(ref, { sym: "ZSH28.CBT", name: "Soja Mar/28", dayChange: true }, null, NOW).delta, null);
});

test("algodão que negociou à noite e depois parou mais de 1 h: continua contra a liquidação (não contra anteontem)", () => {
  const t = sec("2026-09-30T01:00:00Z"); // 21:00 em Nova York: pertence ao pregão de quarta
  const ref = chart({ instrumentType: "FUTURE", regularMarketPrice: 77.38, regularMarketTime: t, gmtoffset: -14400, chartPreviousClose: 77.48 });
  const spec = { sym: "CTZ27.NYB", name: "Algodão Dez/27", dayChange: true };
  for (const min of [5, 61, 300]) {
    const now = t * 1000 + min * 60000;
    assert.equal(needsBars(ref, spec, now), false, min + " min");
    const q = normalize(ref, spec, null, now);
    assert.equal(q.prev, 77.48);
    near(q.delta, -0.1291, 0.001);
  }
});

test("ouro e Brent (contínuos) e ações nunca usam barras, nem depois do pregão", () => {
  const t = sec("2026-09-29T18:00:00Z"); // 14:00 em Nova York
  const ref = chart({ instrumentType: "FUTURE", regularMarketPrice: 4210, regularMarketTime: t, gmtoffset: -14400, chartPreviousClose: 4179.7 });
  const now = t * 1000 + 6 * 3600000;
  for (const spec of [{ sym: "GC=F", name: "Ouro" }, { sym: "BZ=F", name: "Brent" }]) {
    assert.equal(needsBars(ref, spec, now), false);
    assert.equal(normalize(ref, spec, null, now).prev, 4179.7);
  }
});

test("câmbio: referência do Yahoo, de dia e à noite; nunca barras", () => {
  const spec = { sym: "BRL=X", name: "USD/BRL" };
  // de dia (15:00 UTC): contra o fechamento de segunda, +0,17%
  const dia = chart({ instrumentType: "CURRENCY", regularMarketPrice: 5.2316, regularMarketTime: sec("2026-09-29T15:00:00Z"), gmtoffset: 3600, chartPreviousClose: 5.2229 });
  assert.equal(needsBars(dia, spec, Date.parse("2026-09-29T15:05:00Z")), false);
  near(normalize(dia, spec, null, Date.parse("2026-09-29T15:05:00Z")).delta, 0.1666, 0.001);
  // à noite o Yahoo já trocou a referência (23:00 UTC): perto de 0%. A página usa a AwesomeAPI antes.
  const noite = chart({ instrumentType: "CURRENCY", regularMarketPrice: 5.2031, regularMarketTime: sec("2026-09-30T00:44:00Z"), gmtoffset: 3600, chartPreviousClose: 5.2031 });
  assert.equal(normalize(noite, spec, null, NOW).delta, 0);
});

test("lastSessionClose: fechamento zero ou nulo na barra anterior devolve null", () => {
  assert.equal(lastSessionClose([1000000, 1086400, 1172800], [10, 0, 12], 1172800, 0), null);
  assert.equal(lastSessionClose([1000000, 1086400, 1172800], [10, 11, 12], 1172800, 0), 11);
  assert.equal(lastSessionClose([], [], 1172800, 0), null);
});

test("contrato sem negócio há mais de STALE_DAYS: sem variação, marcado, sem pedir barras", () => {
  const t = sec("2026-09-16T17:12:00Z");
  const ref = chart({ instrumentType: "FUTURE", regularMarketPrice: 77.09, regularMarketTime: t, gmtoffset: -14400, chartPreviousClose: 76.2 });
  const spec = { sym: "CTZ28.NYB", name: "Algodão Dez/28", dayChange: true };
  assert.equal(needsBars(ref, spec, NOW), false);
  const q = normalize(ref, spec, null, NOW);
  assert.equal(q.stale, true);
  assert.equal(q.delta, null);
  assert.equal(q.prev, null);
  assert.equal(q.value, 77.09);
  assert.equal(normalize(ref, spec, null, t * 1000 + (STALE_DAYS - 1) * 86400000).stale, false);
});

test("janela do pregão diurno (06:00 a 18:00 ET): fora dela nunca usa barras", () => {
  const spec = { sym: "X", name: "X", dayChange: true };
  assert.equal(needsBars(chart({ instrumentType: "FUTURE", regularMarketPrice: 10, regularMarketTime: sec("2026-09-29T14:00:00Z"), gmtoffset: -14400 }), { sym: "X", name: "X" }, sec("2026-09-29T22:00:00Z") * 1000), false);
  for (const [iso, esperado] of [["2026-09-29T09:59:00Z", false], ["2026-09-29T10:00:00Z", true], ["2026-09-29T21:59:00Z", true], ["2026-09-29T22:00:00Z", false], ["2026-09-30T04:00:00Z", false]]) {
    const r2 = chart({ instrumentType: "FUTURE", regularMarketPrice: 10, regularMarketTime: sec(iso), gmtoffset: -14400, chartPreviousClose: 9 });
    assert.equal(needsBars(r2, spec, sec(iso) * 1000 + 3 * 3600000), esperado, iso);
  }
});

test("cripto: variação contra o preço de 24 h antes, pela abertura da barra", () => {
  const t = sec("2026-09-30T01:00:00Z");
  const q = normalize(
    chart({ instrumentType: "CRYPTOCURRENCY", regularMarketPrice: 83506.49, regularMarketTime: t, chartPreviousClose: 83624.79 }, [t - 90000, t - 86400 - 900, t - 86400 + 900, t - 900], [], [80000, 84000, 83900, 83500]),
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
  assert.match(chartUrl("AAPL", "ref"), /interval=1d&range=1d$/);
  assert.match(chartUrl("AAPL", "days"), /interval=1d&range=1mo$/);
  assert.match(chartUrl("BTC-USD", "h24"), /interval=15m&range=2d$/);
  assert.match(chartUrl("^GSPC", "ref"), /chart\/%5EGSPC\?/);
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
  // barras só nos contratos agrícolas com mês explícito (contínuo =F troca de contrato na série)
  assert.deepEqual(ALL.filter((s) => s.dayChange).map((s) => s.sym), GROUPS.agro.map((s) => s.sym));
  assert.ok(ALL.filter((s) => s.dayChange).every((s) => !s.sym.includes("=F")));
  for (const g of ["global", "b3", "agro", "crypto", "fx"]) assert.ok(GROUPS[g].length > 0);
});

// Forma real medida em 30/09/2026 (Yahoo v8 chart, bolsa CBT).
test("Chicago: trigo, farelo e óleo de soja com unidade, moeda e sem escala escondida", () => {
  const by = Object.fromEntries(GROUPS.agro.map((s) => [s.sym, s]));
  for (const s of ["ZWZ26.CBT", "ZWH27.CBT"]) assert.deepEqual([by[s].unit, by[s].cur], ["¢/bu", "USc"], s);
  for (const s of ["ZMZ26.CBT", "ZMH27.CBT"]) assert.deepEqual([by[s].unit, by[s].cur], ["US$/t curta", "USD"], s);
  for (const s of ["ZLZ26.CBT", "ZLH27.CBT"]) assert.deepEqual([by[s].unit, by[s].cur], ["¢/lb", "USc"], s);
  assert.ok(GROUPS.agro.filter((s) => s.sym.endsWith(".CBT")).every((s) => s.dayChange === true));
  const t = sec("2026-09-30T12:03:00Z");
  const farelo = normalize(chart({ instrumentType: "FUTURE", regularMarketPrice: 361.2, regularMarketTime: t, gmtoffset: -14400, chartPreviousClose: 359, currency: "USD" }), by["ZMZ26.CBT"], null, t * 1000 + 60000);
  assert.equal(farelo.value, 361.2);
  assert.equal(farelo.currency, "USD");
  assert.equal(farelo.unit, "US$/t curta");
  near(farelo.delta, 0.6128, 0.001);
});
