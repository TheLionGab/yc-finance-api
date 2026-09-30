import { ALL, GROUPS, chartUrl, needsBars, normalize } from "../lib/quote.js";

export const config = { runtime: "edge" };

const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; YCFinance/1.0)", Accept: "application/json" };
const TTL = 30000;
const memo = new Map();

async function getChart(sym, mode, tries) {
  let err;
  for (let i = 0; i < (tries || 2); i++) {
    try {
      const res = await fetch(chartUrl(sym, mode), { headers: HEADERS, signal: AbortSignal.timeout(5000) });
      if (res.status === 404) throw Object.assign(new Error("Yahoo " + sym + " sem dados"), { final: true });
      if (!res.ok) throw new Error("Yahoo " + sym + " HTTP " + res.status);
      return await res.json();
    } catch (e) {
      err = e;
      if (e.final) break;
    }
  }
  throw err;
}

async function fetchOne(spec) {
  const hit = memo.get(spec.sym);
  if (hit && Date.now() - hit.t < TTL) return hit.v;
  const json = await getChart(spec.sym, spec.h24 ? "h24" : "ref");
  const days = needsBars(json, spec, Date.now()) ? await getChart(spec.sym, "days", 1).catch(() => null) : null;
  const out = normalize(json, spec, days, Date.now());
  memo.set(spec.sym, { t: Date.now(), v: out });
  return out;
}

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  const group = new URL(req.url).searchParams.get("group") || "global";
  const list = group === "all" ? ALL : Object.hasOwn(GROUPS, group) ? GROUPS[group] : null;
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
