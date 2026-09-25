// GET /api/f1/* — Jolpica-F1 API の中継（キャッシュ付き・合言葉不要）
const ALLOWED = /^[a-z0-9_\/-]+$/i;

export async function onRequestGet({ params, request }) {
  const path = [].concat(params.path || []).join("/");
  if (!path || !ALLOWED.test(path)) {
    return new Response(JSON.stringify({ error: "不正なパスです。" }), { status: 400, headers: { "content-type": "application/json" } });
  }
  const src = new URL(request.url);
  const q = new URLSearchParams();
  for (const k of ["limit", "offset"]) if (src.searchParams.has(k)) q.set(k, src.searchParams.get(k));
  const upstream = `https://api.jolpi.ca/ergast/f1/${path}/?${q}`;
  const res = await fetch(upstream, {
    headers: { "User-Agent": "F1_TOP-webapp/1.0 (+https://github.com/bazuhiroki/F1_TOP)" },
    cf: { cacheTtl: 300, cacheEverything: true },
  });
  return new Response(res.body, {
    status: res.status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=120" },
  });
}
