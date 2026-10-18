// Local-only in-memory stand-in for the Totalum CRUD API (goal b11 G-10/G-11).
// Run: node qa/local-harness/mock-totalum.mjs  (port 4555)
// Start the app with TOTALUM_API_URL=http://127.0.0.1:4555/ and WITHOUT any real
// Totalum or Stripe key in the environment. Nothing leaves this machine; email
// calls are recorded in memory and never sent.
import http from "node:http";
import { randomBytes } from "node:crypto";

const db = new Map(); // table -> Map(id -> record)
const outbox = [];
const table = (t) => (db.has(t) ? db.get(t) : db.set(t, new Map()).get(t));
const oid = () => randomBytes(12).toString("hex");
const idOf = (v) => (v && typeof v === "object" ? v._id ?? v.id : v);

function match(rec, filter) {
  if (!filter) return true;
  for (const [k, cond] of Object.entries(filter)) {
    if (k === "_or") { if (!cond.some((f) => match(rec, f))) return false; continue; }
    if (k === "_and") { if (!cond.every((f) => match(rec, f))) return false; continue; }
    const v = rec[k];
    if (cond && typeof cond === "object" && !Array.isArray(cond)) {
      if ("ne" in cond && String(idOf(v)) === String(cond.ne)) return false;
      if ("gte" in cond && !(v >= cond.gte)) return false;
      if ("lte" in cond && !(v <= cond.lte)) return false;
      if ("in" in cond && !cond.in.map(String).includes(String(idOf(v)))) return false;
      if ("nin" in cond && cond.nin.map(String).includes(String(idOf(v)))) return false;
      if ("regex" in cond && !new RegExp(cond.regex, cond.options || "").test(String(v ?? ""))) return false;
    } else if (String(idOf(v)) !== String(cond)) return false;
  }
  return true;
}

function query(t, opts = {}) {
  let rows = [...table(t).values()].filter((r) => match(r, opts._filter));
  const sort = opts._sort || {};
  for (const [k0, dir] of Object.entries(sort).reverse()) {
    const k = k0.replace(/@/g, ".");
    rows.sort((a, b) => ((a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * (String(dir).toLowerCase() === "desc" || dir === -1 ? -1 : 1)));
  }
  const skip = Number(opts._skip) || (Number(opts._page) || 0) * (Number(opts._limit) || 0);
  if (skip) rows = rows.slice(skip);
  if (opts._limit) rows = rows.slice(0, Number(opts._limit));
  return rows;
}

const calls = [];
const send = (res, code, body) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };

http.createServer(async (req, res) => {
  let raw = ""; for await (const c of req) raw += c;
  const body = raw ? JSON.parse(raw) : {};
  const url = new URL(req.url, "http://x");
  const parts = url.pathname.replace(/^\/+/, "").split("/"); // api v1 crud ...
  // b25 G-10 profiling: count Totalum calls and emulate network latency (MOCK_LATENCY_MS).
  if (url.pathname === "/__mock/calls") { const out = calls.splice(0); return send(res, 200, out); }
  if (!url.pathname.startsWith("/__mock")) {
    calls.push({ t: Date.now(), m: req.method, p: url.pathname.replace(/^\/api\/v1\//, "").slice(0, 60), q: url.search.slice(0, 80) });
    const lat = Number(process.env.MOCK_LATENCY_MS || 0);
    if (lat) await new Promise((r) => setTimeout(r, lat));
  }
  try {
    if (url.pathname === "/__mock/dump") return send(res, 200, Object.fromEntries([...db].map(([t, m]) => [t, [...m.values()]])));
    if (url.pathname === "/__mock/outbox") return send(res, 200, outbox);
    if (url.pathname === "/__mock/patch" && req.method === "POST") {
      const rows = query(body.table, { _filter: body.filter });
      for (const r of rows) Object.assign(r, body.set);
      return send(res, 200, { n: rows.length });
    }
    if (parts[2] === "crud" && parts[3] === "advanced-query") return send(res, 200, { data: query(body.tableName, body.queryOptions) });
    if (parts[2] === "crud" && parts[3] === "query") return send(res, 200, { data: query(parts[4], body) });
    if (parts[2] === "crud" && parts.length === 4 && req.method === "POST") {
      const now = new Date().toISOString();
      const rec = { ...body, _id: oid(), createdAt: now, updatedAt: now };
      table(parts[3]).set(rec._id, rec);
      return send(res, 200, { data: rec });
    }
    if (parts[2] === "crud" && parts.length === 5) {
      const t = table(parts[3]); const rec = t.get(parts[4]);
      if (req.method === "GET") return send(res, 200, { data: rec ?? null });
      if (req.method === "PATCH") { if (!rec) return send(res, 404, { errors: { errorMessage: "not found" } }); Object.assign(rec, body, { updatedAt: new Date().toISOString() }); return send(res, 200, { data: rec }); }
      if (req.method === "DELETE") { t.delete(parts[4]); return send(res, 200, { data: { deletedCount: rec ? 1 : 0 } }); }
    }
    if (url.pathname.includes("email")) { outbox.push({ at: new Date().toISOString(), to: body.to, subject: body.subject }); return send(res, 200, { data: { mocked: true } }); }
    return send(res, 200, { data: null });
  } catch (e) {
    return send(res, 500, { errors: { errorMessage: String(e) } });
  }
}).listen(4555, "127.0.0.1", () => console.log("mock totalum on 4555"));
