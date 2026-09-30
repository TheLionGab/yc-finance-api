import { ALL, GROUPS, normalize } from "../lib/quote.js";

export const config = { runtime: "edge" };

const YAHOO = "https://query1.finance.yahoo.com/v8/finance/chart/";
const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; YCFinance/1.0)", Accept: "application/json" };
const TTL = 30000;
const memo = new Map();

async function fetchOne(spec) {
  const hit = memo.get(spec.sym);
  if (hit && Date.now() - hit.t < TTL) return hit.v;
  const url = YAHOO + encodeURIComponent(spec.sym) + (spec.h24 ? "?interval=15m&range=2d" : "?interval=1d&range=1mo");
  let err;
  for (let i = 0; i < 2; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (res.status === 404) throw Object.assign(new Error("Yahoo " + spec.sym + " sem dados"), { final: true });
      if (!res.ok) throw new Error("Yahoo " + spec.sym + " HTTP " + res.status);
      const out = normalize(await res.json(), spec);
      memo.set(spec.sym, { t: Date.now(), v: out });
      return out;
    } catch (e) {
      err = e;
      if (e.final) break;
    }
  }
  throw err;
}

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  const group = new URL(req.url).searchParams.get("group") || "global";
  const list = group === "all" ? ALL : GROUPS[group];
  if (!list) {
    return new Response(JSON.stringify({ error: "grupo invalido" }), {
      status: 400,
      headers: { "content-type": "application/json" }
    });
  }
  const results = await Promise.allSettled(list.map(fetchOne));
  const quotes = results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : { symbol: list[i].sym, name: list[i].name, value: null, prev: null, delta: null, error: "falha" }
  );
  return new Response(JSON.stringify({ quotes, group, source: "yahoo-edge" }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, s-maxage=30, stale-while-revalidate=60"
    }
  });
}
